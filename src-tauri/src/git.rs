//! Git revision management for the ~/.bruh user data directory.
//!
//! Uses the `gix` (gitoxide) crate for all repository operations.
//! The secrets key file is **never** tracked — it is listed first in the
//! auto-created `.gitignore`.

use std::{collections::HashMap, path::PathBuf};

use similar::TextDiff;

use anyhow::{Context, Result};
use gix::bstr::ByteSlice;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::{config::expand_tilde, setup::CommandError, Config};

// ---------------------------------------------------------------------------
// Public data types (serialized to frontend)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    /// Short 7-character hash for display.
    pub hash: String,
    /// Full 40-character hash used for checkout.
    pub full_hash: String,
    /// First line of the commit message.
    pub message: String,
    /// Unix timestamp (seconds UTC) of the commit.
    pub timestamp: i64,
    /// True if this is the current HEAD commit.
    pub is_head: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub initialized: bool,
    pub dirty: bool,
    pub commits: Vec<CommitInfo>,
}

// ---------------------------------------------------------------------------
// .gitignore entries — secrets.key MUST be first and always present
// ---------------------------------------------------------------------------

const GITIGNORE_ENTRIES: &[&str] = &[
    "secrets.key",
    "secrets.json",
    "*.duckdb",
    "*.duckdb.wal",
    "*.duckdb.wal.frames",
];

// ---------------------------------------------------------------------------
// GitManager
// ---------------------------------------------------------------------------

struct GitManager {
    bruh_dir: PathBuf,
    config: Config,
}

impl GitManager {
    fn new(config: &Config) -> Self {
        Self {
            bruh_dir: expand_tilde("~/.bruh"),
            config: config.clone(),
        }
    }

    /// Returns (relative_repo_name, absolute_path) for every flat tracked file.
    /// Scripts directory is handled separately as a subtree.
    fn tracked_flat_files(&self) -> Vec<(String, PathBuf)> {
        vec![
            (".gitignore".into(), self.bruh_dir.join(".gitignore")),
            ("channels.json".into(), expand_tilde(&self.config.channels)),
            ("config.json".into(), self.bruh_dir.join("config.json")),
            ("startup.sql".into(), self.bruh_dir.join("startup.sql")),
            ("workflow.json".into(), expand_tilde(&self.config.workflow)),
        ]
    }

    fn scripts_dir(&self) -> PathBuf {
        expand_tilde(&self.config.scripts)
    }

    fn templates_dir(&self) -> PathBuf {
        expand_tilde(&self.config.templates)
    }

    // -----------------------------------------------------------------------
    // .gitignore management
    // -----------------------------------------------------------------------

    /// Ensures every required entry is present in .gitignore.
    /// Appends missing entries without overwriting existing content.
    fn ensure_gitignore(&self) -> Result<()> {
        let path = self.bruh_dir.join(".gitignore");
        let existing = if path.exists() {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            String::new()
        };

        let missing: Vec<&str> = GITIGNORE_ENTRIES
            .iter()
            .copied()
            .filter(|e| !existing.lines().any(|l| l.trim() == *e))
            .collect();

        if !missing.is_empty() {
            let mut content = existing;
            if !content.is_empty() && !content.ends_with('\n') {
                content.push('\n');
            }
            for entry in missing {
                content.push_str(entry);
                content.push('\n');
            }
            std::fs::write(&path, content)?;
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Repository open / init
    // -----------------------------------------------------------------------

    fn open_or_init(&self) -> Result<gix::Repository> {
        if self.bruh_dir.join(".git").exists() {
            gix::open(&self.bruh_dir).context("Failed to open git repository")
        } else {
            gix::init(&self.bruh_dir).context("Failed to initialize git repository")
        }
    }

    // -----------------------------------------------------------------------
    // Status
    // -----------------------------------------------------------------------

    fn get_status(&self) -> Result<GitStatusResult> {
        self.ensure_gitignore()?;
        let repo = self.open_or_init()?;
        let (commits, head_oid) = self.collect_commits(&repo)?;
        let dirty = self.check_dirty(&repo, head_oid.as_ref())?;
        Ok(GitStatusResult {
            initialized: true,
            dirty,
            commits,
        })
    }

    fn collect_commits(
        &self,
        repo: &gix::Repository,
    ) -> Result<(Vec<CommitInfo>, Option<gix::ObjectId>)> {
        let head_commit = match repo.head_commit() {
            Ok(c) => c,
            Err(_) => return Ok((vec![], None)),
        };
        let head_id = head_commit.id;
        let mut results = Vec::new();

        let walk = head_commit.ancestors().all()?;
        for (i, item) in walk.enumerate().take(50) {
            let item = item?;
            let commit = repo.find_commit(item.id)?;
            let full_hash = item.id.to_string();
            let hash = full_hash[..7].to_string();
            let message = commit
                .message()
                .ok()
                .map(|m| m.summary().to_str_lossy().into_owned())
                .unwrap_or_default();
            let timestamp = commit.author().map(|a| a.time.seconds).unwrap_or(0);
            results.push(CommitInfo {
                hash,
                full_hash,
                message,
                timestamp,
                is_head: i == 0,
            });
        }

        Ok((results, Some(head_id)))
    }

    // -----------------------------------------------------------------------
    // Dirty detection helpers
    // -----------------------------------------------------------------------

    /// Flattens a tree into a map of "relative/path" -> ObjectId.
    fn flatten_tree(
        &self,
        repo: &gix::Repository,
        tree: gix::Tree<'_>,
        prefix: &str,
    ) -> Result<HashMap<String, gix::ObjectId>> {
        let mut map = HashMap::new();
        for entry_ref in tree.iter() {
            let entry = entry_ref?;
            let filename = entry.filename().to_str_lossy().to_string();
            let key = if prefix.is_empty() {
                filename.clone()
            } else {
                format!("{prefix}/{filename}")
            };
            let mode = entry.mode();
            if mode.is_tree() {
                let subtree = repo.find_object(entry.oid().to_owned())?.into_tree();
                let sub = self.flatten_tree(repo, subtree, &key)?;
                map.extend(sub);
            } else if mode.is_blob() || mode.is_executable() {
                map.insert(key, entry.oid().to_owned());
            }
        }
        Ok(map)
    }

    /// Writes `content` as a blob and returns its ObjectId (idempotent).
    fn write_blob(&self, repo: &gix::Repository, content: &[u8]) -> Result<gix::ObjectId> {
        repo.write_blob(content)
            .map(|id| id.detach())
            .context("Failed to write blob to object store")
    }

    fn check_dirty(
        &self,
        repo: &gix::Repository,
        head_oid: Option<&gix::ObjectId>,
    ) -> Result<bool> {
        let head_map: HashMap<String, gix::ObjectId> = match head_oid {
            Some(oid) => {
                let commit = repo.find_commit(*oid)?;
                let tree = commit.tree()?;
                self.flatten_tree(repo, tree, "")?
            }
            None => HashMap::new(),
        };

        // Check flat tracked files
        for (name, abs_path) in self.tracked_flat_files() {
            if abs_path.exists() {
                let content = std::fs::read(&abs_path)?;
                let id = self.write_blob(repo, &content)?;
                match head_map.get(&name) {
                    Some(expected) if *expected == id => {}
                    _ => return Ok(true),
                }
            } else if head_map.contains_key(&name) {
                return Ok(true); // tracked file was deleted
            }
        }

        // Check scripts directory
        let scripts_dir = self.scripts_dir();
        let scripts_in_head: HashMap<String, gix::ObjectId> = head_map
            .iter()
            .filter(|(k, _)| k.starts_with("scripts/"))
            .map(|(k, v)| (k.clone(), *v))
            .collect();

        if scripts_dir.exists() {
            for entry in std::fs::read_dir(&scripts_dir)? {
                let entry = entry?;
                if !entry.path().is_file() {
                    continue;
                }
                let name = format!("scripts/{}", entry.file_name().to_string_lossy());
                let content = std::fs::read(entry.path())?;
                let id = self.write_blob(repo, &content)?;
                match scripts_in_head.get(&name) {
                    Some(expected) if *expected == id => {}
                    _ => return Ok(true),
                }
            }
        }

        // Check for scripts deleted from HEAD
        for key in scripts_in_head.keys() {
            let rel = key.strip_prefix("scripts/").unwrap_or("");
            if !scripts_dir.join(rel).exists() {
                return Ok(true);
            }
        }

        // Check templates directory
        let templates_dir = self.templates_dir();
        let templates_in_head: HashMap<String, gix::ObjectId> = head_map
            .iter()
            .filter(|(k, _)| k.starts_with("templates/"))
            .map(|(k, v)| (k.clone(), *v))
            .collect();

        if templates_dir.exists() {
            for entry in std::fs::read_dir(&templates_dir)? {
                let entry = entry?;
                if !entry.path().is_file() {
                    continue;
                }
                let name = format!("templates/{}", entry.file_name().to_string_lossy());
                let content = std::fs::read(entry.path())?;
                let id = self.write_blob(repo, &content)?;
                match templates_in_head.get(&name) {
                    Some(expected) if *expected == id => {}
                    _ => return Ok(true),
                }
            }
        }

        // Check for templates deleted from HEAD
        for key in templates_in_head.keys() {
            let rel = key.strip_prefix("templates/").unwrap_or("");
            if !templates_dir.join(rel).exists() {
                return Ok(true);
            }
        }

        Ok(false)
    }

    // -----------------------------------------------------------------------
    // Diff (unified diff of working tree vs HEAD)
    // -----------------------------------------------------------------------

    fn diff_text(name: &str, old: &str, new: &str) -> String {
        TextDiff::from_lines(old, new)
            .unified_diff()
            .header(&format!("a/{name}"), &format!("b/{name}"))
            .to_string()
    }

    fn get_diff(&self) -> Result<String> {
        let repo = self.open_or_init()?;
        let head_map: HashMap<String, gix::ObjectId> = match repo.head_commit() {
            Ok(c) => self.flatten_tree(&repo, c.tree()?, "")?,
            Err(_) => HashMap::new(),
        };

        let mut output = String::new();

        // Flat tracked files
        for (name, abs_path) in self.tracked_flat_files() {
            let old = head_map
                .get(&name)
                .and_then(|id| repo.find_object(*id).ok())
                .map(|obj| String::from_utf8_lossy(&obj.into_blob().data).into_owned())
                .unwrap_or_default();
            let new = if abs_path.exists() {
                std::fs::read_to_string(&abs_path).unwrap_or_default()
            } else {
                String::new()
            };
            if old != new {
                output.push_str(&Self::diff_text(&name, &old, &new));
            }
        }

        // Scripts directory
        let scripts_dir = self.scripts_dir();
        let head_scripts: HashMap<String, gix::ObjectId> = head_map
            .iter()
            .filter(|(k, _)| k.starts_with("scripts/"))
            .map(|(k, v)| (k["scripts/".len()..].to_string(), *v))
            .collect();

        // Modified or added scripts
        if scripts_dir.exists() {
            let mut entries: Vec<_> = std::fs::read_dir(&scripts_dir)?
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .collect();
            entries.sort_by_key(|e| e.file_name());
            for entry in entries {
                let fname = entry.file_name().to_string_lossy().to_string();
                let repo_name = format!("scripts/{fname}");
                let old = head_scripts
                    .get(&fname)
                    .and_then(|id| repo.find_object(*id).ok())
                    .map(|obj| String::from_utf8_lossy(&obj.into_blob().data).into_owned())
                    .unwrap_or_default();
                let new = std::fs::read_to_string(entry.path()).unwrap_or_default();
                if old != new {
                    output.push_str(&Self::diff_text(&repo_name, &old, &new));
                }
            }
        }
        // Deleted scripts
        for (fname, id) in &head_scripts {
            if !scripts_dir.join(fname).exists() {
                let old = repo
                    .find_object(*id)
                    .ok()
                    .map(|obj| String::from_utf8_lossy(&obj.into_blob().data).into_owned())
                    .unwrap_or_default();
                output.push_str(&Self::diff_text(&format!("scripts/{fname}"), &old, ""));
            }
        }

        // Templates directory
        let templates_dir = self.templates_dir();
        let head_templates: HashMap<String, gix::ObjectId> = head_map
            .iter()
            .filter(|(k, _)| k.starts_with("templates/"))
            .map(|(k, v)| (k["templates/".len()..].to_string(), *v))
            .collect();

        // Modified or added templates
        if templates_dir.exists() {
            let mut entries: Vec<_> = std::fs::read_dir(&templates_dir)?
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .collect();
            entries.sort_by_key(|e| e.file_name());
            for entry in entries {
                let fname = entry.file_name().to_string_lossy().to_string();
                let repo_name = format!("templates/{fname}");
                let old = head_templates
                    .get(&fname)
                    .and_then(|id| repo.find_object(*id).ok())
                    .map(|obj| String::from_utf8_lossy(&obj.into_blob().data).into_owned())
                    .unwrap_or_default();
                let new = std::fs::read_to_string(entry.path()).unwrap_or_default();
                if old != new {
                    output.push_str(&Self::diff_text(&repo_name, &old, &new));
                }
            }
        }
        // Deleted templates
        for (fname, id) in &head_templates {
            if !templates_dir.join(fname).exists() {
                let old = repo
                    .find_object(*id)
                    .ok()
                    .map(|obj| String::from_utf8_lossy(&obj.into_blob().data).into_owned())
                    .unwrap_or_default();
                output.push_str(&Self::diff_text(&format!("templates/{fname}"), &old, ""));
            }
        }

        Ok(output)
    }

    // -----------------------------------------------------------------------
    // Commit
    // -----------------------------------------------------------------------

    fn do_commit(&self, message: String) -> Result<()> {
        self.ensure_gitignore()?;
        let repo = self.open_or_init()?;

        let parents: Vec<gix::ObjectId> = match repo.head_commit() {
            Ok(c) => vec![c.id],
            Err(_) => vec![],
        };

        // Build root tree entries (sorted lexicographically as git requires)
        let mut root_entries: Vec<gix::objs::tree::Entry> = Vec::new();

        for (name, abs_path) in self.tracked_flat_files() {
            if abs_path.exists() {
                let content = std::fs::read(&abs_path)?;
                let id = self.write_blob(&repo, &content)?;
                root_entries.push(gix::objs::tree::Entry {
                    mode: gix::objs::tree::EntryKind::Blob.into(),
                    filename: name.into(),
                    oid: id.into(),
                });
            }
        }

        // Build scripts subtree
        let scripts_dir = self.scripts_dir();
        if scripts_dir.exists() {
            let mut script_entries: Vec<gix::objs::tree::Entry> = Vec::new();
            let mut dir_entries: Vec<_> = std::fs::read_dir(&scripts_dir)?
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .collect();
            dir_entries.sort_by_key(|e| e.file_name());

            for entry in dir_entries {
                let content = std::fs::read(entry.path())?;
                let id = self.write_blob(&repo, &content)?;
                script_entries.push(gix::objs::tree::Entry {
                    mode: gix::objs::tree::EntryKind::Blob.into(),
                    filename: entry.file_name().to_string_lossy().into_owned().into(),
                    oid: id.into(),
                });
            }

            let scripts_tree = gix::objs::Tree {
                entries: script_entries,
            };
            let scripts_tree_id = repo.write_object(&scripts_tree)?.detach();
            root_entries.push(gix::objs::tree::Entry {
                mode: gix::objs::tree::EntryKind::Tree.into(),
                filename: "scripts".into(),
                oid: scripts_tree_id.into(),
            });
        }

        // Build templates subtree
        let templates_dir = self.templates_dir();
        if templates_dir.exists() {
            let mut template_entries: Vec<gix::objs::tree::Entry> = Vec::new();
            let mut dir_entries: Vec<_> = std::fs::read_dir(&templates_dir)?
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .collect();
            dir_entries.sort_by_key(|e| e.file_name());

            for entry in dir_entries {
                let content = std::fs::read(entry.path())?;
                let id = self.write_blob(&repo, &content)?;
                template_entries.push(gix::objs::tree::Entry {
                    mode: gix::objs::tree::EntryKind::Blob.into(),
                    filename: entry.file_name().to_string_lossy().into_owned().into(),
                    oid: id.into(),
                });
            }

            let templates_tree = gix::objs::Tree {
                entries: template_entries,
            };
            let templates_tree_id = repo.write_object(&templates_tree)?.detach();
            root_entries.push(gix::objs::tree::Entry {
                mode: gix::objs::tree::EntryKind::Tree.into(),
                filename: "templates".into(),
                oid: templates_tree_id.into(),
            });
        }

        root_entries.sort_by(|a, b| a.filename.cmp(&b.filename));
        let root_tree = gix::objs::Tree {
            entries: root_entries,
        };
        let tree_oid = repo.write_object(&root_tree)?.detach();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let sig = gix::actor::Signature {
            name: "Bruh".into(),
            email: "bruh@local".into(),
            time: gix::date::Time {
                seconds: now,
                offset: 0,
                sign: gix::date::time::Sign::Plus,
            },
        };

        repo.commit_as(
            sig.to_ref(),
            sig.to_ref(),
            "HEAD",
            message,
            tree_oid,
            parents,
        )?;

        // Keep the index in sync so `git status` reflects the committed tree
        self.update_index_to_tree(&repo, tree_oid)
    }

    // -----------------------------------------------------------------------
    // Reset (hard reset to current HEAD)
    // -----------------------------------------------------------------------

    fn do_reset_hard(&self) -> Result<()> {
        let repo = self.open_or_init()?;
        let head_commit = repo.head_commit().context("No commits to reset to")?;
        let tree = head_commit.tree()?;
        let tree_id = tree.id;
        let tree_map = self.flatten_tree(&repo, tree, "")?;
        self.restore_from_tree_map(&repo, &tree_map)?;
        self.update_index_to_tree(&repo, tree_id)
    }

    // -----------------------------------------------------------------------
    // Checkout revision (restore files only — HEAD/branch unchanged)
    // -----------------------------------------------------------------------

    fn do_checkout(&self, hash: &str) -> Result<()> {
        let repo = self.open_or_init()?;
        let id = repo
            .rev_parse_single(hash)
            .context("Failed to resolve revision")?
            .detach();
        let commit = repo.find_commit(id)?;
        let tree = commit.tree()?;
        let tree_map = self.flatten_tree(&repo, tree, "")?;
        // Files are restored to the selected revision's state. HEAD and the
        // branch pointer remain unchanged, so the working tree appears dirty
        // relative to HEAD. The user can review and commit the restored state.
        self.restore_from_tree_map(&repo, &tree_map)
    }

    // -----------------------------------------------------------------------
    // File restoration helpers
    // -----------------------------------------------------------------------

    /// Restores tracked files from a flattened tree map.
    /// - Flat files: written if present in the tree, left unchanged if absent
    /// - Scripts: written from tree; extras on disk are deleted
    fn restore_from_tree_map(
        &self,
        repo: &gix::Repository,
        tree_map: &HashMap<String, gix::ObjectId>,
    ) -> Result<()> {
        // Restore flat tracked files
        for (name, _) in self.tracked_flat_files() {
            if let Some(blob_id) = tree_map.get(&name) {
                let blob = repo.find_object(*blob_id)?.into_blob();
                std::fs::write(self.bruh_dir.join(&name), &blob.data)?;
            }
            // If not in tree: leave as-is (.gitignore must always exist)
        }

        // Collect scripts present in the target tree
        let scripts_dir = self.scripts_dir();
        let tree_scripts: HashMap<String, gix::ObjectId> = tree_map
            .iter()
            .filter(|(k, _)| k.starts_with("scripts/"))
            .map(|(k, v)| (k["scripts/".len()..].to_string(), *v))
            .collect();

        // Write scripts from the tree
        if !tree_scripts.is_empty() {
            std::fs::create_dir_all(&scripts_dir)?;
            for (name, blob_id) in &tree_scripts {
                let blob = repo.find_object(*blob_id)?.into_blob();
                std::fs::write(scripts_dir.join(name), &blob.data)?;
            }
        }

        // Delete scripts that are on disk but absent from the target tree
        if scripts_dir.exists() {
            for entry in std::fs::read_dir(&scripts_dir)? {
                let entry = entry?;
                if entry.path().is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !tree_scripts.contains_key(&name) {
                        std::fs::remove_file(entry.path())?;
                    }
                }
            }
        }

        // Collect templates present in the target tree
        let templates_dir = self.templates_dir();
        let tree_templates: HashMap<String, gix::ObjectId> = tree_map
            .iter()
            .filter(|(k, _)| k.starts_with("templates/"))
            .map(|(k, v)| (k["templates/".len()..].to_string(), *v))
            .collect();

        // Write templates from the tree
        if !tree_templates.is_empty() {
            std::fs::create_dir_all(&templates_dir)?;
            for (name, blob_id) in &tree_templates {
                let blob = repo.find_object(*blob_id)?.into_blob();
                std::fs::write(templates_dir.join(name), &blob.data)?;
            }
        }

        // Delete templates that are on disk but absent from the target tree
        if templates_dir.exists() {
            for entry in std::fs::read_dir(&templates_dir)? {
                let entry = entry?;
                if entry.path().is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !tree_templates.contains_key(&name) {
                        std::fs::remove_file(entry.path())?;
                    }
                }
            }
        }

        Ok(())
    }

    /// Updates the git index to match the given tree, keeping `git status` clean.
    fn update_index_to_tree(&self, repo: &gix::Repository, tree_id: gix::ObjectId) -> Result<()> {
        let state = gix::index::State::from_tree(&tree_id, &repo.objects, Default::default())
            .context("Failed to build index from tree")?;
        let index_path = repo.path().join("index");
        let mut file = gix::index::File::from_state(state, index_path);
        file.write(gix::index::write::Options::default())
            .context("Failed to write index")
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn git_get_diff(config: State<'_, Config>) -> Result<String, CommandError> {
    GitManager::new(&config)
        .get_diff()
        .map_err(|e| CommandError {
            message: e.to_string(),
        })
}

#[tauri::command]
pub fn git_get_status(config: State<'_, Config>) -> Result<GitStatusResult, CommandError> {
    GitManager::new(&config)
        .get_status()
        .map_err(|e| CommandError {
            message: e.to_string(),
        })
}

#[tauri::command]
pub fn git_commit(message: String, config: State<'_, Config>) -> Result<(), CommandError> {
    GitManager::new(&config)
        .do_commit(message)
        .map_err(|e| CommandError {
            message: e.to_string(),
        })
}

#[tauri::command]
pub fn git_reset(config: State<'_, Config>, app: AppHandle) -> Result<(), CommandError> {
    GitManager::new(&config)
        .do_reset_hard()
        .map_err(|e| CommandError {
            message: e.to_string(),
        })?;
    app.emit("bruh://data-restored", ()).ok();
    Ok(())
}

#[tauri::command]
pub fn git_checkout_revision(
    hash: String,
    config: State<'_, Config>,
    app: AppHandle,
) -> Result<(), CommandError> {
    GitManager::new(&config)
        .do_checkout(&hash)
        .map_err(|e| CommandError {
            message: e.to_string(),
        })?;
    app.emit("bruh://data-restored", ()).ok();
    Ok(())
}

fn main() {
    let pkg_json = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("package.json"),
    )
    .expect("failed to read package.json");

    let version = pkg_json
        .lines()
        .find(|l| l.contains("\"version\""))
        .and_then(|l| l.split('"').nth(3))
        .expect("version not found in package.json");

    println!("cargo:rustc-env=BRUH_VERSION={version}");
    println!("cargo:rerun-if-changed=../package.json");

    let git_hash = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=BRUH_GIT_HASH={git_hash}");
    println!("cargo:rerun-if-changed=.git/HEAD");

    tauri_build::build()
}

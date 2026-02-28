//! Parses workflow JSON into typed nodes and application structure (sources → downstream).

use std::collections::{HashMap, HashSet, VecDeque};

use serde_json::Value;

use super::nodes::{try_parse_node, NodeRole, TypedNode};

/// Downstream path from one event source: source node id and ordered downstream node ids.
#[derive(Debug, Clone)]
pub struct SourcePath {
    pub source_id: i32,
    pub downstream_ids: Vec<i32>,
}

/// Parsed workflow: per-source paths for execution.
#[derive(Debug, Clone, Default)]
pub struct ApplicationStructure {
    pub paths: Vec<SourcePath>,
}

/// Builds a link index: origin node id -> list of (target node id) in link order.
fn link_index_from_value(graph: &Value) -> HashMap<i32, Vec<i32>> {
    let mut index: HashMap<i32, Vec<i32>> = HashMap::new();
    let links = match graph.get("links").and_then(|l| l.as_array()) {
        Some(arr) => arr,
        None => return index,
    };
    for link in links {
        let arr = match link.as_array() {
            Some(a) => a,
            None => continue,
        };
        if arr.len() < 5 {
            continue;
        }
        let origin_id = match arr[1].as_i64() {
            Some(n) => n as i32,
            None => continue,
        };
        let target_id = match arr[3].as_i64() {
            Some(n) => n as i32,
            None => continue,
        };
        index.entry(origin_id).or_default().push(target_id);
    }
    index
}

/// Builds a reverse link index: target node id -> list of (origin node id).
fn reverse_link_index_from_value(graph: &Value) -> HashMap<i32, Vec<i32>> {
    let mut index: HashMap<i32, Vec<i32>> = HashMap::new();
    let links = match graph.get("links").and_then(|l| l.as_array()) {
        Some(arr) => arr,
        None => return index,
    };
    for link in links {
        let arr = match link.as_array() {
            Some(a) => a,
            None => continue,
        };
        if arr.len() < 5 {
            continue;
        }
        let origin_id = match arr[1].as_i64() {
            Some(n) => n as i32,
            None => continue,
        };
        let target_id = match arr[3].as_i64() {
            Some(n) => n as i32,
            None => continue,
        };
        index.entry(target_id).or_default().push(origin_id);
    }
    index
}

/// Returns node id and TypedNode for each node in the graph, and a map from id to role.
fn typed_nodes_from_graph(graph: &Value) -> (HashMap<i32, TypedNode>, HashMap<i32, NodeRole>) {
    let mut nodes = HashMap::new();
    let mut roles = HashMap::new();
    let node_list = match graph.get("nodes").and_then(|n| n.as_array()) {
        Some(arr) => arr,
        None => return (nodes, roles),
    };
    for node_value in node_list {
        let id = match node_value.get("id").and_then(|v| v.as_i64()) {
            Some(n) => n as i32,
            None => continue,
        };
        if let Some(typed) = try_parse_node(node_value) {
            let role = typed.role();
            roles.insert(id, role);
            nodes.insert(id, typed);
        }
    }
    (nodes, roles)
}

/// Parses workflow JSON into an application structure: for each event source,
/// traverses links to collect downstream node ids, adds predecessor nodes (dependencies),
/// then adds successor nodes (consumers, e.g. a DB Query that inserts data from Script output).
pub fn parse_workflow(graph: &Value) -> ApplicationStructure {
    let link_index = link_index_from_value(graph);
    let reverse_index = reverse_link_index_from_value(graph);
    let (_typed_nodes, roles) = typed_nodes_from_graph(graph);

    let mut paths = Vec::new();
    for (&node_id, &role) in &roles {
        if role != NodeRole::EventSource {
            continue;
        }
        let mut downstream_ids = traverse_downstream(node_id, &link_index, &roles);
        add_predecessors_to_path(&mut downstream_ids, node_id, &reverse_index, &roles);
        add_successors_to_path(&mut downstream_ids, node_id, &link_index);
        paths.push(SourcePath {
            source_id: node_id,
            downstream_ids,
        });
    }
    ApplicationStructure { paths }
}

/// Adds all successor nodes (nodes that the path links into) so consumers like
/// a DB Query that inserts data from the Script's output are included and run after the Script.
fn add_successors_to_path(
    downstream_ids: &mut Vec<i32>,
    source_id: i32,
    link_index: &HashMap<i32, Vec<i32>>,
) {
    let mut in_path: HashSet<i32> = std::iter::once(source_id)
        .chain(downstream_ids.iter().copied())
        .collect();
    let mut queue: VecDeque<i32> = downstream_ids.iter().copied().collect();
    while let Some(origin_id) = queue.pop_front() {
        let targets = match link_index.get(&origin_id) {
            Some(t) => t.clone(),
            None => continue,
        };
        for target_id in targets {
            if in_path.insert(target_id) {
                downstream_ids.push(target_id);
                queue.push_back(target_id);
            }
        }
    }
}

/// Adds all predecessor nodes (nodes that link into the path) so dependencies like
/// DB Query are included when they feed into a node in the path. Includes all
/// predecessors regardless of role so that untyped nodes (e.g. database/query)
/// are run before nodes that consume their outputs.
fn add_predecessors_to_path(
    downstream_ids: &mut Vec<i32>,
    source_id: i32,
    reverse_index: &HashMap<i32, Vec<i32>>,
    _roles: &HashMap<i32, NodeRole>,
) {
    let mut in_path: HashSet<i32> = std::iter::once(source_id)
        .chain(downstream_ids.iter().copied())
        .collect();
    let mut queue: VecDeque<i32> = downstream_ids.iter().copied().collect();
    while let Some(target_id) = queue.pop_front() {
        let origins = match reverse_index.get(&target_id) {
            Some(o) => o.clone(),
            None => continue,
        };
        for origin_id in origins {
            if in_path.insert(origin_id) {
                downstream_ids.push(origin_id);
                queue.push_back(origin_id);
            }
        }
    }
}

/// BFS from source_id following links; returns downstream node ids in discovery order.
fn traverse_downstream(
    source_id: i32,
    link_index: &HashMap<i32, Vec<i32>>,
    roles: &HashMap<i32, NodeRole>,
) -> Vec<i32> {
    let mut result = Vec::new();
    let mut visited = HashSet::new();
    visited.insert(source_id);
    let mut queue = VecDeque::new();
    queue.push_back(source_id);
    while let Some(current) = queue.pop_front() {
        let targets = match link_index.get(&current) {
            Some(t) => t.clone(),
            None => continue,
        };
        for target_id in targets {
            if visited.insert(target_id) {
                if roles.get(&target_id).copied().unwrap_or(NodeRole::Unknown) != NodeRole::Unknown
                {
                    result.push(target_id);
                    queue.push_back(target_id);
                }
            }
        }
    }
    result
}

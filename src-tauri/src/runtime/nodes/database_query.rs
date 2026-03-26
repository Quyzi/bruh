//! Executes a database/query node: runs DuckDB SQL with input slots as parameters.

use std::collections::HashMap;

use anyhow;
use async_duckdb::duckdb;
use async_duckdb::duckdb::types::ValueRef;
use serde_json::Value;

use crate::Database;

fn value_ref_to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Boolean(b) => Value::Bool(b),
        ValueRef::TinyInt(n) => Value::Number(n.into()),
        ValueRef::SmallInt(n) => Value::Number(n.into()),
        ValueRef::Int(n) => Value::Number(n.into()),
        ValueRef::BigInt(n) => Value::Number(n.into()),
        ValueRef::HugeInt(n) => Value::String(n.to_string()),
        ValueRef::UTinyInt(n) => Value::Number(n.into()),
        ValueRef::USmallInt(n) => Value::Number(n.into()),
        ValueRef::UInt(n) => Value::Number(n.into()),
        ValueRef::UBigInt(n) => Value::Number(n.into()),
        ValueRef::Float(f) => serde_json::Number::from_f64(f as f64)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Double(f) => serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(s) => Value::String(String::from_utf8_lossy(s).into_owned()),
        ValueRef::Blob(b) => Value::String(b.iter().map(|byte| format!("{:02x}", byte)).collect()),
        _ => Value::String(format!("{:?}", v)),
    }
}

fn row_to_json(row: &duckdb::Row<'_>, col_names: &[String]) -> duckdb::Result<Value> {
    let mut map = serde_json::Map::new();
    for (i, name) in col_names.iter().enumerate() {
        let val = value_ref_to_json(row.get_ref(i)?);
        map.insert(name.clone(), val);
    }
    Ok(Value::Object(map))
}

fn value_to_query_param(value: Option<&Value>) -> Option<String> {
    let v = value?;
    if v.is_null() {
        return None;
    }
    if let Some(s) = v.as_str() {
        return Some(s.to_string());
    }
    if v.is_number() || v.as_bool().is_some() {
        return Some(v.to_string());
    }
    None
}

fn query_trim_is_insert_update_delete(query_trim: &str) -> bool {
    let upper = query_trim.to_uppercase();
    upper.starts_with("INSERT ") || upper.starts_with("UPDATE ") || upper.starts_with("DELETE ")
}

fn count_query_placeholders(query: &str) -> usize {
    let mut max = 0u32;
    let mut chars = query.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '?' || c == '$' {
            let mut num = 0u32;
            while chars.peek().map(|&c| c.is_ascii_digit()).unwrap_or(false) {
                if let Some(d) = chars.next() {
                    num = num
                        .saturating_mul(10)
                        .saturating_add(d.to_digit(10).unwrap_or(0));
                }
            }
            if num >= 1 && num <= 5 && num > max {
                max = num;
            }
        }
    }
    max as usize
}

fn normalize_query_placeholders(query: &str) -> String {
    let mut out = String::with_capacity(query.len());
    let mut chars = query.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '$' {
            let mut num = String::new();
            while chars.peek().map(|&c| c.is_ascii_digit()).unwrap_or(false) {
                if let Some(d) = chars.next() {
                    num.push(d);
                }
            }
            if !num.is_empty() && num.parse::<u32>().map_or(false, |n| n >= 1 && n <= 5) {
                out.push('?');
                out.push_str(&num);
            } else {
                out.push(c);
                out.push_str(&num);
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Runs a database/query node: executes the SQL with input slots bound as DuckDB positional parameters.
/// In the query use `?1` (or `$1`) for input 1 (slot 0), `?2` for input 2, … `?5` for input 5.
/// `node_groups` is used in logs when provided (pipeline execution).
pub async fn execute(
    node_value: &Value,
    inputs: HashMap<i32, Value>,
    database: Option<&Database>,
    node_groups: Option<&str>,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let db = match database {
        Some(d) => d,
        None => {
            let node_id = node_value.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
            let label: String = node_value
                .get("title")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_else(|| {
                    node_value
                        .get("type")
                        .and_then(|v| v.as_str())
                        .map(String::from)
                        .unwrap_or_else(|| format!("id:{}", node_id))
                });
            tracing::debug!(node = %label, groups = ?node_groups, "DB Query node: no database, skip");
            return Ok(Vec::new());
        }
    };
    let query = node_value
        .get("properties")
        .and_then(|p| p.get("query").and_then(|v| v.as_str()))
        .or_else(|| {
            node_value
                .get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("");
    if query.trim().is_empty() {
        let node_id = node_value.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let label: String = node_value
            .get("title")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| {
                node_value
                    .get("type")
                    .and_then(|v| v.as_str())
                    .map(String::from)
                    .unwrap_or_else(|| format!("id:{}", node_id))
            });
        tracing::warn!(node = %label, groups = ?node_groups, "DB Query node: empty query, skip");
        return Ok(Vec::new());
    }
    let query_owned = normalize_query_placeholders(query);
    let param_count = count_query_placeholders(&query_owned);
    let mut sorted_slots: Vec<i32> = inputs.keys().copied().collect();
    sorted_slots.sort_unstable();
    let mut param_values: Vec<Option<String>> = sorted_slots
        .iter()
        .take(5)
        .map(|&slot| value_to_query_param(inputs.get(&slot)))
        .collect();
    while param_values.len() < 5 {
        param_values.push(None);
    }
    let is_write = query_trim_is_insert_update_delete(query.trim());
    let first_param = param_values.first().and_then(Option::as_ref);
    if is_write && param_count >= 1 && first_param.is_none() {
        tracing::debug!(
            input_slot_count = inputs.len(),
            first_param_null = true,
            "DB Query: skipping INSERT/UPDATE/DELETE when first parameter is null"
        );
        return Ok(Vec::new());
    }
    let db_clone = db.clone();
    let result: Result<Vec<Value>, _> = db_clone
        .conn(move |conn| {
            if is_write {
                let _ = match param_count {
                    0 => conn.execute(&query_owned, [])?,
                    1 => conn.execute(&query_owned, duckdb::params![param_values[0].as_deref()])?,
                    2 => conn.execute(
                        &query_owned,
                        duckdb::params![param_values[0].as_deref(), param_values[1].as_deref(),],
                    )?,
                    3 => conn.execute(
                        &query_owned,
                        duckdb::params![
                            param_values[0].as_deref(),
                            param_values[1].as_deref(),
                            param_values[2].as_deref(),
                        ],
                    )?,
                    4 => conn.execute(
                        &query_owned,
                        duckdb::params![
                            param_values[0].as_deref(),
                            param_values[1].as_deref(),
                            param_values[2].as_deref(),
                            param_values[3].as_deref(),
                        ],
                    )?,
                    _ => conn.execute(
                        &query_owned,
                        duckdb::params![
                            param_values[0].as_deref(),
                            param_values[1].as_deref(),
                            param_values[2].as_deref(),
                            param_values[3].as_deref(),
                            param_values[4].as_deref(),
                        ],
                    )?,
                };
                return Ok(Vec::new());
            }
            let mut stmt = conn.prepare(&query_owned)?;
            let col_names: Vec<String> =
                stmt.column_names().into_iter().map(|s| s.to_owned()).collect();
            let mut vec = Vec::new();
            match param_count {
                0 => {
                    let iter = stmt.query_map([], |row| row_to_json(row, &col_names))?;
                    for row in iter {
                        vec.push(row?);
                    }
                }
                1 => {
                    let iter = stmt.query_map(
                        duckdb::params![param_values[0].as_deref()],
                        |row| row_to_json(row, &col_names),
                    )?;
                    for row in iter {
                        vec.push(row?);
                    }
                }
                2 => {
                    let iter = stmt.query_map(
                        duckdb::params![param_values[0].as_deref(), param_values[1].as_deref(),],
                        |row| row_to_json(row, &col_names),
                    )?;
                    for row in iter {
                        vec.push(row?);
                    }
                }
                3 => {
                    let iter = stmt.query_map(
                        duckdb::params![
                            param_values[0].as_deref(),
                            param_values[1].as_deref(),
                            param_values[2].as_deref(),
                        ],
                        |row| row_to_json(row, &col_names),
                    )?;
                    for row in iter {
                        vec.push(row?);
                    }
                }
                4 => {
                    let iter = stmt.query_map(
                        duckdb::params![
                            param_values[0].as_deref(),
                            param_values[1].as_deref(),
                            param_values[2].as_deref(),
                            param_values[3].as_deref(),
                        ],
                        |row| row_to_json(row, &col_names),
                    )?;
                    for row in iter {
                        vec.push(row?);
                    }
                }
                _ => {
                    let iter = stmt.query_map(
                        duckdb::params![
                            param_values[0].as_deref(),
                            param_values[1].as_deref(),
                            param_values[2].as_deref(),
                            param_values[3].as_deref(),
                            param_values[4].as_deref(),
                        ],
                        |row| row_to_json(row, &col_names),
                    )?;
                    for row in iter {
                        vec.push(row?);
                    }
                }
            }
            Ok(vec)
        })
        .await;
    let list = result.map_err(|e| anyhow::anyhow!("DB query failed: {}", e))?;
    let output = if list.is_empty() {
        Value::Array(vec![Value::Null])
    } else {
        Value::Array(list)
    };
    Ok(vec![(0, output)])
}

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::Result;
use clawdia_lib::Config;

fn main() -> Result<()> {
    let config = Config::load_or_create_default()?;
    clawdia_lib::run(config)
}

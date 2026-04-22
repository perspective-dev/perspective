// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

#![recursion_limit = "1024"]

//! This module generates metadata for other crates:
//!
//! - `perspective-client`
//!     - Add `protobuf-src` dependency
//!     - Generate `proto.rs` protobuf client bindings.
//! - `perspective-js`
//!     - TypeScript types
//!     - Recurisvely set external proto on `perspective-client`
//! - `perspective-server`
//!     - Copy `cpp` and `cmake` to local root
//!
//! The `metadata` binary must be run for these assets to be updated in
//! your local dev tree!

use std::error::Error;
use std::fmt::Write;
use std::fs;

use perspective_client::config::*;
use perspective_client::{
    ColumnWindow, DeleteOptions, JoinOptions, OnUpdateData, OnUpdateOptions, SystemInfo,
    TableInitOptions, UpdateOptions, ViewWindow,
};
use perspective_js::TypedArrayWindow;
use perspective_viewer::config::{ViewerConfig, ViewerConfigUpdate};
use ts_rs::TS;

pub fn generate_type_bindings_viewer() -> Result<(), Box<dyn Error>> {
    let path = std::env::current_dir()?.join("../perspective-viewer/src/ts/ts-rs");
    ViewerConfigUpdate::export_all_to(&path)?;
    ViewerConfig::<String>::export_all_to(&path)?;
    OnUpdateData::export_all_to(&path)?;
    Ok(())
}

fn generate_exprtk_docs() -> Result<(), Box<dyn Error>> {
    let mut txt = "<br/>\n\n# Perspective ExprTK Extensions\n\n".to_string();
    for rec in perspective_client::config::COMPLETIONS {
        writeln!(
            txt,
            "- `{}` {}",
            rec.insert_text,
            rec.documentation.replace("\n", " "),
        )?;
    }

    fs::create_dir_all("../perspective-client/docs/")?;
    fs::write("../perspective-client/docs/expression_gen.md", txt)?;
    Ok(())
}

#[doc(hidden)]
pub fn generate_type_bindings_js() -> Result<(), Box<dyn Error>> {
    let path = std::env::current_dir()?.join("../perspective-js/src/ts/ts-rs");
    ColumnType::export_all_to(&path)?;
    ColumnWindow::export_all_to(&path)?;
    DeleteOptions::export_all_to(&path)?;
    JoinOptions::export_all_to(&path)?;
    OnUpdateData::export_all_to(&path)?;
    OnUpdateOptions::export_all_to(&path)?;
    SystemInfo::<f64>::export_all_to(&path)?;
    TableInitOptions::export_all_to(&path)?;
    TypedArrayWindow::export_all_to(&path)?;
    UpdateOptions::export_all_to(&path)?;
    ViewConfig::export_all_to(&path)?;
    ViewConfigUpdate::export_all_to(&path)?;
    ViewWindow::export_all_to(&path)?;
    ViewWindow::export_all_to(&path)?;
    Ok(())
}

#[doc(hidden)]
pub fn generate_python_cargo_licenses() -> Result<(), Box<dyn Error>> {
    use std::fs::File;
    use std::process::{Command, Stdio};
    let python_dir = std::env::current_dir()?.join("../perspective-python");
    let bundler = env!("CARGO_BIN_FILE_CARGO_BUNDLE_LICENSES_cargo-bundle-licenses");
    let license_file = File::create(python_dir.join("LICENSE_THIRDPARTY_cargo.yml"))?;
    Command::new(bundler)
        .arg("--format=yaml")
        .current_dir(python_dir)
        .stdout(Stdio::from(license_file))
        .spawn()?
        .wait()?;
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    generate_type_bindings_js()?;
    generate_type_bindings_viewer()?;
    generate_exprtk_docs()?;
    generate_python_cargo_licenses()?;
    Ok(())
}

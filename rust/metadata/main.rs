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
use perspective_client::virtual_server::Features;
use perspective_client::{
    ColumnWindow, DeleteOptions, JoinOptions, OnRemoveData, OnUpdateData, OnUpdateOptions,
    SystemInfo, TableInitOptions, UpdateOptions, ViewWindow,
};
use perspective_js::TypedArrayWindow;
use perspective_viewer::config::{
    ClientOptions, CustomNumberFormatConfig, DatetimeColorMode, DatetimeFormatType, ExportMethod,
    ExportOptions, FormatMode, GetClientOptions, GetTableOptions, Notation, NumberFormatStyle,
    PanelOptions, PluginStaticConfig, RestoreOptions, SaveWorkspaceOptions, StringColorMode,
    ViewerConfig, ViewerConfigInitial, ViewerConfigUpdate, WorkspaceConfig, WorkspaceConfigUpdate,
};
use ts_rs::TS;

pub fn generate_type_bindings_viewer() -> Result<(), Box<dyn Error>> {
    let path = std::env::current_dir()?.join("../perspective-viewer/src/ts/ts-rs");

    // The directory is 100% generated: wipe before export so types removed
    // from the export graph cannot linger as stale orphans (the
    // `ColumnConfigValues.ts` class of confusion).
    if path.exists() {
        fs::remove_dir_all(&path)?;
    }

    fs::create_dir_all(&path)?;
    ViewerConfigUpdate::export_all_to(&path)?;
    ViewerConfigInitial::export_all_to(&path)?;
    ViewerConfig::<String>::export_all_to(&path)?;
    WorkspaceConfig::export_all_to(&path)?;
    WorkspaceConfigUpdate::export_all_to(&path)?;
    ExportMethod::export_all_to(&path)?;
    PanelOptions::export_all_to(&path)?;
    RestoreOptions::export_all_to(&path)?;
    ClientOptions::export_all_to(&path)?;
    ExportOptions::export_all_to(&path)?;
    GetTableOptions::export_all_to(&path)?;
    GetClientOptions::export_all_to(&path)?;
    PluginStaticConfig::export_all_to(&path)?;
    OnUpdateData::export_all_to(&path)?;
    SaveWorkspaceOptions::export_all_to(&path)?;

    // The column-format wire types (`columns_config` values): the
    // flattened style/notation families export separately (ts-rs cannot
    // flatten `Option<enum>`) and are re-composed in `column-format.ts`.
    CustomNumberFormatConfig::export_all_to(&path)?;
    NumberFormatStyle::export_all_to(&path)?;
    Notation::export_all_to(&path)?;
    DatetimeFormatType::export_all_to(&path)?;
    StringColorMode::export_all_to(&path)?;
    DatetimeColorMode::export_all_to(&path)?;
    FormatMode::export_all_to(&path)?;
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
    Features::export_all_to(&path)?;
    JoinOptions::export_all_to(&path)?;
    OnRemoveData::export_all_to(&path)?;
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

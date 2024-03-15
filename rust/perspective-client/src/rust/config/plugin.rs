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

use std::collections::HashMap;
use std::fmt::Debug;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct Symbol {
    /// the name of the symbol
    pub name: String,
    /// unescaped HTML string
    pub html: String,
}
impl std::fmt::Display for Symbol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.name)
    }
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct SymbolAttributes {
    /// a vec of SVGs to render
    pub symbols: Vec<Symbol>,
}

/// The default style configurations per type, as retrived by
/// plugin.plugin_attributes
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct DefaultStyleAttributes {
    pub string: serde_json::Value,
    pub datetime: serde_json::Value,
    pub date: serde_json::Value,
    pub integer: serde_json::Value,
    pub float: serde_json::Value,
    pub bool: serde_json::Value,
}

/// The data needed to populate a column's settings. These are typically default
/// values, a listing of possible values, or other basic configuration settings
/// for the plugin. This is the result of calling plugin.plugin_attributes
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct PluginAttributes {
    pub symbol: Option<SymbolAttributes>,
    pub style: Option<DefaultStyleAttributes>,
    // color: ColorAttributes,
    // axis: AxisAttributes,
    //...
}

/// The configuration which is created as the result of calling plugin.save
#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct PluginConfig {
    /// Refers to the currently active columns. Maps name to configuration.
    #[serde(default)]
    pub columns: HashMap<String, serde_json::Value>,
}
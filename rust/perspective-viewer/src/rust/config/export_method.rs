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

use std::rc::Rc;

use serde::Deserialize;
use yew::prelude::*;

use crate::js::*;

#[derive(Clone, Copy, Eq, PartialEq, Deserialize)]
pub enum ExportMethod {
    #[serde(rename = "csv")]
    Csv,

    #[serde(rename = "csv-all")]
    CsvAll,

    #[serde(rename = "csv-selected")]
    CsvSelected,

    #[serde(rename = "json")]
    Json,

    #[serde(rename = "json-all")]
    JsonAll,

    #[serde(rename = "json-selected")]
    JsonSelected,

    // #[serde(rename = "columns")]
    // JsonColumns,

    // #[serde(rename = "columns-all")]
    // JsonColumnsAll,

    // #[serde(rename = "columns-selected")]
    // JsonColumnsSelected,
    #[serde(rename = "ndjson")]
    Ndjson,

    #[serde(rename = "ndjson-all")]
    NdjsonAll,

    #[serde(rename = "ndjson-selected")]
    NdjsonSelected,

    #[serde(rename = "html")]
    Html,

    #[serde(rename = "plugin")]
    Plugin,

    #[serde(rename = "arrow")]
    Arrow,

    #[serde(rename = "arrow-selected")]
    ArrowSelected,

    #[serde(rename = "arrow-all")]
    ArrowAll,

    #[serde(rename = "json-config")]
    JsonConfig,
}

impl ExportMethod {
    pub const fn as_filename(&self, is_chart: bool) -> &'static str {
        match self {
            Self::Csv => ".csv",
            Self::CsvAll => ".all.csv",
            Self::Json => ".json",
            Self::JsonAll => ".all.json",
            Self::Html => ".html",
            Self::Plugin => {
                if is_chart {
                    ".png"
                } else {
                    ".txt"
                }
            },
            Self::Arrow => ".arrow",
            Self::ArrowAll => ".all.arrow",
            Self::JsonConfig => ".config.json",
            Self::CsvSelected => ".selected.csv",
            Self::JsonSelected => ".selected.json",
            Self::ArrowSelected => ".selected.arrow",
            Self::Ndjson => ".ndjson",
            Self::NdjsonAll => ".all.ndjson",
            Self::NdjsonSelected => ".selected.ndjson",
            // Self::JsonColumns => ".columns.json",
            // Self::JsonColumnsAll => ".all.columns.json",
            // Self::JsonColumnsSelected => ".selected.columns.json",
        }
    }

    pub const fn mimetype(&self, is_chart: bool) -> MimeType {
        match self {
            Self::Plugin if is_chart => MimeType::ImagePng,
            _ => MimeType::TextPlain,
        }
    }

    pub fn to_html(&self, is_chart: bool) -> Html {
        html! { <code>{ self.as_filename(is_chart) }</code> }
    }
}

impl ExportMethod {
    pub fn new_file(&self, x: &str, is_chart: bool) -> ExportFile {
        ExportFile {
            name: Rc::new(x.to_owned()),
            method: *self,
            is_chart,
        }
    }
}

#[derive(Clone, Eq, PartialEq)]
pub struct ExportFile {
    pub name: Rc<String>,
    pub method: ExportMethod,
    pub is_chart: bool,
}

impl ExportFile {
    pub fn as_filename(&self, is_chart: bool) -> String {
        format!("{}{}", self.name, self.method.as_filename(is_chart))
    }
}

impl From<ExportFile> for Html {
    fn from(x: ExportFile) -> Self {
        let class = if x.name.is_empty() {
            Some("invalid")
        } else {
            None
        };

        html! { <code {class}>{ x.name }{ x.method.as_filename(x.is_chart) }</code> }
    }
}

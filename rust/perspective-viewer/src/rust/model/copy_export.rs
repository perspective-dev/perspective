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

use std::collections::HashSet;

use futures::join;
use itertools::Itertools;
use perspective::utils::ApiFuture;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;

use super::export_app;
use super::export_method::*;
use super::get_viewer_config::*;
use super::structural::*;
use crate::config::*;
use crate::js::JsPerspectiveViewerPlugin;
use crate::utils::*;

fn tag_name_to_package(plugin: &JsPerspectiveViewerPlugin) -> String {
    let tag_name = plugin.unchecked_ref::<web_sys::HtmlElement>().tag_name();
    let tag_parts = tag_name.split('-').take(3).map(|x| x.to_lowercase());
    Itertools::intersperse(tag_parts, "-".to_owned()).collect::<String>()
}

/// Export functionality, for downloads and copy-to-clipboard, are mostly shared
/// behavior, but require access to a few state objects depending on which
/// format is desired.  The `CopyExportModel` groups this functionality in a
/// shared location, rather than distributing in the various state objects
/// that are relevent per-format.
pub trait CopyExportModel:
    HasSession + HasRenderer + HasPresentation + GetViewerConfigModel
{
    fn html_as_jsvalue(&self) -> ApiFuture<web_sys::Blob> {
        let view_config = self.get_viewer_config();
        let session = self.session().clone();
        let plugins = self
            .renderer()
            .get_all_plugins()
            .iter()
            .map(tag_name_to_package)
            .collect::<HashSet<String>>()
            .into_iter()
            .collect::<Vec<_>>();

        ApiFuture::new(async move {
            let (arrow, config) = join!(session.arrow_as_vec(true), view_config);
            let arrow = arrow?;
            let mut config = config?;
            config.settings = false;
            let js_config = serde_json::to_string(&config)?;
            let html = export_app::render(&base64::encode(arrow), &js_config, &plugins);
            js_sys::JsString::from(html.trim()).as_blob()
        })
    }

    /// Create a blob of this plugin's `.png` rendering by calling the
    /// `Plugin::render` method dynamically (as it may not exist e.g. for
    /// datagrid).
    ///
    /// # Errors
    ///
    /// It is assumed that `Plugin::render` exists on the plugin's Custom
    /// Element.
    fn png_as_jsvalue(&self) -> ApiFuture<web_sys::Blob> {
        let renderer = self.renderer().clone();
        ApiFuture::new(async move {
            let plugin = renderer.get_active_plugin()?;
            let render = js_sys::Reflect::get(&plugin, js_intern::js_intern!("render"))?;
            let render_fun = render.unchecked_into::<js_sys::Function>();
            let png = render_fun.call0(&plugin)?;
            let result = JsFuture::from(png.unchecked_into::<js_sys::Promise>())
                .await?
                .unchecked_into();
            Ok(result)
        })
    }

    /// Generate a result `Blob` for all types of `ExportMethod`.
    fn export_method_to_jsvalue(&self, method: ExportMethod) -> ApiFuture<web_sys::Blob> {
        match method {
            ExportMethod::Csv => {
                let session = self.session().clone();
                ApiFuture::new(async move { session.csv_as_jsvalue(false).await?.as_blob() })
            },
            ExportMethod::CsvAll => {
                let session = self.session().clone();
                ApiFuture::new(async move { session.csv_as_jsvalue(true).await?.as_blob() })
            },
            ExportMethod::Json => {
                let session = self.session().clone();
                ApiFuture::new(async move { session.json_as_jsvalue(false).await?.as_blob() })
            },
            ExportMethod::JsonAll => {
                let session = self.session().clone();
                ApiFuture::new(async move { session.json_as_jsvalue(true).await?.as_blob() })
            },
            ExportMethod::Arrow => {
                let session = self.session().clone();
                ApiFuture::new(async move { session.arrow_as_jsvalue(false).await?.as_blob() })
            },
            ExportMethod::ArrowAll => {
                let session = self.session().clone();
                ApiFuture::new(async move { session.arrow_as_jsvalue(true).await?.as_blob() })
            },
            ExportMethod::Html => {
                let html_task = self.html_as_jsvalue();
                ApiFuture::new(html_task)
            },
            ExportMethod::Png => {
                let png_task = self.png_as_jsvalue();
                ApiFuture::new(png_task)
            },
            ExportMethod::JsonConfig => {
                let config_task = self.get_viewer_config();
                ApiFuture::new(async move {
                    config_task
                        .await?
                        .encode(&Some(ViewerConfigEncoding::JSONString))?
                        .dyn_into::<js_sys::JsString>()?
                        .as_blob()
                })
            },
        }
    }
}

impl<T: HasRenderer + HasSession + HasPresentation> CopyExportModel for T {}

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

use base64::prelude::*;
use futures::join;
use itertools::Itertools;
use perspective_client::ViewWindow;
use perspective_js::utils::ApiResult;
use wasm_bindgen::{JsCast, JsValue, intern};
use wasm_bindgen_futures::JsFuture;

use super::export_app;
use super::export_method::*;
use super::get_viewer_config::*;
use super::structural::*;
use crate::js::JsPerspectiveViewerPlugin;
use crate::utils::*;

fn tag_name_to_package(plugin: &JsPerspectiveViewerPlugin) -> String {
    let tag_name = plugin.unchecked_ref::<web_sys::HtmlElement>().tag_name();
    let tag_parts = tag_name.split('-').take(3).map(|x| x.to_lowercase());
    Itertools::intersperse(tag_parts, "-".to_owned()).collect::<String>()
}

/// A model trait for Copy/Export UI task behavior,
///
/// Export functionality, for downloads and copy-to-clipboard, are mostly shared
/// behavior, but require access to a few state objects depending on which
/// format is desired.  The `CopyExportModel` groups this functionality in a
/// shared location, rather than distributing in the various state objects
/// that are relevent per-format.
pub trait CopyExportModel:
    HasSession + HasRenderer + HasPresentation + GetViewerConfigModel
{
    async fn html_as_jsvalue(&self) -> ApiResult<JsValue> {
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

        let (arrow, config) = join!(session.arrow_as_vec(true, None), view_config);
        let arrow = arrow?;
        let mut config = config?;
        config.settings = false;
        let js_config = serde_json::to_string(&config)?;
        let html = export_app::render(&BASE64_STANDARD.encode(arrow), &js_config, &plugins);
        Ok(js_sys::JsString::from(html.trim()).into())
    }

    /// Create a blob of this plugin's `.png` rendering by calling the
    /// `Plugin::render` method dynamically (as it may not exist e.g. for
    /// datagrid).
    ///
    /// # Errors
    ///
    /// It is assumed that `Plugin::render` exists on the plugin's Custom
    /// Element.
    async fn png_as_jsvalue(&self) -> ApiResult<web_sys::Blob> {
        let renderer = self.renderer().clone();
        let plugin = renderer.get_active_plugin()?;
        let render = js_sys::Reflect::get(&plugin, &intern("render").into())?;
        let render_fun = render.unchecked_into::<js_sys::Function>();
        let png = render_fun.call0(&plugin)?;
        let result = JsFuture::from(png.unchecked_into::<js_sys::Promise>())
            .await?
            .unchecked_into();
        Ok(result)
    }

    async fn txt_as_jsvalue(&self, viewport: Option<ViewWindow>) -> ApiResult<web_sys::Blob> {
        let renderer = self.renderer().clone();
        let plugin = renderer.get_active_plugin()?;
        let render = js_sys::Reflect::get(&plugin, &intern("render").into())?;
        let render_fun = render.unchecked_into::<js_sys::Function>();
        let txt = render_fun.call1(&plugin, &serde_wasm_bindgen::to_value(&viewport)?)?;
        let result = JsFuture::from(txt.unchecked_into::<js_sys::Promise>())
            .await?
            .unchecked_into();
        Ok(result)
    }

    /// Generate a result `Blob` for all types of `ExportMethod`.
    async fn export_method_to_blob(&self, method: ExportMethod) -> ApiResult<web_sys::Blob> {
        let viewport = self.renderer().get_selection();

        match method {
            ExportMethod::Csv => self.session().csv_as_jsvalue(false, None).await?.as_blob(),
            ExportMethod::CsvSelected => self
                .session()
                .csv_as_jsvalue(false, viewport)
                .await?
                .as_blob(),
            ExportMethod::CsvAll => self.session().csv_as_jsvalue(true, None).await?.as_blob(),
            ExportMethod::Json => self.session().json_as_jsvalue(false, None).await?.as_blob(),
            ExportMethod::JsonSelected => self
                .session()
                .json_as_jsvalue(false, viewport)
                .await?
                .as_blob(),
            ExportMethod::JsonAll => self.session().json_as_jsvalue(true, None).await?.as_blob(),
            ExportMethod::Ndjson => self
                .session()
                .ndjson_as_jsvalue(false, None)
                .await?
                .as_blob(),
            ExportMethod::NdjsonSelected => self
                .session()
                .ndjson_as_jsvalue(false, viewport)
                .await?
                .as_blob(),
            ExportMethod::NdjsonAll => self
                .session()
                .ndjson_as_jsvalue(true, None)
                .await?
                .as_blob(),
            ExportMethod::Arrow => self
                .session()
                .arrow_as_jsvalue(false, None)
                .await?
                .as_blob(),
            ExportMethod::ArrowSelected => self
                .session()
                .arrow_as_jsvalue(false, viewport)
                .await?
                .as_blob(),
            ExportMethod::ArrowAll => self.session().arrow_as_jsvalue(true, None).await?.as_blob(),
            ExportMethod::Html => self.html_as_jsvalue().await?.as_blob(),
            ExportMethod::Plugin if self.renderer().is_chart() => self.png_as_jsvalue().await,
            ExportMethod::Plugin => self.txt_as_jsvalue(viewport).await,
            ExportMethod::JsonConfig => {
                js_sys::JSON::stringify(&self.get_viewer_config().await?.encode()?)?.as_blob()
            },
        }
    }

    /// Generate a result `Blob` for all types of `ExportMethod`.
    async fn export_method_to_jsvalue(&self, method: ExportMethod) -> ApiResult<JsValue> {
        let viewport = self.renderer().get_selection();

        Ok(match method {
            ExportMethod::Csv => self.session().csv_as_jsvalue(false, None).await?.into(),
            ExportMethod::CsvSelected => {
                self.session().csv_as_jsvalue(false, viewport).await?.into()
            },
            ExportMethod::CsvAll => self.session().csv_as_jsvalue(true, None).await?.into(),
            ExportMethod::Json => self.session().json_as_jsvalue(false, None).await?.into(),
            ExportMethod::JsonSelected => self
                .session()
                .json_as_jsvalue(false, viewport)
                .await?
                .into(),
            ExportMethod::JsonAll => self.session().json_as_jsvalue(true, None).await?.into(),
            ExportMethod::Ndjson => self.session().ndjson_as_jsvalue(false, None).await?.into(),
            ExportMethod::NdjsonSelected => self
                .session()
                .ndjson_as_jsvalue(false, viewport)
                .await?
                .into(),
            ExportMethod::NdjsonAll => self.session().ndjson_as_jsvalue(true, None).await?.into(),
            ExportMethod::Arrow => self.session().arrow_as_jsvalue(false, None).await?.into(),
            ExportMethod::ArrowSelected => self
                .session()
                .arrow_as_jsvalue(false, viewport)
                .await?
                .into(),
            ExportMethod::ArrowAll => self.session().arrow_as_jsvalue(true, None).await?.into(),
            ExportMethod::Html => self.html_as_jsvalue().await?,
            ExportMethod::Plugin if self.renderer().is_chart() => {
                self.png_as_jsvalue().await?.into()
            },
            ExportMethod::Plugin => self.txt_as_jsvalue(viewport).await?.into(),
            ExportMethod::JsonConfig => self.get_viewer_config().await?.encode()?,
        })
    }
}

impl<T: HasRenderer + HasSession + HasPresentation> CopyExportModel for T {}

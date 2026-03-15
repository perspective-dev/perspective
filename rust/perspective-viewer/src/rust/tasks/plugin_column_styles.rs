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

use itertools::Itertools;
use perspective_client::config::ViewConfig;
use perspective_js::utils::ApiResult;

use super::{HasRenderer, HasSession};
use crate::config::ColumnStyleOpts;
use crate::renderer::Renderer;
use crate::session::SessionMetadata;

/// Queries the plugin to see if a given column can render column styles.
pub fn can_render_column_styles(
    renderer: &Renderer,
    view_config: &ViewConfig,
    metadata: &SessionMetadata,
    column_name: &str,
) -> ApiResult<bool> {
    let plugin = renderer.get_active_plugin()?;
    let names: Vec<String> = plugin
        .config_column_names()
        .and_then(|jsarr| serde_wasm_bindgen::from_value(jsarr.into()).ok())
        .unwrap_or_default();

    let group = view_config
        .columns
        .iter()
        .find_position(|maybe_s| maybe_s.as_deref() == Some(column_name))
        .and_then(|(idx, _)| names.get(idx))
        .map(|s| s.as_str());

    let view_type = metadata
        .get_column_view_type(column_name)
        .ok_or("Invalid column")?;

    plugin.can_render_column_styles(&view_type.to_string(), group)
}

/// Queries the plugin for the available style control options for a column.
pub fn get_column_style_control_options(
    renderer: &Renderer,
    view_config: &ViewConfig,
    metadata: &SessionMetadata,
    column_name: &str,
) -> ApiResult<ColumnStyleOpts> {
    let plugin = renderer.get_active_plugin()?;
    let names: Vec<String> = plugin
        .config_column_names()
        .and_then(|jsarr| serde_wasm_bindgen::from_value(jsarr.into()).ok())
        .unwrap_or_default();

    let group = view_config
        .columns
        .iter()
        .find_position(|maybe_s| maybe_s.as_deref() == Some(column_name))
        .and_then(|(idx, _)| names.get(idx))
        .map(|s| s.as_str());

    let view_type = metadata
        .get_column_view_type(column_name)
        .ok_or("Invalid column")?;

    let controls = plugin.column_style_controls(&view_type.to_string(), group)?;
    serde_wasm_bindgen::from_value(controls).map_err(|e| e.into())
}

/// Trait facade — delegates to the standalone functions above.
pub trait PluginColumnStyles: HasSession + HasRenderer {
    fn can_render_column_styles(&self, column_name: &str) -> ApiResult<bool> {
        can_render_column_styles(
            self.renderer(),
            &self.session().get_view_config(),
            &self.session().metadata(),
            column_name,
        )
    }

    fn get_column_style_control_options(&self, column_name: &str) -> ApiResult<ColumnStyleOpts> {
        get_column_style_control_options(
            self.renderer(),
            &self.session().get_view_config(),
            &self.session().metadata(),
            column_name,
        )
    }
}

impl<T: HasSession + HasRenderer> PluginColumnStyles for T {}

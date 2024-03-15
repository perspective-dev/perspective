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
use perspective::utils::ApiResult;

use super::{HasRenderer, HasSession};
use crate::config::ColumnStyleOpts;
use crate::derive_model;
use crate::renderer::Renderer;
use crate::session::Session;

/// TODO: This pattern of creating query objects to pass around would be
/// redundant if we had a grab-bag of models to clone around.
/// We could easily generate all the needed types for this in a proc_macro
/// crate. e.g. create structs like `SessionAndRendererModel {session,
/// renderer}` which are then called through a proc_macro like
/// `get_model!(Session, Renderer for self)` where the function is defined as
/// `get_model! => {($($name:ty),+ for $owner:ident)}`
///
/// Or, we could just lump
/// all the state into a single object where all these model functions are
/// defined. Generally, we could keep the hub-and-spoke architecture "under the
/// hood", but just not expose it to the yew framework, since it requires a lot
/// of unecessary prop-drilling and complexity.
#[derive(Clone)]
pub struct PluginColumnStylesQuery {
    session: Session,
    renderer: Renderer,
}
derive_model!(Session, Renderer for PluginColumnStylesQuery);

pub trait PluginColumnStyles: HasSession + HasRenderer {
    fn get_plugin_column_styles_query(&self) -> PluginColumnStylesQuery {
        PluginColumnStylesQuery {
            session: self.session().clone(),
            renderer: self.renderer().clone(),
        }
    }

    /// This function will query the plugin to see if a given column can render
    /// column styles.
    fn can_render_column_styles(&self, column_name: &str) -> ApiResult<bool> {
        let plugin = self.renderer().get_active_plugin()?;
        let names: Vec<String> = plugin
            .config_column_names()
            .and_then(|jsarr| serde_wasm_bindgen::from_value(jsarr.into()).ok())
            .unwrap_or_default();

        let group = self
            .session()
            .get_view_config()
            .columns
            .iter()
            .find_position(|maybe_s| maybe_s.as_deref() == Some(column_name))
            .and_then(|(idx, _)| names.get(idx))
            .map(|s| s.as_str());

        let view_type = self
            .session()
            .metadata()
            .get_column_view_type(column_name)
            .ok_or("Invalid column")?;

        plugin.can_render_column_styles(&view_type.to_string(), group)
    }

    /// Queries the plugins for the available plugin components.
    fn get_column_style_control_options(&self, column_name: &str) -> ApiResult<ColumnStyleOpts> {
        let plugin = self.renderer().get_active_plugin()?;
        let names: Vec<String> = plugin
            .config_column_names()
            .and_then(|jsarr| serde_wasm_bindgen::from_value(jsarr.into()).ok())
            .unwrap_or_default();

        let group = self
            .session()
            .get_view_config()
            .columns
            .iter()
            .find_position(|maybe_s| maybe_s.as_deref() == Some(column_name))
            .and_then(|(idx, _)| names.get(idx))
            .map(|s| s.as_str());

        let view_type = self
            .session()
            .metadata()
            .get_column_view_type(column_name)
            .ok_or("Invalid column")?;

        let controls = plugin.column_style_controls(&view_type.to_string(), group)?;
        serde_wasm_bindgen::from_value(controls).map_err(|e| e.into())
    }
}

impl<T: HasSession + HasRenderer> PluginColumnStyles for T {}

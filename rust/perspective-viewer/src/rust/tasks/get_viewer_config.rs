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

use super::structural::*;
use crate::config::*;
use crate::*;

/// A `ViewerConfig` is constructed from various properties acrosss the
/// application state
///
/// For example, the current `Plugin`, `ViewConfig`, and `Theme`.
/// `GetViewerConfigModel` provides methods which should be used to get the
/// applications `ViewerConfig` from across these state objects.
pub trait GetViewerConfigModel: HasSession + HasRenderer + HasPresentation {
    /// Get the current [`ViewerConfig`]`
    async fn get_viewer_config(&self) -> ApiResult<ViewerConfig> {
        let version = config::API_VERSION.to_string();
        let view_config = self.session().get_view_config().clone();
        let js_plugin = self.renderer().get_active_plugin()?;
        let settings = self.presentation().is_settings_open();
        let plugin = js_plugin.name();
        let plugin_config: serde_json::Value = js_plugin.save()?.into_serde_ext()?;
        let theme = self.presentation().get_selected_theme_name().await;
        let title = self.session().get_title();
        let table = self.session().get_table().map(|x| x.get_name().to_owned());
        let columns_config = self.presentation().all_columns_configs();
        Ok(ViewerConfig {
            version,
            plugin,
            title,
            plugin_config,
            columns_config,
            settings,
            table,
            view_config,
            theme,
        })
    }
}

impl<T: HasRenderer + HasSession + HasPresentation> GetViewerConfigModel for T {}

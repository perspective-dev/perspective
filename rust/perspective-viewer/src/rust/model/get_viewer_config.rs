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

use std::future::Future;
use std::pin::Pin;

use perspective_client::clone;

use super::columns_iter_set::*;
use super::structural::*;
use crate::config::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::*;
use crate::*;

/// A `ViewerConfig` is constructed from various properties acrosss the
/// application state, including the current `Plugin`, `ViewConfig`, and
/// `Theme`.  `GetViewerConfigModel` provides methods which should be used to
/// get the applications `ViewerConfig` from across these state objects.
pub trait GetViewerConfigModel: HasSession + HasRenderer + HasPresentation {
    /// As these methods are asynchronous, it is commonly useful to be able to
    /// discretely `.clone()` the state objects for dispatching to `async`.
    /// Calling `.cloned()` yields just the state object clones of
    /// `GetViewerConfigModel` which itself implements this trait and other
    /// `crate::model` traits.
    fn cloned(&self) -> GetViewerConfigModelCloned {
        GetViewerConfigModelCloned {
            renderer: self.renderer().clone(),
            session: self.session().clone(),
            presentation: self.presentation().clone(),
        }
    }

    /// Get the current ViewerConfig
    fn get_viewer_config(&self) -> Pin<Box<dyn Future<Output = ApiResult<ViewerConfig>>>> {
        clone!(self.renderer(), self.session(), self.presentation());
        Box::pin(async move {
            let version = config::API_VERSION.to_string();
            let view_config = session.get_view_config().clone();
            let js_plugin = renderer.get_active_plugin()?;
            let settings = presentation.is_settings_open();
            let plugin = js_plugin.name();
            let plugin_config: serde_json::Value = js_plugin.save().into_serde_ext()?;
            let theme = presentation.get_selected_theme_name().await;
            let title = presentation.get_title();
            let columns_config = presentation.all_columns_configs();
            Ok(ViewerConfig {
                version,
                plugin,
                title,
                plugin_config,
                columns_config,
                settings,
                view_config,
                theme,
            })
        })
    }
}

impl<T: HasRenderer + HasSession + HasPresentation> GetViewerConfigModel for T {}

#[derive(Clone)]
pub struct GetViewerConfigModelCloned {
    renderer: Renderer,
    session: Session,
    presentation: Presentation,
}

derive_model!(Renderer, Session, Presentation for GetViewerConfigModelCloned);

pub trait ColumnIteratorModel: HasSession + HasRenderer + HasDragDrop {
    fn column_selector_iter_set<'a>(&'a self, config: &'a ViewConfig) -> ColumnsIteratorSet<'a> {
        ColumnsIteratorSet::new(config, self.session(), self.renderer(), self.dragdrop())
    }
}

impl<T: HasSession + HasRenderer + HasDragDrop> ColumnIteratorModel for T {}

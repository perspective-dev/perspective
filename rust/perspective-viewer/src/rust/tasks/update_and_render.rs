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

use perspective_client::config::ViewConfigUpdate;
use yew::prelude::*;

use super::structural::*;
use crate::renderer::Renderer;
use crate::session::Session;
use crate::utils::*;
use crate::*;

/// A model trait for updating both `View` state and completing a render.
///
/// While `Renderer` manages the plugin and thus the render call itself, the
/// current `View` is handled by the `Session` which must be validated and
/// locked while drawing is in progress.  `UpdateAndRender` provides methods
/// that synchronize this behavior, so these methods should be used to initiate
/// rendering of the current `Plugin` and `View`.
pub trait UpdateAndRender: HasRenderer + HasSession {
    /// Create a `Callback` that renders from the current `View` and `Plugin`.
    fn render_callback(&self) -> Callback<()> {
        clone!(self.session(), self.renderer());
        Callback::from(move |_| {
            clone!(session, renderer);
            ApiFuture::spawn(async move {
                renderer.draw(async { Ok(session.get_view()) }).await?;
                Ok(())
            })
        })
    }

    /// Create a `Callback` that resizes from the current `View` and `Plugin`.
    fn resize_callback(&self) -> Callback<()> {
        clone!(self.renderer(), self.session());
        Callback::from(move |_| {
            clone!(renderer, session);
            ApiFuture::spawn(async move {
                if !renderer.is_plugin_activated()? {
                    update_and_render(session, renderer).await?
                } else {
                    renderer.resize().await?;
                }

                Ok(())
            })
        })
    }

    /// Apply a `ViewConfigUpdate` to the current `View` and render.
    fn update_and_render(&self, update: ViewConfigUpdate) -> ApiResult<ApiFuture<()>> {
        self.session().update_view_config(update)?;
        clone!(self.session(), self.renderer());
        Ok(ApiFuture::new(update_and_render(session, renderer)))
    }

    fn just_render(&self) -> ApiResult<ApiFuture<()>> {
        clone!(self.session(), self.renderer());
        Ok(ApiFuture::new(update_and_render(session, renderer)))
    }
}

#[tracing::instrument(level = "debug", skip(session, renderer))]
async fn update_and_render(session: Session, renderer: Renderer) -> ApiResult<()> {
    // The previous call which acquired the lock errored, so skip this render
    if session.get_error().is_some() {
        return Ok(());
    }

    renderer.apply_pending_plugin()?;
    let view = session.validate().await?;
    renderer.draw(view.create_view()).await
}

impl<T: HasRenderer + HasSession> UpdateAndRender for T {}

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

//! Apply a [`ViewConfigUpdate`] to the active [`Session`], validate it, then
//! draw with the active [`Renderer`].  The companion `*_callback` helpers
//! return [`yew::Callback`]s suitable for wiring as Yew child-component
//! props.

use perspective_client::config::ViewConfigUpdate;
use yew::prelude::*;

use crate::renderer::Renderer;
use crate::session::Session;
use crate::utils::*;
use crate::*;

/// Create a [`Callback`] that renders from the current `View` and `Plugin`.
pub fn render_callback(session: &Session, renderer: &Renderer) -> Callback<()> {
    clone!(session, renderer);
    Callback::from(move |_| {
        clone!(session, renderer);
        ApiFuture::spawn(async move {
            renderer.draw(async { Ok(session.get_view()) }).await?;
            Ok(())
        })
    })
}

/// Create a [`Callback`] that resizes from the current `View` and `Plugin`.
pub fn resize_callback(session: &Session, renderer: &Renderer) -> Callback<()> {
    clone!(session, renderer);
    Callback::from(move |_| {
        clone!(renderer, session);
        ApiFuture::spawn(async move {
            if !renderer.is_plugin_activated()? {
                update_and_render_inner(session, renderer).await?
            } else {
                renderer.resize().await?;
            }

            Ok(())
        })
    })
}

/// Apply a `ViewConfigUpdate` to the current `View` and render.
pub fn update_and_render(
    session: &Session,
    renderer: &Renderer,
    update: ViewConfigUpdate,
) -> ApiResult<ApiFuture<()>> {
    session.update_view_config(update)?;
    clone!(session, renderer);
    Ok(ApiFuture::new(update_and_render_inner(session, renderer)))
}

/// Re-render the current `View` and `Plugin` without applying a new
/// `ViewConfigUpdate`.
pub fn just_render(session: &Session, renderer: &Renderer) -> ApiResult<ApiFuture<()>> {
    clone!(session, renderer);
    Ok(ApiFuture::new(update_and_render_inner(session, renderer)))
}

#[tracing::instrument(level = "debug", skip(session, renderer))]
async fn update_and_render_inner(session: Session, renderer: Renderer) -> ApiResult<()> {
    // The previous call which acquired the lock errored, so skip this render
    if session.get_error().is_some() {
        return Ok(());
    }

    renderer.apply_pending_plugin()?;
    let view = session.validate().await?;
    renderer.draw(view.create_view()).await
}

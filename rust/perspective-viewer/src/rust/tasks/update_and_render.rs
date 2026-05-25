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

    let plugin_swapped = renderer.apply_pending_plugin()?;

    // Validate + create the view BEFORE the plugin-swap materialize
    // so the schema query sees fresh `expression_schema` /
    // `view_schema` and `resolve_abs_max` has a bound view that
    // knows about any new expression columns.
    let view = session.validate().await?.create_view().await?;

    if plugin_swapped {
        // `commit_plugin_idx` already restored the new plugin from its
        // raw bucket; re-run with the materialized snapshot so any
        // `include: true` schema defaults (e.g. Datagrid's
        // `fg_gradient` when `number_fg_mode = "bar"`) make it into
        // the plugin's state before the first draw. The Session is in
        // scope here but not at `commit_plugin_idx`'s call sites in
        // the column-selector tree, so we do the second restore at
        // the caller instead of plumbing `&Session` through every
        // `apply_pending_plugin` site.
        let view_config_snapshot = session.get_view_config().clone();
        let plugin_token = wasm_bindgen::JsValue::from_serde_ext(&renderer.get_plugin_config())
            .unwrap_or(wasm_bindgen::JsValue::NULL);
        let columns_config = renderer
            .all_columns_configs_materialized(&view_config_snapshot, &session)
            .await;
        renderer
            .get_active_plugin()?
            .restore(&plugin_token, Some(&columns_config))?;
    }

    renderer.draw(async { Ok(view) }).await
}

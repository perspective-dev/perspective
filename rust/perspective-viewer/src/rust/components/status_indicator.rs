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
use perspective_js::utils::ApiError;
use wasm_bindgen::JsValue;
use web_sys::*;
use yew::prelude::*;

use crate::custom_events::CustomEvents;
use crate::renderer::Renderer;
use crate::session::{Session, TableErrorState, ViewStats};
use crate::utils::*;

/// Value-prop version: no PubSub subscriptions, no reducer.
/// The parent (`StatusBar`) re-renders this component whenever
/// `update_count`, `error`, or `stats` change (via root's `IncrementUpdateCount`
/// / `DecrementUpdateCount` / `UpdateSession` messages).
#[derive(PartialEq, Properties)]
pub struct StatusIndicatorProps {
    pub custom_events: CustomEvents,
    pub renderer: Renderer,
    pub session: Session,
    /// Number of in-flight renders (>0 → "updating" spinner).
    pub update_count: u32,
    /// Full error state (if any), used for the error dialog and reconnect.
    pub error: Option<TableErrorState>,
    /// Whether a table has been loaded.
    pub has_table: bool,
    /// Row/column statistics — used to distinguish "loading" from "connected".
    pub stats: Option<ViewStats>,
}

/// An indicator component which displays the current status of the perspective
/// server as an icon. This indicator also functions as a button to invoke the
/// reconnect callback when in an error state.
#[function_component]
pub fn StatusIndicator(props: &StatusIndicatorProps) -> Html {
    // Derive the icon state directly from value props — no subscriptions needed.
    //
    // The precedence matches master's `Reducible` implementation:
    // - Error always wins.
    // - "Loading" is sticky: once stats lack `num_table_cells`, neither
    //   increment nor decrement can leave `Loading`.  This matters when
    //   `load()` is called with the same `Table` (no `create_view()`, so
    //   `view_created` never fires and `update_count` never decrements).
    // - "Updating" only shows when stats already have cells (normal operation).
    let has_table_cells = props
        .stats
        .as_ref()
        .and_then(|s| s.num_table_cells)
        .is_some();

    let state = if let Some(err) = &props.error {
        StatusIconState::Errored(
            err.message(),
            err.stacktrace(),
            err.kind(),
            err.is_reconnect(),
        )
    } else if !has_table_cells && props.has_table {
        StatusIconState::Loading
    } else if props.update_count > 0 {
        StatusIconState::Updating
    } else if has_table_cells {
        StatusIconState::Normal
    } else {
        StatusIconState::Uninitialized
    };

    let class_name = match &state {
        StatusIconState::Errored(_, _, _, true) => "errored",
        StatusIconState::Errored(_, _, _, false) => "errored disabled",
        StatusIconState::Normal => "connected",
        StatusIconState::Updating => "updating",
        StatusIconState::Loading => "loading",
        StatusIconState::Uninitialized => "uninitialized",
    };

    let onclick = use_async_callback(
        (
            props.session.clone(),
            props.renderer.clone(),
            props.custom_events.clone(),
            state.clone(),
        ),
        async move |_: MouseEvent, (session, renderer, custom_events, state)| {
            match &state {
                StatusIconState::Errored(..) => {
                    session.reconnect().await?;
                    let cfg = ViewConfigUpdate::default();
                    session.update_view_config(cfg)?;
                    renderer.apply_pending_plugin()?;
                    renderer.draw(session.validate().await?.create_view()).await?;
                },
                StatusIconState::Normal => {
                    custom_events
                        .dispatch_event("status-indicator-click", JsValue::UNDEFINED)?;
                },
                _ => {},
            };

            Ok::<_, ApiError>(())
        },
    );

    html! {
        <>
            <div class="section">
                <div id="status_reconnect" class={class_name} {onclick}>
                    <span id="status" class={class_name} />
                    <span id="status_updating" class={class_name} />
                </div>
                if let StatusIconState::Errored(err, stack, kind, _) = &state {
                    <div class="error-dialog">
                        <div class="error-dialog-message">{ format!("{} {}", kind, err) }</div>
                        <div class="error-dialog-stack">{ stack }</div>
                    </div>
                }
            </div>
        </>
    }
}

#[derive(Clone, Debug, PartialEq)]
enum StatusIconState {
    Loading,
    Updating,
    Errored(String, String, &'static str, bool),
    Normal,
    Uninitialized,
}

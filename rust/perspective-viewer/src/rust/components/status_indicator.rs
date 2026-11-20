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

use yew::prelude::*;

use crate::queries::{StatusState, WorkspaceStatus};

#[derive(PartialEq, Properties)]
pub struct StatusIndicatorProps {
    pub status: WorkspaceStatus,

    /// Fired when the indicator is clicked, in every state.
    pub on_toggle: Callback<()>,
}

/// An indicator component which displays the worst status across the
/// workspace's panels and clients as an icon, and toggles the workspace
/// panel when clicked.
#[function_component]
pub fn StatusIndicator(props: &StatusIndicatorProps) -> Html {
    let class_name = match props.status.state {
        StatusState::Errored => "errored",
        StatusState::Normal => "connected",
        StatusState::Updating => "updating",
        StatusState::Loading => "loading",
        StatusState::Pending => "pending",
        StatusState::Uninitialized => "uninitialized",
    };

    let onclick = props.on_toggle.reform(|_: MouseEvent| ());
    html! {
        <>
            <div class="section">
                <div id="status_reconnect" class={class_name} {onclick}>
                    <span id="status" class={class_name} />
                    <span id="status_updating" class={class_name} />
                </div>
                if let Some(error) = &props.status.error {
                    <div class="error-dialog">
                        <div class="error-dialog-message">
                            { format!("{} {}", error.kind, error.message) }
                        </div>
                        <div class="error-dialog-stack">{ &error.stack }</div>
                    </div>
                }
            </div>
        </>
    }
}

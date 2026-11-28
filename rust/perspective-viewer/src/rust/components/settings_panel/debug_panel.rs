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

use crate::components::editors::json_panel::{JsonPanel, JsonSource};
use crate::presentation::*;
use crate::renderer::*;
use crate::session::*;
use crate::workspace::Workspace;

#[derive(Clone, Properties)]
pub struct DebugPanelProps {
    pub presentation: Presentation,
    pub renderer: Renderer,
    pub session: Session,
    pub workspace: Workspace,

    /// Trap-door width pinned by the parent `SettingsPanel` so switching
    /// tabs doesn't shrink the panel. Threaded into the hidden sizer
    /// `<div class="scroll-panel-auto-width">`.
    #[prop_or_default]
    pub initial_width: f64,

    /// Fires once on mount with this panel's measured natural width.
    /// Routed up to `SettingsPanel` which keeps the running max.
    #[prop_or_default]
    pub on_auto_width: Callback<f64>,
}

impl PartialEq for DebugPanelProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.initial_width == rhs.initial_width
    }
}

#[function_component(DebugPanel)]
pub fn debug_panel(props: &DebugPanelProps) -> Html {
    let source = JsonSource::Viewer {
        presentation: props.presentation.clone(),
        renderer: props.renderer.clone(),
        session: props.session.clone(),
        workspace: props.workspace.clone(),
    };

    html! {
        <JsonPanel
            id="debug-panel"
            {source}
            initial_width={props.initial_width}
            on_auto_width={props.on_auto_width.clone()}
        />
    }
}

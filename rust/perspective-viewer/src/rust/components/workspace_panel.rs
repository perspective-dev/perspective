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

mod join_form;
mod table_rows;
mod tables_tab;

use std::rc::Rc;

use yew::prelude::*;

use self::tables_tab::TablesTab;
use crate::components::json_panel::{JsonPanel, JsonSource};
use crate::queries::WorkspaceStatus;
use crate::tasks::WorkspaceHost;
use crate::ui::SidebarCloseButton;

/// A panel listed under its `Client` in the Tables tab's Views.
#[derive(Clone, Debug, PartialEq)]
pub struct ViewLabel {
    pub id: String,
    pub title: Option<String>,

    /// Whether a `Table` can be derived from this panel's `View` now.
    pub derivable: bool,
}

pub type ViewLabels = Rc<Vec<ViewLabel>>;

/// A tab of the [`WorkspacePanel`].
#[derive(Debug, PartialEq, Clone, Copy, Default)]
pub enum WorkspaceTab {
    #[default]
    Tables,
    Json,
    Chat,
}

#[derive(Clone, Properties)]
pub struct WorkspacePanelProps {
    pub host: WorkspaceHost,
    pub status: WorkspaceStatus,
    pub selected_tab: WorkspaceTab,
    pub is_pinned: bool,

    /// The panels with a `Table`, listed as each `Client`'s Views.
    pub panels: ViewLabels,

    /// Fired when the close button is clicked.
    pub on_close: Callback<()>,
    pub on_toggle_pin: Callback<()>,
    pub on_select_tab: Callback<WorkspaceTab>,

    /// Fired with a panel id to derive a `Table` from its `View`.
    pub on_derive_panel: Callback<String>,
}

impl PartialEq for WorkspacePanelProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.status == rhs.status
            && self.selected_tab == rhs.selected_tab
            && self.is_pinned == rhs.is_pinned
            && self.panels == rhs.panels
    }
}

/// The workspace-tier sidebar, with tabs for the workspace's tables, its
/// config as JSON, and the agent chat.
#[function_component]
pub fn WorkspacePanel(props: &WorkspacePanelProps) -> Html {
    #[cfg(feature = "llm-agent")]
    let has_chat = {
        let update = use_force_update();
        let agent = props.host.presentation.agent.clone();
        use_effect_with((), move |_| {
            let sub = agent
                .on_update
                .add_notify_listener(&Callback::from(move |_| update.force_update()));

            move || drop(sub)
        });

        props.host.presentation.agent.is_configured()
    };

    #[cfg(not(feature = "llm-agent"))]
    let has_chat = false;

    let selected = match props.selected_tab {
        WorkspaceTab::Chat if !has_chat => WorkspaceTab::Tables,
        tab => tab,
    };

    let tab = |tab: WorkspaceTab, id: &'static str| {
        let class = if tab == selected {
            "settings_tab selected_tab"
        } else {
            "settings_tab"
        };

        let onpointerdown = props.on_select_tab.reform(move |_: PointerEvent| tab);
        html! { <div {id} {class} {onpointerdown} /> }
    };

    let mut pin_class = classes!("sidebar_pin_button");
    if props.is_pinned {
        pin_class.push("is-pinned");
    }

    let on_pin = props.on_toggle_pin.reform(|_: MouseEvent| ());
    let body = match selected {
        WorkspaceTab::Tables => html! {
            <TablesTab
                host={props.host.clone()}
                status={props.status.clone()}
                panels={props.panels.clone()}
                on_derive_panel={props.on_derive_panel.clone()}
            />
        },
        WorkspaceTab::Json => html! {
            <JsonPanel id="workspace-json" source={JsonSource::Workspace(props.host.clone())} />
        },
        #[cfg(feature = "llm-agent")]
        WorkspaceTab::Chat => html! {
            <crate::components::chat_panel::ChatPanel
                agent={props.host.presentation.agent.clone()}
            />
        },
        #[cfg(not(feature = "llm-agent"))]
        WorkspaceTab::Chat => html! {},
    };

    html! {
        <>
            <SidebarCloseButton
                id="workspace_close_button"
                on_close_sidebar={props.on_close.clone()}
            />
            <div id="workspace_panel" class="sidebar_column noselect">
                <div id="workspace_panel_header">
                    <span
                        id="workspace_pin_button"
                        class={pin_class}
                        title={if props.is_pinned { "Unpin" } else { "Pin" }}
                        onclick={on_pin}
                    />
                </div>
                <div id="workspace_panel_divider" />
                <div id="workspace_tab_bar">
                    { tab(WorkspaceTab::Tables, "workspace_tables_tab") }
                    { tab(WorkspaceTab::Json, "workspace_json_tab") }
                    if has_chat { { tab(WorkspaceTab::Chat, "workspace_chat_tab") } }
                </div>
                { body }
            </div>
        </>
    }
}

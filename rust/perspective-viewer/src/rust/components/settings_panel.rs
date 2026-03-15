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

use std::rc::Rc;

use perspective_client::config::{ViewConfig, ViewConfigUpdate};
use perspective_js::utils::ApiFuture;
use yew::prelude::*;

use super::column_selector::ColumnSelector;
use super::plugin_selector::PluginSelector;
use crate::components::containers::sidebar_close_button::SidebarCloseButton;
use crate::config::PluginUpdate;
use crate::dragdrop::*;
use crate::presentation::{ColumnLocator, OpenColumnSettings, Presentation};
use crate::renderer::*;
use crate::session::*;
use crate::session::column_defaults_update::*;
use crate::tasks::can_render_column_styles;
use crate::utils::*;

#[derive(Clone, Properties)]
pub struct SettingsPanelProps {
    pub on_close: Callback<()>,
    pub on_resize: Rc<PubSub<()>>,
    pub on_select_column: Callback<ColumnLocator>,
    pub on_debug: Callback<()>,
    pub is_debug: bool,

    /// Value props threaded from the root's `RendererProps` / `SessionProps`.
    pub plugin_name: Option<String>,
    pub available_plugins: Rc<Vec<String>>,
    pub has_table: bool,
    pub named_column_count: usize,
    pub view_config: ViewConfig,
    /// Column currently being dragged (if any) — threaded to show drag
    /// highlights without per-component `DragDrop` PubSub subscriptions.
    pub drag_column: Option<String>,
    /// Cloned session metadata snapshot — threaded from `SessionProps`
    /// so that metadata changes trigger re-renders via prop diffing.
    pub metadata: SessionMetadata,
    /// Snapshot of the column-settings sidebar state — threaded from
    /// `PresentationProps` so that open/close triggers re-renders.
    pub open_column_settings: OpenColumnSettings,

    /// State
    pub dragdrop: DragDrop,
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
}

impl PartialEq for SettingsPanelProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.is_debug == rhs.is_debug
            && self.plugin_name == rhs.plugin_name
            && self.available_plugins == rhs.available_plugins
            && self.has_table == rhs.has_table
            && self.named_column_count == rhs.named_column_count
            && self.view_config == rhs.view_config
            && self.drag_column == rhs.drag_column
            && self.metadata == rhs.metadata
            && self.open_column_settings == rhs.open_column_settings
    }
}

#[function_component]
pub fn SettingsPanel(props: &SettingsPanelProps) -> Html {
    let SettingsPanelProps {
        dragdrop,
        presentation,
        renderer,
        session,
        ..
    } = &props;

    let selected_column = {
        let locator = props.open_column_settings.locator.clone();
        let config = &props.view_config;
        locator.filter(|locator| match locator {
            ColumnLocator::Table(name) => {
                locator
                    .name()
                    .map(|n| {
                        config.columns.iter().any(|maybe_col| {
                            maybe_col.as_ref().map(|col| col == n).unwrap_or_default()
                        }) || config.group_by.iter().any(|col| col == n)
                            || config.split_by.iter().any(|col| col == n)
                            || config.filter.iter().any(|col| col.column() == n)
                            || config.sort.iter().any(|col| &col.0 == n)
                    })
                    .unwrap_or_default()
                    && can_render_column_styles(&props.renderer, config, &props.metadata, name)
                        .unwrap_or_default()
            },
            _ => true,
        })
    };

    let plugin_name = props.plugin_name.clone();
    let available_plugins = props.available_plugins.clone();

    // Dispatch callback: captures engine handles, constructs config update, renders
    let on_select_plugin = {
        clone!(renderer, session, presentation);
        let session_metadata = props.metadata.clone();
        Callback::from(move |plugin_name: String| {
            if !session.is_errored() {
                let metadata =
                    renderer.get_next_plugin_metadata(&PluginUpdate::Update(plugin_name));
                let prev_metadata = renderer.metadata();
                let requirements = metadata.as_ref().unwrap_or(&*prev_metadata);
                let rollup_features = session_metadata
                    .get_features()
                    .map(|x| x.get_group_rollup_modes())
                    .unwrap();
                let group_rollups = requirements.get_group_rollups(&rollup_features);
                let all_columns: Vec<_> = session_metadata
                    .get_table_columns()
                    .into_iter()
                    .flatten()
                    .cloned()
                    .map(Some)
                    .collect();
                let mut update = ViewConfigUpdate {
                    group_rollup_mode: group_rollups.first().cloned(),
                    ..ViewConfigUpdate::default()
                };
                update.set_update_column_defaults(
                    &session_metadata,
                    &all_columns,
                    requirements,
                );
                if session.update_view_config(update).is_ok() {
                    clone!(renderer, session);
                    ApiFuture::spawn(async move {
                        renderer.apply_pending_plugin()?;
                        renderer.draw(session.validate().await?.create_view()).await
                    });
                }
                presentation.set_open_column_settings(None);
            }
        })
    };

    html! {
        <div id="settings_panel" class="sidebar_column noselect split-panel orient-vertical">
            if selected_column.is_none() {
                <SidebarCloseButton
                    id="settings_close_button"
                    on_close_sidebar={&props.on_close.clone()}
                />
            }
            <SidebarCloseButton
                id={if props.is_debug {"debug_close_button"} else {"debug_open_button"}}
                on_close_sidebar={&props.on_debug}
            />
            <PluginSelector
                {plugin_name}
                {available_plugins}
                {on_select_plugin}
            />
            <ColumnSelector
                on_resize={&props.on_resize}
                on_open_expr_panel={&props.on_select_column}
                selected_column={selected_column}
                has_table={props.has_table}
                named_column_count={props.named_column_count}
                view_config={props.view_config.clone()}
                drag_column={props.drag_column.clone()}
                metadata={props.metadata.clone()}
                {dragdrop}
                renderer={renderer.clone()}
                session={session.clone()}
            />
        </div>
    }
}

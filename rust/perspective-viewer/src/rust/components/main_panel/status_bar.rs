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

mod global_filter_bar;
mod status_indicator;

use perspective_client::config::Filter;
use wasm_bindgen_futures::spawn_local;
use web_sys::*;
use yew::prelude::*;

use self::status_indicator::StatusIndicator;
use crate::components::main_panel::export_menus::copy_dropdown::CopyDropDownMenu;
use crate::components::main_panel::export_menus::export_dropdown::ExportDropDownMenu;
use crate::components::main_panel::status_bar::global_filter_bar::GlobalFilterBar;
use crate::components::style::StyleSurface;
use crate::config::*;
use crate::presentation::{Presentation, PresentationProps};
use crate::queries::WorkspaceStatus;
use crate::renderer::*;
use crate::session::*;
use crate::tasks::*;
use crate::ui::{PortalModal, Select, SelectItem};
use crate::utils::*;
use crate::workspace::Workspace;
use crate::*;

#[derive(Clone, Properties)]
pub struct StatusBarProps {
    // DOM Attribute
    pub id: String,

    /// Fired when the reset button is clicked.
    pub on_reset: Callback<bool>,

    /// Snapshots threaded from root.  Component reads `has_table`,
    /// `has_table_cells`, `error` from session_props; `selected_theme`,
    /// `available_themes` from presentation_props.
    pub session_props: SessionProps,

    /// The failure of the active panel's last draw.
    pub render_error: Option<RenderError>,
    pub presentation_props: PresentationProps,

    /// Derived from root: `settings_open && has_table_loaded`.  Used
    /// here to drive the title-input enabled state and the theme picker
    /// visibility.
    pub is_settings_open: bool,

    /// The element is an EMPTY STAGE (zero panels). Shows the theme picker
    /// without the data-bound actions (reset/export/copy/plugin extras).
    #[prop_or_default]
    pub is_empty: bool,

    /// Whether any `Client` is loaded — gates the "New" table menu.
    #[prop_or_default]
    pub has_clients: bool,

    /// The workspace's aggregate status, threaded to `StatusIndicator`. At
    /// zero panels this carries the element-level stage error.
    pub status: WorkspaceStatus,

    /// Whether this bar renders the `StatusIndicator`, which moves to the
    /// workspace panel's header while that panel is open.
    pub show_status: bool,

    /// Whether the workspace panel is open, which keeps this bar docked.
    #[prop_or_default]
    pub is_workspace_open: bool,

    /// Fired when the `StatusIndicator` is clicked.
    pub on_status_click: Callback<()>,

    /// Element-level global filters (fed by master/detail selection); rendered
    /// as removable chips between the row stats and the menu icons.
    pub global_filters: Vec<Filter>,

    /// Remove the global filter at this index (a chip's ×).
    pub on_remove_global_filter: Callback<usize>,

    /// Clear all global filters (the "Clear" affordance).
    pub on_clear_global_filters: Callback<()>,

    // State
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,

    /// The multi-panel model, so a theme change can restyle EVERY panel (not
    /// just the active one this status bar targets) — non-active panels that
    /// inherit the host theme otherwise render stale CSS until they redraw.
    pub workspace: Workspace,
}

impl PartialEq for StatusBarProps {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
            && self.session_props == other.session_props
            && self.presentation_props == other.presentation_props
            && self.is_settings_open == other.is_settings_open
            && self.is_empty == other.is_empty
            && self.has_clients == other.has_clients
            && self.status == other.status
            && self.show_status == other.show_status
            && self.is_workspace_open == other.is_workspace_open
            && self.global_filters == other.global_filters
    }
}

pub enum StatusBarMsg {
    Reset(MouseEvent),
    Export,
    Copy,
    CloseExport,
    CloseCopy,
    Eject,
    SetTheme(String),
    ResetTheme,
    PointerEvent(web_sys::PointerEvent),
}

/// A toolbar with buttons, and `Table` & `View` status information.
pub struct StatusBar {
    copy_ref: NodeRef,
    export_ref: NodeRef,
    statusbar_ref: NodeRef,
    copy_target: Option<HtmlElement>,
    export_target: Option<HtmlElement>,
}

impl Component for StatusBar {
    type Message = StatusBarMsg;
    type Properties = StatusBarProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            copy_ref: NodeRef::default(),
            export_ref: NodeRef::default(),
            statusbar_ref: NodeRef::default(),
            copy_target: None,
            export_target: None,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            StatusBarMsg::Reset(event) => {
                let all = event.shift_key();
                ctx.props().on_reset.emit(all);
                false
            },
            StatusBarMsg::ResetTheme => {
                update_theme(
                    &ctx.props().session,
                    &ctx.props().renderer,
                    &ctx.props().presentation,
                    &ctx.props().workspace,
                    None,
                );
                true
            },
            StatusBarMsg::SetTheme(theme_name) => {
                update_theme(
                    &ctx.props().session,
                    &ctx.props().renderer,
                    &ctx.props().presentation,
                    &ctx.props().workspace,
                    Some(theme_name),
                );
                false
            },
            StatusBarMsg::Export => {
                self.export_target = self.export_ref.cast::<HtmlElement>();
                true
            },
            StatusBarMsg::Copy => {
                self.copy_target = self.copy_ref.cast::<HtmlElement>();
                true
            },
            StatusBarMsg::CloseExport => {
                self.export_target = None;
                true
            },
            StatusBarMsg::CloseCopy => {
                self.copy_target = None;
                true
            },
            StatusBarMsg::Eject => {
                ctx.props().presentation.on_eject.emit(());
                false
            },
            StatusBarMsg::PointerEvent(event) => {
                if event.target().map(JsValue::from)
                    == self.statusbar_ref.cast::<HtmlElement>().map(JsValue::from)
                {
                    ctx.props().presentation.statusbar_pointer_event.emit(event);
                }

                false
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let Self::Properties {
            renderer, session, ..
        } = ctx.props();

        let has_table = ctx.props().session_props.has_table.clone();
        let is_empty = ctx.props().is_empty;
        let is_errored = ctx.props().session_props.is_errored()
            || ctx.props().render_error.is_some()
            // At zero panels `status` carries only the stage error.
            || (is_empty && ctx.props().status.error.is_some());
        let is_settings_open = ctx.props().is_settings_open;

        let mut is_updating_class_name = classes!();
        if !is_settings_open {
            is_updating_class_name.push("settings-closed");
        };

        if !matches!(has_table, Some(TableLoadState::Loaded)) {
            is_updating_class_name.push("updating");
        }

        if !ctx.props().show_status {
            is_updating_class_name.push("workspace-open");
        }

        // TODO Memoizing these would reduce some vdom diffing later on
        let onclose = left_click(ctx.link().callback(|_| StatusBarMsg::Eject));
        let onpointerdown = ctx.link().callback(StatusBarMsg::PointerEvent);
        let onexport = left_click(ctx.link().callback(|event: MouseEvent| {
            event.prevent_default();
            StatusBarMsg::Export
        }));

        let oncopy = left_click(ctx.link().callback(|event: MouseEvent| {
            event.prevent_default();
            StatusBarMsg::Copy
        }));

        let onreset = left_click(ctx.link().callback(StatusBarMsg::Reset));
        let extra_slot = ctx
            .props()
            .renderer
            .slot_name()
            .map(|id| format!("statusbar-extra-{id}"))
            .unwrap_or_else(|| "statusbar-extra".to_owned());

        let is_menu =
            !is_empty && matches!(has_table, Some(TableLoadState::Loaded)) && is_settings_open;

        let is_settings = is_empty
            || !matches!(has_table, Some(TableLoadState::Loaded))
            || is_errored
            || is_settings_open
            || ctx.props().is_workspace_open;

        let on_copy_select = {
            let props = ctx.props().clone();
            let link = ctx.link().clone();
            Callback::from(move |x: ExportFile| {
                let task = copy_method_to_clipboard(
                    &props.session,
                    &props.renderer,
                    &props.presentation,
                    &props.workspace,
                    x.method,
                );

                let link = link.clone();
                spawn_local(async move {
                    match task.await {
                        Ok(()) => link.send_message(StatusBarMsg::CloseCopy),
                        Err(e) => web_sys::console::warn_1(&e.into()),
                    }
                })
            })
        };

        let on_export_select = {
            let props = ctx.props().clone();
            let link = ctx.link().clone();
            Callback::from(move |x: ExportFile| {
                if !x.name.is_empty() {
                    clone!(props, link);
                    spawn_local(async move {
                        let val = export_method_to_blob(
                            &props.session,
                            &props.renderer,
                            &props.presentation,
                            &props.workspace,
                            x.method,
                        )
                        .await
                        .unwrap();
                        let is_chart = props.renderer.is_chart();
                        download(&x.as_filename(is_chart), &val).unwrap();
                        link.send_message(StatusBarMsg::CloseExport);
                    })
                }
            })
        };

        let on_close_copy = ctx.link().callback(|_| StatusBarMsg::CloseCopy);
        let on_close_export = ctx.link().callback(|_| StatusBarMsg::CloseExport);

        if is_settings {
            html! {
                <>
                    <div
                        ref={&self.statusbar_ref}
                        id={ctx.props().id.clone()}
                        class={is_updating_class_name}
                        {onpointerdown}
                    >
                        if ctx.props().show_status {
                            <StatusIndicator
                                status={ctx.props().status.clone()}
                                on_toggle={ctx.props().on_status_click.clone()}
                            />
                        }
                        if !ctx.props().global_filters.is_empty() {
                            <GlobalFilterBar
                                filters={ctx.props().global_filters.clone()}
                                on_remove={ctx.props().on_remove_global_filter.clone()}
                                on_clear={ctx.props().on_clear_global_filters.clone()}
                            />
                        }
                        <div id="spacer" />
                        if is_empty {
                            <div id="menu-bar" class="section">
                                <ThemeSelector
                                    theme={ctx.props().presentation_props.selected_theme.clone().or_else(|| {
                                        ctx.props().presentation_props.available_themes.first().cloned()
                                    })}
                                    themes={ctx.props().presentation_props.available_themes.clone()}
                                    on_change={ctx.link().callback(StatusBarMsg::SetTheme)}
                                    on_reset={ctx.link().callback(|_| StatusBarMsg::ResetTheme)}
                                />
                            </div>
                        }
                        if is_menu {
                            <div id="menu-bar" class="section">
                                <ThemeSelector
                                    theme={ctx.props().presentation_props.selected_theme.clone()}
                                    themes={ctx.props().presentation_props.available_themes.clone()}
                                    on_change={ctx.link().callback(StatusBarMsg::SetTheme)}
                                    on_reset={ctx.link().callback(|_| StatusBarMsg::ResetTheme)}
                                />
                                <div id="plugin-settings"><slot name={extra_slot} /></div>
                                <span
                                    class={classes!("hover-target", is_errored.then_some("disabled"))}
                                >
                                    <span
                                        id="reset"
                                        class="button"
                                        onmousedown={(!is_errored).then_some(onreset)}
                                    >
                                        <span class="icon shift-alt-icon" />
                                        <span class="icon-label" />
                                    </span>
                                </span>
                                <span
                                    ref={&self.export_ref}
                                    class={classes!("hover-target", is_errored.then_some("disabled"))}
                                    onmousedown={(!is_errored).then_some(onexport)}
                                >
                                    <span id="export" class="button">
                                        <span class="icon" />
                                        <span class="icon-label" />
                                    </span>
                                </span>
                                <span
                                    ref={&self.copy_ref}
                                    class={classes!("hover-target", is_errored.then_some("disabled"))}
                                    onmousedown={(!is_errored).then_some(oncopy)}
                                >
                                    <span id="copy" class="button">
                                        <span class="icon" />
                                        <span class="icon-label" />
                                    </span>
                                </span>
                            </div>
                        }
                        if !is_settings_open {
                            <div id="close_button" class="noselect" onmousedown={onclose}>
                                <span class="icon" />
                            </div>
                        }
                    </div>
                    <PortalModal
                        tag_name="perspective-copy-menu"
                        sheet={StyleSurface::DropdownMenu.sheet()}
                        target={self.copy_target.clone()}
                        own_focus=true
                        on_close={on_close_copy}
                        theme={ctx.props().presentation_props.selected_theme.clone().unwrap_or_default()}
                    >
                        <CopyDropDownMenu renderer={renderer.clone()} callback={on_copy_select} />
                    </PortalModal>
                    <PortalModal
                        tag_name="perspective-export-menu"
                        sheet={StyleSurface::DropdownMenu.sheet()}
                        target={self.export_target.clone()}
                        own_focus=true
                        on_close={on_close_export}
                        theme={ctx.props().presentation_props.selected_theme.clone().unwrap_or_default()}
                    >
                        <ExportDropDownMenu
                            renderer={renderer.clone()}
                            session={session.clone()}
                            callback={on_export_select}
                        />
                    </PortalModal>
                </>
            }
        } else {
            // Settings closed + loaded: no docked status bar. The open-settings
            // affordance lives on the `PanelTab`s; only the (default-hidden)
            // eject button floats here.
            let class = classes!(is_updating_class_name, "floating");
            html! {
                <div id={ctx.props().id.clone()} {class}>
                    <div id="close_button" class="noselect" onmousedown={&onclose} />
                </div>
            }
        }
    }
}

#[derive(Properties, PartialEq)]
struct ThemeSelectorProps {
    pub theme: Option<String>,
    pub themes: PtrEqRc<Vec<String>>,
    pub on_reset: Callback<()>,
    pub on_change: Callback<String>,
}

#[function_component]
fn ThemeSelector(props: &ThemeSelectorProps) -> Html {
    let is_first = props
        .theme
        .as_ref()
        .and_then(|x| props.themes.first().map(|y| y == x))
        .unwrap_or_default();

    let values = use_memo(props.themes.clone(), |themes| {
        themes
            .iter()
            .cloned()
            .map(SelectItem::Option)
            .collect::<Vec<_>>()
    });

    match &props.theme {
        None => html! {},
        Some(selected) => {
            html! {
                if values.len() > 1 {
                    <span class="hover-target">
                        <div
                            id="theme_icon"
                            class={if is_first {""} else {"modified"}}
                            tabindex="0"
                            onclick={props.on_reset.reform(|_| ())}
                        />
                        <span id="theme" class="button">
                            <span class="icon" />
                            <Select<String>
                                id="theme_selector"
                                {values}
                                selected={selected.to_owned()}
                                on_select={props.on_change.clone()}
                            />
                        </span>
                    </span>
                }
            }
        },
    }
}

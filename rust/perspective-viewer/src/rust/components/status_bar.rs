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

use perspective_client::config::Filter;
use wasm_bindgen_futures::spawn_local;
use web_sys::*;
use yew::prelude::*;

use super::status_indicator::StatusIndicator;
use crate::components::copy_dropdown::CopyDropDownMenu;
use crate::components::export_dropdown::ExportDropDownMenu;
use crate::components::global_filter_bar::GlobalFilterBar;
use crate::components::new_panel_menu::{HostedTables, NewPanelMenu, NewPanelPick, PanelLabels};
use crate::components::style::StyleSurface;
use crate::config::*;
use crate::js::*;
use crate::presentation::{Presentation, PresentationProps};
use crate::queries::fetch_hosted_tables;
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

    /// The left-anchored "New" action, fired with the [`NewPanelMenu`] pick.
    pub on_new_panel: Callback<NewPanelPick>,

    /// Snapshots threaded from root.  Component reads `has_table`,
    /// `has_table_cells`, `error` from session_props; `selected_theme`,
    /// `available_themes` from presentation_props.
    pub session_props: SessionProps,
    pub presentation_props: PresentationProps,

    /// Derived from root: `settings_open && has_table_loaded`.  Used
    /// here to drive the title-input enabled state and the theme picker
    /// visibility.
    pub is_settings_open: bool,

    /// In-flight render counter, threaded to `StatusIndicator`.
    pub update_count: u32,

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
            && self.update_count == other.update_count
            && self.global_filters == other.global_filters
    }
}

pub enum StatusBarMsg {
    Reset(MouseEvent),

    /// The "New" button: fetch the hosted-table listing, then open the
    /// dropdown.
    NewPanel,

    /// The listing resolved: open the dropdown anchored at the button, if
    /// the generation is still the newest.
    OpenNewPanel(u32, HostedTables),
    CloseNewPanel,

    /// A pick in the "New" dropdown.
    NewPanelPick(NewPanelPick),
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
    new_ref: NodeRef,
    statusbar_ref: NodeRef,
    copy_target: Option<HtmlElement>,
    export_target: Option<HtmlElement>,

    /// The "New" dropdown's anchor and listings while it is open.
    new_menu: Option<(HtmlElement, HostedTables, PanelLabels)>,

    /// Bumped per "New" click; a resolving fetch opens only if it is still
    /// the newest one.
    new_generation: u32,
}

impl Component for StatusBar {
    type Message = StatusBarMsg;
    type Properties = StatusBarProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            copy_ref: NodeRef::default(),
            export_ref: NodeRef::default(),
            new_ref: NodeRef::default(),
            statusbar_ref: NodeRef::default(),
            copy_target: None,
            export_target: None,
            new_menu: None,
            new_generation: 0,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            StatusBarMsg::Reset(event) => {
                let all = event.shift_key();
                ctx.props().on_reset.emit(all);
                false
            },
            StatusBarMsg::NewPanel => {
                self.new_generation = self.new_generation.wrapping_add(1);
                let generation = self.new_generation;
                let workspace = ctx.props().workspace.clone();
                let link = ctx.link().clone();
                ApiFuture::spawn(async move {
                    let tables = fetch_hosted_tables(&workspace).await;
                    link.send_message(StatusBarMsg::OpenNewPanel(generation, Rc::new(tables)));
                    Ok(())
                });

                false
            },
            StatusBarMsg::OpenNewPanel(generation, tables) => {
                if generation != self.new_generation {
                    return false;
                }

                match self.new_ref.cast::<HtmlElement>() {
                    Some(target) => {
                        let workspace = &ctx.props().workspace;
                        let panels = Rc::new(
                            workspace
                                .panel_ids()
                                .into_iter()
                                .filter_map(|id| {
                                    let panel = workspace.panel(&id)?;
                                    let title = panel.session.get_title().filter(|t| !t.is_empty());
                                    Some((id.as_str().to_owned(), title))
                                })
                                .collect::<Vec<_>>(),
                        );

                        self.new_menu = Some((target, tables, panels));
                        true
                    },
                    None => false,
                }
            },
            StatusBarMsg::CloseNewPanel => {
                self.new_menu = None;
                true
            },
            StatusBarMsg::NewPanelPick(pick) => {
                ctx.props().on_new_panel.emit(pick);
                self.new_menu = None;
                true
            },
            StatusBarMsg::ResetTheme => {
                update_theme(
                    &ctx.props().renderer,
                    &ctx.props().presentation,
                    &ctx.props().workspace,
                    None,
                );
                true
            },
            StatusBarMsg::SetTheme(theme_name) => {
                update_theme(
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
        let is_errored = ctx.props().session_props.is_errored();
        let is_settings_open = ctx.props().is_settings_open;

        let mut is_updating_class_name = classes!();
        if !is_settings_open {
            is_updating_class_name.push("settings-closed");
        };

        if !matches!(has_table, Some(TableLoadState::Loaded)) {
            is_updating_class_name.push("updating");
        }

        // TODO Memoizing these would reduce some vdom diffing later on
        let onclose = ctx.link().callback(|_| StatusBarMsg::Eject);
        let onpointerdown = ctx.link().callback(StatusBarMsg::PointerEvent);
        let onexport = ctx.link().callback(|event: MouseEvent| {
            event.prevent_default();
            StatusBarMsg::Export
        });
        let oncopy = ctx.link().callback(|event: MouseEvent| {
            event.prevent_default();
            StatusBarMsg::Copy
        });
        let onreset = ctx.link().callback(StatusBarMsg::Reset);
        let onnew = ctx.link().callback(|event: MouseEvent| {
            event.prevent_default();
            StatusBarMsg::NewPanel
        });
        let on_new_select = ctx.link().callback(StatusBarMsg::NewPanelPick);
        let on_close_new = ctx.link().callback(|_| StatusBarMsg::CloseNewPanel);

        // Project only the *active* panel's plugin toolbar into the shared status
        // bar. Each panel's toolbar slots into `statusbar-extra-{its-panel-id}`
        // (see datagrid `toolbar.ts`); the active panel's id comes from the
        // active renderer this status bar is bound to.
        let extra_slot = ctx
            .props()
            .renderer
            .slot_name()
            .map(|id| format!("statusbar-extra-{id}"))
            .unwrap_or_else(|| "statusbar-extra".to_owned());
        let is_menu = matches!(has_table, Some(TableLoadState::Loaded)) && is_settings_open;
        let is_panel_bar = !ctx.props().workspace.clients().is_empty();
        let is_settings =
            !matches!(has_table, Some(TableLoadState::Loaded)) || is_errored || is_settings_open;

        let on_copy_select = {
            let props = ctx.props().clone();
            let link = ctx.link().clone();
            Callback::from(move |x: ExportFile| {
                let props = props.clone();
                let link = link.clone();
                spawn_local(async move {
                    let mime = x.method.mimetype(x.is_chart);
                    let task = export_method_to_blob(
                        &props.session,
                        &props.renderer,
                        &props.presentation,
                        x.method,
                    );
                    let result = copy_to_clipboard(task, mime).await;
                    let r = (|| -> ApiResult<()> {
                        result?;
                        link.send_message(StatusBarMsg::CloseCopy);
                        Ok(())
                    })();
                    if let Err(e) = r {
                        web_sys::console::warn_1(&e.into());
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
                        <StatusIndicator
                            {renderer}
                            {session}
                            update_count={ctx.props().update_count}
                            session_props={ctx.props().session_props.clone()}
                        />
                        if is_panel_bar {
                            <div id="panel-bar" class="section">
                                <span ref={&self.new_ref} class="hover-target" onmousedown={onnew}>
                                    <span id="new_panel" class="button">
                                        <span class="icon" />
                                        <span class="icon-label" />
                                    </span>
                                </span>
                            </div>
                        }
                        if !ctx.props().global_filters.is_empty() {
                            <GlobalFilterBar
                                filters={ctx.props().global_filters.clone()}
                                on_remove={ctx.props().on_remove_global_filter.clone()}
                                on_clear={ctx.props().on_clear_global_filters.clone()}
                            />
                        }
                        <div id="spacer" />
                        if is_menu {
                            <div id="menu-bar" class="section">
                                <ThemeSelector
                                    theme={ctx.props().presentation_props.selected_theme.clone()}
                                    themes={ctx.props().presentation_props.available_themes.clone()}
                                    on_change={ctx.link().callback(StatusBarMsg::SetTheme)}
                                    on_reset={ctx.link().callback(|_| StatusBarMsg::ResetTheme)}
                                />
                                <div id="plugin-settings"><slot name={extra_slot} /></div>
                                <span class="hover-target">
                                    <span id="reset" class="button" onmousedown={&onreset}>
                                        <span class="icon shift-alt-icon" />
                                        <span class="icon-label" />
                                    </span>
                                </span>
                                <span
                                    ref={&self.export_ref}
                                    class="hover-target"
                                    onmousedown={onexport}
                                >
                                    <span id="export" class="button">
                                        <span class="icon" />
                                        <span class="icon-label" />
                                    </span>
                                </span>
                                <span
                                    ref={&self.copy_ref}
                                    class="hover-target"
                                    onmousedown={oncopy}
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
                        tag_name="perspective-new-panel-menu"
                        sheet={StyleSurface::DropdownMenu.sheet()}
                        target={self.new_menu.as_ref().map(|(target, ..)| target.clone())}
                        own_focus=true
                        on_close={on_close_new}
                        theme={ctx.props().presentation_props.selected_theme.clone().unwrap_or_default()}
                    >
                        if let Some((_, tables, panels)) = &self.new_menu {
                            <NewPanelMenu
                                tables={Some(tables.clone())}
                                panels={panels.clone()}
                                callback={on_new_select}
                            />
                        }
                    </PortalModal>
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

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

use wasm_bindgen_futures::spawn_local;
use web_sys::*;
use yew::prelude::*;

use super::status_indicator::StatusIndicator;
use super::style::LocalStyle;
use crate::components::containers::select::*;
use crate::components::copy_dropdown::CopyDropDownMenu;
use crate::components::export_dropdown::ExportDropDownMenu;
use crate::components::portal::PortalModal;
use crate::components::status_bar_counter::StatusBarRowsCounter;
use crate::config::*;
use crate::js::*;
use crate::presentation::{Presentation, PresentationProps};
use crate::renderer::*;
use crate::session::*;
use crate::tasks::*;
use crate::utils::*;
use crate::*;

#[derive(Clone, Properties)]
pub struct StatusBarProps {
    // DOM Attribute
    pub id: String,

    /// Fired when the reset button is clicked.
    pub on_reset: Callback<bool>,

    /// Fires when the settings button is clicked
    #[prop_or_default]
    pub on_settings: Option<Callback<()>>,

    /// Snapshots threaded from root.  Component reads `has_table`, `stats`,
    /// `error`, `title` from session_props; `selected_theme`,
    /// `available_themes`, `is_workspace` from presentation_props.
    pub session_props: SessionProps,
    pub presentation_props: PresentationProps,

    /// Derived from root: `settings_open && has_table_loaded`.  Used
    /// here to drive the title-input enabled state and the theme picker
    /// visibility.
    pub is_settings_open: bool,

    /// In-flight render counter, threaded to `StatusIndicator`.
    pub update_count: u32,

    // State
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
}

impl PartialEq for StatusBarProps {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
            && self.session_props == other.session_props
            && self.presentation_props == other.presentation_props
            && self.is_settings_open == other.is_settings_open
            && self.update_count == other.update_count
    }
}

pub enum StatusBarMsg {
    Reset(MouseEvent),
    Export,
    Copy,
    CloseExport,
    CloseCopy,
    Noop,
    Eject,
    SetTheme(String),
    ResetTheme,
    PointerEvent(web_sys::PointerEvent),
    TitleInputEvent,
    TitleChangeEvent,
}

/// A toolbar with buttons, and `Table` & `View` status information.
pub struct StatusBar {
    copy_ref: NodeRef,
    export_ref: NodeRef,
    input_ref: NodeRef,
    statusbar_ref: NodeRef,
    /// Local title tracks the live `<input>` value before the user commits the
    /// change (blur / Enter).  Reset to the prop value whenever the prop
    /// changes.
    title: Option<String>,
    copy_target: Option<HtmlElement>,
    export_target: Option<HtmlElement>,
}

impl Component for StatusBar {
    type Message = StatusBarMsg;
    type Properties = StatusBarProps;

    fn create(ctx: &Context<Self>) -> Self {
        Self {
            copy_ref: NodeRef::default(),
            export_ref: NodeRef::default(),
            input_ref: NodeRef::default(),
            statusbar_ref: NodeRef::default(),
            title: ctx.props().session_props.title.clone(),
            copy_target: None,
            export_target: None,
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, old_props: &Self::Properties) -> bool {
        // Keep the local title in sync with the prop whenever the session title
        // changes externally (e.g. restore() call) or the settings panel opens /
        // closes (which resets the input element).
        if ctx.props().session_props.title != old_props.session_props.title
            || ctx.props().is_settings_open != old_props.is_settings_open
        {
            self.title = ctx.props().session_props.title.clone();
        }
        true
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        let r: ApiResult<bool> = (|| {
            Ok(match msg {
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
                        None,
                    );
                    true
                },
                StatusBarMsg::SetTheme(theme_name) => {
                    update_theme(
                        &ctx.props().session,
                        &ctx.props().renderer,
                        &ctx.props().presentation,
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
                StatusBarMsg::Noop => {
                    self.title = ctx.props().session_props.title.clone();
                    true
                },
                StatusBarMsg::TitleInputEvent => {
                    let elem = self.input_ref.cast::<HtmlInputElement>().into_apierror()?;
                    let title = elem.value();
                    let title = if title.trim().is_empty() {
                        None
                    } else {
                        Some(title)
                    };

                    self.title = title;
                    true
                },
                StatusBarMsg::TitleChangeEvent => {
                    let elem = self.input_ref.cast::<HtmlInputElement>().into_apierror()?;
                    let title = elem.value();
                    let title = if title.trim().is_empty() {
                        None
                    } else {
                        Some(title)
                    };

                    ctx.props().session.set_title(title);
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
            })
        })();
        r.unwrap_or_else(|e| {
            web_sys::console::warn_1(&e.into());
            Default::default()
        })
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let Self::Properties {
            presentation,
            renderer,
            session,
            ..
        } = ctx.props();

        let has_table = ctx.props().session_props.has_table.clone();
        let is_errored = ctx.props().session_props.is_errored();
        let is_settings_open = ctx.props().is_settings_open;
        let title = &ctx.props().session_props.title;

        let mut is_updating_class_name = classes!();
        if title.is_some() {
            is_updating_class_name.push("titled");
        };

        if !is_settings_open {
            is_updating_class_name.push(["settings-closed", "titled"]);
        };

        if !matches!(has_table, Some(TableLoadState::Loaded)) {
            is_updating_class_name.push("updating");
        }

        // TODO Memoizing these would reduce some vdom diffing later on
        let onblur = ctx.link().callback(|_| StatusBarMsg::Noop);
        let onclose = ctx.link().callback(|_| StatusBarMsg::Eject);
        let onpointerdown = ctx.link().callback(StatusBarMsg::PointerEvent);
        let onexport = ctx.link().callback(|_: MouseEvent| StatusBarMsg::Export);
        let oncopy = ctx.link().callback(|_: MouseEvent| StatusBarMsg::Copy);
        let onreset = ctx.link().callback(StatusBarMsg::Reset);
        let onchange = ctx
            .link()
            .callback(|_: Event| StatusBarMsg::TitleChangeEvent);

        let oninput = ctx
            .link()
            .callback(|_: InputEvent| StatusBarMsg::TitleInputEvent);

        let is_menu = matches!(has_table, Some(TableLoadState::Loaded))
            && ctx.props().on_settings.as_ref().is_none();
        let is_title = is_menu
            || ctx.props().presentation_props.is_workspace
            || title.is_some()
            || is_errored
            || presentation.is_active(&self.input_ref.cast::<Element>());

        let is_settings = title.is_some()
            || ctx.props().presentation_props.is_workspace
            || !matches!(has_table, Some(TableLoadState::Loaded))
            || is_errored
            || is_settings_open
            || presentation.is_active(&self.input_ref.cast::<Element>());

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
                    <LocalStyle href={css!("status-bar")} />
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
                        if is_title {
                            <label
                                class="input-sizer"
                                data-value={self.title.clone().unwrap_or_default()}
                            >
                                <input
                                    ref={&self.input_ref}
                                    placeholder=""
                                    value={self.title.clone().unwrap_or_default()}
                                    size="10"
                                    {onblur}
                                    {onchange}
                                    {oninput}
                                />
                                <span id="status-bar-placeholder" />
                            </label>
                        }
                        if is_title {
                            <StatusBarRowsCounter stats={ctx.props().session_props.stats.clone()} />
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
                                <div id="plugin-settings"><slot name="statusbar-extra" /></div>
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
                        if let Some(x) = ctx.props().on_settings.as_ref() {
                            <div
                                id="settings_button"
                                class="noselect"
                                onmousedown={x.reform(|_| ())}
                            >
                                <span class="icon" />
                            </div>
                            <div id="close_button" class="noselect" onmousedown={onclose}>
                                <span class="icon" />
                            </div>
                        }
                    </div>
                    <PortalModal
                        tag_name="perspective-copy-menu"
                        target={self.copy_target.clone()}
                        own_focus=true
                        on_close={on_close_copy}
                        theme={ctx.props().presentation_props.selected_theme.clone().unwrap_or_default()}
                    >
                        <CopyDropDownMenu renderer={renderer.clone()} callback={on_copy_select} />
                    </PortalModal>
                    <PortalModal
                        tag_name="perspective-export-menu"
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
        } else if let Some(x) = ctx.props().on_settings.as_ref() {
            let class = classes!(is_updating_class_name, "floating");
            html! {
                <div id={ctx.props().id.clone()} {class}>
                    <div id="settings_button" class="noselect" onmousedown={x.reform(|_| ())}>
                        <span class="icon" />
                    </div>
                    <div id="close_button" class="noselect" onmousedown={&onclose} />
                </div>
            }
        } else {
            html! {}
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
                                class="invert"
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

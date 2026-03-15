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

use web_sys::*;
use yew::prelude::*;

use super::status_indicator::StatusIndicator;
use super::style::LocalStyle;
use crate::components::containers::select::*;
use crate::components::status_bar_counter::StatusBarRowsCounter;
use crate::custom_elements::copy_dropdown::*;
use crate::custom_elements::export_dropdown::*;
use crate::custom_events::CustomEvents;
use crate::tasks::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::*;
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

    // Value props threaded from the root's `SessionProps`.
    // Using these avoids PubSub subscriptions for table_loaded / table_errored.
    pub has_table: bool,
    pub is_errored: bool,
    pub stats: Option<ViewStats>,
    /// In-flight render counter and full error, threaded to `StatusIndicator`.
    pub update_count: u32,
    pub error: Option<TableErrorState>,
    /// Title string from session — threaded to avoid title_changed subscription.
    pub title: Option<String>,
    /// Theme state from presentation — threaded to avoid theme_config_updated /
    /// visibility_changed subscriptions.
    pub is_settings_open: bool,
    pub selected_theme: Option<String>,
    pub available_themes: Rc<Vec<String>>,
    /// Whether this viewer is hosted inside a `<perspective-workspace>`.
    pub is_workspace: bool,

    // State
    pub custom_events: CustomEvents,
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
}

impl PartialEq for StatusBarProps {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
            && self.has_table == other.has_table
            && self.is_errored == other.is_errored
            && self.stats == other.stats
            && self.update_count == other.update_count
            && self.error == other.error
            && self.title == other.title
            && self.is_settings_open == other.is_settings_open
            && self.selected_theme == other.selected_theme
            && self.available_themes == other.available_themes
            && self.is_workspace == other.is_workspace
    }
}

impl HasCustomEvents for StatusBarProps {
    fn custom_events(&self) -> &CustomEvents {
        &self.custom_events
    }
}

impl HasPresentation for StatusBarProps {
    fn presentation(&self) -> &Presentation {
        &self.presentation
    }
}

impl HasRenderer for StatusBarProps {
    fn renderer(&self) -> &Renderer {
        &self.renderer
    }
}

impl HasSession for StatusBarProps {
    fn session(&self) -> &Session {
        &self.session
    }
}

impl StateProvider for StatusBarProps {
    type State = StatusBarProps;
    fn clone_state(&self) -> Self::State {
        self.clone()
    }
}

pub enum StatusBarMsg {
    Reset(MouseEvent),
    Export,
    Copy,
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
    /// change (blur / Enter).  Reset to the prop value whenever the prop changes.
    title: Option<String>,
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
            title: ctx.props().title.clone(),
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, old_props: &Self::Properties) -> bool {
        // Keep the local title in sync with the prop whenever the session title
        // changes externally (e.g. restore() call) or the settings panel opens /
        // closes (which resets the input element).
        if ctx.props().title != old_props.title
            || ctx.props().is_settings_open != old_props.is_settings_open
        {
            self.title = ctx.props().title.clone();
        }
        true
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        maybe_log_or_default!(Ok(match msg {
            StatusBarMsg::Reset(event) => {
                let all = event.shift_key();
                ctx.props().on_reset.emit(all);
                false
            },
            StatusBarMsg::ResetTheme => {
                let presentation = ctx.props().presentation.clone();
                let session = ctx.props().session.clone();
                let renderer = ctx.props().renderer.clone();
                ApiFuture::spawn(async move {
                    presentation.reset_theme().await?;
                    let view = session.get_view().into_apierror()?;
                    renderer.restyle_all(&view).await
                });
                true
            },
            StatusBarMsg::SetTheme(theme_name) => {
                let presentation = ctx.props().presentation.clone();
                let session = ctx.props().session.clone();
                let renderer = ctx.props().renderer.clone();
                ApiFuture::spawn(async move {
                    presentation.set_theme_name(Some(&theme_name)).await?;
                    let view = session.get_view().into_apierror()?;
                    renderer.restyle_all(&view).await
                });

                false
            },
            StatusBarMsg::Export => {
                let target = self.export_ref.cast::<HtmlElement>().into_apierror()?;
                ExportDropDownMenuElement::new_from_model(ctx.props()).open(target);
                false
            },
            StatusBarMsg::Copy => {
                let target = self.copy_ref.cast::<HtmlElement>().into_apierror()?;
                CopyDropDownMenuElement::new_from_model(ctx.props()).open(target);
                false
            },
            StatusBarMsg::Eject => {
                ctx.props().presentation().on_eject.emit(());
                false
            },
            StatusBarMsg::Noop => {
                self.title = ctx.props().title.clone();
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

                ctx.props().session().set_title(title);
                false
            },
            StatusBarMsg::PointerEvent(event) => {
                if event.target().map(JsValue::from)
                    == self.statusbar_ref.cast::<HtmlElement>().map(JsValue::from)
                {
                    ctx.props()
                        .custom_events()
                        .dispatch_event(format!("statusbar-{}", event.type_()).as_str(), &event)?;
                }

                false
            },
        }))
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let Self::Properties {
            custom_events,
            presentation,
            renderer,
            session,
            ..
        } = ctx.props();

        let has_table = ctx.props().has_table;
        let is_errored = ctx.props().is_errored;
        let is_settings_open = ctx.props().is_settings_open;
        let title = &ctx.props().title;

        let mut is_updating_class_name = classes!();
        if title.is_some() {
            is_updating_class_name.push("titled");
        };

        if !is_settings_open {
            is_updating_class_name.push(["settings-closed", "titled"]);
        };

        if !has_table {
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

        let is_menu = has_table && ctx.props().on_settings.as_ref().is_none();
        let is_title = is_menu
            || ctx.props().is_workspace
            || title.is_some()
            || is_errored
            || presentation.is_active(&self.input_ref.cast::<Element>());

        let is_settings = title.is_some()
            || ctx.props().is_workspace
            || !has_table
            || is_errored
            || is_settings_open
            || presentation.is_active(&self.input_ref.cast::<Element>());

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
                            {custom_events}
                            {renderer}
                            {session}
                            update_count={ctx.props().update_count}
                            error={ctx.props().error.clone()}
                            has_table={ctx.props().has_table}
                            stats={ctx.props().stats.clone()}
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
                            <StatusBarRowsCounter stats={ctx.props().stats.clone()} />
                        }
                        <div id="spacer" />
                        if is_menu {
                            <div id="menu-bar" class="section">
                                <ThemeSelector
                                    theme={ctx.props().selected_theme.clone()}
                                    themes={ctx.props().available_themes.clone()}
                                    on_change={ctx.link().callback(StatusBarMsg::SetTheme)}
                                    on_reset={ctx.link().callback(|_| StatusBarMsg::ResetTheme)}
                                />
                                <div id="plugin-settings"><slot name="statusbar-extra" /></div>
                                <span class="hover-target">
                                    <span id="reset" class="button" onmousedown={&onreset}>
                                        <span />
                                    </span>
                                </span>
                                <span
                                    ref={&self.export_ref}
                                    class="hover-target"
                                    onmousedown={onexport}
                                >
                                    <span id="export" class="button"><span /></span>
                                </span>
                                <span
                                    ref={&self.copy_ref}
                                    class="hover-target"
                                    onmousedown={oncopy}
                                >
                                    <span id="copy" class="button"><span /></span>
                                </span>
                            </div>
                        }
                        if let Some(x) = ctx.props().on_settings.as_ref() {
                            <div
                                id="settings_button"
                                class="noselect"
                                onmousedown={x.reform(|_| ())}
                            />
                            <div id="close_button" class="noselect" onmousedown={onclose} />
                        }
                    </div>
                </>
            }
        } else if let Some(x) = ctx.props().on_settings.as_ref() {
            let class = classes!(is_updating_class_name, "floating");
            html! {
                <div id={ctx.props().id.clone()} {class}>
                    <div id="settings_button" class="noselect" onmousedown={x.reform(|_| ())} />
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
    pub themes: Rc<Vec<String>>,
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

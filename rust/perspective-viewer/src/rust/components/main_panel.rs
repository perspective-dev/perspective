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

use perspective_js::utils::*;
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::render_warning::RenderWarning;
use super::status_bar::StatusBar;
use crate::custom_events::CustomEvents;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::{Session, TableErrorState, ViewStats};

use std::rc::Rc;
use crate::utils::*;

#[derive(Clone, Properties)]
pub struct MainPanelProps {
    pub on_settings: Callback<()>,

    /// Reset callback forwarded from the root component.  Fired when the user
    /// clicks the reset button; `bool` is `true` for a full reset (expressions
    /// + column configs), `false` for config-only.
    pub on_reset: Callback<bool>,

    /// Render-limit dimensions forwarded from the root's `RendererProps`.
    /// `Some` when the active plugin is capping the rendered row/column count;
    /// `None` when no limits are active (e.g. after a plugin change).
    pub render_limits: Option<(usize, usize, Option<usize>, Option<usize>)>,

    /// Value props from root's `SessionProps`, threaded to `StatusBar` / `StatusIndicator`.
    pub has_table: bool,
    pub is_errored: bool,
    pub stats: Option<ViewStats>,
    pub update_count: u32,
    pub error: Option<TableErrorState>,
    pub title: Option<String>,

    /// Value props from root's `PresentationProps`, threaded to `StatusBar`.
    pub is_settings_open: bool,
    pub selected_theme: Option<String>,
    pub available_themes: Rc<Vec<String>>,
    pub is_workspace: bool,

    /// State
    pub custom_events: CustomEvents,
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
}

impl PartialEq for MainPanelProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.has_table == rhs.has_table
            && self.is_errored == rhs.is_errored
            && self.stats == rhs.stats
            && self.update_count == rhs.update_count
            && self.error == rhs.error
            && self.title == rhs.title
            && self.is_settings_open == rhs.is_settings_open
            && self.selected_theme == rhs.selected_theme
            && self.available_themes == rhs.available_themes
            && self.is_workspace == rhs.is_workspace
            && self.render_limits == rhs.render_limits
    }
}

impl MainPanelProps {
    fn is_title(&self) -> bool {
        self.title.is_some()
    }
}

#[derive(Debug)]
pub enum MainPanelMsg {
    PointerEvent(web_sys::PointerEvent),
}

pub struct MainPanel {
    main_panel_ref: NodeRef,
}

impl Component for MainPanel {
    type Message = MainPanelMsg;
    type Properties = MainPanelProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            main_panel_ref: NodeRef::default(),
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            MainPanelMsg::PointerEvent(event) => {
                if event.target().map(JsValue::from)
                    == self
                        .main_panel_ref
                        .cast::<web_sys::HtmlElement>()
                        .map(JsValue::from)
                {
                    ctx.props()
                        .custom_events
                        .dispatch_event(format!("statusbar-{}", event.type_()).as_str(), &event)
                        .unwrap();
                }

                false
            },
        }
    }

    fn changed(&mut self, _ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        true
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let Self::Properties {
            custom_events,
            presentation,
            renderer,
            session,
            ..
        } = ctx.props();

        let is_settings_open = ctx.props().is_settings_open && ctx.props().has_table;

        let on_settings = (!is_settings_open).then(|| ctx.props().on_settings.clone());

        let mut class = classes!();
        if !is_settings_open {
            class.push("settings-closed");
        }

        if ctx.props().is_title() {
            class.push("titled");
        }

        let pointerdown = ctx.link().callback(MainPanelMsg::PointerEvent);
        let on_dismiss_warning = {
            clone!(renderer, session);
            Callback::from(move |_: ()| {
                clone!(renderer, session);
                ApiFuture::spawn(async move {
                    renderer.disable_active_plugin_render_warning();
                    let view_task = session.get_view();
                    renderer.update(view_task).await
                });
            })
        };
        html! {
            <div id="main_column">
                <StatusBar
                    id="status_bar"
                    {on_settings}
                    on_reset={ctx.props().on_reset.clone()}
                    has_table={ctx.props().has_table}
                    is_errored={ctx.props().is_errored}
                    stats={ctx.props().stats.clone()}
                    update_count={ctx.props().update_count}
                    error={ctx.props().error.clone()}
                    title={ctx.props().title.clone()}
                    is_settings_open={ctx.props().is_settings_open}
                    selected_theme={ctx.props().selected_theme.clone()}
                    available_themes={ctx.props().available_themes.clone()}
                    is_workspace={ctx.props().is_workspace}
                    {custom_events}
                    {presentation}
                    {renderer}
                    {session}
                />
                <div
                    id="main_panel_container"
                    ref={self.main_panel_ref.clone()}
                    {class}
                    onpointerdown={pointerdown}
                >
                    <RenderWarning
                        on_dismiss={on_dismiss_warning}
                        dimensions={ctx.props().render_limits}
                    />
                    <slot />
                </div>
            </div>
        }
    }

    fn destroy(&mut self, _ctx: &Context<Self>) {}
}

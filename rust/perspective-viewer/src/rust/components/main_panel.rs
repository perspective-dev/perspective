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

use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::render_warning::RenderWarning;
use super::status_bar::StatusBar;
use crate::presentation::{Presentation, PresentationProps};
use crate::renderer::*;
use crate::session::{Session, SessionProps};
use crate::tasks::dismiss_render_warning_callback;

#[derive(Clone, Properties)]
pub struct MainPanelProps {
    pub on_settings: Callback<()>,

    /// Reset callback forwarded from the root component.  Fired when the user
    /// clicks the reset button; `bool` is `true` for a full reset (expressions
    /// + column configs), `false` for config-only.
    pub on_reset: Callback<bool>,

    /// Snapshots threaded from root.  Read for `has_table`, `title` here in
    /// the panel itself; threaded wholesale to `StatusBar`/`StatusIndicator`.
    pub session_props: SessionProps,
    pub renderer_props: RendererProps,
    pub presentation_props: PresentationProps,

    /// Derived from root: `settings_open && has_table_loaded`.
    pub is_settings_open: bool,

    /// Root-managed in-flight render counter (not engine state).
    pub update_count: u32,

    /// State
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
}

impl PartialEq for MainPanelProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.session_props == rhs.session_props
            && self.renderer_props == rhs.renderer_props
            && self.presentation_props == rhs.presentation_props
            && self.is_settings_open == rhs.is_settings_open
            && self.update_count == rhs.update_count
    }
}

impl MainPanelProps {
    fn is_title(&self) -> bool {
        self.session_props.title.is_some()
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
                    ctx.props().presentation.statusbar_pointer_event.emit(event);
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
            presentation,
            renderer,
            session,
            ..
        } = ctx.props();

        let is_settings_open = ctx.props().is_settings_open;
        let on_settings = (!is_settings_open).then(|| ctx.props().on_settings.clone());

        let mut class = classes!();
        if !is_settings_open {
            class.push("settings-closed");
        }

        if ctx.props().is_title() {
            class.push("titled");
        }

        let pointerdown = ctx.link().callback(MainPanelMsg::PointerEvent);
        let on_dismiss_warning = dismiss_render_warning_callback(session, renderer);

        html! {
            <div id="main_column">
                <StatusBar
                    id="status_bar"
                    {on_settings}
                    on_reset={ctx.props().on_reset.clone()}
                    session_props={ctx.props().session_props.clone()}
                    presentation_props={ctx.props().presentation_props.clone()}
                    is_settings_open={ctx.props().is_settings_open}
                    update_count={ctx.props().update_count}
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
                        dimensions={ctx.props().renderer_props.render_limits}
                    />
                    <slot />
                </div>
            </div>
        }
    }

    fn destroy(&mut self, _ctx: &Context<Self>) {}
}

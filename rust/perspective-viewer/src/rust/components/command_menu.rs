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

//! A plugin-opened menu of custom commands: the `showCommandMenu()` surface,
//! a cursor-anchored [`ContextMenu`] in its own Yew app that resolves when it
//! closes.

use std::cell::RefCell;
use std::rc::Rc;

use perspective_js::utils::*;
use wasm_bindgen::JsCast;
use web_sys::HtmlElement;
use yew::prelude::*;

use crate::components::panel_menu::session_anchor;
use crate::components::style::StyleSurface;
use crate::config::CommandSpec;
use crate::presentation::Presentation;
use crate::ui::{ContextMenu, ContextMenuEntry, ContextMenuItem, MODAL_SLOT, PortalModal};
use crate::utils::*;

#[derive(Properties, PartialEq)]
pub struct CommandMenuProps {
    pub x: f64,
    pub y: f64,
    pub theme: Option<String>,
    pub presentation: Presentation,
    pub commands: Rc<Vec<CommandSpec>>,
    pub on_pick: Callback<String>,
    pub on_close: Callback<()>,
}

pub enum CommandMenuMsg {
    Pick(String),
    Closed,
}

pub struct CommandMenu {
    anchor: HtmlElement,
}

impl Component for CommandMenu {
    type Message = CommandMenuMsg;
    type Properties = CommandMenuProps;

    fn create(ctx: &Context<Self>) -> Self {
        Self {
            anchor: session_anchor(
                ctx.props().presentation.viewer_elem(),
                ctx.props().x,
                ctx.props().y,
            ),
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            CommandMenuMsg::Pick(key) => ctx.props().on_pick.emit(key),
            CommandMenuMsg::Closed => ctx.props().on_close.emit(()),
        }

        false
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let on_close = ctx.link().callback(|_| CommandMenuMsg::Closed);
        let entries = spec_entries(ctx.link(), &ctx.props().commands);
        html! {
            <PortalModal
                key="perspective-command-menu"
                tag_name="perspective-command-menu"
                sheet={StyleSurface::ContextMenu.sheet()}
                target={Some(self.anchor.clone())}
                own_focus=true
                on_close={&on_close}
                theme={ctx.props().theme.clone().unwrap_or_default()}
            >
                <ContextMenu {entries} {on_close} />
            </PortalModal>
        }
    }

    fn destroy(&mut self, _ctx: &Context<Self>) {
        self.anchor.remove();
    }
}

fn spec_entries(link: &html::Scope<CommandMenu>, specs: &[CommandSpec]) -> Vec<ContextMenuEntry> {
    specs
        .iter()
        .filter_map(|spec| match spec {
            CommandSpec::Command {
                key,
                label,
                disabled,
                title,
                ..
            } => {
                let key = key.clone();
                Some(ContextMenuEntry::Item(ContextMenuItem {
                    label: label.clone(),
                    on_select: link.callback(move |_| CommandMenuMsg::Pick(key.clone())),
                    disabled: disabled.unwrap_or_default(),
                    title: title.clone(),
                }))
            },
            CommandSpec::Group {
                label, commands, ..
            } => {
                let entries = spec_entries(link, commands);
                (!entries.is_empty()).then(|| ContextMenuEntry::Submenu {
                    label: label.clone(),
                    on_select: None,
                    entries,
                })
            },
        })
        .collect()
}

/// Open a menu of `commands` at viewport `(x, y)`, emitting
/// `Presentation::command_invoked` with `context` for a pick, and resolve
/// when it closes.
pub async fn show_command_menu(
    presentation: &Presentation,
    context: wasm_bindgen::JsValue,
    commands: Vec<CommandSpec>,
    x: f64,
    y: f64,
    theme: Option<String>,
) -> ApiResult<()> {
    let host: HtmlElement = global::document().create_element("div")?.unchecked_into();

    host.set_attribute("slot", MODAL_SLOT)?;
    presentation.viewer_elem().append_child(&host)?;
    let (completion, receiver) = Completion::new();
    let app: Rc<RefCell<Option<AppHandle<CommandMenu>>>> = Rc::default();
    let completion = Rc::new(RefCell::new(Some(completion)));
    let on_close = {
        clone!(app, host, completion);
        Callback::from(move |_| {
            if let Some(app) = app.borrow_mut().take() {
                app.destroy();
            }

            host.remove();
            if let Some(completion) = completion.borrow_mut().take() {
                completion.resolve_after(async { Ok(()) });
            }
        })
    };

    let on_pick = {
        clone!(presentation);
        Callback::from(move |key: String| {
            presentation.command_invoked.emit((key, context.clone()));
        })
    };

    let props = CommandMenuProps {
        x,
        y,
        theme,
        presentation: presentation.clone(),
        commands: Rc::new(commands),
        on_pick,
        on_close,
    };

    *app.borrow_mut() =
        Some(yew::Renderer::with_root_and_props(host.clone().into(), props).render());
    receiver.await.map_err(|_| ApiError::new("Cancelled"))?
}

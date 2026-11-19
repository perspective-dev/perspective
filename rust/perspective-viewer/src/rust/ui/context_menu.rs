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

use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::{Element, Event, HtmlElement, MouseEvent, Node, ShadowRoot};
use yew::prelude::*;

use crate::utils::{Bounds, ModalSide, apply_placement};

/// A single command row in a `ContextMenu`.
#[derive(Clone, PartialEq)]
pub struct ContextMenuItem {
    pub label: String,
    pub on_select: Callback<()>,
    pub disabled: bool,

    /// Tooltip text, when the command declares one.
    pub title: Option<String>,
}

/// A row in a `ContextMenu`: a plain command `ContextMenuItem`, a
/// non-interactive group label, or a row with a hover-opened sub-menu flyout.
#[derive(Clone, PartialEq)]
pub enum ContextMenuEntry {
    Item(ContextMenuItem),
    Header(String),

    /// A rule dividing two sections of the menu.
    Separator,

    /// Arbitrary content rendered in place, whose own handlers must close
    /// the menu.
    Custom(Html),
    Submenu {
        label: String,

        on_select: Option<Callback<()>>,
        entries: Vec<ContextMenuEntry>,
    },
}

#[derive(Properties, PartialEq)]
pub struct ContextMenuProps {
    pub entries: Vec<ContextMenuEntry>,

    #[prop_or_default]
    pub on_close: Callback<()>,
}

/// The command-item list of a panel context menu.
pub struct ContextMenu;

impl Component for ContextMenu {
    type Message = ();
    type Properties = ContextMenuProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let props = ctx.props();
        let entries = props
            .entries
            .iter()
            .map(|entry| render_entry(entry, &props.on_close));

        html! { <div class="context-menu">{ for entries }</div> }
    }
}

fn render_entry(entry: &ContextMenuEntry, on_close: &Callback<()>) -> Html {
    match entry {
        ContextMenuEntry::Item(item) => {
            let disabled = item.disabled;
            let onclick = {
                let on_select = item.on_select.clone();
                let on_close = on_close.clone();
                Callback::from(move |e: MouseEvent| {
                    e.stop_propagation();
                    if !disabled {
                        on_select.emit(());
                        on_close.emit(());
                    }
                })
            };

            let mut class = classes!("context-menu-item");
            if disabled {
                class.push("disabled");
            }

            let title = item.title.clone();
            let label_title = title.is_none().then(|| item.label.clone());
            html! {
                <span {class} {onclick} {title}>
                    <span class="context-menu-label" title={label_title}>
                        { item.label.clone() }
                    </span>
                </span>
            }
        },
        ContextMenuEntry::Header(label) => {
            html! { <span class="context-menu-header">{ label.clone() }</span> }
        },
        ContextMenuEntry::Separator => {
            html! { <span class="context-menu-separator" /> }
        },
        ContextMenuEntry::Custom(content) => content.clone(),
        ContextMenuEntry::Submenu {
            label,
            on_select,
            entries,
        } => {
            html! {
                <Submenu
                    label={label.clone()}
                    on_select={on_select.clone()}
                    entries={entries.clone()}
                    on_close={on_close.clone()}
                />
            }
        },
    }
}

#[derive(Properties, PartialEq)]
pub struct SubmenuProps {
    pub label: String,
    pub on_select: Option<Callback<()>>,
    pub entries: Vec<ContextMenuEntry>,
    pub on_close: Callback<()>,
}

pub enum SubmenuMsg {
    Enter,
    Leave,
}

/// A hover-opened flyout row placed beside its row inside the viewport,
/// tracked through the bubbling `mouseover`/`mouseout` pair because Chrome
/// withholds `mouseenter` from listeners on a shadow root.
pub struct Submenu {
    flyout: NodeRef,
    open: bool,

    /// Re-places the open flyout when the menu its row belongs to scrolls.
    scroll: Option<ScrollWatch>,
}

struct ScrollWatch {
    menu: Element,
    listener: Closure<dyn FnMut(Event)>,
}

fn place_flyout(flyout: &NodeRef) -> Option<()> {
    let flyout = flyout.cast::<HtmlElement>()?;
    let row = flyout.parent_element()?;
    let anchor = Bounds::from(&row.get_bounding_client_rect());
    apply_placement(&flyout, &anchor, ModalSide::Beside);
    Some(())
}

fn scrolling_menu(flyout: &NodeRef) -> Option<Element> {
    let row = flyout.cast::<HtmlElement>()?.parent_element()?;
    match row.closest(".context-menu-submenu").ok()? {
        Some(parent) => Some(parent),
        None => Some(row.get_root_node().dyn_into::<ShadowRoot>().ok()?.host()),
    }
}

impl Submenu {
    fn watch_scroll(&mut self) {
        if self.scroll.is_none()
            && let Some(menu) = scrolling_menu(&self.flyout)
        {
            let flyout = self.flyout.clone();
            let listener = Closure::wrap(Box::new(move |_: Event| {
                place_flyout(&flyout);
            }) as Box<dyn FnMut(Event)>);

            let _ =
                menu.add_event_listener_with_callback("scroll", listener.as_ref().unchecked_ref());

            self.scroll = Some(ScrollWatch { menu, listener });
        }
    }

    fn unwatch_scroll(&mut self) {
        if let Some(ScrollWatch { menu, listener }) = self.scroll.take() {
            let _ = menu
                .remove_event_listener_with_callback("scroll", listener.as_ref().unchecked_ref());
        }
    }
}

impl Component for Submenu {
    type Message = SubmenuMsg;
    type Properties = SubmenuProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            flyout: NodeRef::default(),
            open: false,
            scroll: None,
        }
    }

    fn update(&mut self, _ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            SubmenuMsg::Enter => {
                let changed = !self.open;
                self.open = true;
                changed
            },
            SubmenuMsg::Leave => {
                let changed = self.open;
                self.open = false;
                self.unwatch_scroll();
                changed
            },
        }
    }

    fn rendered(&mut self, _ctx: &Context<Self>, _first_render: bool) {
        if self.open {
            place_flyout(&self.flyout);
            self.watch_scroll();
        }
    }

    fn destroy(&mut self, _ctx: &Context<Self>) {
        self.unwatch_scroll();
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let props = ctx.props();
        let onclick = {
            let on_select = props.on_select.clone();
            let on_close = props.on_close.clone();
            Callback::from(move |e: MouseEvent| {
                e.stop_propagation();
                if let Some(on_select) = &on_select {
                    on_select.emit(());
                    on_close.emit(());
                }
            })
        };

        let onmouseover = ctx.link().callback(|_: MouseEvent| SubmenuMsg::Enter);
        let onmouseout = ctx.link().batch_callback({
            let flyout = self.flyout.clone();
            move |event: MouseEvent| {
                let item = flyout.cast::<HtmlElement>()?.parent_element()?;
                let related = event
                    .related_target()
                    .and_then(|target| target.dyn_into::<Node>().ok());

                let stays = related.is_some_and(|node| item.contains(Some(&node)));
                (!stays).then_some(SubmenuMsg::Leave)
            }
        });
        let mut class = classes!("context-menu", "context-menu-submenu");
        if self.open {
            class.push("open");
        }

        let children = props
            .entries
            .iter()
            .map(|entry| render_entry(entry, &props.on_close));

        html! {
            <span class="context-menu-item has-submenu" {onclick} {onmouseover} {onmouseout}>
                <span class="context-menu-label" title={props.label.clone()}>
                    { props.label.clone() }
                </span>
                <div {class} ref={self.flyout.clone()}>{ for children }</div>
            </span>
        }
    }
}

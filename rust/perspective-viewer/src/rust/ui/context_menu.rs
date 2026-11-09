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

use perspective_js::utils::global;
use wasm_bindgen::JsCast;
use web_sys::{HtmlElement, MouseEvent, Node};
use yew::prelude::*;

/// A single command row in a `ContextMenu`.
#[derive(Clone, PartialEq)]
pub struct ContextMenuItem {
    pub label: String,
    pub on_select: Callback<()>,
    pub disabled: bool,
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

            html! { <span {class} {onclick}>{ item.label.clone() }</span> }
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
    Measure,
}

/// A hover-opened flyout row that opens toward whichever side of its parent
/// has room for it, tracked through the bubbling `mouseover`/`mouseout` pair
/// because Chrome withholds `mouseenter` from listeners on a shadow root.
pub struct Submenu {
    flyout: NodeRef,
    open: bool,
    flip_x: bool,
    flip_y: bool,
}

impl Submenu {
    /// Which sides the flyout must open toward to stay on-screen, or `None`
    /// while it is hidden and has no size to measure.
    fn decide(&self) -> Option<(bool, bool)> {
        let flyout = self.flyout.cast::<HtmlElement>()?;
        let item = flyout.parent_element()?;
        let flyout_rect = flyout.get_bounding_client_rect();
        if flyout_rect.width() == 0.0 {
            return None;
        }

        let window = global::window();
        let inner_width = window.inner_width().unwrap().as_f64().unwrap();
        let inner_height = window.inner_height().unwrap().as_f64().unwrap();
        let item_rect = item.get_bounding_client_rect();
        let over_x = inner_width < item_rect.right() + flyout_rect.width();
        let over_y = inner_height < item_rect.top() - 1.0 + flyout_rect.height();
        let flip_x = over_x && item_rect.left() > inner_width - item_rect.right();
        let flip_y = over_y && item_rect.bottom() > inner_height - item_rect.top();
        Some((flip_x, flip_y))
    }
}

impl Component for Submenu {
    type Message = SubmenuMsg;
    type Properties = SubmenuProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            flyout: NodeRef::default(),
            open: false,
            flip_x: false,
            flip_y: false,
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
                changed
            },
            SubmenuMsg::Measure => match self.decide() {
                Some((flip_x, flip_y)) => {
                    let changed = (flip_x, flip_y) != (self.flip_x, self.flip_y);
                    self.flip_x = flip_x;
                    self.flip_y = flip_y;
                    changed
                },
                None => false,
            },
        }
    }

    fn rendered(&mut self, ctx: &Context<Self>, _first_render: bool) {
        if self.open
            && self
                .decide()
                .is_some_and(|d| d != (self.flip_x, self.flip_y))
        {
            ctx.link().send_message(SubmenuMsg::Measure);
        }
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

        if self.flip_x {
            class.push("flip-x");
        }

        if self.flip_y {
            class.push("flip-y");
        }

        let children = props
            .entries
            .iter()
            .map(|entry| render_entry(entry, &props.on_close));

        html! {
            <span class="context-menu-item has-submenu" {onclick} {onmouseover} {onmouseout}>
                { props.label.clone() }
                <div {class} ref={self.flyout.clone()}>{ for children }</div>
            </span>
        }
    }
}

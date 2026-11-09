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

use crate::components::panel_menu::PanelCommand;
use crate::queries::{CommandSource, ResolvedCommands};

/// Which surface a context-menu gesture landed on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MenuOrigin {
    /// Inside a panel's frame, where its plugin can be hit-tested.
    Body,

    /// On a panel's tab.
    Tab,

    /// Anywhere else in the element.
    Chrome,
}

/// A context-menu gesture: where it happened and the panel it targets.
#[derive(Debug)]
pub struct MenuRequest {
    pub x: f64,
    pub y: f64,
    pub panel: Option<String>,
}

#[derive(Debug)]
pub enum MainPanelMsg {
    PointerEvent(web_sys::PointerEvent),

    /// A panel's `PanelPhase` changed (`staged_changed` PubSub — see
    /// `Workspace::insert_panel`/`promote`): re-render so cells/tabs/wrappers
    /// reflect it and `reconcile` inserts a promoted panel. Subscribed on
    /// MainPanel's OWN scope — the root's `LayoutChanged` delivery proved
    /// unreliable from element-API task contexts (promoted panels stranded
    /// in their hidden wrappers), while this component's own messages
    /// deliver in every observed context.
    StagedChanged,

    /// A layout tree was staged for the retained panel set
    /// (`layout_staged` PubSub): re-render so `reconcile` applies it.
    LayoutStaged,

    /// The `<regular-layout>` tree changed (fired by its
    /// `regular-layout-update` event). Used to detect panels removed from
    /// the layout (e.g. a frame's close button) so they can be disposed.
    LayoutUpdated,

    /// A tab was selected (fired by `regular-layout-select`, `detail.name`);
    /// the selected panel becomes the active panel. This is
    /// regular-layout's own selection signal, so it resolves the correct
    /// panel within a stack.
    TabSelected(String),

    /// The layout is about to resize its cells (fired by the cancelable
    /// `regular-layout-before-resize`). Carries the event so its
    /// `PresizeDetail` can pre-size each panel's plugin to its target box
    /// before the layout commits — avoiding the post-commit resize
    /// shear/clip. The handler (`onbeforeresize` closure) has already
    /// `preventDefault()`-ed it.
    BeforeResize(web_sys::Event),

    /// A right-click opened the panel context menu (target panel id, client
    /// x, y). Fired by the imperative `contextmenu` listener on the viewer
    /// host — see `_contextmenu_listener` — and by each `PanelTab`.
    /// `Some(id)` activates that panel and opens its
    /// [`PanelMenu`](crate::components::panel_menu::PanelMenu) at the
    /// cursor; `None` (no frame on the composed path — status bar,
    /// sidebars, the empty stage) resolves to the ACTIVE panel, else to a
    /// target-less menu offering only "New", whose items create the first
    /// panel.
    ContextMenu(Option<String>, f64, f64, MenuOrigin),

    /// The custom commands for a pending context-menu gesture resolved.
    ContextMenuResolved(Rc<MenuRequest>, ResolvedCommands),

    /// The open context menu selected a custom command, by source and key.
    CustomCommand(CommandSource, String),

    /// Dismiss the panel context menu (the menu session ended).
    CloseContextMenu,

    /// The open context menu selected a command. Maximize/Restore act on the
    /// layout here; the rest forward to `on_panel_command`.
    Command(PanelCommand),
}

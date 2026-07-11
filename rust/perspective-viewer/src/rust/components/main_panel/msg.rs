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

use crate::components::panel_menu::PanelCommand;

#[derive(Debug)]
pub enum MainPanelMsg {
    PointerEvent(web_sys::PointerEvent),

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

    /// A right-click landed inside a panel (panel id, client x, y). Fired by
    /// the imperative `contextmenu` listener on the layout element — see
    /// `_layout_contextmenu_listener` — and by each `PanelTab`. Activates the
    /// panel and opens the
    /// [`PanelMenu`](crate::components::panel_menu::PanelMenu)
    /// at the cursor.
    ContextMenu(String, f64, f64),

    /// Dismiss the panel context menu (the menu session ended).
    CloseContextMenu,

    /// The open context menu selected a command. Maximize/Restore act on the
    /// layout here; the rest forward to `on_panel_command`.
    Command(PanelCommand),
}

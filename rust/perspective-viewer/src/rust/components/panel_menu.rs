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

//! The per-panel command menu: a cursor-anchored [`ContextMenu`] plus the
//! Export/Copy format-picker dropdowns it can spawn in place of itself. The
//! Export/Copy flows are handled end-to-end HERE (the target panel's engines
//! resolve from the `workspace` prop, like `StatusBar`'s own dropdowns);
//! every other command is emitted as a [`PanelCommand`] for the parent.
//!
//! Both stages are body-mounted [`PortalModal`]s positioned against a shared
//! session-long cursor anchor, so the menu is themed exactly like the pickers:
//! the host (`<perspective-context-menu theme="X">`) is matched by the
//! document theme rules' modal selector groups, with `X` = the TARGET panel's
//! effective theme (not the active/host theme).
//!
//! One menu "session" spans right-click → (menu | picker) → dismissal:
//! `on_close` fires exactly once, when the session ends (blur dismissal, a
//! command selection, or the picker closing).

mod render;

use std::rc::Rc;

use web_sys::HtmlElement;
use yew::prelude::*;

use crate::components::new_panel_menu::HostedTables;
use crate::presentation::Presentation;
use crate::queries::ResolvedCommands;
use crate::tasks::refresh_listings;
use crate::ui::session_anchor;
use crate::utils::*;
use crate::workspace::Workspace;

/// A panel command the menu delegates to its parent. Export/Copy are absent —
/// they're handled internally by the picker flow.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PanelCommand {
    New,
    NewFrom {
        client: String,
        table: String,
    },

    /// A fresh panel copied from the named panel.
    NewFromPanel(String),
    Duplicate,

    /// Promote the panel's current `View` to a derived `Table` under a
    /// generated name, and rebind the panel to it.
    Derive,
    Reset,
    Maximize,
    Restore,
    ToggleMaster,
    Close,

    /// Open the settings of the named column of the panel.
    ColumnSettings(String),

    /// Open the settings sidebar on the panel.
    PanelSettings,
}

/// Which format-picker dropdown the context menu spawned in place of itself.
#[derive(Clone, Copy, PartialEq)]
pub enum PickerKind {
    Export,
    Copy,
}

#[derive(Properties)]
pub struct PanelMenuProps {
    /// Viewport (client) coordinates the menu (and any spawned picker) anchors
    /// at.
    pub x: f64,
    pub y: f64,

    /// The right-clicked panel this menu targets — or `None` for the
    /// EMPTY-stage menu (zero panels), which offers only the "New" sub-menu
    /// (its `NewFrom` items resolve from the loaded-clients registry, no
    /// panel required).
    pub panel_id: Option<String>,

    /// For per-panel command context (`is_master`, pivot state, panel count)
    /// and resolving the target panel's engines for Export/Copy.
    pub workspace: Workspace,

    /// For `export_method_to_blob`.
    pub presentation: Presentation,

    /// The TARGET panel's effective theme (its own, else the registry
    /// default), stamped on both stages' `PortalModal` hosts.
    pub theme: Option<String>,

    /// Whether the target panel is currently maximized (drives the
    /// Maximize/Restore item).
    pub maximized: bool,

    /// Whether the settings sidebar is open on the active panel.
    #[prop_or_default]
    pub is_settings_open: bool,

    /// The column whose settings are open on the active panel, if any.
    #[prop_or_default]
    pub open_column: Option<String>,

    /// The custom commands rendered above the built-in items.
    #[prop_or_default]
    pub commands: PtrEqRc<ResolvedCommands>,

    /// A custom command was selected, by key.
    #[prop_or_default]
    pub on_custom: Callback<String>,

    /// A command was selected — the parent executes it (and ends the session
    /// via the `on_close` that follows every selection).
    pub on_command: Callback<PanelCommand>,

    /// The menu session ended (backdrop dismissal, command selection, or
    /// picker close); the parent unmounts this component.
    pub on_close: Callback<()>,
}

impl PartialEq for PanelMenuProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.x == rhs.x
            && self.y == rhs.y
            && self.panel_id == rhs.panel_id
            && self.theme == rhs.theme
            && self.maximized == rhs.maximized
            && self.is_settings_open == rhs.is_settings_open
            && self.open_column == rhs.open_column
            && self.commands == rhs.commands
    }
}

pub enum PanelMenuMsg {
    /// A parent-executed command was selected.
    Command(PanelCommand),

    /// A custom command was selected, by key.
    Custom(String),

    /// Export/Copy was selected: swap the menu for the format picker.
    OpenPicker(PickerKind),

    /// The `ContextMenu` closed. Fired on backdrop dismissal AND after every
    /// item selection — swallowed when a picker was just opened (the session
    /// continues in the picker).
    MenuClosed,

    /// The picker closed (blur, or a completed export/copy).
    ClosePicker,

    /// The per-client hosted-table-name fetch (spawned at menu open, feeding
    /// the "New" sub-menu) resolved: `(client name, its table names)` per
    /// loaded client.
    TablesChanged,
}

pub struct PanelMenu {
    /// The session-long 0×0 cursor anchor element (a viewer light-DOM child)
    /// both stages' `PortalModal`s position against; removed on destroy.
    anchor: HtmlElement,

    /// The open format picker, if the session is in its picker stage.
    picker: Option<PickerKind>,

    /// The "New" sub-menu's data: `(client name, its hosted table names)` per
    /// open client, in registration order.
    tables: HostedTables,

    /// Keeps the [`Workspace::hosted_tables_changed`] listener attached for
    /// the menu session, so the open listing tracks table creates/deletes.
    _tables_sub: Subscription,
}

impl Component for PanelMenu {
    type Message = PanelMenuMsg;
    type Properties = PanelMenuProps;

    fn create(ctx: &Context<Self>) -> Self {
        let workspace = &ctx.props().workspace;
        refresh_listings(workspace);
        let _tables_sub = workspace
            .hosted_tables_changed()
            .add_notify_listener(&ctx.link().callback(|()| PanelMenuMsg::TablesChanged));

        Self {
            anchor: session_anchor(
                ctx.props().presentation.viewer_elem(),
                ctx.props().x,
                ctx.props().y,
            ),
            picker: None,
            tables: Rc::new(workspace.open_hosted_tables()),
            _tables_sub,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            PanelMenuMsg::Command(cmd) => {
                ctx.props().on_command.emit(cmd);
                false
            },
            PanelMenuMsg::Custom(key) => {
                ctx.props().on_custom.emit(key);
                false
            },
            PanelMenuMsg::OpenPicker(kind) => {
                self.picker = Some(kind);
                true
            },
            PanelMenuMsg::MenuClosed => {
                // The menu's `PortalModal` closes (blur) after every item
                // selection; when that selection just opened a picker, the
                // session continues — only a plain dismissal/selection ends
                // it.
                if self.picker.is_none() {
                    ctx.props().on_close.emit(());
                }

                false
            },
            PanelMenuMsg::ClosePicker => {
                ctx.props().on_close.emit(());
                false
            },
            PanelMenuMsg::TablesChanged => {
                self.tables = Rc::new(ctx.props().workspace.open_hosted_tables());
                self.picker.is_none()
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        match &self.picker {
            Some(kind) => self.picker_html(ctx, *kind),
            None => self.menu_html(ctx),
        }
    }

    fn destroy(&mut self, _ctx: &Context<Self>) {
        // The session ended (or the parent unmounted mid-session, e.g. the
        // target panel closed); don't leak the cursor anchor.
        self.anchor.remove();
    }
}

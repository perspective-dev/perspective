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

use perspective_js::utils::*;
use wasm_bindgen::JsCast;
use web_sys::HtmlElement;
use yew::prelude::*;

use crate::components::context_menu::{ContextMenu, ContextMenuEntry, ContextMenuItem};
use crate::components::copy_dropdown::CopyDropDownMenu;
use crate::components::export_dropdown::ExportDropDownMenu;
use crate::components::portal::PortalModal;
use crate::components::style::StyleSurface;
use crate::config::*;
use crate::js::copy_to_clipboard;
use crate::presentation::Presentation;
use crate::tasks::export_method_to_blob;
use crate::utils::*;
use crate::workspace::{PanelId, Workspace};

/// A panel command the menu delegates to its parent. Export/Copy are absent —
/// they're handled internally by the picker flow.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PanelCommand {
    New,
    NewFrom { client: String, table: String },
    Duplicate,
    Reset,
    Maximize,
    Restore,
    ToggleMaster,
    Close,
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

    /// The right-clicked panel this menu targets.
    pub panel_id: String,

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
    }
}

pub enum PanelMenuMsg {
    /// A parent-executed command was selected.
    Command(PanelCommand),

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
    TablesLoaded(Vec<(String, Vec<String>)>),
}

pub struct PanelMenu {
    /// The session-long 0×0 cursor anchor element (appended to `<body>`) both
    /// stages' `PortalModal`s position against; removed on destroy.
    anchor: HtmlElement,

    /// The open format picker, if the session is in its picker stage.
    picker: Option<PickerKind>,

    /// The "New" sub-menu's data: `(client name, its hosted table names)` per
    /// loaded client, in registration order. `None` while the fetch spawned at
    /// menu open is still in flight.
    tables: Option<Vec<(String, Vec<String>)>>,
}

impl Component for PanelMenu {
    type Message = PanelMenuMsg;
    type Properties = PanelMenuProps;

    fn create(ctx: &Context<Self>) -> Self {
        let clients = ctx.props().workspace.clients();
        let link = ctx.link().clone();
        ApiFuture::spawn(async move {
            let mut tables = Vec::with_capacity(clients.len());
            for client in clients {
                // A failing client contributes an empty list rather than
                // poisoning the whole menu.
                let mut names = match client.get_hosted_table_names().await {
                    Ok(names) => names,
                    Err(err) => {
                        tracing::warn!(
                            "Failed to list tables for `Client` \"{}\": {err}",
                            client.get_name()
                        );

                        vec![]
                    },
                };

                // Server-side name order isn't meaningful (or stable) — list
                // deterministically.
                names.sort_unstable();
                tables.push((client.get_name().to_owned(), names));
            }

            link.send_message(PanelMenuMsg::TablesLoaded(tables));
            Ok(())
        });

        Self {
            anchor: session_anchor(ctx.props().x, ctx.props().y),
            picker: None,
            tables: None,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            PanelMenuMsg::Command(cmd) => {
                ctx.props().on_command.emit(cmd);
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
            PanelMenuMsg::TablesLoaded(tables) => {
                self.tables = Some(tables);
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
        let _ = global::body().remove_child(&self.anchor);
    }
}

impl PanelMenu {
    fn menu_html(&self, ctx: &Context<Self>) -> Html {
        let on_close = ctx.link().callback(|_| PanelMenuMsg::MenuClosed);
        let can_close = ctx.props().workspace.len() > 1;
        let panel_id = PanelId::from(ctx.props().panel_id.as_str());
        let is_master = ctx.props().workspace.is_master(&panel_id);
        let item = |label: &str, on_select: Callback<()>, disabled: bool| {
            ContextMenuEntry::Item(ContextMenuItem {
                label: label.to_owned(),
                on_select,
                disabled,
            })
        };
        let cmd = |cmd: PanelCommand| {
            ctx.link()
                .callback(move |_| PanelMenuMsg::Command(cmd.clone()))
        };
        let entries = vec![
            ContextMenuEntry::Submenu {
                label: "New".to_owned(),
                on_select: Some(cmd(PanelCommand::New)),
                entries: self.new_submenu_entries(ctx),
            },
            item("Duplicate", cmd(PanelCommand::Duplicate), false),
            item("Reset", cmd(PanelCommand::Reset), false),
            item(
                "Export",
                ctx.link()
                    .callback(|_| PanelMenuMsg::OpenPicker(PickerKind::Export)),
                false,
            ),
            item(
                "Copy",
                ctx.link()
                    .callback(|_| PanelMenuMsg::OpenPicker(PickerKind::Copy)),
                false,
            ),
            if ctx.props().maximized {
                item("Restore", cmd(PanelCommand::Restore), false)
            } else {
                item("Maximize", cmd(PanelCommand::Maximize), false)
            },
            // Never gated: masters broadcast from ANY select/click event
            // (flat grids fall back to the clicked cell's `==` clause), not
            // just a grouped row tree.
            item(
                if is_master { "Detail" } else { "Master" },
                cmd(PanelCommand::ToggleMaster),
                false,
            ),
            item("Close", cmd(PanelCommand::Close), !can_close),
        ];

        html! {
            <PortalModal
                tag_name="perspective-context-menu"
                surface={StyleSurface::ContextMenu}
                target={Some(self.anchor.clone())}
                own_focus=true
                on_close={&on_close}
                theme={ctx.props().theme.clone().unwrap_or_default()}
            >
                // Selection-end and blur-dismissal both route to `MenuClosed`;
                // duplicates are harmless (the first ends the session or is
                // swallowed by an open picker).
                <ContextMenu {entries} {on_close} />
            </PortalModal>
        }
    }

    /// The "New" hover sub-menu's entries: every hosted `Table` name from
    /// every loaded `Client`, flat for a single client, grouped under a
    /// header row per client otherwise (client names are globally unique, so
    /// the grouping also disambiguates table-name collisions).
    fn new_submenu_entries(&self, ctx: &Context<Self>) -> Vec<ContextMenuEntry> {
        let placeholder = |label: &str| {
            vec![ContextMenuEntry::Item(ContextMenuItem {
                label: label.to_owned(),
                on_select: Callback::noop(),
                disabled: true,
            })]
        };

        let Some(clients) = &self.tables else {
            return placeholder("Loading...");
        };

        if clients.iter().all(|(_, tables)| tables.is_empty()) {
            return placeholder("No tables");
        }

        let multi = clients.len() > 1;
        let mut entries = Vec::new();
        for (client_name, tables) in clients {
            if multi {
                entries.push(ContextMenuEntry::Header(client_name.clone()));
            }

            for table in tables {
                let on_select = {
                    clone!(client_name, table);
                    ctx.link().callback(move |_| {
                        PanelMenuMsg::Command(PanelCommand::NewFrom {
                            client: client_name.clone(),
                            table: table.clone(),
                        })
                    })
                };

                entries.push(ContextMenuEntry::Item(ContextMenuItem {
                    label: table.clone(),
                    on_select,
                    disabled: false,
                }));
            }
        }

        entries
    }

    /// Export/Copy format-picker spawned in place of the context menu, anchored
    /// at the same cursor anchor and reusing the status bar's dropdown
    /// components.
    fn picker_html(&self, ctx: &Context<Self>, kind: PickerKind) -> Html {
        let Some(panel) = ctx
            .props()
            .workspace
            .panel(&PanelId::from(ctx.props().panel_id.as_str()))
        else {
            return Html::default();
        };

        let on_close = ctx.link().callback(|_| PanelMenuMsg::ClosePicker);
        let theme = ctx.props().theme.clone().unwrap_or_default();
        let target = Some(self.anchor.clone());
        let presentation = ctx.props().presentation.clone();

        let inner = match kind {
            PickerKind::Export => {
                let callback = {
                    clone!(presentation);
                    let session = panel.session.clone();
                    let renderer = panel.renderer.clone();
                    let link = ctx.link().clone();
                    Callback::from(move |file: ExportFile| {
                        if file.name.is_empty() {
                            return;
                        }

                        clone!(session, renderer, presentation, link);
                        ApiFuture::spawn(async move {
                            let blob = export_method_to_blob(
                                &session,
                                &renderer,
                                &presentation,
                                file.method,
                            )
                            .await?;

                            download(&file.as_filename(renderer.is_chart()), &blob)?;
                            link.send_message(PanelMenuMsg::ClosePicker);
                            Ok(())
                        });
                    })
                };

                html! {
                    <ExportDropDownMenu
                        renderer={panel.renderer.clone()}
                        session={panel.session.clone()}
                        {callback}
                    />
                }
            },
            PickerKind::Copy => {
                let callback = {
                    clone!(presentation);
                    let session = panel.session.clone();
                    let renderer = panel.renderer.clone();
                    let link = ctx.link().clone();
                    Callback::from(move |file: ExportFile| {
                        clone!(session, renderer, presentation, link);
                        ApiFuture::spawn(async move {
                            let task = export_method_to_blob(
                                &session,
                                &renderer,
                                &presentation,
                                file.method,
                            );
                            copy_to_clipboard(task, file.method.mimetype(file.is_chart)).await?;
                            link.send_message(PanelMenuMsg::ClosePicker);
                            Ok(())
                        });
                    })
                };

                html! { <CopyDropDownMenu renderer={panel.renderer.clone()} {callback} /> }
            },
        };

        let tag_name = match kind {
            PickerKind::Export => "perspective-export-menu",
            PickerKind::Copy => "perspective-copy-menu",
        };

        html! {
            <PortalModal
                {tag_name}
                surface={StyleSurface::DropdownMenu}
                {target}
                own_focus=true
                {on_close}
                {theme}
            >
                { inner }
            </PortalModal>
        }
    }
}

/// Create a session-long 0×0 anchor element at viewport `(x, y)`, appended to
/// `<body>`, for both stages' `PortalModal`s to position against.
fn session_anchor(x: f64, y: f64) -> HtmlElement {
    let anchor: HtmlElement = global::document()
        .create_element("div")
        .unwrap()
        .unchecked_into();

    let style = anchor.style();
    let _ = style.set_property("position", "fixed");
    let _ = style.set_property("left", &format!("{x}px"));
    let _ = style.set_property("top", &format!("{y}px"));
    let _ = style.set_property("width", "0px");
    let _ = style.set_property("height", "0px");
    let _ = global::body().append_child(&anchor);
    anchor
}

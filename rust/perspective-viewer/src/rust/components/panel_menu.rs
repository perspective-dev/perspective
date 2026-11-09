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

use std::rc::Rc;

use perspective_js::utils::*;
use wasm_bindgen::JsCast;
use web_sys::HtmlElement;
use yew::html::Scope;
use yew::prelude::*;

use crate::components::copy_dropdown::CopyDropDownMenu;
use crate::components::export_dropdown::ExportDropDownMenu;
use crate::components::new_panel_menu::{HostedTables, NewPanelMenu, NewPanelPick, derived_counts};
use crate::components::style::StyleSurface;
use crate::config::*;
use crate::js::copy_to_clipboard;
use crate::presentation::Presentation;
use crate::queries::{CommandSource, ResolvedCommands, fetch_hosted_tables};
use crate::tasks::{can_derive, delete_derived, export_method_to_blob};
use crate::ui::{ContextMenu, ContextMenuEntry, ContextMenuItem, MODAL_SLOT, PortalModal};
use crate::utils::*;
use crate::workspace::{PanelId, Workspace};

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

    /// The custom commands rendered above the built-in items.
    #[prop_or_default]
    pub commands: PtrEqRc<ResolvedCommands>,

    /// A custom command was selected, by source and key.
    #[prop_or_default]
    pub on_custom: Callback<(CommandSource, String)>,

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
            && self.commands == rhs.commands
    }
}

pub enum PanelMenuMsg {
    /// A parent-executed command was selected.
    Command(PanelCommand),

    /// A custom command was selected, by source and key.
    Custom(CommandSource, String),

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
    /// The session-long 0×0 cursor anchor element (a viewer light-DOM child)
    /// both stages' `PortalModal`s position against; removed on destroy.
    anchor: HtmlElement,

    /// The open format picker, if the session is in its picker stage.
    picker: Option<PickerKind>,

    /// The "New" sub-menu's data: `(client name, its hosted table names)` per
    /// loaded client, in registration order. `None` while the fetch spawned at
    /// menu open is still in flight.
    tables: Option<HostedTables>,

    /// Keeps the [`Workspace::hosted_tables_changed`] listener attached for
    /// the menu session, so the open listing tracks table creates/deletes.
    _tables_sub: Subscription,
}

impl Component for PanelMenu {
    type Message = PanelMenuMsg;
    type Properties = PanelMenuProps;

    fn create(ctx: &Context<Self>) -> Self {
        let fetch = {
            let workspace = ctx.props().workspace.clone();
            let link = ctx.link().clone();
            move || {
                clone!(workspace, link);
                ApiFuture::spawn(async move {
                    let tables = fetch_hosted_tables(&workspace).await;
                    link.send_message(PanelMenuMsg::TablesLoaded(tables));
                    Ok(())
                });
            }
        };

        fetch();
        let _tables_sub = ctx
            .props()
            .workspace
            .hosted_tables_changed()
            .add_listener(move |_| fetch());

        Self {
            anchor: session_anchor(
                ctx.props().presentation.viewer_elem(),
                ctx.props().x,
                ctx.props().y,
            ),
            picker: None,
            tables: None,
            _tables_sub,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            PanelMenuMsg::Command(cmd) => {
                ctx.props().on_command.emit(cmd);
                false
            },
            PanelMenuMsg::Custom(source, key) => {
                ctx.props().on_custom.emit((source, key));
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
                self.tables = Some(Rc::new(tables));
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

impl PanelMenu {
    fn menu_html(&self, ctx: &Context<Self>) -> Html {
        let on_close = ctx.link().callback(|_| PanelMenuMsg::MenuClosed);
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
        let builtin = match ctx.props().panel_id.as_deref() {
            // The empty-stage menu: no target panel, so only the "New"
            // sub-menu. Hover-only (`on_select: None`) — plain "New" copies
            // its source panel's table binding, which doesn't exist here.
            None => vec![ContextMenuEntry::Submenu {
                label: "New".to_owned(),
                on_select: None,
                entries: vec![ContextMenuEntry::Custom(self.new_submenu_body(ctx))],
            }],
            Some(panel_id) => {
                let can_close = ctx.props().workspace.len() > 1;
                let is_master = ctx.props().workspace.is_master(&PanelId::from(panel_id));
                let panel = ctx.props().workspace.panel(&PanelId::from(panel_id));
                let can_derive_view = panel.as_ref().is_some_and(|x| {
                    let config = x.session.get_view_config();
                    let is_pivoted = !config.group_by.is_empty() || !config.split_by.is_empty();
                    is_pivoted && can_derive(&x.session)
                });

                vec![
                    ContextMenuEntry::Submenu {
                        label: "New".to_owned(),
                        on_select: Some(cmd(PanelCommand::New)),
                        entries: vec![ContextMenuEntry::Custom(self.new_submenu_body(ctx))],
                    },
                    item("Duplicate", cmd(PanelCommand::Duplicate), false),
                    item("Derive Table", cmd(PanelCommand::Derive), !can_derive_view),
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
                ]
            },
        };

        let entries = custom_entries(ctx.link(), &ctx.props().commands)
            .into_iter()
            .chain(builtin)
            .collect::<Vec<_>>();

        html! {
            <PortalModal
                key="perspective-context-menu"
                tag_name="perspective-context-menu"
                sheet={StyleSurface::ContextMenu.sheet()}
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

    /// The "New" hover sub-menu's body, the shared [`NewPanelMenu`].
    fn new_submenu_body(&self, ctx: &Context<Self>) -> Html {
        let panels = Rc::new(
            ctx.props()
                .workspace
                .panel_ids()
                .into_iter()
                .filter_map(|id| {
                    let panel = ctx.props().workspace.panel(&id)?;
                    let title = panel.session.get_title().filter(|t| !t.is_empty());
                    Some((id.as_str().to_owned(), title))
                })
                .collect::<Vec<_>>(),
        );

        let callback = ctx.link().batch_callback(|pick: NewPanelPick| {
            let cmd = match pick {
                NewPanelPick::FromTable { client, table } => {
                    PanelMenuMsg::Command(PanelCommand::NewFrom { client, table })
                },
                NewPanelPick::FromPanel(id) => {
                    PanelMenuMsg::Command(PanelCommand::NewFromPanel(id))
                },
            };

            vec![cmd, PanelMenuMsg::MenuClosed]
        });

        let workspace = ctx.props().workspace.clone();
        let on_delete = Callback::from(move |name: String| {
            let workspace = workspace.clone();
            let effect = workspace.effects().guard();
            ApiFuture::spawn(async move {
                let _effect = effect;
                delete_derived(&workspace, &name).await
            });
        });

        html! {
            <NewPanelMenu
                tables={self.tables.clone()}
                {panels}
                {callback}
                derived={derived_counts(&ctx.props().workspace)}
                {on_delete}
            />
        }
    }

    /// Export/Copy format-picker spawned in place of the context menu, anchored
    /// at the same cursor anchor and reusing the status bar's dropdown
    /// components.
    fn picker_html(&self, ctx: &Context<Self>, kind: PickerKind) -> Html {
        // Export/Copy are absent from the target-less stage menu, so
        // `panel_id` is always `Some` here in practice.
        let Some(panel) = ctx
            .props()
            .panel_id
            .as_deref()
            .and_then(|id| ctx.props().workspace.panel(&PanelId::from(id)))
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
                    let workspace = ctx.props().workspace.clone();
                    let link = ctx.link().clone();
                    Callback::from(move |file: ExportFile| {
                        if file.name.is_empty() {
                            return;
                        }

                        clone!(session, renderer, presentation, workspace, link);
                        ApiFuture::spawn(async move {
                            let blob = export_method_to_blob(
                                &session,
                                &renderer,
                                &presentation,
                                &workspace,
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
                    let workspace = ctx.props().workspace.clone();
                    let link = ctx.link().clone();
                    Callback::from(move |file: ExportFile| {
                        clone!(session, renderer, presentation, workspace, link);
                        ApiFuture::spawn(async move {
                            let task = export_method_to_blob(
                                &session,
                                &renderer,
                                &presentation,
                                &workspace,
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
            // Keyed by host tag: the menu→picker swap happens at the same
            // vdom position, and `PortalModal`'s host element + adopted
            // surface sheet are create-time-only — unkeyed reuse would leave
            // the picker inside the `<perspective-context-menu>` host with
            // the context-menu sheet.
            <PortalModal
                key={tag_name}
                {tag_name}
                sheet={StyleSurface::DropdownMenu.sheet()}
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

/// The menu rows for the app's then the plugin's custom commands, closed by a
/// separator when there are any.
fn custom_entries(link: &Scope<PanelMenu>, commands: &ResolvedCommands) -> Vec<ContextMenuEntry> {
    let mut entries = spec_entries(link, CommandSource::App, &commands.app);
    entries.extend(spec_entries(link, CommandSource::Plugin, &commands.plugin));
    if !entries.is_empty() {
        entries.push(ContextMenuEntry::Separator);
    }

    entries
}

fn spec_entries(
    link: &Scope<PanelMenu>,
    source: CommandSource,
    specs: &[CommandSpec],
) -> Vec<ContextMenuEntry> {
    specs
        .iter()
        .filter_map(|spec| match spec {
            CommandSpec::Command {
                key,
                label,
                disabled,
            } => {
                let key = key.clone();
                Some(ContextMenuEntry::Item(ContextMenuItem {
                    label: label.clone(),
                    on_select: link.callback(move |_| PanelMenuMsg::Custom(source, key.clone())),
                    disabled: disabled.unwrap_or_default(),
                }))
            },
            CommandSpec::Group {
                label, commands, ..
            } => {
                let entries = spec_entries(link, source, commands);
                (!entries.is_empty()).then(|| ContextMenuEntry::Submenu {
                    label: label.clone(),
                    on_select: None,
                    entries,
                })
            },
        })
        .collect()
}

/// Create the session-long 0×0 cursor anchor at viewport `(x, y)` as a
/// light-DOM child of `viewer` in the modal slot.
fn session_anchor(viewer: &HtmlElement, x: f64, y: f64) -> HtmlElement {
    let anchor: HtmlElement = global::document()
        .create_element("div")
        .unwrap()
        .unchecked_into();

    let _ = anchor.set_attribute("slot", MODAL_SLOT);
    let style = anchor.style();
    let _ = style.set_property("position", "fixed");
    let _ = style.set_property("left", &format!("{x}px"));
    let _ = style.set_property("top", &format!("{y}px"));
    let _ = style.set_property("width", "0px");
    let _ = style.set_property("height", "0px");
    let _ = viewer.append_child(&anchor);
    anchor
}

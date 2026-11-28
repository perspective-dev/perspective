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

use perspective_js::utils::*;
use yew::html::Scope;
use yew::prelude::*;

use super::{PanelMenu, PanelMenuMsg, PickerKind};
use crate::components::main_panel::export_menus::copy_dropdown::CopyDropDownMenu;
use crate::components::main_panel::export_menus::export_dropdown::ExportDropDownMenu;
use crate::components::main_panel::panel_menu::new_panel_menu::{
    NewPanelMenu, NewPanelPick, derived_counts,
};
use crate::components::panel_command::PanelCommand;
use crate::components::style::StyleSurface;
use crate::config::*;
use crate::queries::{ResolvedCommands, StatusState, panel_state};
use crate::tasks::{
    can_derive_view, copy_method_to_clipboard, delete_derived, export_method_to_blob,
};
use crate::ui::{ContextMenu, ContextMenuEntry, ContextMenuItem, PortalModal};
use crate::utils::*;
use crate::workspace::PanelId;

impl PanelMenu {
    pub(super) fn menu_html(&self, ctx: &Context<Self>) -> Html {
        let on_close = ctx.link().callback(|_| PanelMenuMsg::MenuClosed);
        let item = |label: &str, on_select: Callback<()>, disabled: bool| {
            ContextMenuEntry::Item(ContextMenuItem {
                label: label.to_owned(),
                on_select,
                disabled,
                title: None,
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
                let is_master = ctx.props().workspace.is_master(&PanelId::from(panel_id));
                let panel = ctx.props().workspace.panel(&PanelId::from(panel_id));
                let can_derive = panel
                    .as_ref()
                    .is_some_and(|x| can_derive_view(&x.session, &x.renderer));

                let errored = panel
                    .as_ref()
                    .is_some_and(|x| panel_state(&x.session, &x.renderer) == StatusState::Errored);

                let is_active = ctx.props().workspace.active_id() == Some(PanelId::from(panel_id));
                let column_settings = ctx
                    .props()
                    .commands
                    .column
                    .clone()
                    .filter(|column| !is_active || ctx.props().open_column.as_ref() != Some(column))
                    .map(|column| {
                        item(
                            format!("\"{column}\' Settings").as_str(),
                            cmd(PanelCommand::ColumnSettings(column)),
                            errored,
                        )
                    });

                let panel_settings = (!is_active || !ctx.props().is_settings_open)
                    .then(|| item("Panel Settings", cmd(PanelCommand::PanelSettings), false));

                let mut entries: Vec<ContextMenuEntry> =
                    column_settings.into_iter().chain(panel_settings).collect();

                if !entries.is_empty() {
                    entries.push(ContextMenuEntry::Separator);
                }

                entries
                    .into_iter()
                    .chain([
                        ContextMenuEntry::Submenu {
                            label: "New".to_owned(),
                            on_select: Some(cmd(PanelCommand::New)),
                            entries: vec![ContextMenuEntry::Custom(self.new_submenu_body(ctx))],
                        },
                        item("Duplicate", cmd(PanelCommand::Duplicate), errored),
                        item("Derive Table", cmd(PanelCommand::Derive), !can_derive),
                        item("Reset", cmd(PanelCommand::Reset), errored),
                        item(
                            "Export",
                            ctx.link()
                                .callback(|_| PanelMenuMsg::OpenPicker(PickerKind::Export)),
                            errored,
                        ),
                        item(
                            "Copy",
                            ctx.link()
                                .callback(|_| PanelMenuMsg::OpenPicker(PickerKind::Copy)),
                            errored,
                        ),
                        if ctx.props().maximized {
                            item("Restore", cmd(PanelCommand::Restore), false)
                        } else {
                            item("Maximize", cmd(PanelCommand::Maximize), false)
                        },
                        // Never gated: masters broadcast from ANY select/click
                        // event (flat grids fall back to the clicked cell's
                        // `==` clause), not just a grouped row tree.
                        item(
                            if is_master { "Detail" } else { "Master" },
                            cmd(PanelCommand::ToggleMaster),
                            errored,
                        ),
                        item("Close", cmd(PanelCommand::Close), false),
                    ])
                    .collect()
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
    pub(super) fn new_submenu_body(&self, ctx: &Context<Self>) -> Html {
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
                tables={Some(self.tables.clone())}
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
    pub(super) fn picker_html(&self, ctx: &Context<Self>, kind: PickerKind) -> Html {
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
                        let task = copy_method_to_clipboard(
                            &session,
                            &renderer,
                            &presentation,
                            &workspace,
                            file.method,
                        );

                        clone!(link);
                        ApiFuture::spawn(async move {
                            task.await?;
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

/// The menu rows for the app's custom commands, closed by a separator when
/// there are any.
fn custom_entries(link: &Scope<PanelMenu>, commands: &ResolvedCommands) -> Vec<ContextMenuEntry> {
    let mut entries = spec_entries(link, &commands.commands);
    if !entries.is_empty() {
        entries.push(ContextMenuEntry::Separator);
    }

    entries
}

fn spec_entries(link: &Scope<PanelMenu>, specs: &[CommandSpec]) -> Vec<ContextMenuEntry> {
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
                    on_select: link.callback(move |_| PanelMenuMsg::Custom(key.clone())),
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

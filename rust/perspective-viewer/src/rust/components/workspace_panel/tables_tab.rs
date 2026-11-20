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

use std::collections::{BTreeMap, BTreeSet};

use perspective_client::JoinType;
use perspective_js::utils::*;
use wasm_bindgen::JsCast;
use web_sys::{HtmlElement, HtmlInputElement, HtmlSelectElement};
use yew::prelude::*;

use crate::components::new_panel_menu::PanelLabels;
use crate::components::viewer::PerspectiveViewerMsg;
use crate::config::{DerivedTableConfig, ViewerConfigInitial};
use crate::queries::{ClientStatus, StatusState, WorkspaceStatus};
use crate::session::MissingTable;
use crate::tasks::{
    JoinSpec, WorkspaceHost, create_join, create_panel, delete_derived, delete_join,
    reconnect_client, refresh_listings,
};
use crate::ui::intl_content_style;
use crate::utils::*;

#[derive(Clone, Properties)]
pub struct TablesTabProps {
    pub host: WorkspaceHost,
    pub status: WorkspaceStatus,
    pub panels: PanelLabels,
    pub initial_width: f64,
    pub on_auto_width: Callback<f64>,
    pub on_derive_panel: Callback<String>,
}

impl PartialEq for TablesTabProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.status == rhs.status
            && self.panels == rhs.panels
            && self.initial_width == rhs.initial_width
    }
}

#[derive(Clone, Copy, PartialEq)]
pub enum JoinField {
    Left,
    Right,
    On,
    RightOn,
    Type,
    Name,
}

pub enum TablesTabMsg {
    /// A `Client`'s listing or a table's consumers changed.
    Changed,

    /// A `Client` was loaded.
    ClientRegistered,
    Reconnect(String),

    /// List the named `Client`'s tables again.
    Retry(String),

    /// Create a panel for the `Table` (second) of the `Client` (first).
    NewPanel(String, String),
    Delete(String),
    Failed(String),
    OpenJoin(String),
    CloseJoin,
    JoinInput(JoinField, String),

    /// The columns of the `Table` named by the first field resolved.
    JoinColumns(String, Vec<String>),
    SubmitJoin,
    JoinFinished(Result<(), String>),
}

struct JoinForm {
    client: String,
    left: String,
    right: String,
    on: String,
    right_on: String,
    join_type: JoinType,
    name: String,
    columns: Vec<String>,
    error: Option<String>,
    submitting: bool,
}

#[derive(Clone, Copy, PartialEq)]
enum TableKind {
    Base,
    Derived,
    Pending,
    Join,
}

struct TableRow {
    name: String,
    depth: usize,
    kind: TableKind,
}

/// The workspace panel's Tables tab, listing each `Client`'s hosted `Table`s
/// with their status and lineage.
pub struct TablesTab {
    join: Option<JoinForm>,
    error: Option<String>,
    sizer: NodeRef,
    _subs: Vec<Subscription>,
}

fn label(var: &str) -> String {
    intl_content_style(var)
}

fn join_type_name(join_type: JoinType) -> &'static str {
    match join_type {
        JoinType::Inner => "inner",
        JoinType::Left => "left",
        JoinType::Outer => "outer",
    }
}

fn input_value(event: &Event) -> String {
    let target = event.target();
    target
        .as_ref()
        .and_then(|x| x.dyn_ref::<HtmlSelectElement>())
        .map(|x| x.value())
        .or_else(|| {
            target
                .as_ref()
                .and_then(|x| x.dyn_ref::<HtmlInputElement>())
                .map(|x| x.value())
        })
        .unwrap_or_default()
}

/// Order `tables` as a forest by derivation, with pending derivations under
/// their parents.
fn table_rows(
    tables: &[String],
    derived: &BTreeMap<String, DerivedTableConfig>,
    pending: &BTreeSet<String>,
    joins: &BTreeSet<String>,
    orphans: bool,
) -> Vec<TableRow> {
    let hosted = tables.iter().cloned().collect::<BTreeSet<_>>();
    let parent = |name: &str| derived.get(name).map(|config| config.table.clone());
    let kind = |name: &str| {
        if pending.contains(name) {
            TableKind::Pending
        } else if derived.contains_key(name) {
            TableKind::Derived
        } else if joins.contains(name) {
            TableKind::Join
        } else {
            TableKind::Base
        }
    };

    let known = hosted.union(pending).cloned().collect::<BTreeSet<_>>();
    let mut rows = vec![];
    let mut stack = known
        .iter()
        .rev()
        .filter(|name| match parent(name) {
            None => hosted.contains(*name),
            Some(parent) if known.contains(&parent) => false,
            Some(_) => hosted.contains(*name) || orphans,
        })
        .map(|name| (name.clone(), 0))
        .collect::<Vec<_>>();

    let mut seen = BTreeSet::new();
    while let Some((name, depth)) = stack.pop() {
        if !seen.insert(name.clone()) {
            continue;
        }

        let children = known
            .iter()
            .rev()
            .filter(|child| parent(child).as_deref() == Some(name.as_str()))
            .map(|child| (child.clone(), depth + 1));

        stack.extend(children);
        rows.push(TableRow {
            kind: kind(&name),
            name,
            depth,
        });
    }

    rows
}

impl TablesTab {
    fn fetch_columns(&self, ctx: &Context<Self>, client: &str, table: String) {
        let Some(client) = ctx.props().host.workspace.client(client) else {
            return;
        };

        let link = ctx.link().clone();
        ApiFuture::spawn(async move {
            let columns = client.open_table(table.clone()).await?.columns().await?;
            link.send_message(TablesTabMsg::JoinColumns(table, columns));
            Ok(())
        });
    }

    fn client_tables(ctx: &Context<Self>, client: &str) -> Vec<String> {
        ctx.props()
            .host
            .workspace
            .client_listing(client)
            .tables
            .unwrap_or_default()
    }

    fn view_join(&self, ctx: &Context<Self>, form: &JoinForm, is_open: bool) -> Html {
        let tables = Self::client_tables(ctx, &form.client);
        let input = |field: JoinField| {
            ctx.link()
                .callback(move |event: Event| TablesTabMsg::JoinInput(field, input_value(&event)))
        };

        let typed = |field: JoinField| {
            ctx.link().callback(move |event: InputEvent| {
                TablesTabMsg::JoinInput(field, input_value(event.as_ref()))
            })
        };

        let options = |values: &[String], selected: &str| {
            values
                .iter()
                .map(|value| {
                    html! {
                        <option value={value.clone()} selected={value == selected}>
                            { value }
                        </option>
                    }
                })
                .collect::<Html>()
        };

        let types = [JoinType::Inner, JoinType::Left, JoinType::Outer]
            .into_iter()
            .map(|join_type| {
                let name = join_type_name(join_type);
                html! {
                    <option value={name} selected={join_type == form.join_type}>{ name }</option>
                }
            })
            .collect::<Html>();

        let is_valid = !form.left.is_empty() && !form.right.is_empty() && !form.on.is_empty();
        html! {
            <div id="workspace-join-form" class="ws-join-form">
                <label class="ws-label" style={label("join-left")} />
                <select id="workspace-join-left" onchange={input(JoinField::Left)}>
                    { options(&tables, &form.left) }
                </select>
                <label class="ws-label" style={label("join-right")} />
                <select id="workspace-join-right" onchange={input(JoinField::Right)}>
                    { options(&tables, &form.right) }
                </select>
                <label class="ws-label" style={label("join-on")} />
                <select id="workspace-join-on" onchange={input(JoinField::On)}>
                    { options(&form.columns, &form.on) }
                </select>
                <label class="ws-label" style={label("join-right-on")} />
                <input
                    id="workspace-join-right-on"
                    value={form.right_on.clone()}
                    placeholder={form.on.clone()}
                    oninput={typed(JoinField::RightOn)}
                />
                <label class="ws-label" style={label("join-type")} />
                <select id="workspace-join-type" onchange={input(JoinField::Type)}>
                    { types }
                </select>
                <label class="ws-label" style={label("join-name")} />
                <input
                    id="workspace-join-name"
                    value={form.name.clone()}
                    oninput={typed(JoinField::Name)}
                />
                if let Some(error) = &form.error {
                    <div id="workspace-join-error" class="error">{ error }</div>
                }
                <div
                    class="sidebar-controls"
                >
                    <button
                        id="workspace-join-create"
                        class="ws-label"
                        style={label("join-create")}
                        disabled={!is_valid || !is_open || form.submitting}
                        onclick={ctx.link().callback(|_| TablesTabMsg::SubmitJoin)}
                    />
                    <button
                        id="workspace-join-cancel"
                        class="ws-label"
                        style={label("join-cancel")}
                        onclick={ctx.link().callback(|_| TablesTabMsg::CloseJoin)}
                    />
                </div>
            </div>
        }
    }

    fn view_client(&self, ctx: &Context<Self>, client: &ClientStatus, orphans: bool) -> Html {
        let workspace = &ctx.props().host.workspace;
        let listing = workspace.client_listing(&client.name);
        let has_actions = client.is_open && listing.error.is_none();
        let is_listed = !client.is_open || listing.error.is_none();
        let tables = listing
            .tables
            .clone()
            .filter(|_| is_listed)
            .unwrap_or_default();

        let derived = workspace.derived_configs();
        let pending = workspace.derived_pending().into_keys().collect();
        let joins = workspace.joins().into_keys().collect();
        let rows = table_rows(&tables, &derived, &pending, &joins, orphans && is_listed)
            .into_iter()
            .map(|row| {
                let consumers = workspace.table_consumers(&row.name);
                let mut class = classes!("ws-table");
                class.push(match row.kind {
                    TableKind::Base => "is-base",
                    TableKind::Derived => "is-derived",
                    TableKind::Pending => "is-pending",
                    TableKind::Join => "is-join",
                });

                let on_new = (has_actions && row.kind != TableKind::Pending).then(|| {
                    let pick = (client.name.clone(), row.name.clone());
                    ctx.link().callback(move |_: MouseEvent| {
                        TablesTabMsg::NewPanel(pick.0.clone(), pick.1.clone())
                    })
                });

                let is_owned = matches!(row.kind, TableKind::Derived | TableKind::Join);
                let on_delete = (has_actions && is_owned && consumers == 0).then(|| {
                    let name = row.name.clone();
                    ctx.link()
                        .callback(move |_: MouseEvent| TablesTabMsg::Delete(name.clone()))
                });

                let style = format!("padding-left:{}px", 8 + 12 * row.depth);
                html! {
                    <div {class} data-table={row.name.clone()} {style}>
                        <span class="ws-table-name" title={row.name.clone()}>{ &row.name }</span>
                        if consumers > 0 { <span class="ws-table-consumers">{ consumers }</span> }
                        if let Some(onclick) = on_new {
                            <span class="ws-table-new" title="New panel" {onclick} />
                        }
                        if let Some(onclick) = on_delete {
                            <span class="ws-table-delete" title="Delete this table" {onclick} />
                        }
                    </div>
                }
            })
            .collect::<Html>();

        let status_class = match client.state() {
            StatusState::Errored => "errored",
            StatusState::Loading => "loading",
            StatusState::Pending => "pending",
            StatusState::Updating => "updating",
            StatusState::Normal | StatusState::Uninitialized => "connected",
        };

        let on_reconnect = client.can_reconnect.then(|| {
            let name = client.name.clone();
            ctx.link()
                .callback(move |_: MouseEvent| TablesTabMsg::Reconnect(name.clone()))
        });

        let on_retry = (client.is_open && listing.error.is_some()).then(|| {
            let name = client.name.clone();
            ctx.link()
                .callback(move |_: MouseEvent| TablesTabMsg::Retry(name.clone()))
        });

        let on_join = {
            let name = client.name.clone();
            ctx.link()
                .callback(move |_: MouseEvent| TablesTabMsg::OpenJoin(name.clone()))
        };

        let is_loading = client.is_open && listing.tables.is_none() && listing.error.is_none();
        let listing_error = listing.error.clone().filter(|_| client.is_open);
        let form = self.join.as_ref().filter(|form| form.client == client.name);
        let mut class = classes!("ws-client");
        if !client.is_open {
            class.push("is-lost");
        }

        html! {
            <div {class} data-client={client.name.clone()}>
                <div class="ws-client-header">
                    <span class={classes!("ws-client-status", status_class)} />
                    <span class="ws-client-name" title={client.name.clone()}>{ &client.name }</span>
                    if client.is_default {
                        <span class="ws-client-default ws-label" style={label("client-default")} />
                    }
                    <span
                        class="ws-client-panels"
                    >
                        { client.panels.len() }
                    </span>
                </div>
                if let Some(error) = &client.error {
                    <div class="ws-client-error error">
                        { format!("{} {}", error.kind, error.message) }
                    </div>
                }
                if let Some(error) = listing_error {
                    <div class="ws-client-listing-error error">{ error }</div>
                }
                <div
                    class="sidebar-controls"
                >
                    if let Some(onclick) = on_reconnect {
                        <button
                            class="ws-client-reconnect ws-label"
                            style={label("client-reconnect")}
                            {onclick}
                        />
                    }
                    if let Some(onclick) = on_retry {
                        <button
                            class="ws-client-retry ws-label"
                            style={label("client-retry")}
                            {onclick}
                        />
                    }
                    <button
                        class="ws-client-join ws-label"
                        style={label("join-open")}
                        disabled={!has_actions || form.is_some() || tables.is_empty()}
                        onclick={on_join}
                    />
                </div>
                if is_loading {
                    <span class="ws-client-loading no-results ws-label" style={label("tables-loading")} />
                }
                <div class="ws-tables">{ rows }</div>
                if let Some(form) = form { { self.view_join(ctx, form, has_actions) } }
            </div>
        }
    }
}

impl Component for TablesTab {
    type Message = TablesTabMsg;
    type Properties = TablesTabProps;

    fn create(ctx: &Context<Self>) -> Self {
        let workspace = &ctx.props().host.workspace;
        let changed = ctx.link().callback(|()| TablesTabMsg::Changed);
        let registered = ctx.link().callback(|()| TablesTabMsg::ClientRegistered);
        let subs = vec![
            workspace
                .hosted_tables_changed()
                .add_notify_listener(&changed),
            workspace
                .client_registered()
                .add_notify_listener(&registered),
            workspace.bindings_changed().add_notify_listener(&changed),
        ];

        refresh_listings(workspace);
        Self {
            join: None,
            error: None,
            sizer: NodeRef::default(),
            _subs: subs,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            TablesTabMsg::Changed => true,
            TablesTabMsg::ClientRegistered => {
                refresh_listings(&ctx.props().host.workspace);
                true
            },
            TablesTabMsg::Retry(client) => {
                let workspace = ctx.props().host.workspace.clone();
                if let Some(client) = workspace.client(&client) {
                    ApiFuture::spawn(async move {
                        workspace.list_tables(&client).await;
                        Ok(())
                    });
                }

                false
            },
            TablesTabMsg::NewPanel(client, table) => {
                self.error = None;
                let host = ctx.props().host.clone();
                let Some(client) = host
                    .workspace
                    .client(&client)
                    .filter(|x| x.connection().is_open())
                else {
                    self.error = Some(format!("`Client` \"{client}\" is not connected"));
                    return true;
                };

                let link = ctx.link().clone();
                let effect = host.workspace.effects().guard();
                ApiFuture::spawn(async move {
                    let _effect = effect;
                    let notify = host
                        .dispatch
                        .reform(|()| PerspectiveViewerMsg::LayoutChanged);

                    let created = create_panel(
                        &host.elem,
                        &host.presentation,
                        &host.workspace,
                        &notify,
                        None,
                        ViewerConfigInitial::new(table),
                        Some(client),
                        MissingTable::Error,
                    )
                    .await;

                    match created {
                        Ok(id) => host
                            .dispatch
                            .emit(PerspectiveViewerMsg::SetActivePanel(id.to_string(), None)),
                        Err(err) => link.send_message(TablesTabMsg::Failed(format!("{err}"))),
                    }

                    Ok(())
                });

                true
            },
            TablesTabMsg::Reconnect(client) => {
                self.error = None;
                let host = ctx.props().host.clone();
                let link = ctx.link().clone();
                let effect = host.workspace.effects().guard();
                ApiFuture::spawn(async move {
                    let _effect = effect;
                    let reconnected =
                        reconnect_client(&host.workspace, &host.presentation, &client).await;

                    if let Err(err) = reconnected {
                        link.send_message(TablesTabMsg::Failed(format!("{err}")));
                    }

                    Ok(())
                });

                true
            },
            TablesTabMsg::Delete(name) => {
                self.error = None;
                let workspace = ctx.props().host.workspace.clone();
                let link = ctx.link().clone();
                let effect = workspace.effects().guard();
                ApiFuture::spawn(async move {
                    let _effect = effect;
                    let result = if workspace.is_derived(&name) {
                        delete_derived(&workspace, &name).await
                    } else {
                        delete_join(&workspace, &name).await
                    };

                    if let Err(err) = result {
                        link.send_message(TablesTabMsg::Failed(format!("{err}")));
                    }

                    Ok(())
                });

                true
            },
            TablesTabMsg::Failed(error) => {
                self.error = Some(error);
                true
            },
            TablesTabMsg::OpenJoin(client) => {
                let tables = Self::client_tables(ctx, &client);
                let left = tables.first().cloned().unwrap_or_default();
                let right = tables.get(1).cloned().unwrap_or_else(|| left.clone());
                self.fetch_columns(ctx, &client, left.clone());
                self.join = Some(JoinForm {
                    client,
                    left,
                    right,
                    on: String::new(),
                    right_on: String::new(),
                    join_type: JoinType::Inner,
                    name: String::new(),
                    columns: vec![],
                    error: None,
                    submitting: false,
                });

                true
            },
            TablesTabMsg::CloseJoin => {
                self.join = None;
                true
            },
            TablesTabMsg::JoinInput(field, value) => {
                let Some(form) = self.join.as_mut() else {
                    return false;
                };

                form.error = None;
                match field {
                    JoinField::Left => {
                        form.left = value.clone();
                        form.on = String::new();
                        form.columns = vec![];
                        let client = form.client.clone();
                        self.fetch_columns(ctx, &client, value);
                    },
                    JoinField::Right => form.right = value,
                    JoinField::On => form.on = value,
                    JoinField::RightOn => form.right_on = value,
                    JoinField::Name => form.name = value,
                    JoinField::Type => {
                        form.join_type = match value.as_str() {
                            "left" => JoinType::Left,
                            "outer" => JoinType::Outer,
                            _ => JoinType::Inner,
                        }
                    },
                }

                true
            },
            TablesTabMsg::JoinColumns(table, columns) => match self.join.as_mut() {
                Some(form) if form.left == table => {
                    form.on = columns.first().cloned().unwrap_or_default();
                    form.columns = columns;
                    true
                },
                _ => false,
            },
            TablesTabMsg::SubmitJoin => {
                let Some(form) = self.join.as_mut() else {
                    return false;
                };

                form.submitting = true;
                form.error = None;
                let non_empty = |x: &str| (!x.trim().is_empty()).then(|| x.trim().to_owned());
                let spec = JoinSpec {
                    left: form.left.clone(),
                    right: form.right.clone(),
                    on: form.on.clone(),
                    right_on: non_empty(&form.right_on),
                    join_type: Some(form.join_type),
                    name: non_empty(&form.name),
                };

                let client = form.client.clone();
                let workspace = ctx.props().host.workspace.clone();
                let link = ctx.link().clone();
                let effect = workspace.effects().guard();
                ApiFuture::spawn(async move {
                    let _effect = effect;
                    let result = create_join(&workspace, &client, spec).await;
                    link.send_message(TablesTabMsg::JoinFinished(
                        result.map_err(|err| format!("{err}")),
                    ));

                    Ok(())
                });

                true
            },
            TablesTabMsg::JoinFinished(Ok(())) => {
                self.join = None;
                true
            },
            TablesTabMsg::JoinFinished(Err(error)) => {
                if let Some(form) = self.join.as_mut() {
                    form.submitting = false;
                    form.error = Some(error);
                }

                true
            },
        }
    }

    fn rendered(&mut self, ctx: &Context<Self>, _first_render: bool) {
        if let Some(elem) = self.sizer.cast::<HtmlElement>() {
            ctx.props()
                .on_auto_width
                .emit(elem.get_bounding_client_rect().width());
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let clients = &ctx.props().status.clients;
        let sections = clients
            .iter()
            .enumerate()
            .map(|(index, client)| self.view_client(ctx, client, index == 0))
            .collect::<Html>();

        let panels = ctx
            .props()
            .panels
            .iter()
            .map(|(id, title)| {
                let onclick = {
                    let id = id.clone();
                    ctx.props()
                        .on_derive_panel
                        .reform(move |_: MouseEvent| id.clone())
                };

                let text = title.clone().unwrap_or_else(|| id.clone());
                html! {
                    <div class="ws-derive-panel" data-panel={id.clone()} {onclick}>
                        <span class="ws-table-name" title={text.clone()}>{ text }</span>
                    </div>
                }
            })
            .collect::<Html>();

        html! {
            <div id="workspace-tables-overflow" class="scrollable">
                <div id="workspace-tables" class="sidebar_column" ref={self.sizer.clone()}>
                    if let Some(error) = &self.error {
                        <div id="workspace-tables-error" class="error">{ error }</div>
                    }
                    if clients.is_empty() {
                        <span class="no-results ws-label" style={label("tables-no-clients")} />
                    }
                    { sections }
                    if !ctx.props().panels.is_empty() {
                        <div class="ws-section">
                            <span
                                class="ws-section-label ws-label"
                                style={label("derive-from-panel")}
                            />
                            { panels }
                        </div>
                    }
                    <div
                        class="scroll-panel-auto-width"
                        style={format!("width:{}px", ctx.props().initial_width)}
                    />
                </div>
            </div>
        }
    }
}

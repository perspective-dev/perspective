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

use yew::prelude::*;

/// A pick in the "New" menu: a fresh panel on a hosted `Table`, or a copy of
/// an existing panel (the same operation as the context menu's "Duplicate").
#[derive(Clone, PartialEq)]
pub enum NewPanelPick {
    FromTable { client: String, table: String },
    FromPanel(String),
}

/// `(client name, its hosted table names)` per open client, as
/// `Workspace::open_hosted_tables` lists them.
pub type HostedTables = Rc<Vec<(String, Vec<String>)>>;

/// `(panel id, title)` per panel, in layout-insertion order.
pub type PanelLabels = Rc<Vec<(String, Option<String>)>>;

/// Consumer count per derived `Table` name, which marks those rows and gates
/// their delete affordance.
pub type DerivedCounts = Rc<std::collections::BTreeMap<String, usize>>;

#[derive(Properties, PartialEq)]
pub struct NewPanelMenuProps {
    /// `None` while the hosted-table fetch is in flight.
    pub tables: Option<HostedTables>,
    pub panels: PanelLabels,
    pub callback: Callback<NewPanelPick>,

    #[prop_or_default]
    pub derived: DerivedCounts,

    /// Delete a derived `Table`, offered only where nothing reads it.
    #[prop_or_default]
    pub on_delete: Option<Callback<String>>,
}

/// The "New" menu body shared by the status bar dropdown and the context
/// menu's "New" flyout.
#[function_component]
pub fn NewPanelMenu(props: &NewPanelMenuProps) -> Html {
    let pick = |value: NewPanelPick| props.callback.reform(move |_: MouseEvent| value.clone());

    let tables = match &props.tables {
        None => html! { <span class="no-results">{ "Loading..." }</span> },
        Some(clients) if clients.iter().all(|(_, tables)| tables.is_empty()) => {
            html! { <span class="no-results">{ "No tables" }</span> }
        },
        Some(clients) => {
            let multi = clients.len() > 1;
            clients
                .iter()
                .map(|(client, tables)| {
                    let rows = tables.iter().map(|table| {
                        let onmousedown = pick(NewPanelPick::FromTable {
                            client: client.clone(),
                            table: table.clone(),
                        });

                        let consumers = props.derived.get(table).copied();
                        let mut class = classes!("dropdown-menu-item");
                        if consumers.is_some() {
                            class.push("is-derived");
                        }

                        let on_delete = props
                            .on_delete
                            .clone()
                            .filter(|_| consumers == Some(0))
                            .map(|cb| {
                                let table = table.clone();
                                Callback::from(move |event: MouseEvent| {
                                    event.prevent_default();
                                    event.stop_propagation();
                                    cb.emit(table.clone());
                                })
                            });

                        html! {
                            <span {class} {onmousedown}>
                                <span class="dropdown-menu-label" title={table.clone()}>
                                    { table }
                                </span>
                                if let Some(count) = consumers.filter(|x| *x > 0) {
                                    <span class="derived_consumers">{ count }</span>
                                }
                                if let Some(on_delete) = on_delete {
                                    <span
                                        class="derived_delete"
                                        title="Delete this derived table"
                                        onmousedown={on_delete}
                                        // The menu stays OPEN after a delete, so the
                                        // CLICK half of the gesture must not bubble to
                                        // the context-menu flyout's Submenu row, whose
                                        // own `onclick` would fire "New" AND close the
                                        // session.
                                        onclick={Callback::from(|event: MouseEvent| {
                                            event.stop_propagation();
                                        })}
                                    />
                                }
                            </span>
                        }
                    });

                    html! {
                        <>
                            if multi { <span class="dropdown-group-sublabel">{ client }</span> }
                            { for rows }
                        </>
                    }
                })
                .collect::<Html>()
        },
    };

    let panels = if props.panels.is_empty() {
        html! { <span class="no-results">{ "No panels" }</span> }
    } else {
        props
            .panels
            .iter()
            .map(|(id, title)| {
                let onmousedown = pick(NewPanelPick::FromPanel(id.clone()));
                let label = title.clone().unwrap_or_else(|| id.clone());
                html! {
                    <span class="dropdown-menu-item" {onmousedown}>
                        <span class="dropdown-menu-label" title={label.clone()}>{ label }</span>
                    </span>
                }
            })
            .collect::<Html>()
    };

    html! {
        <div class="new-panel-menu">
            <span class="dropdown-group-label" data-label="new-from-table" />
            <div class="dropdown-group-container">{ tables }</div>
            <span class="dropdown-group-label" data-label="new-from-panel" />
            <div class="dropdown-group-container">{ panels }</div>
        </div>
    }
}

/// Consumer counts for every derived `Table` the workspace owns.
pub fn derived_counts(
    workspace: &crate::workspace::Workspace,
) -> crate::components::new_panel_menu::DerivedCounts {
    std::rc::Rc::new(
        workspace
            .derived_names()
            .into_iter()
            .map(|name| {
                let count = workspace.derived_consumers(&name);
                (name, count)
            })
            .collect(),
    )
}

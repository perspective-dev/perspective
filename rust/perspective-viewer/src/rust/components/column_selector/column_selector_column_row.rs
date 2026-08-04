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

use perspective_client::config::ColumnType;
use web_sys::DragEvent;
use yew::prelude::*;

use crate::components::type_icon::TypeIcon;

/// The draggable row of a `column-selector-column`
#[derive(Clone, PartialEq, Properties)]
pub struct ColumnSelectorColumnRowProps {
    pub name: String,

    #[prop_or_default]
    pub col_type: Option<ColumnType>,

    #[prop_or_default]
    pub aggregate: Option<Html>,

    /// Trailing affordance (e.g. the edit button in the active list).
    #[prop_or_default]
    pub trailing: Html,

    #[prop_or_default]
    pub wrapper_class: Classes,

    #[prop_or_default]
    pub wrapper_ref: NodeRef,

    #[prop_or_default]
    pub ondragstart: Option<Callback<DragEvent>>,

    #[prop_or_default]
    pub ondragend: Option<Callback<DragEvent>>,
}

#[function_component]
pub fn ColumnSelectorColumnRow(p: &ColumnSelectorColumnRowProps) -> Html {
    let mut classes = classes!["column-selector-draggable"];
    if p.aggregate.is_some() {
        classes.push("show-aggregate");
    }

    classes.extend(p.wrapper_class.clone());
    html! {
        <div
            class={classes}
            ref={&p.wrapper_ref}
            draggable={p.ondragstart.is_some().then_some("true")}
            ondragstart={p.ondragstart.clone()}
            ondragend={p.ondragend.clone()}
        >
            <div class="column-selector-column-border">
                <span class="drag-handle icon" />
                <TypeIcon ty={p.col_type.unwrap_or(ColumnType::String)} />
                if let Some(aggregate) = &p.aggregate { { aggregate.clone() } }
                <span class="column_name">{ p.name.clone() }</span>
                if p.aggregate.is_none() { <span class="column-selector--spacer" /> }
                { p.trailing.clone() }
            </div>
        </div>
    }
}

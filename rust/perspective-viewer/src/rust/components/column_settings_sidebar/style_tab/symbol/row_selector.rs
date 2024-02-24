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

use std::collections::HashSet;
use std::rc::Rc;

use itertools::Itertools;
use perspective_client::clone;
use yew::{function_component, html, Html, Properties};

use super::symbol_config::SymbolKVPair;
use crate::components::empty_row::EmptyRow;
use crate::custom_elements::FilterDropDownElement;

#[derive(Properties, PartialEq)]
pub struct RowSelectorProps {
    pub selected_row: Option<String>,
    pub on_select: yew::Callback<String>,
    pub dropdown: Rc<FilterDropDownElement>,
    pub pairs: Vec<SymbolKVPair>,
    pub index: usize,
    pub focused: bool,
    pub set_focused_index: yew::Callback<Option<usize>>,
    pub column_name: String,
}

#[function_component(RowSelector)]
pub fn row_selector(props: &RowSelectorProps) -> Html {
    let on_select = {
        clone!(props.dropdown, props.index, props.set_focused_index);
        props.on_select.reform(move |key| {
            dropdown.hide().unwrap();
            set_focused_index.emit(Some(index + 1));
            key
        })
    };

    let ondblclick = {
        clone!(props.set_focused_index, props.index);
        yew::Callback::from(move |_| {
            set_focused_index.emit(Some(index));
        })
    };

    let err_class = (props.index != props.pairs.len() - 1).then_some("row-selector-errored");

    let inner = if props.selected_row.is_none() || props.focused {
        let mut pairs = props.pairs.clone();
        if let Some(ref rowval) = props.selected_row {
            if let Some((i, _)) = pairs.iter().find_position(|pair| {
                pair.key
                    .as_ref()
                    .map(|keyval| keyval == rowval)
                    .unwrap_or_default()
            }) {
                pairs.remove(i);
            }
        }

        let exclude: HashSet<_> = pairs
            .into_iter()
            .filter_map(|SymbolKVPair { key, .. }| key)
            .collect();

        html! {
            <div class={err_class}>
                <EmptyRow
                    dropdown={props.dropdown.clone()}
                    {exclude}
                    {on_select}
                    focused={props.focused}
                    index={props.index}
                    set_focused_index={props.set_focused_index.clone()}
                    value={props.selected_row.clone().unwrap_or_default()}
                    column_name={props.column_name.clone()}
                />
            </div>
        }
    } else {
        html! {
            <div class="row-selector column-selector-column">
                <div class="column-selector-column-border">
                    <span class="column_name none" {ondblclick}>
                        { props.selected_row.clone().unwrap() }
                    </span>
                </div>
            </div>
        }
    };

    html! { <div class="row-selector">{ inner }</div> }
}

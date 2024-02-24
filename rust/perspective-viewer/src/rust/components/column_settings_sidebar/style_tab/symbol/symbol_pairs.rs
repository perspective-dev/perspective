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

use itertools::Itertools;
use perspective_client::config::Symbol;
use yew::{html, Callback, Html, Properties};

use super::symbol_config::SymbolKVPair;
use crate::components::column_settings_sidebar::style_tab::symbol::row_selector::RowSelector;
use crate::components::column_settings_sidebar::style_tab::symbol::symbol_selector::SymbolSelector;
use crate::components::style::LocalStyle;
use crate::css;
use crate::custom_elements::FilterDropDownElement;

#[derive(Properties, PartialEq)]
pub struct PairsListProps {
    pub title: String,
    pub pairs: Vec<SymbolKVPair>,
    pub update_pairs: Callback<Vec<SymbolKVPair>>,
    pub id: Option<String>,
    pub row_dropdown: Rc<FilterDropDownElement>,
    pub values: Vec<String>,
    pub column_name: String,
}

pub enum PairsListMsg {
    SetNextFocus(Option<usize>),
}

pub struct PairsList {
    next_focus: Option<usize>,
}

impl yew::Component for PairsList {
    type Message = PairsListMsg;
    type Properties = PairsListProps;

    fn create(_ctx: &yew::Context<Self>) -> Self {
        Self { next_focus: None }
    }

    fn update(&mut self, _ctx: &yew::Context<Self>, msg: Self::Message) -> bool {
        match msg {
            PairsListMsg::SetNextFocus(i) => self.next_focus = i,
        }

        true
    }

    fn view(&self, ctx: &yew::Context<Self>) -> Html {
        let props = ctx.props();
        let set_focused = ctx.link().callback(PairsListMsg::SetNextFocus);
        let main_pairs = props
            .pairs
            .iter()
            .enumerate()
            .map(|(index, pair)| {
                let focused = self.next_focus.map(|s| s == index).unwrap_or_default();
                html! {
                    <PairsListItem
                        pair={pair.clone()}
                        {index}
                        pairs={props.pairs.clone()}
                        row_dropdown={props.row_dropdown.clone()}
                        values={props.values.clone()}
                        update_pairs={props.update_pairs.clone()}
                        set_focused_index={set_focused.clone()}
                        column_name={props.column_name.clone()}
                        {focused}
                    />
                }
            })
            .collect_vec();

        html! {
            <>
                <LocalStyle href={css!("containers/pairs-list")} />
                <div class="pairs-list" id={props.id.clone()} data-label={props.title.clone()}>
                    <ul>{ for main_pairs }</ul>
                </div>
            </>
        }
    }
}

#[derive(Properties, PartialEq)]
pub struct PairsListItemProps {
    pub pair: SymbolKVPair,
    pub index: usize,
    pub pairs: Vec<SymbolKVPair>,
    pub update_pairs: Callback<Vec<SymbolKVPair>>,
    pub row_dropdown: Rc<FilterDropDownElement>,
    pub values: Vec<String>,
    pub focused: bool,
    pub set_focused_index: Callback<Option<usize>>,
    pub column_name: String,
}

pub enum PairListItemMsg {
    Remove,
    UpdateKey(Option<String>),
    UpdateValue(String),
}

pub struct PairsListItem {}
impl yew::Component for PairsListItem {
    type Message = PairListItemMsg;
    type Properties = PairsListItemProps;

    fn create(_ctx: &yew::Context<Self>) -> Self {
        Self {}
    }

    fn update(&mut self, ctx: &yew::Context<Self>, msg: Self::Message) -> bool {
        let p = ctx.props();
        match msg {
            PairListItemMsg::Remove => {
                let mut new_pairs = p.pairs.clone();
                new_pairs.remove(p.index);
                p.update_pairs.emit(new_pairs);
                true
            },
            PairListItemMsg::UpdateKey(key) => {
                let next = p.pair.update_key(key);
                let mut new_pairs = p.pairs.clone();
                new_pairs[p.index] = next;
                p.update_pairs.emit(new_pairs);
                true
            },
            PairListItemMsg::UpdateValue(val) => {
                let next = p.pair.update_value(val);
                let mut new_pairs = p.pairs.clone();
                new_pairs[p.index] = next;
                p.update_pairs.emit(new_pairs);
                true
            },
        }
    }

    fn view(&self, ctx: &yew::Context<Self>) -> Html {
        let props = ctx.props();
        let on_remove = ctx.link().callback(|_| PairListItemMsg::Remove);
        let on_key_update = ctx.link().callback(|s| PairListItemMsg::UpdateKey(Some(s)));
        let on_value_update = ctx.link().callback(PairListItemMsg::UpdateValue);

        let remove_style =
            (ctx.props().index == ctx.props().pairs.len() - 1).then_some("visibility: hidden");

        html! {
            <li class="pairs-list-item">
                <RowSelector
                    selected_row={props.pair.key.clone()}
                    on_select={on_key_update.clone()}
                    dropdown={props.row_dropdown.clone()}
                    pairs={props.pairs.clone()}
                    index={props.index}
                    focused={props.focused}
                    set_focused_index={props.set_focused_index.clone()}
                    column_name={props.column_name.clone()}
                />
                <SymbolSelector
                    index={props.index}
                    callback={on_value_update}
                    values={props.values.clone()}
                    selected_value={props.pair.value.clone()}
                />
                <span
                    class="toggle-mode is_column_active"
                    style={remove_style}
                    onclick={on_remove.clone()}
                />
            </li>
        }
    }
}

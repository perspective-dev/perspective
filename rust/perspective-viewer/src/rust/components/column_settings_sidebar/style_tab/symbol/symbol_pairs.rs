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
use yew::{Callback, Html, Properties, html};

use crate::components::column_settings_sidebar::style_tab::symbol::symbol_pairs_item::PairsListItem;
use crate::components::filter_dropdown::FilterDropDownElement;
use crate::config::SymbolKVPair;
use crate::utils::PtrEqRc;

#[derive(Properties, PartialEq)]
pub struct PairsListProps {
    pub title: String,
    pub pairs: Vec<SymbolKVPair>,
    pub update_pairs: Callback<Vec<SymbolKVPair>>,
    pub id: Option<String>,
    pub row_dropdown: Rc<FilterDropDownElement>,
    pub values: PtrEqRc<Vec<String>>,
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
                <div class="pairs-list" id={props.id.clone()} data-label={props.title.clone()}>
                    <ul>{ for main_pairs }</ul>
                </div>
            </>
        }
    }
}

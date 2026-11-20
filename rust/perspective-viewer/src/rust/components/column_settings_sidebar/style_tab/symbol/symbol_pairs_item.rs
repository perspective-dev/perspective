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

use yew::{Callback, Html, Properties, html};

use crate::components::column_settings_sidebar::style_tab::symbol::row_selector::RowSelector;
use crate::components::filter_dropdown::FilterDropDownElement;
use crate::config::SymbolKVPair;
use crate::ui::SymbolSelector;
use crate::utils::PtrEqRc;

#[derive(Properties, PartialEq)]
pub struct PairsListItemProps {
    pub pair: SymbolKVPair,
    pub index: usize,
    pub pairs: Vec<SymbolKVPair>,
    pub update_pairs: Callback<Vec<SymbolKVPair>>,
    pub row_dropdown: Rc<FilterDropDownElement>,
    pub values: PtrEqRc<Vec<String>>,
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

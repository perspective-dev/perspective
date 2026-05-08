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

mod row_selector;

mod symbol_pairs;
mod symbol_pairs_item;
mod symbol_selector;

use std::collections::HashMap;
use std::rc::Rc;

use itertools::Itertools;
use yew::{Callback, Html, Properties, html};

use crate::components::column_settings_sidebar::style_tab::symbol::symbol_pairs::PairsList;
use crate::components::filter_dropdown::{FilterDropDownElement, FilterDropDownPortal};
use crate::components::style::LocalStyle;
use crate::config::{ColumnConfigFieldUpdate, KeyValueOpts, SymbolKVPair};
use crate::css;
use crate::session::Session;

#[derive(Properties, PartialEq, Clone)]
pub struct SymbolAttrProps {
    pub session: Session,
    pub column_name: String,
    pub restored_config: Option<HashMap<String, String>>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,
    pub default_config: KeyValueOpts,
    /// Selected theme name, threaded for PortalModal consumers.
    pub selected_theme: Option<String>,
    #[prop_or_default]
    pub keys: Vec<String>,
}
impl SymbolAttrProps {
    pub fn next_default_symbol(&self, pairs_len: usize) -> String {
        let values = &self.default_config.values;
        values.get(pairs_len % values.len()).cloned().unwrap()
    }
}

pub enum SymbolAttrMsg {
    UpdatePairs(Vec<SymbolKVPair>),
}

pub struct SymbolStyle {
    pairs: Vec<SymbolKVPair>,
    row_dropdown: Rc<FilterDropDownElement>,
}

impl yew::Component for SymbolStyle {
    type Message = SymbolAttrMsg;
    type Properties = SymbolAttrProps;

    fn create(ctx: &yew::Context<Self>) -> Self {
        let pairs = ctx
            .props()
            .restored_config
            .as_ref()
            .map(|restored_config| {
                let mut pairs = restored_config
                    .iter()
                    .map(|(key, value)| SymbolKVPair::new(Some(key.to_owned()), value.to_owned()))
                    .collect_vec();

                pairs.push(SymbolKVPair::new(
                    None,
                    ctx.props().next_default_symbol(pairs.len()),
                ));
                pairs
            })
            .unwrap_or_default();
        let row_dropdown = Rc::new(FilterDropDownElement::new(ctx.props().session.clone()));
        Self {
            pairs,
            row_dropdown,
        }
    }

    fn update(&mut self, ctx: &yew::Context<Self>, msg: Self::Message) -> bool {
        match msg {
            SymbolAttrMsg::UpdatePairs(mut new_pairs) => {
                let symbols = new_pairs
                    .clone()
                    .into_iter()
                    .filter_map(|pair| Some((pair.key?, pair.value)))
                    .collect::<HashMap<_, _>>();
                let mut value = serde_json::Map::new();
                if !symbols.is_empty() {
                    value.insert(
                        "symbols".to_owned(),
                        serde_json::to_value(&symbols).unwrap_or(serde_json::Value::Null),
                    );
                }
                ctx.props().on_change.emit(ColumnConfigFieldUpdate {
                    keys: ctx.props().keys.clone(),
                    value,
                });

                let has_last_key = new_pairs
                    .last()
                    .map(|pair| pair.key.is_some())
                    .unwrap_or_default();

                if has_last_key {
                    let val = ctx.props().next_default_symbol(new_pairs.len());
                    new_pairs.push(SymbolKVPair::new(None, val))
                }

                self.pairs = new_pairs;
                true
            },
        }
    }

    fn view(&self, ctx: &yew::Context<Self>) -> Html {
        let update_pairs = ctx.link().callback(SymbolAttrMsg::UpdatePairs);
        html! {
            <>
                <LocalStyle href={css!("column-symbol-attributes")} />
                <PairsList
                    title="Symbols"
                    id="attributes-symbols"
                    pairs={self.pairs.clone()}
                    row_dropdown={self.row_dropdown.clone()}
                    column_name={ctx.props().column_name.clone()}
                    values={Rc::new(ctx.props().default_config.values.clone())}
                    {update_pairs}
                />
                <FilterDropDownPortal
                    element={(*self.row_dropdown).clone()}
                    theme={ctx.props().selected_theme.clone().unwrap_or_default()}
                />
            </>
        }
    }
}

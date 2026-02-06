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

use web_sys::*;
use yew::prelude::*;

use super::column_selector::InPlaceColumn;
use super::modal::*;
use crate::utils::WeakScope;

static CSS: &str = include_str!(concat!(env!("OUT_DIR"), "/css/column-dropdown.css"));

#[derive(Properties, PartialEq)]
pub struct ColumnDropDownProps {
    #[prop_or_default]
    pub weak_link: WeakScope<ColumnDropDown>,
}

impl ModalLink<ColumnDropDown> for ColumnDropDownProps {
    fn weak_link(&self) -> &'_ WeakScope<ColumnDropDown> {
        &self.weak_link
    }
}

pub enum ColumnDropDownMsg {
    SetValues(Vec<InPlaceColumn>, f64),
    SetCallback(Callback<InPlaceColumn>),
    ItemDown,
    ItemUp,
    ItemSelect,
}

pub struct ColumnDropDown {
    values: Option<Vec<InPlaceColumn>>,
    selected: usize,
    width: f64,
    on_select: Option<Callback<InPlaceColumn>>,
}

impl Component for ColumnDropDown {
    type Message = ColumnDropDownMsg;
    type Properties = ColumnDropDownProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        Self {
            values: Some(vec![]),
            selected: 0,
            width: 0.0,
            on_select: None,
        }
    }

    fn update(&mut self, _ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            ColumnDropDownMsg::SetCallback(callback) => {
                self.on_select = Some(callback);
                false
            },
            ColumnDropDownMsg::SetValues(values, width) => {
                self.values = Some(values);
                self.selected = 0;
                self.width = width;
                true
            },
            ColumnDropDownMsg::ItemSelect => {
                if let Some(ref values) = self.values {
                    match values.get(self.selected) {
                        None => {
                            console::error_1(&"Selected out-of-bounds".into());
                            false
                        },
                        Some(x) => {
                            self.on_select.as_ref().unwrap().emit(x.clone());
                            false
                        },
                    }
                } else {
                    console::error_1(&"No Values".into());
                    false
                }
            },
            ColumnDropDownMsg::ItemDown => {
                self.selected += 1;
                if let Some(ref values) = self.values
                    && self.selected >= values.len()
                {
                    self.selected = 0;
                }

                true
            },
            ColumnDropDownMsg::ItemUp => {
                if let Some(ref values) = self.values
                    && self.selected < 1
                {
                    self.selected = values.len();
                }

                self.selected -= 1;
                true
            },
        }
    }

    fn changed(&mut self, _ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        false
    }

    fn view(&self, _ctx: &Context<Self>) -> Html {
        let body = html! {
            if let Some(ref values) = self.values {
                if !values.is_empty() {
                    { for values
                            .iter()
                            .enumerate()
                            .map(|(idx, value)| {
                                let click = self.on_select.as_ref().unwrap().reform({
                                    let value = value.clone();
                                    move |_: MouseEvent| value.clone()
                                });

                                let row = match value {
                                    InPlaceColumn::Column(col) => html! {
                                        <span>{ col }</span>
                                    },
                                    InPlaceColumn::Expression(col) =>  html! {
                                        <span id="add-expression">{ col.name.clone() }</span>
                                    },
                                };

                                html! {
                                    if idx == self.selected {
                                        <span onmousedown={ click } class="selected">{ row }</span>
                                    } else {
                                        <span onmousedown={ click }>{ row }</span>
                                    }
                                }
                            }) }
                } else {
                    <span class="no-results" />
                }
            }
        };

        let position = format!(
            ":host{{min-width:{}px;max-width:{}px}}",
            self.width, self.width
        );

        html! { <><style>{ CSS }</style><style>{ position }</style>{ body }</> }
    }
}

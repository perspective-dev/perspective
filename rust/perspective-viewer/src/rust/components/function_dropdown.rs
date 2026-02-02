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

use perspective_client::config::CompletionItemSuggestion;
use web_sys::*;
use yew::prelude::*;

use super::modal::*;
use crate::utils::WeakScope;

static CSS: &str = include_str!(concat!(env!("OUT_DIR"), "/css/function-dropdown.css"));

#[derive(Properties, PartialEq)]
pub struct FunctionDropDownProps {
    #[prop_or_default]
    pub weak_link: WeakScope<FunctionDropDown>,
}

impl ModalLink<FunctionDropDown> for FunctionDropDownProps {
    fn weak_link(&self) -> &'_ WeakScope<FunctionDropDown> {
        &self.weak_link
    }
}

pub enum FunctionDropDownMsg {
    SetValues(Vec<CompletionItemSuggestion>),
    SetCallback(Callback<CompletionItemSuggestion>),
    ItemDown,
    ItemUp,
    ItemSelect,
}

pub struct FunctionDropDown {
    values: Option<Vec<CompletionItemSuggestion>>,
    selected: usize,
    on_select: Option<Callback<CompletionItemSuggestion>>,
}

impl Component for FunctionDropDown {
    type Message = FunctionDropDownMsg;
    type Properties = FunctionDropDownProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        Self {
            values: Some(vec![]),
            selected: 0,
            on_select: None,
        }
    }

    fn update(&mut self, _ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            FunctionDropDownMsg::SetCallback(callback) => {
                self.on_select = Some(callback);
                false
            },
            FunctionDropDownMsg::SetValues(values) => {
                self.values = Some(values);
                self.selected = 0;
                true
            },
            FunctionDropDownMsg::ItemSelect => {
                if let Some(ref values) = self.values {
                    match values.get(self.selected) {
                        None => {
                            console::error_1(&"Selected out-of-bounds".into());
                            false
                        },
                        Some(x) => {
                            self.on_select.as_ref().unwrap().emit(*x);
                            false
                        },
                    }
                } else {
                    console::error_1(&"No Values".into());
                    false
                }
            },
            FunctionDropDownMsg::ItemDown => {
                self.selected += 1;
                if let Some(ref values) = self.values
                    && self.selected >= values.len()
                {
                    self.selected = 0;
                };

                true
            },
            FunctionDropDownMsg::ItemUp => {
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
                                    let value = *value;
                                    move |_: MouseEvent| value
                                });

                                html! {
                                    if idx == self.selected {
                                        <div onmousedown={ click } class="selected">
                                            <span style="font-weight:500">{ value.label }</span>
                                            <br/>
                                            <span style="padding-left:12px">{ value.documentation }</span>
                                        </div>
                                    } else {
                                        <div onmousedown={ click }>
                                            <span style="font-weight:500">{ value.label }</span>
                                            <br/>
                                            <span style="padding-left:12px">{ value.documentation }</span>
                                        </div>
                                    }
                                }
                            }) }
                }
            }
        };

        html! { <><style>{ CSS }</style>{ body }</> }
    }
}

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

use perspective_client::config::Expression;
use web_sys::*;
use yew::prelude::*;

use crate::components::column_dropdown::ColumnDropDownElement;

#[derive(Properties)]
pub struct EmptyColumnProps {
    /// The autocomplete dropdown element.
    pub column_dropdown: ColumnDropDownElement,

    /// Values to exclude from autocomplete
    pub exclude: HashSet<String>,

    /// Fires when a value is selected.
    pub on_select: Callback<InPlaceColumn>,
}

impl PartialEq for EmptyColumnProps {
    fn eq(&self, _other: &Self) -> bool {
        false
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum InPlaceColumn {
    Column(String),
    Expression(Expression<'static>),
}

pub enum EmptyColumnMsg {
    KeyDown(u32),
    Blur,
    Input,
}

use EmptyColumnMsg::*;

#[derive(Default)]
pub struct EmptyColumn {
    input_ref: NodeRef,
}

impl Component for EmptyColumn {
    type Message = EmptyColumnMsg;
    type Properties = EmptyColumnProps;

    fn view(&self, ctx: &Context<Self>) -> Html {
        let onblur = ctx.link().callback(|_| Blur);
        let oninput = ctx.link().callback(|_| Input);
        let onkeydown = ctx
            .link()
            .callback(|event: KeyboardEvent| KeyDown(event.key_code()));

        html! {
            <div class="pivot-column column-empty">
                <input
                    spellcheck="false"
                    ref={self.input_ref.clone()}
                    {onblur}
                    {onkeydown}
                    {oninput}
                    class="column-empty-input"
                />
            </div>
        }
    }

    fn changed(&mut self, _ctx: &Context<Self>, _old_props: &Self::Properties) -> bool {
        if let Some(elem) = self.input_ref.cast::<HtmlInputElement>() {
            elem.blur().unwrap();
        }

        false
    }

    fn destroy(&mut self, ctx: &Context<Self>) {
        ctx.props().column_dropdown.hide().unwrap();
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            Blur => {
                ctx.props().column_dropdown.hide().unwrap();
                if let Some(elem) = self.input_ref.cast::<HtmlInputElement>() {
                    elem.set_value("");
                }

                false
            },
            KeyDown(40) => {
                ctx.props().column_dropdown.item_down();
                false
            },
            KeyDown(38) => {
                ctx.props().column_dropdown.item_up();
                false
            },
            KeyDown(13) => {
                ctx.props().column_dropdown.item_select();
                ctx.props().column_dropdown.hide().unwrap();
                false
            },
            KeyDown(_) => false,
            Input => {
                if let Some(elem) = self.input_ref.cast::<HtmlInputElement>() {
                    ctx.props().column_dropdown.autocomplete(
                        elem,
                        ctx.props().exclude.clone(),
                        ctx.props().on_select.clone(),
                    );
                }

                false
            },
        }
    }

    fn create(_ctx: &Context<Self>) -> Self {
        Self::default()
    }
}

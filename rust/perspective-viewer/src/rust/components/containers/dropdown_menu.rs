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

use std::marker::PhantomData;
use std::rc::Rc;

use web_sys::*;
use yew::prelude::*;

use super::select::SelectItem;

#[derive(Properties, PartialEq)]
pub struct DropDownMenuProps<T>
where
    T: Into<Html> + Clone + PartialEq + 'static,
{
    pub values: Rc<Vec<DropDownMenuItem<T>>>,
    pub callback: Callback<T>,
}

pub struct DropDownMenu<T>
where
    T: Into<Html> + Clone + PartialEq + 'static,
{
    _props: PhantomData<T>,
}

impl<T> Component for DropDownMenu<T>
where
    T: Into<Html> + Clone + PartialEq + 'static,
{
    type Message = ();
    type Properties = DropDownMenuProps<T>;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            _props: Default::default(),
        }
    }

    fn update(&mut self, _ctx: &Context<Self>, _msg: Self::Message) -> bool {
        false
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let values = &ctx.props().values;
        let body = if !values.is_empty() {
            values
                .iter()
                .map(|value| match value {
                    DropDownMenuItem::Option(x) => {
                        let click = ctx.props().callback.reform({
                            let value = x.clone();
                            move |_: MouseEvent| value.clone()
                        });

                        html! {
                            <span onmousedown={click} class="selected">{ x.clone().into() }</span>
                        }
                    },
                    DropDownMenuItem::OptGroup(name, xs) => {
                        html! {
                            <>
                                <span class="dropdown-group-label">{ name.as_ref() }</span>
                                <div class="dropdown-group-container">
                                    { xs.iter().map(|x| {
                                    let click = ctx.props().callback.reform({
                                        let value = x.clone();
                                        move |_: MouseEvent| value.clone()
                                    });
                                    html! {
                                        <span onmousedown={ click }>
                                            { x.clone().into() }
                                        </span>
                                    }
                                }).collect::<Html>() }
                                </div>
                            </>
                        }
                    },
                })
                .collect::<Html>()
        } else {
            html! { <span class="no-results">{ "No Completions" }</span> }
        };

        html! { <>{ body }</> }
    }
}

pub type DropDownMenuItem<T> = SelectItem<T>;

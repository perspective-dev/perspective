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

use std::cell::RefCell;
use std::rc::Rc;

use perspective_client::config::{COMPLETIONS, CompletionItemSuggestion};
use perspective_js::utils::ApiResult;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

use super::portal::PortalModal;
use super::style::StyleSurface;
use crate::utils::*;

#[derive(Default)]
struct FunctionDropDownState {
    values: Vec<CompletionItemSuggestion>,
    selected: usize,
    on_select: Option<Callback<CompletionItemSuggestion>>,
    target: Option<HtmlElement>,
}

#[derive(Clone, Default)]
pub struct FunctionDropDownElement {
    state: Rc<RefCell<FunctionDropDownState>>,
    notify: Rc<PubSub<()>>,
}

impl PartialEq for FunctionDropDownElement {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.state, &other.state)
    }
}

impl ImplicitClone for FunctionDropDownElement {}

impl FunctionDropDownElement {
    pub fn reautocomplete(&self) {
        self.notify.emit(());
    }

    pub fn autocomplete(
        &self,
        input: String,
        target: HtmlElement,
        callback: Callback<CompletionItemSuggestion>,
    ) -> ApiResult<()> {
        let values = filter_values(&input);
        if values.is_empty() {
            self.hide()?;
        } else {
            let mut s = self.state.borrow_mut();
            s.values = values;
            s.selected = 0;
            s.on_select = Some(callback);
            s.target = Some(target);
            drop(s);
            self.notify.emit(());
        }

        Ok(())
    }

    pub fn item_select(&self) {
        let state = self.state.borrow();
        if let Some(value) = state.values.get(state.selected)
            && let Some(ref cb) = state.on_select
        {
            cb.emit(*value);
        }
    }

    pub fn item_down(&self) {
        let mut state = self.state.borrow_mut();
        state.selected += 1;
        if state.selected >= state.values.len() {
            state.selected = 0;
        }

        drop(state);
        self.notify.emit(());
    }

    pub fn item_up(&self) {
        let mut state = self.state.borrow_mut();
        if state.selected < 1 {
            state.selected = state.values.len();
        }

        state.selected -= 1;
        drop(state);
        self.notify.emit(());
    }

    pub fn hide(&self) -> ApiResult<()> {
        self.state.borrow_mut().target = None;
        self.notify.emit(());
        Ok(())
    }
}

#[derive(Properties, PartialEq)]
pub struct FunctionDropDownPortalProps {
    pub element: FunctionDropDownElement,
    pub theme: String,
}

pub struct FunctionDropDownPortal {
    _sub: Subscription,
}

impl Component for FunctionDropDownPortal {
    type Message = ();
    type Properties = FunctionDropDownPortalProps;

    fn create(ctx: &Context<Self>) -> Self {
        let link = ctx.link().clone();
        let sub = ctx
            .props()
            .element
            .notify
            .add_listener(move |()| link.send_message(()));
        Self { _sub: sub }
    }

    fn update(&mut self, _ctx: &Context<Self>, _msg: ()) -> bool {
        true
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let state = ctx.props().element.state.borrow();
        let target = state.target.clone();
        let on_close = {
            let element = ctx.props().element.clone();
            Callback::from(move |()| {
                let _ = element.hide();
            })
        };

        if target.is_some() {
            let values = state.values.clone();
            let selected = state.selected;
            let on_select = state.on_select.clone();
            drop(state);

            html! {
                <PortalModal
                    tag_name="perspective-dropdown"
                    surface={StyleSurface::FunctionDropdown}
                    {target}
                    own_focus=false
                    {on_close}
                    theme={ctx.props().theme.clone()}
                >
                    <FunctionDropDownView {values} {selected} {on_select} />
                </PortalModal>
            }
        } else {
            html! {}
        }
    }
}

#[derive(Properties, PartialEq)]
struct FunctionDropDownViewProps {
    values: Vec<CompletionItemSuggestion>,
    selected: usize,
    on_select: Option<Callback<CompletionItemSuggestion>>,
}

#[function_component]
fn FunctionDropDownView(props: &FunctionDropDownViewProps) -> Html {
    let body = html! {
        if !props.values.is_empty() {
            { for props.values
                    .iter()
                    .enumerate()
                    .map(|(idx, value)| {
                        let click = props.on_select.as_ref().unwrap().reform({
                            let value = *value;
                            move |_: MouseEvent| value
                        });

                        html! {
                            if idx == props.selected {
                                <div onmousedown={click} class="selected">
                                    <span style="font-weight:500">{ value.label }</span>
                                    <br/>
                                    <span style="padding-left:12px">{ value.documentation }</span>
                                </div>
                            } else {
                                <div onmousedown={click}>
                                    <span style="font-weight:500">{ value.label }</span>
                                    <br/>
                                    <span style="padding-left:12px">{ value.documentation }</span>
                                </div>
                            }
                        }
                    }) }
        }
    };

    html! { <>{ body }</> }
}

fn filter_values(input: &str) -> Vec<CompletionItemSuggestion> {
    let input = input.to_lowercase();
    COMPLETIONS
        .iter()
        .filter(|x| x.label.to_lowercase().starts_with(&input))
        .cloned()
        .collect::<Vec<_>>()
}

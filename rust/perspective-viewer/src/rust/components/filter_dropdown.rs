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
use std::collections::HashSet;
use std::rc::Rc;

use perspective_client::clone;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

use super::portal::PortalModal;
use crate::session::Session;
use crate::utils::*;
use crate::*;

static CSS: &str = include_str!(concat!(env!("OUT_DIR"), "/css/filter-dropdown.css"));

#[derive(Default)]
struct FilterDropDownState {
    values: Vec<String>,
    selected: usize,
    on_select: Option<Callback<String>>,
    target: Option<HtmlElement>,
}

#[derive(Clone)]
pub struct FilterDropDownElement {
    state: Rc<RefCell<FilterDropDownState>>,
    session: Session,
    column: Rc<RefCell<Option<(usize, String)>>>,
    all_values: Rc<RefCell<Option<Vec<String>>>>,
    notify: Rc<PubSub<()>>,
}

impl PartialEq for FilterDropDownElement {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.state, &other.state)
    }
}

impl ImplicitClone for FilterDropDownElement {}

impl FilterDropDownElement {
    pub fn new(session: Session) -> Self {
        Self {
            state: Default::default(),
            session,
            column: Default::default(),
            all_values: Default::default(),
            notify: Rc::default(),
        }
    }

    pub fn reautocomplete(&self) {
        // Re-open portal with current target
        self.notify.emit(());
    }

    pub fn autocomplete(
        &self,
        column: (usize, String),
        input: String,
        exclude: HashSet<String>,
        target: HtmlElement,
        callback: Callback<String>,
    ) {
        let current_column = self.column.borrow().clone();
        match current_column {
            Some(filter_col) if filter_col == column => {
                let values = filter_values(&input, &self.all_values, &exclude);
                if values.len() == 1 && values[0] == input {
                    let _ = self.hide();
                } else {
                    let mut s = self.state.borrow_mut();
                    s.values = values;
                    s.selected = 0;
                    s.on_select = Some(callback);
                    if s.target.is_none() {
                        s.target = Some(target);
                    }

                    drop(s);
                    self.notify.emit(());
                }
            },
            _ => {
                clone!(
                    self.state,
                    self.session,
                    self.all_values,
                    self.notify,
                    old_column = self.column
                );
                ApiFuture::spawn(async move {
                    let fetched =
                        crate::queries::get_column_values(&session, column.1.clone()).await?;
                    *all_values.borrow_mut() = Some(fetched);
                    let values = filter_values(&input, &all_values, &exclude);
                    let should_hide = values.len() == 1 && values[0] == input;

                    *old_column.borrow_mut() = Some(column);
                    {
                        let mut s = state.borrow_mut();
                        s.on_select = Some(callback);
                        if should_hide {
                            let fv = self::filter_values("", &all_values, &exclude);
                            s.values = fv;
                            s.target = Some(target);
                        } else {
                            s.values = values;
                            s.target = Some(target);
                        }
                        s.selected = 0;
                    }
                    if should_hide {
                        state.borrow_mut().target = None;
                    }

                    notify.emit(());
                    Ok(())
                });
            },
        }
    }

    pub fn item_select(&self) {
        let state = self.state.borrow();
        if let Some(value) = state.values.get(state.selected)
            && let Some(ref cb) = state.on_select
        {
            cb.emit(value.clone());
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
        self.column.borrow_mut().take();
        self.notify.emit(());
        Ok(())
    }
}

#[derive(Properties, PartialEq)]
pub struct FilterDropDownPortalProps {
    pub element: FilterDropDownElement,
    pub theme: String,
}

pub struct FilterDropDownPortal {
    _sub: Subscription,
}

impl Component for FilterDropDownPortal {
    type Message = ();
    type Properties = FilterDropDownPortalProps;

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
                    {target}
                    own_focus=false
                    {on_close}
                    theme={ctx.props().theme.clone()}
                >
                    <FilterDropDownView {values} {selected} {on_select} />
                </PortalModal>
            }
        } else {
            html! {}
        }
    }
}

#[derive(Properties, PartialEq)]
struct FilterDropDownViewProps {
    values: Vec<String>,
    selected: usize,
    on_select: Option<Callback<String>>,
}

#[function_component]
fn FilterDropDownView(props: &FilterDropDownViewProps) -> Html {
    let body = html! {
        if !props.values.is_empty() {
            { for props.values
                    .iter()
                    .enumerate()
                    .map(|(idx, value)| {
                        let click = props.on_select.as_ref().unwrap().reform({
                            let value = value.clone();
                            move |_: MouseEvent| value.clone()
                        });

                        html! {
                            if idx == props.selected {
                                <span onmousedown={click} class="selected">{ value }</span>
                            } else {
                                <span onmousedown={click}>{ value }</span>
                            }
                        }
                    }) }
        } else {
            <span class="no-results">{ "No Completions" }</span>
        }
    };

    html! { <><style>{ CSS }</style>{ body }</> }
}

fn filter_values(
    input: &str,
    values: &Rc<RefCell<Option<Vec<String>>>>,
    exclude: &HashSet<String>,
) -> Vec<String> {
    let input = input.to_lowercase();
    if let Some(values) = &*values.borrow() {
        values
            .iter()
            .filter(|x| x.to_lowercase().contains(&input) && !exclude.contains(x.as_str()))
            .take(10)
            .cloned()
            .collect::<Vec<String>>()
    } else {
        vec![]
    }
}

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

use web_sys::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

use super::style::StyleSurface;
use crate::session::Session;
use crate::ui::PortalModal;
use crate::utils::*;
use crate::*;

/// The suggestion list while it is on screen, the only state a key may act on.
struct OpenState {
    values: Vec<String>,
    selected: usize,
    on_select: Callback<String>,
    target: HtmlElement,
}

#[derive(Default)]
enum FilterDropDownState {
    #[default]
    Hidden,
    Open(OpenState),
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
                self.show(values, &input, target, callback);
            },
            _ => {
                let this = self.clone();
                ApiFuture::spawn(async move {
                    let fetched =
                        crate::queries::get_column_values(&this.session, column.1.clone()).await?;
                    *this.all_values.borrow_mut() = Some(fetched);
                    *this.column.borrow_mut() = Some(column);
                    let values = filter_values(&input, &this.all_values, &exclude);
                    this.show(values, &input, target, callback);
                    Ok(())
                });
            },
        }
    }

    /// Open the list, or dismiss it when `input` is its one exact match.
    fn show(
        &self,
        values: Vec<String>,
        input: &str,
        target: HtmlElement,
        on_select: Callback<String>,
    ) {
        if values.len() == 1 && values[0] == input {
            self.dismiss();
        } else {
            *self.state.borrow_mut() = FilterDropDownState::Open(OpenState {
                values,
                selected: 0,
                on_select,
                target,
            });

            self.notify.emit(());
        }
    }

    /// Accept a visible list's highlighted suggestion; a hidden list has none.
    pub fn item_select(&self) {
        let selected = match &*self.state.borrow() {
            FilterDropDownState::Open(open) => open
                .values
                .get(open.selected)
                .map(|value| (value.clone(), open.on_select.clone())),
            FilterDropDownState::Hidden => None,
        };

        if let Some((value, on_select)) = selected {
            on_select.emit(value);
        }
    }

    pub fn item_down(&self) {
        self.step(1);
    }

    pub fn item_up(&self) {
        self.step(-1);
    }

    fn step(&self, delta: isize) {
        let moved = match &mut *self.state.borrow_mut() {
            FilterDropDownState::Open(open) if !open.values.is_empty() => {
                let len = open.values.len() as isize;
                open.selected = (open.selected as isize + delta).rem_euclid(len) as usize;
                true
            },
            _ => false,
        };

        if moved {
            self.notify.emit(());
        }
    }

    /// Close the list, keeping the column's values for the next keystroke.
    pub fn dismiss(&self) {
        *self.state.borrow_mut() = FilterDropDownState::Hidden;
        self.notify.emit(());
    }

    /// Close the list and forget the column so the next focus refetches it.
    pub fn reset(&self) {
        self.column.borrow_mut().take();
        self.all_values.borrow_mut().take();
        self.dismiss();
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
        let element = &ctx.props().element;
        let state = element.state.borrow();
        let FilterDropDownState::Open(open) = &*state else {
            return html! {};
        };

        let on_close = {
            let element = element.clone();
            Callback::from(move |()| element.dismiss())
        };

        html! {
            <PortalModal
                tag_name="perspective-dropdown"
                sheet={StyleSurface::FilterDropdown.sheet()}
                target={Some(open.target.clone())}
                own_focus=false
                {on_close}
                theme={ctx.props().theme.clone()}
            >
                <FilterDropDownView
                    values={open.values.clone()}
                    selected={open.selected}
                    on_select={open.on_select.clone()}
                />
            </PortalModal>
        }
    }
}

#[derive(Properties, PartialEq)]
struct FilterDropDownViewProps {
    values: Vec<String>,
    selected: usize,
    on_select: Callback<String>,
}

#[function_component]
fn FilterDropDownView(props: &FilterDropDownViewProps) -> Html {
    let body = html! {
        if !props.values.is_empty() {
            { for props.values
                    .iter()
                    .enumerate()
                    .map(|(idx, value)| {
                        let click = props.on_select.reform({
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

    html! { <>{ body }</> }
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

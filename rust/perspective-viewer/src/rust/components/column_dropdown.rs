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
use perspective_client::config::Expression;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

use super::column_selector::InPlaceColumn;
use super::portal::PortalModal;
use crate::session::Session;
use crate::utils::*;
use crate::*;

static CSS: &str = include_str!(concat!(env!("OUT_DIR"), "/css/column-dropdown.css"));

/// Shared state for the column dropdown, updated imperatively.
#[derive(Default)]
pub struct ColumnDropDownState {
    pub values: Vec<InPlaceColumn>,
    pub selected: usize,
    pub width: f64,
    pub on_select: Option<Callback<InPlaceColumn>>,
    pub target: Option<HtmlElement>,
    pub no_results: bool,
}

/// A clonable handle for the column dropdown shared state.
#[derive(Clone)]
pub struct ColumnDropDownElement {
    state: Rc<RefCell<ColumnDropDownState>>,
    session: Session,
    notify: Rc<PubSub<()>>,
}

impl PartialEq for ColumnDropDownElement {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.state, &other.state)
    }
}

impl ImplicitClone for ColumnDropDownElement {}

impl ColumnDropDownElement {
    pub fn new(session: Session) -> Self {
        Self {
            state: Default::default(),
            session,
            notify: Rc::default(),
        }
    }

    pub fn autocomplete(
        &self,
        target: HtmlInputElement,
        exclude: HashSet<String>,
        callback: Callback<InPlaceColumn>,
    ) -> Option<()> {
        let input = target.value();
        let metadata = self.session.metadata();
        let mut values: Vec<InPlaceColumn> = vec![];
        let small_input = input.to_lowercase();
        for col in metadata.get_table_columns()? {
            if !exclude.contains(col) && col.to_lowercase().contains(&small_input) {
                values.push(InPlaceColumn::Column(col.to_owned()));
            }
        }

        for col in self.session.metadata().get_expression_columns() {
            if !exclude.contains(col) && col.to_lowercase().contains(&small_input) {
                values.push(InPlaceColumn::Column(col.to_owned()));
            }
        }

        clone!(self.state, self.session, self.notify);
        let target_elem: HtmlElement = target.clone().into();
        let width = target.get_bounding_client_rect().width();
        ApiFuture::spawn(async move {
            if !exclude.contains(&input) {
                let is_expr = crate::queries::validate_expr(&session, &input)
                    .await?
                    .is_none();
                if is_expr {
                    values.push(InPlaceColumn::Expression(Expression::new(
                        None,
                        input.into(),
                    )));
                }
            }

            let no_results = values.is_empty();
            {
                let mut s = state.borrow_mut();
                s.values = values;
                s.selected = 0;
                s.width = width;
                s.on_select = Some(callback);
                s.target = Some(target_elem);
                s.no_results = no_results;
            }
            notify.emit(());
            Ok(())
        });

        Some(())
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
        self.notify.emit(());
        Ok(())
    }
}

/// A portal component that renders the column dropdown. Should be placed in
/// the view of the component that creates the `ColumnDropDownElement`.
#[derive(Properties, PartialEq)]
pub struct ColumnDropDownPortalProps {
    pub element: ColumnDropDownElement,
    pub theme: String,
}

pub struct ColumnDropDownPortal {
    _sub: Subscription,
}

impl Component for ColumnDropDownPortal {
    type Message = ();
    type Properties = ColumnDropDownPortalProps;

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
            let width = state.width;
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
                    <ColumnDropDownView {values} {selected} {width} {on_select} />
                </PortalModal>
            }
        } else {
            html! {}
        }
    }
}

/// Pure view component for the column dropdown content.
#[derive(Properties, PartialEq)]
struct ColumnDropDownViewProps {
    values: Vec<InPlaceColumn>,
    selected: usize,
    width: f64,
    on_select: Option<Callback<InPlaceColumn>>,
}

#[function_component]
fn ColumnDropDownView(props: &ColumnDropDownViewProps) -> Html {
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

                        let row = match value {
                            InPlaceColumn::Column(col) => html! {
                                <span>{ col }</span>
                            },
                            InPlaceColumn::Expression(col) => html! {
                                <span id="add-expression"><span class="icon" />{ col.name.clone() }</span>
                            },
                        };

                        html! {
                            if idx == props.selected {
                                <span onmousedown={click} class="selected">{ row }</span>
                            } else {
                                <span onmousedown={click}>{ row }</span>
                            }
                        }
                    }) }
        } else {
            <span class="no-results" />
        }
    };

    let position = format!(
        ":host{{min-width:{}px;max-width:{}px}}",
        props.width, props.width
    );

    html! { <><style>{ CSS }</style><style>{ position }</style>{ body }</> }
}

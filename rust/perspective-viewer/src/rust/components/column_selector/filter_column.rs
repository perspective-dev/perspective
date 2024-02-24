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

use chrono::{NaiveDate, TimeZone, Utc};
use perspective_client::ColumnType;
use wasm_bindgen::JsCast;
use web_sys::*;
use yew::prelude::*;

use crate::components::containers::dragdrop_list::*;
use crate::components::containers::select::*;
use crate::components::style::LocalStyle;
use crate::components::type_icon::TypeIcon;
use crate::config::*;
use crate::custom_elements::*;
use crate::dragdrop::*;
use crate::model::*;
use crate::renderer::*;
use crate::session::*;
use crate::utils::{posix_to_utc_str, str_to_utc_posix};
use crate::*;

/// A control for a single filter condition.
pub struct FilterColumn {
    input: String,
    input_ref: NodeRef,
}

#[derive(Debug)]
pub enum FilterColumnMsg {
    FilterInput((usize, String), String),
    Close,
    FilterOpSelect(FilterOp),
    FilterKeyDown(u32),
}

#[derive(Properties, Clone)]
pub struct FilterColumnProps {
    pub filter: Filter,
    pub idx: usize,
    pub filter_dropdown: FilterDropDownElement,
    pub on_keydown: Callback<String>,
    pub session: Session,
    pub renderer: Renderer,
    pub dragdrop: DragDrop,
}

impl PartialEq for FilterColumnProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.idx == rhs.idx && self.filter == rhs.filter && self.on_keydown == rhs.on_keydown
    }
}

derive_model!(Renderer, Session for FilterColumnProps);

impl DragDropListItemProps for FilterColumnProps {
    type Item = Filter;

    fn get_item(&self) -> Filter {
        self.filter.clone()
    }
}

impl FilterColumnProps {
    /// Does this filter item get a "suggestions" auto-complete modal?
    fn is_suggestable(&self) -> bool {
        (self.filter.1 == FilterOp::EQ
            || self.filter.1 == FilterOp::NE
            || self.filter.1 == FilterOp::In)
            && self.get_filter_type() == Some(ColumnType::String)
    }

    /// Get this filter's type, e.g. the type of the column.
    fn get_filter_type(&self) -> Option<ColumnType> {
        self.session
            .metadata()
            .get_column_table_type(&self.filter.0)
    }

    // Get the string value, suitable for the `value` field of a `FilterColumns`'s
    // `<input>`.
    fn get_filter_input(&self) -> Option<String> {
        let filter_type = self.get_filter_type()?;
        match (&filter_type, &self.filter.2) {
            (ColumnType::Date, FilterTerm::Scalar(Scalar::Float(x)))
            | (ColumnType::Date, FilterTerm::Scalar(Scalar::DateTime(x))) => {
                if *x > 0_f64 {
                    Some(
                        Utc.timestamp_opt(*x as i64 / 1000, (*x as u32 % 1000) * 1000)
                            .earliest()?
                            .format("%Y-%m-%d")
                            .to_string(),
                    )
                } else {
                    None
                }
            },
            (ColumnType::Datetime, FilterTerm::Scalar(Scalar::Float(x) | Scalar::DateTime(x))) => {
                posix_to_utc_str(*x).ok()
            },
            (ColumnType::Boolean, FilterTerm::Scalar(Scalar::Bool(x))) => {
                Some((if *x { "true" } else { "false" }).to_owned())
            },
            (ColumnType::Boolean, _) => Some("true".to_owned()),
            (_, x) => Some(format!("{}", x)),
        }
    }

    /// Get the allowed `FilterOp`s for this filter.
    fn get_filter_ops(&self) -> Vec<FilterOp> {
        match self.get_filter_type() {
            Some(ColumnType::String) => vec![
                FilterOp::EQ,
                FilterOp::NE,
                FilterOp::GT,
                FilterOp::GTE,
                FilterOp::LT,
                FilterOp::LTE,
                FilterOp::BeginsWith,
                FilterOp::Contains,
                FilterOp::EndsWith,
                FilterOp::In,
                FilterOp::NotIn,
                FilterOp::IsNotNull,
                FilterOp::IsNull,
            ],
            Some(ColumnType::Boolean) => {
                vec![FilterOp::EQ, FilterOp::IsNull, FilterOp::IsNotNull]
            },
            Some(_) => vec![
                FilterOp::EQ,
                FilterOp::NE,
                FilterOp::GT,
                FilterOp::GTE,
                FilterOp::LT,
                FilterOp::LTE,
                FilterOp::IsNotNull,
                FilterOp::IsNull,
            ],
            _ => vec![],
        }
    }

    /// Update the filter comparison operator.
    ///
    /// # Arguments
    /// - `op` The new `FilterOp`.
    fn update_filter_op(&self, op: FilterOp) {
        let mut filter = self.session.get_view_config().filter.clone();
        let filter_column = &mut filter.get_mut(self.idx).expect("Filter on no column");
        filter_column.1 = op;
        let update = ViewConfigUpdate {
            filter: Some(filter),
            ..ViewConfigUpdate::default()
        };

        ApiFuture::spawn(self.update_and_render(update));
    }

    /// Update the filter value from the string input read from the DOM.
    ///
    /// # Arguments
    /// - `val` The new filter value.
    fn update_filter_input(&self, val: String) {
        let mut filter = self.session.get_view_config().filter.clone();
        let filter_column = &mut filter.get_mut(self.idx).expect("Filter on no column");
        let filter_input = match filter_column.1 {
            FilterOp::NotIn | FilterOp::In => Some(FilterTerm::Array(
                val.split(',')
                    .map(|x| Scalar::String(x.trim().to_owned()))
                    .collect(),
            )),
            _ => match self.get_filter_type() {
                Some(ColumnType::String) => Some(FilterTerm::Scalar(Scalar::String(val))),
                Some(ColumnType::Integer) => {
                    if val.is_empty() {
                        None
                    } else if let Ok(num) = val.parse::<f64>() {
                        Some(FilterTerm::Scalar(Scalar::Float(num.floor())))
                    } else {
                        None
                    }
                },
                Some(ColumnType::Float) => {
                    if val.is_empty() {
                        None
                    } else if let Ok(num) = val.parse::<f64>() {
                        Some(FilterTerm::Scalar(Scalar::Float(num)))
                    } else {
                        None
                    }
                },
                Some(ColumnType::Date) => match NaiveDate::parse_from_str(&val, "%Y-%m-%d") {
                    Ok(ref posix) => posix
                        .and_hms_opt(0, 0, 0)
                        .map(|x| FilterTerm::Scalar(Scalar::DateTime(x.timestamp_millis() as f64))),
                    _ => None,
                },
                Some(ColumnType::Datetime) => match str_to_utc_posix(&val) {
                    Ok(x) => Some(FilterTerm::Scalar(Scalar::DateTime(x))),
                    _ => None,
                },
                Some(ColumnType::Boolean) => Some(FilterTerm::Scalar(match val.as_str() {
                    "true" => Scalar::Bool(true),
                    _ => Scalar::Bool(false),
                })),

                // shouldn't be reachable ..
                _ => None,
            },
        };

        if let Some(input) = filter_input {
            if input != filter_column.2 {
                filter_column.2 = input;
                let update = ViewConfigUpdate {
                    filter: Some(filter),
                    ..ViewConfigUpdate::default()
                };

                ApiFuture::spawn(self.update_and_render(update));
            }
        }
    }
}

type FilterOpSelector = Select<FilterOp>;

impl Component for FilterColumn {
    type Message = FilterColumnMsg;
    type Properties = FilterColumnProps;

    fn create(ctx: &Context<Self>) -> Self {
        // css!(ctx, "filter-item");
        let input = ctx
            .props()
            .get_filter_input()
            .unwrap_or_else(|| "".to_owned());
        let input_ref = NodeRef::default();
        if ctx.props().get_filter_type() == Some(ColumnType::Boolean) {
            ctx.props().update_filter_input(input.clone());
        }

        Self { input, input_ref }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: FilterColumnMsg) -> bool {
        match msg {
            FilterColumnMsg::FilterInput(column, input) => {
                let target = self.input_ref.cast::<HtmlInputElement>().unwrap();
                let input = if ctx.props().get_filter_type() == Some(ColumnType::Boolean) {
                    if target.checked() {
                        "true".to_owned()
                    } else {
                        "false".to_owned()
                    }
                } else {
                    input
                };

                if ctx.props().is_suggestable() {
                    ctx.props().filter_dropdown.autocomplete(
                        column,
                        if ctx.props().filter.1 == FilterOp::In {
                            input.split(',').last().unwrap().to_owned()
                        } else {
                            input.clone()
                        },
                        HashSet::new(),
                        target.unchecked_into(),
                        ctx.props().on_keydown.clone(),
                    );
                }

                ctx.props().update_filter_input(input);
                false
            },
            FilterColumnMsg::FilterKeyDown(40) => {
                if ctx.props().is_suggestable() {
                    ctx.props().filter_dropdown.item_down();
                    ctx.props().filter_dropdown.item_select();
                }
                false
            },
            FilterColumnMsg::FilterKeyDown(38) => {
                if ctx.props().is_suggestable() {
                    ctx.props().filter_dropdown.item_up();
                    ctx.props().filter_dropdown.item_select();
                }
                false
            },
            FilterColumnMsg::Close => {
                ctx.props().filter_dropdown.hide().unwrap();
                false
            },
            FilterColumnMsg::FilterKeyDown(13) => {
                if ctx.props().is_suggestable() {
                    ctx.props().filter_dropdown.item_select();
                    ctx.props().filter_dropdown.hide().unwrap();
                }
                false
            },
            FilterColumnMsg::FilterKeyDown(_) => {
                if ctx.props().is_suggestable() {
                    ctx.props().filter_dropdown.reautocomplete();
                }
                false
            },
            FilterColumnMsg::FilterOpSelect(op) => {
                ctx.props().update_filter_op(op);
                true
            },
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        if let Some(input) = ctx.props().get_filter_input() {
            self.input = input;
            true
        } else {
            false
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let idx = ctx.props().idx;
        let filter = ctx.props().filter.clone();
        let column = filter.0.to_owned();
        let col_type = ctx
            .props()
            .session
            .metadata()
            .get_column_table_type(&column);

        let select = ctx.link().callback(FilterColumnMsg::FilterOpSelect);

        let noderef = &self.input_ref;
        let input = ctx.link().callback({
            let column = column.clone();
            move |input: InputEvent| {
                FilterColumnMsg::FilterInput(
                    (idx, column.clone()),
                    input
                        .target()
                        .unwrap()
                        .unchecked_into::<HtmlInputElement>()
                        .value(),
                )
            }
        });

        let focus = ctx.link().callback({
            let input = self.input.clone();
            move |_: FocusEvent| FilterColumnMsg::FilterInput((idx, column.clone()), input.clone())
        });

        let blur = ctx.link().callback(|_| FilterColumnMsg::Close);
        let keydown = ctx
            .link()
            .callback(move |event: KeyboardEvent| FilterColumnMsg::FilterKeyDown(event.key_code()));

        let dragstart = Callback::from({
            let event_name = ctx.props().filter.0.to_owned();
            let dragdrop = ctx.props().dragdrop.clone();
            move |event: DragEvent| {
                dragdrop.set_drag_image(&event).unwrap();
                dragdrop
                    .notify_drag_start(event_name.to_string(), DragEffect::Move(DragTarget::Filter))
            }
        });

        let dragend = Callback::from({
            let dragdrop = ctx.props().dragdrop.clone();
            move |_event| dragdrop.notify_drag_end()
        });

        let type_class = match col_type {
            Some(ColumnType::Float) | Some(ColumnType::Integer) => "num-filter",
            Some(ColumnType::String) => "string-filter",
            _ => "",
        };

        let input_elem = match col_type {
            Some(ColumnType::Integer) => html! {
                <input
                    type="number"
                    placeholder="Value"
                    class="num-filter"
                    step="1"
                    ref={noderef.clone()}
                    onkeydown={keydown}
                    value={self.input.clone()}
                    oninput={input}
                />
            },
            Some(ColumnType::Float) => html! {
                <input
                    type="number"
                    placeholder="Value"
                    class="num-filter"
                    ref={noderef.clone()}
                    onkeydown={keydown}
                    value={self.input.clone()}
                    oninput={input}
                />
            },
            Some(ColumnType::String) => html! {
                <input
                    type="text"
                    size="4"
                    placeholder="Value"
                    class="string-filter"
                    spellcheck="false"
                    // TODO This is dirty and it may not work in the future.
                    onInput="this.parentNode.dataset.value=this.value"
                    ref={noderef.clone()}
                    onkeydown={keydown}
                    onfocus={focus}
                    onblur={blur}
                    value={self.input.clone()}
                    oninput={input}
                />
            },
            Some(ColumnType::Date) => html! {
                <input
                    type="date"
                    placeholder="Value"
                    class="date-filter"
                    ref={noderef.clone()}
                    onkeydown={keydown}
                    value={self.input.clone()}
                    oninput={input}
                />
            },
            Some(ColumnType::Datetime) => html! {
                <input
                    type="datetime-local"
                    placeholder="Value"
                    class="datetime-filter"
                    step="0.001"
                    ref={noderef.clone()}
                    onkeydown={keydown}
                    value={self.input.clone()}
                    oninput={input}
                />
            },
            Some(ColumnType::Boolean) => {
                html! {
                    <input
                        type="checkbox"
                        class="alternate"
                        ref={noderef.clone()}
                        checked={self.input == "true"}
                        oninput={input}
                    />
                }
            },
            None => {
                html! {}
            },
        };

        let filter_ops = ctx
            .props()
            .get_filter_ops()
            .into_iter()
            .map(SelectItem::Option)
            .collect::<Vec<_>>();

        html! {
            <div
                class="pivot-column-draggable"
                draggable="true"
                ondragstart={dragstart}
                ondragend={dragend}
            >
                <LocalStyle
                    href={css!("filter-item")}
                />
                <div
                    class="pivot-column-border"
                >
                    <TypeIcon ty={ColumnType::String} />
                    <span class="column_name">{ filter.0.to_owned() }</span>
                    <FilterOpSelector
                        class="filterop-selector"
                        is_autosize=true
                        values={filter_ops}
                        selected={filter.1}
                        on_select={select}
                    />
                    if !matches!(&filter.1, FilterOp::IsNotNull | FilterOp::IsNull) {
                        if col_type == Some(ColumnType::Boolean) {
                            { input_elem }
                        } else {
                            <label
                                class={format!("input-sizer {}", type_class)}
                                data-value={format!("{}", filter.2)}
                            >
                                { input_elem }
                            </label>
                        }
                    }
                </div>
            </div>
        }
    }
}

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
use std::rc::Rc;

use chrono::{Datelike, NaiveDate, TimeZone, Utc};
use perspective_client::config::*;
use perspective_client::utils::PerspectiveResultExt;
use perspective_js::utils::ApiFuture;
use wasm_bindgen::JsCast;
use web_sys::*;
use yew::prelude::*;

use crate::components::containers::dragdrop_list::*;
use crate::components::containers::select::*;
use crate::components::style::LocalStyle;
use crate::components::type_icon::TypeIcon;
use crate::custom_elements::*;
use crate::dragdrop::*;
use crate::model::*;
use crate::renderer::*;
use crate::session::*;
use crate::utils::*;
use crate::*;

#[derive(Clone, Properties, PerspectiveProperties!)]
pub struct FilterColumnProps {
    pub filter: Filter,
    pub idx: usize,
    pub filter_dropdown: FilterDropDownElement,
    pub on_keydown: Callback<String>,

    // State
    pub session: Session,
    pub renderer: Renderer,
    pub dragdrop: DragDrop,
}

impl PartialEq for FilterColumnProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.idx == rhs.idx && self.filter == rhs.filter && self.on_keydown == rhs.on_keydown
    }
}

impl DragDropListItemProps for FilterColumnProps {
    type Item = Filter;

    fn get_item(&self) -> Filter {
        self.filter.clone()
    }
}

#[derive(Debug)]
pub enum FilterColumnMsg {
    FilterInput((usize, String), String),
    Close,
    FilterOpSelect(String),
    FilterKeyDown(u32),
}

/// A control for a single filter condition.
pub struct FilterColumn {
    input: String,
    input_ref: NodeRef,
    filter_ops: Rc<Vec<SelectItem<String>>>,
}

impl Component for FilterColumn {
    type Message = FilterColumnMsg;
    type Properties = FilterColumnProps;

    fn create(ctx: &Context<Self>) -> Self {
        let input_ref = NodeRef::default();
        let mut this = Self {
            input: "".to_string(),
            input_ref,
            filter_ops: Rc::default(),
        };

        let col_type = ctx.props().get_current_filter_type();
        this.input = ctx
            .props()
            .get_filter_input()
            .unwrap_or_else(|| "".to_owned());

        this.filter_ops = Rc::new(
            maybe! {
                Some(get_filter_ops(ctx.props().session(), col_type?)?
                    .into_iter()
                    .map(SelectItem::Option)
                    .collect::<Vec<_>>())
            }
            .unwrap_or_default(),
        );

        if col_type == Some(ColumnType::Boolean) {
            ctx.props().update_filter_input(this.input.clone());
        }

        this
    }

    fn update(&mut self, ctx: &Context<Self>, msg: FilterColumnMsg) -> bool {
        match msg {
            FilterColumnMsg::FilterInput(column, input) => {
                let target = self.input_ref.cast::<HtmlInputElement>().unwrap();
                let input = if ctx.props().get_current_filter_type() == Some(ColumnType::Boolean) {
                    if target.checked() {
                        "true".to_owned()
                    } else {
                        "false".to_owned()
                    }
                } else {
                    input
                };

                // TODO This belongs in the Features API.
                if ctx.props().is_suggestable() {
                    ctx.props().filter_dropdown.autocomplete(
                        column,
                        if ctx.props().filter.op() == "in" || ctx.props().filter.op() == "not in" {
                            input.split(',').next_back().unwrap().to_owned()
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
            FilterColumnMsg::FilterKeyDown(_) => false,
            FilterColumnMsg::FilterOpSelect(op) => {
                ctx.props().update_filter_op(ctx.props().idx, op);
                true
            },
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, old: &Self::Properties) -> bool {
        let col_type = ctx.props().get_current_filter_type();
        let old_col_type = ctx.props().get_filter_type(&old.filter);
        let mut changed = false;
        if col_type != old_col_type {
            changed = true;
            self.filter_ops = Rc::new(
                maybe! {
                    Some(get_filter_ops(&ctx.props().session, col_type?)?
                        .into_iter()
                        .map(SelectItem::Option)
                        .collect::<Vec<_>>())
                }
                .unwrap_or_default(),
            );
        };

        if let Some(input) = ctx.props().get_filter_input() {
            self.input = input;
            changed = true
        }

        changed
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let idx = ctx.props().idx;
        let filter = ctx.props().filter.clone();
        let column = filter.column().to_owned();
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
            let event_name = ctx.props().filter.column().to_owned();
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
                    type="search"
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

        let final_col_type = col_type.unwrap_or(ColumnType::Integer);

        html! {
            <div
                class="pivot-column-draggable"
                draggable="true"
                ondragstart={dragstart}
                ondragend={dragend}
            >
                <LocalStyle href={css!("filter-item")} />
                <div class="pivot-column-border">
                    // <TypeIcon ty={ColumnType::String} />
                    <TypeIcon ty={final_col_type} />
                    <span class="column_name">{ filter.column().to_owned() }</span>
                    <Select<String>
                        class="filterop-selector"
                        is_autosize=true
                        values={self.filter_ops.clone()}
                        selected={filter.op().to_string()}
                        on_select={select}
                    />
                    // TODO: Move this to the Features API.
                    if filter.op() != "is not null" && filter.op() != "is null" {
                        if col_type == Some(ColumnType::Boolean) {
                            { input_elem }
                        } else {
                            <label
                                class={format!("input-sizer {}", type_class)}
                                data-value={format!("{}", filter.term())}
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

/// Get the allowed `FilterOp`s for this filter.
fn get_filter_ops(session: &Session, col_type: ColumnType) -> Option<Vec<String>> {
    let metadata = session.metadata();
    let features = metadata.get_features()?;
    features
        .filter_ops
        .get(&(col_type as u32))
        .map(|x| x.options.clone())
}

impl FilterColumnProps {
    /// Does this filter item get a "suggestions" auto-complete modal?
    fn is_suggestable(&self) -> bool {
        // TODO This needs to be moved to Features API. Or ... we just do this
        // all string column type filters, or otherwise "fix" this in the UI?
        (self.filter.op() == "=="
            || self.filter.op() == "!="
            || self.filter.op() == "in"
            || self.filter.op() == "not in")
            && self.get_filter_type(&self.filter) == Some(ColumnType::String)
    }

    fn get_current_filter_type(&self) -> Option<ColumnType> {
        self.get_filter_type(&self.filter)
    }

    /// Get this filter's type, e.g. the type of the column.
    fn get_filter_type(&self, filter: &Filter) -> Option<ColumnType> {
        self.session
            .metadata()
            .get_column_table_type(filter.column())
    }

    // Get the string value, suitable for the `value` field of a `FilterColumns`'s
    // `<input>`.
    fn get_filter_input(&self) -> Option<String> {
        let filter_type = self.get_current_filter_type()?;
        match (&filter_type, &self.filter.term()) {
            (ColumnType::Date, FilterTerm::Scalar(Scalar::Float(x))) => {
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
            (ColumnType::Datetime, FilterTerm::Scalar(Scalar::Float(x))) => {
                posix_to_utc_str(*x).ok()
            },
            (ColumnType::Boolean, FilterTerm::Scalar(Scalar::Bool(x))) => {
                Some((if *x { "true" } else { "false" }).to_owned())
            },
            (ColumnType::Boolean, _) => Some("true".to_owned()),
            (_, x) => Some(format!("{x}")),
        }
    }

    /// Update the filter comparison operator.
    ///
    /// # Arguments
    /// - `op` The new `FilterOp`.
    fn update_filter_op(&self, idx: usize, op: String) {
        let mut filter = self.session.get_view_config().filter.clone();
        let filter_column = &mut filter.get_mut(idx).expect("Filter on no column");
        *filter_column.op_mut() = op;
        let update = ViewConfigUpdate {
            filter: Some(filter),
            ..ViewConfigUpdate::default()
        };

        self.update_and_render(update)
            .map(ApiFuture::spawn)
            .unwrap_or_log();
    }

    /// Update the filter value from the string input read from the DOM.
    ///
    /// # Arguments
    /// - `val` The new filter value.
    fn update_filter_input(&self, val: String) {
        let mut filters = self.session.get_view_config().filter.clone();
        let filter_column = &mut filters.get_mut(self.idx).expect("Filter on no column");

        // TODO This belongs in the Features API.
        let filter_input = if filter_column.op() == "in" || filter_column.op() == "not in" {
            Some(FilterTerm::Array(
                val.split(',')
                    .map(|x| Scalar::String(x.trim().to_owned()))
                    .collect(),
            ))
        } else {
            match self.get_current_filter_type() {
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
                    Ok(ref posix) => Some(FilterTerm::Scalar(Scalar::String(format!(
                        "{:0>4}-{:0>2}-{:0>2}",
                        posix.year(),
                        posix.month(),
                        posix.day(),
                    )))),
                    _ => None,
                },
                Some(ColumnType::Datetime) => match str_to_utc_posix(&val) {
                    Ok(x) => Some(FilterTerm::Scalar(Scalar::Float(x))),
                    _ => None,
                },
                Some(ColumnType::Boolean) => Some(FilterTerm::Scalar(match val.as_str() {
                    "true" => Scalar::Bool(true),
                    _ => Scalar::Bool(false),
                })),

                // shouldn't be reachable ..
                _ => None,
            }
        };

        if let Some(input) = filter_input
            && &input != filter_column.term()
        {
            *filter_column.term_mut() = input;
            let update = ViewConfigUpdate {
                filter: Some(filters),
                ..ViewConfigUpdate::default()
            };

            self.update_and_render(update)
                .map(ApiFuture::spawn)
                .unwrap_or_log();
        }
    }
}

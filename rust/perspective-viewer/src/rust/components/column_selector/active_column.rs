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

use perspective_client::ColumnType;
use web_sys::*;
use yew::prelude::*;

use super::aggregate_selector::*;
use super::expression_toolbar::*;
use super::InPlaceColumn;
use crate::components::column_selector::{EmptyColumn, InvalidColumn};
use crate::components::type_icon::TypeIcon;
use crate::components::viewer::ColumnLocator;
use crate::config::*;
use crate::custom_elements::ColumnDropDownElement;
use crate::dragdrop::*;
use crate::js::plugin::*;
use crate::model::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::*;
use crate::*;

enum ColumnState {
    Empty,
    Invalid,
    Named(String),
}

#[derive(Properties, Clone)]
pub struct ActiveColumnProps {
    pub idx: usize,
    pub name: ActiveColumnState,
    pub dragdrop: DragDrop,
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
    pub column_dropdown: ColumnDropDownElement,
    pub ondragenter: Callback<()>,
    pub ondragend: Callback<()>,
    pub onselect: Callback<()>,
    pub on_open_expr_panel: Callback<ColumnLocator>,

    #[prop_or_default]
    pub is_aggregated: bool,
    pub is_editing: bool,
}

impl PartialEq for ActiveColumnProps {
    fn eq(&self, _rhs: &Self) -> bool {
        false
    }
}

impl ActiveColumnProps {
    fn get_name(&self) -> Option<String> {
        match &self.name.state {
            ActiveColumnStateData::DragOver => Some(self.dragdrop.get_drag_column().unwrap()),
            ActiveColumnStateData::Column(name) => Some(name.to_owned()),
            ActiveColumnStateData::Required => None,
            ActiveColumnStateData::Invalid => None,
        }
    }

    fn get_table_type(&self) -> Option<ColumnType> {
        self.get_name()
            .as_ref()
            .and_then(|x| self.session.metadata().get_column_table_type(x))
    }

    fn _get_view_type(&self) -> Option<ColumnType> {
        self.get_name()
            .as_ref()
            .and_then(|x| self.session.metadata().get_column_view_type(x))
    }
}

derive_model!(Renderer, Session for ActiveColumnProps);

impl ActiveColumnProps {
    /// Remove an active column from `columns`, or alternatively make this
    /// column the only column in `columns` if the shift key is set (via the
    /// `shift` flag).
    ///
    /// # Arguments
    /// - `name` The name of the column to de-activate, which is a unique ID
    ///   with respect to `columns`.
    /// - `shift` whether to toggle or select this column.
    pub fn deactivate_column(&self, name: String, shift: bool) {
        let mut columns = self.session.get_view_config().columns.clone();
        let max_cols = self
            .renderer
            .metadata()
            .names
            .as_ref()
            .map_or(0, |x| x.len());

        match self.renderer.metadata().mode {
            ColumnSelectMode::Toggle => {
                let index = columns
                    .iter()
                    .position(|x| x.as_ref() == Some(&name))
                    .unwrap();

                if max_cols > 0 && index < max_cols - 1 {
                    columns[index] = None;
                } else if !shift && columns.len() > 1 {
                    columns.retain(|x| x.as_ref() != Some(&name));
                } else if shift {
                    columns.clear();
                    columns.push(Some(name));
                }
            },
            ColumnSelectMode::Select => {
                columns.retain(|x| x.as_ref() != Some(&name));
            },
        }
        self.apply_columns(columns);
    }

    fn get_is_required(&self) -> bool {
        let min_cols = self.renderer.metadata().min.unwrap_or(0);
        self.idx < min_cols
    }

    fn get_aggregate(&self, name: &str) -> Option<Aggregate> {
        self.session.get_view_config().aggregates.get(name).cloned()
    }

    fn apply_columns(&self, columns: Vec<Option<String>>) {
        let config = ViewConfigUpdate {
            columns: Some(columns),
            ..ViewConfigUpdate::default()
        };

        ApiFuture::spawn(self.update_and_render(config));
    }
}

pub enum ActiveColumnMsg {
    DeactivateColumn(String, bool),
    MouseEnter(bool),
    MouseLeave(bool),
    New(InPlaceColumn),
}

use ActiveColumnMsg::*;

/// An `ActiveColumn` indicates a column which is part of the `columns` field of
/// a `ViewConfig`.  It shows additional column details in context (like
/// selected aggregate), and supports drag/drop and missing entries.
/// TODO Break this into "Active", "Hover" and "Empty"?
#[derive(Default)]
pub struct ActiveColumn {
    add_expression_ref: NodeRef,
    is_required: bool,
    mouseover: bool,
}

impl Component for ActiveColumn {
    type Message = ActiveColumnMsg;
    type Properties = ActiveColumnProps;

    fn create(ctx: &Context<Self>) -> Self {
        let is_required = ctx.props().get_is_required();
        Self {
            is_required,
            ..Default::default()
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        self.is_required = ctx.props().get_is_required();
        true
    }

    fn update(&mut self, ctx: &Context<Self>, msg: ActiveColumnMsg) -> bool {
        match msg {
            DeactivateColumn(column, shift_key) => {
                ctx.props().deactivate_column(column, shift_key);
                ctx.props().onselect.emit(());
                false
            },
            MouseEnter(is_render) => {
                self.mouseover = is_render;
                is_render
            },
            MouseLeave(is_render) => {
                self.mouseover = false;
                is_render
            },
            New(InPlaceColumn::Column(col)) => {
                let mut view_config = ctx.props().session.get_view_config().clone();
                if ctx.props().idx >= view_config.columns.len() {
                    view_config.columns.push(Some(col));
                } else {
                    view_config.columns[ctx.props().idx] = Some(col);
                }

                let update = ViewConfigUpdate {
                    columns: Some(view_config.columns),
                    ..ViewConfigUpdate::default()
                };

                ApiFuture::spawn(ctx.props().update_and_render(update));
                true
            },
            New(InPlaceColumn::Expression(col)) => {
                let mut view_config = ctx.props().session.get_view_config().clone();
                if ctx.props().idx >= view_config.columns.len() {
                    view_config.columns.push(Some(col.name.as_ref().to_owned()));
                } else {
                    view_config.columns[ctx.props().idx] = Some(col.name.as_ref().to_owned());
                }

                view_config.expressions.insert(&col);
                let update = ViewConfigUpdate {
                    columns: Some(view_config.columns),
                    expressions: Some(view_config.expressions),
                    ..ViewConfigUpdate::default()
                };

                ApiFuture::spawn(ctx.props().update_and_render(update));
                true
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let mut classes = classes!["column-selector-draggable"];
        if ctx.props().is_aggregated {
            classes.push("show-aggregate");
        };

        let mut outer_classes = classes!["column-selector-column"];
        if self.mouseover {
            outer_classes.push("dragdrop-hover");
        }

        let name = match &ctx.props().name {
            ActiveColumnState {
                label,
                state: ActiveColumnStateData::DragOver,
            } => {
                classes.push("dragover");
                outer_classes.push("dragover-container");
                classes.push("empty-named");

                (
                    label.clone(),
                    ColumnState::Named(ctx.props().dragdrop.get_drag_column().unwrap()),
                )
            },
            ActiveColumnState {
                label,
                state: ActiveColumnStateData::Column(name),
            } => (label.clone(), ColumnState::Named(name.to_owned())),
            ActiveColumnState {
                label,
                state: ActiveColumnStateData::Required,
            } => (label.clone(), ColumnState::Empty),
            ActiveColumnState {
                label,
                state: ActiveColumnStateData::Invalid,
            } => (label.clone(), ColumnState::Invalid),
        };

        let ondragenter = ctx.props().ondragenter.reform(move |event: DragEvent| {
            // Safari does not set `relatedTarget` so this event must be allowed to
            // bubble so we can count entry/exit stacks to determine true
            // `"dragleave"`.
            if event.related_target().is_some() {
                event.stop_propagation();
                event.prevent_default();
            }
        });

        let path: String = name
            .0
            .clone()
            .unwrap_or_default()
            .chars()
            .map(|x| {
                if x.is_alphanumeric() {
                    x.to_ascii_lowercase()
                } else {
                    '-'
                }
            })
            .collect();

        let col_type = ctx.props().get_table_type();
        match (name, col_type) {
            ((label, ColumnState::Empty), _) => {
                classes.push("empty-named");
                let column_dropdown = ctx.props().column_dropdown.clone();
                let on_select = ctx.link().callback(ActiveColumnMsg::New);
                let exclude = ctx
                    .props()
                    .session
                    .get_view_config()
                    .columns
                    .iter()
                    .flatten()
                    .cloned()
                    .collect::<HashSet<_>>();

                html! {
                    <div
                        class={outer_classes}
                        data-label={label}
                        style={format!("--default-column-title:var(--column-selector-column-{}--content)",path)}
                        data-index={ctx.props().idx.to_string()}
                        ondragenter={ondragenter.clone()}
                    >
                        <EmptyColumn {column_dropdown} {exclude} {on_select} />
                    </div>
                }
            },
            ((label, ColumnState::Invalid), _) => {
                classes.push("empty-named");
                html! {
                    <div
                        class={outer_classes}
                        data-label={label}
                        style={format!("--default-column-title:var(--column-selector-column-{}--content)",path)}
                        data-index={ctx.props().idx.to_string()}
                        ondragenter={ondragenter.clone()}
                    >
                        <InvalidColumn />
                    </div>
                }
            },
            ((label, ColumnState::Named(name)), Some(col_type)) => {
                let remove_column = if self.is_required {
                    None
                } else {
                    Some(ctx.link().callback({
                        let event_name = name.to_owned();
                        move |event: MouseEvent| {
                            ActiveColumnMsg::DeactivateColumn(
                                event_name.to_owned(),
                                event.shift_key(),
                            )
                        }
                    }))
                };

                let ondragend = &ctx.props().ondragend.reform(|_| {});
                let ondragstart = ctx.link().callback({
                    let event_name = name.to_owned();
                    let dragdrop = ctx.props().dragdrop.clone();
                    move |event: DragEvent| {
                        dragdrop.set_drag_image(&event).unwrap();
                        dragdrop.notify_drag_start(
                            event_name.to_string(),
                            DragEffect::Move(DragTarget::Active),
                        );

                        MouseLeave(false)
                    }
                });

                let onmouseout = ctx.link().callback(|_| MouseLeave(true));
                let onmouseover = ctx
                    .link()
                    .callback(|event: MouseEvent| MouseEnter(event.which() == 0));

                let is_expression = ctx.props().session.metadata().is_column_expression(&name);
                let mut class = ctx.props().renderer.metadata().mode.css();
                if self.is_required {
                    class.push("required");
                };

                let can_render_styles = ctx
                    .props()
                    .can_render_column_styles(&name)
                    .unwrap_or_default();
                let show_edit_btn = is_expression || can_render_styles;

                html! {
                    <div
                        class={outer_classes}
                        data-label={label}
                        style={format!("--default-column-title:var(--column-selector-column-{}--content)",path)}
                        data-index={ctx.props().idx.to_string()}
                        {onmouseover}
                        {onmouseout}
                        ondragenter={ondragenter.clone()}
                    >
                        <span {class} onmousedown={remove_column} />
                        <div
                            class={classes}
                            ref={&self.add_expression_ref}
                            draggable="true"
                            {ondragstart}
                            {ondragend}
                        >
                            <div class="column-selector-column-border">
                                <TypeIcon ty={col_type} />
                                if ctx.props().is_aggregated {
                                    <AggregateSelector
                                        column={name.clone()}
                                        aggregate={ctx.props().get_aggregate(&name)}
                                        renderer={&ctx.props().renderer}
                                        session={&ctx.props().session}
                                    />
                                }
                                <span class="column_name">{ name.clone() }</span>
                                if !ctx.props().is_aggregated {
                                    <span class="column-selector--spacer" />
                                }
                                if show_edit_btn {
                                    <ExprEditButton
                                        name={name.clone()}
                                        on_open_expr_panel={&ctx.props().on_open_expr_panel}
                                        {is_expression}
                                        is_editing={ctx.props().is_editing}
                                    />
                                }
                            </div>
                        </div>
                    </div>
                }
            },
            _ => {
                // Expression columns are the only UI element which requires the
                // `View` (for its expression type), we may need to stub these
                // columns out until the new View forces a re-render (and the
                // `change()` method on this component checks for this).

                html! {
                    <div class="column-selector-column">
                        <span class="is_column_active inactive" />
                        <div class={classes} />
                    </div>
                }
            },
        }
    }
}

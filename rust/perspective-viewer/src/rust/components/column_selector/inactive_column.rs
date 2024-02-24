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

use itertools::Itertools;
use web_sys::*;
use yew::prelude::*;

use super::expression_toolbar::*;
use crate::components::type_icon::TypeIcon;
use crate::components::viewer::ColumnLocator;
use crate::config::*;
use crate::dragdrop::*;
use crate::js::plugin::*;
use crate::model::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::*;
use crate::*;

#[derive(Properties, Clone)]
pub struct InactiveColumnProps {
    pub idx: usize,
    pub visible: bool,
    pub name: String,
    pub dragdrop: DragDrop,
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
    pub is_editing: bool,
    pub ondragend: Callback<()>,
    pub onselect: Callback<()>,
    pub on_open_expr_panel: Callback<ColumnLocator>,
}

impl PartialEq for InactiveColumnProps {
    /// Equality for `InactiveColumnProps` determines when it should re-render,
    /// which is only when it has changed.
    /// TODO Aggregates
    fn eq(&self, _rhs: &Self) -> bool {
        false
    }
}

derive_model!(Renderer, Session for InactiveColumnProps);

impl InactiveColumnProps {
    /// Add a column to the active columns, which corresponds to the `columns`
    /// field of the `JsPerspectiveViewConfig`.
    ///
    /// # Arguments
    /// - `name` The name of the column to de-activate, which is a unique ID
    ///   with respect to `columns`.
    /// - `shift` whether to toggle or select this column.
    pub fn activate_column(&self, name: String, shift: bool) {
        let mut columns = self.session.get_view_config().columns.clone();
        let max_cols = self
            .renderer
            .metadata()
            .names
            .as_ref()
            .map_or(0, |x| x.len());

        // Don't treat `None` at the end of the column list as columns, we'll refill
        // these later
        let last_filled = columns.iter().rposition(|x| !x.is_none()).unwrap();
        columns.truncate(last_filled + 1);

        let mode = self.renderer.metadata().mode;
        if (mode == ColumnSelectMode::Select) ^ shift {
            columns.clear();
        } else {
            columns.retain(|x| x.as_ref() != Some(&name));
        }

        columns.push(Some(name));
        self.apply_columns(
            columns
                .into_iter()
                .pad_using(max_cols, |_| None)
                .collect::<Vec<_>>(),
        );
    }

    fn apply_columns(&self, columns: Vec<Option<String>>) {
        let config = ViewConfigUpdate {
            columns: Some(columns),
            ..ViewConfigUpdate::default()
        };

        ApiFuture::spawn(self.update_and_render(config));
    }
}

pub enum InactiveColumnMsg {
    ActivateColumn(bool),
    MouseEnter(bool),
    MouseLeave(bool),
}

use InactiveColumnMsg::*;

#[derive(Default)]
pub struct InactiveColumn {
    add_expression_ref: NodeRef,
    mouseover: bool,
}

impl Component for InactiveColumn {
    type Message = InactiveColumnMsg;
    type Properties = InactiveColumnProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self::default()
    }

    fn update(&mut self, ctx: &Context<Self>, msg: InactiveColumnMsg) -> bool {
        match msg {
            ActivateColumn(shift_key) => {
                ctx.props()
                    .activate_column(ctx.props().name.to_owned(), shift_key);
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
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let col_type = ctx
            .props()
            .session
            .metadata()
            .get_column_table_type(&ctx.props().name)
            .expect("Unknown column");

        let add_column = ctx
            .link()
            .callback(|event: MouseEvent| InactiveColumnMsg::ActivateColumn(event.shift_key()));

        let ondragend = ctx.props().ondragend.reform(|_| {});
        let ondragstart = ctx.link().callback({
            let event_name = ctx.props().name.to_owned();
            let dragdrop = ctx.props().dragdrop.clone();
            move |event: DragEvent| {
                dragdrop.set_drag_image(&event).unwrap();
                dragdrop.notify_drag_start(event_name.to_string(), DragEffect::Copy);
                MouseLeave(false)
            }
        });

        let onmouseout = ctx.link().callback(|_| MouseLeave(true));
        let onmouseover = ctx
            .link()
            .callback(|event: MouseEvent| MouseEnter(event.which() == 0));

        let is_expression = ctx
            .props()
            .session
            .metadata()
            .is_column_expression(&ctx.props().name);

        let is_active_class = ctx.props().renderer.metadata().mode.css();
        let mut class = classes!("column-selector-column");
        if !ctx.props().visible {
            class.push("column-selector-column-hidden");
        }

        if self.mouseover {
            class.push("dragdrop-hover");
        }

        html! {
            <div {class} {onmouseover} {onmouseout} data-index={ctx.props().idx.to_string()}>
                <span class={is_active_class} onmousedown={add_column} />
                <div
                    class="column-selector-draggable column-selector-column-title"
                    draggable="true"
                    ref={&self.add_expression_ref}
                    {ondragstart}
                    {ondragend}
                >
                    <div class="column-selector-column-border">
                        <TypeIcon ty={col_type} />
                        <span class="column_name">{ ctx.props().name.clone() }</span>
                        <span class="column-selector--spacer" />
                        if is_expression {
                            <ExprEditButton
                                name={ctx.props().name.clone()}
                                on_open_expr_panel={&ctx.props().on_open_expr_panel}
                                is_expression=true
                                is_editing={ctx.props().is_editing}
                            />
                        }
                    </div>
                </div>
            </div>
        }
    }
}

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
use perspective_client::config::*;
use perspective_js::utils::ApiFuture;
use web_sys::*;
use yew::prelude::*;

use super::expr_edit_button::*;
use crate::components::type_icon::TypeIcon;
use crate::dragdrop::*;
use crate::js::plugin::*;
use crate::presentation::ColumnLocator;
use crate::renderer::*;
use crate::session::*;
use crate::utils::*;

#[derive(Clone, Properties)]
pub struct InactiveColumnProps {
    /// This column's index in its list.
    pub idx: usize,

    /// Is this column visible?
    pub visible: bool,

    /// Column name
    pub name: String,

    /// Is the expression/config panel open for this column?
    pub is_editing: bool,

    /// Whether this column is an expression column.  Computed by the parent
    /// so that changes to session metadata trigger a re-render via prop diff.
    #[prop_or_default]
    pub is_expression: bool,

    /// Session metadata snapshot — threaded from `SessionProps`.
    pub metadata: SessionMetadata,

    /// View config snapshot — threaded from parent so we avoid
    /// `session.get_view_config()` calls.
    pub view_config: ViewConfig,

    /// `dragend` event`.
    pub ondragend: Callback<()>,

    /// Fires when this column's select button is sclicked.
    pub onselect: Callback<()>,

    /// Fires when this column's expression/config button is clicked.
    pub on_open_expr_panel: Callback<ColumnLocator>,

    // State
    pub dragdrop: DragDrop,
    pub session: Session,
    pub renderer: Renderer,
}

impl PartialEq for InactiveColumnProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.idx == rhs.idx
            && self.visible == rhs.visible
            && self.name == rhs.name
            && self.is_editing == rhs.is_editing
            && self.is_expression == rhs.is_expression
            && self.metadata == rhs.metadata
            && self.view_config == rhs.view_config
    }
}

pub enum InactiveColumnMsg {
    ActivateColumn(bool),
    MouseEnter(bool),
    MouseLeave(bool),
}

use InactiveColumnMsg::*;

pub struct InactiveColumn {
    add_expression_ref: NodeRef,
    mouseover: bool,
}

impl Component for InactiveColumn {
    type Message = InactiveColumnMsg;
    type Properties = InactiveColumnProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            add_expression_ref: NodeRef::default(),
            mouseover: false,
        }
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
            .metadata
            .get_column_table_type(&ctx.props().name)
            .unwrap_or(ColumnType::String);

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

        let is_expression = ctx.props().is_expression;

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
                    ref={&self.add_expression_ref}
                    class="column-selector-draggable column-selector-column-title"
                    draggable="true"
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

impl InactiveColumnProps {
    /// Add a column to the active columns, which corresponds to the `columns`
    /// field of the `JsPerspectiveViewConfig`.
    ///
    /// # Arguments
    /// - `name` The name of the column to de-activate, which is a unique ID
    ///   with respect to `columns`.
    /// - `shift` whether to toggle or select this column.
    pub fn activate_column(&self, name: String, shift: bool) {
        let mut columns = self.view_config.columns.clone();
        let max_cols = self
            .renderer
            .metadata()
            .names
            .as_ref()
            .map_or(0, |x| x.len());

        // Don't treat `None` at the end of the column list as columns, we'll refill
        // these later
        if let Some(last_filled) = columns.iter().rposition(|x| !x.is_none()) {
            columns.truncate(last_filled + 1);

            let mode = self.renderer.metadata().mode;
            if (mode == ColumnSelectMode::Select) ^ shift {
                columns.clear();
            } else {
                columns.retain(|x| x.as_ref() != Some(&name));
            }

            columns.push(Some(name));
        }

        // Do this outside the loop so errors dont just become noops
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

        if self.session.update_view_config(config).is_ok() {
            let session = self.session.clone();
            let renderer = self.renderer.clone();
            ApiFuture::spawn(async move {
                renderer.apply_pending_plugin()?;
                renderer.draw(session.validate().await?.create_view()).await
            });
        }
    }
}

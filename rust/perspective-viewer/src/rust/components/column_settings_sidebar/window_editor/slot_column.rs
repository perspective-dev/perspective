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

use perspective_client::config::ColumnType;
use web_sys::DragEvent;
use yew::prelude::*;

use crate::components::columns::column_selector_column_row::ColumnSelectorColumnRow;
use crate::components::columns::dragdrop_list::DragDropListItemProps;
use crate::presentation::Presentation;
use crate::utils::{DragEffect, DragTarget};

/// A slot's filled state: the shared `ColumnSelectorColumnRow`, with the
/// window `op` selector bound into its aggregate slot for the SOURCE slot -
/// the ONLY op control in the UI. The pill is a drag ORIGIN with
/// `DragEffect::Move(action)` (the same shape as `PivotColumn`) - the open
/// [`WindowEditor`] consumes the staged origin from `drop_received` to
/// complete the move by clearing this slot in its draft.
#[derive(Clone, Properties)]
pub struct WindowSlotColumnProps {
    pub column: String,
    pub column_type: Option<ColumnType>,

    /// The staged slot this pill occupies - its drag origin.
    pub action: DragTarget,

    pub presentation: Presentation,

    #[prop_or_default]
    pub aggregate: Option<Html>,

    /// Trailing affordance in the row (the order slot's staged sort-dir
    /// toggle).
    #[prop_or_default]
    pub trailing: Html,
}

impl PartialEq for WindowSlotColumnProps {
    fn eq(&self, other: &Self) -> bool {
        self.column == other.column
            && self.column_type == other.column_type
            && self.action == other.action
            && self.aggregate == other.aggregate
            && self.trailing == other.trailing
    }
}

impl DragDropListItemProps for WindowSlotColumnProps {
    type Item = String;

    fn get_item(&self) -> String {
        self.column.clone()
    }
}

pub struct WindowSlotColumn;

impl Component for WindowSlotColumn {
    type Message = ();
    type Properties = WindowSlotColumnProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let dragstart = Callback::from({
            let column = ctx.props().column.clone();
            let presentation = ctx.props().presentation.clone();
            let action = ctx.props().action;
            move |event: DragEvent| {
                if presentation.set_drag_image(&event) {
                    presentation.notify_drag_start(column.clone(), DragEffect::Move(action))
                }
            }
        });

        let dragend = Callback::from({
            let presentation = ctx.props().presentation.clone();
            move |_: DragEvent| presentation.notify_drag_end()
        });

        html! {
            <div class="column-selector-column">
                <ColumnSelectorColumnRow
                    name={ctx.props().column.clone()}
                    col_type={ctx.props().column_type}
                    aggregate={ctx.props().aggregate.clone()}
                    trailing={ctx.props().trailing.clone()}
                    wrapper_class={classes!["column-selector-column-title"]}
                    ondragstart={Some(dragstart)}
                    ondragend={Some(dragend)}
                />
            </div>
        }
    }
}

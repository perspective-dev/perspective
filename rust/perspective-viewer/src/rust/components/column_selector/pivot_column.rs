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
use web_sys::*;
use yew::prelude::*;

use crate::components::containers::dragdrop_list::*;
use crate::components::type_icon::TypeIcon;
use crate::dragdrop::*;
use crate::session::*;
use crate::utils::*;

#[derive(Properties)]
pub struct PivotColumnProps {
    /// Column name.
    pub column: String,

    #[prop_or_default]
    pub column_type: Option<ColumnType>,

    /// The drag starte of this column, if applicable.
    pub action: DragTarget,

    /// Session metadata snapshot — threaded from `SessionProps`.
    #[prop_or_default]
    pub metadata: Option<SessionMetadata>,

    // State
    #[prop_or_default]
    pub opt_session: Option<Session>,
    pub dragdrop: DragDrop,
}

impl PartialEq for PivotColumnProps {
    fn eq(&self, other: &Self) -> bool {
        self.column == other.column
            && self.action == other.action
            && self.metadata == other.metadata
    }
}

impl DragDropListItemProps for PivotColumnProps {
    type Item = String;

    fn get_item(&self) -> String {
        self.column.clone()
    }
}

pub struct PivotColumn;

impl Component for PivotColumn {
    type Message = ();
    type Properties = PivotColumnProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let dragstart = Callback::from({
            let event_name = ctx.props().column.to_owned();
            let dragdrop = ctx.props().dragdrop.clone();
            let action = ctx.props().action;
            move |event: DragEvent| {
                dragdrop.set_drag_image(&event).unwrap();
                dragdrop.notify_drag_start(event_name.to_string(), DragEffect::Move(action))
            }
        });

        let dragend = Callback::from({
            let dragdrop = ctx.props().dragdrop.clone();
            move |_event| dragdrop.notify_drag_end()
        });

        let col_type = ctx.props().column_type.unwrap_or_else(|| {
            ctx.props()
                .metadata
                .as_ref()
                .and_then(|x| x.get_column_table_type(&ctx.props().column))
                .unwrap_or(ColumnType::Integer)
        });

        html! {
            <div
                class="pivot-column-draggable"
                draggable="true"
                ondragstart={dragstart}
                ondragend={dragend}
            >
                <div class="pivot-column-border">
                    <TypeIcon ty={col_type} />
                    <span class="column_name">{ ctx.props().column.clone() }</span>
                </div>
            </div>
        }
    }
}

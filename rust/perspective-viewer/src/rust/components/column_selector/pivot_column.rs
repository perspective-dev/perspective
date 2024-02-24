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

use perspective_client::ColumnType;
use web_sys::*;
use yew::prelude::*;

use crate::components::containers::dragdrop_list::*;
use crate::components::type_icon::TypeIcon;
use crate::dragdrop::*;

pub struct PivotColumn {}

#[derive(Properties)]
pub struct PivotColumnProps {
    pub column: String,
    pub dragdrop: DragDrop,
    pub action: DragTarget,
}

impl PartialEq for PivotColumnProps {
    fn eq(&self, other: &Self) -> bool {
        self.column == other.column && self.action == other.action
    }
}

impl DragDropListItemProps for PivotColumnProps {
    type Item = String;

    fn get_item(&self) -> String {
        self.column.clone()
    }
}

impl Component for PivotColumn {
    type Message = ();
    type Properties = PivotColumnProps;

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

        html! {
            <div
                class="pivot-column-draggable"
                draggable="true"
                ondragstart={dragstart}
                ondragend={dragend}
            >
                <div
                    class="pivot-column-border"
                >
                    <TypeIcon ty={ColumnType::String} />
                    <span class="column_name">{ ctx.props().column.clone() }</span>
                </div>
            </div>
        }
    }

    fn create(_ctx: &Context<Self>) -> Self {
        Self {}
    }
}

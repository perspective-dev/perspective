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
use crate::config::*;
use crate::dragdrop::*;
use crate::model::*;
use crate::renderer::*;
use crate::session::*;
use crate::*;

/// A `SortColumn` includes the column name and `SortDir` arrow, a clickable
/// button which cycles through the available `SortDir` states.
pub struct SortColumn {}

#[derive(Properties)]
pub struct SortColumnProps {
    pub sort: Sort,
    pub idx: usize,
    pub session: Session,
    pub renderer: Renderer,
    pub dragdrop: DragDrop,
}

impl PartialEq for SortColumnProps {
    fn eq(&self, other: &Self) -> bool {
        self.sort == other.sort && self.idx == other.idx
    }
}

derive_model!(Renderer, Session for SortColumnProps);

impl DragDropListItemProps for SortColumnProps {
    type Item = Sort;

    fn get_item(&self) -> Sort {
        self.sort.clone()
    }
}

pub enum SortColumnMsg {
    SortDirClick(bool),
}

impl Component for SortColumn {
    type Message = SortColumnMsg;
    type Properties = SortColumnProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {}
    }

    fn update(&mut self, ctx: &Context<Self>, msg: SortColumnMsg) -> bool {
        match msg {
            SortColumnMsg::SortDirClick(shift_key) => {
                let is_split = ctx.props().session.get_view_config().split_by.is_empty();
                let mut sort = ctx.props().session.get_view_config().sort.clone();
                let sort_column = &mut sort.get_mut(ctx.props().idx).expect("Sort on no column");
                sort_column.1 = sort_column.1.cycle(!is_split, shift_key);
                let update = ViewConfigUpdate {
                    sort: Some(sort),
                    ..ViewConfigUpdate::default()
                };
                ApiFuture::spawn(ctx.props().update_and_render(update));
                false
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let onclick = ctx
            .link()
            .callback(|event: MouseEvent| SortColumnMsg::SortDirClick(event.shift_key()));

        let dragstart = Callback::from({
            let event_name = ctx.props().sort.0.to_owned();
            let dragdrop = ctx.props().dragdrop.clone();
            move |event: DragEvent| {
                dragdrop.set_drag_image(&event).unwrap();
                dragdrop
                    .notify_drag_start(event_name.to_string(), DragEffect::Move(DragTarget::Sort))
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
                    <span class="column_name">{ ctx.props().sort.0.to_owned() }</span>
                    <span
                        class={format!("sort-icon {}", ctx.props().sort.1)}
                        onmousedown={onclick}
                    />
                </div>
            </div>
        }
    }
}

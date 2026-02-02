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
use std::marker::PhantomData;

use derivative::Derivative;
use web_sys::*;
use yew::html::Scope;
use yew::prelude::*;

use crate::components::column_selector::{EmptyColumn, InPlaceColumn, InvalidColumn};
use crate::custom_elements::ColumnDropDownElement;
use crate::dragdrop::*;
use crate::utils::DragTarget;

#[derive(Properties, Derivative)]
#[derivative(Clone(bound = ""))]
pub struct DragDropListProps<T, U>
where
    T: Component,
    U: Component,
    <U as Component>::Properties: DragDropListItemProps,
{
    pub parent: Scope<T>,
    pub dragdrop: DragDrop,
    pub name: &'static str,
    pub column_dropdown: ColumnDropDownElement,
    pub exclude: HashSet<String>,
    pub children: ChildrenWithProps<U>,

    #[prop_or_default]
    pub is_dragover: Option<(
        usize,
        <<U as Component>::Properties as DragDropListItemProps>::Item,
    )>,

    #[prop_or_default]
    pub allow_duplicates: bool,
}

impl<T, U> PartialEq for DragDropListProps<T, U>
where
    T: Component,
    U: Component,
    <U as Component>::Properties: DragDropListItemProps,
{
    fn eq(&self, other: &Self) -> bool {
        self.name == other.name
            && self.children == other.children
            && self.allow_duplicates == other.allow_duplicates
            && self.is_dragover == other.is_dragover
    }
}

pub enum DragDropListMsg {
    Freeze(bool),
}

/// A sub-selector for a list-like component of a `JsViewConfig`, such as
/// `filters` and `sort`.  
///
/// `DragDropList` is parameterized by two `Component`
/// types, the parent component `T` and the inner item compnent `U`, which must
/// additionally implement `DragDropListItemProps` trait on its own `Properties`
/// associated type.
///
/// Before you ask:  yes, `frozen_size` needs to be a float64 since `flex`
/// containers can have fractional dimensions.
pub struct DragDropList<T, U, V>
where
    T: Component,
    U: Component,
    <U as Component>::Properties: DragDropListItemProps,
    V: DragContext<T::Message> + 'static,
{
    parent_type: PhantomData<T>,
    item_type: PhantomData<U>,
    draggable_type: PhantomData<V>,
    elem: NodeRef,
    frozen_size: Option<f64>,
}

impl<T, U, V> Component for DragDropList<T, U, V>
where
    T: Component,
    U: Component,
    <U as Component>::Properties: DragDropListItemProps,
    V: DragContext<T::Message> + 'static,
{
    type Message = DragDropListMsg;
    type Properties = DragDropListProps<T, U>;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            parent_type: PhantomData,
            item_type: PhantomData,
            draggable_type: PhantomData,
            elem: NodeRef::default(),
            frozen_size: None,
        }
    }

    fn changed(&mut self, _ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        true
    }

    fn update(&mut self, _ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            // When a dragover occurs and a new Column is inserted into the selector,
            // the geometry of the selector may expand and cause a parent reflow,
            // which annoyingly changes the drag status and glitchiness occurs.
            // By using `Freeze` when a dragenter occurs, the element's width will be
            // frozen until `drop` or `dragleave`.
            DragDropListMsg::Freeze(freeze) => {
                if freeze && self.frozen_size.is_none() {
                    let elem = self.elem.cast::<HtmlElement>().unwrap();
                    self.frozen_size = Some({
                        // `offset_width` and family are `i32`, but Chrome _really_
                        // uses fractional pixel widths for these which can only be
                        // recovered by parsing the generated stylesheet ...
                        let txt = window()
                            .unwrap()
                            .get_computed_style(&elem)
                            .unwrap()
                            .unwrap()
                            .get_property_value("width")
                            .unwrap();

                        // Strip "px" suffix, e.g. "24.876px".
                        let px = &txt[..txt.len() - 2];
                        px.parse::<f64>().unwrap()
                    });
                    true
                } else if !freeze {
                    // Don't render because the invoker will do so through `dragdrop`.
                    self.frozen_size = None;
                    false
                } else {
                    false
                }
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let dragover = Callback::from(|_event: DragEvent| _event.prevent_default());

        // On dragleave, signal the parent but no need to redraw as parent will call
        // `change()` when resetting props.
        let drag_container = DragDropContainer::new(
            {
                let total = ctx.props().children.len();
                let parent = ctx.props().parent.clone();
                let link = ctx.link().clone();
                move || {
                    link.send_message(DragDropListMsg::Freeze(true));
                    parent.send_message(V::dragenter(total))
                }
            },
            {
                let parent = ctx.props().parent.clone();
                let link = ctx.link().clone();
                move || {
                    link.send_message(DragDropListMsg::Freeze(false));
                    parent.send_message(V::dragleave())
                }
            },
        );

        let drop = Callback::from({
            let dragdrop = ctx.props().dragdrop.clone();
            let link = ctx.link().clone();
            move |event| {
                link.send_message(DragDropListMsg::Freeze(false));
                dragdrop.notify_drop(&event);
            }
        });

        let invalid_drag: bool;
        let mut valid_duplicate_drag = false;

        let columns_html = {
            let mut columns = ctx
                .props()
                .children
                .iter()
                .map(|x| (true, Some(x)))
                .enumerate()
                .collect::<Vec<_>>();

            invalid_drag = if let Some((x, column)) = &ctx.props().is_dragover {
                let index = *x;
                let is_append = index == columns.len();
                let is_self_move = ctx
                    .props()
                    .dragdrop
                    .get_drag_target()
                    .map(|x| V::is_self_move(x))
                    .unwrap_or_default();

                let is_duplicate = columns
                    .iter()
                    .position(|x| x.1.1.as_ref().unwrap().props.get_item() == *column);

                valid_duplicate_drag = is_duplicate.is_some() && !ctx.props().allow_duplicates;
                if let Some(duplicate) = is_duplicate
                    && !is_append
                    && (!ctx.props().allow_duplicates || is_self_move)
                {
                    columns.remove(duplicate);
                }

                // If inserting into the middle of the list, use
                // the length of the existing element to prevent
                // jitter as the underlying dragover zone moves.
                if index < columns.len() {
                    columns.insert(index, (usize::MAX, (false, None)));
                    false
                } else if (!is_append && !ctx.props().allow_duplicates)
                    || ((!is_append || !is_self_move)
                        && (is_duplicate.is_none() || ctx.props().allow_duplicates))
                {
                    columns.push((usize::MAX, (false, None)));
                    false
                } else {
                    true
                }
            } else {
                false
            };

            columns
                .into_iter()
                .enumerate()
                .map(|(idx, column)| {
                    let close = ctx.props().parent.callback(move |_| V::close(idx));
                    let dragenter = ctx.props().parent.callback({
                        let link = ctx.link().clone();
                        move |event: DragEvent| {
                            event.stop_propagation();
                            event.prevent_default();
                            link.send_message(DragDropListMsg::Freeze(true));
                            V::dragenter(idx)
                        }
                    });

                    if let (key, (true, Some(column))) = column {
                        html! {
                            <div {key} class="pivot-column" ondragenter={dragenter}>
                                { Html::from(column) }
                                <span class="row_close" onmousedown={close} />
                            </div>
                        }
                    } else if let (key, (_, Some(column))) = column {
                        html! {
                            <div {key} class="pivot-column" ondragenter={dragenter}>
                                { Html::from(column) }
                                <span class="row_close" style="opacity: 0.3" />
                            </div>
                        }
                    } else {
                        let (key, _) = column;
                        html! {
                            <div {key} class="pivot-column" ondragenter={dragenter}>
                                <div class="config-drop" />
                            </div>
                        }
                    }
                })
                .collect::<Html>()
        };

        let column_dropdown = ctx.props().column_dropdown.clone();
        let exclude = ctx.props().exclude.clone();
        let on_select = ctx.props().parent.callback(V::create);
        html! {
            <div ref={&self.elem} class="rrow">
                <div
                    id={ctx.props().name}
                    ondragover={dragover}
                    ondragenter={drag_container.dragenter}
                    ondragleave={drag_container.dragleave}
                    ref={drag_container.noderef}
                    ondrop={drop}
                >
                    <div class="psp-text-field">
                        <ul class="psp-text-field__input" for={ctx.props().name}>
                            { columns_html }
                            if ctx.props().is_dragover.is_none() | (!invalid_drag && valid_duplicate_drag) {
                                <EmptyColumn {column_dropdown} {exclude} {on_select} />
                            } else if invalid_drag {
                                <InvalidColumn />
                            }
                        </ul>
                        <label class="pivot-selector-label" for={ctx.props().name} />
                    </div>
                </div>
            </div>
        }
    }
}

/// Must be implemented by `Properties` of children of `DragDropList`, returning
/// the value a DragDropItem represents.
pub trait DragDropListItemProps: Properties {
    type Item: Clone + PartialEq;
    fn get_item(&self) -> Self::Item;
}

pub trait DragContext<T> {
    fn close(index: usize) -> T;
    fn dragleave() -> T;
    fn dragenter(index: usize) -> T;
    fn create(col: InPlaceColumn) -> T;
    fn is_self_move(effect: DragTarget) -> bool;
}

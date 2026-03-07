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

mod active_column;
mod add_expression_button;
mod aggregate_selector;
mod config_selector;
mod empty_column;
mod expr_edit_button;
mod filter_column;
mod inactive_column;
mod invalid_column;
mod pivot_column;
mod sort_column;

use std::iter::*;
use std::rc::Rc;

pub use empty_column::*;
pub use invalid_column::*;
use perspective_js::utils::ApiFuture;
use web_sys::*;
use yew::prelude::*;

use self::active_column::*;
use self::add_expression_button::AddExpressionButton;
use self::config_selector::ConfigSelector;
use self::inactive_column::*;
use super::containers::scroll_panel::*;
use super::containers::split_panel::{Orientation, SplitPanel};
use super::style::LocalStyle;
use crate::components::containers::scroll_panel_item::ScrollPanelItem;
use crate::custom_elements::ColumnDropDownElement;
use crate::dragdrop::*;
use crate::model::*;
use crate::presentation::ColumnLocator;
use crate::renderer::*;
use crate::session::*;
use crate::utils::*;
use crate::*;

#[derive(Properties, PerspectiveProperties!)]
pub struct ColumnSelectorProps {
    /// Fires when the expression/config column is open.
    pub on_open_expr_panel: Callback<ColumnLocator>,

    /// This is passed to the add_expression_button for styling.
    pub selected_column: Option<ColumnLocator>,

    /// Fires when this component is resized via the UI.
    #[prop_or_default]
    pub on_resize: Option<Rc<PubSub<()>>>,

    // State
    pub session: Session,
    pub renderer: Renderer,
    pub dragdrop: DragDrop,
}

impl PartialEq for ColumnSelectorProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.selected_column == rhs.selected_column
    }
}

#[derive(Debug)]
pub enum ColumnSelectorMsg {
    TableLoaded,
    ViewCreated,
    HoverActiveIndex(Option<usize>),
    Drag(DragEffect),
    DragEnd,
    Drop((String, DragTarget, DragEffect, usize)),
}

use ColumnSelectorMsg::*;

/// A `ColumnSelector` controls the `columns` field of the `ViewConfig`,
/// deriving its options from the table columns and `ViewConfig` expressions.
pub struct ColumnSelector {
    _subscriptions: [Subscription; 5],
    named_row_count: usize,
    drag_container: DragDropContainer,
    column_dropdown: ColumnDropDownElement,
    on_reset: Rc<PubSub<()>>,
}

impl Component for ColumnSelector {
    type Message = ColumnSelectorMsg;
    type Properties = ColumnSelectorProps;

    fn create(ctx: &Context<Self>) -> Self {
        let ColumnSelectorProps {
            dragdrop,
            renderer,
            session,
            ..
        } = ctx.props();
        let table_sub = {
            let cb = ctx.link().callback(|_| ColumnSelectorMsg::TableLoaded);
            session.table_loaded.add_listener(cb)
        };

        let view_sub = {
            let cb = ctx.link().callback(|_| ColumnSelectorMsg::ViewCreated);
            session.view_created.add_listener(cb)
        };

        let drop_sub = {
            let cb = ctx.link().callback(ColumnSelectorMsg::Drop);
            dragdrop.drop_received.add_listener(cb)
        };

        let drag_sub = {
            let cb = ctx.link().callback(ColumnSelectorMsg::Drag);
            dragdrop.dragstart_received.add_listener(cb)
        };

        let dragend_sub = {
            let cb = ctx.link().callback(|_| ColumnSelectorMsg::DragEnd);
            dragdrop.dragend_received.add_listener(cb)
        };

        let named = maybe! {
            let plugin =
                renderer.get_active_plugin().ok()?;

            Some(plugin.config_column_names()?.length() as usize)
        };

        let named_row_count = named.unwrap_or_default();
        let drag_container = DragDropContainer::new(|| {}, {
            let link = ctx.link().clone();
            move || link.send_message(ColumnSelectorMsg::HoverActiveIndex(None))
        });

        let column_dropdown = ColumnDropDownElement::new(session.clone());
        Self {
            _subscriptions: [table_sub, view_sub, drop_sub, drag_sub, dragend_sub],
            named_row_count,
            drag_container,
            column_dropdown,
            on_reset: Default::default(),
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            Drag(DragEffect::Move(DragTarget::Active)) => false,
            Drag(_) | DragEnd | TableLoaded => true,
            ViewCreated => {
                let named = maybe! {
                    let plugin =
                        ctx.props().renderer.get_active_plugin().ok()?;

                    Some(plugin.config_column_names()?.length() as usize)
                };

                self.named_row_count = named.unwrap_or_default();
                true
            },
            HoverActiveIndex(Some(to_index)) => ctx
                .props()
                .dragdrop
                .notify_drag_enter(DragTarget::Active, to_index),
            HoverActiveIndex(_) => {
                ctx.props().dragdrop.notify_drag_leave(DragTarget::Active);
                true
            },
            Drop((column, DragTarget::Active, DragEffect::Move(DragTarget::Active), index)) => {
                if !ctx.props().is_invalid_columns_column(&column, index) {
                    let update = ctx.props().session.create_drag_drop_update(
                        column,
                        index,
                        DragTarget::Active,
                        DragEffect::Move(DragTarget::Active),
                        &ctx.props().renderer.metadata(),
                    );

                    if let Ok(task) = ctx.props().update_and_render(update) {
                        ApiFuture::spawn(task);
                    }
                }

                true
            },
            Drop((column, DragTarget::Active, effect, index)) => {
                let update = ctx.props().session.create_drag_drop_update(
                    column,
                    index,
                    DragTarget::Active,
                    effect,
                    &ctx.props().renderer.metadata(),
                );

                if let Ok(task) = ctx.props().update_and_render(update) {
                    ApiFuture::spawn(task);
                }

                true
            },
            Drop((_, _, DragEffect::Move(DragTarget::Active), _)) => true,
            Drop((..)) => true,
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let ColumnSelectorProps {
            session,
            renderer,
            dragdrop,
            ..
        } = ctx.props();
        let config = session.get_view_config();
        let is_aggregated = config.is_aggregated();
        let columns_iter = ctx.props().column_selector_iter_set(&config);
        let onselect = ctx.link().callback(|()| ViewCreated);
        let ondragenter = ctx.link().callback(HoverActiveIndex);
        let ondragover = Callback::from(|_event: DragEvent| _event.prevent_default());
        let ondrop = Callback::from({
            clone!(dragdrop);
            move |event| dragdrop.notify_drop(&event)
        });

        let ondragend = Callback::from({
            clone!(dragdrop);
            move |_| dragdrop.notify_drag_end()
        });

        let mut active_classes = classes!();
        if ctx.props().dragdrop.get_drag_column().is_some() {
            active_classes.push("dragdrop-highlight");
        };

        if is_aggregated {
            active_classes.push("is-aggregated");
        }

        let size_hint = 28.0f64.mul_add(
            (config.group_by.len()
                + config.split_by.len()
                + config.filter.len()
                + config.sort.len()) as f64,
            session
                .metadata()
                .get_features()
                .map(|x| {
                    let mut y = 0.0;
                    if !x.filter_ops.is_empty() {
                        y += 1.0;
                    }

                    if x.group_by {
                        y += 1.0;
                    }

                    if x.split_by {
                        y += 1.0;
                    }

                    if x.sort {
                        y += 1.0;
                    }

                    y * 55.0
                })
                .unwrap_or_default(),
        );

        let config_selector = html_nested! {
            <ScrollPanelItem key="config_selector" {size_hint}>
                <ConfigSelector
                    onselect={onselect.clone()}
                    ondragenter={ctx.link().callback(|()| ViewCreated)}
                    {dragdrop}
                    {renderer}
                    {session}
                />
            </ScrollPanelItem>
        };

        let mut named_count = self.named_row_count;
        let mut active_columns: Vec<_> = columns_iter
            .active()
            .enumerate()
            .map(|(idx, name)| {
                let ondragenter = ondragenter.reform(move |_| Some(idx));
                let size_hint = if named_count > 0 { 50.0 } else { 28.0 };
                named_count = named_count.saturating_sub(1);
                let key = name
                    .get_name()
                    .map(|x| x.to_owned())
                    .unwrap_or_else(|| format!("__auto_{idx}__"));

                let column_dropdown = self.column_dropdown.clone();
                let is_editing = matches!(
                    &ctx.props().selected_column,
                    Some(ColumnLocator::Table(x)) | Some(ColumnLocator::Expression(x))
                if x == &key );

                let on_open_expr_panel = &ctx.props().on_open_expr_panel;
                html_nested! {
                    <ScrollPanelItem {key} {size_hint}>
                        <ActiveColumn
                            {column_dropdown}
                            {idx}
                            {is_aggregated}
                            {is_editing}
                            {name}
                            {on_open_expr_panel}
                            {ondragenter}
                            ondragend={&ondragend}
                            onselect={&onselect}
                            {dragdrop}
                            {renderer}
                            {session}
                        />
                    </ScrollPanelItem>
                }
            })
            .collect();

        let mut inactive_children: Vec<_> = columns_iter
            .expression()
            .chain(columns_iter.inactive())
            .enumerate()
            .map(|(idx, vc)| {
                let selected_column = ctx.props().selected_column.as_ref();
                let is_editing = matches!(selected_column, Some(ColumnLocator::Expression(x)) if x.as_str() == vc.name);
                html_nested! {
                    <ScrollPanelItem key={vc.name} size_hint=28.0>
                        <InactiveColumn
                            {idx}
                            visible={vc.is_visible}
                            name={vc.name.to_owned()}
                            {is_editing}
                            onselect={&onselect}
                            ondragend={&ondragend}
                            on_open_expr_panel={&ctx.props().on_open_expr_panel}
                            {dragdrop}
                            {renderer}
                            {session}
                        />
                    </ScrollPanelItem>
                }
            })
            .collect();

        let size = 28.0;

        let add_column = if ctx
            .props()
            .session
            .metadata()
            .get_features()
            .unwrap()
            .expressions
        {
            html_nested! {
                <ScrollPanelItem key="__add_expression__" size_hint={size}>
                    <AddExpressionButton
                        on_open_expr_panel={&ctx.props().on_open_expr_panel}
                        selected_column={ctx.props().selected_column.clone()}
                    />
                </ScrollPanelItem>
            }
        } else {
            html_nested! {
                <ScrollPanelItem key="__add_expression__" size_hint=0_f64><span /></ScrollPanelItem>
            }
        };

        if inactive_children.is_empty() {
            active_columns.push(add_column)
        } else {
            inactive_children.insert(0, add_column);
        }

        let selected_columns = html! {
            <div id="selected-columns">
                <ScrollPanel
                    id="active-columns"
                    class={active_classes}
                    dragover={ondragover}
                    dragenter={&self.drag_container.dragenter}
                    dragleave={&self.drag_container.dragleave}
                    viewport_ref={&self.drag_container.noderef}
                    drop={ondrop}
                    on_resize={&ctx.props().on_resize}
                    on_dimensions_reset={&self.on_reset}
                    children={std::iter::once(config_selector).chain(active_columns).collect::<Vec<_>>()}
                />
            </div>
        };

        html! {
            <>
                <LocalStyle href={css!("column-selector")} />
                <SplitPanel
                    no_wrap=true
                    on_reset={self.on_reset.callback()}
                    skip_empty=true
                    orientation={Orientation::Vertical}
                >
                    { selected_columns }
                    if !inactive_children.is_empty() {
                        <ScrollPanel
                            id="sub-columns"
                            on_resize={&ctx.props().on_resize}
                            on_dimensions_reset={&self.on_reset}
                            children={inactive_children}
                        />
                    }
                </SplitPanel>
            </>
        }
    }
}

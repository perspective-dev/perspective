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
pub use pivot_column::*;
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
use crate::css;
use crate::custom_elements::ColumnDropDownElement;
use crate::dragdrop::*;
use crate::presentation::ColumnLocator;
use crate::renderer::*;
use crate::session::drag_drop_update::*;
use crate::session::*;
use crate::tasks::{ActiveColumnState, ColumnsIteratorSet, can_render_column_styles};
use crate::utils::*;

#[derive(Properties)]
pub struct ColumnSelectorProps {
    /// Fires when the expression/config column is open.
    pub on_open_expr_panel: Callback<ColumnLocator>,

    /// This is passed to the add_expression_button for styling.
    pub selected_column: Option<ColumnLocator>,

    /// Fires when this component is resized via the UI.
    #[prop_or_default]
    pub on_resize: Option<Rc<PubSub<()>>>,

    /// Value props threaded from root's `SessionProps` / `RendererProps`.
    pub has_table: bool,
    pub named_column_count: usize,
    pub view_config: perspective_client::config::ViewConfig,
    pub drag_column: Option<String>,
    /// Cloned session metadata snapshot — threaded from `SessionProps`
    /// so that metadata changes trigger re-renders via prop diffing.
    pub metadata: SessionMetadata,

    // State
    pub session: Session,
    pub renderer: Renderer,
    pub dragdrop: DragDrop,
}

impl PartialEq for ColumnSelectorProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.selected_column == rhs.selected_column
            && self.has_table == rhs.has_table
            && self.named_column_count == rhs.named_column_count
            && self.view_config == rhs.view_config
            && self.drag_column == rhs.drag_column
            && self.metadata == rhs.metadata
    }
}

#[derive(Debug)]
pub enum ColumnSelectorMsg {
    /// Triggers a plain re-render; used as `onselect`/`ondragenter` callbacks
    /// from `ConfigSelector` after it mutates the view config.
    Redraw,
    HoverActiveIndex(Option<usize>),
    SetWidth(f64),
    Drop((String, DragTarget, DragEffect, usize)),
}

use ColumnSelectorMsg::*;

/// A `ColumnSelector` controls the `columns` field of the `ViewConfig`,
/// deriving its options from the table columns and `ViewConfig` expressions.
pub struct ColumnSelector {
    _subscriptions: [Subscription; 1],
    drag_container: DragDropContainer,
    column_dropdown: ColumnDropDownElement,
    viewport_width: f64,
    on_reset: Rc<PubSub<()>>,
}

impl Component for ColumnSelector {
    type Message = ColumnSelectorMsg;
    type Properties = ColumnSelectorProps;

    fn create(ctx: &Context<Self>) -> Self {
        let ColumnSelectorProps {
            dragdrop, session, ..
        } = ctx.props();

        let drop_sub = {
            let cb = ctx.link().callback(ColumnSelectorMsg::Drop);
            dragdrop.drop_received.add_listener(cb)
        };

        let drag_container = DragDropContainer::new(|| {}, {
            let link = ctx.link().clone();
            move || link.send_message(ColumnSelectorMsg::HoverActiveIndex(None))
        });

        let column_dropdown = ColumnDropDownElement::new(session.clone());
        Self {
            _subscriptions: [drop_sub],
            viewport_width: 0f64,
            drag_container,
            column_dropdown,
            on_reset: Default::default(),
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            Redraw => true,
            SetWidth(w) => {
                self.viewport_width = w;
                false
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
                let is_invalid = {
                    let config = &ctx.props().view_config;
                    let from_index = config
                        .columns
                        .iter()
                        .position(|x| x.as_ref() == Some(&column));
                    let min_cols = ctx.props().renderer.metadata().min;
                    let is_to_empty = !config
                        .columns
                        .get(index)
                        .map(|x| x.is_some())
                        .unwrap_or_default();
                    min_cols
                        .and_then(|x| from_index.map(|fi| fi < x))
                        .unwrap_or_default()
                        && is_to_empty
                };
                if !is_invalid {
                    let col_type = ctx
                        .props()
                        .metadata
                        .get_column_table_type(column.as_str())
                        .unwrap();
                    let update = ctx.props().view_config.create_drag_drop_update(
                        column,
                        col_type,
                        index,
                        DragTarget::Active,
                        DragEffect::Move(DragTarget::Active),
                        &ctx.props().renderer.metadata(),
                        ctx.props().metadata.get_features().unwrap(),
                    );

                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                true
            },
            Drop((column, DragTarget::Active, effect, index)) => {
                let col_type = ctx
                    .props()
                    .metadata
                    .get_column_table_type(column.as_str())
                    .unwrap();
                let update = ctx.props().view_config.create_drag_drop_update(
                    column,
                    col_type,
                    index,
                    DragTarget::Active,
                    effect,
                    &ctx.props().renderer.metadata(),
                    ctx.props().metadata.get_features().unwrap(),
                );

                let session = ctx.props().session.clone();
                let renderer = ctx.props().renderer.clone();
                if session.update_view_config(update).is_ok() {
                    ApiFuture::spawn(async move {
                        renderer.apply_pending_plugin()?;
                        renderer.draw(session.validate().await?.create_view()).await
                    });
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
        let metadata = &ctx.props().metadata;
        // When `config.columns` is empty but the table has columns (transient
        // state during `load()` after `reset()` clears the config), fill in
        // all table columns as active — matching `validate_view_config()`.
        let prop_config = &ctx.props().view_config;
        let filled;
        let config = if prop_config.columns.is_empty() {
            if let Some(table_cols) = metadata.get_table_columns() {
                filled = perspective_client::config::ViewConfig {
                    columns: table_cols.iter().map(|c| Some(c.clone())).collect(),
                    ..prop_config.clone()
                };
                &filled
            } else {
                prop_config
            }
        } else {
            prop_config
        };
        let is_aggregated = config.is_aggregated();
        let columns_iter = ColumnsIteratorSet::new(config, metadata, renderer, dragdrop);
        let onselect = ctx.link().callback(|()| Redraw);
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
        if ctx.props().drag_column.is_some() {
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
            metadata
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
                    ondragenter={ctx.link().callback(|()| Redraw)}
                    view_config={ctx.props().view_config.clone()}
                    drag_column={ctx.props().drag_column.clone()}
                    metadata={metadata.clone()}
                    {dragdrop}
                    {renderer}
                    {session}
                />
            </ScrollPanelItem>
        };

        let mut named_count = ctx.props().named_column_count;
        let mut active_columns: Vec<_> = columns_iter
            .active()
            .enumerate()
            .map(|(idx, name): (usize, ActiveColumnState)| {
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

                // Compute metadata-derived props here so that changes to
                // session metadata propagate via prop diffing.
                let col_type = name
                    .get_name()
                    .and_then(|n| metadata.get_column_table_type(n));

                let is_expression = name
                    .get_name()
                    .map(|n| metadata.is_column_expression(n))
                    .unwrap_or(false);

                let can_render_styles = name
                    .get_name()
                    .and_then(|n| can_render_column_styles(renderer, config, metadata, n).ok())
                    .unwrap_or(false);

                let show_edit_btn = is_expression || can_render_styles;
                let on_open_expr_panel = &ctx.props().on_open_expr_panel;
                html_nested! {
                    <ScrollPanelItem {key} {size_hint}>
                        <ActiveColumn
                            {column_dropdown}
                            {idx}
                            {is_aggregated}
                            {is_editing}
                            {is_expression}
                            {show_edit_btn}
                            {col_type}
                            view_config={config.clone()}
                            metadata={metadata.clone()}
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
                let is_expression = metadata.is_column_expression(vc.name);
                html_nested! {
                    <ScrollPanelItem key={vc.name} size_hint=28.0>
                        <InactiveColumn
                            {idx}
                            visible={vc.is_visible}
                            name={vc.name.to_owned()}
                            {is_editing}
                            {is_expression}
                            view_config={config.clone()}
                            metadata={metadata.clone()}
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

        let add_column = if metadata.get_features().unwrap().expressions {
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

        let mut selected_columns = vec![html! {
            <div id="selected-columns" key="__active_columns__">
                <ScrollPanel
                    id="active-columns"
                    class={active_classes}
                    dragover={ondragover}
                    dragenter={&self.drag_container.dragenter}
                    dragleave={&self.drag_container.dragleave}
                    viewport_ref={&self.drag_container.noderef}
                    initial_width={self.viewport_width}
                    on_auto_width={ctx.link().callback(ColumnSelectorMsg::SetWidth)}
                    drop={ondrop}
                    on_resize={&ctx.props().on_resize}
                    on_dimensions_reset={&self.on_reset}
                    children={std::iter::once(config_selector).chain(active_columns).collect::<Vec<_>>()}
                />
            </div>
        }];

        if !inactive_children.is_empty() {
            selected_columns.push(html! {
                <ScrollPanel
                    id="sub-columns"
                    key="__sub_columns__"
                    on_resize={&ctx.props().on_resize}
                    on_dimensions_reset={&self.on_reset}
                    children={inactive_children}
                />
            })
        }

        html! {
            <>
                <LocalStyle href={css!("column-selector")} />
                <SplitPanel
                    no_wrap=true
                    on_reset={self.on_reset.callback()}
                    skip_empty=true
                    orientation={Orientation::Vertical}
                >
                    { for selected_columns }
                </SplitPanel>
            </>
        }
    }
}

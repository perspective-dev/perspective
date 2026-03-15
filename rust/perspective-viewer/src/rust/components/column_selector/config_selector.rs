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
use std::rc::Rc;

use perspective_client::config::*;
use perspective_js::utils::ApiFuture;
use yew::prelude::*;

use perspective_client::config::ViewConfig;

use super::InPlaceColumn;
use super::filter_column::*;
use super::pivot_column::*;
use super::sort_column::*;
use crate::components::containers::dragdrop_list::*;
use crate::components::containers::select::{Select, SelectItem};
use crate::components::style::LocalStyle;
use crate::custom_elements::{ColumnDropDownElement, FilterDropDownElement};
use crate::dragdrop::*;
use crate::renderer::*;
use crate::session::*;
use crate::session::drag_drop_update::*;
use crate::utils::*;
use crate::css;

#[derive(Clone, Properties)]
pub struct ConfigSelectorProps {
    pub onselect: Callback<()>,

    #[prop_or_default]
    pub ondragenter: Callback<()>,

    /// Current view config threaded as a value prop so that config changes
    /// (group_by, sort, filter, etc.) trigger re-renders via normal prop diffing
    /// rather than a PubSub `view_created` subscription.
    pub view_config: ViewConfig,
    /// Column currently being dragged — threaded to show `dragdrop-highlight`
    /// without subscribing to `dragstart_received`/`dragend_received`.
    pub drag_column: Option<String>,
    /// Session metadata snapshot — threaded from `SessionProps`.
    pub metadata: SessionMetadata,

    // State
    pub session: Session,
    pub renderer: Renderer,
    pub dragdrop: DragDrop,
}

impl PartialEq for ConfigSelectorProps {
    fn eq(&self, other: &Self) -> bool {
        self.view_config == other.view_config
            && self.drag_column == other.drag_column
            && self.metadata == other.metadata
    }
}

#[derive(Debug)]
pub enum ConfigSelectorMsg {
    DragOver(usize, DragTarget),
    DragLeave(DragTarget),
    Drop(String, DragTarget, DragEffect, usize),
    Close(usize, DragTarget),
    SetFilterValue(usize, String),
    TransposePivots,
    New(DragTarget, InPlaceColumn),
    UpdateGroupRollupMode(GroupRollupMode),
}

#[derive(Clone)]
pub struct ConfigSelector {
    filter_dropdown: FilterDropDownElement,
    column_dropdown: ColumnDropDownElement,
    _subscriptions: [Rc<Subscription>; 1],
}

impl Component for ConfigSelector {
    type Message = ConfigSelectorMsg;
    type Properties = ConfigSelectorProps;

    fn create(ctx: &Context<Self>) -> Self {
        let cb = ctx
            .link()
            .callback(|x: (String, DragTarget, DragEffect, usize)| {
                ConfigSelectorMsg::Drop(x.0, x.1, x.2, x.3)
            });
        let drop_sub = Rc::new(ctx.props().dragdrop.drop_received.add_listener(cb));

        let filter_dropdown = FilterDropDownElement::new(ctx.props().session.clone());
        let column_dropdown = ColumnDropDownElement::new(ctx.props().session.clone());
        let _subscriptions = [drop_sub];
        Self {
            filter_dropdown,
            column_dropdown,
            _subscriptions,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            ConfigSelectorMsg::DragOver(index, action) => {
                let should_render = ctx.props().dragdrop.notify_drag_enter(action, index);
                if should_render {
                    ctx.props().ondragenter.emit(());
                }
                should_render
            },
            ConfigSelectorMsg::DragLeave(action) => {
                ctx.props().dragdrop.notify_drag_leave(action);
                true
            },
            ConfigSelectorMsg::Close(index, DragTarget::Sort) => {
                let mut sort = ctx.props().view_config.sort.clone();
                sort.remove(index);
                let sort = Some(sort);
                let config = ViewConfigUpdate {
                    sort,
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(config).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::UpdateGroupRollupMode(mode) => {
                let config = ViewConfigUpdate {
                    group_rollup_mode: Some(mode),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(config).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                false
            },
            ConfigSelectorMsg::Close(index, DragTarget::GroupBy) => {
                if ctx.props().view_config.group_rollup_mode == GroupRollupMode::Total
                {
                    let requirements = ctx.props().renderer.metadata();

                    let rollup_features = ctx
                        .props()
                        .metadata
                        .get_features()
                        .map(|x| x.get_group_rollup_modes())
                        .unwrap();

                    let group_rollups = requirements.get_group_rollups(&rollup_features);

                    ctx.link()
                        .send_message(ConfigSelectorMsg::UpdateGroupRollupMode(
                            group_rollups.first().cloned().unwrap(),
                        ));
                    false
                } else {
                    let mut group_by = ctx.props().view_config.group_by.clone();
                    group_by.remove(index);
                    let config = ViewConfigUpdate {
                        group_by: Some(group_by),
                        ..ViewConfigUpdate::default()
                    };

                    {
                        let session = ctx.props().session.clone();
                        let renderer = ctx.props().renderer.clone();
                        if session.update_view_config(config).is_ok() {
                            ApiFuture::spawn(async move {
                                renderer.apply_pending_plugin()?;
                                renderer.draw(session.validate().await?.create_view()).await
                            });
                        }
                    }

                    ctx.props().onselect.emit(());
                    false
                }
            },
            ConfigSelectorMsg::Close(index, DragTarget::SplitBy) => {
                let mut split_by = ctx.props().view_config.split_by.clone();
                split_by.remove(index);
                let config = ViewConfigUpdate {
                    split_by: Some(split_by),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(config).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::Close(index, DragTarget::Filter) => {
                self.filter_dropdown.hide().unwrap();
                let mut filter = ctx.props().view_config.filter.clone();
                filter.remove(index);
                let config = ViewConfigUpdate {
                    filter: Some(filter),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(config).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::Close(..) => false,
            ConfigSelectorMsg::Drop(column, action, effect, index)
                if action != DragTarget::Active =>
            {
                let col_type = ctx.props().metadata
                    .get_column_table_type(column.as_str())
                    .unwrap();
                let update = ctx.props().view_config.create_drag_drop_update(
                    column,
                    col_type,
                    index,
                    action,
                    effect,
                    &ctx.props().renderer.metadata(),
                    ctx.props().metadata.get_features().unwrap(),
                );

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::Drop(_, _, DragEffect::Move(action), _)
                if action != DragTarget::Active =>
            {
                true
            },
            ConfigSelectorMsg::Drop(..) => false,
            ConfigSelectorMsg::TransposePivots => {
                let mut view_config = ctx.props().view_config.clone();
                std::mem::swap(&mut view_config.group_by, &mut view_config.split_by);

                let update = ViewConfigUpdate {
                    group_by: Some(view_config.group_by),
                    split_by: Some(view_config.split_by),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }
                ctx.props().onselect.emit(());
                false
            },

            ConfigSelectorMsg::SetFilterValue(index, input) => {
                let mut filter = ctx.props().view_config.filter.clone();

                // TODO Can't special case these - need to make this part of the
                // Features API.
                let update = if filter[index].op() == "in" || filter[index].op() == "not in" {
                    let current = filter[index].term().to_string();
                    let mut tokens = current.split(',').collect::<Vec<_>>();
                    tokens.pop();
                    tokens.push(&input);
                    *filter[index].term_mut() = FilterTerm::Array(
                        tokens
                            .iter()
                            .map(|x| Scalar::String(x.trim().to_owned()))
                            .collect(),
                    );

                    let filter = Some(filter);
                    ViewConfigUpdate {
                        filter,
                        ..ViewConfigUpdate::default()
                    }
                } else {
                    *filter[index].term_mut() = FilterTerm::Scalar(Scalar::String(input));
                    let filter = Some(filter);
                    ViewConfigUpdate {
                        filter,
                        ..ViewConfigUpdate::default()
                    }
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                false
            },
            ConfigSelectorMsg::New(DragTarget::GroupBy, InPlaceColumn::Column(col)) => {
                let mut view_config = ctx.props().view_config.clone();
                view_config.group_by.push(col);
                let update = ViewConfigUpdate {
                    group_by: Some(view_config.group_by),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::New(DragTarget::SplitBy, InPlaceColumn::Column(col)) => {
                let mut view_config = ctx.props().view_config.clone();
                view_config.split_by.push(col);
                let update = ViewConfigUpdate {
                    split_by: Some(view_config.split_by),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::New(DragTarget::Filter, InPlaceColumn::Column(column)) => {
                let mut view_config = ctx.props().view_config.clone();
                let op = ctx.props().default_op(column.as_str()).unwrap_or_default();
                view_config.filter.push(Filter::new(
                    &column,
                    &op,
                    FilterTerm::Scalar(Scalar::Null),
                ));

                let update = ViewConfigUpdate {
                    filter: Some(view_config.filter),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::New(DragTarget::Sort, InPlaceColumn::Column(col)) => {
                let mut view_config = ctx.props().view_config.clone();
                view_config.sort.push(Sort(col, SortDir::Asc));
                let update = ViewConfigUpdate {
                    sort: Some(view_config.sort),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::New(DragTarget::GroupBy, InPlaceColumn::Expression(col)) => {
                let mut view_config = ctx.props().view_config.clone();
                view_config.group_by.push(col.name.as_ref().to_owned());
                view_config.expressions.insert(&col);
                let update = ViewConfigUpdate {
                    group_by: Some(view_config.group_by),
                    expressions: Some(view_config.expressions),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::New(DragTarget::SplitBy, InPlaceColumn::Expression(col)) => {
                let mut view_config = ctx.props().view_config.clone();
                view_config.split_by.push(col.name.as_ref().to_owned());
                view_config.expressions.insert(&col);
                let update = ViewConfigUpdate {
                    split_by: Some(view_config.split_by),
                    expressions: Some(view_config.expressions),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::New(DragTarget::Filter, InPlaceColumn::Expression(col)) => {
                let mut view_config = ctx.props().view_config.clone();
                let column = col.name.as_ref();
                view_config.filter.push(Filter::new(
                    column,
                    &ctx.props()
                        .default_op(col.name.as_ref())
                        .unwrap_or_default(),
                    FilterTerm::Scalar(Scalar::Null),
                ));

                view_config.expressions.insert(&col);
                let update = ViewConfigUpdate {
                    filter: Some(view_config.filter),
                    expressions: Some(view_config.expressions),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::New(DragTarget::Sort, InPlaceColumn::Expression(col)) => {
                let mut view_config = ctx.props().view_config.clone();
                view_config
                    .sort
                    .push(Sort(col.name.as_ref().to_owned(), SortDir::Asc));
                view_config.expressions.insert(&col);
                let update = ViewConfigUpdate {
                    sort: Some(view_config.sort),
                    expressions: Some(view_config.expressions),
                    ..ViewConfigUpdate::default()
                };

                {
                    let session = ctx.props().session.clone();
                    let renderer = ctx.props().renderer.clone();
                    if session.update_view_config(update).is_ok() {
                        ApiFuture::spawn(async move {
                            renderer.apply_pending_plugin()?;
                            renderer.draw(session.validate().await?.create_view()).await
                        });
                    }
                }

                ctx.props().onselect.emit(());
                false
            },
            ConfigSelectorMsg::New(DragTarget::Active, _) => false,
        }
    }

    // /// Should not render on change, as this component only depends on service
    // /// state.
    // fn changed(&mut self, _ctx: &Context<Self>, _old: &Self::Properties) -> bool
    // {     false
    // }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let ConfigSelectorProps {
            dragdrop,
            renderer,
            session,
            ..
        } = ctx.props();
        let config = &ctx.props().view_config;
        let transpose = ctx.link().callback(|_| ConfigSelectorMsg::TransposePivots);
        let column_dropdown = self.column_dropdown.clone();
        let mut class = classes!();

        if ctx.props().drag_column.is_some() {
            class.push("dragdrop-highlight");
        }

        if config.group_rollup_mode == GroupRollupMode::Total {
            class.push("group-rollup-mode-total");
        }

        let dragend = Callback::from({
            let dragdrop = dragdrop.clone();
            move |_event| dragdrop.notify_drag_end()
        });

        let metadata = &ctx.props().metadata;
        let features = metadata.get_features().unwrap();
        let requirements = renderer.metadata();
        let on_group_rollup_mode = ctx
            .link()
            .callback(ConfigSelectorMsg::UpdateGroupRollupMode);

        let rollup_features = metadata
            .get_features()
            .map(|x| x.get_group_rollup_modes())
            .unwrap();

        let group_rollups = requirements.get_group_rollups(&rollup_features);

        html! {
            <div slot="top_panel" id="top_panel" {class} ondragend={dragend}>
                <LocalStyle href={css!("config-selector")} />
                <div class="pivot_controls">
                    if group_rollups.len() > 1 {
                        <Select<GroupRollupMode>
                            id="group_rollup_mode_selector"
                            wrapper_class="group_rollup_wrapper"
                            values={Rc::new(
                                group_rollups
                                    .iter()
                                    .map(|x| SelectItem::Option(*x))
                                    .collect(),
                            )}
                            selected={config.group_rollup_mode}
                            on_select={on_group_rollup_mode}
                        />
                    }
                    if !config.group_by.is_empty() && config.split_by.is_empty() {
                        <span
                            id="transpose_button"
                            class="rrow centered"
                            title="Transpose Pivots"
                            onmousedown={transpose.clone()}
                        />
                    }
                </div>
                if features.group_by {
                    <GroupBySelector
                        name="group_by"
                        disabled={config.group_rollup_mode == GroupRollupMode::Total}
                        parent={ctx.link().clone()}
                        column_dropdown={column_dropdown.clone()}
                        exclude={config.group_by.iter().cloned().collect::<HashSet<_>>()}
                        is_dragover={ctx.props().dragdrop.is_dragover(DragTarget::GroupBy)}
                        {dragdrop}
                    >
                        { for config.group_by.iter().map(|group_by| {
                                html_nested! {
                                    <PivotColumn
                                        action={DragTarget::GroupBy}
                                        column={group_by.clone()}
                                        metadata={metadata.clone()}
                                        {dragdrop}
                                        opt_session={session}
                                    >
                                    </PivotColumn>
                                }
                            }) }
                    </GroupBySelector>
                }
                if features.split_by {
                    if !config.split_by.is_empty() {
                        <div class="pivot_controls">
                            <span
                                id="transpose_button"
                                class="rrow centered"
                                title="Transpose Pivots"
                                onmousedown={transpose}
                            />
                        </div>
                    }
                    <SplitBySelector
                        name="split_by"
                        parent={ctx.link().clone()}
                        column_dropdown={column_dropdown.clone()}
                        exclude={config.split_by.iter().cloned().collect::<HashSet<_>>()}
                        is_dragover={dragdrop.is_dragover(DragTarget::SplitBy)}
                        {dragdrop}
                    >
                        { for config.split_by.iter().map(|split_by| {
                            html_nested! {
                                <PivotColumn
                                    action={ DragTarget::SplitBy }
                                    column={ split_by.clone() }
                                    metadata={metadata.clone()}
                                    {dragdrop}
                                    opt_session={session}>
                                </PivotColumn>
                            }
                        }) }
                    </SplitBySelector>
                }
                if features.sort {
                    <SortSelector
                        name="sort"
                        allow_duplicates=true
                        parent={ctx.link().clone()}
                        column_dropdown={column_dropdown.clone()}
                        exclude={config.sort.iter().map(|x| x.0.clone()).collect::<HashSet<_>>()}
                        is_dragover={dragdrop.is_dragover(DragTarget::Sort).map(|(index, name)| {
                            (index, Sort(name, SortDir::Asc))
                        })}
                        {dragdrop}
                    >
                        { for config.sort.iter().enumerate().map(|(idx, sort)| {
                            html_nested! {
                                <SortColumn
                                    idx={ idx }
                                    sort={ sort.clone() }
                                    view_config={config.clone()}
                                    metadata={metadata.clone()}
                                    {dragdrop}
                                    {renderer}
                                    {session}>
                                </SortColumn>
                            }
                        }) }
                    </SortSelector>
                }
                if !features.filter_ops.is_empty() {
                    <FilterSelector
                        name="filter"
                        allow_duplicates=true
                        parent={ctx.link().clone()}
                        {column_dropdown}
                        exclude={config.filter.iter().map(|x| x.column().to_string()).collect::<HashSet<_>>()}
                        is_dragover={dragdrop.is_dragover(DragTarget::Filter).map(|(index, name)| {
                            (index, Filter::new(&name, "", FilterTerm::Scalar(Scalar::Null)))
                        })}
                        {dragdrop}
                    >
                        { for config.filter.iter().enumerate().map(|(idx, filter)| {
                                let filter_keydown = ctx.link()
                                    .callback(move |txt| ConfigSelectorMsg::SetFilterValue(idx, txt));

                                html_nested! {
                                    <FilterColumn
                                        idx={ idx }
                                        filter_dropdown={ &self.filter_dropdown }
                                        filter={ filter.clone() }
                                        on_keydown={ filter_keydown }
                                        view_config={config.clone()}
                                        metadata={metadata.clone()}
                                        {dragdrop}
                                        {renderer}
                                        {session}>
                                    </FilterColumn>
                                }
                            }) }
                    </FilterSelector>
                }
            </div>
        }
    }
}

impl ConfigSelectorProps {
    fn default_op(&self, column: &str) -> Option<String> {
        let features = self.metadata.get_features()?;
        let col_type = self.metadata.get_column_table_type(column)?;
        let first = features.default_op(col_type)?;
        Some(first.to_string())
    }
}

struct GroupByContext {}
struct SplitByContext {}
struct SortDragContext {}
struct FilterDragContext {}

impl DragContext<ConfigSelectorMsg> for GroupByContext {
    fn dragenter(index: usize) -> ConfigSelectorMsg {
        ConfigSelectorMsg::DragOver(index, DragTarget::GroupBy)
    }

    fn close(index: usize) -> ConfigSelectorMsg {
        ConfigSelectorMsg::Close(index, DragTarget::GroupBy)
    }

    fn dragleave() -> ConfigSelectorMsg {
        ConfigSelectorMsg::DragLeave(DragTarget::GroupBy)
    }

    fn create(col: InPlaceColumn) -> ConfigSelectorMsg {
        ConfigSelectorMsg::New(DragTarget::GroupBy, col)
    }

    fn is_self_move(target: DragTarget) -> bool {
        target == DragTarget::GroupBy
    }
}

impl DragContext<ConfigSelectorMsg> for SplitByContext {
    fn dragenter(index: usize) -> ConfigSelectorMsg {
        ConfigSelectorMsg::DragOver(index, DragTarget::SplitBy)
    }

    fn close(index: usize) -> ConfigSelectorMsg {
        ConfigSelectorMsg::Close(index, DragTarget::SplitBy)
    }

    fn dragleave() -> ConfigSelectorMsg {
        ConfigSelectorMsg::DragLeave(DragTarget::SplitBy)
    }

    fn create(col: InPlaceColumn) -> ConfigSelectorMsg {
        ConfigSelectorMsg::New(DragTarget::SplitBy, col)
    }

    fn is_self_move(target: DragTarget) -> bool {
        target == DragTarget::SplitBy
    }
}

impl DragContext<ConfigSelectorMsg> for SortDragContext {
    fn dragenter(index: usize) -> ConfigSelectorMsg {
        ConfigSelectorMsg::DragOver(index, DragTarget::Sort)
    }

    fn close(index: usize) -> ConfigSelectorMsg {
        ConfigSelectorMsg::Close(index, DragTarget::Sort)
    }

    fn dragleave() -> ConfigSelectorMsg {
        ConfigSelectorMsg::DragLeave(DragTarget::Sort)
    }

    fn create(col: InPlaceColumn) -> ConfigSelectorMsg {
        ConfigSelectorMsg::New(DragTarget::Sort, col)
    }

    fn is_self_move(target: DragTarget) -> bool {
        target == DragTarget::Sort
    }
}

impl DragContext<ConfigSelectorMsg> for FilterDragContext {
    fn dragenter(index: usize) -> ConfigSelectorMsg {
        ConfigSelectorMsg::DragOver(index, DragTarget::Filter)
    }

    fn close(index: usize) -> ConfigSelectorMsg {
        ConfigSelectorMsg::Close(index, DragTarget::Filter)
    }

    fn dragleave() -> ConfigSelectorMsg {
        ConfigSelectorMsg::DragLeave(DragTarget::Filter)
    }

    fn create(col: InPlaceColumn) -> ConfigSelectorMsg {
        ConfigSelectorMsg::New(DragTarget::Filter, col)
    }

    fn is_self_move(target: DragTarget) -> bool {
        target == DragTarget::Filter
    }
}

type GroupBySelector = DragDropList<ConfigSelector, PivotColumn, GroupByContext>;
type SplitBySelector = DragDropList<ConfigSelector, PivotColumn, SplitByContext>;
type SortSelector = DragDropList<ConfigSelector, SortColumn, SortDragContext>;
type FilterSelector = DragDropList<ConfigSelector, FilterColumn, FilterDragContext>;

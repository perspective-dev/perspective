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

use crate::components::containers::select::*;
use crate::components::style::LocalStyle;
use crate::renderer::*;
use crate::session::*;
use crate::css;

#[derive(Properties)]
pub struct AggregateSelectorProps {
    /// The name of this aggregate.
    pub column: String,

    /// Which aggregate is currently selected.
    pub aggregate: Option<Aggregate>,

    /// Session metadata snapshot — threaded from `SessionProps`.
    pub metadata: SessionMetadata,

    /// View config snapshot — threaded from parent as a value prop.
    pub view_config: ViewConfig,

    // State
    pub renderer: Renderer,
    pub session: Session,
}

impl PartialEq for AggregateSelectorProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.column == rhs.column
            && self.aggregate == rhs.aggregate
            && self.metadata == rhs.metadata
            && self.view_config == rhs.view_config
    }
}

pub enum AggregateSelectorMsg {
    SetAggregate(Aggregate),
}

pub struct AggregateSelector {
    aggregates: Rc<Vec<SelectItem<Aggregate>>>,
    aggregate: Option<Aggregate>,
}

impl Component for AggregateSelector {
    type Message = AggregateSelectorMsg;
    type Properties = AggregateSelectorProps;

    fn create(ctx: &Context<Self>) -> Self {
        let mut selector = Self {
            aggregates: Rc::new(vec![]),
            aggregate: ctx.props().aggregate.clone(),
        };

        selector.aggregates = Rc::new(selector.get_dropdown_aggregates(ctx));
        selector
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            AggregateSelectorMsg::SetAggregate(aggregate) => {
                self.set_aggregate(ctx, aggregate);
                false
            },
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        self.aggregates = Rc::new(self.get_dropdown_aggregates(ctx));
        true
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let callback = ctx.link().callback(AggregateSelectorMsg::SetAggregate);
        let selected_agg = ctx
            .props()
            .aggregate
            .clone()
            .or_else(|| {
                ctx.props()
                    .metadata
                    .get_column_table_type(&ctx.props().column)
                    .and_then(|x| {
                        ctx.props().metadata.get_features().and_then(|y| {
                            y.aggregates.get(&(x as u32)).and_then(|z| {
                                z.aggregates
                                    .first()
                                    .map(|q| Aggregate::SingleAggregate(q.name.clone()))
                            })
                        })
                    })
            })
            .unwrap_or_else(|| Aggregate::SingleAggregate("".to_string()));

        let values = self.aggregates.clone();
        let label = ctx.props().aggregate.as_ref().map(|x| match x {
            Aggregate::SingleAggregate(_) => "".to_string(),
            Aggregate::MultiAggregate(x, _) => x.to_string(),
        });

        html! {
            <>
                <LocalStyle href={css!("aggregate-selector")} />
                <div class="aggregate-selector-wrapper">
                    <Select<Aggregate>
                        wrapper_class="aggregate-selector"
                        {values}
                        label={label.map(|x| x.into())}
                        selected={selected_agg}
                        on_select={callback}
                    />
                </div>
            </>
        }
    }
}

impl AggregateSelector {
    pub fn set_aggregate(&mut self, ctx: &Context<Self>, aggregate: Aggregate) {
        self.aggregate = Some(aggregate.clone());
        let mut aggregates = ctx.props().view_config.aggregates.clone();
        aggregates.insert(ctx.props().column.clone(), aggregate);
        let config = ViewConfigUpdate {
            aggregates: Some(aggregates),
            ..ViewConfigUpdate::default()
        };

        let session = ctx.props().session.clone();
        let renderer = ctx.props().renderer.clone();
        if session.update_view_config(config).is_ok() {
            ApiFuture::spawn(async move {
                renderer.apply_pending_plugin()?;
                renderer.draw(session.validate().await?.create_view()).await
            });
        }
    }

    pub fn get_dropdown_aggregates(&self, ctx: &Context<Self>) -> Vec<SelectItem<Aggregate>> {
        let aggregates = ctx
            .props()
            .metadata
            .get_column_aggregates(&ctx.props().column)
            .map(|x| x.collect::<Vec<_>>())
            .unwrap_or_default();

        let multi_aggregates2 = aggregates
            .clone()
            .into_iter()
            .flat_map(|x| match x {
                Aggregate::MultiAggregate(x, _) => Some(x),
                _ => None,
            })
            .collect::<HashSet<_>>()
            .into_iter()
            .map(|x| {
                SelectItem::OptGroup(
                    x.clone().into(),
                    aggregates
                        .iter()
                        .filter(|y| {
                            matches!(
                                y,
                                Aggregate::MultiAggregate(z, _) if &x == z
                            )
                        })
                        .cloned()
                        .collect(),
                )
            })
            .collect::<Vec<_>>();

        let s = aggregates
            .iter()
            .filter(|x| matches!(x, Aggregate::SingleAggregate(_)))
            .cloned()
            .map(SelectItem::Option)
            .chain(multi_aggregates2);

        s.collect::<Vec<_>>()
    }
}

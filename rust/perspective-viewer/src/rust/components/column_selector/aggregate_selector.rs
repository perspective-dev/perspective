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

use yew::prelude::*;

use crate::components::containers::select::*;
use crate::components::style::LocalStyle;
use crate::config::*;
use crate::model::*;
use crate::renderer::*;
use crate::session::*;
use crate::*;

#[derive(Properties)]
pub struct AggregateSelectorProps {
    pub column: String,
    pub aggregate: Option<Aggregate>,
    pub renderer: Renderer,
    pub session: Session,
}

derive_model!(Renderer, Session for AggregateSelectorProps);

impl PartialEq for AggregateSelectorProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.column == rhs.column && self.aggregate == rhs.aggregate
    }
}

pub enum AggregateSelectorMsg {
    SetAggregate(Aggregate),
}

pub struct AggregateSelector {
    aggregates: Vec<SelectItem<Aggregate>>,
    aggregate: Option<Aggregate>,
}

impl Component for AggregateSelector {
    type Message = AggregateSelectorMsg;
    type Properties = AggregateSelectorProps;

    fn create(ctx: &Context<Self>) -> Self {
        let mut selector = Self {
            aggregates: vec![],
            aggregate: ctx.props().aggregate.clone(),
        };

        selector.aggregates = selector.get_dropdown_aggregates(ctx);
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
        self.aggregates = self.get_dropdown_aggregates(ctx);
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
                    .session
                    .metadata()
                    .get_column_table_type(&ctx.props().column)
                    .map(|x| x.default_aggregate())
            })
            .unwrap();

        let values = self.aggregates.clone();

        html! {
            <>
                <LocalStyle href={css!("aggregate-selector")} />
                <div class="aggregate-selector-wrapper">
                    <Select<Aggregate>
                        wrapper_class="aggregate-selector"
                        {values}
                        label="weighted mean"
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
        let mut aggregates = ctx.props().session.get_view_config().aggregates.clone();
        aggregates.insert(ctx.props().column.clone(), aggregate);
        let config = ViewConfigUpdate {
            aggregates: Some(aggregates),
            ..ViewConfigUpdate::default()
        };

        ApiFuture::spawn(ctx.props().update_and_render(config));
    }

    pub fn get_dropdown_aggregates(&self, ctx: &Context<Self>) -> Vec<SelectItem<Aggregate>> {
        let aggregates = ctx
            .props()
            .session
            .metadata()
            .get_column_aggregates(&ctx.props().column)
            .expect("Bad Aggs")
            .collect::<Vec<_>>();

        let multi_aggregates = aggregates
            .iter()
            .filter(|x| matches!(x, Aggregate::MultiAggregate(_, _)))
            .cloned()
            .collect::<Vec<_>>();

        let multi_aggregates2 = if !multi_aggregates.is_empty() {
            vec![SelectItem::OptGroup(
                "weighted mean".into(),
                multi_aggregates,
            )]
        } else {
            vec![]
        };

        let s = aggregates
            .iter()
            .filter(|x| matches!(x, Aggregate::SingleAggregate(_)))
            .cloned()
            .map(SelectItem::Option)
            .chain(multi_aggregates2);

        s.collect::<Vec<_>>()
    }
}

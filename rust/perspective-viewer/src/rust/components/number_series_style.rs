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

use web_sys::{HtmlInputElement, InputEvent};
use yew::prelude::*;

use super::modal::{ModalLink, SetModalLink};
use super::style::LocalStyle;
use crate::components::form::select_enum_field::SelectEnumField;
use crate::config::*;
use crate::css;
use crate::utils::WeakScope;

#[derive(Properties)]
pub struct NumberSeriesStyleProps {
    pub config: Option<NumberSeriesStyleConfig>,
    pub default_config: NumberSeriesStyleDefaultConfig,

    #[prop_or_default]
    pub on_change: Callback<ColumnConfigFieldUpdate>,

    #[prop_or_default]
    pub keys: Vec<String>,

    #[prop_or_default]
    weak_link: WeakScope<NumberSeriesStyle>,
}

impl ModalLink<NumberSeriesStyle> for NumberSeriesStyleProps {
    fn weak_link(&self) -> &'_ WeakScope<NumberSeriesStyle> {
        &self.weak_link
    }
}

impl PartialEq for NumberSeriesStyleProps {
    fn eq(&self, other: &Self) -> bool {
        self.config == other.config && self.default_config == other.default_config
    }
}

pub enum NumberSeriesStyleMsg {
    ChartTypeChanged(Option<ChartType>),
    StackChanged(Option<bool>),
}

/// Form control for the per-column `chart_type` + `stack` picker. Rendered
/// inside the column-settings sidebar when the active plugin returns a
/// `ControlSpec::NumberSeriesStyle` from its `column_config_schema` hook.
pub struct NumberSeriesStyle {
    config: NumberSeriesStyleConfig,
}

impl Component for NumberSeriesStyle {
    type Message = NumberSeriesStyleMsg;
    type Properties = NumberSeriesStyleProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        Self {
            config: ctx.props().config.clone().unwrap_or_default(),
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        let new_config = ctx.props().config.clone().unwrap_or_default();
        if self.config != new_config {
            self.config = new_config;
            true
        } else {
            false
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            NumberSeriesStyleMsg::ChartTypeChanged(val) => {
                self.config.chart_type = val.unwrap_or_default();
                // Hiding the stack checkbox on Line/Scatter also clears any
                // lingering override so the JSON stays empty by default.
                if !self.config.chart_type.supports_stack() {
                    self.config.stack = None;
                }
                self.dispatch_config(ctx);
                true
            },
            NumberSeriesStyleMsg::StackChanged(val) => {
                self.config.stack = val;
                self.dispatch_config(ctx);
                true
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let chart_type_changed = ctx.link().callback(NumberSeriesStyleMsg::ChartTypeChanged);

        let stack_controls = if self.config.chart_type.supports_stack() {
            // Default: bar/area stack. `None` == inherit the default.
            let checked = self.config.stack.unwrap_or(true);
            let oninput = ctx.link().callback(move |e: InputEvent| {
                let input: HtmlInputElement = e.target_unchecked_into();
                let next = input.checked();
                // Persist explicit `false` overrides; the "stacked" default
                // round-trips as `None` to keep JSON empty.
                NumberSeriesStyleMsg::StackChanged(if next { None } else { Some(false) })
            });
            html! {
                <div class="row">
                    <label id="stack-label" />
                    <input type="checkbox" id="stack-checkbox" {checked} {oninput} />
                </div>
            }
        } else {
            html! {}
        };

        html! {
            <>
                <LocalStyle href={css!("column-style")} />
                <div id="column-style-container" class="number-series-style-container">
                    <SelectEnumField<ChartType>
                        label="chart-type"
                        on_change={chart_type_changed}
                        current_value={self.config.chart_type}
                    />
                    { stack_controls }
                </div>
            </>
        }
    }
}

impl NumberSeriesStyle {
    /// Dispatch the current config as an update. The default (Bar + no
    /// stack override) round-trips as an empty JSON object via
    /// `skip_serializing_if`, which means a field-level reset for this
    /// schema field.
    fn dispatch_config(&self, ctx: &Context<Self>) {
        let value = if self.config == NumberSeriesStyleConfig::default() {
            serde_json::Map::new()
        } else {
            match serde_json::to_value(&self.config) {
                Ok(serde_json::Value::Object(m)) => m,
                _ => serde_json::Map::new(),
            }
        };
        ctx.props().on_change.emit(ColumnConfigFieldUpdate {
            keys: ctx.props().keys.clone(),
            value,
        });
    }
}

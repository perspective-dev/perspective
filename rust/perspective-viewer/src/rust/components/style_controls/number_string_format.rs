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

mod digits_section;
mod misc_section;
mod style_section;
mod types;

use perspective_client::config::ColumnType;
pub use types::*;
use yew::{Callback, Component, Properties, html};

use crate::components::style::LocalStyle;
use crate::config::*;
use crate::css;

#[derive(Properties, PartialEq, Clone)]
pub struct CustomNumberFormatProps {
    pub restored_config: CustomNumberFormatConfig,
    pub on_change: Callback<ColumnConfigFieldUpdate>,
    pub view_type: ColumnType,
    pub column_name: String,
    #[prop_or_default]
    pub keys: Vec<String>,
}

pub enum CustomNumberFormatMsg {
    StyleChanged(Option<NumberStyle>),
    NotationChanged(Option<NotationName>),
    CurrencyCode(Option<CurrencyCode>),
    CurrencyDisplay(Option<CurrencyDisplay>),
    CompactDisplay(Option<CompactDisplay>),
    CurrencySign(Option<CurrencySign>),
    UseGrouping(Option<UseGrouping>),
    SignDisplay(Option<SignDisplay>),
    Unit(Option<Unit>),
    UnitDisplay(Option<UnitDisplay>),
    MinimumIntegerDigits(Option<f64>),
    SigChange(Option<(f64, f64)>),
    FracChange(Option<(f64, f64)>),
    RoundingIncrement(RoundingIncrement),
    TrailingZero(Option<TrailingZeroDisplay>),
    RoundingMode(Option<RoundingMode>),
    RoundingPriority(Option<RoundingPriority>),
}

#[derive(Default)]
pub struct CustomNumberFormat {
    config: CustomNumberFormatConfig,
    style: NumberStyle,
    notation: Option<NotationName>,
}

impl Component for CustomNumberFormat {
    type Message = CustomNumberFormatMsg;
    type Properties = CustomNumberFormatProps;

    fn create(ctx: &yew::prelude::Context<Self>) -> Self {
        Self::initialize(ctx)
    }

    fn changed(
        &mut self,
        ctx: &yew::prelude::Context<Self>,
        _old_props: &Self::Properties,
    ) -> bool {
        *self = Self::initialize(ctx);
        true
    }

    fn update(&mut self, ctx: &yew::prelude::Context<Self>, msg: Self::Message) -> bool {
        match msg {
            CustomNumberFormatMsg::StyleChanged(style) => {
                let style = style.unwrap_or_default();
                let new_style = match style {
                    NumberStyle::Decimal => NumberFormatStyle::Decimal,
                    NumberStyle::Percent => NumberFormatStyle::Percent,
                    NumberStyle::Currency => {
                        NumberFormatStyle::Currency(CurrencyNumberFormatStyle::default())
                    },
                    NumberStyle::Unit => NumberFormatStyle::Unit(UnitNumberFormatStyle {
                        unit: Unit::default(),
                        unit_display: None,
                    }),
                };
                self.config._style = Some(new_style);
                self.style = style;
            },
            CustomNumberFormatMsg::NotationChanged(notation) => {
                self.notation = notation;
                let new_notation = notation.map(|notation| match notation {
                    NotationName::Standard => Notation::Standard,
                    NotationName::Scientific => Notation::Scientific,
                    NotationName::Engineering => Notation::Engineering,
                    NotationName::Compact => Notation::Compact(CompactDisplay::default()),
                });
                self.config._notation = new_notation;
            },
            CustomNumberFormatMsg::CurrencyCode(val) => {
                if let Some(NumberFormatStyle::Currency(currency)) = &mut self.config._style {
                    currency.currency = val.unwrap_or_default();
                }
            },
            CustomNumberFormatMsg::CurrencyDisplay(val) => {
                if let Some(NumberFormatStyle::Currency(currency)) = &mut self.config._style {
                    currency.currency_display = val;
                }
            },
            CustomNumberFormatMsg::CurrencySign(val) => {
                if let Some(NumberFormatStyle::Currency(currency)) = &mut self.config._style {
                    currency.currency_sign = val;
                }
            },
            CustomNumberFormatMsg::CompactDisplay(val) => {
                if let Some(Notation::Compact(old)) = &mut self.config._notation {
                    if let Some(val) = val {
                        *old = val;
                    }
                } else {
                    tracing::error!("Unreachable change in compact display!");
                }
            },
            CustomNumberFormatMsg::UseGrouping(val) => {
                self.config.use_grouping = val;
            },
            CustomNumberFormatMsg::SignDisplay(val) => {
                self.config.sign_display = val;
            },
            CustomNumberFormatMsg::Unit(val) => {
                if let Some(NumberFormatStyle::Unit(style)) = &mut self.config._style {
                    style.unit = val.unwrap_or_default();
                }
            },
            CustomNumberFormatMsg::UnitDisplay(val) => {
                if let Some(NumberFormatStyle::Unit(style)) = &mut self.config._style {
                    style.unit_display = val;
                }
            },
            CustomNumberFormatMsg::MinimumIntegerDigits(val) => {
                self.config.minimum_integer_digits = val;
            },
            CustomNumberFormatMsg::FracChange(val) => {
                self.config.rounding_increment = None;
                self.config.maximum_fraction_digits = val.map(|(_, val)| {
                    let min = self.config.minimum_fraction_digits.unwrap_or(2.);
                    val.max(min)
                });

                self.config.minimum_fraction_digits = val.map(|(val, _)| {
                    let max = self.config.maximum_fraction_digits.unwrap_or(2.);
                    val.min(max)
                });
            },
            CustomNumberFormatMsg::SigChange(val) => {
                self.config.maximum_significant_digits = val.map(|(_, val)| {
                    let min = self.config.minimum_significant_digits.unwrap_or(1.);
                    val.max(min)
                });

                self.config.minimum_significant_digits = val.map(|(val, _)| {
                    let max = self.config.maximum_significant_digits.unwrap_or(21.);
                    val.min(max)
                });
            },
            CustomNumberFormatMsg::RoundingIncrement(val) => {
                if let RoundingIncrement::Custom(val) = val {
                    self.config.rounding_priority = None;
                    self.config.rounding_increment = Some(val);
                    self.config.maximum_fraction_digits = Some(0.);
                    self.config.minimum_fraction_digits = Some(0.);
                } else {
                    self.config.rounding_increment = None;
                }
            },
            CustomNumberFormatMsg::TrailingZero(val) => {
                self.config.trailing_zero_display = val;
            },
            CustomNumberFormatMsg::RoundingMode(val) => {
                self.config.rounding_mode = val;
            },
            CustomNumberFormatMsg::RoundingPriority(val) => {
                self.config.rounding_increment = None;
                self.config.rounding_priority = val;
            },
        };

        let is_float = ctx.props().view_type == ColumnType::Float;
        let filtered_config = self.config.clone().filter_default(is_float);
        let mut value = serde_json::Map::new();
        if filtered_config != CustomNumberFormatConfig::default() {
            value.insert(
                "number_format".to_owned(),
                serde_json::to_value(&filtered_config).unwrap_or(serde_json::Value::Null),
            );
        }
        ctx.props().on_change.emit(ColumnConfigFieldUpdate {
            keys: ctx.props().keys.clone(),
            value,
        });
        true
    }

    fn view(&self, ctx: &yew::prelude::Context<Self>) -> yew::prelude::Html {
        html! {
            <>
                <LocalStyle href={css!("column-style")} />
                { self.style_section(ctx) }
                { self.digits_section(ctx) }
                { self.misc_section(ctx) }
            </>
        }
    }
}

impl CustomNumberFormat {
    fn initialize(ctx: &yew::prelude::Context<Self>) -> Self {
        let config = ctx.props().restored_config.clone();
        Self {
            style: config
                ._style
                .as_ref()
                .map(|style| match style {
                    NumberFormatStyle::Decimal => NumberStyle::Decimal,
                    NumberFormatStyle::Currency(_) => NumberStyle::Currency,
                    NumberFormatStyle::Percent => NumberStyle::Percent,
                    NumberFormatStyle::Unit(_) => NumberStyle::Unit,
                })
                .unwrap_or_default(),
            config,
            notation: None,
        }
    }
}

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

use perspective_client::ColumnType;
pub use types::*;
use yew::{html, Callback, Component, Properties};

use crate::components::style::LocalStyle;
use crate::config::*;
use crate::{css, max, min};

#[derive(Properties, PartialEq, Clone)]
pub struct CustomNumberFormatProps {
    pub restored_config: CustomNumberFormatConfig,
    pub on_change: Callback<ColumnConfigValueUpdate>,
    pub view_type: ColumnType,
    // just for rerendering
    pub column_name: String,
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
    // show_frac: bool,
    // show_sig: bool,
    // disable_rounding_increment: bool,
    // disable_rounding_priority: bool,
}

impl CustomNumberFormat {
    fn initialize(ctx: &yew::prelude::Context<Self>) -> Self {
        let config = ctx.props().restored_config.clone();
        // let show_frac = config
        //     .minimum_fraction_digits
        //     .or(config.maximum_fraction_digits)
        //     .or(config.rounding_increment)
        //     .is_some();
        // let show_sig = config
        //     .minimum_significant_digits
        //     .or(config.maximum_significant_digits)
        //     .is_some();
        // let disable_rounding_increment = show_sig
        //     || show_frac
        //     || !matches!(
        //         config.rounding_priority,
        //         Some(RoundingPriority::Auto) | None
        //     );
        // let disable_rounding_priority = !(show_frac && show_sig);
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
            // show_frac,
            // show_sig,
            // disable_rounding_increment,
            // disable_rounding_priority,
            notation: None,
        }
    }
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
                    max!(val, min)
                });

                self.config.minimum_fraction_digits = val.map(|(val, _)| {
                    let max = self.config.maximum_fraction_digits.unwrap_or(2.);
                    min!(val, max)
                });
            },
            CustomNumberFormatMsg::SigChange(val) => {
                self.config.maximum_significant_digits = val.map(|(_, val)| {
                    let min = self.config.minimum_significant_digits.unwrap_or(1.);
                    max!(val, min)
                });

                self.config.minimum_significant_digits = val.map(|(val, _)| {
                    let max = self.config.maximum_significant_digits.unwrap_or(21.);
                    min!(val, max)
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
        let value =
            (filtered_config != CustomNumberFormatConfig::default()).then_some(filtered_config);

        let update = ColumnConfigValueUpdate::CustomNumberStringFormat(value);
        ctx.props().on_change.emit(update);
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

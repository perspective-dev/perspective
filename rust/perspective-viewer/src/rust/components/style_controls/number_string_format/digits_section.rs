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

use itertools::Itertools;
use perspective_client::ColumnType;
use yew::html;

use super::CustomNumberFormat;
use crate::components::containers::select::{Select, SelectItem};
use crate::components::form::number_field::NumberField;
use crate::components::form::number_range_field::NumberRangeField;
use crate::components::form::optional_field::OptionalField;
use crate::components::form::select_field::SelectEnumField;
use crate::components::style_controls::CustomNumberFormatMsg;
use crate::config::{
    RoundingIncrement, RoundingMode, RoundingPriority, TrailingZeroDisplay, ROUNDING_INCREMENTS,
};

impl CustomNumberFormat {
    pub fn digits_section(&self, ctx: &yew::prelude::Context<Self>) -> yew::prelude::Html {
        let is_float = matches!(ctx.props().view_type, ColumnType::Float);
        html! {
            <>
                <NumberField
                    label="minimum-integer-digits"
                    min=1.
                    max=21.
                    step=1.
                    default=1.
                    current_value={self.config.minimum_integer_digits}
                    on_change={ctx.link().callback(CustomNumberFormatMsg::MinimumIntegerDigits)}
                />
                if is_float { { self.float_section(ctx) } } else { { self.rounding_increment(ctx) } }
            </>
        }
    }

    fn rounding_increment(&self, ctx: &yew::prelude::Context<Self>) -> yew::prelude::Html {
        // let disabled = self.disable_rounding_increment;
        let values = ROUNDING_INCREMENTS
            .iter()
            .map(|val| RoundingIncrement::Custom(*val))
            .map(SelectItem::Option)
            .collect_vec();
        let values = [vec![SelectItem::Option(RoundingIncrement::Auto)], values].concat();
        let on_check = ctx
            .link()
            .callback(|_| CustomNumberFormatMsg::RoundingIncrement(RoundingIncrement::default()));
        let selected = self
            .config
            .rounding_increment
            .map(RoundingIncrement::Custom)
            .unwrap_or_default();
        html! {
            <div class="row">
                <OptionalField
                    label="rounding-increment"
                    {on_check}
                    // {disabled}
                    checked={self.config.rounding_increment.is_some()}
                >
                    <Select<RoundingIncrement>
                        {values}
                        {selected}
                        on_select={ctx.link().callback(CustomNumberFormatMsg::RoundingIncrement)}
                    />
                </OptionalField>
            </div>
        }
    }

    fn float_section(&self, ctx: &yew::prelude::Context<Self>) -> yew::prelude::Html {
        let fractional_value = Some((
            self.config.minimum_fraction_digits.unwrap_or(2.),
            self.config.maximum_fraction_digits.unwrap_or(2.),
        ));

        let significant_value = Some((
            self.config.minimum_significant_digits.unwrap_or(1.),
            self.config.maximum_significant_digits.unwrap_or(21.),
        ));

        html! {
            <>
                <div class="row">
                    <NumberRangeField
                        label="fractional-digits"
                        min=0.
                        max=20.
                        step=1.
                        default={(2., 2.)}
                        current_value={fractional_value}
                        on_change={ctx.link().callback(CustomNumberFormatMsg::FracChange)}
                    />
                </div>
                <div class="row">
                    <NumberRangeField
                        label="significant-digits"
                        min=1.
                        max=21.
                        step=1.
                        default={(1., 21.)}
                        current_value={significant_value}
                        on_change={ctx.link().callback(CustomNumberFormatMsg::SigChange)}
                    />
                </div>
                { self.rounding_increment(ctx) }
                <SelectEnumField<RoundingPriority>
                    label="rounding-priority"
                    current_value={self.config.rounding_priority}
                    on_change={ctx.link().callback(CustomNumberFormatMsg::RoundingPriority)}
                />
                <SelectEnumField<RoundingMode>
                    label="rounding-mode"
                    current_value={self.config.rounding_mode}
                    on_change={ctx.link().callback(CustomNumberFormatMsg::RoundingMode)}
                />
                <SelectEnumField<TrailingZeroDisplay>
                    label="trailing-zero-display"
                    current_value={self.config.trailing_zero_display}
                    on_change={ctx.link().callback(CustomNumberFormatMsg::TrailingZero)}
                />
            </>
        }
    }
}

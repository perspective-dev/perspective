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

use yew::html;

use super::CustomNumberFormat;
use crate::components::form::select_enum_field::SelectEnumField;
use crate::components::style_controls::{CustomNumberFormatMsg, NumberStyle};
use crate::config::*;

impl CustomNumberFormat {
    pub fn style_section(&self, ctx: &yew::prelude::Context<Self>) -> yew::prelude::Html {
        let section = match &self.config._style {
            Some(NumberFormatStyle::Currency(style)) => Some(html! {
                <>
                    <SelectEnumField<CurrencyCode>
                        label="currency"
                        on_change={ctx.link().callback(CustomNumberFormatMsg::CurrencyCode)}
                        current_value={style.currency}
                    />
                    <SelectEnumField<CurrencyDisplay>
                        label="currency-display"
                        on_change={ctx.link().callback(CustomNumberFormatMsg::CurrencyDisplay)}
                        current_value={style.currency_display.unwrap_or_default()}
                    />
                    <SelectEnumField<CurrencySign>
                        label="currency-sign"
                        on_change={ctx.link().callback(CustomNumberFormatMsg::CurrencySign)}
                        current_value={style.currency_sign.unwrap_or_default()}
                    />
                </>
            }),
            Some(NumberFormatStyle::Unit(style)) => Some(html!(
                <>
                    <SelectEnumField<Unit>
                        label="unit"
                        on_change={ctx.link().callback(CustomNumberFormatMsg::Unit)}
                        current_value={style.unit}
                    />
                    <SelectEnumField<UnitDisplay>
                        label="unit-display"
                        on_change={ctx.link().callback(CustomNumberFormatMsg::UnitDisplay)}
                        current_value={style.unit_display.unwrap_or_default()}
                    />
                </>
            )),
            _ => None,
        };
        html! {
            <>
                <SelectEnumField<NumberStyle>
                    label="style"
                    current_value={self.style}
                    default_value={NumberStyle::from(&ctx.props().defaults.style)}
                    on_change={ctx.link().callback(CustomNumberFormatMsg::StyleChanged)}
                />
                { section }
            </>
        }
    }
}

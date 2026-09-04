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
use crate::components::style_controls::{CustomNumberFormatMsg, NotationName};
use crate::config::*;

impl CustomNumberFormat {
    pub fn misc_section(&self, ctx: &yew::prelude::Context<Self>) -> yew::prelude::Html {
        let compact_display_checkbox = if let Some(Notation::Compact(val)) = self.config._notation {
            let cb = ctx.link().callback(CustomNumberFormatMsg::CompactDisplay);
            Some(html! {
                <SelectEnumField<CompactDisplay>
                    label="compact-display"
                    on_change={cb}
                    current_value={val}
                />
            })
        } else {
            None
        };

        let defaults = &ctx.props().defaults;
        html! {
            <>
                <SelectEnumField<NotationName>
                    label="notation"
                    on_change={ctx.link().callback(CustomNumberFormatMsg::NotationChanged)}
                    current_value={self.notation.unwrap_or_default()}
                    default_value={NotationName::from(&defaults.notation)}
                />
                { compact_display_checkbox }
                <SelectEnumField<UseGrouping>
                    label="use-grouping"
                    on_change={ctx.link().callback(CustomNumberFormatMsg::UseGrouping)}
                    current_value={self.config.use_grouping.unwrap_or(defaults.use_grouping)}
                    default_value={defaults.use_grouping}
                />
                <SelectEnumField<SignDisplay>
                    label="sign-display"
                    on_change={ctx.link().callback(CustomNumberFormatMsg::SignDisplay)}
                    current_value={self.config.sign_display.unwrap_or(defaults.sign_display)}
                    default_value={defaults.sign_display}
                />
            </>
        }
    }
}

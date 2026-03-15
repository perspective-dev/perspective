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

use crate::components::form::select_enum_field::SelectEnumField;
use crate::components::modal::{ModalLink, SetModalLink};
use crate::config::*;
use crate::utils::WeakScope;

#[derive(Properties)]
pub struct DatetimeStyleSimpleProps {
    pub enable_time_config: bool,
    pub config: SimpleDatetimeStyleConfig,

    #[prop_or_default]
    pub on_change: Callback<SimpleDatetimeStyleConfig>,

    #[prop_or_default]
    weak_link: WeakScope<DatetimeStyleSimple>,
}

impl ModalLink<DatetimeStyleSimple> for DatetimeStyleSimpleProps {
    fn weak_link(&self) -> &'_ WeakScope<DatetimeStyleSimple> {
        &self.weak_link
    }
}

impl PartialEq for DatetimeStyleSimpleProps {
    fn eq(&self, other: &Self) -> bool {
        self.enable_time_config == other.enable_time_config && self.config == other.config
    }
}

pub enum DatetimeStyleSimpleMsg {
    DateStyleChanged(Option<SimpleDatetimeFormat>),
    TimeStyleChanged(Option<SimpleDatetimeFormat>),
}

/// `DatetimeStyleSimple` represents the variation of the options parameter to
/// `Intl.DatetimeFormat()` which supports `timeStyle` and `dateStyle`. These
/// options are mutually exclusive with those of `DatetimeStyleCustom`, hence
/// the two-struct model for this options parameter.
pub struct DatetimeStyleSimple {
    config: SimpleDatetimeStyleConfig,
}

impl Component for DatetimeStyleSimple {
    type Message = DatetimeStyleSimpleMsg;
    type Properties = DatetimeStyleSimpleProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        Self {
            config: ctx.props().config.clone(),
        }
    }

    // TODO could be more conservative here with re-rendering
    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            DatetimeStyleSimpleMsg::DateStyleChanged(format) => {
                self.config.date_style = format.unwrap_or_default();
                self.dispatch_config(ctx);
                true
            },
            DatetimeStyleSimpleMsg::TimeStyleChanged(format) => {
                self.config.time_style = format.unwrap_or_default();
                self.dispatch_config(ctx);
                true
            },
        }
    }

    // Always re-render when config changes.
    fn changed(&mut self, ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        let mut new_config = ctx.props().config.clone();
        if self.config != new_config {
            std::mem::swap(&mut self.config, &mut new_config);
            true
        } else {
            false
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        html! {
            <>
                <SelectEnumField<SimpleDatetimeFormat>
                    label="date-style"
                    on_change={ctx.link().callback(DatetimeStyleSimpleMsg::DateStyleChanged)}
                    current_value={self.config.date_style}
                />
                if ctx.props().enable_time_config {
                    <SelectEnumField<SimpleDatetimeFormat>
                        label="time-style"
                        on_change={ctx.link().callback(DatetimeStyleSimpleMsg::TimeStyleChanged)}
                        current_value={self.config.time_style}
                        default_value={SimpleDatetimeFormat::Medium}
                    />
                }
            </>
        }
    }
}

impl DatetimeStyleSimple {
    /// When this config has changed, we must signal the wrapper element.
    fn dispatch_config(&self, ctx: &Context<Self>) {
        ctx.props().on_change.emit(self.config.clone());
    }
}

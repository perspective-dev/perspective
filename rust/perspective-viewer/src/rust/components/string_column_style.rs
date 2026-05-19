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

use super::modal::{ModalLink, SetModalLink};
use super::style::LocalStyle;
use crate::components::form::select_enum_field::SelectEnumField;
use crate::config::*;
use crate::css;
use crate::utils::WeakScope;

/// Format-only widget for [`String`] columns. Renders the `format` enum
/// only; color/color-mode UI is provided externally as primitive `Enum`
/// + `Color` schema fields.
#[derive(Properties)]
pub struct StringColumnStyleProps {
    pub config: Option<StringColumnStyleConfig>,

    #[prop_or_default]
    pub on_change: Callback<ColumnConfigFieldUpdate>,

    #[prop_or_default]
    pub keys: Vec<String>,

    #[prop_or_default]
    weak_link: WeakScope<StringColumnStyle>,
}

impl ModalLink<StringColumnStyle> for StringColumnStyleProps {
    fn weak_link(&self) -> &'_ WeakScope<StringColumnStyle> {
        &self.weak_link
    }
}

impl PartialEq for StringColumnStyleProps {
    fn eq(&self, other: &Self) -> bool {
        self.config == other.config
    }
}

pub enum StringColumnStyleMsg {
    FormatChanged(Option<FormatMode>),
}

pub struct StringColumnStyle {
    config: StringColumnStyleConfig,
}

impl Component for StringColumnStyle {
    type Message = StringColumnStyleMsg;
    type Properties = StringColumnStyleProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        Self {
            config: ctx.props().config.clone().unwrap_or_default(),
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        let mut new_config = ctx.props().config.clone().unwrap_or_default();
        if self.config != new_config {
            std::mem::swap(&mut self.config, &mut new_config);
            true
        } else {
            false
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            StringColumnStyleMsg::FormatChanged(val) => {
                self.config.format = val.unwrap_or_default();
                self.dispatch_config(ctx);
                true
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let format_mode_changed = ctx.link().callback(StringColumnStyleMsg::FormatChanged);
        html! {
            <>
                <LocalStyle href={css!("column-style")} />
                <div id="column-style-container" class="string-column-style-container">
                    <SelectEnumField<FormatMode>
                        label="format"
                        on_change={format_mode_changed}
                        current_value={self.config.format}
                    />
                </div>
            </>
        }
    }
}

impl StringColumnStyle {
    /// When this config has changed, we must signal the wrapper element.
    fn dispatch_config(&self, ctx: &Context<Self>) {
        let value = if self.config == StringColumnStyleConfig::default() {
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

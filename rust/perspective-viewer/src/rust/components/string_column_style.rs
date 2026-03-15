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
use yew::*;

use super::form::color_selector::*;
use super::modal::{ModalLink, SetModalLink};
use super::style::LocalStyle;
use crate::components::form::select_enum_field::SelectEnumField;
use crate::config::*;
use crate::css;
use crate::utils::WeakScope;

#[derive(Properties)]
pub struct StringColumnStyleProps {
    pub config: Option<StringColumnStyleConfig>,
    pub default_config: StringColumnStyleDefaultConfig,

    #[prop_or_default]
    pub on_change: Callback<ColumnConfigValueUpdate>,

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
        self.config == other.config && self.default_config == other.default_config
    }
}

pub enum StringColumnStyleMsg {
    Reset(StringColumnStyleConfig),
    FormatChanged(Option<FormatMode>),
    ColorModeChanged(Option<StringColorMode>),
    ColorChanged(String),
    ColorReset,
}

/// A component for the style form control for [`String`] columns.
pub struct StringColumnStyle {
    config: StringColumnStyleConfig,
    default_config: StringColumnStyleDefaultConfig,
}

impl Component for StringColumnStyle {
    type Message = StringColumnStyleMsg;
    type Properties = StringColumnStyleProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        Self {
            config: ctx.props().config.clone().unwrap_or_default(),
            default_config: ctx.props().default_config.clone(),
        }
    }

    // Always re-render when config changes.
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
            StringColumnStyleMsg::Reset(config) => {
                self.config = config;
                true
            },
            StringColumnStyleMsg::FormatChanged(val) => {
                self.config.format = val.unwrap_or_default();
                self.dispatch_config(ctx);
                true
            },
            StringColumnStyleMsg::ColorModeChanged(mode) => {
                self.config.string_color_mode = mode.unwrap_or_default();
                self.dispatch_config(ctx);
                true
            },
            StringColumnStyleMsg::ColorChanged(color) => {
                self.config.color = Some(color);
                self.dispatch_config(ctx);
                true
            },
            StringColumnStyleMsg::ColorReset => {
                self.config.color = Some(self.default_config.color.clone());
                self.dispatch_config(ctx);
                true
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let format_mode_selected = self.config.format;
        let format_mode_changed = ctx.link().callback(StringColumnStyleMsg::FormatChanged);
        let selected_color_mode = self.config.string_color_mode;
        let color_mode_changed = ctx.link().callback(StringColumnStyleMsg::ColorModeChanged);
        let color_controls = match selected_color_mode {
            StringColorMode::Foreground => {
                self.color_select_row(ctx, &StringColorMode::Foreground, "foreground-label")
            },
            StringColorMode::Background => {
                self.color_select_row(ctx, &StringColorMode::Background, "background-label")
            },
            StringColorMode::Series => {
                self.color_select_row(ctx, &StringColorMode::Series, "series-label")
            },
            StringColorMode::None => html! {},
        };

        html! {
            <>
                <LocalStyle href={css!("column-style")} />
                <div id="column-style-container" class="string-column-style-container">
                    <SelectEnumField<FormatMode>
                        label="format"
                        on_change={format_mode_changed}
                        current_value={format_mode_selected}
                    />
                    <SelectEnumField<StringColorMode>
                        label="color"
                        on_change={color_mode_changed}
                        current_value={selected_color_mode}
                    />
                    { color_controls }
                </div>
            </>
        }
    }
}

impl StringColumnStyle {
    /// When this config has changed, we must signal the wrapper element.
    fn dispatch_config(&self, ctx: &Context<Self>) {
        let update = Some(self.config.clone()).filter(|x| x != &StringColumnStyleConfig::default());
        ctx.props()
            .on_change
            .emit(ColumnConfigValueUpdate::DatagridStringStyle(update));
    }

    /// Generate a color selector component for a specific `StringColorMode`
    /// variant.
    fn color_select_row(&self, ctx: &Context<Self>, mode: &StringColorMode, title: &str) -> Html {
        let on_color = ctx.link().callback(StringColumnStyleMsg::ColorChanged);
        let color = self
            .config
            .color
            .clone()
            .unwrap_or_else(|| self.default_config.color.to_owned());

        let color_props = props!(ColorProps {
            title: title.to_owned(),
            on_color,
            is_modified: color != self.default_config.color,
            color,
            on_reset: ctx.link().callback(|_| StringColumnStyleMsg::ColorReset)
        });

        if &self.config.string_color_mode == mode {
            html! { <div class="row"><ColorSelector ..color_props /></div> }
        } else {
            html! {}
        }
    }
}

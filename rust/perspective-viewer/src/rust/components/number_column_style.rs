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

use super::form::color_range_selector::*;
use super::form::number_field::NumberFieldProps;
use super::modal::*;
use super::style::LocalStyle;
use crate::components::form::number_field::NumberField;
use crate::components::form::select_field::SelectEnumField;
use crate::config::*;
use crate::session::Session;
use crate::utils::WeakScope;
use crate::*;

#[derive(PartialEq, Eq, Copy, Clone, Debug)]
pub enum Side {
    Fg,
    Bg,
}

use Side::*;

#[derive(Debug)]
pub enum NumberColumnStyleMsg {
    Reset(
        Box<NumberColumnStyleConfig>,
        Box<NumberColumnStyleDefaultConfig>,
    ),
    ForeEnabledChanged(bool),
    BackEnabledChanged(bool),
    PosColorChanged(Side, String),
    NegColorChanged(Side, String),
    NumberForeModeChanged(NumberForegroundMode),
    NumberBackModeChanged(NumberBackgroundMode),
    GradientChanged(Side, Option<f64>),
    DefaultGradientChanged(f64),
}

/// A `ColumnStyle` component is mounted to the window anchored at the screen
/// position of `elem`.  It needs two input configs, the current configuration
/// object and a default version without `Option<>`
#[derive(Properties)]
pub struct NumberColumnStyleProps {
    #[cfg_attr(test, prop_or_default)]
    pub config: Option<NumberColumnStyleConfig>,

    #[cfg_attr(test, prop_or_default)]
    pub default_config: NumberColumnStyleDefaultConfig,

    #[prop_or_default]
    pub on_change: Callback<ColumnConfigValueUpdate>,

    #[prop_or_default]
    pub weak_link: WeakScope<NumberColumnStyle>,

    #[prop_or_default]
    pub session: Option<Session>,

    #[prop_or_default]
    pub column_name: Option<String>,
}

impl ModalLink<NumberColumnStyle> for NumberColumnStyleProps {
    fn weak_link(&self) -> &'_ WeakScope<NumberColumnStyle> {
        &self.weak_link
    }
}

impl PartialEq for NumberColumnStyleProps {
    fn eq(&self, _other: &Self) -> bool {
        false
    }
}

impl NumberColumnStyleProps {
    fn set_default_gradient(&self, ctx: &Context<NumberColumnStyle>) {
        if let Some(session) = self.session.clone() && let Some(column_name) = self.column_name.clone() {
            ctx.link().send_future(async move {
                let view = session.get_view().unwrap();
                let min_max = view.get_min_max(column_name).await.unwrap();
                let abs_max = max!(min_max.0.parse::<f64>().unwrap().abs(), min_max.1.parse::<f64>().unwrap().abs());
                let gradient = (abs_max * 100.).round() / 100.;
                NumberColumnStyleMsg::DefaultGradientChanged(gradient)
            });
        }
    }
}

/// The `ColumnStyle` component stores its UI state privately in its own struct,
/// rather than its props (which has two version of this data itself, the
/// JSON serializable config record and the defaults record).
pub struct NumberColumnStyle {
    config: NumberColumnStyleConfig,
    default_config: NumberColumnStyleDefaultConfig,
    fg_mode: NumberForegroundMode,
    bg_mode: NumberBackgroundMode,
    pos_fg_color: String,
    neg_fg_color: String,
    pos_bg_color: String,
    neg_bg_color: String,
    fg_gradient: Option<f64>,
    bg_gradient: Option<f64>,
}

impl Component for NumberColumnStyle {
    type Message = NumberColumnStyleMsg;
    type Properties = NumberColumnStyleProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        ctx.props().set_default_gradient(ctx);
        Self::reset(
            &ctx.props().config.clone().unwrap_or_default(),
            &ctx.props().default_config.clone(),
        )
    }

    fn changed(&mut self, ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        let mut new = Self::reset(
            &ctx.props().config.clone().unwrap_or_default(),
            &ctx.props().default_config.clone(),
        );
        ctx.props().set_default_gradient(ctx);
        std::mem::swap(self, &mut new);
        true
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            NumberColumnStyleMsg::Reset(config, default_config) => {
                let mut new = Self::reset(&config, &default_config);
                std::mem::swap(self, &mut new);
                true
            },
            NumberColumnStyleMsg::ForeEnabledChanged(val) => {
                if val {
                    let color_mode = match self.fg_mode {
                        NumberForegroundMode::Disabled => NumberForegroundMode::default(),
                        x => x,
                    };

                    self.config.number_fg_mode = color_mode;
                    self.config.pos_fg_color = Some(self.pos_fg_color.to_owned());
                    self.config.neg_fg_color = Some(self.neg_fg_color.to_owned());
                    if self.fg_mode.needs_gradient() {
                        self.config.fg_gradient = Some(self.fg_gradient.unwrap());
                    } else {
                        self.config.fg_gradient = None;
                    }
                } else {
                    self.config.number_fg_mode = NumberForegroundMode::Disabled;
                    self.config.pos_fg_color = None;
                    self.config.neg_fg_color = None;
                    self.config.fg_gradient = None;
                }

                self.dispatch_config(ctx);
                true
            },
            NumberColumnStyleMsg::BackEnabledChanged(val) => {
                if val {
                    let color_mode = match self.bg_mode {
                        NumberBackgroundMode::Disabled => NumberBackgroundMode::Color,
                        x => x,
                    };

                    self.config.number_bg_mode = color_mode;
                    self.config.pos_bg_color = Some(self.pos_bg_color.to_owned());
                    self.config.neg_bg_color = Some(self.neg_bg_color.to_owned());
                    if self.bg_mode.needs_gradient() {
                        self.config.bg_gradient = Some(self.bg_gradient.unwrap());
                    } else {
                        self.config.bg_gradient = None;
                    }
                } else {
                    self.config.number_bg_mode = NumberBackgroundMode::Disabled;
                    self.config.pos_bg_color = None;
                    self.config.neg_bg_color = None;
                    self.config.bg_gradient = None;
                }

                self.dispatch_config(ctx);
                true
            },
            NumberColumnStyleMsg::PosColorChanged(side, val) => {
                if side == Fg {
                    self.pos_fg_color = val;
                    self.config.pos_fg_color = Some(self.pos_fg_color.to_owned());
                } else {
                    self.pos_bg_color = val;
                    self.config.pos_bg_color = Some(self.pos_bg_color.to_owned());
                }

                self.dispatch_config(ctx);
                false
            },
            NumberColumnStyleMsg::NegColorChanged(side, val) => {
                if side == Fg {
                    self.neg_fg_color = val;
                    self.config.neg_fg_color = Some(self.neg_fg_color.to_owned());
                } else {
                    self.neg_bg_color = val;
                    self.config.neg_bg_color = Some(self.neg_bg_color.to_owned());
                }

                self.dispatch_config(ctx);
                false
            },
            NumberColumnStyleMsg::NumberForeModeChanged(val) => {
                self.fg_mode = val;
                self.config.number_fg_mode = val;
                if self.fg_mode.needs_gradient() {
                    self.config.fg_gradient = Some(self.fg_gradient.unwrap());
                } else {
                    self.config.fg_gradient = None;
                }

                self.dispatch_config(ctx);
                true
            },
            NumberColumnStyleMsg::NumberBackModeChanged(val) => {
                self.bg_mode = val;
                self.config.number_bg_mode = val;
                if self.bg_mode.needs_gradient() {
                    self.config.bg_gradient = Some(self.bg_gradient.unwrap());
                } else {
                    self.config.bg_gradient = None;
                }

                self.dispatch_config(ctx);
                true
            },
            NumberColumnStyleMsg::GradientChanged(side, gradient) => {
                match (side, gradient) {
                    (Fg, Some(x)) => {
                        self.fg_gradient = Some(x);
                        self.config.fg_gradient = Some(x);
                    },
                    (Fg, None) => {
                        self.fg_gradient = Some(self.default_config.fg_gradient);
                        self.config.fg_gradient = None;
                    },
                    (Bg, Some(x)) => {
                        self.bg_gradient = Some(x);
                        self.config.bg_gradient = Some(x);
                    },
                    (Bg, None) => {
                        self.bg_gradient = Some(self.default_config.bg_gradient);
                        self.config.bg_gradient = None;
                    },
                };

                self.dispatch_config(ctx);
                false
            },
            NumberColumnStyleMsg::DefaultGradientChanged(gradient) => {
                self.fg_gradient.get_or_insert(gradient);
                self.bg_gradient.get_or_insert(gradient);
                self.default_config.fg_gradient = gradient;
                self.default_config.bg_gradient = gradient;
                true
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let fg_mode_changed = ctx.link().callback(|x: Option<_>| {
            NumberColumnStyleMsg::NumberForeModeChanged(x.unwrap_or_default())
        });

        let bg_mode_changed = ctx.link().callback(|x: Option<_>| {
            NumberColumnStyleMsg::NumberBackModeChanged(x.unwrap_or_default())
        });

        let fg_controls = match self.fg_mode {
            NumberForegroundMode::Disabled => html! {},
            NumberForegroundMode::Color => html! {
                <div class="row">
                    <ColorRangeSelector ..self.color_props("fg-color", Fg, false, ctx) />
                </div>
            },
            NumberForegroundMode::Bar => html! {
                <>
                    <div class="row">
                        <ColorRangeSelector ..self.color_props("bar-color", Fg, false, ctx) />
                    </div>
                    <NumberField ..self.max_value_props(Fg, ctx) />
                </>
            },
        };

        let bg_controls = match self.bg_mode {
            NumberBackgroundMode::Disabled => html! {},
            NumberBackgroundMode::Color => html! {
                <div class="row">
                    <ColorRangeSelector ..self.color_props("bg-color", Bg,false, ctx) />
                </div>
            },
            NumberBackgroundMode::Gradient => html! {
                <>
                    <div class="row">
                        <ColorRangeSelector ..self.color_props("gradient-color", Bg, true, ctx) />
                    </div>
                    <NumberField ..self.max_value_props(Bg, ctx) />
                </>
            },
            NumberBackgroundMode::Pulse => html! {
                <div class="row">
                    <ColorRangeSelector ..self.color_props("pulse-color", Bg, true, ctx) />
                </div>
            },
        };

        html! {
            <>
                <LocalStyle href={css!("column-style")} />
                <div id="column-style-container" class="number-column-style-container">
                    <SelectEnumField<NumberForegroundMode>
                        label="foreground"
                        on_change={fg_mode_changed}
                        current_value={self.fg_mode}
                    />
                    { fg_controls }
                    <SelectEnumField<NumberBackgroundMode>
                        label="background"
                        on_change={bg_mode_changed}
                        current_value={self.bg_mode}
                    />
                    { bg_controls }
                </div>
            </>
        }
    }
}

impl NumberColumnStyle {
    /// When this config has changed, we must signal the wrapper element.
    fn dispatch_config(&self, ctx: &Context<Self>) {
        let mut config = self.config.clone();
        match &self.config {
            NumberColumnStyleConfig {
                pos_fg_color: Some(pos_color),
                neg_fg_color: Some(neg_color),
                ..
            } if *pos_color == self.default_config.pos_fg_color
                && *neg_color == self.default_config.neg_fg_color =>
            {
                config.pos_fg_color = None;
                config.neg_fg_color = None;
            },
            _ => {},
        };

        match &self.config {
            NumberColumnStyleConfig {
                pos_bg_color: Some(pos_color),
                neg_bg_color: Some(neg_color),
                ..
            } if *pos_color == self.default_config.pos_bg_color
                && *neg_color == self.default_config.neg_bg_color =>
            {
                config.pos_bg_color = None;
                config.neg_bg_color = None;
            },
            _ => {},
        };

        let update = Some(config).filter(|config| config != &NumberColumnStyleConfig::default());

        ctx.props()
            .on_change
            .emit(ColumnConfigValueUpdate::DatagridNumberStyle(update));
    }

    fn color_props(
        &self,
        id: &str,
        side: Side,
        is_gradient: bool,
        ctx: &Context<Self>,
    ) -> ColorRangeProps {
        let on_pos_color = ctx
            .link()
            .callback(move |x| NumberColumnStyleMsg::PosColorChanged(side, x));
        let on_neg_color = ctx
            .link()
            .callback(move |x| NumberColumnStyleMsg::NegColorChanged(side, x));

        props!(ColorRangeProps {
            id: id.to_string(),
            is_gradient,
            pos_color: if side == Fg {
                &self.pos_fg_color
            } else {
                &self.pos_bg_color
            }
            .to_owned(),
            neg_color: if side == Fg {
                &self.neg_fg_color
            } else {
                &self.neg_bg_color
            }
            .to_owned(),
            on_pos_color,
            on_neg_color
        })
    }

    fn max_value_props(&self, side: Side, ctx: &Context<Self>) -> NumberFieldProps {
        let on_change = ctx
            .link()
            .callback(move |x| NumberColumnStyleMsg::GradientChanged(side, x));

        let value = if side == Fg {
            self.fg_gradient.unwrap_or_default()
        } else {
            self.bg_gradient.unwrap_or_default()
        };

        props!(NumberFieldProps {
            default: value,
            current_value: value,
            label: "max-value",
            on_change
        })
    }

    fn reset(
        config: &NumberColumnStyleConfig,
        default_config: &NumberColumnStyleDefaultConfig,
    ) -> Self {
        let mut config = config.clone();
        let fg_gradient = config.fg_gradient;
        let bg_gradient = config.bg_gradient;

        let pos_fg_color = config
            .pos_fg_color
            .as_ref()
            .unwrap_or(&default_config.pos_fg_color)
            .to_owned();

        let neg_fg_color = config
            .neg_fg_color
            .as_ref()
            .unwrap_or(&default_config.neg_fg_color)
            .to_owned();

        let pos_bg_color = config
            .pos_bg_color
            .as_ref()
            .unwrap_or(&default_config.pos_bg_color)
            .to_owned();

        let neg_bg_color = config
            .neg_bg_color
            .as_ref()
            .unwrap_or(&default_config.neg_bg_color)
            .to_owned();

        config.pos_fg_color = Some(pos_fg_color.to_owned());
        config.neg_fg_color = Some(neg_fg_color.to_owned());
        let fg_mode = config.number_fg_mode;
        config.pos_bg_color = Some(pos_bg_color.to_owned());
        config.neg_bg_color = Some(neg_bg_color.to_owned());
        let bg_mode = config.number_bg_mode;
        Self {
            config,
            default_config: default_config.clone(),
            fg_mode,
            bg_mode,
            pos_fg_color,
            neg_fg_color,
            pos_bg_color,
            neg_bg_color,
            fg_gradient,
            bg_gradient,
        }
    }
}

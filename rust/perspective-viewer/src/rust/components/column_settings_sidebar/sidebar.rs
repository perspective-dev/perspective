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

use std::fmt::Display;
use std::rc::Rc;

use derivative::Derivative;
use itertools::Itertools;
use perspective_client::ColumnType;
use yew::{html, Callback, Component, Html, Properties};

use super::attributes_tab::AttributesTabProps;
use super::style_tab::StyleTabProps;
use crate::components::column_settings_sidebar::attributes_tab::AttributesTab;
use crate::components::column_settings_sidebar::save_settings::SaveSettingsProps;
use crate::components::column_settings_sidebar::style_tab::StyleTab;
use crate::components::containers::sidebar::Sidebar;
use crate::components::containers::tab_list::{Tab, TabList};
use crate::components::editable_header::EditableHeaderProps;
use crate::components::expression_editor::ExpressionEditorProps;
use crate::components::style::LocalStyle;
use crate::components::type_icon::TypeIconType;
use crate::components::viewer::ColumnLocator;
use crate::config::Expression;
use crate::custom_events::CustomEvents;
use crate::model::*;
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::Session;
use crate::utils::{AddListener, Subscription};
use crate::{css, derive_model};

#[derive(Debug, Default, Clone, Copy, PartialEq)]
pub enum ColumnSettingsTab {
    #[default]
    Attributes,
    Style,
}
impl Tab for ColumnSettingsTab {}
impl Display for ColumnSettingsTab {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_fmt(format_args!("{self:?}"))
    }
}

#[derive(Clone, Properties, Derivative)]
#[derivative(Debug)]
pub struct ColumnSettingsProps {
    #[derivative(Debug = "ignore")]
    pub session: Session,
    #[derivative(Debug = "ignore")]
    pub renderer: Renderer,
    #[derivative(Debug = "ignore")]
    pub presentation: Presentation,
    #[derivative(Debug = "ignore")]
    pub custom_events: CustomEvents,

    pub selected_column: ColumnLocator,
    pub on_close: Callback<()>,
    pub width_override: Option<i32>,
    pub is_active: bool,
}

derive_model!(CustomEvents, Session, Renderer, Presentation for ColumnSettingsProps);

impl PartialEq for ColumnSettingsProps {
    fn eq(&self, other: &Self) -> bool {
        self.selected_column == other.selected_column && self.is_active == other.is_active
    }
}

#[derive(Debug)]
pub enum ColumnSettingsMsg {
    SetExprValue(Rc<String>),
    SetExprValid(bool),
    SetHeaderValue(Option<String>),
    SetHeaderValid(bool),
    SetSelectedTab((usize, ColumnSettingsTab)),
    OnSaveAttributes(()),
    OnResetAttributes(()),
    OnDelete(()),
    SessionUpdated(()),
}

#[derive(Default, Derivative)]
#[derivative(Debug)]
pub struct ColumnSettingsSidebar {
    initial_expr_value: Rc<String>,
    expr_value: Rc<String>,
    expr_valid: bool,
    initial_header_value: Option<String>,
    header_value: Option<String>,
    header_valid: bool,
    selected_tab: ColumnSettingsTab,
    selected_tab_idx: usize,
    save_enabled: bool,
    save_count: u8,
    reset_enabled: bool,
    reset_count: u8,
    column_name: String,
    maybe_ty: Option<ColumnType>,
    tabs: Vec<ColumnSettingsTab>,
    #[derivative(Debug = "ignore")]
    session_sub: Option<Subscription>,
}

impl ColumnSettingsSidebar {
    fn save_enabled_effect(&mut self) {
        let changed = self.expr_value != self.initial_expr_value
            || self.header_value != self.initial_header_value;
        let valid = self.expr_valid && self.header_valid;
        self.save_enabled = changed && valid;
    }

    fn initialize(&mut self, ctx: &yew::prelude::Context<Self>) {
        let column_name = ctx
            .props()
            .selected_column
            .name_or_default(&ctx.props().session);
        let initial_expr_value = ctx
            .props()
            .session
            .metadata()
            .get_expression_by_alias(&column_name)
            .unwrap_or_default();
        let initial_expr_value = Rc::new(initial_expr_value);
        let initial_header_value =
            (*initial_expr_value != column_name).then_some(column_name.clone());
        let maybe_ty = ctx.props().selected_column.view_type(ctx.props().session());

        let tabs = {
            let mut tabs = vec![];
            let is_new_expr = ctx.props().selected_column.is_new_expr();
            let show_styles = !is_new_expr
                && ctx
                    .props()
                    .can_render_column_styles(&column_name)
                    .unwrap_or_default();

            if !is_new_expr && show_styles {
                tabs.push(ColumnSettingsTab::Style);
            }

            if ctx.props().selected_column.is_expr() {
                tabs.push(ColumnSettingsTab::Attributes);
            }
            tabs
        };

        *self = Self {
            column_name,
            expr_value: initial_expr_value.clone(),
            initial_expr_value,
            header_value: initial_header_value.clone(),
            initial_header_value,
            maybe_ty,
            tabs,
            header_valid: true,
            session_sub: self.session_sub.take(),
            ..*self
        }
    }
}

impl Component for ColumnSettingsSidebar {
    type Message = ColumnSettingsMsg;
    type Properties = ColumnSettingsProps;

    fn create(ctx: &yew::prelude::Context<Self>) -> Self {
        let session_cb = ctx
            .link()
            .callback(|_| ColumnSettingsMsg::SessionUpdated(()));
        let session_sub = ctx
            .props()
            .renderer
            .session_changed
            .add_listener(session_cb);

        let mut this = Self {
            session_sub: Some(session_sub),
            ..Default::default()
        };
        this.initialize(ctx);
        this
    }

    fn changed(&mut self, ctx: &yew::prelude::Context<Self>, old_props: &Self::Properties) -> bool {
        if ctx.props() != old_props {
            let selected_tab = self.selected_tab;
            self.initialize(ctx);
            self.selected_tab = selected_tab;
            self.selected_tab_idx = self
                .tabs
                .iter()
                .find_position(|tab| **tab == selected_tab)
                .map(|(idx, _val)| idx)
                .unwrap_or_default();
            true
        } else {
            false
        }
    }

    fn update(&mut self, ctx: &yew::prelude::Context<Self>, msg: Self::Message) -> bool {
        match msg {
            ColumnSettingsMsg::SetExprValue(val) => {
                if self.expr_value != val {
                    self.expr_value = val;
                    self.reset_enabled = true;
                    true
                } else {
                    false
                }
            },
            ColumnSettingsMsg::SetExprValid(val) => {
                self.expr_valid = val;
                self.save_enabled_effect();
                true
            },
            ColumnSettingsMsg::SetHeaderValue(val) => {
                if self.header_value != val {
                    self.header_value = val;
                    self.reset_enabled = true;
                    true
                } else {
                    false
                }
            },
            ColumnSettingsMsg::SetHeaderValid(val) => {
                self.header_valid = val;
                self.save_enabled_effect();
                true
            },
            ColumnSettingsMsg::SetSelectedTab((idx, val)) => {
                let rerender = self.selected_tab != val || self.selected_tab_idx != idx;
                self.selected_tab = val;
                self.selected_tab_idx = idx;
                rerender
            },
            ColumnSettingsMsg::OnResetAttributes(()) => {
                self.header_value = self.initial_header_value.clone();
                self.expr_value = self.initial_expr_value.clone();
                self.save_enabled = false;
                self.reset_enabled = false;
                self.reset_count += 1;
                true
            },
            ColumnSettingsMsg::OnSaveAttributes(()) => {
                let new_expr = Expression::new(
                    self.header_value.clone().map(|s| s.into()),
                    (*(self.expr_value)).clone().into(),
                );
                match &ctx.props().selected_column {
                    ColumnLocator::Table(_) => {
                        tracing::error!("Tried to save non-expression column!")
                    },
                    ColumnLocator::Expression(name) => {
                        ctx.props().update_expr(name.clone(), new_expr)
                    },
                    ColumnLocator::NewExpression => ctx.props().save_expr(new_expr),
                }

                self.initial_expr_value = self.expr_value.clone();
                self.initial_header_value = self.header_value.clone();
                self.save_enabled = false;
                self.reset_enabled = false;
                self.save_count += 1;
                true
            },
            ColumnSettingsMsg::OnDelete(()) => {
                if ctx.props().selected_column.is_saved_expr() {
                    ctx.props().delete_expr(&self.column_name);
                }
                ctx.props().on_close.emit(());
                true
            },
            ColumnSettingsMsg::SessionUpdated(()) => {
                self.initialize(ctx);
                true
            },
        }
    }

    fn view(&self, ctx: &yew::prelude::Context<Self>) -> Html {
        let header_props = EditableHeaderProps {
            icon_type: self
                .maybe_ty
                .map(|ty| ty.into())
                .or(Some(TypeIconType::Expr)),
            on_change: ctx.link().batch_callback(|(value, valid)| {
                vec![
                    ColumnSettingsMsg::SetHeaderValue(value),
                    ColumnSettingsMsg::SetHeaderValid(valid),
                ]
            }),
            editable: ctx.props().selected_column.is_expr()
                && matches!(self.selected_tab, ColumnSettingsTab::Attributes),
            initial_value: self.initial_header_value.clone(),
            placeholder: self.expr_value.clone(),
            session: ctx.props().session.clone(),
            reset_count: self.reset_count,
        };

        let expr_editor = ExpressionEditorProps {
            session: ctx.props().session.clone(),
            on_input: ctx.link().callback(ColumnSettingsMsg::SetExprValue),
            on_save: ctx.link().callback(ColumnSettingsMsg::OnSaveAttributes),
            on_validate: ctx.link().callback(ColumnSettingsMsg::SetExprValid),
            alias: ctx.props().selected_column.name().cloned(),
            disabled: !ctx.props().selected_column.is_expr(),
            reset_count: self.reset_count,
        };

        let save_section = SaveSettingsProps {
            save_enabled: self.save_enabled,
            reset_enabled: self.reset_enabled,
            is_save: ctx.props().selected_column.name().is_some(),
            on_reset: ctx.link().callback(ColumnSettingsMsg::OnResetAttributes),
            on_save: ctx.link().callback(ColumnSettingsMsg::OnSaveAttributes),
            on_delete: ctx.link().callback(ColumnSettingsMsg::OnDelete),
            show_danger_zone: ctx.props().selected_column.is_saved_expr(),
            disable_delete: ctx.props().is_active,
        };

        let attrs_tab = AttributesTabProps {
            expr_editor,
            save_section,
        };

        let style_tab = StyleTabProps {
            custom_events: ctx.props().custom_events.clone(),
            session: ctx.props().session.clone(),
            renderer: ctx.props().renderer.clone(),
            presentation: ctx.props().presentation.clone(),
            ty: self.maybe_ty,
            column_name: self.column_name.clone(),
        };

        let tab_children = self.tabs.iter().map(|tab| match tab {
            ColumnSettingsTab::Attributes => html! { <AttributesTab ..attrs_tab.clone() /> },
            ColumnSettingsTab::Style => html! { <StyleTab ..style_tab.clone() /> },
        });

        html! {
            <>
                <LocalStyle href={css!("column-settings-panel")} />
                <Sidebar
                    on_close={ctx.props().on_close.clone()}
                    id_prefix="column_settings"
                    width_override={ctx.props().width_override}
                    selected_tab={self.selected_tab_idx}
                    {header_props}
                >
                    <TabList<ColumnSettingsTab>
                        tabs={self.tabs.clone()}
                        on_tab_change={ctx.link().callback(ColumnSettingsMsg::SetSelectedTab)}
                        selected_tab={self.selected_tab_idx}
                    >
                        { for tab_children }
                    </TabList<ColumnSettingsTab>>
                </Sidebar>
            </>
        }
    }
}

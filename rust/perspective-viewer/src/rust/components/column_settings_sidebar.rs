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
mod attributes_tab;

mod save_settings;
mod style_tab;

use std::rc::Rc;

use derivative::Derivative;
use itertools::Itertools;
use perspective_client::config::{ColumnType, Expression, ViewConfig};
use perspective_client::utils::PerspectiveResultExt;
use yew::{Callback, Component, Html, Properties, html, props};

use self::attributes_tab::AttributesTabProps;
use self::style_tab::StyleTabProps;
use crate::components::column_settings_sidebar::attributes_tab::AttributesTab;
use crate::components::column_settings_sidebar::save_settings::SaveSettingsProps;
use crate::components::column_settings_sidebar::style_tab::StyleTab;
use crate::components::containers::sidebar::Sidebar;
use crate::components::containers::tab_list::TabList;
use crate::components::editable_header::EditableHeaderProps;
use crate::components::expression_editor::ExpressionEditorProps;
use crate::components::style::LocalStyle;
use crate::components::type_icon::TypeIconType;
use crate::custom_events::CustomEvents;
use crate::tasks::{
    can_render_column_styles, locator_name_or_default, locator_view_type, EditExpression,
    HasCustomEvents, HasPresentation, HasRenderer, HasSession,
};
use crate::presentation::{ColumnLocator, ColumnSettingsTab, Presentation};
use crate::renderer::Renderer;
use crate::session::{Session, SessionMetadata};
use crate::*;

#[derive(Clone, Derivative, Properties)]
#[derivative(Debug)]
pub struct ColumnSettingsPanelProps {
    pub selected_column: ColumnLocator,
    pub selected_tab: Option<ColumnSettingsTab>,
    pub on_close: Callback<()>,
    pub width_override: Option<i32>,
    pub on_select_tab: Callback<ColumnSettingsTab>,

    /// Active plugin name threaded as a value prop so that plugin changes
    /// trigger re-initialization via `changed()` rather than a PubSub
    /// `render_limits_changed` subscription.
    pub plugin_name: Option<String>,

    /// Session metadata snapshot — threaded from `SessionProps`.
    pub metadata: SessionMetadata,

    /// View config snapshot — threaded from `SessionProps`.
    pub view_config: ViewConfig,

    // State
    #[derivative(Debug = "ignore")]
    pub custom_events: CustomEvents,

    #[derivative(Debug = "ignore")]
    pub presentation: Presentation,

    #[derivative(Debug = "ignore")]
    pub renderer: Renderer,

    #[derivative(Debug = "ignore")]
    pub session: Session,
}

impl PartialEq for ColumnSettingsPanelProps {
    fn eq(&self, other: &Self) -> bool {
        self.selected_column == other.selected_column
            && self.selected_tab == other.selected_tab
            && self.plugin_name == other.plugin_name
            && self.metadata == other.metadata
            && self.view_config == other.view_config
    }
}

impl HasCustomEvents for ColumnSettingsPanelProps {
    fn custom_events(&self) -> &CustomEvents {
        &self.custom_events
    }
}

impl HasPresentation for ColumnSettingsPanelProps {
    fn presentation(&self) -> &Presentation {
        &self.presentation
    }
}

impl HasRenderer for ColumnSettingsPanelProps {
    fn renderer(&self) -> &Renderer {
        &self.renderer
    }
}

impl HasSession for ColumnSettingsPanelProps {
    fn session(&self) -> &Session {
        &self.session
    }
}

#[derive(Debug)]
pub enum ColumnSettingsPanelMsg {
    SetExprValue(Rc<String>),
    SetExprValid(bool),
    SetHeaderValue(Option<String>),
    SetHeaderValid(bool),
    SetSelectedTab((usize, ColumnSettingsTab)),
    OnSaveAttributes(()),
    OnResetAttributes(()),
    OnDelete(()),
}

#[derive(Derivative)]
#[derivative(Debug)]
pub struct ColumnSettingsPanel {
    column_name: String,
    expr_valid: bool,
    expr_value: Rc<String>,
    header_valid: bool,
    header_value: Option<String>,
    initial_expr_value: Rc<String>,
    initial_header_value: Option<String>,
    maybe_ty: Option<ColumnType>,
    on_input: Callback<Rc<String>>,
    on_save: Callback<()>,
    on_validate: Callback<bool>,
    reset_count: u8,
    reset_enabled: bool,
    save_count: u8,
    save_enabled: bool,
    tabs: Vec<ColumnSettingsTab>,
}

impl Component for ColumnSettingsPanel {
    type Message = ColumnSettingsPanelMsg;
    type Properties = ColumnSettingsPanelProps;

    fn create(ctx: &yew::prelude::Context<Self>) -> Self {
        let mut this = Self {
            initial_expr_value: Rc::default(),
            expr_value: Rc::default(),
            expr_valid: false,
            initial_header_value: None,
            header_value: None,
            header_valid: false,
            save_enabled: false,
            save_count: 0,
            reset_enabled: false,
            reset_count: 0,
            column_name: "".to_owned(),
            maybe_ty: None,
            tabs: vec![],
            on_input: Callback::default(),
            on_save: Callback::default(),
            on_validate: Callback::default(),
        };

        this.initialize(ctx);
        this
    }

    fn changed(&mut self, ctx: &yew::prelude::Context<Self>, old_props: &Self::Properties) -> bool {
        if ctx.props() != old_props {
            self.initialize(ctx);
            true
        } else {
            false
        }
    }

    fn update(&mut self, ctx: &yew::prelude::Context<Self>, msg: Self::Message) -> bool {
        match msg {
            ColumnSettingsPanelMsg::SetExprValue(val) => {
                if self.expr_value != val {
                    self.expr_value = val;
                    self.reset_enabled = true;
                    true
                } else {
                    false
                }
            },
            ColumnSettingsPanelMsg::SetExprValid(val) => {
                self.expr_valid = val;
                self.save_enabled_effect();
                true
            },
            ColumnSettingsPanelMsg::SetHeaderValue(val) => {
                if self.header_value != val {
                    self.header_value = val;
                    self.reset_enabled = true;
                    true
                } else {
                    false
                }
            },
            ColumnSettingsPanelMsg::SetHeaderValid(val) => {
                self.header_valid = val;
                self.save_enabled_effect();
                true
            },
            ColumnSettingsPanelMsg::SetSelectedTab((_, val)) => {
                let rerender = ctx.props().selected_tab != Some(val);
                ctx.props().on_select_tab.emit(val);
                rerender
            },
            ColumnSettingsPanelMsg::OnResetAttributes(()) => {
                self.header_value.clone_from(&self.initial_header_value);
                self.expr_value.clone_from(&self.initial_expr_value);
                self.save_enabled = false;
                self.reset_enabled = false;
                self.reset_count += 1;
                true
            },
            ColumnSettingsPanelMsg::OnSaveAttributes(()) => {
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
                    ColumnLocator::NewExpression => {
                        if let Err(err) = ctx.props().save_expr(new_expr) {
                            tracing::warn!("{}", err);
                        }
                    },
                }

                self.initial_expr_value.clone_from(&self.expr_value);
                self.initial_header_value.clone_from(&self.header_value);
                self.save_enabled = false;
                self.reset_enabled = false;
                self.save_count += 1;
                true
            },
            ColumnSettingsPanelMsg::OnDelete(()) => {
                if ctx.props().selected_column.is_saved_expr() {
                    ctx.props().delete_expr(&self.column_name).unwrap_or_log();
                }

                ctx.props().on_close.emit(());
                true
            },
        }
    }

    fn view(&self, ctx: &yew::prelude::Context<Self>) -> Html {
        let header_props = props!(EditableHeaderProps {
            initial_value: self.initial_header_value.clone(),
            placeholder: self.expr_value.clone(),
            reset_count: self.reset_count,
            editable: ctx.props().selected_column.is_expr()
                && matches!(
                    ctx.props().selected_tab,
                    Some(ColumnSettingsTab::Attributes)
                ),
            icon_type: self
                .maybe_ty
                .map(|ty| ty.into())
                .or(Some(TypeIconType::Expr)),
            on_change: ctx.link().batch_callback(|(value, valid)| {
                vec![
                    ColumnSettingsPanelMsg::SetHeaderValue(value),
                    ColumnSettingsPanelMsg::SetHeaderValid(valid),
                ]
            }),
            metadata: ctx.props().metadata.clone(),
            session: &ctx.props().session
        });

        let expr_editor = props!(ExpressionEditorProps {
            on_input: self.on_input.clone(),
            on_save: self.on_save.clone(),
            on_validate: self.on_validate.clone(),
            alias: ctx.props().selected_column.name().cloned(),
            disabled: !ctx.props().selected_column.is_expr(),
            reset_count: self.reset_count,
            metadata: ctx.props().metadata.clone(),
            session: &ctx.props().session
        });

        let disable_delete = ctx
            .props()
            .selected_column
            .name()
            .map(|name| {
                let config = &ctx.props().view_config;
                config.columns.iter().any(|maybe_col| {
                    maybe_col.as_ref().map(|col| col == name).unwrap_or_default()
                }) || config.group_by.iter().any(|col| col == name)
                    || config.split_by.iter().any(|col| col == name)
                    || config.filter.iter().any(|col| col.column() == name)
                    || config.sort.iter().any(|col| &col.0 == name)
            })
            .unwrap_or_default();

        let save_section = SaveSettingsProps {
            save_enabled: self.save_enabled,
            reset_enabled: self.reset_enabled,
            is_save: ctx.props().selected_column.name().is_some(),
            on_reset: ctx
                .link()
                .callback(ColumnSettingsPanelMsg::OnResetAttributes),
            on_save: ctx
                .link()
                .callback(ColumnSettingsPanelMsg::OnSaveAttributes),
            on_delete: ctx.link().callback(ColumnSettingsPanelMsg::OnDelete),
            show_danger_zone: ctx.props().selected_column.is_saved_expr(),
            disable_delete,
        };

        let attrs_tab = AttributesTabProps {
            expr_editor,
            save_section,
        };

        let style_tab = StyleTabProps {
            ty: self.maybe_ty,
            column_name: self.column_name.clone(),
            group_by_depth: ctx.props().view_config.group_by.len() as u32,
            view_config: ctx.props().view_config.clone(),
            metadata: ctx.props().metadata.clone(),
            custom_events: ctx.props().custom_events.clone(),
            presentation: ctx.props().presentation.clone(),
            renderer: ctx.props().renderer.clone(),
            session: ctx.props().session.clone(),
        };

        let tab_children = self.tabs.iter().map(|tab| match tab {
            ColumnSettingsTab::Attributes => html! { <AttributesTab ..attrs_tab.clone() /> },
            ColumnSettingsTab::Style => html! { <StyleTab ..style_tab.clone() /> },
        });

        let selected_tab_idx = self
            .tabs
            .iter()
            .find_position(|tab| Some(**tab) == ctx.props().selected_tab)
            .map(|(idx, _val)| idx)
            .unwrap_or_default();

        html! {
            <>
                <LocalStyle href={css!("column-settings-panel")} />
                <Sidebar
                    on_close={ctx.props().on_close.clone()}
                    id_prefix="column_settings"
                    width_override={ctx.props().width_override}
                    selected_tab={selected_tab_idx}
                    {header_props}
                >
                    <TabList<ColumnSettingsTab>
                        tabs={self.tabs.clone()}
                        on_tab_change={ctx.link().callback(ColumnSettingsPanelMsg::SetSelectedTab)}
                        selected_tab={selected_tab_idx}
                    >
                        { for tab_children }
                    </TabList<ColumnSettingsTab>>
                </Sidebar>
            </>
        }
    }
}

impl ColumnSettingsPanel {
    fn save_enabled_effect(&mut self) {
        let changed = self.expr_value != self.initial_expr_value
            || self.header_value != self.initial_header_value;
        let valid = self.expr_valid && self.header_valid;
        self.save_enabled = changed && valid;
    }

    fn initialize(&mut self, ctx: &yew::prelude::Context<Self>) {
        let column_name = locator_name_or_default(
            &ctx.props().metadata,
            &ctx.props().selected_column,
        );

        let initial_expr_value = ctx
            .props()
            .metadata
            .get_expression_by_alias(&column_name)
            .unwrap_or_default();

        let initial_expr_value = Rc::new(initial_expr_value);
        let initial_header_value =
            (*initial_expr_value != column_name).then_some(column_name.clone());

        let maybe_ty = locator_view_type(
            &ctx.props().metadata,
            &ctx.props().selected_column,
        );

        let tabs = {
            let mut tabs = vec![];
            let is_new_expr = ctx.props().selected_column.is_new_expr();
            let show_styles = !is_new_expr
                && can_render_column_styles(
                    &ctx.props().renderer,
                    &ctx.props().view_config,
                    &ctx.props().metadata,
                    &column_name,
                )
                .unwrap_or_default();

            if !is_new_expr && show_styles {
                tabs.push(ColumnSettingsTab::Style);
            }

            if ctx.props().selected_column.is_expr() {
                tabs.push(ColumnSettingsTab::Attributes);
            }
            tabs
        };

        let on_input = ctx.link().callback(ColumnSettingsPanelMsg::SetExprValue);
        let on_save = ctx
            .link()
            .callback(ColumnSettingsPanelMsg::OnSaveAttributes);

        let on_validate = ctx.link().callback(ColumnSettingsPanelMsg::SetExprValid);
        *self = Self {
            column_name,
            expr_value: initial_expr_value.clone(),
            initial_expr_value,
            header_value: initial_header_value.clone(),
            initial_header_value,
            maybe_ty,
            tabs,
            header_valid: true,
            on_input,
            on_save,
            on_validate,
            ..*self
        }
    }
}

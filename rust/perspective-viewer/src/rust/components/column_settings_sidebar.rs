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
pub(crate) mod style_tab;
mod window_tab;

use std::rc::Rc;

use derivative::Derivative;
use itertools::Itertools;
use perspective_client::config::{ColumnType, Expression, ViewConfig, WindowSpec};
use perspective_client::utils::PerspectiveResultExt;
use yew::{Callback, Component, Html, Properties, html, props};

use self::attributes_tab::AttributesTabProps;
use self::style_tab::StyleTabProps;
use crate::components::column_settings_sidebar::attributes_tab::AttributesTab;
use crate::components::column_settings_sidebar::save_settings::SaveSettingsProps;
use crate::components::column_settings_sidebar::style_tab::StyleTab;
use crate::components::column_settings_sidebar::window_tab::{WindowTab, WindowTabProps};
use crate::components::containers::sidebar::Sidebar;
use crate::components::containers::tab_list::TabList;
use crate::components::editable_header::EditableHeaderProps;
use crate::components::expression_editor::ExpressionEditorProps;
use crate::components::type_icon::TypeIconType;
use crate::components::window_editor::WindowEditorProps;
use crate::presentation::{ColumnLocator, ColumnSettingsTab, Presentation};
use crate::renderer::Renderer;
use crate::session::{Session, SessionMetadataRc};
use crate::tasks::{
    delete_expr, delete_window, save_expr, save_window, update_expr, update_window,
};
use crate::utils::PtrEqRc;
use crate::workspace::Workspace;

#[derive(Clone, Derivative, Properties)]
#[derivative(Debug)]
pub struct ColumnSettingsPanelProps {
    pub selected_column: ColumnLocator,
    pub selected_tab: Option<ColumnSettingsTab>,
    pub on_close: Callback<()>,
    pub width_override: Option<i32>,
    pub on_select_tab: Callback<ColumnSettingsTab>,

    /// Shared trap-door width across the drawer's Style/Attributes/Window
    /// tabs.
    #[prop_or_default]
    pub auto_width: f64,

    #[prop_or_default]
    pub on_auto_width: Callback<f64>,

    /// Whether the drawer is pinned into the layout.
    #[prop_or_default]
    pub is_pinned: bool,

    #[prop_or_default]
    pub on_toggle_pin: Callback<()>,

    /// Active plugin name.
    pub plugin_name: Option<String>,

    /// Session metadata snapshot — threaded from `SessionProps`.
    pub metadata: SessionMetadataRc,

    /// View config snapshot — threaded from `SessionProps`.
    pub view_config: PtrEqRc<ViewConfig>,

    /// Per-column stats snapshot — threaded from `SessionProps`.
    pub column_stats: PtrEqRc<std::collections::HashMap<String, crate::session::ColumnStats>>,

    /// Selected theme name, threaded for PortalModal consumers.
    pub selected_theme: Option<String>,

    // State
    #[derivative(Debug = "ignore")]
    pub presentation: Presentation,

    #[derivative(Debug = "ignore")]
    pub renderer: Renderer,

    #[derivative(Debug = "ignore")]
    pub session: Session,

    #[derivative(Debug = "ignore")]
    pub workspace: Workspace,
}

impl PartialEq for ColumnSettingsPanelProps {
    fn eq(&self, other: &Self) -> bool {
        self.selected_column == other.selected_column
            && self.selected_tab == other.selected_tab
            && self.plugin_name == other.plugin_name
            && self.metadata == other.metadata
            && self.view_config == other.view_config
            && self.column_stats == other.column_stats
            && self.selected_theme == other.selected_theme
            && self.auto_width == other.auto_width
            && self.is_pinned == other.is_pinned
    }
}

#[derive(Clone, PartialEq)]
struct Initials {
    column_name: String,
    expr: Rc<String>,
    header: Option<String>,
    window: Option<WindowSpec>,
}

impl Initials {
    fn of(props: &ColumnSettingsPanelProps) -> Self {
        let column_name = props
            .metadata
            .locator_name_or_default(&props.selected_column);

        let expr = props
            .metadata
            .get_expression_by_alias(&column_name)
            .or_else(|| props.view_config.expressions.get(&column_name).cloned())
            .unwrap_or_default();

        let expr = Rc::new(expr);
        let header = (*expr != column_name).then_some(column_name.clone());

        let window = props
            .selected_column
            .name()
            .and_then(|name| props.view_config.windows.get(name))
            .cloned();

        Self {
            column_name,
            expr,
            header,
            window,
        }
    }
}

#[derive(Debug)]
pub enum ColumnSettingsPanelMsg {
    SetExprValue(Rc<String>),
    SetExprValid(bool),
    SetHeaderValue(Option<String>),
    SetHeaderValid(bool),
    SetWindowValue(Option<WindowSpec>),
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
    initial_window_value: Option<WindowSpec>,
    window_value: Option<WindowSpec>,
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
            initial_window_value: None,
            window_value: None,
            tabs: vec![],
            on_input: ctx.link().callback(ColumnSettingsPanelMsg::SetExprValue),
            on_save: ctx
                .link()
                .callback(ColumnSettingsPanelMsg::OnSaveAttributes),
            on_validate: ctx.link().callback(ColumnSettingsPanelMsg::SetExprValid),
        };

        this.reset_to(ctx, Initials::of(ctx.props()));
        this
    }

    fn changed(&mut self, ctx: &yew::prelude::Context<Self>, old_props: &Self::Properties) -> bool {
        let next = Initials::of(ctx.props());
        if ctx.props().selected_column != old_props.selected_column || next != self.initials() {
            self.reset_to(ctx, next);
        } else {
            self.refresh_derived(ctx);
        }

        true
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
            ColumnSettingsPanelMsg::SetWindowValue(val) => {
                if self.window_value != val {
                    self.window_value = val;
                    self.reset_enabled = true;
                    true
                } else {
                    false
                }
            },
            ColumnSettingsPanelMsg::SetSelectedTab((_, val)) => {
                let rerender = ctx.props().selected_tab != Some(val);
                ctx.props().on_select_tab.emit(val);
                rerender
            },
            ColumnSettingsPanelMsg::OnResetAttributes(()) => {
                self.header_value.clone_from(&self.initial_header_value);
                self.expr_value.clone_from(&self.initial_expr_value);
                self.window_value.clone_from(&self.initial_window_value);
                self.save_enabled = false;
                self.reset_enabled = false;
                self.reset_count += 1;
                true
            },
            ColumnSettingsPanelMsg::OnSaveAttributes(()) => {
                if matches!(ctx.props().selected_tab, Some(ColumnSettingsTab::Window)) {
                    if let Some(spec) = self.window_value.clone() {
                        let name = self
                            .header_value
                            .clone()
                            .unwrap_or_else(|| self.column_name.clone());
                        match &ctx.props().selected_column {
                            ColumnLocator::Window(old_name) => update_window(
                                &ctx.props().session,
                                &ctx.props().renderer,
                                &ctx.props().presentation,
                                old_name.clone(),
                                name,
                                spec.clone(),
                            ),
                            _ => {
                                if let Err(err) = save_window(
                                    &ctx.props().session,
                                    &ctx.props().renderer,
                                    &ctx.props().presentation,
                                    name,
                                    spec.clone(),
                                ) {
                                    tracing::warn!("{}", err);
                                }
                            },
                        }

                        self.initial_window_value = Some(spec);
                        self.initial_header_value.clone_from(&self.header_value);
                        self.save_enabled = false;
                        self.reset_enabled = false;
                        self.save_count += 1;
                    }

                    return true;
                }

                let new_expr = Expression::new(
                    self.header_value.clone().map(|s| s.into()),
                    (*(self.expr_value)).clone().into(),
                );

                match &ctx.props().selected_column {
                    ColumnLocator::Table(_) | ColumnLocator::Window(_) => {
                        tracing::error!("Tried to save non-expression column!")
                    },
                    ColumnLocator::Expression(name) => update_expr(
                        &ctx.props().session,
                        &ctx.props().renderer,
                        &ctx.props().presentation,
                        name.clone(),
                        new_expr,
                    ),
                    ColumnLocator::NewExpression => {
                        if let Err(err) = save_expr(
                            &ctx.props().session,
                            &ctx.props().renderer,
                            &ctx.props().presentation,
                            new_expr,
                        ) {
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
                    delete_expr(
                        &ctx.props().session,
                        &ctx.props().renderer,
                        &self.column_name,
                    )
                    .unwrap_or_log();
                } else if ctx.props().selected_column.is_saved_window() {
                    delete_window(
                        &ctx.props().session,
                        &ctx.props().renderer,
                        &self.column_name,
                    )
                    .unwrap_or_log();
                }

                ctx.props().on_close.emit(());
                true
            },
        }
    }

    fn view(&self, ctx: &yew::prelude::Context<Self>) -> Html {
        let is_window_tab = matches!(ctx.props().selected_tab, Some(ColumnSettingsTab::Window));

        let header_placeholder = if is_window_tab {
            Rc::new(self.column_name.clone())
        } else {
            self.expr_value.clone()
        };

        let header_props = props!(EditableHeaderProps {
            value: self.header_value.clone(),
            initial_value: self.initial_header_value.clone(),
            placeholder: header_placeholder,
            editable: (ctx.props().selected_column.is_expr()
                && matches!(
                    ctx.props().selected_tab,
                    Some(ColumnSettingsTab::Attributes)
                ))
                || (ctx.props().selected_column.is_window_editable() && is_window_tab),
            update_on_input: true,
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
        });

        let expr_editor = props!(ExpressionEditorProps {
            on_input: self.on_input.clone(),
            on_save: self.on_save.clone(),
            on_validate: self.on_validate.clone(),
            alias: ctx.props().selected_column.name().cloned(),
            initial_expr: self.initial_expr_value.clone(),
            disabled: !ctx.props().selected_column.is_expr(),
            reset_count: self.reset_count,
            metadata: ctx.props().metadata.clone(),
            selected_theme: ctx.props().selected_theme.clone(),
            session: &ctx.props().session
        });

        let disable_delete = ctx
            .props()
            .selected_column
            .name()
            .map(|name| {
                let config = &ctx.props().view_config;
                config.columns.iter().any(|maybe_col| {
                    maybe_col
                        .as_ref()
                        .map(|col| col == name)
                        .unwrap_or_default()
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
            save_section: save_section.clone(),
        };

        let window_changed = self.window_value != self.initial_window_value
            || self.header_value != self.initial_header_value;
        let window_tab = WindowTabProps {
            editor: WindowEditorProps {
                metadata: ctx.props().metadata.clone(),
                initial: self.initial_window_value.clone(),
                on_change: ctx.link().callback(ColumnSettingsPanelMsg::SetWindowValue),
                reset_count: self.reset_count,
                presentation: ctx.props().presentation.clone(),
                session: ctx.props().session.clone(),
                selected_theme: ctx.props().selected_theme.clone(),
            },
            save_section: SaveSettingsProps {
                save_enabled: self.window_value.is_some() && window_changed && self.header_valid,
                show_danger_zone: ctx.props().selected_column.is_saved_window(),
                ..save_section
            },
        };

        let style_tab = StyleTabProps {
            ty: self.maybe_ty,
            column_name: self.column_name.clone(),
            group_by_depth: ctx.props().view_config.group_by.len() as u32,
            view_config: ctx.props().view_config.clone(),
            metadata: ctx.props().metadata.clone(),
            column_stats: ctx.props().column_stats.clone(),
            selected_theme: ctx.props().selected_theme.clone(),
            presentation: ctx.props().presentation.clone(),
            renderer: ctx.props().renderer.clone(),
            session: ctx.props().session.clone(),
            workspace: ctx.props().workspace.clone(),
        };

        let tab_children = self.tabs.iter().map(|tab| match tab {
            ColumnSettingsTab::Attributes => html! { <AttributesTab ..attrs_tab.clone() /> },
            ColumnSettingsTab::Window => html! { <WindowTab ..window_tab.clone() /> },
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
                <Sidebar
                    on_close={ctx.props().on_close.clone()}
                    id_prefix="column_settings"
                    width_override={ctx.props().width_override}
                    auto_width={ctx.props().auto_width}
                    on_auto_width={ctx.props().on_auto_width.clone()}
                    is_pinned={ctx.props().is_pinned}
                    on_toggle_pin={Some(ctx.props().on_toggle_pin.clone())}
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

    fn initials(&self) -> Initials {
        Initials {
            column_name: self.column_name.clone(),
            expr: self.initial_expr_value.clone(),
            header: self.initial_header_value.clone(),
            window: self.initial_window_value.clone(),
        }
    }

    fn refresh_derived(&mut self, ctx: &yew::prelude::Context<Self>) {
        self.maybe_ty = ctx
            .props()
            .metadata
            .locator_view_type(&ctx.props().selected_column);

        self.tabs = {
            let mut tabs = vec![];
            let is_new_expr = ctx.props().selected_column.is_new_expr();
            let show_styles = !is_new_expr
                && ctx.props().renderer.can_render_column_styles()
                && ctx.props().view_config.columns.contains(&Some(
                    ctx.props()
                        .selected_column
                        .name()
                        .map(|x| x.to_string())
                        .unwrap_or_default(),
                ));

            if !is_new_expr && show_styles {
                tabs.push(ColumnSettingsTab::Style);
            }

            if ctx.props().selected_column.is_expr() {
                tabs.push(ColumnSettingsTab::Attributes);
            }

            let supports_windows = ctx
                .props()
                .metadata
                .get_features()
                .map(|x| x.has_window_aggregates())
                .unwrap_or_default();

            if ctx.props().selected_column.is_window_editable() && supports_windows {
                tabs.push(ColumnSettingsTab::Window);
            }

            tabs
        };
    }

    fn reset_to(&mut self, ctx: &yew::prelude::Context<Self>, initials: Initials) {
        let Initials {
            column_name,
            expr,
            header,
            window,
        } = initials;

        self.column_name = column_name;
        self.expr_value = expr.clone();
        self.initial_expr_value = expr;
        self.header_value = header.clone();
        self.initial_header_value = header;
        self.window_value = window.clone();
        self.initial_window_value = window;
        self.header_valid = true;
        self.save_enabled = false;
        self.reset_enabled = false;
        self.reset_count = self.reset_count.wrapping_add(1);
        self.refresh_derived(ctx);
    }
}

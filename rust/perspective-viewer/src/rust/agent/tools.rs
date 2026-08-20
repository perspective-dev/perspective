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

use std::collections::HashMap;
use std::rc::Rc;
use std::str::FromStr;

use futures::future::LocalBoxFuture;
use perspective_js::utils::ApiError;
use serde::Deserialize;
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;

use super::client::protocol::{FunctionDef, ToolDef};
use super::docs::{DocsBundle, DocsCell};
use crate::config::{ColumnConfigSchema, ControlSpec};
use crate::custom_elements::viewer::PerspectiveViewerElement;
use crate::queries::{
    get_column_config_schema, get_plugin_config_schema, get_viewer_config, validate_expr,
};
use crate::workspace::{Panel, PanelId};

/// Host-grantable access classes (`agentConfig({entitlements})`). A tool
/// whose entitlement is withheld is neither advertised nor dispatchable.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Entitlement {
    ReadView,
    ConfigureView,
    ManageLayout,
    ReadDocs,

    // TODO(texodus): unused
    ReadData,
}

impl Entitlement {
    pub const VALID: &'static str =
        "read_view, configure_view, manage_layout, read_docs, read_data";

    /// The default grant: everything except raw data access.
    pub fn default_set() -> Vec<Self> {
        vec![
            Self::ReadView,
            Self::ConfigureView,
            Self::ManageLayout,
            Self::ReadDocs,
        ]
    }
}

impl FromStr for Entitlement {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "read_view" => Ok(Self::ReadView),
            "configure_view" => Ok(Self::ConfigureView),
            "manage_layout" => Ok(Self::ManageLayout),
            "read_docs" => Ok(Self::ReadDocs),
            "read_data" => Ok(Self::ReadData),
            other => Err(format!(
                "Unknown entitlement `{other}` - valid entitlements: {}",
                Self::VALID
            )),
        }
    }
}

/// Per-turn tool context, constructed by the runtime.
pub struct ToolCtx {
    pub docs: Option<Rc<DocsCell>>,
    pub bundle: Option<Rc<Result<DocsBundle, String>>>,
    pub entitlements: Vec<Entitlement>,
}

impl ToolCtx {
    fn schemas(&self) -> Option<&HashMap<String, Value>> {
        self.bundle
            .as_ref()
            .and_then(|x| x.as_ref().as_ref().ok())
            .map(|x| &x.schemas)
    }
}

pub struct Tool {
    name: &'static str,
    description: &'static str,
    entitlement: Entitlement,
    available: fn(&ToolCtx) -> bool,
    parameters: fn(Option<&HashMap<String, Value>>) -> Value,
    call: for<'a> fn(
        &'a PerspectiveViewerElement,
        &'a ToolCtx,
        Value,
    ) -> LocalBoxFuture<'a, Result<Value, ToolError>>,
}

fn always(_: &ToolCtx) -> bool {
    true
}

fn panel_property() -> Value {
    json!({
        "type": "string",
        "description": "Panel id from `list_panels`; omit to target the active panel"
    })
}

/// The `config` property node + root `definitions` for tools taking a
/// config argument (`key` = the generated schema's type name, e.g.
/// `"ViewerConfigUpdate"`): the generated schema (from the docs metadata
/// bundle) when available, else a permissive object. `require` lists
/// config properties the AGENT contract requires beyond the public type
/// (unioned into the definition's `required`, stated outright in the
/// fallback) — the tool body must enforce the same fields at dispatch.
fn spliced_config(
    schemas: Option<&HashMap<String, Value>>,
    key: &str,
    description: &str,
    require: &[&str],
) -> (Value, Option<Value>) {
    match schemas.and_then(|x| x.get(key)) {
        Some(schema) => {
            let mut definitions = schema
                .get("definitions")
                .and_then(|x| x.as_object())
                .cloned()
                .unwrap_or_default();

            let original = definitions.remove(key);
            let mut config = original
                .clone()
                .unwrap_or_else(|| json!({ "type": "object" }));

            let mut required = config["required"].as_array().cloned().unwrap_or_default();
            for field in require {
                if !required.iter().any(|x| x == field) {
                    required.push(json!(field));
                }
            }

            if !required.is_empty() {
                config["required"] = Value::Array(required);
            }

            config["description"] = json!(description);

            // A self-recursive config type still needs its own entry.
            if let Some(original) = original
                && serde_json::to_string(&definitions)
                    .unwrap_or_default()
                    .contains(&format!("#/definitions/{key}"))
            {
                definitions.insert(key.to_owned(), original);
            }

            let definitions = (!definitions.is_empty()).then(|| Value::Object(definitions));
            (config, definitions)
        },
        None if require.is_empty() => (
            json!({ "type": "object", "description": description }),
            None,
        ),
        None => (
            json!({ "type": "object", "description": description, "required": require }),
            None,
        ),
    }
}

fn config_parameters(
    schemas: Option<&HashMap<String, Value>>,
    key: &str,
    description: &str,
    with_panel: bool,
    require: &[&str],
) -> Value {
    let (config, definitions) = spliced_config(schemas, key, description, require);
    let mut properties = json!({ "config": config });
    if with_panel {
        properties["panel"] = panel_property();
    }

    let mut parameters = json!({
        "type": "object",
        "properties": properties,
        "required": ["config"]
    });

    if let Some(definitions) = definitions {
        parameters["definitions"] = definitions;
    }

    parameters
}

static TOOLS: &[Tool] = &[
    Tool {
        name: "get_schema",
        description: "Get the column schema (column name -> type) and row count of the data \
                      currently loaded in a panel. Call this before configuring the view - column \
                      names must match exactly.",
        entitlement: Entitlement::ReadView,
        available: always,
        parameters: |_| {
            json!({
                "type": "object",
                "properties": { "panel": panel_property() }
            })
        },
        call: |elem, ctx, args| Box::pin(elem.tool_get_schema(ctx, args)),
    },
    Tool {
        name: "get_view_config",
        description: "Get a panel's current configuration (plugin, group_by, split_by, columns, \
                      filter, sort, aggregates, expressions).",
        entitlement: Entitlement::ReadView,
        available: always,
        parameters: |_| {
            json!({
                "type": "object",
                "properties": { "panel": panel_property() }
            })
        },
        call: |elem, ctx, args| Box::pin(elem.tool_get_view_config(ctx, args)),
    },
    Tool {
        name: "set_view_config",
        description: "Apply a partial configuration update to a panel. Only the fields provided \
                      are changed. Expression columns must be declared in `expressions` before \
                      being referenced in `columns`/`group_by`/etc. `columns` is POSITIONAL and \
                      every plugin reads the positions differently - call `list_plugins` for the \
                      active plugin's column roles and for what `group_by`/`split_by` draw in it. \
                      Returns the full configuration after the update is applied and rendered, \
                      plus `aggregation_changed_types` listing any column whose type CHANGED \
                      under aggregation (a `date` on the default `count` aggregate becomes an \
                      integer, so an axis bound to it is no longer a date axis).",
        entitlement: Entitlement::ConfigureView,
        available: always,
        parameters: |schemas| {
            config_parameters(
                schemas,
                "ViewerConfigUpdate",
                "A partial ViewerConfigUpdate patch",
                true,
                &[],
            )
        },
        call: |elem, ctx, args| Box::pin(elem.tool_set_view_config(ctx, args)),
    },
    Tool {
        name: "list_plugins",
        description: "List the visualization plugins registered with this viewer, each with the \
                      contract it declares: the ROLE each `columns` position fills (`columns[i]` \
                      fills `roles[i]`; extra columns repeat the last role), how many columns it \
                      requires, and what `group_by` and `split_by` draw in it. Use one of these \
                      exact names as the `plugin` field of set_view_config, and read its roles \
                      before writing `columns` - the same array means different things in \
                      different plugins.",
        entitlement: Entitlement::ReadView,
        available: always,
        parameters: |_| json!({ "type": "object", "properties": {} }),
        call: |elem, ctx, args| Box::pin(elem.tool_list_plugins(ctx, args)),
    },
    Tool {
        name: "validate_expression",
        description: "Validate an ExprTK expression against a panel's table without applying it. \
                      ExprTK examples: `\"Sales\" - \"Profit\"`, `if(\"Discount\" > 0.2, 'High', \
                      'Low')`, `bucket(\"Order Date\", 'M')`. Column references are \
                      double-quoted; string literals are single-quoted. Use this to iterate on an \
                      expression before committing it via set_view_config's `expressions` field.",
        entitlement: Entitlement::ReadView,
        available: always,
        parameters: |_| {
            json!({
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "The ExprTK expression to validate"
                    },
                    "panel": panel_property()
                },
                "required": ["expression"]
            })
        },
        call: |elem, ctx, args| Box::pin(elem.tool_validate_expression(ctx, args)),
    },
    Tool {
        name: "get_style_schema",
        description: "Get the active plugin's DECLARED style schema: the valid `plugin_config` \
                      keys, and - when `column` is given - the valid `columns_config` keys for \
                      that column. These are value-dependent (they vary by plugin, column type \
                      and current state), so call this before writing `plugin_config` or \
                      `columns_config` via set_view_config. Plugins that declare no schema return \
                      null sections - keys then pass through unvalidated.",
        entitlement: Entitlement::ReadView,
        available: always,
        parameters: |_| {
            json!({
                "type": "object",
                "properties": {
                    "column": {
                        "type": "string",
                        "description": "An active column name (see get_view_config `columns`)"
                    },
                    "panel": panel_property()
                }
            })
        },
        call: |elem, ctx, args| Box::pin(elem.tool_get_style_schema(ctx, args)),
    },
    Tool {
        name: "list_panels",
        description: "List the panels (independent side-by-side views) in this viewer's dashboard \
                      layout, and which one is active. View tools target the active panel unless \
                      given a `panel` argument.",
        entitlement: Entitlement::ReadView,
        available: always,
        parameters: |_| json!({ "type": "object", "properties": {} }),
        call: |elem, ctx, args| Box::pin(elem.tool_list_panels(ctx, args)),
    },
    Tool {
        name: "add_panel",
        description: "Add a new independent panel to the dashboard layout, configured with the \
                      given view config - same fields as set_view_config, plus `table`, which is \
                      REQUIRED (a new panel must bind a data table). `columns` is also REQUIRED: \
                      omitting it would display every column in the table. Compose the panel's \
                      COMPLETE configuration (plugin, columns, group_by, expressions, ...) in \
                      this one call. Returns the new panel's id and resulting configuration. To \
                      duplicate an existing panel, pass a config obtained from get_view_config. \
                      `columns` is POSITIONAL - see `list_plugins` for the chosen plugin's roles.",
        entitlement: Entitlement::ManageLayout,
        available: always,
        parameters: |schemas| {
            config_parameters(
                schemas,
                "ViewerConfigInitial",
                "The new panel's ViewerConfigInitial (`table` and `columns` required)",
                false,
                &["table", "columns"],
            )
        },
        call: |elem, ctx, args| Box::pin(elem.tool_add_panel(ctx, args)),
    },
    Tool {
        name: "remove_panel",
        description: "Remove a panel by id, disposing its view. Removing every panel leaves an \
                      empty viewer.",
        entitlement: Entitlement::ManageLayout,
        available: always,
        parameters: |_| {
            json!({
                "type": "object",
                "properties": {
                    "panel": {
                        "type": "string",
                        "description": "Panel id from `list_panels`"
                    }
                },
                "required": ["panel"]
            })
        },
        call: |elem, ctx, args| Box::pin(elem.tool_remove_panel(ctx, args)),
    },
    Tool {
        name: "activate_panel",
        description: "Make a panel active: the target of the settings sidebar and of view tools \
                      called without a `panel` argument.",
        entitlement: Entitlement::ManageLayout,
        available: always,
        parameters: |_| {
            json!({
                "type": "object",
                "properties": {
                    "panel": {
                        "type": "string",
                        "description": "Panel id from `list_panels`"
                    }
                },
                "required": ["panel"]
            })
        },
        call: |elem, ctx, args| Box::pin(elem.tool_activate_panel(ctx, args)),
    },
    Tool {
        name: "search_docs",
        description: "Search the reference documentation: Perspective features, configuration \
                      fields, expression syntax, plugin capabilities, and any host-supplied data \
                      definitions. Queries are keyword-matched - prefer concrete terms (e.g. \
                      `expressions bucket date`, not full sentences), and re-query with different \
                      keywords if the results look irrelevant.",
        entitlement: Entitlement::ReadDocs,
        available: always,
        parameters: |_| {
            json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Keyword search query"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results (default 4)"
                    }
                },
                "required": ["query"]
            })
        },
        call: |elem, ctx, args| Box::pin(elem.tool_search_docs(ctx, args)),
    },
];

fn granted(tool: &Tool, ctx: &ToolCtx) -> bool {
    ctx.entitlements.contains(&tool.entitlement) && (tool.available)(ctx)
}

/// The tools advertised to the model for this turn.
pub fn tool_definitions(ctx: &ToolCtx) -> Vec<ToolDef> {
    TOOLS
        .iter()
        .filter(|x| granted(x, ctx))
        .map(|x| ToolDef {
            kind: "function",
            function: FunctionDef {
                name: x.name,
                description: x.description,
                parameters: (x.parameters)(ctx.schemas()),
            },
        })
        .collect()
}

/// Run one tool call. `arguments` is the model's JSON-encoded argument
/// string; all failures (including undecodable arguments and unknown or
/// withheld names — indistinguishable, so no capability leak) surface as
/// `ToolError` for the model to correct. The transcript/CustomEvent
/// `emit` happens HERE, once, for every tool.
pub async fn tool_dispatch(
    elem: &PerspectiveViewerElement,
    ctx: &ToolCtx,
    name: &str,
    arguments: &str,
) -> Result<Value, ToolError> {
    let tool = TOOLS
        .iter()
        .find(|x| x.name == name && granted(x, ctx))
        .ok_or_else(|| ToolError(format!("Unknown tool `{name}`")))?;

    let args: Value = if arguments.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(arguments)?
    };

    elem.agent_emit(name, &args);
    let result = (tool.call)(elem, ctx, args).await;
    if let Err(err) = &result {
        elem.agent_emit_error(&format!("{err}"));
    }

    result
}

/// Tool failures are returned to the model as error tool-results so it can
/// self-correct (e.g. a rejected `ViewerConfigUpdate` patch).
#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct ToolError(String);

/// Columns whose type CHANGED under aggregation, reported alongside an
/// applied config.
fn retyped_columns(
    session: &crate::session::Session,
    config: &crate::config::ViewerConfig,
) -> Vec<Value> {
    let metadata = session.metadata();
    config
        .view_config
        .columns
        .iter()
        .flatten()
        .filter_map(|name| {
            let view_type = metadata.get_column_view_type(name)?;
            let table_type = metadata.get_column_table_type(name)?;
            if view_type == table_type {
                return None;
            }

            Some(json!({
                "name": name,
                "type": view_type,
                "source_type": table_type,
                "aggregate": config.view_config.aggregates.get(name),
            }))
        })
        .collect()
}

/// Append a `search_docs` pointer to a config-application error when a docs
/// corpus is configured — a rejected config is the moment the model most
/// needs the reference, and self-correction errors are the one channel it
/// reliably reads (the preamble's docs step alone was not enough in the
/// field). No-op without docs, where the tool does not exist.
fn with_docs_hint(ctx: &ToolCtx, err: ToolError) -> ToolError {
    if ctx.docs.is_some() {
        ToolError(format!(
            "{} If a field or value was rejected, its reference documentation is available - call \
             `search_docs` with the failing field or function name.",
            err.0
        ))
    } else {
        err
    }
}

impl From<ApiError> for ToolError {
    fn from(err: ApiError) -> Self {
        Self(format!("{err}"))
    }
}

impl From<serde_json::Error> for ToolError {
    fn from(err: serde_json::Error) -> Self {
        Self(format!("{err}"))
    }
}

impl From<JsValue> for ToolError {
    fn from(err: JsValue) -> Self {
        Self(
            err.as_string()
                .or_else(|| {
                    js_sys::Reflect::get(&err, &JsValue::from_str("message"))
                        .ok()
                        .and_then(|x| x.as_string())
                })
                .unwrap_or_else(|| format!("{err:?}")),
        )
    }
}

#[derive(Deserialize)]
struct PanelArgs {
    panel: Option<String>,
}

#[derive(Deserialize)]
struct SetViewConfigArgs {
    config: Value,
    panel: Option<String>,
}

#[derive(Deserialize)]
struct ValidateExpressionArgs {
    expression: String,
    panel: Option<String>,
}

#[derive(Deserialize)]
struct AddPanelArgs {
    config: Value,
}

#[derive(Deserialize)]
struct PanelNameArgs {
    panel: String,
}

#[derive(Deserialize)]
struct SearchDocsArgs {
    query: String,
    limit: Option<usize>,
}

#[derive(Deserialize)]
struct StyleSchemaArgs {
    column: Option<String>,
    panel: Option<String>,
}

fn control_schema_entries(spec: &ControlSpec) -> Vec<(String, Value)> {
    match spec {
        ControlSpec::Enum {
            key,
            variants,
            default,
        } => vec![(
            key.clone(),
            json!({
                "type": "string",
                "enum": variants.iter().map(|x| x.value.clone()).collect::<Vec<_>>(),
                "default": default
            }),
        )],
        ControlSpec::Bool { key, default } => vec![(
            key.clone(),
            json!({ "type": "boolean", "default": default }),
        )],
        ControlSpec::Number {
            key,
            default,
            min,
            max,
            ..
        } => {
            let mut node = json!({ "type": "number", "default": default });
            if let Some(min) = min {
                node["minimum"] = json!(min);
            }

            if let Some(max) = max {
                node["maximum"] = json!(max);
            }

            vec![(key.clone(), node)]
        },
        ControlSpec::String { key, default, .. } => {
            vec![(key.clone(), json!({ "type": "string", "default": default }))]
        },
        ControlSpec::Color { key, default } => vec![(
            key.clone(),
            json!({
                "type": "string",
                "description": "A CSS color (`#rrggbb`, `rgb()`), or a host-defined named color `var(--psp-user--color-<name>)`",
                "default": default,
            }),
        )],
        ControlSpec::Palette { key, default, max } => {
            let mut description = "Ordered discrete color palette, cycled over the column's \
                                   categories/series: a CSS `linear-gradient(to right, #rrggbb, \
                                   #rrggbb, …)` of N colors WITHOUT positions, or a host-defined \
                                   named palette `var(--psp-user--palette-<name>)`"
                .to_owned();
            if let Some(max) = max {
                description.push_str(&format!(" (at most {max} colors)"));
            }

            vec![(
                key.clone(),
                json!({
                    "type": "string",
                    "description": description,
                    "default": default,
                }),
            )]
        },
        ControlSpec::GradientStops {
            key,
            default,
            discrete,
        } => {
            let mut description = "Multi-stop color gradient: a CSS `linear-gradient(to right, \
                                   #rrggbb P%, …)` with positioned stops (direction normalized to \
                                   `to right`; stops[0] maps to the most negative value), or a \
                                   host-defined named gradient `var(--psp-user--gradient-<name>)`"
                .to_owned();

            if *discrete {
                description.push_str(" — exactly 2 stops (the negative and positive colors)");
            }

            vec![(
                key.clone(),
                json!({
                    "type": "string",
                    "description": description,
                    "default": default,
                }),
            )]
        },
        ControlSpec::DatetimeFormat => vec![(
            "date_format".to_owned(),
            json!({ "description": "Datetime display format: a style preset or custom format fields" }),
        )],
        ControlSpec::StringFormat => vec![(
            "format".to_owned(),
            json!({ "description": "String display format" }),
        )],
        ControlSpec::NumberSeriesStyle { .. } => vec![
            (
                "chart_type".to_owned(),
                json!({ "type": "string", "description": "Per-series glyph override" }),
            ),
            (
                "stack".to_owned(),
                json!({ "description": "Series stack group" }),
            ),
        ],
        ControlSpec::Symbols { .. } => vec![(
            "symbols".to_owned(),
            json!({ "type": "object", "description": "Map of column values to symbol names" }),
        )],
        ControlSpec::NumberFormat => vec![(
            "number_format".to_owned(),
            json!({ "type": "object", "description": "Intl.NumberFormat-style options" }),
        )],
        ControlSpec::AggregateDepth => vec![(
            "aggregate_depth".to_owned(),
            json!({ "type": "integer", "description": "Group-by rollup depth override" }),
        )],
    }
}

fn schema_object(schema: &ColumnConfigSchema) -> Value {
    let mut properties = serde_json::Map::new();
    for spec in &schema.fields {
        for (key, node) in control_schema_entries(spec) {
            properties.insert(key, node);
        }
    }

    json!({ "type": "object", "properties": properties })
}

const SEARCH_DOCS_LIMIT: usize = 4;

/// Tool bodies and their shared helpers — plain (non-bindgen) methods.
impl PerspectiveViewerElement {
    /// Resolve a tool's panel target: a named panel, or the active panel
    /// when `None`. Unknown names error with the current panel list so the
    /// model can self-correct.
    fn agent_panel(&self, target: Option<&str>) -> Result<Panel, ToolError> {
        let id = target.map(|x| PanelId::from(x.to_owned()));
        self.workspace
            .panel_or_active(id.as_ref())
            .ok_or_else(|| match target {
                Some(name) => ToolError(format!(
                    "Unknown panel `{name}` - current panels: {:?}",
                    self.agent_panel_names()
                )),
                None => ToolError("No panel - the viewer has no data loaded yet".to_owned()),
            })
    }

    fn agent_panel_names(&self) -> Vec<String> {
        self.workspace
            .panel_ids()
            .iter()
            .map(|x| x.as_str().to_owned())
            .collect()
    }

    fn agent_active_name(&self) -> Option<String> {
        self.workspace.active_id().map(|x| x.as_str().to_owned())
    }

    /// Record tool activity on the transcript (chat UI) and notify host
    /// listeners (`perspective-agent-tool`).
    fn agent_emit_error(&self, message: &str) {
        self.presentation.agent.record_tool_error(message);
    }

    fn agent_emit(&self, name: &str, args: &Value) {
        self.presentation.agent.record_tool(name, args);
        let detail: JsValue = json!({ "name": name, "args": args }).to_string().into();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_bubbles(true);
        event_init.set_detail(&detail);
        if let Ok(event) =
            web_sys::CustomEvent::new_with_event_init_dict("perspective-agent-tool", &event_init)
        {
            let _ = self.elem.dispatch_event(&event);
        }
    }

    async fn tool_get_schema(&self, _ctx: &ToolCtx, args: Value) -> Result<Value, ToolError> {
        let args: PanelArgs = serde_json::from_value(args)?;
        let panel = self.agent_panel(args.panel.as_deref())?;
        let table = panel
            .session
            .get_table()
            .ok_or_else(|| ToolError("No table loaded".to_owned()))?;

        let schema = table.schema().await.map_err(ApiError::from)?;
        let size = table.size().await.map_err(ApiError::from)?;
        Ok(json!({
            "table": table.get_name(),
            "columns": serde_json::to_value(&schema)?,
            "num_rows": size,
        }))
    }

    async fn tool_get_view_config(&self, _ctx: &ToolCtx, args: Value) -> Result<Value, ToolError> {
        let args: PanelArgs = serde_json::from_value(args)?;
        let panel = self.agent_panel(args.panel.as_deref())?;
        let config = get_viewer_config(&panel.session, &panel.renderer, &self.presentation).await?;
        Ok(serde_json::to_value(&config)?)
    }

    /// Applies via the public `restore()` with `suppress_errors: true`.
    async fn tool_set_view_config(&self, ctx: &ToolCtx, args: Value) -> Result<Value, ToolError> {
        let args: SetViewConfigArgs = serde_json::from_value(args)?;
        let target = args.panel.as_deref();
        let panel = self.agent_panel(target)?;
        let snapshot =
            get_viewer_config(&panel.session, &panel.renderer, &self.presentation).await?;

        if let Err(err) = self.agent_restore(target, &args.config).await {
            let rolled = self
                .agent_restore(target, &serde_json::to_value(&snapshot)?)
                .await;

            let err = match rolled {
                Ok(()) => err,
                Err(rollback_err) => ToolError(format!(
                    "{err} (additionally, restoring the prior config failed: {rollback_err})"
                )),
            };

            return Err(with_docs_hint(ctx, err));
        }

        let panel = self.agent_panel(target)?;
        let config = get_viewer_config(&panel.session, &panel.renderer, &self.presentation).await?;
        let mut result = serde_json::to_value(&config)?;
        let retyped = retyped_columns(&panel.session, &config);
        if !retyped.is_empty() {
            result["aggregation_changed_types"] = json!(retyped);
        }

        Ok(result)
    }

    /// One public-API `restore()` call with `suppress_errors: true`.
    async fn agent_restore(&self, target: Option<&str>, config: &Value) -> Result<(), ToolError> {
        let options = js_sys::Object::new();
        js_sys::Reflect::set(
            &options,
            &JsValue::from_str("suppress_errors"),
            &JsValue::TRUE,
        )?;

        if let Some(name) = target {
            js_sys::Reflect::set(
                &options,
                &JsValue::from_str("panel"),
                &JsValue::from_str(name),
            )?;
        }

        let js_config = js_sys::JSON::parse(&config.to_string())?;
        let restored = self.restore(js_config.unchecked_into(), Some(options.unchecked_into()));
        let promise: js_sys::Promise = JsValue::from(restored).unchecked_into();
        wasm_bindgen_futures::JsFuture::from(promise).await?;
        Ok(())
    }

    async fn tool_list_plugins(&self, _ctx: &ToolCtx, _args: Value) -> Result<Value, ToolError> {
        let panel = self.agent_panel(None)?;
        let plugins = panel
            .renderer
            .get_all_plugin_configs()
            .iter()
            .map(|config| {
                let mut value = json!({
                    "name": config.name,
                    "category": config.category,
                    "columns": {
                        "roles": config.config_column_names,
                        "required": config.min_config_columns.unwrap_or(1),
                        "extra_columns": config.tail_column_role(),
                    },
                    "ordering": if config.connects_row_order {
                        json!("connects points in row order - `sort` by the \
                               X-axis column unless the table already \
                               arrives ordered")
                    } else {
                        Value::Null
                    },
                    "select_mode": match config.select_mode {
                        crate::config::ColumnSelectMode::Select => "select",
                        crate::config::ColumnSelectMode::Toggle => "toggle",
                    },
                    "supports_column_styles": config.can_render_column_styles,
                });

                if let Some(max) = config.max_columns {
                    value["columns"]["max"] = json!(max);
                }

                value["group_by"] = match &config.group_by_role {
                    Some(role) => json!(role),
                    None => json!("aggregates rows; no visual role"),
                };

                value["split_by"] = match &config.split_by_role {
                    Some(role) => json!(role),
                    None => json!("aggregates rows; no visual role"),
                };

                value
            })
            .collect::<Vec<_>>();

        Ok(json!({
            "plugins": plugins,
            "columns_are_positional": "`columns[i]` fills the role at                                        `roles[i]`; columns past the last                                        named role repeat `extra_columns`.",
        }))
    }

    async fn tool_validate_expression(
        &self,
        ctx: &ToolCtx,
        args: Value,
    ) -> Result<Value, ToolError> {
        let args: ValidateExpressionArgs = serde_json::from_value(args)?;
        let panel = self.agent_panel(args.panel.as_deref())?;
        match validate_expr(&panel.session, &args.expression).await? {
            None => Ok(json!({ "valid": true })),
            Some(err) => {
                let mut result = json!({
                    "valid": false,
                    "error": err.error_message,
                    "line": err.line,
                    "column": err.column,
                });

                if ctx.docs.is_some() {
                    result["hint"] = json!(
                        "ExprTK syntax and functions are documented - call `search_docs` with the \
                         function name or feature, e.g. `expressions bucket`."
                    );
                }

                Ok(result)
            },
        }
    }

    async fn tool_list_panels(&self, _ctx: &ToolCtx, _args: Value) -> Result<Value, ToolError> {
        Ok(json!({
            "panels": self.agent_panel_names(),
            "active": self.agent_active_name(),
        }))
    }

    async fn tool_add_panel(&self, ctx: &ToolCtx, args: Value) -> Result<Value, ToolError> {
        let args: AddPanelArgs = serde_json::from_value(args)?;
        if let Err(err) =
            serde_json::from_value::<crate::config::ViewerConfigInitial>(args.config.clone())
        {
            let mut message = format!("Invalid panel config: {err}");
            if message.contains("table")
                && let Some(names) = self.agent_hosted_table_names().await
            {
                message.push_str(&format!(" - available tables: {names:?}"));
            }

            return Err(with_docs_hint(ctx, ToolError(message)));
        }

        match args.config.get("columns") {
            Some(Value::Array(columns)) if !columns.is_empty() => {},
            _ => {
                return Err(ToolError(
                    "Invalid panel config: a new panel requires a non-empty `columns` list \
                     (omitting it would display every column in the table). Choose the columns - \
                     including any `expressions` names - this panel should display."
                        .to_owned(),
                ));
            },
        }

        let before = self.agent_panel_names();
        let js_config = js_sys::JSON::parse(&args.config.to_string())?;
        let added = self.addPanel(js_config.unchecked_into());
        let result = wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(added)).await;
        let id = match result {
            Ok(id) => id
                .as_string()
                .ok_or_else(|| ToolError("addPanel returned no id".to_owned()))?,
            Err(err) => {
                for name in self.agent_panel_names() {
                    if !before.contains(&name) {
                        let removed = self.removePanel(name);
                        let _ =
                            wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(removed))
                                .await;
                    }
                }

                return Err(with_docs_hint(ctx, ToolError::from(err)));
            },
        };

        let panel = self.agent_panel(Some(&id))?;
        let config = get_viewer_config(&panel.session, &panel.renderer, &self.presentation).await?;
        let mut result = json!({
            "panel": id,
            "config": serde_json::to_value(&config)?,
        });

        let retyped = retyped_columns(&panel.session, &config);
        if !retyped.is_empty() {
            result["aggregation_changed_types"] = json!(retyped);
        }

        Ok(result)
    }

    /// Best-effort list of the active panel's client's hosted table names,
    /// for self-correction error messages.
    async fn agent_hosted_table_names(&self) -> Option<Vec<String>> {
        let panel = self.agent_panel(None).ok()?;
        let client = panel.session.get_client()?;
        client.get_hosted_table_names().await.ok()
    }

    async fn tool_remove_panel(&self, _ctx: &ToolCtx, args: Value) -> Result<Value, ToolError> {
        let args: PanelNameArgs = serde_json::from_value(args)?;
        self.agent_panel(Some(&args.panel))?;
        let removed = self.removePanel(args.panel);
        wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(removed)).await?;
        Ok(json!({
            "panels": self.agent_panel_names(),
            "active": self.agent_active_name(),
        }))
    }

    async fn tool_activate_panel(&self, _ctx: &ToolCtx, args: Value) -> Result<Value, ToolError> {
        let args: PanelNameArgs = serde_json::from_value(args)?;
        self.agent_panel(Some(&args.panel))?;
        let activated = self.setActivePanel(args.panel);
        wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(activated)).await?;
        Ok(json!({ "active": self.agent_active_name() }))
    }

    async fn tool_get_style_schema(&self, _ctx: &ToolCtx, args: Value) -> Result<Value, ToolError> {
        let args: StyleSchemaArgs = serde_json::from_value(args)?;
        let panel = self.agent_panel(args.panel.as_deref())?;
        let viewer_config =
            get_viewer_config(&panel.session, &panel.renderer, &self.presentation).await?;

        let columns_config = serde_json::to_value(&viewer_config.columns_config)?;
        let plugin_schema = {
            let view_config = panel.session.get_view_config();
            get_plugin_config_schema(&panel.renderer, &view_config).ok()
        };

        let column_schema = match &args.column {
            None => None,
            Some(column) => {
                let metadata = panel.session.metadata();
                if metadata.get_column_view_type(column).is_none() {
                    let view_config = panel.session.get_view_config();
                    let active = view_config
                        .columns
                        .iter()
                        .flatten()
                        .cloned()
                        .collect::<Vec<_>>();

                    return Err(ToolError(format!(
                        "Unknown or inactive column `{column}` - active columns: {active:?}"
                    )));
                }

                let current = columns_config.get(column).and_then(|x| x.as_object());
                let view_config = panel.session.get_view_config();
                Some(
                    get_column_config_schema(
                        &panel.renderer,
                        &view_config,
                        &metadata,
                        column,
                        current,
                        None,
                    )
                    .ok(),
                )
            },
        };

        let mut out = json!({
            "plugin": viewer_config.plugin,
            "plugin_config": plugin_schema.as_ref().map(schema_object),
        });

        if let Some(column) = &args.column {
            out["column"] = json!(column);
            out["column_config"] = json!(column_schema.flatten().as_ref().map(schema_object));
        }

        if out["plugin_config"].is_null() && out["column_config"].is_null() {
            out["note"] = json!(
                "The active plugin declares no style schema; `plugin_config` and `columns_config` \
                 keys pass through unvalidated."
            );
        }

        Ok(out)
    }

    async fn tool_search_docs(&self, ctx: &ToolCtx, args: Value) -> Result<Value, ToolError> {
        let args: SearchDocsArgs = serde_json::from_value(args)?;
        let Some(bundle) = ctx.bundle.as_ref() else {
            return Ok(json!({
                "results": [],
                "hint": "No documentation is configured for this viewer",
            }));
        };

        match bundle.as_ref() {
            Err(err) => Err(ToolError(format!("Docs failed to load: {err}"))),
            Ok(bundle) => {
                let results = bundle
                    .index
                    .search(&args.query, args.limit.unwrap_or(SEARCH_DOCS_LIMIT))
                    .iter()
                    .map(|chunk| {
                        json!({
                            "title": chunk.title,
                            "path": chunk.path,
                            "text": chunk.text,
                        })
                    })
                    .collect::<Vec<_>>();

                if results.is_empty() {
                    Ok(json!({
                        "results": [],
                        "hint": "No matches - retry with different, more specific keywords",
                    }))
                } else {
                    Ok(json!({ "results": results }))
                }
            },
        }
    }
}

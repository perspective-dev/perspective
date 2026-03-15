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

//! Value-semantic state types suitable for use as Yew `Properties`.
//!
//! These types are the target of the singleton-to-props refactoring.  They
//! carry only plain, comparable data — no `Rc<RefCell<...>>` wrappers, no
//! `PubSub` channels, no interior mutability.  The root component owns these
//! values and passes them down through the component tree; child components
//! receive them as props and rely on Yew's normal diffing to decide when to
//! re-render.

use std::rc::Rc;

use perspective_client::config::*;

use crate::js::plugin::ViewConfigRequirements;
use crate::presentation::OpenColumnSettings;
use crate::session::column_defaults_update::ViewConfigUpdateExt;
use crate::session::drag_drop_update::ViewConfigExt as DragDropExt;
use crate::session::replace_expression_update::ViewConfigExt as ReplaceExprExt;
use crate::session::{SessionMetadata, TableErrorState, ViewStats};
use crate::utils::*;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/// Value-semantic snapshot of the session state read by the root component.
///
/// This does not hold any async handles (`Table`, `View`, `Client`).  Those
/// live inside `Session(Rc<SessionHandle>)` and are accessed directly when
/// needed by async tasks.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct SessionProps {
    /// The current `ViewConfig` driving the active `View`.
    pub config: ViewConfig,

    /// Row/column statistics for the status bar.
    pub stats: Option<ViewStats>,

    /// `true` if a `Table` has been loaded into this session.
    pub has_table: bool,

    /// Non-`None` when the session is in an error state (e.g. table load
    /// failure or client disconnection).
    pub error: Option<TableErrorState>,

    /// Optional title string set via `restore({ title: "..." })`.
    pub title: Option<String>,

    /// Cloned snapshot of `SessionMetadata` at the time of the last
    /// `to_props()` call.  Components read column types, features,
    /// expression info, etc. from this snapshot instead of borrowing
    /// `Session`'s `RefCell` directly.
    pub metadata: SessionMetadata,
}

impl SessionProps {
    pub fn is_errored(&self) -> bool {
        self.error.is_some()
    }

    pub fn is_reconnect(&self) -> bool {
        self.error
            .as_ref()
            .map(|x| x.is_reconnect())
            .unwrap_or_default()
    }

    pub fn is_column_active(&self, name: &str) -> bool {
        self.config.columns.iter().any(|maybe_col| {
            maybe_col
                .as_ref()
                .map(|col| col == name)
                .unwrap_or_default()
        }) || self.config.group_by.iter().any(|col| col == name)
            || self.config.split_by.iter().any(|col| col == name)
            || self.config.filter.iter().any(|col| col.column() == name)
            || self.config.sort.iter().any(|col| col.0 == name)
    }

    pub fn is_column_expression_in_use(&self, name: &str) -> bool {
        self.config.is_column_expression_in_use(name)
    }

    fn all_columns(&self) -> Vec<String> {
        self.metadata
            .get_table_columns()
            .into_iter()
            .flatten()
            .cloned()
            .collect()
    }

    pub fn create_drag_drop_update(
        &self,
        column: String,
        index: usize,
        drop: DragTarget,
        drag: DragEffect,
        requirements: &ViewConfigRequirements,
    ) -> ViewConfigUpdate {
        let col_type = self
            .metadata
            .get_column_table_type(column.as_str())
            .unwrap();

        self.config.create_drag_drop_update(
            column,
            col_type,
            index,
            drop,
            drag,
            requirements,
            self.metadata.get_features().unwrap(),
        )
    }

    pub fn set_update_column_defaults(
        &self,
        config_update: &mut ViewConfigUpdate,
        requirements: &ViewConfigRequirements,
    ) {
        config_update.set_update_column_defaults(
            &self.metadata,
            &self.all_columns().into_iter().map(Some).collect::<Vec<_>>(),
            requirements,
        )
    }

    pub fn create_replace_expression_update(
        &self,
        old_expr_name: &str,
        new_expr: &Expression<'static>,
    ) -> ViewConfigUpdate {
        let old_expr_val = self
            .metadata
            .get_expression_by_alias(old_expr_name)
            .unwrap();

        let old_expr = Expression::new(Some(old_expr_name.into()), old_expr_val.into());
        self.config
            .create_replace_expression_update(&old_expr, new_expr)
    }

    pub fn create_rename_expression_update(
        &self,
        old_expr_name: String,
        new_expr_name: Option<String>,
    ) -> ViewConfigUpdate {
        let old_expr_val = self
            .metadata
            .get_expression_by_alias(&old_expr_name)
            .unwrap();
        let old_expr = Expression::new(Some(old_expr_name.into()), old_expr_val.clone().into());
        let new_expr = Expression::new(new_expr_name.map(|n| n.into()), old_expr_val.into());
        self.config
            .create_replace_expression_update(&old_expr, &new_expr)
    }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/// Value-semantic snapshot of the renderer state read by components.
///
/// The actual plugin JS objects, draw lock, and render timer live in
/// `RendererEngine` and are not passed as props.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct RendererProps {
    /// Name of the currently active plugin (e.g. `"Datagrid"`).
    pub plugin_name: Option<String>,

    /// Column count / config requirements reported by the active plugin.
    pub requirements: ViewConfigRequirements,

    /// Most recently emitted render-limits tuple, if any.
    pub render_limits: Option<(bool, (usize, usize, Option<usize>, Option<usize>))>,

    /// Names of all registered plugins, in registration order.
    pub available_plugins: Rc<Vec<String>>,
}

// ---------------------------------------------------------------------------
// DragDrop
// ---------------------------------------------------------------------------

/// Value-semantic snapshot of the drag/drop state threaded through the
/// component tree for visual feedback (drag-highlight CSS classes).
#[derive(Clone, Debug, PartialEq, Default)]
pub struct DragDropProps {
    /// Column name currently being dragged, if a drag is in progress.
    pub column: Option<String>,
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/// Value-semantic snapshot of the presentation/UI state used by the root
/// component to drive `is_settings_open`, `selected_theme`, and
/// `available_themes` into child components via plain props.
///
/// The `HtmlElement` handle, async theme-detection machinery, column-settings
/// state, and per-column config live in `PresentationEngine` and are not
/// passed as props.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct PresentationProps {
    /// Whether the settings panel is currently open.
    pub is_settings_open: bool,

    /// Detected theme names, in discovery order.
    pub available_themes: Rc<Vec<String>>,

    /// The currently selected theme name, if any theme is active.
    pub selected_theme: Option<String>,

    /// Snapshot of the currently opened column-settings sidebar state.
    pub open_column_settings: OpenColumnSettings,

    /// Whether this viewer is hosted inside a `<perspective-workspace>`.
    pub is_workspace: bool,
}

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

use perspective_client::config::*;

use crate::config::PluginStaticConfig;
use crate::session::column_defaults_update::ViewConfigUpdateExt;
use crate::session::drag_drop_update::ViewConfigExt as DragDropExt;
use crate::session::metadata::SessionMetadataRc;
use crate::session::replace_expression_update::ViewConfigExt as ReplaceExprExt;
use crate::session::{ColumnStats, TableErrorState, ViewStats};
use crate::utils::*;

#[derive(Clone, Debug, PartialEq, Default)]
pub enum TableLoadState {
    #[default]
    Loaded,
    Loading,
}

/// Value-semantic snapshot of the session state read by the root component.
///
/// This does not hold any async handles (`Table`, `View`, `Client`).  Those
/// live inside `Session(Rc<SessionHandle>)` and are accessed directly when
/// needed by async tasks.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct SessionProps {
    /// The current `ViewConfig` driving the active `View`.
    pub config: PtrEqRc<ViewConfig>,

    /// Row/column statistics for the status bar.
    pub stats: Option<ViewStats>,

    /// `true` if a `Table` has been loaded into this session.
    pub has_table: Option<TableLoadState>,

    /// Non-`None` when the session is in an error state (e.g. table load
    /// failure or client disconnection).
    pub error: Option<TableErrorState>,

    /// Optional title string set via `restore({ title: "..." })`.
    pub title: Option<String>,

    /// Cloned snapshot of `SessionMetadata` at the time of the last
    /// `to_props()` call.  Components read column types, features,
    /// expression info, etc. from this snapshot instead of borrowing
    /// `Session`'s `RefCell` directly.
    pub metadata: SessionMetadataRc,

    /// Snapshot of the per-column stats cache (currently `abs_max`
    /// only), populated lazily by the `fetch_column_abs_max` task.
    /// Cleared whenever `view_config` changes; rebuilt on each
    /// `to_props()` call when the root component re-renders in
    /// response to `column_stats_changed`.
    pub column_stats: PtrEqRc<HashMap<String, ColumnStats>>,
}

impl SessionProps {
    /// Returns `true` if the session is in any error state.
    pub fn is_errored(&self) -> bool {
        self.error.is_some()
    }

    /// Returns `true` if the error state represents a reconnectable
    /// disconnection rather than a fatal failure.
    pub fn is_reconnect(&self) -> bool {
        self.error
            .as_ref()
            .map(|x| x.is_reconnect())
            .unwrap_or_default()
    }

    /// Returns `true` if `name` appears in any active config slot (columns,
    /// group-by, split-by, filter, or sort).
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

    /// Returns `true` if the expression column `name` is referenced by any
    /// part of the current view config.
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

    /// Build a [`ViewConfigUpdate`] that applies a drag-drop of `column`
    /// into the given `drop` target at `index`.
    pub fn create_drag_drop_update(
        &self,
        column: String,
        index: usize,
        drop: DragTarget,
        drag: DragEffect,
        config_static: &PluginStaticConfig,
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
            config_static,
            self.metadata.get_features().unwrap(),
        )
    }

    /// Populate `config_update` with default column settings (aggregates,
    /// etc.) based on the current metadata and plugin requirements.
    pub fn set_update_column_defaults(
        &self,
        config_update: &mut ViewConfigUpdate,
        config_static: &PluginStaticConfig,
    ) {
        config_update.set_update_column_defaults(
            &self.metadata,
            &self.all_columns().into_iter().map(Some).collect::<Vec<_>>(),
            config_static,
        )
    }

    /// Build a [`ViewConfigUpdate`] that replaces `old_expr_name` with
    /// `new_expr` in every config slot where it appears.
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

    /// Build a [`ViewConfigUpdate`] that renames `old_expr_name` to
    /// `new_expr_name` (or clears the alias if `None`), keeping the
    /// expression body unchanged.
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

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

use std::iter::IntoIterator;

use itertools::Itertools;
use perspective_client::config::*;

use super::metadata::*;
use crate::config::PluginStaticConfig;

#[extend::ext]
pub impl ViewConfigUpdate {
    /// Coerce this update's `group_rollup_mode` to one the plugin accepts
    /// (`PluginStaticConfig::group_rollup_modes`, feature-filtered). An
    /// absent mode counts as `Rollup` for the acceptance check, so a plugin
    /// that only renders `flat` (Treemap / Sunburst) gets it stamped even
    /// when the update never mentions rollup at all.
    ///
    /// Split out of [`Self::set_update_column_defaults`] so same-plugin
    /// restores can enforce the mode WITHOUT the column-defaulting below —
    /// that path must not touch `columns` (it would drop non-numeric color
    /// slots from a partial restore).
    fn set_update_rollup_defaults(
        &mut self,
        metadata: &SessionMetadata,
        config_static: &PluginStaticConfig,
    ) {
        let rollup_features = metadata
            .get_features()
            .map(|x| x.get_group_rollup_modes())
            .unwrap_or_default();

        let group_rollups = config_static.get_group_rollups(&rollup_features);
        if !group_rollups.contains(
            self.group_rollup_mode
                .as_ref()
                .unwrap_or(&GroupRollupMode::Rollup),
        ) {
            self.group_rollup_mode = group_rollups.first().cloned();
            tracing::debug!(
                "Setting plugin-advised rollup mode {:?}",
                self.group_rollup_mode
            );
        }
    }

    /// Appends additional columns to the `columns` field of this
    /// `ViewConfigUpdate` by picking appropriate new columns from the
    /// `SessionMetadata`, given the necessary column requirements of the
    /// plugin provided by a `PluginStaticConfig`. For example, an "X/Y
    /// Scatter" chart needs a minimum of 2 numeric columns to be
    /// drawable.
    fn set_update_column_defaults(
        &mut self,
        metadata: &SessionMetadata,
        columns: &[Option<String>],
        config_static: &PluginStaticConfig,
    ) {
        self.set_update_rollup_defaults(metadata, config_static);

        if let (None, Some(min_cols)) = (&self.columns, config_static.min_config_columns) {
            let names_len = config_static.config_column_names.len();
            // first try to take 2 numeric columns from existing config
            let numeric_config_columns = columns
                .iter()
                .flatten()
                .filter(|x| {
                    matches!(
                        metadata.get_column_table_type(x),
                        Some(ColumnType::Float | ColumnType::Integer)
                    )
                })
                .take(min_cols)
                .cloned()
                .map(Some)
                .collect::<Vec<_>>();

            if numeric_config_columns.len() == min_cols {
                self.columns = Some(
                    numeric_config_columns
                        .into_iter()
                        .pad_using(names_len, |_| None)
                        .collect::<Vec<_>>(),
                );
            } else {
                // Append numeric columns from all columns and try again
                let config_columns = numeric_config_columns
                    .clone()
                    .into_iter()
                    .chain(
                        metadata
                            .get_table_columns()
                            .into_iter()
                            .flatten()
                            .filter(|x| {
                                !numeric_config_columns
                                    .iter()
                                    .any(|y| y.as_ref() == Some(*x))
                            })
                            .filter(|x| {
                                matches!(
                                    metadata.get_column_table_type(x),
                                    Some(ColumnType::Float | ColumnType::Integer)
                                )
                            })
                            .cloned()
                            .map(Some),
                    )
                    .take(min_cols)
                    .collect::<Vec<_>>();

                if config_columns.len() == min_cols {
                    self.columns = Some(
                        config_columns
                            .into_iter()
                            .pad_using(names_len, |_| None)
                            .collect::<Vec<_>>(),
                    );
                } else {
                    self.columns = Some(
                        metadata
                            .get_table_columns()
                            .into_iter()
                            .flatten()
                            .take(min_cols)
                            .cloned()
                            .map(Some)
                            .collect::<Vec<_>>(),
                    );
                }
            }
        } else if self.columns.is_none() {
            let mut columns = columns.to_vec();
            let initial_len = self.columns.as_ref().map(|x| x.len()).unwrap_or_default();
            if let Some(last_filled) = columns.iter().rposition(|x| x.is_some()) {
                columns.truncate(last_filled + 1);
                if !config_static.config_column_names.is_empty() {
                    let names_len = config_static.config_column_names.len();
                    columns = columns
                        .into_iter()
                        .enumerate()
                        .filter(|(idx, x)| *idx < names_len || x.is_some())
                        .map(|(_, x)| x)
                        .pad_using(names_len, |_| None)
                        .collect::<Vec<_>>();
                } else {
                    columns = columns
                        .into_iter()
                        .filter(|x| x.is_some())
                        .collect::<Vec<_>>();
                }
            }

            if initial_len != columns.len() {
                self.columns = Some(columns);
            }
        }
    }
}

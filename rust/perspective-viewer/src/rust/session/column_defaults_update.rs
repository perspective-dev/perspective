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
use perspective_client::ColumnType;

use super::metadata::*;
use crate::config::*;
use crate::js::plugin::*;

#[extend::ext]
pub impl ViewConfigUpdate {
    /// Appends additional columns to the `columns` field of this
    /// `ViewConfigUpdate` by picking appropriate new columns from the
    /// `SessionMetadata`, give the necessary column requirements of the plugin
    /// provided by a `ViewConfigRequirements`.  For example, an "X/Y Scatter"
    /// chart needs a minimum of 2 numeric columns to be drawable.
    fn set_update_column_defaults(
        &mut self,
        metadata: &SessionMetadata,
        columns: &[Option<String>],
        requirements: &ViewConfigRequirements,
    ) {
        if let (
            None,
            ViewConfigRequirements {
                min: Some(min_cols),
                names,
                ..
            },
        ) = (&self.columns, &requirements)
        {
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
                .take(*min_cols)
                .cloned()
                .map(Some)
                .collect::<Vec<_>>();

            if numeric_config_columns.len() == *min_cols {
                self.columns = Some(
                    numeric_config_columns
                        .into_iter()
                        .pad_using(names.as_ref().map_or(0, |x| x.len()), |_| None)
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
                                    .any(|y| y.as_ref().map_or(false, |z| z == *x))
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
                    .take(*min_cols)
                    .collect::<Vec<_>>();

                if config_columns.len() == *min_cols {
                    self.columns = Some(
                        config_columns
                            .into_iter()
                            .pad_using(names.as_ref().map_or(0, |x| x.len()), |_| None)
                            .collect::<Vec<_>>(),
                    );
                } else {
                    self.columns = Some(
                        metadata
                            .get_table_columns()
                            .into_iter()
                            .flatten()
                            .take(*min_cols)
                            .cloned()
                            .map(Some)
                            .collect::<Vec<_>>(),
                    );
                }
            }
        } else if self.columns.is_none() {
            let mut columns = columns.to_vec();
            let initial_len = columns.len();
            if let Some(last_filled) = columns.iter().rposition(|x| x.is_some()) {
                columns.truncate(last_filled + 1);
                if let ViewConfigRequirements {
                    names: Some(names), ..
                } = &requirements
                {
                    columns = columns
                        .into_iter()
                        .enumerate()
                        .filter(|(idx, x)| *idx < names.len() || x.is_some())
                        .map(|(_, x)| x)
                        .pad_using(names.len(), |_| None)
                        .collect::<Vec<_>>();
                } else {
                    columns = columns
                        .into_iter()
                        .filter(|x| x.is_some())
                        .collect::<Vec<_>>();
                }

                if initial_len != columns.len() {
                    self.columns = Some(columns);
                }
            }
        }
    }
}

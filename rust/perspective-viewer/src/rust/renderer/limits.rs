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

use perspective_js::utils::ApiError;

use crate::config::PluginStaticConfig;

/// The row/column limits computed for the current view and plugin
/// configuration.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RenderLimits {
    /// Whether this render was an incremental update (`true`) or a full
    /// draw (`false`).
    pub is_update: bool,
    /// Total number of columns in the view.
    pub num_cols: usize,
    /// Total number of rows in the view.
    pub num_rows: usize,
    /// Maximum number of columns the plugin will render, if capped.
    pub max_cols: Option<usize>,
    /// Maximum number of rows the plugin will render, if capped.
    pub max_rows: Option<usize>,
}

/// Compute the row/column caps for `view` against the plugin's static
/// limits. `render_warning` is the renderer-state flag controlling
/// whether the warning is currently armed; when `false`, an oversized
/// view renders uncapped (the user has dismissed the warning).
pub async fn get_row_and_col_limits(
    view: &perspective_client::View,
    config: &PluginStaticConfig,
    render_warning: bool,
) -> Result<RenderLimits, ApiError> {
    let dimensions = view.dimensions().await?;
    let num_cols = dimensions.num_view_columns as usize;
    let num_rows = dimensions.num_view_rows as usize;
    match (config.max_columns, render_warning) {
        (Some(_), false) => Ok(RenderLimits {
            is_update: false,
            num_cols,
            num_rows,
            max_cols: None,
            max_rows: None,
        }),
        (max_columns, _) => {
            let schema = view.schema().await?;
            let keys = schema.keys();
            let num_schema_columns = std::cmp::max(1, keys.len() as usize);
            let max_cols = max_columns.and_then(|max_columns| {
                let column_group_diff = max_columns % num_schema_columns;
                let column_limit = max_columns + column_group_diff;
                if column_limit < num_cols {
                    Some(column_limit)
                } else {
                    None
                }
            });

            let max_rows = config.max_cells.map(|max_cells| {
                match max_cols {
                    Some(max_cols) => max_cells as f64 / max_cols as f64,
                    None => max_cells as f64 / num_cols as f64,
                }
                .ceil() as usize
            });

            Ok(RenderLimits {
                is_update: false,
                num_cols,
                num_rows,
                max_cols,
                max_rows,
            })
        },
    }
}

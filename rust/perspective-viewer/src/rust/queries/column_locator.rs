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

use perspective_client::config::ViewConfig;

use crate::presentation::{ColumnLocator, OpenColumnSettings};
use crate::renderer::Renderer;
use crate::session::SessionMetadata;

/// Returns a [`ColumnLocator`] for a given column name, or [`None`] if no
/// such column exists.
pub fn get_column_locator(
    metadata: &SessionMetadata,
    name: Option<String>,
) -> Option<ColumnLocator> {
    name.and_then(|name| {
        if metadata.is_column_expression(&name) {
            Some(ColumnLocator::Expression(name))
        } else {
            metadata.get_table_columns().and_then(|x| {
                x.iter()
                    .find_map(|n| (n == &name).then_some(ColumnLocator::Table(name.clone())))
            })
        }
    })
}

/// Gets a [`ColumnLocator`] for the current UI's column settings state,
/// or [`None`] if it is not currently active.
///
/// Table columns only have a useful sidebar (the Style tab)
/// when they're in `view_config.columns`.
pub fn get_current_column_locator(
    open_column_settings: &OpenColumnSettings,
    renderer: &Renderer,
    view_config: &ViewConfig,
    _metadata: &SessionMetadata,
) -> Option<ColumnLocator> {
    open_column_settings
        .locator
        .clone()
        .filter(|locator| match locator {
            ColumnLocator::Table(_name) => {
                locator
                    .name()
                    .map(|name| {
                        view_config.columns.iter().any(|maybe_col| {
                            maybe_col
                                .as_ref()
                                .map(|col| col == name)
                                .unwrap_or_default()

                            //     }) || view_config.group_by.iter().any(|col|
                            // col == name)         ||
                            // view_config.split_by.iter().any(|col| col ==
                            // name)         ||
                            // view_config.filter.iter().any(|col| col.column()
                            // == name)         ||
                            // view_config.sort.iter().any(|col| &col.0 == name)
                            // })
                        })
                    })
                    .unwrap_or_default()
                    && renderer.can_render_column_styles()
            },
            _ => true,
        })
}

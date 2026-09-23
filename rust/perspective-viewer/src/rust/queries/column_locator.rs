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

use perspective_client::config::{ColumnType, ViewConfig};

use crate::presentation::{ColumnLocator, ColumnSettingsTarget, OpenColumnSettings};
use crate::renderer::Renderer;
use crate::session::SessionMetadata;

/// Classify a column name against the session, config-first: the view
/// config is the commit of record for expressions and windows.
pub fn classify_column(
    name: &str,
    view_config: &ViewConfig,
    metadata: &SessionMetadata,
) -> Option<ColumnLocator> {
    if view_config.windows.contains_key(name) || metadata.is_column_window(name) {
        Some(ColumnLocator::Window(name.to_owned()))
    } else if view_config.expressions.contains_key(name) || metadata.is_column_expression(name) {
        Some(ColumnLocator::Expression(name.to_owned()))
    } else if metadata
        .get_table_columns()
        .is_some_and(|cols| cols.iter().any(|col| col == name))
    {
        Some(ColumnLocator::Table(name.to_owned()))
    } else {
        None
    }
}

/// Whether `name` is one of `view_config`'s pivots, whose own raw values a
/// plugin draws as a header label or axis tick and therefore formats with its
/// TABLE type rather than an aggregate's view type.
pub fn is_pivot_column(name: &str, view_config: &ViewConfig) -> bool {
    view_config.group_by.iter().any(|col| col == name)
        || view_config.split_by.iter().any(|col| col == name)
}

/// Whether `name` is configured AS a pivot: a pivot that is also in `columns`
/// is configured as that aggregate instead, so its pivot copy is not
/// separately configurable.
pub fn is_pivot_only_column(name: &str, view_config: &ViewConfig) -> bool {
    is_pivot_column(name, view_config)
        && !view_config
            .columns
            .iter()
            .any(|col| col.as_deref() == Some(name))
}

/// Whether the active plugin offers `name` any column config, gating every
/// affordance that opens the Style tab.
// TODO This hardcodes the set of types a plugin offers a pivot a format control
// for, instead of asking it. `get_column_config_schema` answers exactly
// (`!schema.leaf_fields().is_empty()`) but costs a plugin call per pivot pill
// per render; switch to it if pills ever outgrow a handful, or if a plugin's
// pivot controls stop being format-only.
pub fn has_column_config(
    name: &str,
    view_config: &ViewConfig,
    metadata: &SessionMetadata,
    renderer: &Renderer,
) -> bool {
    if !renderer.can_render_column_styles() {
        return false;
    }

    if view_config
        .columns
        .iter()
        .any(|col| col.as_deref() == Some(name))
    {
        return true;
    }

    is_pivot_column(name, view_config)
        && matches!(
            metadata.get_column_table_type(name),
            Some(ColumnType::Integer | ColumnType::Float | ColumnType::Date | ColumnType::Datetime)
        )
}

/// Gets a [`ColumnLocator`] for the current UI's column settings state,
/// or [`None`] if it is not currently active.
///
/// Table columns only have a useful sidebar (the Style tab) when they're in
/// `view_config.columns` or are a pivot.
pub fn get_current_column_locator(
    open_column_settings: &OpenColumnSettings,
    renderer: &Renderer,
    view_config: &ViewConfig,
    metadata: &SessionMetadata,
) -> Option<ColumnLocator> {
    match open_column_settings.target.as_ref()? {
        ColumnSettingsTarget::NewExpression => Some(ColumnLocator::NewExpression),
        ColumnSettingsTarget::Column(name) => {
            let locator = classify_column(name, view_config, metadata)?;
            match locator {
                ColumnLocator::Table(_) => {
                    has_column_config(name, view_config, metadata, renderer).then_some(locator)
                },
                locator => Some(locator),
            }
        },
    }
}

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

/// Gets a [`ColumnLocator`] for the current UI's column settings state,
/// or [`None`] if it is not currently active.
///
/// Table columns only have a useful sidebar (the Style tab)
/// when they're in `view_config.columns`.
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
                    let in_columns = view_config.columns.iter().any(|maybe_col| {
                        maybe_col
                            .as_ref()
                            .map(|col| col == name)
                            .unwrap_or_default()
                    });

                    (in_columns && renderer.can_render_column_styles()).then_some(locator)
                },
                locator => Some(locator),
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use perspective_client::config::Expressions;

    use super::*;

    fn config_with_expression(name: &str, expr: &str) -> ViewConfig {
        ViewConfig {
            expressions: Expressions(HashMap::from([(name.to_owned(), expr.to_owned())])),
            ..ViewConfig::default()
        }
    }

    #[test]
    fn classifies_from_the_config_before_metadata_catches_up() {
        let config = config_with_expression("x", "1 + 1");
        let metadata = SessionMetadata::default();
        assert_eq!(
            classify_column("x", &config, &metadata),
            Some(ColumnLocator::Expression("x".to_owned()))
        );
        assert_eq!(classify_column("nope", &config, &metadata), None);
    }

    #[test]
    fn unnamed_expressions_are_keyed_by_their_text() {
        let config = config_with_expression("\"Sales\" + 1", "\"Sales\" + 1");
        let metadata = SessionMetadata::default();
        assert_eq!(
            classify_column("\"Sales\" + 1", &config, &metadata),
            Some(ColumnLocator::Expression("\"Sales\" + 1".to_owned()))
        );
    }
}

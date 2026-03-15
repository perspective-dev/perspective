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

use super::HasSession;
use super::plugin_column_styles::can_render_column_styles;
use crate::presentation::{ColumnLocator, OpenColumnSettings};
use crate::renderer::Renderer;
use crate::session::SessionMetadata;
use crate::tasks::{HasPresentation, HasRenderer, PluginColumnStyles};

/// Returns the column name for a locator, generating a default for new
/// expressions.
pub fn locator_name_or_default(
    metadata: &SessionMetadata,
    locator: &ColumnLocator,
) -> String {
    match locator {
        ColumnLocator::Table(s) | ColumnLocator::Expression(s) => s.clone(),
        ColumnLocator::NewExpression => metadata.make_new_column_name(None),
    }
}

/// Returns the view type for a locator's column, if available.
pub fn locator_view_type(
    metadata: &SessionMetadata,
    locator: &ColumnLocator,
) -> Option<ColumnType> {
    let name = locator.name().cloned().unwrap_or_default();
    metadata.get_column_view_type(name.as_str())
}

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
pub fn get_current_column_locator(
    open_column_settings: &OpenColumnSettings,
    renderer: &Renderer,
    view_config: &ViewConfig,
    metadata: &SessionMetadata,
) -> Option<ColumnLocator> {
    open_column_settings
        .locator
        .clone()
        .filter(|locator| match locator {
            ColumnLocator::Table(name) => {
                locator
                    .name()
                    .map(|name| {
                        view_config.columns.iter().any(|maybe_col| {
                            maybe_col.as_ref().map(|col| col == name).unwrap_or_default()
                        }) || view_config.group_by.iter().any(|col| col == name)
                            || view_config.split_by.iter().any(|col| col == name)
                            || view_config.filter.iter().any(|col| col.column() == name)
                            || view_config.sort.iter().any(|col| &col.0 == name)
                    })
                    .unwrap_or_default()
                    && can_render_column_styles(renderer, view_config, metadata, name)
                        .unwrap_or_default()
            },
            _ => true,
        })
}

/// Trait facade — delegates to standalone functions above.
pub trait ColumnLocatorExt: HasSession {
    fn locator_name_or_default(&self, locator: &ColumnLocator) -> String {
        locator_name_or_default(&self.session().metadata(), locator)
    }

    fn is_locator_active(&self, locator: &ColumnLocator) -> bool {
        locator
            .name()
            .map(|name| self.session().is_column_active(name))
            .unwrap_or_default()
    }

    fn locator_view_type(&self, locator: &ColumnLocator) -> Option<ColumnType> {
        locator_view_type(&self.session().metadata(), locator)
    }

    fn get_column_locator(&self, name: Option<String>) -> Option<ColumnLocator> {
        get_column_locator(&self.session().metadata(), name)
    }
}

impl<T: HasSession> ColumnLocatorExt for T {}

/// Trait facade for `get_current_column_locator`.
pub trait ColumnLocatorCurrentExt:
    HasPresentation + HasRenderer + HasSession + PluginColumnStyles
{
    fn get_current_column_locator(&self) -> Option<ColumnLocator> {
        get_current_column_locator(
            &self.presentation().get_open_column_settings(),
            self.renderer(),
            &self.session().get_view_config(),
            &self.session().metadata(),
        )
    }
}

impl<T: HasPresentation + HasRenderer + HasSession + PluginColumnStyles> ColumnLocatorCurrentExt
    for T
{
}

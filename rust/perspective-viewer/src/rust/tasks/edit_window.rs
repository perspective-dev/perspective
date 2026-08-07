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

use perspective_client::clone;
use perspective_client::config::{Filter, ViewConfigUpdate, WindowSpec};

use super::apply_and_render;
use crate::presentation::{ColumnLocator, ColumnSettingsTab, OpenColumnSettings, Presentation};
use crate::renderer::Renderer;
use crate::session::Session;
use crate::*;

fn reopen(presentation: &Presentation, name: String) {
    presentation.set_open_column_settings(Some(OpenColumnSettings {
        locator: Some(ColumnLocator::Window(name)),
        tab: Some(ColumnSettingsTab::Window),
    }));
}

/// Insert `spec` into the session's windows as `name` (replacing any spec
/// under the same key) and re-render. After the render completes, opens the
/// column-settings drawer on the new window column.
pub fn save_window(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    name: String,
    spec: WindowSpec,
) -> ApiResult<()> {
    let presentation = presentation.clone();
    let task = {
        let mut windows = session.get_view_config().windows.clone();
        windows.insert(name.clone(), spec);
        apply_and_render(session, renderer, ViewConfigUpdate {
            windows: Some(windows),
            ..Default::default()
        })
    }?;

    ApiFuture::spawn(async move {
        task.await?;
        reopen(&presentation, name);
        Ok(())
    });

    Ok(())
}

/// Replace the window at `old_name` with `spec` and re-render. A rename
/// rewrites every config reference to the old name - `columns`, `group_by`,
/// `split_by`, `sort`, `filter` and the `aggregates` key - so usage follows
/// the column, as expression renames do.
pub fn update_window(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    old_name: String,
    new_name: String,
    spec: WindowSpec,
) {
    clone!(session, renderer, presentation);
    ApiFuture::spawn(async move {
        let update = {
            let config = session.get_view_config().clone();
            let mut windows = config.windows.clone();
            windows.remove(&old_name);
            windows.insert(new_name.clone(), spec);

            let rename = |col: &String| -> String {
                if col == &old_name {
                    new_name.clone()
                } else {
                    col.clone()
                }
            };

            let mut update = ViewConfigUpdate {
                windows: Some(windows),
                ..Default::default()
            };

            if old_name != new_name {
                update.columns = Some(
                    config
                        .columns
                        .iter()
                        .map(|col| col.as_ref().map(rename))
                        .collect(),
                );
                update.group_by = Some(config.group_by.iter().map(&rename).collect());
                update.split_by = Some(config.split_by.iter().map(&rename).collect());
                update.sort = Some(
                    config
                        .sort
                        .iter()
                        .map(|sort| {
                            let mut sort = sort.clone();
                            sort.0 = rename(&sort.0);
                            sort
                        })
                        .collect(),
                );
                update.filter = Some(
                    config
                        .filter
                        .iter()
                        .map(|filter| {
                            if filter.column() == old_name {
                                Filter::new(new_name.as_str(), filter.op(), filter.term().clone())
                            } else {
                                filter.clone()
                            }
                        })
                        .collect(),
                );
                update.aggregates = Some(
                    config
                        .aggregates
                        .iter()
                        .map(|(col, agg)| (rename(col), agg.clone()))
                        .collect(),
                );
            }

            update
        };

        apply_and_render(&session, &renderer, update)?.await?;
        reopen(&presentation, new_name);
        Ok(())
    });
}

/// Remove the window named `name` from the session and re-render.
pub fn delete_window(session: &Session, renderer: &Renderer, name: &str) -> ApiResult<()> {
    let mut windows = session.get_view_config().windows.clone();
    windows.remove(name);
    let config = ViewConfigUpdate {
        windows: Some(windows),
        ..ViewConfigUpdate::default()
    };

    let task = apply_and_render(session, renderer, config)?;
    ApiFuture::spawn(task);
    Ok(())
}

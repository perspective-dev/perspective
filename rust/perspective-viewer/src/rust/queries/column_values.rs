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

use perspective_client::config::ViewConfigUpdate;
use perspective_client::{ViewWindow, clone};
use perspective_js::utils::{ApiError, ApiFuture};

use crate::session::Session;

/// Get all unique column values for a given column name.
///
/// Use the `.to_csv()` method, as I suspected copying this large string
/// once was more efficient than copying many smaller strings, and
/// string copying shows up frequently when doing performance analysis.
///
/// TODO Does not work with expressions yet.
pub async fn get_column_values(session: &Session, column: String) -> Result<Vec<String>, ApiError> {
    let expressions = Some(session.get_view_config().expressions.clone());
    let config = ViewConfigUpdate {
        group_by: Some(vec![column]),
        columns: Some(vec![]),
        expressions,
        ..ViewConfigUpdate::default()
    };

    let table = session
        .get_table()
        .ok_or_else(|| ApiError::from("No table set"))?;
    let view = table.view(Some(config.clone())).await?;
    let csv = view.to_csv(ViewWindow::default()).await?;

    clone!(view);
    ApiFuture::spawn(async move {
        view.delete().await?;
        Ok(())
    });

    let res = csv
        .lines()
        .map(|val| {
            if val.starts_with('\"') && val.ends_with('\"') {
                (val[1..val.len() - 1]).to_owned()
            } else {
                val.to_owned()
            }
        })
        .skip(2)
        .collect::<Vec<String>>();
    Ok(res)
}

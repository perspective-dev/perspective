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

use perspective_client::{DeleteOptions, JoinOptions, JoinType};
use perspective_js::utils::*;

use crate::workspace::{JoinTable, Workspace};

/// The definition of a join `Table` to create on one `Client`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct JoinSpec {
    pub left: String,
    pub right: String,
    pub on: String,
    pub right_on: Option<String>,
    pub join_type: Option<JoinType>,
    pub name: Option<String>,
}

/// Create a session-only join `Table` on the `Client` named `client`.
pub async fn create_join(workspace: &Workspace, client: &str, spec: JoinSpec) -> ApiResult<()> {
    let handle = workspace
        .clients()
        .into_iter()
        .find(|x| x.get_name() == client)
        .ok_or_else(|| format!("No client named \"{client}\""))?;

    let options = JoinOptions {
        join_type: spec.join_type,
        name: spec.name,
        right_on: spec.right_on,
    };

    let table = handle
        .join(
            spec.left.clone().into(),
            spec.right.clone().into(),
            &spec.on,
            options,
        )
        .await?;

    workspace.register_join(table.get_name().to_owned(), JoinTable {
        client: client.to_owned(),
        left: spec.left,
        right: spec.right,
        table,
    });

    Ok(())
}

/// Delete a join `Table` that nothing consumes.
pub async fn delete_join(workspace: &Workspace, name: &str) -> ApiResult<()> {
    let consumers = workspace.table_consumers(name);
    if consumers > 0 {
        return Err(format!("`{name}` is still read by {consumers} panels or tables").into());
    }

    match workspace.take_join(name) {
        Some(join) => Ok(join.table.delete(DeleteOptions::default()).await?),
        None => Err(format!("`{name}` is not a join table").into()),
    }
}

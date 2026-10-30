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

//! Create a derived `Table` from a panel's view, and release a panel back to
//! the `Table` its own derived one reads.

use perspective_client::config::{ViewConfig, ViewConfigUpdate};
use perspective_client::{Client, DeleteOptions, TableData, TableInitOptions};
use perspective_js::utils::*;

use crate::config::{
    DerivedTableConfig, OptionalUpdate, TableRef, UnknownKeys, ViewerConfigUpdate,
};
use crate::derived::{DerivedSource, DerivedTable, suggest_name};
use crate::presentation::Presentation;
use crate::queries::fetch_hosted_tables;
use crate::renderer::Renderer;
use crate::session::{MissingTable, Session, probe_table};
use crate::tasks::{RestoreErrors, RestoreMode, restore_panel};
use crate::utils::PtrEqRc;
use crate::workspace::Workspace;

/// Whether this panel's `Client` can derive a `Table` from a `View`.
pub fn can_derive(session: &Session) -> bool {
    session
        .metadata()
        .get_features()
        .is_some_and(|x| x.view_derivations)
}

/// Rewrite an inline derived-table definition in `update.table` to a concrete
/// hosted name, rebinding to a structurally identical live derivation where
/// one exists and building (or pending, per `missing`) the rest.
pub async fn resolve_table_ref(
    workspace: &Workspace,
    update: &mut ViewerConfigUpdate,
    missing: MissingTable,
) -> ApiResult<()> {
    if !matches!(&update.table, OptionalUpdate::Update(TableRef::Derived(_))) {
        return Ok(());
    }

    let OptionalUpdate::Update(table_ref) =
        std::mem::replace(&mut update.table, OptionalUpdate::Missing)
    else {
        return Ok(());
    };

    let mut levels = vec![];
    let mut cursor = table_ref;
    let base = loop {
        match cursor {
            TableRef::Name(name) => break name,
            TableRef::Derived(config) => {
                levels.push(config.view_config);
                cursor = config.table;
            },
        }
    };

    let mut pending = workspace.derived_pending();
    let mut taken = fetch_hosted_tables(workspace)
        .await
        .into_iter()
        .flat_map(|(_, tables)| tables)
        .collect::<std::collections::BTreeSet<_>>();

    taken.extend(pending.keys().cloned());
    let mut parent = base;
    for view_config in levels.into_iter().rev() {
        let config = DerivedTableConfig {
            table: parent.clone(),
            view_config,
            unknown: UnknownKeys,
        };

        if let Some(existing) = workspace.derived_find_structural(&config) {
            parent = existing;
            continue;
        }

        if let Some(existing) = pending.iter().find(|(_, x)| **x == config) {
            parent = existing.0.clone();
            continue;
        }

        let name = suggest_name(
            &taken,
            &PtrEqRc::new(config.view_config.clone()),
            &Some(config.table.clone()),
        );

        taken.insert(name.clone());
        let built = match workspace
            .resolve_client_for_table(&config.table, None)
            .await
        {
            Some(client) => {
                build_derived(
                    &client,
                    workspace,
                    &name,
                    &config.table,
                    &config.view_config,
                )
                .await?
            },
            None => false,
        };

        if !built {
            if matches!(missing, MissingTable::Error) {
                return Err(ApiError::new(format!("Unknown table \"{}\"", config.table)));
            }

            pending.insert(name.clone(), config);
        }

        parent = name;
    }

    workspace.set_derived_pending(pending);
    update.table = OptionalUpdate::Update(TableRef::Name(parent));
    Ok(())
}

/// Build a derived `Table` named `name` from `parent`'s `view_config`, and
/// register it on `workspace`.
pub async fn build_derived(
    client: &Client,
    workspace: &Workspace,
    name: &str,
    parent: &str,
    view_config: &ViewConfig,
) -> ApiResult<bool> {
    let Some(parent_table) = probe_table(client, parent, MissingTable::Pend).await? else {
        return Ok(false);
    };

    // An empty `columns` in a derived DEFINITION means "all columns" (the
    // engine's absent-columns default), not a key-only view — `ViewConfig`'s
    // serde default materializes `[]` for definitions that omit the key.
    let mut update: ViewConfigUpdate = view_config.clone().into();
    if update.columns.as_ref().is_none_or(|x| x.is_empty()) {
        update.columns = None;
    }

    let view = parent_table.view(Some(update)).await?;
    let derived = match client
        .table(TableData::View(view.clone()), TableInitOptions {
            name: Some(name.to_owned()),
            ..TableInitOptions::default()
        })
        .await
    {
        Ok(derived) => derived,
        Err(err) => {
            view.delete().await?;
            return Err(err.into());
        },
    };

    workspace.register_derived(
        name.to_owned(),
        DerivedTable::new(
            parent.to_owned(),
            view_config.clone(),
            DerivedSource::Restored(view),
            derived,
        ),
    );

    Ok(true)
}

/// Promote the panel's current `View` to a derived `Table` named `name`,
/// consuming that `View` and rebinding the panel to the result.
pub async fn create_derived(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    workspace: &Workspace,
    name: String,
) -> ApiResult<()> {
    if !can_derive(session) {
        return Err("This data source cannot derive a Table from a View".into());
    }

    let client = session.get_client().ok_or("`load()` has not been called")?;
    let table = session.get_table().ok_or("`load()` has not been called")?;
    let parent = table.get_name().to_owned();
    let plugin = renderer.metadata().name.clone();
    let sub = session
        .take_view_sub()
        .ok_or("Panel has no View to derive from")?;

    let view_config = (*sub.get_view_config()).clone();
    let derived = match client
        .table(TableData::View(sub.get_view().clone()), TableInitOptions {
            name: Some(name.clone()),
            ..TableInitOptions::default()
        })
        .await
    {
        Ok(derived) => derived,
        Err(err) => {
            session.put_view_sub(sub);
            return Err(err.into());
        },
    };

    // The promoted `View` now feeds the derived `Table`, not this panel —
    // silence its Session-bound stats/update channels, or every PARENT tick
    // keeps writing the parent's stats over the panel's.
    if let Err(err) = sub.quiesce().await {
        session.put_view_sub(sub);
        derived.delete(DeleteOptions::default()).await?;
        return Err(err);
    }

    workspace.register_derived(
        name.clone(),
        DerivedTable::new(parent, view_config, DerivedSource::Panel(sub), derived),
    );

    let update = ViewerConfigUpdate {
        table: OptionalUpdate::Update(name.clone().into()),
        plugin: OptionalUpdate::Update(plugin),
        ..ViewerConfigUpdate::default()
    };

    let restored = restore_panel(
        session,
        renderer,
        presentation,
        workspace,
        RestoreMode::Existing { active: true },
        update,
        RestoreErrors::Publish,
        MissingTable::Error,
        None,
    )
    .await;

    if restored.is_err()
        && let Some(derived) = workspace.take_derived(&name)
    {
        derived.delete().await?;
    }

    restored
}

/// Rebind the panel to the `Table` its derived one reads, deleting that
/// derivation when `delete` and nothing else consumes it.
pub async fn release_derived(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    workspace: &Workspace,
    delete: bool,
) -> ApiResult<()> {
    let table = session.get_table().ok_or("Panel has no table")?;
    let name = table.get_name().to_owned();
    let config = workspace
        .derived_config(&name)
        .ok_or("Panel is not bound to a derived table")?;

    let update = ViewerConfigUpdate {
        table: OptionalUpdate::Update(config.table.clone().into()),
        view_config: config.view_config.into(),
        ..ViewerConfigUpdate::default()
    };

    restore_panel(
        session,
        renderer,
        presentation,
        workspace,
        RestoreMode::Existing { active: true },
        update,
        RestoreErrors::Publish,
        MissingTable::Error,
        None,
    )
    .await?;

    if delete {
        delete_derived(workspace, &name).await?;
    }

    Ok(())
}

/// Delete a derived `Table` that nothing consumes.
pub async fn delete_derived(workspace: &Workspace, name: &str) -> ApiResult<()> {
    let consumers = workspace.derived_consumers(name);
    if consumers > 0 {
        return Err(format!("`{name}` is still read by {consumers} panels or tables").into());
    }

    match workspace.take_derived(name) {
        Some(derived) => derived.delete().await,
        None => Err(format!("`{name}` is not a derived table").into()),
    }
}

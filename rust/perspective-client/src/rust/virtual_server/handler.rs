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

use std::future::Future;
use std::pin::Pin;

use indexmap::IndexMap;

use super::data::VirtualDataSlice;
use super::features::Features;
use super::generic_sql_model::column_path_source;
use crate::config::{ViewConfig, ViewConfigUpdate};
use crate::proto::{ColumnType, HostedTable, TableMakePortReq, ViewPort};
use crate::table::{DescribeError, Description};

#[cfg(feature = "sendable")]
pub type VirtualServerFuture<'a, T> = Pin<Box<dyn Future<Output = T> + 'a>>;

/// A boxed future that conditionally implements `Send` based on the target
/// architecture.
///
/// This only compiles on wasm, except for `rust-analyzer` and `metadata`
/// generation, so this type exists to tryck the compiler
#[cfg(not(feature = "sendable"))]
pub type VirtualServerFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Handler trait for implementing virtual server backends.
///
/// This trait defines the interface that must be implemented to provide
/// a custom data source for the Perspective virtual server. Implementors
/// handle table and view operations, translating them to their underlying
/// data store.
pub trait VirtualServerHandler {
    // Required

    /// The error type returned by handler methods.
    #[cfg(not(feature = "sendable"))]
    type Error: std::error::Error + Send + Sync + 'static;

    #[cfg(feature = "sendable")]
    type Error: std::error::Error + 'static;

    /// Returns a list of all tables hosted by this handler.
    fn get_hosted_tables(&self) -> VirtualServerFuture<'_, Result<Vec<HostedTable>, Self::Error>>;

    /// Returns the schema (column names and types) for a table.
    fn table_schema(
        &self,
        table_id: &str,
    ) -> VirtualServerFuture<'_, Result<IndexMap<String, ColumnType>, Self::Error>>;

    /// Returns the number of rows in a table.
    fn table_size(&self, table_id: &str) -> VirtualServerFuture<'_, Result<u32, Self::Error>>;

    /// Creates a new view on a table with the given configuration.
    ///
    /// The handler may modify the configuration to reflect any adjustments
    /// made during view creation.
    fn table_make_view(
        &mut self,
        view_id: &str,
        view_id: &str,
        config: &mut ViewConfigUpdate,
    ) -> VirtualServerFuture<'_, Result<String, Self::Error>>;

    /// Validates a complete view config against a table and reports the schema
    /// a view built from it would have, WITHOUT creating one.
    fn table_describe(
        &mut self,
        table_id: &str,
        config: &ViewConfig,
    ) -> VirtualServerFuture<'_, Result<Result<Description, DescribeError>, Self::Error>>;

    /// Deletes a view and releases its resources.
    fn view_delete(&self, view_id: &str) -> VirtualServerFuture<'_, Result<(), Self::Error>>;

    /// Retrieves data from a view within the specified viewport.
    fn view_get_data(
        &self,
        view_id: &str,
        config: &ViewConfig,
        schema: &IndexMap<String, ColumnType>,
        viewport: &ViewPort,
    ) -> VirtualServerFuture<'_, Result<VirtualDataSlice, Self::Error>>;

    // Optional

    /// Return the column count of a `Table`
    fn table_column_size(
        &self,
        table_id: &str,
    ) -> VirtualServerFuture<'_, Result<u32, Self::Error>> {
        let fut = self.table_schema(table_id);
        Box::pin(async move { Ok(fut.await?.len() as u32) })
    }

    /// Returns the number of rows in a `View`.
    fn view_size(&self, view_id: &str) -> VirtualServerFuture<'_, Result<u32, Self::Error>> {
        Box::pin(self.table_size(view_id))
    }

    /// Return the column count of a `View`
    fn view_column_size(
        &self,
        view_id: &str,
        config: &ViewConfig,
    ) -> VirtualServerFuture<'_, Result<u32, Self::Error>> {
        let fut = self.view_schema(view_id, config);
        Box::pin(async move { Ok(fut.await?.len() as u32) })
    }

    /// Returns the schema of a view after applying its configuration.
    fn view_schema(
        &self,
        view_id: &str,
        _config: &ViewConfig,
    ) -> VirtualServerFuture<'_, Result<IndexMap<String, ColumnType>, Self::Error>> {
        Box::pin(self.table_schema(view_id))
    }

    /// Returns the features supported by this handler.
    ///
    /// Default implementation returns default features.
    fn get_features(&self) -> VirtualServerFuture<'_, Result<Features<'_>, Self::Error>> {
        Box::pin(async { Ok(Features::default()) })
    }

    /// Creates a new input port on a table.
    ///
    /// Default implementation returns port ID 0.
    fn table_make_port(
        &self,
        _req: &TableMakePortReq,
    ) -> VirtualServerFuture<'_, Result<u32, Self::Error>> {
        Box::pin(async { Ok(0) })
    }

    /// Returns the min and max values of a column in a view.
    ///
    /// Default implementation panics with "not implemented".
    fn view_get_min_max(
        &self,
        _view_id: &str,
        _column_name: &str,
        _config: &crate::config::ViewConfig,
    ) -> VirtualServerFuture<'_, Result<(crate::config::Scalar, crate::config::Scalar), Self::Error>>
    {
        Box::pin(async { unimplemented!("view_get_min_max not implemented") })
    }

    // Unused

    /// Creates a new table with the given data.
    ///
    /// Default implementation panics with "not implemented".
    fn make_table(
        &mut self,
        _table_id: &str,
        _data: &crate::proto::MakeTableData,
    ) -> VirtualServerFuture<'_, Result<(), Self::Error>> {
        Box::pin(async { unimplemented!("make_table not implemented") })
    }
}

/// A [`VirtualServerHandler::table_describe`] implementation for backends with
/// no cheaper native answer: build a real view on a private id, read its
/// schema, delete it.
pub async fn describe_via_make_view<H: VirtualServerHandler + ?Sized>(
    handler: &mut H,
    table_id: &str,
    config: &ViewConfig,
) -> Result<Result<Description, DescribeError>, H::Error> {
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let view_id = format!(
        "__psp_describe_{}__",
        COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );

    let mut update: ViewConfigUpdate = config.clone().into();
    let view_id = match handler
        .table_make_view(table_id, &view_id, &mut update)
        .await
    {
        Ok(view_id) => view_id,
        Err(e) => return Ok(Err(DescribeError::Config(e.to_string()))),
    };

    let config: ViewConfig = update.into();
    let schema = handler.view_schema(&view_id, &config).await;
    let deleted = handler.view_delete(&view_id).await;
    let schema = schema?;
    deleted?;
    let view_schema = schema
        .iter()
        .map(|(name, ty)| {
            let source = column_path_source(name, &config)
                .map(|(_, col)| col.to_string())
                .unwrap_or_else(|| name.clone());

            (source, *ty)
        })
        .collect::<std::collections::HashMap<_, _>>();

    let expression_schema = config
        .expressions
        .keys()
        .filter_map(|name| view_schema.get(name).map(|ty| (name.clone(), *ty)))
        .collect();

    Ok(Ok(Description {
        expression_schema,
        view_schema,
    }))
}

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

use std::cell::Cell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;
use yew::prelude::*;

use super::view::*;
use crate::config::*;
use crate::utils::*;
use crate::*;

/// Metadata snapshot of the current `Table()`/`View()` state which may be of
/// interest to components.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ViewStats {
    pub is_group_by: bool,
    pub is_split_by: bool,
    pub is_filtered: bool,
    pub num_table_cells: Option<(u32, u32)>,
    pub num_view_cells: Option<(u32, u32)>,
}

#[derive(Clone)]
struct ViewSubscriptionData {
    view: OwnedView,
    config: Rc<ViewConfig>,
    callback_id: Rc<Cell<u32>>,
    on_stats: Callback<ViewStats>,
    on_update: Callback<()>,
}

/// A subscription to `on_update()` events from a Perspective `View()`, managing
/// the `Closure` state as well as cleanup via `on_delete()`.
pub struct ViewSubscription {
    data: ViewSubscriptionData,
    // closure: Closure<dyn Fn(JsValue) -> js_sys::Promise>,
}

impl ViewSubscriptionData {
    /// Main handler when underlying `View()` calls `on_update()`.
    async fn on_view_update(self) -> ApiResult<JsValue> {
        self.on_update.emit(());
        self.clone().update_view_stats().await?;
        Ok(JsValue::UNDEFINED)
    }

    /// TODO Use serde to serialize the full view config, instead of calculating
    /// `is_aggregated` here.
    async fn update_view_stats(self) -> ApiResult<JsValue> {
        let dimensions = self.view.dimensions().await?;
        let num_rows = dimensions.num_table_rows as u32;
        let num_cols = dimensions.num_table_columns as u32;
        let virtual_rows = dimensions.num_view_rows as u32;
        let virtual_cols = dimensions.num_view_columns as u32;
        let stats = ViewStats {
            num_table_cells: Some((num_rows, num_cols)),
            num_view_cells: Some((virtual_rows, virtual_cols)),
            is_filtered: virtual_rows != num_rows,
            is_group_by: !self.config.group_by.is_empty(),
            is_split_by: !self.config.split_by.is_empty(),
        };

        self.on_stats.emit(stats);
        Ok(JsValue::UNDEFINED)
    }
}

impl ViewSubscription {
    /// Create a new `ViewSubscription` with the provided Perspective `Table()`
    /// and `View()` pair.  During initialization, any necessary Perspective
    /// API events will be subscribed to and subsequently cleaned up via
    /// `Drop` trait.
    ///
    /// # Arguments
    /// * `table` - a Perspective `Table()`
    /// * `view` - a Perspective `View()` on this `table`.
    /// * `on_stats` - a callback for metadata notifications, from Perspective's
    ///   `View.on_update()`.
    pub fn new(
        view: perspective_client::View,
        config: ViewConfig,
        on_stats: Callback<ViewStats>,
        on_update: Callback<()>,
    ) -> Self {
        let data = ViewSubscriptionData {
            view: OwnedView::new(view),
            config: config.into(),
            on_stats,
            callback_id: Rc::default(),
            on_update,
        };

        let emit = perspective::utils::LocalPollLoop::new({
            clone!(data);
            move |_| {
                ApiFuture::spawn(data.clone().on_view_update());
                Ok(JsValue::UNDEFINED)
            }
        });

        ApiFuture::spawn({
            clone!(data.view, data.callback_id);
            async move {
                let result = view
                    .on_update(Box::new(move |msg| spawn_local(emit.poll(msg))), None)
                    .await?;
                callback_id.set(result);
                Ok(())
            }
        });

        ApiFuture::spawn(data.clone().update_view_stats());
        Self { data }
    }

    /// Getter for the underlying `View()`.
    pub const fn get_view(&self) -> &OwnedView {
        &self.data.view
    }
}

impl Drop for ViewSubscription {
    fn drop(&mut self) {
        ApiFuture::spawn({
            clone!(self.data.view, self.data.callback_id);
            async move { Ok(view.remove_update(callback_id.get()).await?) }
        });
    }
}

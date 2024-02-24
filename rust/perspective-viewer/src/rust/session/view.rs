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

use std::ops::Deref;
use std::rc::Rc;

use derivative::Derivative;
use futures::Future;
use perspective::utils::ApiResult;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;

/// `PerspectiveOwned` is a newtype-ed `Rc` smart pointer which guarantees
/// either a `JsPerspectiveView` or `JsPerspectiveTable` will have its
/// `.delete()` method called when it is dropped.
#[derive(Derivative)]
#[derivative(Clone(bound = ""))]
pub struct PerspectiveOwned<T>(Rc<PerspectiveOwnedSession<T>>)
where
    T: AsyncDelete + Clone + 'static;

/// An owned `JsPerspectiveView` which calls its JavaScript `delete()` method
/// when this struct is `drop()`-ed.
pub type OwnedView = PerspectiveOwned<perspective_client::View>;

/// `<perspective-viewer>` does not currently take ownership of `Table`. objects
/// so this is not currently needed, but it will be in the future and this
/// polymorphism is the motiviation behind the `PerspectiveOwned<T>` type.
#[allow(dead_code)]
pub type OwnedTable = PerspectiveOwned<perspective_client::Table>;

impl<T> PerspectiveOwned<T>
where
    T: AsyncDelete + Clone + 'static,
{
    /// Take ownership of a `T` and construct a `PerspectiveOwned<T>`.
    pub fn new(obj: T) -> Self {
        Self(Rc::new(PerspectiveOwnedSession(obj)))
    }
}

impl PerspectiveOwned<perspective_client::View> {
    /// Get a reference to the owned object as a `JsValue`, which is necessary
    /// to pass it back to other JavaScript APIs.
    pub fn as_jsvalue(&self) -> JsValue {
        perspective::JsView::from(self.0 .0.clone()).into()
    }

    pub fn as_jsview(&self) -> perspective::JsView {
        self.0 .0.clone().into()
    }
}

impl PerspectiveOwned<perspective_client::Table> {
    /// Get a reference to the owned object as a `JsValue`, which is necessary
    /// to pass it back to other JavaScript APIs.
    pub fn as_jsvalue(&self) -> JsValue {
        perspective::JsTable::from(self.0 .0.clone()).into()
    }

    pub fn as_jstable(&self) -> perspective::JsTable {
        self.0 .0.clone().into()
    }
}

impl<T> Deref for PerspectiveOwned<T>
where
    T: AsyncDelete + Clone + 'static,
{
    type Target = T;

    /// `Deref` allows library users to use a `PerspectiveOwned<T>` just like a
    /// `T` in most cases.
    fn deref(&self) -> &Self::Target {
        &self.0 .0
    }
}

/// `PerspectiveOwnedSession<T>` is a newtype wrapper for implementing `Drop`.
/// Alternatively, we could just implement `Drop` directly on
/// `JsPerspectiveView` and `JsPerspectiveTable`.
struct PerspectiveOwnedSession<T: AsyncDelete + Clone + 'static>(T);

impl<T: AsyncDelete + Clone + 'static> Drop for PerspectiveOwnedSession<T> {
    fn drop(&mut self) {
        let obj = self.0.clone();
        spawn_local(async move {
            obj.owned_delete()
                .await
                .expect("Failed to delete perspective object");
        });
    }
}

pub trait AsyncDelete {
    fn owned_delete(self) -> impl Future<Output = ApiResult<JsValue>>;
}

impl AsyncDelete for perspective_client::View {
    async fn owned_delete(self) -> ApiResult<JsValue> {
        self.delete().await?;
        Ok(JsValue::UNDEFINED)
    }
}

impl AsyncDelete for perspective_client::Table {
    async fn owned_delete(self) -> ApiResult<JsValue> {
        self.delete().await?;
        Ok(JsValue::UNDEFINED)
    }
}

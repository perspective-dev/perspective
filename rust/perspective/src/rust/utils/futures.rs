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

use wasm_bindgen::convert::{FromWasmAbi, IntoWasmAbi};
use wasm_bindgen::describe::WasmDescribe;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
// TODO This is risky to rely on, but it is currently impossible to implement
// this trait locally due to the orphan instance restriction.  Using this trait
// removes alow of boilerplate required by `async` when casting to `Promise`.
use wasm_bindgen::__rt::IntoJsResult;
use wasm_bindgen_futures::{future_to_promise, JsFuture};

use super::errors::*;

/// A newtype wrapper for a `Future` trait object which supports being
/// marshalled to a `JsPromise`, avoiding an API which requires type casting to
/// and from `JsValue` and the associated loss of type safety.
#[must_use]
pub struct ApiFuture<T>(Pin<Box<dyn Future<Output = ApiResult<T>>>>)
where
    Result<T, JsValue>: IntoJsResult + 'static;

impl<T> ApiFuture<T>
where
    Result<T, JsValue>: IntoJsResult + 'static,
{
    /// Constructor for `ApiFuture`.  Note that, like a regular `Future`, the
    /// `ApiFuture` created does _not_ execute without being further cast to a
    /// `Promise`, either explicitly or implcitly (when exposed via
    /// `wasm_bindgen`).
    pub fn new<U: Future<Output = ApiResult<T>> + 'static>(x: U) -> Self {
        Self(Box::pin(x))
    }
}

impl<T> ApiFuture<T>
where
    Result<T, JsValue>: IntoJsResult + 'static,
{
    /// Construct an `ApiFuture` and execute it immediately.  The `Promise`
    /// handle created internally is dropped, but since JavaScript `Promise`
    /// executes on construction, the async invocation persists.
    pub fn spawn<U: Future<Output = ApiResult<T>> + 'static>(x: U) {
        drop(js_sys::Promise::from(Self::new(x)))
    }
}

impl<T> Default for ApiFuture<T>
where
    Result<T, JsValue>: IntoJsResult + 'static,
    T: Default,
{
    fn default() -> Self {
        Self::new(async { Ok(Default::default()) })
    }
}

impl<T> From<ApiFuture<T>> for JsValue
where
    Result<T, Self>: IntoJsResult + 'static,
{
    fn from(fut: ApiFuture<T>) -> Self {
        js_sys::Promise::from(fut).unchecked_into()
    }
}

impl<T> From<ApiFuture<T>> for js_sys::Promise
where
    Result<T, JsValue>: IntoJsResult + 'static,
{
    fn from(fut: ApiFuture<T>) -> Self {
        future_to_promise(async move {
            let x = Ok(fut.0.await?);
            let y = Ok(x.into_js_result()?);
            Ok(y.ignore_view_delete()?)
        })
    }
}

impl<T> WasmDescribe for ApiFuture<T>
where
    Result<T, JsValue>: IntoJsResult + 'static,
{
    fn describe() {
        <js_sys::Promise as WasmDescribe>::describe()
    }
}

impl<T> IntoWasmAbi for ApiFuture<T>
where
    Result<T, JsValue>: IntoJsResult + 'static,
{
    type Abi = <js_sys::Promise as IntoWasmAbi>::Abi;

    #[inline]
    fn into_abi(self) -> Self::Abi {
        js_sys::Promise::from(self).into_abi()
    }
}

impl<T> FromWasmAbi for ApiFuture<T>
where
    Result<T, JsValue>: IntoJsResult + 'static,
    T: From<JsValue> + Into<JsValue>,
{
    type Abi = <js_sys::Promise as IntoWasmAbi>::Abi;

    #[inline]
    unsafe fn from_abi(js: Self::Abi) -> Self {
        Self::new(async move {
            let promise = js_sys::Promise::from_abi(js);
            Ok(JsFuture::from(promise).await?.into())
        })
    }
}

impl<T> Future for ApiFuture<T>
where
    Result<T, JsValue>: IntoJsResult + 'static,
{
    type Output = ApiResult<T>;

    fn poll(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let mut fut = unsafe { self.map_unchecked_mut(|s| &mut s.0) };
        fut.as_mut().poll(cx)
    }
}

static CANCELLED_MSG: &str = "View method cancelled";

#[extend::ext]
pub impl Result<JsValue, ApiError> {
    /// Wraps an error `JsValue` return from a caught JavaScript exception,
    /// checking for the explicit error type indicating that a
    /// `JsPerspectiveView` call has been cancelled due to it already being
    /// deleted.  This is a normal mechanic of the `JsPerspectiveView` to
    /// cancel a `View` call that is no longer need be the viewer, e.g. when
    /// the user updates the UI before the previous update has finished
    /// drawing.  Without using exceptions for this, we'd need to wrap every
    /// such `JsPerspectiveView` call individually.
    ///
    /// When `"View method cancelled"` message is received, this call should
    /// silently be replaced with `Ok`.  The message itself is returned in this
    /// case (instead of whatever the `async` returns), which is helpful for
    /// detecting this condition when debugging.
    fn ignore_view_delete(self) -> Result<JsValue, ApiError> {
        self.or_else(|x| {
            let f: JsValue = x.clone().into();
            match f.dyn_ref::<js_sys::Error>() {
                Some(err) => {
                    if err.message() != CANCELLED_MSG {
                        Err(x)
                    } else {
                        Ok(js_intern::js_intern!(CANCELLED_MSG).clone())
                    }
                },
                _ => match f.as_string() {
                    Some(x) if x == CANCELLED_MSG => {
                        Ok(js_intern::js_intern!(CANCELLED_MSG).clone())
                    },
                    Some(_) => Err(x),
                    _ => {
                        if js_sys::Reflect::get(&f, js_intern::js_intern!("message"))
                            .unwrap()
                            .as_string()
                            .unwrap_or_else(|| "".to_owned())
                            == CANCELLED_MSG
                        {
                            Ok(js_intern::js_intern!(CANCELLED_MSG).clone())
                        } else {
                            Err(x)
                        }
                    },
                },
            }
        })
    }
}

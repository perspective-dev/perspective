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

use std::cell::RefCell;
use std::future::Future;
use std::pin::Pin;

use perspective_client::ClientError;
// TODO This is risky to rely on, but it is currently impossible to implement
// this trait locally due to the orphan instance restriction.  Using this trait
// removes alow of boilerplate required by `async` when casting to `Promise`.
use wasm_bindgen::__rt::IntoJsResult;
use wasm_bindgen::convert::{FromWasmAbi, IntoWasmAbi};
use wasm_bindgen::describe::WasmDescribe;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::{JsFuture, future_to_promise};

use super::errors::*;

#[wasm_bindgen]
extern "C" {
    /// A DevTools task handle from `console.createTask` — Chrome's Async
    /// Stack Tagging API. Bound manually, as `js_sys` does not expose it.
    type JsConsoleTask;

    #[wasm_bindgen(method, catch)]
    fn run(this: &JsConsoleTask, f: &js_sys::Function) -> Result<JsValue, JsValue>;
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(variadic, js_namespace = console , js_name = createTask, catch)]
    pub fn createTask(name: JsValue) -> Result<JsValue, JsValue>;
}

/// Create a DevTools task, or `None` where the API is unavailable (it is
/// Chrome-only).
fn create_task(name: &str) -> Option<JsConsoleTask> {
    thread_local! {
        static CREATE_TASK: Option<(JsValue, js_sys::Function)> = (|| {
            let global = js_sys::global();
            let console = js_sys::Reflect::get(&global, &"console".into()).ok()?;
            let create = js_sys::Reflect::get(&console, &"createTask".into()).ok()?;
            Some((console, create.dyn_into().ok()?))
        })();
    }

    CREATE_TASK.with(|x| {
        let (console, create) = x.as_ref()?;
        Some(create.call1(console, &name.into()).ok()?.unchecked_into())
    })
}

thread_local! {
    /// Scoped poll thunks for [`TRAMPOLINE`], a stack because tagged polls
    /// nest (an `ApiFuture` awaiting another `ApiFuture`).
    static POLL_STACK: RefCell<Vec<*mut (dyn FnMut() + 'static)>> = RefCell::new(Vec::new());

    /// The single reusable JS closure handed to [`JsConsoleTask::run`].
    static TRAMPOLINE: Closure<dyn Fn()> = Closure::new(|| {
        let thunk = POLL_STACK.with(|x| x.borrow().last().copied());
        if let Some(thunk) = thunk {
            unsafe { (*thunk)() }
        }
    });
}

/// A newtype wrapper for a `Future` trait object which supports being
/// marshalled to a `JsPromise`.
///
/// This avoids implementing an API which requires type casting to
/// and from `JsValue` and the associated loss of type safety.
#[must_use]
pub struct ApiFuture<T>(
    Pin<Box<dyn Future<Output = ApiResult<T>>>>,
    Option<JsConsoleTask>,
)
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
        Self::new_named("perspective", x)
    }

    /// [`Self::new`] with an explicit DevTools task label, shown at the async
    /// gap in tagged stack traces.
    pub fn new_named<U: Future<Output = ApiResult<T>> + 'static>(name: &str, x: U) -> Self {
        Self(Box::pin(x), create_task(name))
    }

    pub fn new_throttled<U: Future<Output = ApiResult<T>> + 'static>(x: U) -> ApiFuture<()> {
        ApiFuture::<()>::new(async move { x.await.ignore_view_delete().map(|_| ()) })
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

    /// [`Self::spawn`] with an explicit DevTools task label.
    pub fn spawn_named<U: Future<Output = ApiResult<T>> + 'static>(name: &str, x: U) {
        drop(js_sys::Promise::from(Self::new_named(name, x)))
    }

    pub fn spawn_throttled<U: Future<Output = ApiResult<T>> + 'static>(x: U) {
        drop(js_sys::Promise::from(Self::new_throttled(x)))
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
        // Await `fut` NOT `fut.0` or the stack frame is lost in Chrome.
        future_to_promise(async move { Ok(fut.await?).into_js_result() })
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
            let promise = unsafe { js_sys::Promise::from_abi(js) };
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
        // SAFETY: structural projection only — neither field is moved, and
        // the inner future stays behind its own `Pin<Box<_>>`.
        let Self(inner, task) = unsafe { self.get_unchecked_mut() };
        let Some(task) = task else {
            return inner.as_mut().poll(cx);
        };

        let mut result = None;
        let mut thunk = || result = Some(inner.as_mut().poll(cx));

        // SAFETY: the lifetime is erased for storage only. The entry is
        // pushed and popped within this scope, and `run` invokes the
        // trampoline synchronously, so the pointer never outlives `thunk`.
        let short: *mut (dyn FnMut() + '_) = &mut thunk;
        let long: *mut (dyn FnMut() + 'static) = unsafe { std::mem::transmute(short) };
        POLL_STACK.with(|x| x.borrow_mut().push(long));
        let _ = TRAMPOLINE.with(|x| task.run(x.as_ref().unchecked_ref()));
        POLL_STACK.with(|x| x.borrow_mut().pop());

        #[allow(clippy::drop_non_drop)]
        drop(thunk);

        match result {
            Some(result) => result,
            // `run` threw without invoking the trampoline.
            None => inner.as_mut().poll(cx),
        }
    }
}

#[extend::ext]
pub impl<T> Result<T, ApiError> {
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
    fn ignore_view_delete(self) -> Result<Option<T>, ApiError> {
        self.map(|x| Some(x)).or_else(|err| match err.inner() {
            ApiErrorType::ClientError(ClientError::ViewNotFound) => Ok(None),
            ApiErrorType::JsRawError(..) | ApiErrorType::JsError(..)
                if format!("{err}").contains("View not found") =>
            {
                Ok(None)
            },
            _ => Err(err),
        })
    }
}

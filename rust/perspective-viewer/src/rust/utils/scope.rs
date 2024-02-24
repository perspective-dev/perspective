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

use extend::ext;
use futures::channel::oneshot::*;
use perspective::utils::ApiResult;
use yew::html::Scope;
use yew::prelude::*;

#[ext]
pub impl<T> Scope<T>
where
    T: Component,
{
    /// Send a message with a callback, then suspend until the callback is
    /// invoked.
    fn send_message_async<F, U>(&self, f: F) -> Receiver<U>
    where
        F: FnOnce(Sender<U>) -> T::Message,
    {
        let (sender, receiver) = channel::<U>();
        self.send_message(f(sender));
        receiver
    }
}

#[ext]
pub(crate) impl<T> Callback<Sender<T>>
where
    T: 'static,
{
    /// This is "safe" because `emit()` is not called synchronously.  Normally
    /// we want this to minimize the async by doing as much work synchronous
    /// as possible (see `send_message_async()` e.g.), but this method calls
    /// `Yew` which _never_ wants to be called synchronously.
    ///
    /// TODO Need test coverage for this - error behavior is that presize/render
    /// blocking calls are out-of-order, e.g. toggle config `presize()` call.
    /// Engineering the test to capture this faulty behavior may be difficult
    async fn emit_async_safe(&self) -> ApiResult<T> {
        let (sender, receiver) = channel::<T>();
        self.emit(sender);
        Ok(receiver.await?)
    }
}

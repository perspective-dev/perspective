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

use futures::channel::oneshot;
use perspective_js::utils::*;

/// A completion handle for message-based public API methods (invariant I6 —
/// see `SESSION_CONFIG_COHERENCE_PLAN.md`): its ONLY resolution API is
/// [`Completion::resolve_after`], which takes a run future — so resolving a
/// public method's promise at message-handling time (before the renders it
/// caused have drawn) is unwritable, not merely discouraged. Dropping an
/// unresolved `Completion` rejects the caller as cancelled.
pub struct Completion(Option<oneshot::Sender<ApiResult<()>>>);

impl Completion {
    #[allow(clippy::new_ret_no_self)]
    pub fn new() -> (Self, oneshot::Receiver<ApiResult<()>>) {
        let (sender, receiver) = oneshot::channel();
        (Self(Some(sender)), receiver)
    }

    /// Resolve this completion with `run`'s result when it settles. The
    /// caller relinquishes the handle — one run, one resolution.
    pub fn resolve_after(mut self, run: impl Future<Output = ApiResult<()>> + 'static) {
        let sender = self.0.take().unwrap();
        ApiFuture::spawn(async move {
            let _ = sender.send(run.await);
            Ok(())
        });
    }
}

impl std::fmt::Debug for Completion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Completion").finish()
    }
}

impl Drop for Completion {
    fn drop(&mut self) {
        if let Some(sender) = self.0.take() {
            let _ = sender.send(Err(ApiError::new("Cancelled")));
        }
    }
}

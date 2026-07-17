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
use std::future::Future;
use std::rc::Rc;

use async_lock::Mutex;
use perspective_js::utils::ApiResult;

/// Proof that the bearer is executing inside a [`DebounceMutex`]-locked task.
///
/// Every plugin-dispatching function (`draw_view`, `activate_plugin`, the
/// restyle/resize/export wrappers) and the snapshot pipeline
/// (`bind_snapshot`) require `&RenderGuard`, so an unlocked plugin call or
/// out-of-pipeline render is a missing witness — a compile error, not a
/// review rule. Constructed ONLY by [`DebounceMutex::lock_with`] /
/// [`DebounceMutex::debounce_with`], after the lock is acquired; it is not
/// `Clone`, so it cannot be stashed for use outside the task that received
/// it.
pub struct RenderGuard {
    _private: (),
}

#[derive(Default)]
struct DebounceMutexData {
    id: Cell<u64>,
    held: Cell<bool>,
    mutex: Mutex<u64>,
}

/// Clears the `held` flag on drop, so cancellation of a locked task (its
/// future dropped mid-await) can't leave [`DebounceMutex::is_held`] stuck
/// `true`.
struct HeldFlag<'a>(&'a Cell<bool>);

impl<'a> HeldFlag<'a> {
    fn set(cell: &'a Cell<bool>) -> Self {
        cell.set(true);
        Self(cell)
    }
}

impl Drop for HeldFlag<'_> {
    fn drop(&mut self) {
        self.0.set(false);
    }
}

/// An async `Mutex` type specialized for Perspective's rendering, which
/// debounces calls in addition to providing exclusivity. Calling `debounce`
/// with a _cancellable_ [`Future`] will resolve only after at least one
/// _complete_ evaluation of a call awaiting the lock.
#[derive(Clone, Default)]
pub struct DebounceMutex(Rc<DebounceMutexData>);

impl DebounceMutex {
    /// `true` while a locked task is executing. Used by lock-acquiring
    /// public API methods to emit a debug-build warning when they are about
    /// to queue behind an in-flight run — legitimate for app callers, a
    /// guaranteed deadlock when reached synchronously from a plugin's render
    /// (the render-callable contract on `js::plugin` forbids it).
    pub fn is_held(&self) -> bool {
        self.0.held.get()
    }

    /// Lock like a normal `Mutex`.
    pub async fn lock<T>(&self, f: impl Future<Output = T>) -> T {
        let mut last = self.0.mutex.lock().await;
        let next = self.0.id.get();
        let held = HeldFlag::set(&self.0.held);
        let result = f.await;
        drop(held);
        *last = next;
        result
    }

    /// Lock, passing a [`RenderGuard`] witness into the task builder. The
    /// task future is CONSTRUCTED after the lock is acquired — a guard can
    /// never exist outside a locked section.
    pub async fn lock_with<T, F, Fut>(&self, f: F) -> T
    where
        F: FnOnce(RenderGuard) -> Fut,
        Fut: Future<Output = T>,
    {
        let mut last = self.0.mutex.lock().await;
        let next = self.0.id.get();
        let held = HeldFlag::set(&self.0.held);
        let result = f(RenderGuard { _private: () }).await;
        drop(held);
        *last = next;
        result
    }

    /// Lock and also debounce `f`, which should be cancellable.
    pub async fn debounce(&self, f: impl Future<Output = ApiResult<()>>) -> ApiResult<()> {
        let next = self.0.id.get() + 1;
        let mut last = self.0.mutex.lock().await;
        if *last < next {
            let next = self.0.id.get() + 1;
            self.0.id.set(next);
            let held = HeldFlag::set(&self.0.held);
            let result = f.await;
            drop(held);
            if result.is_ok() {
                *last = next;
            }

            result
        } else {
            Ok(())
        }
    }

    /// [`Self::debounce`] with a [`RenderGuard`] witness (see
    /// [`Self::lock_with`]).
    pub async fn debounce_with<F, Fut>(&self, f: F) -> ApiResult<()>
    where
        F: FnOnce(RenderGuard) -> Fut,
        Fut: Future<Output = ApiResult<()>>,
    {
        let next = self.0.id.get() + 1;
        let mut last = self.0.mutex.lock().await;
        if *last < next {
            let next = self.0.id.get() + 1;
            self.0.id.set(next);
            let held = HeldFlag::set(&self.0.held);
            let result = f(RenderGuard { _private: () }).await;
            drop(held);
            if result.is_ok() {
                *last = next;
            }

            result
        } else {
            Ok(())
        }
    }
}

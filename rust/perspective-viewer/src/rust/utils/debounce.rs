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

use super::pubsub::PubSub;

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

/// The per-slot debounce bookkeeping: one running + one parked evaluation,
/// with coalesced callers awaiting the parked runner's settle. Kept
/// per-[`DebounceSlot`] so coalescing is only expressible WITHIN a kind —
/// a caller can never be absorbed by a parked runner of a different kind
/// whose work does not subsume it (the resize-eaten-by-parked-update bug).
#[derive(Default)]
struct SlotState {
    id: Cell<u64>,
    last: Cell<u64>,
    parked: Cell<bool>,
    settled_id: Cell<u64>,
    on_settle: PubSub<()>,
}

#[derive(Default)]
struct DebounceMutexData {
    held: Cell<bool>,
    mutex: Mutex<()>,
    default_slot: Rc<SlotState>,
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

/// RAII for the parked debounce runner: clears `parked` and broadcasts the
/// runner's settle on drop. Running through `Drop` (not a happy-path call)
/// makes the release unconditional — a runner cancelled mid-park or
/// mid-run still frees the parked slot and releases its coalesced waiters,
/// so they can never be stranded awaiting a settle that no task will emit.
struct SettleGuard<'a> {
    state: &'a SlotState,
    next: u64,
}

impl<'a> SettleGuard<'a> {
    fn park(state: &'a SlotState, next: u64) -> Self {
        state.parked.set(true);
        Self { state, next }
    }
}

impl Drop for SettleGuard<'_> {
    fn drop(&mut self) {
        self.state.parked.set(false);
        if self.state.settled_id.get() < self.next {
            self.state.settled_id.set(self.next);
        }

        self.state.on_settle.emit(());
    }
}

/// An async `Mutex` type specialized for Perspective's rendering, which
/// debounces calls in addition to providing exclusivity. Calling
/// [`Self::debounce`] resolves only after at least one complete evaluation
/// of a call that began no earlier than this one — either by running the
/// caller's own future, or by coalescing onto the single parked trailing
/// runner. At most TWO debounce evaluations are ever outstanding (one
/// running, one parked); every additional concurrent caller resolves
/// without queueing on the lock.
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
        self.lock_with(|_| f).await
    }

    /// Lock, passing a [`RenderGuard`] witness into the task builder. The
    /// task future is CONSTRUCTED after the lock is acquired — a guard can
    /// never exist outside a locked section.
    pub async fn lock_with<T, F, Fut>(&self, f: F) -> T
    where
        F: FnOnce(RenderGuard) -> Fut,
        Fut: Future<Output = T>,
    {
        let guard = self.0.mutex.lock().await;
        let held = HeldFlag::set(&self.0.held);
        let result = f(RenderGuard { _private: () }).await;
        drop(held);
        drop(guard);
        result
    }

    /// Lock and also debounce `f`, which should be cancellable.
    pub async fn debounce(&self, f: impl Future<Output = ApiResult<()>>) -> ApiResult<()> {
        self.debounce_with(|_| f).await
    }

    /// [`Self::debounce`] with a [`RenderGuard`] witness (see
    pub async fn debounce_with<T, F, Fut>(&self, f: F) -> ApiResult<T>
    where
        T: Default,
        F: FnOnce(RenderGuard) -> Fut,
        Fut: Future<Output = ApiResult<T>>,
    {
        DebounceSlot {
            mutex: self.clone(),
            state: self.0.default_slot.clone(),
        }
        .debounce_with(f)
        .await
    }

    /// A NEW debounce slot over this mutex: its tasks serialize against
    /// every other locked task, but coalesce only among themselves.
    pub fn slot(&self) -> DebounceSlot {
        DebounceSlot {
            mutex: self.clone(),
            state: Default::default(),
        }
    }
}

/// One debounce KIND over a shared [`DebounceMutex`]. Execution is
/// exclusive across the whole mutex; coalescing (a caller resolving via a
/// parked runner instead of queueing) is scoped to the slot. A coalesced
/// caller's work must be subsumable by any same-slot runner that runs no
/// earlier than the call — which is why parameterized tasks sharing a slot
/// must read their parameters at RUN time (e.g. the [`Renderer`] geometry
/// command cell), never capture them at call time.
#[derive(Clone)]
pub struct DebounceSlot {
    mutex: DebounceMutex,
    state: Rc<SlotState>,
}

impl DebounceSlot {
    pub async fn debounce_with<T, F, Fut>(&self, f: F) -> ApiResult<T>
    where
        T: Default,
        F: FnOnce(RenderGuard) -> Fut,
        Fut: Future<Output = ApiResult<T>>,
    {
        let state = &self.state;
        let next = state.id.get() + 1;
        if state.parked.get() {
            self.await_settled(next).await;
            return Ok(T::default());
        }

        let settle = SettleGuard::park(state, next);
        let guard = self.mutex.0.mutex.lock().await;
        state.parked.set(false);
        let result = if state.last.get() < next {
            let next = state.id.get() + 1;
            state.id.set(next);
            let held = HeldFlag::set(&self.mutex.0.held);
            let result = f(RenderGuard { _private: () }).await;
            drop(held);
            if result.is_ok() {
                state.last.set(next);
            }

            result
        } else {
            Ok(T::default())
        };

        drop(guard);
        drop(settle);
        result
    }

    async fn await_settled(&self, next: u64) {
        while self.state.settled_id.get() < next {
            if self.state.on_settle.read_next().await.is_err() {
                break;
            }
        }
    }
}

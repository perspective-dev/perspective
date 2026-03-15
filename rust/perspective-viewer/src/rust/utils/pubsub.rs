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

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::{Rc, Weak};

use derivative::Derivative;
use futures::channel::oneshot::*;
use yew::prelude::*;

/// A simple collection with lookup and remove with stable indices, for
/// collecting `Box<dyn Fn()>` which do not implement [`Hash`].
#[derive(Derivative)]
#[derivative(Default(bound = ""))]
struct IndexedSet<T> {
    set: HashMap<usize, T>,
    gen_: usize,
}

impl<T> IndexedSet<T> {
    fn insert(&mut self, v: T) -> usize {
        let key = self.gen_;
        if self.set.insert(key, v).is_some() {
            tracing::warn!("Collision");
        };

        self.gen_ += 1;
        key
    }

    fn remove(&mut self, key: usize) {
        self.set.remove(&key);
    }

    fn iter(&self) -> impl Iterator<Item = &T> {
        self.set.values()
    }

    fn drain(&mut self) -> impl Iterator<Item = T> {
        let mut x = Box::default();
        std::mem::swap(&mut self.set, &mut x);
        x.into_values()
    }
}

type ListenerSet<T> = IndexedSet<Box<dyn Fn(T) + 'static>>;
type ListenerOnceSet<T> = IndexedSet<Box<dyn FnOnce(T) + 'static>>;

#[derive(Derivative)]
#[derivative(Default(bound = ""))]
struct PubSubInternal<T: Clone> {
    deleted: Cell<bool>,
    listeners: RefCell<ListenerSet<T>>,
    once_listeners: RefCell<ListenerOnceSet<T>>,
}

impl<T: Clone> PubSubInternal<T> {
    fn emit(&self, val: T) {
        if self.deleted.get() {
            tracing::warn!("`Callback` invoked after `PubSub` dropped");
        }

        for listener in self.listeners.borrow().iter() {
            listener(val.clone());
        }

        for listener in self.once_listeners.borrow_mut().drain() {
            listener(val.clone());
        }
    }
}

/// A pub/sub struct which allows many listeners to subscribe to many
/// publishers, without leaking callbacks as listeners are dropped.
///
/// Unlike `mpsc` etc., `PubSub` has no internal queue and is completely
/// synchronous.
#[derive(Derivative)]
#[derivative(Default(bound = ""))]
pub struct PubSub<T: Clone>(Rc<PubSubInternal<T>>);

/// An extension trait for [`AddListener::add_listener`], which we want to
/// take a variety of function-like arguments for readability.
pub trait AddListener<T> {
    /// Register a listener to this `PubSub<_>`, which will be automatically
    /// deregistered when the return `Subscription` is dropped.
    ///
    /// # Arguments
    /// - `f` The callback, presumably a function-like type.
    fn add_listener(&self, f: T) -> Subscription;
}

impl<T: Clone + 'static> PubSub<T> {
    /// Emit a value to all listeners.
    ///
    /// # Arguments
    /// - `val` The value to emit.
    pub fn emit(&self, val: T) {
        self.0.emit(val);
    }

    /// Get this `PubSub<_>`'s `.emit_all()` method as a `Callback<T>`.
    #[must_use]
    pub fn callback(&self) -> Callback<T> {
        let internal = self.0.clone();
        Callback::from(move |val: T| internal.emit(val))
    }

    /// Subscribe a `Callback<()>` that fires whenever this PubSub emits,
    /// discarding the emitted value.  Useful when the subscriber only
    /// needs a "something changed" notification.
    pub fn add_notify_listener(&self, cb: &Callback<()>) -> Subscription {
        let cb = cb.clone();
        self.add_listener(move |_: T| cb.emit(()))
    }

    /// Convert [`PubSub::emit`] to a `Box<dyn Fn(T)>`.
    #[must_use]
    pub fn as_boxfn(&self) -> Box<dyn Fn(T) + 'static> {
        let internal = PubSub(self.0.clone());
        Box::new(move |val: T| internal.emit(val))
    }

    /// Await this `PubSub<_>`'s next call to `emit_all()`, once.
    pub async fn read_next(&self) -> Result<T, Canceled> {
        let (sender, receiver) = channel::<T>();
        let f = move |x| sender.send(x).unwrap_or(());
        self.0.once_listeners.borrow_mut().insert(Box::new(f));
        receiver.await
    }

    /// Create a `Subscriber` from this `PubSub`, which is the reciprocal of
    /// `PubSub::callback` (a struct which only allows sending), a struct which
    /// only allows receiving via `Subscriber::add_listener`.
    #[must_use]
    pub fn subscriber(&self) -> Subscriber<T> {
        Subscriber(Rc::<PubSubInternal<T>>::downgrade(&self.0))
    }
}

impl<T: Clone> Drop for PubSub<T> {
    fn drop(&mut self) {
        self.0.deleted.set(true);
    }
}

impl<T: Clone + 'static> AddListener<Callback<T>> for PubSub<T> {
    fn add_listener(&self, f: Callback<T>) -> Subscription {
        let internal = self.0.clone();
        let cb = Box::new(move |x| f.emit(x));
        let key = self.0.listeners.borrow_mut().insert(cb);
        Subscription(Box::new(move || {
            internal.listeners.borrow_mut().remove(key)
        }))
    }
}

impl<T, U> AddListener<U> for PubSub<T>
where
    T: Clone + 'static,
    U: Fn(T) + 'static,
{
    fn add_listener(&self, f: U) -> Subscription {
        let internal = self.0.clone();
        let key = self.0.listeners.borrow_mut().insert(Box::new(f));
        Subscription(Box::new(move || {
            internal.listeners.borrow_mut().remove(key)
        }))
    }
}

/// Like a `PubSub` without `PubSub::emit`; the reciprocal of
/// `PubSub::callback`. `Subscriber` does not keep the parent `PubSub` alive.
#[derive(Clone)]
pub struct Subscriber<T: Clone>(Weak<PubSubInternal<T>>);

impl<T, U> AddListener<U> for Subscriber<T>
where
    T: Clone + 'static,
    U: Fn(T) + 'static,
{
    fn add_listener(&self, f: U) -> Subscription {
        if let Some(internal) = self.0.upgrade() {
            let key = internal.listeners.borrow_mut().insert(Box::new(f));
            Subscription(Box::new(move || {
                internal.listeners.borrow_mut().remove(key)
            }))
        } else {
            Subscription(Box::new(|| {}))
        }
    }
}

impl<T: Clone> Default for Subscriber<T> {
    fn default() -> Self {
        Self(Weak::new())
    }
}

impl<T: Clone> PartialEq for Subscriber<T> {
    fn eq(&self, other: &Self) -> bool {
        match (self.0.upgrade(), other.0.upgrade()) {
            (Some(x), Some(y)) => std::ptr::eq(
                &*x as *const PubSubInternal<T>,
                &*y as *const PubSubInternal<T>,
            ),
            (None, None) => true,
            _ => false,
        }
    }
}

/// Manages the lifetime of a listener registered to a `PubSub<T>` by
/// deregistering the associated listener when dropped.
///
/// The wrapped `Fn` of `Subscriptions` is the deregister closure provided by
/// the issuing `PubSub<T>`.
#[must_use]
pub struct Subscription(Box<dyn Fn()>);

impl Drop for Subscription {
    fn drop(&mut self) {
        (*self.0)();
    }
}

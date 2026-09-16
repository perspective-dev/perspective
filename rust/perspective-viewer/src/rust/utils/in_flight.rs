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

use super::pubsub::PubSub;

/// A refcounted account of concurrent in-flight work, moved only by
/// [`InFlightGuard`]'s `Drop` so no exit path can strand the count.
#[derive(Clone, Default)]
pub struct InFlight(Rc<InFlightData>);

#[derive(Default)]
struct InFlightData {
    count: Cell<u32>,
    changed: PubSub<u32>,
}

/// One unit of in-flight work, moved INTO the future it accounts for.
#[must_use]
pub struct InFlightGuard(InFlight);

impl InFlight {
    pub fn guard(&self) -> InFlightGuard {
        let count = self.0.count.get() + 1;
        self.0.count.set(count);
        self.0.changed.emit(count);
        InFlightGuard(self.clone())
    }

    pub fn count(&self) -> u32 {
        self.0.count.get()
    }

    pub fn is_empty(&self) -> bool {
        self.0.count.get() == 0
    }

    /// Fires with the ABSOLUTE [`Self::count`] on both edges, so subscribers
    /// assign rather than accumulate.
    pub fn changed(&self) -> &PubSub<u32> {
        &self.0.changed
    }

    /// Resolve once every unit in flight has settled.
    pub async fn settle(&self) {
        while self.0.count.get() > 0 {
            if self.0.changed.read_next().await.is_err() {
                break;
            }
        }
    }
}

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        let data = &self.0.0;
        let count = data.count.get();
        debug_assert!(count > 0, "InFlight underflow");
        let count = count.saturating_sub(1);
        data.count.set(count);
        data.changed.emit(count);
    }
}

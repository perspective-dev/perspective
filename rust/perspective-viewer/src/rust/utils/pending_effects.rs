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

/// The element-scoped ledger of in-flight EFFECTS: every effectful public
/// method (and the internal flows they schedule, e.g. the `before-resize`
/// presize) registers an [`EffectGuard`] for the duration of its async
/// work, whether or not the caller awaited it. `flush()` resolves only
/// after the ledger drains, so "called before `flush`" implies "applied
/// before `flush` resolves".
#[derive(Clone, Default)]
pub struct EffectLedger(Rc<EffectLedgerData>);

#[derive(Default)]
struct EffectLedgerData {
    count: Cell<u32>,
    on_drain: PubSub<()>,
}

pub struct EffectGuard(EffectLedger);

impl EffectLedger {
    pub fn guard(&self) -> EffectGuard {
        self.0.count.set(self.0.count.get() + 1);
        EffectGuard(self.clone())
    }

    pub fn is_empty(&self) -> bool {
        self.0.count.get() == 0
    }

    pub async fn settle(&self) {
        while self.0.count.get() > 0 {
            if self.0.on_drain.read_next().await.is_err() {
                break;
            }
        }
    }
}

impl Drop for EffectGuard {
    fn drop(&mut self) {
        let data = &self.0.0;
        data.count.set(data.count.get() - 1);
        if data.count.get() == 0 {
            data.on_drain.emit(());
        }
    }
}

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

use futures::channel::oneshot::*;
use futures::future::join_all;
use wasm_bindgen_futures::spawn_local;
use wasm_bindgen_test::*;

use super::super::request_animation_frame::set_timeout;
use crate::utils::debounce::*;

#[wasm_bindgen_test]
pub async fn test_lock() {
    let debounce_mutex = DebounceMutex::default();
    let cell = Rc::new(Cell::new(0));
    let (sender, receiver) = channel::<bool>();
    spawn_local({
        let cell = cell.clone();
        let debounce_mutex = debounce_mutex.clone();
        async move {
            debounce_mutex
                .lock(async {
                    cell.set(1);
                    set_timeout(10).await.unwrap();
                    cell.set(2);
                })
                .await
        }
    });

    spawn_local({
        let cell = cell.clone();
        let debounce_mutex = debounce_mutex.clone();
        async move {
            debounce_mutex
                .lock(async {
                    for _ in 0..10 {
                        set_timeout(1).await.unwrap();
                        if cell.get() == 1 {
                            sender.send(false).unwrap();
                            return;
                        }
                    }
                    sender.send(cell.get() == 2).unwrap();
                })
                .await
        }
    });

    assert!(receiver.await.unwrap());
}

#[wasm_bindgen_test]
pub async fn test_lock_seq() {
    let debounce_mutex = DebounceMutex::default();
    let cell: Rc<Cell<u32>> = Rc::new(Cell::new(0));

    let tasks = (0..10)
        .map(|_| {
            let cell = cell.clone();
            let debounce_mutex = debounce_mutex.clone();
            async move {
                debounce_mutex
                    .lock(async {
                        set_timeout(10).await.unwrap();
                        cell.set(cell.get() + 1);
                    })
                    .await;
            }
        })
        .collect::<Vec<_>>();

    assert_eq!(join_all(tasks).await.len(), 10);
    assert_eq!(cell.get(), 10);
}

/// A dedicated [`DebounceSlot`]'s task must RUN even when the default slot
/// has a parked runner — coalescing is scoped per slot. Pre-slot (one
/// shared parked flag), `t4` would resolve via `t2`'s settle without its
/// closure ever running: the resize-eaten-by-parked-update bug.
#[wasm_bindgen_test]
pub async fn test_slot_isolated_from_default_coalescing() {
    let debounce_mutex = DebounceMutex::default();
    let slot = debounce_mutex.slot();
    let defaults: Rc<Cell<u32>> = Rc::new(Cell::new(0));
    let slots: Rc<Cell<u32>> = Rc::new(Cell::new(0));

    let t1 = debounce_mutex.lock(async {
        set_timeout(10).await.unwrap();
    });

    let t2 = {
        let defaults = defaults.clone();
        debounce_mutex.debounce(async move {
            defaults.set(defaults.get() + 1);
            Ok(())
        })
    };

    let t3 = {
        let defaults = defaults.clone();
        debounce_mutex.debounce(async move {
            defaults.set(defaults.get() + 100);
            Ok(())
        })
    };

    let t4 = {
        let slots = slots.clone();
        slot.debounce_with(|_| async move {
            slots.set(slots.get() + 1);
            Ok(())
        })
    };

    let (_, r2, r3, r4) = futures::join!(t1, t2, t3, t4);
    r2.unwrap();
    r3.unwrap();
    r4.unwrap();

    // `t3` coalesced onto the parked `t2`; `t4` ran its own closure.
    assert_eq!(defaults.get(), 1);
    assert_eq!(slots.get(), 1);
}

#[wasm_bindgen_test]
pub async fn test_debounce_seq() {
    let debounce_mutex = DebounceMutex::default();
    let cell: Rc<Cell<u32>> = Rc::new(Cell::new(0));

    let tasks = (0..10)
        .map(|_| {
            let cell = cell.clone();
            let debounce_mutex = debounce_mutex.clone();
            async move {
                debounce_mutex
                    .debounce(async {
                        set_timeout(10).await.unwrap();
                        cell.set(cell.get() + 1);
                        Ok(())
                    })
                    .await
                    .unwrap();
            }
        })
        .collect::<Vec<_>>();

    assert_eq!(join_all(tasks).await.len(), 10);
    assert!(cell.get() < 10);
    assert!(cell.get() > 0);
}

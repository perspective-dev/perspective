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
use std::collections::VecDeque;
use std::future::Future;
use std::rc::Rc;

use perspective::utils::global;
use serde::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

/// A utility struct to track and calculate framerate metrics.
#[derive(Default, Clone)]
pub struct MovingWindowRenderTimer(Rc<RefCell<RenderTimerType>>);

enum RenderTimerType {
    Moving(Closure<dyn Fn(JsValue)>, Rc<RefCell<RenderTimerState>>),
    Constant(f64),
}

pub struct RenderTimerState {
    render_times: VecDeque<f64>,
    total_render_count: u32,
    start_time: f64,
}

/// Serialization of snapshot stats for the JS API call.
#[derive(Clone, Serialize)]
pub struct RenderTimerStats {
    render_times: VecDeque<f64>,
    total_render_count: u32,
    total_time: f64,
    virtual_fps: f64,
    actual_fps: f64,
}

impl MovingWindowRenderTimer {
    pub async fn capture_time<T>(&self, f: impl Future<Output = T>) -> T {
        let perf = global::window().performance().unwrap();
        let start = match *self.0.borrow() {
            RenderTimerType::Constant(_) => 0_f64,
            RenderTimerType::Moving(..) => perf.now(),
        };

        let result = f.await;
        match &mut *self.0.borrow_mut() {
            RenderTimerType::Moving(_, timings) => {
                let mut stats = timings.borrow_mut();
                let now = perf.now();
                stats.render_times.push_back(now - start);
                if stats.render_times.len() > 5 {
                    stats.render_times.pop_front();
                }

                stats.total_render_count += 1;
            },
            RenderTimerType::Constant(_) => (),
        };

        result
    }

    pub fn get_stats(&self) -> Option<RenderTimerStats> {
        match &*self.0.borrow_mut() {
            RenderTimerType::Constant(_) => None,
            RenderTimerType::Moving(_, timings) => {
                let perf = global::window().performance().unwrap();
                let mut state = timings.borrow_mut();
                let stats = (&*state).into();
                state.total_render_count = 0;
                state.start_time = perf.now();
                Some(stats)
            },
        }
    }

    pub fn set_throttle(&mut self, val: Option<f64>) {
        match val {
            None => {
                *self.0.borrow_mut() = RenderTimerType::default();
            },
            Some(val) => {
                *self.0.borrow_mut() = RenderTimerType::Constant(val);
            },
        }
    }

    pub fn get_throttle(&self) -> i32 {
        match &*self.0.borrow() {
            RenderTimerType::Constant(constant) => *constant as i32,
            RenderTimerType::Moving(_, timings) => {
                let state = timings.borrow();
                if state.render_times.len() < 5 {
                    0_i32
                } else {
                    f64::min(5000_f64, state.virtual_fps()) as i32
                }
            },
        }
    }
}

impl Drop for RenderTimerType {
    fn drop(&mut self) {
        if let Self::Moving(closure, _) = self {
            global::document()
                .remove_event_listener_with_callback(
                    "visibilitychange",
                    closure.as_ref().unchecked_ref(),
                )
                .unwrap();
        }
    }
}

impl Default for RenderTimerType {
    fn default() -> Self {
        let state: Rc<RefCell<RenderTimerState>> = Default::default();
        Self::Moving(state.register_on_visibility_change(), state)
    }
}

impl RenderTimerState {
    fn virtual_fps(&self) -> f64 {
        let sum = self.render_times.iter().sum::<f64>();
        let len = self.render_times.len() as f64;
        sum / len
    }
}

#[extend::ext]
impl RefCell<RenderTimerState> {
    /// We need to clear the throttle queue when the browser tab is hidden, else
    /// the next frame timing will be the time the tab was hidden + render time.
    fn register_on_visibility_change(self: &Rc<Self>) -> Closure<dyn Fn(JsValue)> {
        let state = self.clone();
        let closure = Closure::new(move |_| {
            *state.borrow_mut() = Default::default();
        });

        global::document()
            .add_event_listener_with_callback("visibilitychange", closure.as_ref().unchecked_ref())
            .unwrap();

        closure
    }
}

impl Default for RenderTimerState {
    fn default() -> Self {
        let perf = global::window().performance().unwrap();
        let start_time = perf.now();
        Self {
            render_times: Default::default(),
            total_render_count: Default::default(),
            start_time,
        }
    }
}

impl From<&RenderTimerState> for RenderTimerStats {
    fn from(value: &RenderTimerState) -> Self {
        let perf = global::window().performance().unwrap();
        let now = perf.now();
        let total_time = now - value.start_time;
        RenderTimerStats {
            render_times: value.render_times.clone(),
            total_render_count: value.total_render_count,
            total_time,
            actual_fps: value.total_render_count as f64 / (total_time / 1000_f64),
            virtual_fps: 1000_f64 / value.virtual_fps(),
        }
    }
}

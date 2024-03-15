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

//! A catch all for project-wide macros and general-purpose functions that are
//! not directly related to Perspective.  Modules below `crate::utils` strive
//! to be single-responsibility, but some reference other `crate::utils`
//! modules when it helps reduce boiler-plate.

mod browser;

mod custom_element;
mod datetime;
mod debounce;
mod number_format;
mod pubsub;
mod scope;
mod tee;
mod wasm_abi;
mod weak_scope;

#[cfg(test)]
mod tests;

pub use browser::*;
pub use custom_element::*;
pub use datetime::*;
pub use debounce::*;
pub use number_format::*;
pub use perspective_client::clone;
pub use pubsub::*;
pub use scope::*;
pub use tee::*;
pub use weak_scope::*;

#[macro_export]
macro_rules! maybe {
    ($($exp:stmt);*) => {{
        let x = ({
            #[inline(always)]
            || {
                $($exp)*
            }
        })();
        x
    }};
}

#[macro_export]
macro_rules! js_log_maybe {
    ($($exp:tt)+) => {{
        let x = ({
            #[inline(always)]
            || {
                {
                    $($exp)+
                };
                Ok(())
            }
        })();
        x.unwrap_or_else(|e| web_sys::console::warn_1(&e))
    }};
}

#[macro_export]
macro_rules! max {
    ($x:expr) => ($x);
    ($x:expr, $($z:expr),+ $(,)?) => {{
        let x = $x;
        let y = max!($($z),*);
        if x > y {
            x
        } else {
            y
        }
    }}
}

#[macro_export]
macro_rules! min {
    ($x:expr) => ($x);
    ($x:expr, $($z:expr),+ $(,)?) => {{
        let x = $x;
        let y = min!($($z),*);
        if x < y {
            x
        } else {
            y
        }
    }}
}

#[macro_export]
macro_rules! js_log {
    ($x:expr) => {{
        const DEBUG_ONLY_WARNING: &str = $x;
        web_sys::console::log_1(&wasm_bindgen::JsValue::from($x));
    }};
    ($x:expr $(, $y:expr)*) => {{
        const DEBUG_ONLY_WARNING: &str = $x;
        web_sys::console::log_1(&format!($x, $($y),*).into());
    }};
}

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

/// A helper to for the pattern `let x2 = x;` necessary to clone structs
/// destined for an `async` or `'static` closure stack.  This is like `move || {
/// .. }` or `move async { .. }`, but for clone semantics.  `clone!()` works
/// with symbols as well as properties and methods, using the last symbol name
/// in the method chain, or an alias via `x = ...` syntax.
///
/// # Examples
///
/// ```
/// clone!(my_struct.option_method(), alias = my_struct.prop1.my_rc);
/// println!("These bindings exist: {:?} {:?}", option_method, alias);
/// ```
#[macro_export]
macro_rules! clone {
    (impl @bind $i:tt { $($orig:tt)* } { }) => {
        let $i = $($orig)*.clone();
    };

    (impl @bind $i:tt { $($orig:tt)* } { $binder:tt }) => {
        let $binder = $($orig)*.clone();
    };

    (impl @expand { $($orig:tt)* } { $($binder:tt)* } $i:tt) => {
        $crate::clone!(impl @bind $i { $($orig)* $i } { $($binder)* });
    };

    (impl @expand { $($orig:tt)* } { $($binder:tt)* } $i:tt ()) => {
        $crate::clone!(impl @bind $i { $($orig)* $i () } { $($binder)* });
    };

    (impl @expand { $($orig:tt)* } { $($binder:tt)* } $i:tt . 0) => {
        $crate::clone!(impl @bind $i { $($orig)* $i . 0 } { $($binder)* });
    };

    (impl @expand { $($orig:tt)* } { $($binder:tt)* } $i:tt . 1) => {
        $crate::clone!(impl @bind $i { $($orig)* $i . 1 } { $($binder)* });
    };

    (impl @expand { $($orig:tt)* } { $($binder:tt)* } $i:tt . 2) => {
        $crate::clone!(impl @bind $i { $($orig)* $i . 2 } { $($binder)* });
    };

    (impl @expand { $($orig:tt)* } { $($binder:tt)* } $i:tt . 3) => {
        $crate::clone!(impl @bind $i { $($orig)* $i . 3 } { $($binder)* });
    };

    (impl @expand { $($orig:tt)* } { $($binder:tt)* } $i:tt = $($tail:tt)+) => {
        $crate::clone!(impl @expand { $($orig)* } { $i } $($tail)+);
    };

    (impl @expand { $($orig:tt)* } { $($binder:tt)* } $i:tt $($tail:tt)+) => {
        $crate::clone!(impl @expand { $($orig)* $i } { $($binder)* } $($tail)+);
    };

    (impl @context { $($orig:tt)* } $tail:tt) => {
        $crate::clone!(impl @expand { } { } $($orig)* $tail);
    };

    (impl @context { $($orig:tt)* } , $($tail:tt)+) => {
        $crate::clone!(impl @expand { } { } $($orig)*);
        $crate::clone!(impl @context { } $($tail)+);
    };

    (impl @context { $($orig:tt)* } $i:tt $($tail:tt)+) => {
        $crate::clone!(impl @context { $($orig)* $i } $($tail)+);
    };

    ($($tail:tt)+) => {
        $crate::clone!(impl @context { } $($tail)+);
    }
}

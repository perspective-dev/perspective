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

//! Async tasks and model traits for coordinating state between `Session`,
//! `Renderer`, `Presentation`, and `DragDrop` singletons.
//!
//! Complex operations that span more than one state object are expressed as
//! traits whose bounds name exactly the state objects they require (e.g.
//! `UpdateAndRender: HasSession + HasRenderer`).  Blanket impls apply the
//! trait to any struct that holds those fields and provides `Has*` accessors.

mod column_locator;
mod columns_iter_set;
mod copy_export;
mod edit_expression;
mod eject;
mod export_app;
mod export_method;
mod get_viewer_config;
mod intersection_observer;
mod is_invalid_drop;
mod plugin_column_styles;
mod resize_observer;
mod restore_and_render;
mod send_plugin_config;
mod structural;
mod update_and_render;

pub use self::column_locator::*;
pub use self::columns_iter_set::*;
pub use self::copy_export::*;
pub use self::edit_expression::*;
pub use self::eject::*;
pub use self::export_method::*;
pub use self::get_viewer_config::*;
pub use self::intersection_observer::*;
pub use self::is_invalid_drop::is_invalid_columns_column;
pub use self::plugin_column_styles::*;
pub use self::resize_observer::*;
pub use self::restore_and_render::*;
pub use self::send_plugin_config::*;
pub use self::structural::*;
pub use self::update_and_render::*;

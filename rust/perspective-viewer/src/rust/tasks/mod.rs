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

//! State-mutating async business logic dispatched from user actions.
//!
//! Every function in this module ends in side effects on one or more of
//! [`Session`], [`Renderer`], [`Presentation`] — applying a
//! `ViewConfigUpdate`, drawing the active plugin, mutating expressions, etc.
//! Read-only async derivations belong in [`crate::queries`].
//!
//! [`Session`]: crate::session::Session
//! [`Renderer`]: crate::renderer::Renderer
//! [`Presentation`]: crate::presentation::Presentation

mod copy_export;
mod dismiss_render_warning;
mod edit_expression;
mod eject;
mod intersection_observer;
mod reset_all;
mod resize_observer;
mod restore_and_render;
mod send_column_config;
mod send_plugin_config;
mod update_and_render;
mod update_theme;
mod validate_expression;

pub use self::copy_export::*;
pub use self::dismiss_render_warning::*;
pub use self::edit_expression::*;
pub use self::eject::*;
pub use self::intersection_observer::*;
pub use self::reset_all::*;
pub use self::resize_observer::*;
pub use self::restore_and_render::*;
pub use self::send_column_config::*;
pub use self::send_plugin_config::*;
pub use self::update_and_render::*;
pub use self::update_theme::*;
pub use self::validate_expression::*;

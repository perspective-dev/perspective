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

mod apply_global_filters;
mod auto_pause;
mod copy_export;
mod create_panel;
mod dismiss_render_warning;
mod edit_expression;
mod eject;
mod pipeline;
mod presize_panels;
mod reset_all;
mod resize_observer;
mod restore_and_render;
mod restore_panel;
mod send_column_config;
mod send_plugin_config;
mod set_edit_mode;
mod sync_update_panels;
mod table_lifecycle;
mod update_theme;
mod validate_expression;

/// How long staged work (a hidden first draw, a presize sweep) may withhold
/// a layout transition before it is released anyway — the progressive-reveal
/// fallback for slow (e.g. remote) tables.
pub(crate) const STAGING_DEADLINE_MS: i32 = 500;

/// Fallback panel chrome `(width, height)` px (margin + border + titlebar)
/// when no frame is available to measure live (see
/// [`presize_panels::plugin_chrome`]).
pub(crate) const CHROME_FALLBACK: (f64, f64) = (8.0, 33.0);

pub use self::apply_global_filters::*;
pub use self::auto_pause::*;
pub use self::copy_export::*;
pub(crate) use self::create_panel::*;
pub use self::dismiss_render_warning::*;
pub use self::edit_expression::*;
pub use self::eject::*;
pub use self::pipeline::*;
pub use self::presize_panels::*;
pub use self::reset_all::*;
pub use self::resize_observer::*;
pub use self::restore_and_render::*;
pub(crate) use self::restore_panel::*;
pub use self::send_column_config::*;
pub use self::send_plugin_config::*;
pub use self::set_edit_mode::*;
pub(crate) use self::sync_update_panels::*;
pub(crate) use self::table_lifecycle::*;
pub use self::update_theme::*;
pub use self::validate_expression::*;

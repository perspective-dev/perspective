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

use crate::presentation::OpenColumnSettings;
use crate::utils::PtrEqRc;

/// Value-semantic snapshot of the drag/drop state threaded through the
/// component tree for visual feedback (drag-highlight CSS classes).
#[derive(Clone, Debug, PartialEq, Default)]
pub struct DragDropProps {
    /// Column name currently being dragged, if a drag is in progress.
    pub column: Option<String>,
}

/// Value-semantic snapshot of the presentation/UI state used by the root
/// component to drive `is_settings_open`, `selected_theme`, and
/// `available_themes` into child components via plain props.
///
/// The `HtmlElement` handle, async theme-detection machinery, column-settings
/// state, and per-column config live in `PresentationEngine` and are not
/// passed as props.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct PresentationProps {
    /// Whether the settings panel is currently open.
    pub is_settings_open: bool,

    /// Detected theme names, in discovery order.
    pub available_themes: PtrEqRc<Vec<String>>,

    /// The currently selected theme name, if any theme is active.
    pub selected_theme: Option<String>,

    /// Snapshot of the currently opened column-settings sidebar state.
    pub open_column_settings: OpenColumnSettings,

    /// Whether this viewer is hosted inside a `<perspective-workspace>`.
    pub is_workspace: bool,
}

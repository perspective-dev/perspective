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

//! The window and host DOM listeners the root owns: the shift-key affordance
//! and master/detail selection.

use std::collections::HashMap;

use perspective_client::config::{Filter, FilterTerm, Scalar};
use perspective_js::utils::*;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::{FocusEvent, KeyboardEvent};
use yew::prelude::*;

use super::PerspectiveViewer;
use super::msg::{MasterSelection, PerspectiveViewerMsg};

/// Window listeners that toggle the `.shift-active` class on the host element
/// while the Shift key is held, making Shift-modified affordances (e.g.
/// inactive column add, active column remove, status-bar reset) visually
/// discoverable. Stored so the closures outlive `create`.
pub(super) struct ShiftListeners {
    elem: web_sys::HtmlElement,
    keydown: Closure<dyn FnMut(KeyboardEvent)>,
    keyup: Closure<dyn FnMut(KeyboardEvent)>,
    blur: Closure<dyn FnMut(FocusEvent)>,
}

impl Drop for ShiftListeners {
    fn drop(&mut self) {
        let win = global::window();
        let _ = win
            .remove_event_listener_with_callback("keydown", self.keydown.as_ref().unchecked_ref());
        let _ =
            win.remove_event_listener_with_callback("keyup", self.keyup.as_ref().unchecked_ref());
        let _ = win.remove_event_listener_with_callback("blur", self.blur.as_ref().unchecked_ref());
        let _ = self.elem.class_list().remove_1("shift-active");
        crate::utils::stamp_plugin_host_state_all(&self.elem);
    }
}

pub(super) fn install_shift_listeners(elem: web_sys::HtmlElement) -> ShiftListeners {
    let keydown = {
        let elem = elem.clone();
        Closure::wrap(Box::new(move |event: KeyboardEvent| {
            if event.key() == "Shift" {
                let _ = elem.class_list().add_1("shift-active");
                crate::utils::stamp_plugin_host_state_all(&elem);
            }
        }) as Box<dyn FnMut(KeyboardEvent)>)
    };

    let keyup = {
        let elem = elem.clone();
        Closure::wrap(Box::new(move |event: KeyboardEvent| {
            if event.key() == "Shift" {
                let _ = elem.class_list().remove_1("shift-active");
                crate::utils::stamp_plugin_host_state_all(&elem);
            }
        }) as Box<dyn FnMut(KeyboardEvent)>)
    };

    let blur = {
        let elem = elem.clone();
        Closure::wrap(Box::new(move |_: FocusEvent| {
            let _ = elem.class_list().remove_1("shift-active");
            crate::utils::stamp_plugin_host_state_all(&elem);
        }) as Box<dyn FnMut(FocusEvent)>)
    };

    let win = global::window();
    let _ = win.add_event_listener_with_callback("keydown", keydown.as_ref().unchecked_ref());
    let _ = win.add_event_listener_with_callback("keyup", keyup.as_ref().unchecked_ref());
    let _ = win.add_event_listener_with_callback("blur", blur.as_ref().unchecked_ref());

    ShiftListeners {
        elem,
        keydown,
        keyup,
        blur,
    }
}

/// The `perspective-global-filter` host listener (master/detail): routes a
/// master panel's selection state to
/// [`PerspectiveViewerMsg::MasterContribution`] — `selected: true` REPLACES
/// the panel's contribution with the event's filters, `selected: false`
/// clears it. Kept alive on the root; attached once in `rendered`.
pub(super) fn global_filter_listener(
    ctx: &Context<PerspectiveViewer>,
) -> Closure<dyn FnMut(web_sys::Event)> {
    let cb = ctx
        .link()
        .callback(|(panel, selection)| PerspectiveViewerMsg::MasterContribution(panel, selection));

    Closure::wrap(Box::new(move |event: web_sys::Event| {
        // `PerspectiveSelectDetail` exposes `selected`/`insertFilters` as
        // prototype *getters*; struct deserialization reads each field by
        // named property access (not own-key enumeration), so the getters are
        // invoked — a map target would see none of them. Field names mirror
        // the detail EXACTLY — it mixes `insertFilters` (camel) with
        // `column_names` (snake), so no `rename_all`.
        #[derive(serde::Deserialize)]
        struct SelectDetail {
            // Only multi-panel selections (carrying a source `panel` id) route.
            panel: Option<String>,

            #[serde(default)]
            selected: bool,

            #[serde(default, rename = "insertFilters")]
            insert_filters: Vec<Filter>,

            #[serde(default)]
            row: HashMap<String, serde_json::Value>,

            #[serde(default)]
            column_names: Vec<serde_json::Value>,
        }

        let Some(ce) = event.dyn_ref::<web_sys::CustomEvent>() else {
            return;
        };

        let Ok(SelectDetail {
            panel: Some(panel),
            selected,
            insert_filters,
            row,
            column_names,
        }) = ce.detail().into_serde_ext()
        else {
            return;
        };

        let selection = selected.then(|| MasterSelection {
            cell_fallback: cell_fallback(&row, &column_names),
            filters: insert_filters,
            clear_if_underivable: true,
        });

        cb.emit((panel, selection));
    }) as Box<dyn FnMut(web_sys::Event)>)
}

/// The `perspective-click` host listener: a click on a MASTER panel is a
/// selection too (chart bars, flat datagrids — plugins whose click carries
/// the clicked datum but which have no select mode), routed as an
/// always-`Some` [`PerspectiveViewerMsg::MasterContribution`]. Clicks have no
/// deselect arm — deselection arrives via the `perspective-global-filter`
/// listener or the bar's chip ×. Non-master panels' clicks are dropped by the
/// handler's `is_master` guard, and the datagrid suppresses clicks entirely
/// in its row-select mode so a select/deselect never races a click echo.
pub(super) fn master_click_listener(
    ctx: &Context<PerspectiveViewer>,
) -> Closure<dyn FnMut(web_sys::Event)> {
    let cb = ctx
        .link()
        .callback(|(panel, selection)| PerspectiveViewerMsg::MasterContribution(panel, selection));

    Closure::wrap(Box::new(move |event: web_sys::Event| {
        #[derive(serde::Deserialize)]
        struct ClickConfig {
            #[serde(default)]
            filter: Vec<Filter>,
        }

        #[derive(serde::Deserialize)]
        struct ClickDetail {
            // Only multi-panel clicks (carrying a source `panel` id) route.
            panel: Option<String>,

            #[serde(default)]
            config: Option<ClickConfig>,

            #[serde(default)]
            row: HashMap<String, serde_json::Value>,

            #[serde(default)]
            column_names: Vec<serde_json::Value>,
        }

        let Some(ce) = event.dyn_ref::<web_sys::CustomEvent>() else {
            return;
        };

        let Ok(ClickDetail {
            panel: Some(panel),
            config,
            row,
            column_names,
        }) = ce.detail().into_serde_ext()
        else {
            return;
        };

        let selection = MasterSelection {
            cell_fallback: cell_fallback(&row, &column_names),
            filters: config.map(|x| x.filter).unwrap_or_default(),
            clear_if_underivable: false,
        };

        cb.emit((panel, Some(selection)));
    }) as Box<dyn FnMut(web_sys::Event)>)
}

/// Synthesize the clicked-cell `[column, "==", value]` fallback clause from a
/// select/click detail's `row` + `column_names` — the broadcast for masters
/// whose events carry no derivable filters (e.g. a FLAT datagrid, whose rows
/// have no group-by path). The first real (non-`__`-internal, string-named)
/// column with a scalar value in the row wins.
fn cell_fallback(
    row: &HashMap<String, serde_json::Value>,
    column_names: &[serde_json::Value],
) -> Option<Filter> {
    let column = column_names
        .iter()
        .filter_map(|x| x.as_str())
        .find(|x| !x.starts_with("__"))?;

    let term = match row.get(column)? {
        serde_json::Value::Bool(x) => Scalar::Bool(*x),
        serde_json::Value::Number(x) => Scalar::Float(x.as_f64()?),
        serde_json::Value::String(x) => Scalar::String(x.clone()),
        _ => return None,
    };

    Some(Filter::new(column, "==", FilterTerm::Scalar(term)))
}

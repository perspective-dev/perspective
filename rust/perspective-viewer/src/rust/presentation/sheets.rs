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

use js_sys::{Array, Set};
use perspective_js::utils::global;
use wasm_bindgen::prelude::*;
use web_sys::*;

const THEME_NAME: &str = "--psp-theme-name";

const SELECTOR_TOKEN: &str = "perspective-viewer";

/// The theme names registered by every style rule reachable from `elem`'s
/// document and hosting shadow root which declares `--psp-theme-name` and
/// whose selector names `perspective-viewer`, in discovery order.
pub fn get_theme_names(elem: &HtmlElement) -> Vec<String> {
    let mut walk = Walk {
        seen: Set::new(&JsValue::UNDEFINED),
        names: vec![],
    };

    let document = global::document();
    walk.visit_sheet_list(&document.style_sheets());
    walk.visit_adopted(&document.adopted_style_sheets());
    if let Some(root) = elem.get_root_node().dyn_ref::<ShadowRoot>() {
        walk.visit_sheet_list(&root.style_sheets());
        walk.visit_adopted(&root.adopted_style_sheets());
    }

    walk.names
}

struct Walk {
    seen: Set,
    names: Vec<String>,
}

impl Walk {
    fn visit_sheet_list(&mut self, sheets: &StyleSheetList) {
        for i in 0..sheets.length() {
            if let Some(sheet) = sheets.item(i) {
                self.visit_sheet(sheet.unchecked_ref::<CssStyleSheet>());
            }
        }
    }

    fn visit_adopted(&mut self, sheets: &Array) {
        for sheet in sheets.iter() {
            if let Some(sheet) = sheet.dyn_ref::<CssStyleSheet>() {
                self.visit_sheet(sheet);
            }
        }
    }

    fn visit_sheet(&mut self, sheet: &CssStyleSheet) {
        if self.seen.has(sheet) {
            return;
        }

        self.seen.add(sheet);
        if let Ok(rules) = sheet.css_rules() {
            self.visit_rules(&rules);
        }
    }

    fn visit_rules(&mut self, rules: &CssRuleList) {
        for i in 0..rules.length() {
            if let Some(rule) = rules.item(i) {
                self.visit_rule(&rule);
            }
        }
    }

    fn visit_rule(&mut self, rule: &CssRule) {
        if let Some(style) = rule.dyn_ref::<CssStyleRule>() {
            self.register(style);
        }

        if let Some(import) = rule.dyn_ref::<CssImportRule>()
            && let Some(sheet) = import.style_sheet()
        {
            self.visit_sheet(&sheet);
        }

        if let Some(group) = rule.dyn_ref::<CssGroupingRule>() {
            self.visit_rules(&group.css_rules());
        }
    }

    fn register(&mut self, rule: &CssStyleRule) {
        let Ok(value) = rule.style().get_property_value(THEME_NAME) else {
            return;
        };

        let value = value.trim();
        if value.is_empty() || !rule.selector_text().contains(SELECTOR_TOKEN) {
            return;
        }

        let name = value
            .strip_prefix('"')
            .and_then(|x| x.strip_suffix('"'))
            .or_else(|| value.strip_prefix('\'').and_then(|x| x.strip_suffix('\'')))
            .unwrap_or(value);

        if !self.names.iter().any(|x| x == name) {
            self.names.push(name.to_owned());
        }
    }
}

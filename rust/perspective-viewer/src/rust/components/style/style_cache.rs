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
use std::collections::BTreeMap;
use std::ops::Deref;
use std::rc::Rc;

use perspective::utils::global;
use web_sys::HtmlStyleElement;

use crate::*;

type CSSResource = (&'static str, &'static str);

/// A dictionary of CSS fragments for native HTML elements which should always
/// be loaded (and perhaps lack yew components wrappers from which to have
/// their styles registered).
static DOM_STYLES: &[CSSResource] = &[css!("dom/checkbox"), css!("dom/select")];

/// A state object for `<style>` snippets used by a yew `Component` with a
/// `<StyleProvider>` at the root.
#[derive(Clone)]
pub struct StyleCache(Rc<StyleCacheData>);

impl Deref for StyleCache {
    type Target = StyleCacheData;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl PartialEq for StyleCache {
    fn eq(&self, _other: &Self) -> bool {
        true
    }
}

impl StyleCache {
    pub fn new(is_shadow: bool) -> StyleCache {
        StyleCache(Rc::new(StyleCacheData::new(is_shadow)))
    }

    /// Insert a new stylesheet into this manager, _immediately_ inserting it
    /// into the DOM as well if any other elements are already connected,
    /// bypassing yew rendering;  when the yew `Component::view` method is
    /// later invoked, this element will get re-attached to the same parent
    /// (though likely in a different order).
    ///
    /// This is done synchronously because CSS registration occurs during
    /// the `create` lifecycle phase, and we want these style elements to be
    /// attached _before_ the style's target nodes are attached.
    pub fn add_style(&self, name: &'static str, css: &'static str) {
        let mut map = self.0.styles.borrow_mut();
        if !map.contains_key(name) {
            let style = Self::into_style(name, css, self.0.is_shadow);
            let first = map.values().next().cloned();
            map.insert(name, style.clone());
            if let Some(x) = first {
                x.parent_node()
                    .unwrap_or_else(|| x.get_root_node())
                    .insert_before(&style, Some(&x))
                    .unwrap();
            }
        }
    }

    /// Concert a CSS string to an `HtmlStyleElement`, which are memoized due
    /// to their size and DOM performance impact.
    fn into_style(name: &str, css: &str, is_shadow: bool) -> web_sys::HtmlStyleElement {
        let elem = global::document().create_element("style").unwrap();
        if is_shadow {
            elem.set_text_content(Some(css));
        } else {
            let new_css = css.replace(":host", ":root");
            elem.set_text_content(Some(&new_css));
        }

        elem.set_attribute("name", name).unwrap();
        elem.unchecked_into()
    }

    pub fn iter_styles(&self) -> impl Iterator<Item = (&'static str, HtmlStyleElement)> {
        self.styles.borrow().clone().into_iter()
    }
}

/// Using a `BTreeMap` so the resulting `<style>` elements have a stable order
/// when rendered to the DOM.
pub struct StyleCacheData {
    styles: RefCell<BTreeMap<&'static str, web_sys::HtmlStyleElement>>,
    is_shadow: bool,
}

impl StyleCacheData {
    fn new(is_shadow: bool) -> Self {
        let styles = DOM_STYLES
            .iter()
            .map(|x| (x.0, StyleCache::into_style(x.0, x.1, is_shadow)));

        Self {
            styles: RefCell::new(styles.collect()),
            is_shadow,
        }
    }
}

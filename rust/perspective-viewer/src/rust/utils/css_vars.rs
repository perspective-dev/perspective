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

use web_sys::{Element, HtmlElement};

const PAGE_SCHEME_VAR: &str = "--psp-page-color-scheme";
const UNSET_COLOR: &str = "rgba(0, 0, 0, 0)";

/// The computed value of custom property `name` on `elem`, trimmed, or
/// `None` when undefined, empty, or the unset value of a registered color.
pub fn read_custom_property(elem: &Element, name: &str) -> Option<String> {
    let value = web_sys::window()?
        .get_computed_style(elem)
        .ok()??
        .get_property_value(name)
        .ok()?;

    let value = value.trim();
    (!value.is_empty() && value != UNSET_COLOR).then(|| value.to_owned())
}

/// The intl string `--psp-label--{slug}--content` as inherited by `elem`,
/// unquoted, or `None` when no theme defines it.
pub fn read_intl_string(elem: &Element, slug: &str) -> Option<String> {
    let raw = read_custom_property(elem, &format!("--psp-label--{slug}--content"))?;
    let unquoted = raw
        .strip_prefix('"')
        .and_then(|x| x.strip_suffix('"'))
        .or_else(|| raw.strip_prefix('\'').and_then(|x| x.strip_suffix('\'')))
        .unwrap_or(&raw);

    Some(unquoted.replace("\\\"", "\""))
}

/// Copy the `color-scheme` computed on `host`'s parent onto `host` as
/// `--psp-page-color-scheme`, reading `normal` as `light dark`, so a theme
/// rule on a descendant can resolve against the page's scheme rather than
/// the one the host's own theme pins.
pub fn stamp_page_color_scheme(host: &HtmlElement) {
    let style = host.style();
    let Some(parent) = host.parent_element() else {
        let _ = style.remove_property(PAGE_SCHEME_VAR);
        return;
    };

    let scheme = web_sys::window()
        .and_then(|window| window.get_computed_style(&parent).ok().flatten())
        .and_then(|computed| computed.get_property_value("color-scheme").ok())
        .unwrap_or_default();

    let scheme = match scheme.trim() {
        "" | "normal" => "light dark",
        scheme => scheme,
    };

    let _ = style.set_property(PAGE_SCHEME_VAR, scheme);
}

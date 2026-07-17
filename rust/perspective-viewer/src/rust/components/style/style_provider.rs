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

use wasm_bindgen::{JsCast, JsValue};
use yew::prelude::*;

use super::surface_sheet;

/// Which prebuilt CSS bundle a [`StyleProvider`] adopts into its root.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum StyleSurface {
    /// The `<perspective-viewer>` ShadowRoot.
    #[default]
    Viewer,
    /// Column-name completion dropdown (inverted color scheme).
    ColumnDropdown,
    /// Filter-value completion dropdown.
    FilterDropdown,
    /// Expression function-completion dropdown.
    FunctionDropdown,
    /// Copy / Export menu (non-inverted color scheme).
    DropdownMenu,
    /// Panel context menu (right-click a panel).
    ContextMenu,
}

#[derive(Properties, PartialEq)]
pub struct StyleProviderProps {
    pub root: web_sys::HtmlElement,

    #[prop_or(true)]
    pub is_shadow: bool,

    #[prop_or_default]
    pub surface: StyleSurface,

    pub children: Children,
}

/// Adopts the build-time CSS bundle for its [`StyleSurface`] into the root's
/// `adoptedStyleSheets` once, on creation. Unlike the previous per-snippet
/// `LocalStyle` registration, children no longer register CSS individually.
pub struct StyleProvider;

impl Component for StyleProvider {
    type Message = ();
    type Properties = StyleProviderProps;

    fn create(ctx: &Context<Self>) -> Self {
        adopt_surface_sheet(ctx.props());
        Self
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        html! { <>{ for ctx.props().children.iter() }</> }
    }
}

/// Push the surface's shared stylesheet onto the root's `adoptedStyleSheets`,
/// unless it is already present (a root may host more than one provider).
fn adopt_surface_sheet(props: &StyleProviderProps) {
    let root: JsValue = if props.is_shadow {
        props.root.shadow_root().unwrap().into()
    } else {
        web_sys::window().unwrap().document().unwrap().into()
    };

    let sheets = js_sys::Reflect::get(&root, &"adoptedStyleSheets".into())
        .unwrap()
        .unchecked_into::<js_sys::Array>();

    let sheet = surface_sheet(props.surface);
    let sheet_val: &JsValue = sheet.as_ref();
    if sheets.index_of(sheet_val, 0) < 0 {
        sheets.push(sheet_val);
    }
}

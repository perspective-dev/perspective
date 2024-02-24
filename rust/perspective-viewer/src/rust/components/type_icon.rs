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

use perspective_client::ColumnType;
use yew::html::IntoPropValue;
use yew::{classes, function_component, html, Properties};

use crate::components::style::LocalStyle;
use crate::css;

#[derive(PartialEq, Debug, Clone, Copy)]
pub enum TypeIconType {
    Type(ColumnType),
    Expr,
}
impl From<ColumnType> for TypeIconType {
    fn from(value: ColumnType) -> Self {
        Self::Type(value)
    }
}
impl IntoPropValue<TypeIconType> for ColumnType {
    fn into_prop_value(self) -> TypeIconType {
        TypeIconType::Type(self)
    }
}
impl std::fmt::Display for TypeIconType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TypeIconType::Type(t) => f.write_fmt(format_args!("{t}")),
            TypeIconType::Expr => f.write_str("expression"),
        }
    }
}

#[derive(PartialEq, Properties, Debug)]
pub struct TypeIconProps {
    pub ty: TypeIconType,
}

#[function_component(TypeIcon)]
pub fn type_icon(p: &TypeIconProps) -> yew::Html {
    let class = classes!(p.ty.to_string(), "type-icon");
    html! { <><LocalStyle href={css!("type-icon")} /><span {class} /></> }
}

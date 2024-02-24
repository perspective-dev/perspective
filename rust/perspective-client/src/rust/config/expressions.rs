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

use std::borrow::Cow;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Deserialize, Clone, PartialEq, Debug)]
#[serde(untagged)]
pub enum ExpressionsDeserde {
    Array(Vec<String>),
    Map(HashMap<String, String>),
}

#[derive(Deserialize, Serialize, Clone, PartialEq, Debug, Default)]
#[serde(from = "ExpressionsDeserde")]
pub struct Expressions(pub HashMap<String, String>);

impl std::ops::Deref for Expressions {
    type Target = HashMap<String, String>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::DerefMut for Expressions {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

fn upgrade_legacy_format(expressions: &[String]) -> HashMap<String, String> {
    tracing::debug!("Legacy `expressions` format: {:?}", expressions);
    expressions.iter().map(|s| {
        if let Some((name, expression)) = s.split_once('\n') && !expression.is_empty() && name.starts_with("//") {
            (name.split_at(2).1.trim().to_owned(), expression.to_owned())
        } else {
            (s.to_owned(), s.to_owned())
        }
    }).collect::<HashMap<_, _>>()
}

impl From<ExpressionsDeserde> for Expressions {
    fn from(value: ExpressionsDeserde) -> Self {
        match value {
            ExpressionsDeserde::Array(arr) => Self(upgrade_legacy_format(&arr)),
            ExpressionsDeserde::Map(map) => Self(map),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Expression<'a> {
    pub name: Cow<'a, str>,
    pub expression: Cow<'a, str>,
}

impl<'a> Expression<'a> {
    /// If name is None, the expression is used as the name.
    pub fn new(name: Option<Cow<'a, str>>, expression: Cow<'a, str>) -> Self {
        Self {
            name: name.unwrap_or_else(|| expression.clone()),
            expression,
        }
    }
}

impl<'a> FromIterator<Expression<'a>> for Expressions {
    fn from_iter<T: IntoIterator<Item = Expression<'a>>>(iter: T) -> Self {
        Self(
            iter.into_iter()
                .map(|x| (x.name.as_ref().to_owned(), x.expression.as_ref().to_owned()))
                .collect(),
        )
    }
}

impl Expressions {
    pub fn insert(&mut self, expr: &Expression) {
        self.0.insert(
            expr.name.as_ref().to_owned(),
            expr.expression.as_ref().to_owned(),
        );
    }
}

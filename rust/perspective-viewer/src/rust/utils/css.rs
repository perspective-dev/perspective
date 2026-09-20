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

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GradientStopSpec {
    pub color: String,
    pub offset: f64,
}

pub fn canonicalize_gradient_stops(mut stops: Vec<GradientStopSpec>) -> Vec<GradientStopSpec> {
    for stop in &mut stops {
        stop.offset = (stop.offset.clamp(0.0, 1.0) * 1000.0).round() / 1000.0;
    }

    stops.sort_by(|a, b| {
        a.offset
            .partial_cmp(&b.offset)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    stops
}

pub const USER_VAR_PREFIX: &str = "--psp-user--";

#[derive(Clone, Debug, PartialEq)]
pub struct NamedValue {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CssKind {
    Gradient,
    Palette,
    Color,
}

impl CssKind {
    pub const ALL: [CssKind; 3] = [CssKind::Gradient, CssKind::Palette, CssKind::Color];

    pub fn var_prefix(self) -> &'static str {
        match self {
            CssKind::Gradient => "--psp-user--gradient-",
            CssKind::Palette => "--psp-user--palette-",
            CssKind::Color => "--psp-user--color-",
        }
    }

    pub fn of_var(name: &str) -> Option<CssKind> {
        CssKind::ALL
            .into_iter()
            .find(|kind| name.starts_with(kind.var_prefix()))
    }

    pub fn canonicalize(self, src: &str) -> Result<String, String> {
        match self {
            CssKind::Gradient => CssGradient::parse(src).map(|x| x.to_css()),
            CssKind::Palette => CssPalette::parse(src).map(|x| x.to_css()),
            CssKind::Color => CssColor::parse(src).map(|x| x.to_css()),
        }
    }

    pub fn short_name(self, var_name: &str) -> String {
        var_name
            .strip_prefix(self.var_prefix())
            .unwrap_or(var_name)
            .to_owned()
    }
}

/// The property name a whole-value `var(--psp-user--…)` reference names, or
/// `None` when `src` is not one.
pub fn parse_var_ref(src: &str) -> Option<&str> {
    let inner = src.trim().strip_prefix("var(")?.strip_suffix(')')?.trim();
    if !inner.starts_with(USER_VAR_PREFIX)
        || inner.len() == USER_VAR_PREFIX.len()
        || inner.contains(|c: char| c.is_whitespace() || c == ',' || c == ')')
    {
        return None;
    }

    Some(inner)
}

/// `var(name)`.
pub fn format_var_ref(name: &str) -> String {
    format!("var({name})")
}

fn parse_kind_var(src: &str, kind: CssKind) -> Result<Option<String>, String> {
    let Some(name) = parse_var_ref(src) else {
        return Ok(None);
    };

    if name.starts_with(kind.var_prefix()) {
        Ok(Some(name.to_owned()))
    } else {
        Err(format!(
            "`{src}` is not a {} reference (expected `var({}…)`)",
            kind_label(kind),
            kind.var_prefix()
        ))
    }
}

fn kind_label(kind: CssKind) -> &'static str {
    match kind {
        CssKind::Gradient => "gradient",
        CssKind::Palette => "palette",
        CssKind::Color => "color",
    }
}

fn hex_channel(src: &str) -> Result<u8, String> {
    u8::from_str_radix(src, 16).map_err(|_| format!("invalid hex color `#{src}`"))
}

fn channel_from_token(token: &str) -> Result<u8, String> {
    let token = token.trim();
    let value = match token.strip_suffix('%') {
        Some(pct) => {
            pct.trim()
                .parse::<f64>()
                .map_err(|_| format!("invalid color channel `{token}`"))?
                / 100.0
                * 255.0
        },
        None => token
            .parse::<f64>()
            .map_err(|_| format!("invalid color channel `{token}`"))?,
    };

    Ok(value.round().clamp(0.0, 255.0) as u8)
}

/// A color literal — `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` or
/// `rgba()` — normalized to lowercase `#rrggbb`.
pub fn normalize_css_color(src: &str) -> Result<String, String> {
    let src = src.trim();
    if let Some(hex) = src.strip_prefix('#') {
        let (r, g, b) = match hex.len() {
            3 | 4 => {
                let d = |i: usize| hex_channel(&hex[i..i + 1]).map(|x| x * 17);
                (d(0)?, d(1)?, d(2)?)
            },
            6 | 8 => (
                hex_channel(&hex[0..2])?,
                hex_channel(&hex[2..4])?,
                hex_channel(&hex[4..6])?,
            ),
            _ => return Err(format!("invalid hex color `{src}`")),
        };

        return Ok(format!("#{r:02x}{g:02x}{b:02x}"));
    }

    let lower = src.to_ascii_lowercase();
    let body = lower
        .strip_prefix("rgba(")
        .or_else(|| lower.strip_prefix("rgb("))
        .and_then(|x| x.strip_suffix(')'))
        .ok_or_else(|| format!("unsupported color `{src}`"))?;

    let body = body.split('/').next().unwrap_or("");
    let tokens: Vec<&str> = body
        .split(|c: char| c == ',' || c.is_whitespace())
        .filter(|x| !x.is_empty())
        .collect();

    if tokens.len() < 3 || tokens.len() > 4 {
        return Err(format!("unsupported color `{src}`"));
    }

    Ok(format!(
        "#{:02x}{:02x}{:02x}",
        channel_from_token(tokens[0])?,
        channel_from_token(tokens[1])?,
        channel_from_token(tokens[2])?
    ))
}

fn split_entries(body: &str) -> Vec<&str> {
    let mut parts = vec![];
    let mut depth = 0i32;
    let mut start = 0;
    for (i, ch) in body.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(&body[start..i]);
                start = i + 1;
            },
            _ => {},
        }
    }

    parts.push(&body[start..]);
    parts
}

fn is_direction_token(entry: &str) -> bool {
    let entry = entry.trim().to_ascii_lowercase();
    if entry.starts_with("to ") {
        return true;
    }

    ["deg", "rad", "grad", "turn"].iter().any(|unit| {
        entry
            .strip_suffix(unit)
            .map(|n| n.parse::<f64>().is_ok())
            .unwrap_or(false)
    })
}

fn tokenize_linear_gradient(src: &str) -> Result<Vec<(String, Option<f64>)>, String> {
    let src = src.trim();
    let lower = src.to_ascii_lowercase();
    let body = lower
        .strip_prefix("linear-gradient(")
        .and_then(|x| x.strip_suffix(')'))
        .ok_or_else(|| format!("expected `linear-gradient(…)`, got `{src}`"))?;

    let entries = split_entries(body);
    let mut out = vec![];
    for (index, entry) in entries.iter().enumerate() {
        let entry = entry.trim();
        if entry.is_empty() {
            return Err(format!("empty entry in `{src}`"));
        }

        if index == 0 && is_direction_token(entry) {
            continue;
        }

        let (color, position) = match entry.rfind(|c: char| c.is_whitespace()) {
            Some(at) if !entry[at..].contains(')') => {
                let tail = entry[at..].trim();
                if let Some(pct) = tail.strip_suffix('%') {
                    let value = pct
                        .parse::<f64>()
                        .map_err(|_| format!("invalid stop position `{tail}`"))?;
                    (entry[..at].trim(), Some(value / 100.0))
                } else if tail.starts_with(|c: char| c.is_ascii_digit() || c == '.' || c == '-') {
                    return Err(format!(
                        "unsupported stop position `{tail}` (only `%` is accepted)"
                    ));
                } else {
                    (entry, None)
                }
            },
            _ => (entry, None),
        };

        out.push((normalize_css_color(color)?, position));
    }

    Ok(out)
}

fn format_percent(offset: f64) -> String {
    let text = format!("{:.1}", offset * 100.0);
    let text = text.strip_suffix(".0").unwrap_or(&text).to_owned();
    format!("{text}%")
}

/// The canonical gradient string for `stops`: `linear-gradient(to right,
/// #rrggbb P%, …)` with every position explicit.
pub fn gradient_to_css(stops: &[GradientStopSpec]) -> String {
    let body = canonicalize_gradient_stops(stops.to_vec())
        .iter()
        .map(|stop| format!("{} {}", stop.color, format_percent(stop.offset)))
        .collect::<Vec<_>>()
        .join(", ");

    format!("linear-gradient(to right, {body})")
}

/// The canonical palette string for `colors`: `linear-gradient(to right,
/// #rrggbb, …)` with no positions.
pub fn palette_to_css(colors: &[String]) -> String {
    format!("linear-gradient(to right, {})", colors.join(", "))
}

/// A serialized `ControlSpec::GradientStops` value.
#[derive(Clone, Debug, PartialEq)]
pub enum CssGradient {
    Literal(Vec<GradientStopSpec>),
    Var(String),
}

impl CssGradient {
    pub fn parse(src: &str) -> Result<Self, String> {
        if let Some(name) = parse_kind_var(src, CssKind::Gradient)? {
            return Ok(CssGradient::Var(name));
        }

        let entries = tokenize_linear_gradient(src)?;
        if entries.len() < 2 {
            return Err(format!("a gradient needs at least 2 stops: `{src}`"));
        }

        let mut offsets: Vec<Option<f64>> = entries.iter().map(|(_, p)| *p).collect();
        let last = offsets.len() - 1;
        offsets[0].get_or_insert(0.0);
        offsets[last].get_or_insert(1.0);
        let mut i = 1;
        while i < last {
            if offsets[i].is_some() {
                i += 1;
                continue;
            }

            let mut j = i + 1;
            while offsets[j].is_none() {
                j += 1;
            }

            let before = offsets[i - 1].unwrap();
            let after = offsets[j].unwrap();
            let span = (j - (i - 1)) as f64;
            for (k, slot) in offsets.iter_mut().enumerate().take(j).skip(i) {
                *slot = Some(before + ((k - (i - 1)) as f64 / span) * (after - before));
            }

            i = j;
        }

        let stops = entries
            .into_iter()
            .zip(offsets)
            .map(|((color, _), offset)| GradientStopSpec {
                color,
                offset: offset.unwrap(),
            })
            .collect();

        Ok(CssGradient::Literal(canonicalize_gradient_stops(stops)))
    }

    pub fn to_css(&self) -> String {
        match self {
            CssGradient::Literal(stops) => gradient_to_css(stops),
            CssGradient::Var(name) => format_var_ref(name),
        }
    }
}

/// A serialized `ControlSpec::Palette` value.
#[derive(Clone, Debug, PartialEq)]
pub enum CssPalette {
    Literal(Vec<String>),
    Var(String),
}

impl CssPalette {
    pub fn parse(src: &str) -> Result<Self, String> {
        if let Some(name) = parse_kind_var(src, CssKind::Palette)? {
            return Ok(CssPalette::Var(name));
        }

        let entries = tokenize_linear_gradient(src)?;
        if entries.is_empty() {
            return Err(format!("a palette needs at least 1 color: `{src}`"));
        }

        let mut colors = Vec::with_capacity(entries.len());
        for (color, position) in entries {
            if position.is_some() {
                return Err(format!(
                    "palette entries must not carry positions (a positioned `linear-gradient()` \
                     is a gradient, not a palette): `{src}`"
                ));
            }

            colors.push(color);
        }

        Ok(CssPalette::Literal(colors))
    }

    pub fn to_css(&self) -> String {
        match self {
            CssPalette::Literal(colors) => palette_to_css(colors),
            CssPalette::Var(name) => format_var_ref(name),
        }
    }
}

/// A serialized `ControlSpec::Color` value.
#[derive(Clone, Debug, PartialEq)]
pub enum CssColor {
    Literal(String),
    Var(String),
}

impl CssColor {
    pub fn parse(src: &str) -> Result<Self, String> {
        if let Some(name) = parse_kind_var(src, CssKind::Color)? {
            return Ok(CssColor::Var(name));
        }

        normalize_css_color(src).map(CssColor::Literal)
    }

    pub fn to_css(&self) -> String {
        match self {
            CssColor::Literal(color) => color.clone(),
            CssColor::Var(name) => format_var_ref(name),
        }
    }
}

pub fn canonicalize_css_gradient(src: &str) -> Result<String, String> {
    CssKind::Gradient.canonicalize(src)
}

pub fn canonicalize_css_palette(src: &str) -> Result<String, String> {
    CssKind::Palette.canonicalize(src)
}

pub fn canonicalize_css_color(src: &str) -> Result<String, String> {
    CssKind::Color.canonicalize(src)
}

/// One CSS literal stored in a panel's `columns_config`: its column, key,
/// schema kind and canonical value — the unit of "in use".
#[derive(Clone, Debug, PartialEq)]
pub struct CssLiteralUse {
    pub column: String,
    pub key: String,
    pub kind: CssKind,
    pub literal: String,
}

/// The workspace palette: `restored` unioned with every in-use literal, each
/// named deterministically.
pub fn assign_palette_names(
    restored: &BTreeMap<String, String>,
    host: &[NamedValue],
    in_use: &[(CssKind, String)],
    is_taken: &dyn Fn(&str) -> bool,
) -> BTreeMap<String, String> {
    let mut set = restored.clone();
    for (kind, literal) in in_use {
        if palette_name_for(&set, *kind, literal).is_some() {
            continue;
        }

        let name = host
            .iter()
            .find(|entry| entry.name.starts_with(kind.var_prefix()) && entry.value == *literal)
            .map(|entry| entry.name.clone())
            .unwrap_or_else(|| {
                (1..)
                    .map(|n| format!("{}{n}", kind.var_prefix()))
                    .find(|name| !set.contains_key(name) && !is_taken(name))
                    .unwrap()
            });

        set.insert(name, literal.clone());
    }

    set
}

/// The name under which `set` holds `literal` as a value of `kind`.
pub fn palette_name_for(
    set: &BTreeMap<String, String>,
    kind: CssKind,
    literal: &str,
) -> Option<String> {
    set.iter()
        .find(|(name, value)| name.starts_with(kind.var_prefix()) && *value == literal)
        .map(|(name, _)| name.clone())
}

/// Replace every whole-value `var(--psp-user--…)` string in one column's config
/// entry with the literal `lookup` resolves it to, removing and reporting keys
/// that do not resolve.
pub fn resolve_css_refs(
    entry: &mut serde_json::Map<String, Value>,
    lookup: &dyn Fn(&str) -> Option<String>,
) -> Vec<(String, String)> {
    let mut dropped = vec![];
    let refs: Vec<(String, String)> = entry
        .iter()
        .filter_map(|(key, value)| {
            let name = parse_var_ref(value.as_str()?)?;
            Some((key.clone(), name.to_owned()))
        })
        .collect();

    for (key, name) in refs {
        let resolved = CssKind::of_var(&name)
            .and_then(|kind| lookup(&name).and_then(|raw| kind.canonicalize(&raw).ok()));

        match resolved {
            Some(literal) => {
                entry.insert(key, Value::String(literal));
            },
            None => {
                entry.remove(&key);
                dropped.push((key, name));
            },
        }
    }

    dropped
}

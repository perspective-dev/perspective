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

use serde_json::Value;

use super::{GradientStopSpec, canonicalize_gradient_stops};

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

/// The property name a whole-value `var(--psp-user--…)` reference
/// names, or `None` when `src` is not one.
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

/// A color literal — `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`
/// or `rgba()` — normalized to lowercase `#rrggbb`.
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

/// The canonical gradient string for `stops`: `linear-gradient(to
/// right, #rrggbb P%, …)` with every position explicit.
pub fn gradient_to_css(stops: &[GradientStopSpec]) -> String {
    let body = canonicalize_gradient_stops(stops.to_vec())
        .iter()
        .map(|stop| format!("{} {}", stop.color, format_percent(stop.offset)))
        .collect::<Vec<_>>()
        .join(", ");

    format!("linear-gradient(to right, {body})")
}

/// The canonical palette string for `colors`: `linear-gradient(to
/// right, #rrggbb, …)` with no positions.
pub fn palette_to_css(colors: &[String]) -> String {
    format!("linear-gradient(to right, {})", colors.join(", "))
}

/// A serialized [`ControlSpec::GradientStops`] value.
///
/// [`ControlSpec::GradientStops`]: super::ControlSpec::GradientStops
#[derive(Clone, Debug, PartialEq)]
pub enum CssGradient {
    /// Canonical stops (sorted, rounded), length ≥ 2.
    Literal(Vec<GradientStopSpec>),
    /// A `--psp-user--gradient-…` property name.
    Var(String),
}

impl CssGradient {
    /// Parse a gradient string of at least 2 stops, with optional
    /// positions filled by the CSS implicit rules.
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

/// A serialized [`ControlSpec::Palette`] value.
///
/// [`ControlSpec::Palette`]: super::ControlSpec::Palette
#[derive(Clone, Debug, PartialEq)]
pub enum CssPalette {
    /// Ordered `#rrggbb` entries, length ≥ 1.
    Literal(Vec<String>),
    /// A `--psp-user--palette-…` property name.
    Var(String),
}

impl CssPalette {
    /// Parse a palette string of at least 1 entry, with positions
    /// forbidden.
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

/// A serialized [`ControlSpec::Color`] value.
///
/// [`ControlSpec::Color`]: super::ControlSpec::Color
#[derive(Clone, Debug, PartialEq)]
pub enum CssColor {
    /// Lowercase `#rrggbb`.
    Literal(String),
    /// A `--psp-user--color-…` property name.
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

/// One CSS literal stored in a panel's `columns_config`: its column,
/// key, schema kind and canonical value — the unit of "in use".
#[derive(Clone, Debug, PartialEq)]
pub struct CssLiteralUse {
    pub column: String,
    pub key: String,
    pub kind: CssKind,
    pub literal: String,
}

/// The workspace palette: `restored` unioned with every in-use
/// literal, each named deterministically.
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

/// Replace every whole-value `var(--psp-user--…)` string in one
/// column's config entry with the literal `lookup` resolves it to,
/// removing and reporting keys that do not resolve.
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn stop(color: &str, offset: f64) -> GradientStopSpec {
        GradientStopSpec {
            color: color.to_owned(),
            offset,
        }
    }

    #[test]
    fn colors_normalize_to_lowercase_hex() {
        assert_eq!(normalize_css_color("#ABC").unwrap(), "#aabbcc");
        assert_eq!(normalize_css_color("#abcd").unwrap(), "#aabbcc");
        assert_eq!(normalize_css_color(" #FF7F0E ").unwrap(), "#ff7f0e");
        assert_eq!(normalize_css_color("#ff7f0e80").unwrap(), "#ff7f0e");
        assert_eq!(normalize_css_color("rgb(255, 127, 14)").unwrap(), "#ff7f0e");
        assert_eq!(
            normalize_css_color("rgba(255,127,14,0.5)").unwrap(),
            "#ff7f0e"
        );
        assert_eq!(
            normalize_css_color("rgb(255 127 14 / 50%)").unwrap(),
            "#ff7f0e"
        );
        assert_eq!(
            normalize_css_color("rgb(100%, 0%, 50%)").unwrap(),
            "#ff0080"
        );
        assert_eq!(normalize_css_color("rgb(300, -5, 14)").unwrap(), "#ff000e");
        assert!(normalize_css_color("red").is_err());
        assert!(normalize_css_color("#12345").is_err());
        assert!(normalize_css_color("hsl(0, 100%, 50%)").is_err());
        assert!(normalize_css_color("#gggggg").is_err());
        assert!(normalize_css_color("").is_err());
    }

    #[test]
    fn var_refs_are_whole_value_and_namespaced() {
        assert_eq!(
            parse_var_ref("var(--psp-user--gradient-1)"),
            Some("--psp-user--gradient-1")
        );
        assert_eq!(
            parse_var_ref("  var( --psp-user--color-hot )  "),
            Some("--psp-user--color-hot")
        );
        assert_eq!(parse_var_ref("var(--psp-charts--gradient)"), None);
        assert_eq!(parse_var_ref("var(--psp-user--)"), None);
        assert_eq!(parse_var_ref("var(--psp-user--gradient-1, red)"), None);
        assert_eq!(parse_var_ref("#ff0000"), None);
        assert_eq!(
            parse_var_ref("linear-gradient(var(--psp-user--color-1), #fff)"),
            None
        );
    }

    #[test]
    fn kind_is_carried_by_the_reference_prefix() {
        assert_eq!(
            CssKind::of_var("--psp-user--gradient-1"),
            Some(CssKind::Gradient)
        );
        assert_eq!(
            CssKind::of_var("--psp-user--palette-warm"),
            Some(CssKind::Palette)
        );
        assert_eq!(CssKind::of_var("--psp-user--color-1"), Some(CssKind::Color));
        assert_eq!(CssKind::of_var("--psp-user--other-1"), None);
        assert_eq!(
            CssKind::Palette.short_name("--psp-user--palette-warm"),
            "warm"
        );

        assert_eq!(
            CssGradient::parse("var(--psp-user--gradient-1)").unwrap(),
            CssGradient::Var("--psp-user--gradient-1".to_owned())
        );
        assert!(CssGradient::parse("var(--psp-user--palette-1)").is_err());
        assert!(CssPalette::parse("var(--psp-user--gradient-1)").is_err());
        assert!(CssColor::parse("var(--psp-user--palette-1)").is_err());
        assert_eq!(
            CssColor::parse("var(--psp-user--color-1)")
                .unwrap()
                .to_css(),
            "var(--psp-user--color-1)"
        );

        assert_eq!(
            canonicalize_css_palette("var(--psp-user--palette-1)").unwrap(),
            "var(--psp-user--palette-1)"
        );
    }

    #[test]
    fn gradient_round_trip_is_canonical_and_idempotent() {
        let src = "linear-gradient(to right, #0366d6 0%, #ffffff 33.3%, #ff7f0e 100%)";
        let canon = canonicalize_css_gradient(src).unwrap();
        assert_eq!(canon, src);
        assert_eq!(canonicalize_css_gradient(&canon).unwrap(), canon);

        let CssGradient::Literal(stops) = CssGradient::parse(src).unwrap() else {
            panic!("expected literal");
        };

        assert_eq!(stops, vec![
            stop("#0366d6", 0.0),
            stop("#ffffff", 0.333),
            stop("#ff7f0e", 1.0),
        ]);

        let css = gradient_to_css(&[
            stop("#222222", 1.7),
            stop("#111111", 1.0 / 3.0),
            stop("#000000", -0.5),
        ]);

        assert_eq!(
            css,
            "linear-gradient(to right, #000000 0%, #111111 33.3%, #222222 100%)"
        );

        assert_eq!(format_percent(0.375), "37.5%");
        assert_eq!(format_percent(0.1), "10%");
        assert_eq!(format_percent(1.0), "100%");
    }

    #[test]
    fn gradient_accepts_loose_input() {
        assert_eq!(
            canonicalize_css_gradient("linear-gradient(#0366d6 0%, #ff7f0e 100%)").unwrap(),
            "linear-gradient(to right, #0366d6 0%, #ff7f0e 100%)"
        );

        assert_eq!(
            canonicalize_css_gradient("LINEAR-GRADIENT(90deg, RGB(3, 102, 214), #FFF, #ff7f0e)")
                .unwrap(),
            "linear-gradient(to right, #0366d6 0%, #ffffff 50%, #ff7f0e 100%)"
        );

        assert_eq!(
            canonicalize_css_gradient(
                "linear-gradient(to bottom, #000 10%, #111, #222, #333 70%, #444)"
            )
            .unwrap(),
            "linear-gradient(to right, #000000 10%, #111111 30%, #222222 50%, #333333 70%, \
             #444444 100%)"
        );

        assert_eq!(
            canonicalize_css_gradient("linear-gradient(#fff 120%, #000 -5%)").unwrap(),
            "linear-gradient(to right, #000000 0%, #ffffff 100%)"
        );
    }

    #[test]
    fn gradient_rejects_malformed_input() {
        assert!(canonicalize_css_gradient("#ff0000").is_err());
        assert!(canonicalize_css_gradient("linear-gradient(#ff0000)").is_err());
        assert!(canonicalize_css_gradient("linear-gradient(#ff0000 0px, #fff 10px)").is_err());
        assert!(canonicalize_css_gradient("linear-gradient(red, blue)").is_err());
        assert!(canonicalize_css_gradient("radial-gradient(#000, #fff)").is_err());
        assert!(canonicalize_css_gradient("linear-gradient(#000, , #fff)").is_err());
        assert!(canonicalize_css_gradient("").is_err());
    }

    #[test]
    fn palette_round_trip_and_rules() {
        let src = "linear-gradient(to right, #0366d6, #ff7f0e, #2ca02c)";
        assert_eq!(canonicalize_css_palette(src).unwrap(), src);
        assert_eq!(
            CssPalette::parse(src).unwrap(),
            CssPalette::Literal(vec![
                "#0366d6".to_owned(),
                "#ff7f0e".to_owned(),
                "#2ca02c".to_owned()
            ])
        );

        assert_eq!(
            canonicalize_css_palette("linear-gradient(90deg, rgb(3,102,214), #FFF)").unwrap(),
            "linear-gradient(to right, #0366d6, #ffffff)"
        );

        assert_eq!(
            canonicalize_css_palette("linear-gradient(#abc)").unwrap(),
            "linear-gradient(to right, #aabbcc)"
        );

        assert_eq!(
            palette_to_css(&["#000000".to_owned(), "#ffffff".to_owned()]),
            "linear-gradient(to right, #000000, #ffffff)"
        );
    }

    #[test]
    fn palette_rejects_positions() {
        let gradient = gradient_to_css(&[stop("#000000", 0.0), stop("#ffffff", 1.0)]);
        assert!(CssPalette::parse(&gradient).is_err());
        assert!(canonicalize_css_palette("linear-gradient(#000, #fff 50%)").is_err());
        assert!(canonicalize_css_palette("linear-gradient()").is_err());
        assert!(canonicalize_css_palette("#000000").is_err());

        let palette = palette_to_css(&["#000000".to_owned(), "#ffffff".to_owned()]);
        assert_eq!(
            canonicalize_css_gradient(&palette).unwrap(),
            "linear-gradient(to right, #000000 0%, #ffffff 100%)"
        );
    }

    #[test]
    fn color_canonicalizes_literals_and_passes_refs() {
        assert_eq!(canonicalize_css_color("#ABC").unwrap(), "#aabbcc");
        assert_eq!(
            canonicalize_css_color("var(--psp-user--color-hot)").unwrap(),
            "var(--psp-user--color-hot)"
        );
        assert!(canonicalize_css_color("var(--psp-user--gradient-1)").is_err());
        assert!(canonicalize_css_color("linear-gradient(#000, #fff)").is_err());
    }

    #[test]
    fn palette_set_unions_restored_and_in_use_with_stable_names() {
        let mut restored = BTreeMap::new();
        restored.insert(
            "--psp-user--gradient-heat".to_owned(),
            "linear-gradient(to right, #000000 0%, #ffffff 100%)".to_owned(),
        );
        restored.insert("--psp-user--color-unused".to_owned(), "#123456".to_owned());
        let host = vec![NamedValue {
            name: "--psp-user--palette-1".to_owned(),
            value: "linear-gradient(to right, #ff0000, #00ff00)".to_owned(),
        }];
        let taken =
            |name: &str| name == "--psp-user--gradient-1" || name == "--psp-user--palette-1";
        let in_use = vec![
            (
                CssKind::Gradient,
                "linear-gradient(to right, #000000 0%, #ffffff 100%)".to_owned(),
            ),
            (
                CssKind::Gradient,
                "linear-gradient(to right, #111111 0%, #222222 100%)".to_owned(),
            ),
            (
                CssKind::Gradient,
                "linear-gradient(to right, #111111 0%, #222222 100%)".to_owned(),
            ),
            (
                CssKind::Palette,
                "linear-gradient(to right, #ff0000, #00ff00)".to_owned(),
            ),
            (CssKind::Color, "#abcdef".to_owned()),
        ];

        let set = assign_palette_names(&restored, &host, &in_use, &taken);
        assert_eq!(
            set.iter()
                .map(|(k, v)| (k.as_str(), v.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("--psp-user--color-1", "#abcdef"),
                ("--psp-user--color-unused", "#123456"),
                (
                    "--psp-user--gradient-2",
                    "linear-gradient(to right, #111111 0%, #222222 100%)"
                ),
                (
                    "--psp-user--gradient-heat",
                    "linear-gradient(to right, #000000 0%, #ffffff 100%)"
                ),
                (
                    "--psp-user--palette-1",
                    "linear-gradient(to right, #ff0000, #00ff00)"
                ),
            ]
        );

        assert_eq!(
            palette_name_for(
                &set,
                CssKind::Gradient,
                "linear-gradient(to right, #111111 0%, #222222 100%)"
            )
            .as_deref(),
            Some("--psp-user--gradient-2")
        );
        assert_eq!(palette_name_for(&set, CssKind::Gradient, "#abcdef"), None);

        assert_eq!(assign_palette_names(&set, &host, &in_use, &taken), set);
    }

    #[test]
    fn resolver_inlines_known_refs_and_drops_the_rest() {
        let host = |name: &str| -> Option<String> {
            match name {
                "--psp-user--gradient-1" => Some("linear-gradient(#000, #fff)".to_owned()),
                "--psp-user--palette-warm" => Some("linear-gradient(#f00, #ff0)".to_owned()),
                "--psp-user--color-hot" => Some("rgb(255, 0, 0)".to_owned()),
                "--psp-user--palette-bad" => Some("linear-gradient(#000 0%, #fff 100%)".to_owned()),
                "--psp-user--color-empty" => Some("   ".to_owned()),
                _ => None,
            }
        };

        let mut entry = json!({
            "gradient": "var(--psp-user--gradient-1)",
            "palette": "var(--psp-user--palette-warm)",
            "color": "var(--psp-user--color-hot)",
            "bad_palette": "var(--psp-user--palette-bad)",
            "missing": "var(--psp-user--gradient-missing)",
            "empty": "var(--psp-user--color-empty)",
            "unknown_kind": "var(--psp-user--other-1)",
            "literal": "#123456",
            "number": 3,
        })
        .as_object()
        .unwrap()
        .clone();

        let mut dropped = resolve_css_refs(&mut entry, &host);
        dropped.sort();
        assert_eq!(dropped, vec![
            (
                "bad_palette".to_owned(),
                "--psp-user--palette-bad".to_owned()
            ),
            ("empty".to_owned(), "--psp-user--color-empty".to_owned()),
            (
                "missing".to_owned(),
                "--psp-user--gradient-missing".to_owned()
            ),
            ("unknown_kind".to_owned(), "--psp-user--other-1".to_owned()),
        ]);

        assert_eq!(
            entry,
            json!({
                "gradient": "linear-gradient(to right, #000000 0%, #ffffff 100%)",
                "palette": "linear-gradient(to right, #ff0000, #ffff00)",
                "color": "#ff0000",
                "literal": "#123456",
                "number": 3,
            })
            .as_object()
            .unwrap()
            .clone()
        );

        assert!(entry.values().all(|v| {
            v.as_str()
                .map(|s| parse_var_ref(s).is_none())
                .unwrap_or(true)
        }));
    }
}

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

mod resolve;

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::LazyLock;

use perspective_js::utils::*;
use wasm_bindgen::prelude::*;

use crate::config::{CustomNumberFormatConfig, DatetimeFormat};
use crate::format;
use crate::format::spec::{FormatSpec, UnitDisplay};
use crate::format::{CurrencySymbol, LocaleData, NameKind, OffsetSpan};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "FormattedColumn")]
    pub type JsFormattedColumn;
}

#[wasm_bindgen(inline_js = "
    export function split_column(text, ends) {
        const out = new Array(ends.length);
        let start = 0;
        for (let i = 0; i < ends.length; i++) {
            out[i] = text.substring(start, ends[i]);
            start = ends[i];
        }

        return out;
    }

    export function long_offset(format, epoch_ms) {
        try {
            for (const part of format.formatToParts(epoch_ms)) {
                if (part.type === \"timeZoneName\") {
                    return part.value;
                }
            }
        } catch {
            return undefined;
        }
    }

    export function temporal_offset(zone, epoch_ms, out) {
        try {
            const time = Temporal.Instant.fromEpochMilliseconds(epoch_ms).toZonedDateTimeISO(zone);
            const previous = time.add({ nanoseconds: 1 }).getTimeZoneTransition(\"previous\");
            const next = time.getTimeZoneTransition(\"next\");
            out[0] = time.offsetNanoseconds / 1e9;
            out[1] = previous === null ? -Infinity : previous.epochMilliseconds;
            out[2] = next === null ? Infinity : next.epochMilliseconds;
            return true;
        } catch {
            return false;
        }
    }
")]
extern "C" {
    fn split_column(text: &str, ends: &js_sys::Uint32Array) -> js_sys::Array;
    fn long_offset(format: &JsValue, epoch_ms: f64) -> Option<String>;
    fn temporal_offset(zone: &str, epoch_ms: f64, out: &mut [f64]) -> bool;
}

struct SessionLocale {
    languages: Vec<String>,
    time_zone: String,
}

fn property(object: &JsValue, name: &str) -> Option<JsValue> {
    js_sys::Reflect::get(object, &JsValue::from(name))
        .ok()
        .filter(|x| !x.is_undefined())
}

static SESSION_LOCALE: LazyLock<SessionLocale> = LazyLock::new(|| {
    let languages = property(&js_sys::global(), "navigator")
        .and_then(|x| property(&x, "languages"))
        .and_then(|x| x.dyn_into::<js_sys::Array>().ok())
        .map(|x| x.iter().filter_map(|x| x.as_string()).collect())
        .unwrap_or_default();

    let options = js_sys::Intl::DateTimeFormat::new(&js_sys::Array::new(), &js_sys::Object::new())
        .resolved_options();

    let time_zone = property(&options, "timeZone")
        .and_then(|x| x.as_string())
        .unwrap_or_else(|| "UTC".to_owned());

    SessionLocale {
        languages,
        time_zone,
    }
});

/// The browser's language preferences, most preferred first.
pub fn languages() -> &'static [String] {
    &SESSION_LOCALE.languages
}

/// The IANA name of the browser's time zone.
pub fn local_time_zone() -> &'static str {
    &SESSION_LOCALE.time_zone
}

/// `Intl.<constructor>` for `locale` with `options`, or `None` when it
/// rejects them.
fn intl(constructor: &str, locale: &str, options: &[(&str, JsValue)]) -> Option<JsValue> {
    let intl = property(&js_sys::global(), "Intl")?;
    let constructor: js_sys::Function = property(&intl, constructor)?.dyn_into().ok()?;
    let bag = js_sys::Object::new();
    for (key, value) in options {
        js_sys::Reflect::set(&bag, &JsValue::from(*key), value).ok()?;
    }

    let locales = js_sys::Array::of1(&JsValue::from(locale));
    js_sys::Reflect::construct(&constructor, &js_sys::Array::of2(&locales, &bag)).ok()
}

/// The parts `formatter`'s `formatToParts` splits `value` into, as
/// `(type, value)`.
fn format_to_parts(formatter: &JsValue, value: &JsValue) -> Option<Vec<(String, String)>> {
    let format: js_sys::Function = property(formatter, "formatToParts")?.dyn_into().ok()?;
    let parts: js_sys::Array = format.call1(formatter, value).ok()?.dyn_into().ok()?;
    parts
        .iter()
        .map(|part| {
            Some((
                property(&part, "type")?.as_string()?,
                property(&part, "value")?.as_string()?,
            ))
        })
        .collect()
}

/// `Intl.<constructor>` for `locale` with `options`, applied by its
/// `formatToParts` to `value`.
fn intl_parts(
    constructor: &str,
    locale: &str,
    options: &[(&str, JsValue)],
    value: &JsValue,
) -> Option<Vec<(String, String)>> {
    format_to_parts(&intl(constructor, locale, options)?, value)
}

/// The seconds east of UTC of a `longOffset` time zone name such as `GMT`,
/// `GMT-05:00` or `GMT+05:30:00`.
fn parse_long_offset(name: &str) -> Option<i32> {
    let offset = name.strip_prefix("GMT")?;
    if offset.is_empty() {
        return Some(0);
    }

    let mut chars = offset.chars();
    let sign = match chars.next()? {
        '+' => 1,
        '-' | '\u{2212}' => -1,
        _ => return None,
    };

    let mut seconds = 0;
    let mut fields = 0;
    for (field, scale) in chars.as_str().split(':').zip([3600, 60, 1]) {
        seconds += field.parse::<i32>().ok()? * scale;
        fields += 1;
    }

    (fields > 0).then_some(sign * seconds)
}

/// Looks up time zone rules and localized names with the browser's `Intl`,
/// so that the data behind them is not linked into this binary.
struct BrowserData {
    /// Whether the browser has `Temporal`, whose time zones report their
    /// transitions.
    temporal: bool,

    /// The `Intl.DateTimeFormat` naming each time zone by its UTC offset, or
    /// `None` for a name the browser does not know.
    offset_formats: RefCell<HashMap<String, Option<JsValue>>>,
}

impl BrowserData {
    fn new() -> Self {
        Self {
            temporal: property(&js_sys::global(), "Temporal").is_some(),
            offset_formats: RefCell::default(),
        }
    }

    /// The UTC offset in seconds of `zone` at the instant `epoch_ms`, by
    /// `Intl`.
    fn intl_offset(&self, zone: &str, epoch_ms: i64) -> Option<i32> {
        let mut formats = self.offset_formats.borrow_mut();
        if !formats.contains_key(zone) {
            let format = intl("DateTimeFormat", "en-US", &[
                ("timeZone", JsValue::from(zone)),
                ("timeZoneName", JsValue::from("longOffset")),
            ]);

            formats.insert(zone.to_owned(), format);
        }

        parse_long_offset(&long_offset(formats.get(zone)?.as_ref()?, epoch_ms as f64)?)
    }

    /// The span between the transitions of `zone` around the instant
    /// `epoch_ms`, by `Temporal`.
    fn temporal_span(&self, zone: &str, epoch_ms: i64) -> Option<OffsetSpan> {
        let mut out = [0.; 3];
        (self.temporal && temporal_offset(zone, epoch_ms as f64, &mut out)).then(|| OffsetSpan {
            offset: out[0].round() as i32,
            start: out[1] as i64,
            end: out[2] as i64,
        })
    }
}

/// The lengths in milliseconds of the blocks of time `BrowserData` takes to
/// share one UTC offset when its ends do, without `Temporal`.
const OFFSET_BLOCKS_MS: [i64; 2] = [86_400_000, 3_600_000];

/// The latest and earliest instants a JavaScript `Date` can hold, in
/// milliseconds.
const MAX_EPOCH_MS: i64 = 8_640_000_000_000_000;

impl LocaleData for BrowserData {
    fn time_zones(&self) -> Vec<String> {
        property(&js_sys::global(), "Intl")
            .and_then(|intl| {
                let supported: js_sys::Function =
                    property(&intl, "supportedValuesOf")?.dyn_into().ok()?;
                supported
                    .call1(&intl, &JsValue::from("timeZone"))
                    .ok()?
                    .dyn_into::<js_sys::Array>()
                    .ok()
            })
            .map(|x| x.iter().filter_map(|x| x.as_string()).collect())
            .unwrap_or_default()
    }

    fn utc_offset(&self, zone: &str, epoch_ms: i64) -> Option<OffsetSpan> {
        if let Some(span) = self.temporal_span(zone, epoch_ms) {
            return Some(span);
        }

        for block in OFFSET_BLOCKS_MS {
            let start = epoch_ms.div_euclid(block) * block;
            let first = start.max(-MAX_EPOCH_MS);
            let last = (start + block - 1).min(MAX_EPOCH_MS);
            let offset = self.intl_offset(zone, first)?;
            if offset == self.intl_offset(zone, last)? {
                return Some(OffsetSpan {
                    offset,
                    start,
                    end: start + block,
                });
            }
        }

        Some(OffsetSpan {
            offset: self.intl_offset(zone, epoch_ms)?,
            start: epoch_ms,
            end: epoch_ms + 1,
        })
    }

    /// The symbol's ends both count as letters when `Intl` spaces it from the
    /// number beside it, as only the end beside the number is ever consulted.
    fn currency_symbol(&self, locale: &str, code: &str, narrow: bool) -> Option<CurrencySymbol> {
        let parts = intl_parts(
            "NumberFormat",
            locale,
            &[
                ("style", JsValue::from("currency")),
                ("currency", JsValue::from(code)),
                (
                    "currencyDisplay",
                    JsValue::from(if narrow { "narrowSymbol" } else { "symbol" }),
                ),
            ],
            &JsValue::from(1),
        )?;

        let symbol = parts.iter().position(|(kind, _)| kind == "currency")?;
        let number = parts.iter().position(|(kind, _)| kind == "integer")?;
        let spaced = parts[symbol.min(number) + 1..symbol.max(number)]
            .iter()
            .any(|(kind, value)| kind == "literal" && value.chars().any(char::is_whitespace));

        Some(CurrencySymbol {
            text: parts[symbol].1.clone(),
            starts_with_letter: spaced,
            ends_with_letter: spaced,
        })
    }

    fn zone_name(&self, locale: &str, zone: &str, epoch_ms: f64, long: bool) -> Option<String> {
        let parts = intl_parts(
            "DateTimeFormat",
            locale,
            &[
                ("timeZone", JsValue::from(zone)),
                (
                    "timeZoneName",
                    JsValue::from(if long { "long" } else { "short" }),
                ),
            ],
            &js_sys::Date::new(&JsValue::from(epoch_ms)),
        )?;

        parts
            .into_iter()
            .find_map(|(kind, value)| (kind == "timeZoneName").then_some(value))
    }

    fn pattern(
        &self,
        locale: &str,
        kind: &NameKind,
        value: f64,
        fraction_digits: u8,
    ) -> Option<String> {
        let digits = JsValue::from(fraction_digits.min(100));
        let mut options = vec![
            ("minimumFractionDigits", digits.clone()),
            ("maximumFractionDigits", digits),
        ];

        match kind {
            NameKind::Currency(code) => options.extend([
                ("style", JsValue::from("currency")),
                ("currency", JsValue::from(code)),
                ("currencyDisplay", JsValue::from("name")),
            ]),
            NameKind::Unit { unit, display } => options.extend([
                ("style", JsValue::from("unit")),
                ("unit", JsValue::from(unit)),
                (
                    "unitDisplay",
                    JsValue::from(match display {
                        UnitDisplay::Short => "short",
                        UnitDisplay::Narrow => "narrow",
                        UnitDisplay::Long => "long",
                    }),
                ),
            ]),
        }

        let parts = intl_parts("NumberFormat", locale, &options, &JsValue::from(value))?;
        let mut pattern = String::new();
        let mut placed = false;
        for (kind, value) in &parts {
            if matches!(kind.as_str(), "integer" | "group" | "decimal" | "fraction") {
                if !placed {
                    pattern.push_str("{0}");
                    placed = true;
                }
            } else {
                pattern.push_str(value);
            }
        }

        (!parts.is_empty()).then_some(pattern)
    }
}

thread_local! {
    static LOCALE_DATA: Rc<dyn LocaleData> = if cfg!(feature = "bundled-locale-data") {
        baked_data()
    } else {
        Rc::new(BrowserData::new())
    };
}

#[cfg(feature = "bundled-locale-data")]
fn baked_data() -> Rc<dyn LocaleData> {
    Rc::new(format::BakedData)
}

#[cfg(not(feature = "bundled-locale-data"))]
fn baked_data() -> Rc<dyn LocaleData> {
    Rc::new(BrowserData::new())
}

/// The IANA name of every time zone a datetime format may name.
pub fn time_zones() -> Vec<String> {
    LOCALE_DATA.with(|x| x.time_zones())
}

fn optional<T: serde::de::DeserializeOwned>(value: JsValue) -> ApiResult<Option<T>> {
    if value.is_undefined() || value.is_null() {
        Ok(None)
    } else {
        let value: serde_json::Value = value.into_serde_ext()?;
        Ok(Some(serde_json::from_value(value)?))
    }
}

/// The [`FormatSpec`] of a column of `column_type` given its format and the
/// calling plugin's default, or `None` for a type whose values are not
/// formatted.
fn format_spec(
    column_type: &str,
    format: JsValue,
    defaults: JsValue,
) -> ApiResult<Option<FormatSpec>> {
    let spec = match column_type {
        "integer" | "float" => FormatSpec::Number(resolve::number_spec(
            column_type == "float",
            optional::<CustomNumberFormatConfig>(format)?.as_ref(),
            optional::<CustomNumberFormatConfig>(defaults)?.as_ref(),
            format::currency_digits,
        )?),
        "datetime" => FormatSpec::Datetime(resolve::datetime_spec(
            optional::<DatetimeFormat>(format)?.as_ref(),
            optional::<DatetimeFormat>(defaults)?.as_ref(),
            local_time_zone(),
        )?),
        "date" => FormatSpec::Datetime(resolve::date_spec(
            optional::<DatetimeFormat>(format)?.as_ref(),
            optional::<DatetimeFormat>(defaults)?.as_ref(),
        )?),
        "boolean" => FormatSpec::Boolean,
        _ => return Ok(None),
    };

    Ok(Some(spec))
}

/// A handle to a formatter for one column type and format, from
/// [`formatter`].
#[wasm_bindgen]
pub struct Formatter(format::Formatter);

#[wasm_bindgen]
impl Formatter {
    /// The text of `value`.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const formatter = viewer.plugin_utils.formatter("float");
    /// console.log(formatter.format(1234.5));
    /// ```
    pub fn format(&self, value: f64) -> String {
        self.0.format(value)
    }

    /// The text of every one of `values`, concatenated, with the end offset
    /// of each.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const { text, ends } = formatter.format_column(new Float64Array([1, 2.5]));
    /// console.log(text.substring(0, ends[0]), text.substring(ends[0], ends[1]));
    /// ```
    pub fn format_column(&self, values: &[f64]) -> JsFormattedColumn {
        let format::FormattedColumn { text, ends } = self.0.format_column(values);
        let column = js_sys::Object::new();
        let _ = js_sys::Reflect::set(&column, &JsValue::from("text"), &JsValue::from(text));
        let _ = js_sys::Reflect::set(
            &column,
            &JsValue::from("ends"),
            &js_sys::Uint32Array::from(ends.as_slice()),
        );

        column.unchecked_into()
    }

    /// The text of every one of `values`, one string per value.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const [a, b] = formatter.format_strings(new Float64Array([1, 2.5]));
    /// ```
    #[wasm_bindgen(unchecked_return_type = "string[]")]
    pub fn format_strings(&self, values: &[f64]) -> js_sys::Array {
        let format::FormattedColumn { text, ends } = self.0.format_column(values);
        split_column(&text, &js_sys::Uint32Array::from(ends.as_slice()))
    }
}

impl Formatter {
    /// A formatter for values of `spec` in the browser's languages.
    pub fn new(spec: &FormatSpec) -> ApiResult<Self> {
        let names = LOCALE_DATA.with(Rc::clone);
        Ok(Self(format::Formatter::new(spec, languages(), &names)?))
    }

    /// The formatter of an integer column with no `number_format`.
    pub fn integer() -> ApiResult<Self> {
        let spec = resolve::number_spec(false, None, None, format::currency_digits)?;
        Self::new(&FormatSpec::Number(spec))
    }
}

/// A formatter for the values of a column of `column_type`, or `undefined`
/// for a type whose values are not formatted, given the column's
/// `number_format` or `date_format` and the calling plugin's default for the
/// same key.
///
/// # JavaScript Examples
///
/// ```javascript
/// const formatter = viewer.plugin_utils.formatter("float", { style: "percent" });
/// console.log(formatter.format(0.25));
/// ```
#[wasm_bindgen(skip_typescript)]
pub fn formatter(
    column_type: String,
    format: Option<JsValue>,
    defaults: Option<JsValue>,
) -> ApiResult<JsValue> {
    let format = format.unwrap_or(JsValue::UNDEFINED);
    let defaults = defaults.unwrap_or(JsValue::UNDEFINED);
    Ok(match format_spec(&column_type, format, defaults)? {
        Some(spec) => Formatter::new(&spec)?.into(),
        None => JsValue::UNDEFINED,
    })
}

/// The source column name of a `split_by` column path, its last `|`
/// separated segment.
///
/// # JavaScript Examples
///
/// ```javascript
/// console.log(viewer.plugin_utils.source_column("East|Sales"));
/// ```
#[wasm_bindgen]
pub fn source_column(path: String) -> String {
    match path.rsplit_once('|') {
        Some((_, name)) => name.to_owned(),
        None => path,
    }
}

/// Whether the `date_format` `format` sets any of the keys that apply as one
/// group (a preset or any date or time part), rather than only `timeZone` or
/// `hour12`.
///
/// # JavaScript Examples
///
/// ```javascript
/// viewer.plugin_utils.has_date_format_shape({ dateStyle: "short" }); // true
/// viewer.plugin_utils.has_date_format_shape({ timeZone: "UTC" }); // false
/// ```
#[wasm_bindgen(skip_typescript)]
pub fn has_date_format_shape(format: Option<JsValue>) -> ApiResult<bool> {
    let format = optional::<DatetimeFormat>(format.unwrap_or(JsValue::UNDEFINED))?;
    Ok(format.is_some_and(|x| x.has_shape()))
}

/// The keys of the `date_format` `format` that apply individually,
/// `timeZone` and `hour12`, or `undefined` when it sets neither.
///
/// # JavaScript Examples
///
/// ```javascript
/// const modifiers = viewer.plugin_utils.date_format_modifiers({
///     dateStyle: "short",
///     timeZone: "UTC",
/// });
/// ```
#[wasm_bindgen(skip_typescript)]
pub fn date_format_modifiers(format: Option<JsValue>) -> ApiResult<JsValue> {
    let modifiers = optional::<DatetimeFormat>(format.unwrap_or(JsValue::UNDEFINED))?
        .map(|x| DatetimeFormat {
            time_zone: x.time_zone,
            hour12: x.hour12,
            ..DatetimeFormat::default()
        })
        .filter(|x| x.time_zone.is_some() || x.hour12.is_some());

    Ok(to_js(&modifiers))
}

/// The channels of a `#rrggbb` color.
fn hex_rgb(hex: &str) -> Option<[u8; 3]> {
    let channel = |at: usize| u8::from_str_radix(hex.get(at..at + 2)?, 16).ok();
    Some([channel(1)?, channel(3)?, channel(5)?])
}

#[derive(serde::Deserialize, serde::Serialize)]
struct GradientStopRgb {
    rgb: [u8; 3],
    offset: f64,
}

fn to_js<T: serde::Serialize>(value: &Option<T>) -> JsValue {
    JsValue::from_serde_ext(value).unwrap_or(JsValue::UNDEFINED)
}

/// The channels of a color literal of the viewer's config grammar (`#rgb`,
/// `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()`, alpha ignored), or
/// `undefined` for anything else.
///
/// # JavaScript Examples
///
/// ```javascript
/// const [r, g, b] = viewer.plugin_utils.parse_css_color("rgb(255, 0, 0)");
/// ```
#[wasm_bindgen(unchecked_return_type = "RGB | undefined")]
pub fn parse_css_color(src: &str) -> JsValue {
    to_js(
        &crate::utils::normalize_css_color(src)
            .ok()
            .and_then(|x| hex_rgb(&x)),
    )
}

/// The stops of a gradient value of the viewer's config grammar, a
/// `linear-gradient()` of at least two color literals with optional `%`
/// positions, sorted with every position resolved, or `undefined` for
/// anything else, including a `var()` reference.
///
/// # JavaScript Examples
///
/// ```javascript
/// const stops = viewer.plugin_utils.parse_css_gradient(
///     "linear-gradient(to right, #000, #fff 80%)",
/// );
/// ```
#[wasm_bindgen(unchecked_return_type = "GradientStopRgb[] | undefined")]
pub fn parse_css_gradient(src: &str) -> JsValue {
    let stops: Option<Vec<GradientStopRgb>> = match crate::utils::CssGradient::parse(src) {
        Ok(crate::utils::CssGradient::Literal(stops)) => stops
            .iter()
            .map(|stop| {
                Some(GradientStopRgb {
                    rgb: hex_rgb(&stop.color)?,
                    offset: stop.offset,
                })
            })
            .collect(),
        _ => None,
    };

    to_js(&stops)
}

/// The colors of a palette value of the viewer's config grammar, a
/// `linear-gradient()` of color literals with no positions, or `undefined`
/// for anything else, including a `var()` reference.
///
/// # JavaScript Examples
///
/// ```javascript
/// const colors = viewer.plugin_utils.parse_css_palette(
///     "linear-gradient(to right, #f00, #0f0)",
/// );
/// ```
#[wasm_bindgen(unchecked_return_type = "RGB[] | undefined")]
pub fn parse_css_palette(src: &str) -> JsValue {
    let colors = match crate::utils::CssPalette::parse(src) {
        Ok(crate::utils::CssPalette::Literal(colors)) => colors
            .iter()
            .map(|x| hex_rgb(x))
            .collect::<Option<Vec<_>>>(),
        _ => None,
    };

    to_js(&colors)
}

/// The viewer's canonical gradient value for `stops`, sorted with every
/// position explicit to 0.1%.
///
/// # JavaScript Examples
///
/// ```javascript
/// const css = viewer.plugin_utils.css_gradient([
///     { color: "#000000", offset: 0 },
///     { color: "#ffffff", offset: 1 },
/// ]);
/// ```
#[wasm_bindgen]
pub fn css_gradient(
    #[wasm_bindgen(unchecked_param_type = "Array<{ color: string; offset: number }>")]
    stops: JsValue,
) -> ApiResult<String> {
    let stops: Vec<crate::utils::GradientStopSpec> = stops.into_serde_ext()?;
    Ok(crate::utils::gradient_to_css(&stops))
}

/// The viewer's canonical palette value for `colors`, with no positions.
///
/// # JavaScript Examples
///
/// ```javascript
/// const css = viewer.plugin_utils.css_palette(["#ff0000", "#00ff00"]);
/// ```
#[wasm_bindgen]
pub fn css_palette(colors: Vec<String>) -> String {
    crate::utils::palette_to_css(&colors)
}

thread_local! {
    static PLUGIN_UTILS: RefCell<JsValue> = const { RefCell::new(JsValue::UNDEFINED) };
}

/// Keep `utils`, the object the TypeScript bootstrap builds from this
/// module's exports and its own helpers, as the element's `plugin_utils`.
pub fn set_plugin_utils(utils: JsValue) {
    PLUGIN_UTILS.set(utils);
}

/// The object kept by [`set_plugin_utils`], backing the element's static
/// `plugin_utils`.
#[wasm_bindgen(skip_typescript)]
pub fn plugin_utils() -> JsValue {
    PLUGIN_UTILS.with_borrow(Clone::clone)
}

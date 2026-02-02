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

use std::fmt::{Debug, Write};
use std::sync::OnceLock;

use tracing::Subscriber;
use tracing::field::{Field, Visit};
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;
use wasm_bindgen::intern;
use wasm_bindgen::prelude::*;

use crate::utils::*;

/// A struct to implement the `Visit` visitor pattern trait to process
/// `tracing::Event`s.
#[derive(Default)]
struct LogLineBuffer {
    value: String,
    is_tail: bool,
}

impl Visit for LogLineBuffer {
    fn record_debug(&mut self, field: &Field, value: &dyn Debug) {
        if field.name() == "message" {
            if !self.value.is_empty() {
                self.value = format!("{:?}\n{}", value, self.value)
            } else {
                self.value = format!("{value:?}")
            }
        } else {
            if self.is_tail {
                writeln!(self.value).unwrap();
            } else {
                write!(self.value, " ").unwrap();
                self.is_tail = true;
            }

            write!(self.value, "{} = {:?};", field.name(), value).unwrap();
        }
    }
}

#[extend::ext]
impl tracing::Level {
    /// Convert a `tracing::Level` to an equivalent 4-arg call to the
    /// browser console via the `web_sys::console` module.
    fn web_logger_4(&self) -> fn(&JsValue, &JsValue, &JsValue, &JsValue) {
        match *self {
            tracing::Level::TRACE => web_sys::console::trace_4,
            tracing::Level::DEBUG => web_sys::console::debug_4,
            tracing::Level::INFO => web_sys::console::info_4,
            tracing::Level::WARN => web_sys::console::warn_4,
            tracing::Level::ERROR => web_sys::console::error_4,
        }
    }

    fn web_logger_1(&self) -> fn(&JsValue) {
        match *self {
            tracing::Level::TRACE => web_sys::console::trace_1,
            tracing::Level::DEBUG => web_sys::console::debug_1,
            tracing::Level::INFO => web_sys::console::info_1,
            tracing::Level::WARN => web_sys::console::warn_1,
            tracing::Level::ERROR => web_sys::console::error_1,
        }
    }

    /// Return a pretty color theme for a `tracing::Level`.
    fn web_log_color(&self) -> &'static str {
        match *self {
            tracing::Level::TRACE => "background: #005F73; color: #000",
            tracing::Level::DEBUG => "background: #0A9396; color: #000",
            tracing::Level::INFO => "background: #E9D8A6; color: #000",
            tracing::Level::WARN => "background: #EE9B00; color: #000",
            tracing::Level::ERROR => "background: #AE2012; color: #000",
        }
    }
}

static IS_CHROME: OnceLock<bool> = OnceLock::new();

fn detect_chrome() -> bool {
    if let Some(window) = web_sys::window() {
        window.get("chrome").is_some()
    } else {
        true
    }
}

#[extend::ext]
impl<'a> tracing::Metadata<'a> {
    /// Log a message in the style of `WasmLogger`.
    fn console_log(&self, msg: &str) {
        let level = self.level();
        let origin = self
            .module_path()
            .and_then(|file| self.line().map(|ln| format!("{}:{}", &file[11..], ln)))
            .unwrap_or_default();

        if *IS_CHROME.get_or_init(detect_chrome) {
            level.web_logger_4()(
                &format!("%c {level} %c {origin}%c {msg} ").into(),
                &level.web_log_color().into(),
                &intern("color: gray; font-style: italic").into(),
                &intern("color: inherit").into(),
            );
        } else {
            level.web_logger_1()(&format!("{origin} {msg}").into());
        }
    }
}

/// A custom logger modelled afer the `tracing_wasm` crate.
struct WasmLogger {
    max_level: tracing::Level,
}

impl Default for WasmLogger {
    fn default() -> Self {
        Self {
            max_level: tracing::Level::WARN,
        }
    }
}

impl<S: Subscriber + for<'a> LookupSpan<'a>> Layer<S> for WasmLogger {
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let mut recorder = LogLineBuffer::default();
        event.record(&mut recorder);
        event.metadata().console_log(&recorder.value);
    }

    fn enabled(&self, metadata: &tracing::Metadata<'_>, _: Context<'_, S>) -> bool {
        let level = metadata.level();
        level <= &self.max_level
    }

    fn on_new_span(
        &self,
        attrs: &tracing::span::Attributes<'_>,
        id: &tracing::Id,
        ctx: Context<'_, S>,
    ) {
        let mut new_debug_record = LogLineBuffer::default();
        attrs.record(&mut new_debug_record);
        if let Some(span_ref) = ctx.span(id) {
            span_ref
                .extensions_mut()
                .insert::<LogLineBuffer>(new_debug_record);
        }

        global::performance()
            .mark(&format!("t{:x}", id.into_u64()))
            .unwrap();
    }

    fn on_record(&self, id: &tracing::Id, values: &tracing::span::Record<'_>, ctx: Context<'_, S>) {
        if let Some(span_ref) = ctx.span(id)
            && let Some(debug_record) = span_ref.extensions_mut().get_mut::<LogLineBuffer>()
        {
            values.record(debug_record);
        }
    }

    fn on_close(&self, id: tracing::Id, ctx: Context<'_, S>) {
        if let Some(span_ref) = ctx.span(&id) {
            let perf = global::performance();
            let meta = span_ref.metadata();
            let mark = format!("t{:x}", id.into_u64());
            let start = perf
                .get_entries_by_name_with_entry_type(&mark, "mark")
                .at(-1)
                .unchecked_into::<web_sys::PerformanceMark>()
                .start_time();

            meta.console_log(&format!("{:.0}ms", perf.now() - start));
            let msg = format!(
                "\"{}\" {} {}",
                meta.name(),
                meta.module_path().unwrap_or_default(),
                span_ref
                    .extensions()
                    .get::<LogLineBuffer>()
                    .map(|x| &x.value[..])
                    .unwrap_or_default(),
            );

            perf.measure_with_start_mark(&msg, &mark).unwrap();
        }
    }
}

/// Configure `WasmLogger` as a global default for tracing.
///
/// This operation will conflict with any other library which sets a global
/// default `tracing::Subscriber`, so it should not be called when `perspective`
/// is used as a library from a larger app; in this case the app itself should
/// configure `tracing` explicitly.
pub fn set_global_logging() {
    static INIT_LOGGING: OnceLock<()> = OnceLock::new();
    INIT_LOGGING.get_or_init(|| {
        if !*IS_CHROME.get_or_init(detect_chrome) {
            web_sys::console::warn_1(
                &"Unknown browser detected. Some features may not work, and performance may be \
                  degraded."
                    .into(),
            );
        }

        use tracing_subscriber::layer::SubscriberExt;
        let filter = tracing_subscriber::filter::filter_fn(|meta| {
            meta.module_path()
                .as_ref()
                .map(|x| x.starts_with("perspective"))
                .unwrap_or_default()
        });

        let layer = WasmLogger::default().with_filter(filter);
        let subscriber = tracing_subscriber::Registry::default().with(layer);
        tracing::subscriber::set_global_default(subscriber).unwrap();
    });
}

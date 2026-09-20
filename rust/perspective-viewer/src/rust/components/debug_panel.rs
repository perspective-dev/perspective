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

use std::cell::Cell;
use std::rc::Rc;

use perspective_client::ExprValidationError;
use perspective_js::utils::{ApiFuture, JsValueSerdeExt};
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use crate::components::code_editor::CodeEditor;
use crate::config::*;
use crate::js::{MimeType, copy_to_clipboard, paste_from_clipboard};
use crate::presentation::*;
use crate::renderer::*;
use crate::session::*;
use crate::utils::*;
use crate::workspace::Workspace;

#[derive(Clone, PartialEq, Properties)]
pub struct DebugPanelProps {
    pub presentation: Presentation,
    pub renderer: Renderer,
    pub session: Session,
    pub workspace: Workspace,

    /// Trap-door width pinned by the parent `SettingsPanel` so switching
    /// tabs doesn't shrink the panel. Threaded into the hidden sizer
    /// `<div class="scroll-panel-auto-width">`.
    #[prop_or_default]
    pub initial_width: f64,

    /// Fires once on mount with this panel's measured natural width.
    /// Routed up to `SettingsPanel` which keeps the running max.
    #[prop_or_default]
    pub on_auto_width: Callback<f64>,
}

/// Whether the editor holds text the panel has not successfully applied, read
/// synchronously by the config-change listeners so a failed apply's own
/// `view_config_changed` never discards it.
type Dirty = Rc<Cell<bool>>;

#[function_component(DebugPanel)]
pub fn debug_panel(props: &DebugPanelProps) -> Html {
    let expr = use_state_eq(|| Rc::new("".to_string()));
    let error = use_state_eq(|| Option::<ExprValidationError>::None);
    let select_all = use_memo((), |()| PubSub::default());
    let modified = use_state_eq(|| false);
    let dirty: Dirty = use_memo((), |()| Cell::new(false));

    // Measure natural width on mount and route up to `SettingsPanel`.
    let sizer = use_node_ref();
    use_effect_with(expr.clone(), {
        let sizer = sizer.clone();
        let on_auto_width = props.on_auto_width.clone();
        move |_| {
            if let Some(elem) = sizer.cast::<web_sys::HtmlElement>() {
                on_auto_width.emit(elem.get_bounding_client_rect().width());
            }
        }
    });

    use_effect_with((expr.setter(), props.clone()), {
        clone!(error, modified, dirty);
        move |(text, state)| {
            state.set_text(text.clone());
            error.set(None);
            let sub1 = state
                .renderer
                .style_changed
                .add_listener(state.reset_callback(
                    text.clone(),
                    error.setter(),
                    modified.setter(),
                    dirty.clone(),
                ));

            let sub2 = state
                .renderer
                .reset_changed
                .add_listener(state.reset_callback(
                    text.clone(),
                    error.setter(),
                    modified.setter(),
                    dirty.clone(),
                ));

            let sub3 = state
                .session
                .view_config_changed
                .add_listener(state.reset_callback(
                    text.clone(),
                    error.setter(),
                    modified.setter(),
                    dirty.clone(),
                ));

            || {
                drop(sub1);
                drop(sub2);
                drop(sub3);
            }
        }
    });

    let oninput = use_callback(expr.setter(), {
        clone!(modified, dirty);
        move |x, expr| {
            dirty.set(true);
            modified.set(true);
            expr.set(x)
        }
    });

    let onsave = use_callback((expr.clone(), error.clone(), props.clone()), {
        clone!(modified, dirty);
        move |_, (text, error, props)| props.on_save(text, text.setter(), error, &modified, &dirty)
    });

    let oncopy = use_callback(
        (expr.clone(), select_all.callback()),
        move |_, (text, select_all)| {
            select_all.emit(());
            let options = web_sys::BlobPropertyBag::new();
            options.set_type("text/plain");
            let blob_txt = (JsValue::from((***text).clone())).clone();
            let blob_parts = js_sys::Array::from_iter([blob_txt].iter());
            let blob = web_sys::Blob::new_with_str_sequence_and_options(&blob_parts, &options);
            ApiFuture::spawn(copy_to_clipboard(
                async move { Ok(blob?) },
                MimeType::TextPlain,
            ));
        },
    );

    let onapply = use_callback((expr.clone(), error.clone(), props.clone()), {
        clone!(modified, dirty);
        move |_, (text, error, props)| props.on_save(text, text.setter(), error, &modified, &dirty)
    });

    let onreset = use_callback((expr.setter(), error.clone(), props.clone()), {
        clone!(modified, dirty);
        move |_, (text, error, props)| {
            dirty.set(false);
            props.set_text(text.clone());
            error.set(None);
            modified.set(false);
        }
    });

    let onpaste = use_callback((expr.clone(), error.clone(), props.clone()), {
        clone!(modified, dirty);
        move |_, (text, error, props)| {
            clone!(text, error, props, modified, dirty);
            ApiFuture::spawn(async move {
                if let Some(x) = paste_from_clipboard().await {
                    let x = Rc::new(x);
                    dirty.set(true);
                    modified.set(true);
                    error.set(None);
                    text.set(x.clone());
                    props.on_save(&x, text.setter(), &error, &modified, &dirty);
                }

                Ok(())
            });
        }
    });

    html! {
        <>
            <div id="debug-panel-overflow">
                <div id="debug-panel" class="sidebar_column" ref={sizer}>
                    <div id="debug-panel-controls">
                        <button id="debug-panel-apply" disabled={!*modified} onclick={onapply} />
                        <button id="debug-panel-reset" disabled={!*modified} onclick={onreset} />
                        <button id="debug-panel-copy" onclick={oncopy} />
                        <button id="debug-panel-paste" onclick={onpaste} />
                    </div>
                    <div id="debug-panel-editor">
                        <CodeEditor
                            expr={&*expr}
                            disabled=false
                            contained=true
                            {oninput}
                            {onsave}
                            select_all={select_all.subscriber()}
                            error={(*error).clone()}
                        />
                        if let Some(err) = &*error {
                            <div id="debug-panel-error" class="error">{ &err.error_message }</div>
                        }
                    </div>
                    <div
                        class="scroll-panel-auto-width"
                        style={format!("width:{}px", props.initial_width)}
                    />
                </div>
            </div>
        </>
    }
}

impl DebugPanelProps {
    fn set_text(&self, setter: UseStateSetter<Rc<String>>) {
        let props = self.clone();
        ApiFuture::spawn(async move {
            let config = crate::queries::get_viewer_config(
                &props.session,
                &props.renderer,
                &props.presentation,
            )
            .await?;
            let json = JsValue::from_serde_ext(&config)?;
            let js_string =
                js_sys::JSON::stringify_with_replacer_and_space(&json, &JsValue::NULL, &2.into())?;

            setter.set(Rc::new(js_string.as_string().unwrap()));
            Ok(())
        });
    }

    fn reset_callback(
        &self,
        text: UseStateSetter<Rc<String>>,
        error: UseStateSetter<Option<ExprValidationError>>,
        modified: UseStateSetter<bool>,
        dirty: Dirty,
    ) -> impl Fn(()) + use<> {
        let props = self.clone();
        move |_| {
            if dirty.get() {
                return;
            }

            error.set(None);
            props.set_text(text.clone());
            modified.set(false);
        }
    }

    /// Validate and apply the editor's text as this panel's config, treating
    /// an un-hosted `table` as a validation error rather than a pending bind.
    fn on_save(
        &self,
        source: &Rc<String>,
        text: UseStateSetter<Rc<String>>,
        error: &UseStateHandle<Option<ExprValidationError>>,
        modified: &UseStateHandle<bool>,
        dirty: &Dirty,
    ) {
        let props = self.clone();
        clone!(source, error, modified, dirty);
        ApiFuture::spawn(async move {
            let fail = |message: String, (line, column): (u32, u32)| {
                dirty.set(true);
                modified.set(true);
                error.set(Some(ExprValidationError {
                    error_message: message,
                    line,
                    column,
                }));
            };

            let config: ViewerConfigUpdate = match serde_json::from_str(&source) {
                Ok(config) => config,
                Err(err) => {
                    let position = (err.line() as u32 - 1, err.column() as u32 - 1);
                    fail(err.to_string(), position);
                    return Ok(());
                },
            };

            let active = props.workspace.active_renderer().as_ref() == Some(&props.renderer);
            let result = crate::tasks::restore_panel(
                &props.session,
                &props.renderer,
                &props.presentation,
                &props.workspace,
                crate::tasks::RestoreMode::Existing { active },
                config,
                crate::tasks::RestoreErrors::Suppress,
                MissingTable::Error,
                None,
            )
            .await;

            match result {
                Ok(_) => {
                    dirty.set(false);
                    error.set(None);
                    modified.set(false);
                    props.set_text(text);
                },
                Err(e) => {
                    let message = format!("{e}");
                    let position = if message.starts_with("Unknown table") {
                        locate_key(&source, "table")
                    } else {
                        (0, 0)
                    };

                    fail(message, position)
                },
            }

            Ok(())
        });
    }
}

/// The 0-based `(line, column)` of the first `"key"` in `text`, or `(0, 0)`
/// when absent.
fn locate_key(text: &str, key: &str) -> (u32, u32) {
    let needle = format!("\"{key}\"");
    text.lines()
        .enumerate()
        .find_map(|(line, content)| {
            content
                .find(&needle)
                .map(|column| (line as u32, column as u32))
        })
        .unwrap_or((0, 0))
}

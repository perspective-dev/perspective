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

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use perspective_client::ExprValidationError;
use perspective_js::utils::{ApiFuture, ApiResult, JsValueSerdeExt};
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use crate::components::editors::code_editor::CodeEditor;
use crate::config::*;
use crate::js::{MimeType, copy_to_clipboard, paste_from_clipboard};
use crate::presentation::*;
use crate::renderer::*;
use crate::session::*;
use crate::tasks::WorkspaceHost;
use crate::utils::*;
use crate::workspace::Workspace;

/// The config a [`JsonPanel`] reads and applies.
#[derive(Clone)]
pub enum JsonSource {
    Viewer {
        presentation: Presentation,
        renderer: Renderer,
        session: Session,
        workspace: Workspace,
    },
    Workspace(WorkspaceHost),
}

/// The listeners that keep a [`JsonPanel`]'s text current, dropped together.
pub struct JsonSubscriptions {
    _fixed: Vec<Subscription>,
    _panels: Rc<RefCell<Vec<Subscription>>>,
}

fn subscribe_panels(workspace: &Workspace, cb: &Callback<()>) -> Vec<Subscription> {
    workspace
        .panels()
        .into_iter()
        .flat_map(|panel| {
            [
                panel.session.view_config_changed.add_notify_listener(cb),
                panel.session.title_changed.add_notify_listener(cb),
                panel.renderer.style_changed.add_notify_listener(cb),
                panel.renderer.reset_changed.add_notify_listener(cb),
            ]
        })
        .collect()
}

fn stringify_value(json: &JsValue, formatted: bool) -> ApiResult<String> {
    let js_string = if formatted {
        js_sys::JSON::stringify_with_replacer_and_space(json, &JsValue::NULL, &2.into())?
    } else {
        js_sys::JSON::stringify(json)?
    };

    Ok(js_string.as_string().unwrap())
}

fn stringify<T: serde::Serialize>(config: &T, formatted: bool) -> ApiResult<String> {
    stringify_value(&JsValue::from_serde_ext(config)?, formatted)
}

/// `source` re-indented (or compacted) to match `formatted`, or `None` when it
/// does not parse.
fn reformat(source: &str, formatted: bool) -> Option<String> {
    let json = js_sys::JSON::parse(source).ok()?;
    stringify_value(&json, formatted).ok()
}

fn parse<T: for<'a> serde::Deserialize<'a>>(source: &str) -> Result<T, (String, (u32, u32))> {
    serde_json::from_str(source).map_err(|err| {
        let position = (err.line() as u32 - 1, err.column() as u32 - 1);
        (err.to_string(), position)
    })
}

fn locate_error(source: &str, message: String) -> (String, (u32, u32)) {
    let position = if message.starts_with("Unknown table") {
        locate_key(source, "table")
    } else {
        (0, 0)
    };

    (message, position)
}

impl JsonSource {
    async fn read(&self, formatted: bool) -> ApiResult<String> {
        match self {
            Self::Viewer {
                presentation,
                renderer,
                session,
                workspace,
            } => {
                let config = crate::queries::get_viewer_config(session, renderer, presentation)
                    .await?
                    .map_table(|name| workspace.inline_table_ref(&name));

                stringify(&config, formatted)
            },
            Self::Workspace(host) => stringify(
                &crate::queries::get_workspace_config(host, false).await?,
                formatted,
            ),
        }
    }

    /// Validate and apply `source`, treating an un-hosted `table` as a
    /// validation error rather than a pending bind.
    async fn apply(&self, source: &str) -> Result<(), (String, (u32, u32))> {
        let result = match self {
            Self::Viewer {
                presentation,
                renderer,
                session,
                workspace,
            } => {
                let config: ViewerConfigUpdate = parse(source)?;
                let active = workspace.active_renderer().as_ref() == Some(renderer);
                crate::tasks::restore_panel(
                    session,
                    renderer,
                    presentation,
                    workspace,
                    crate::tasks::RestoreMode::Existing { active },
                    config,
                    crate::tasks::RestoreErrors::Suppress,
                    MissingTable::Error,
                    None,
                )
                .await
            },
            Self::Workspace(host) => {
                let config: WorkspaceConfigUpdate = parse(source)?;
                let effect = host.workspace.effects().guard();
                let result = crate::tasks::restore_workspace(
                    host,
                    config,
                    MissingTable::Error,
                    crate::tasks::RestoreErrors::Suppress,
                )
                .await;

                drop(effect);
                result
            },
        };

        result.map_err(|e| locate_error(source, format!("{e}")))
    }

    fn subscribe(&self, cb: Callback<()>) -> JsonSubscriptions {
        match self {
            Self::Viewer {
                renderer, session, ..
            } => JsonSubscriptions {
                _fixed: vec![
                    renderer.style_changed.add_notify_listener(&cb),
                    renderer.reset_changed.add_notify_listener(&cb),
                    session.view_config_changed.add_notify_listener(&cb),
                ],
                _panels: Default::default(),
            },
            Self::Workspace(host) => {
                let workspace = &host.workspace;
                let panels = Rc::new(RefCell::new(subscribe_panels(workspace, &cb)));
                let on_layout = workspace.layout_changed().add_listener({
                    clone!(workspace, panels, cb);
                    move |_| {
                        let subs = subscribe_panels(&workspace, &cb);
                        *panels.borrow_mut() = subs;
                        cb.emit(());
                    }
                });

                JsonSubscriptions {
                    _fixed: vec![
                        on_layout,
                        workspace.active_changed().add_notify_listener(&cb),
                        workspace.filters_changed().add_notify_listener(&cb),
                        workspace.bindings_changed().add_notify_listener(&cb),
                        workspace.hosted_tables_changed().add_notify_listener(&cb),
                    ],
                    _panels: panels,
                }
            },
        }
    }
}

#[derive(Clone, Properties)]
pub struct JsonPanelProps {
    /// The id of the panel root and the prefix of its descendants' ids.
    pub id: &'static str,
    pub source: JsonSource,

    #[prop_or_default]
    pub initial_width: f64,

    #[prop_or_default]
    pub on_auto_width: Callback<f64>,
}

impl PartialEq for JsonPanelProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.id == rhs.id && self.initial_width == rhs.initial_width
    }
}

/// Whether the editor holds text the panel has not successfully applied, read
/// synchronously by the config-change listeners and again when a
/// [`JsonPanelProps::set_text`] read lands, so neither a failed apply's own
/// `view_config_changed` nor an in-flight config read discards it.
type Dirty = Rc<Cell<bool>>;

/// Whether the editor shows indented JSON, read by every config read.
type Formatted = Rc<Cell<bool>>;

/// A JSON editor over a [`JsonSource`], with apply, reset, copy, paste and an
/// indentation toggle.
#[function_component(JsonPanel)]
pub fn json_panel(props: &JsonPanelProps) -> Html {
    let expr = use_state_eq(|| Rc::new("".to_string()));
    let error = use_state_eq(|| Option::<ExprValidationError>::None);
    let select_all = use_memo((), |()| PubSub::default());
    let modified = use_state_eq(|| false);
    let dirty: Dirty = use_memo((), |()| Cell::new(false));
    let formatted: Formatted = use_memo((), |()| Cell::new(true));
    let is_formatted = use_state_eq(|| true);

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

    use_effect_with((), {
        clone!(error, modified, dirty, formatted);
        let state = props.clone();
        let text = expr.setter();
        move |()| {
            state.set_text(text.clone(), dirty.clone(), formatted.clone());
            error.set(None);
            let subs = state.source.subscribe(Callback::from(state.reset_callback(
                text.clone(),
                error.setter(),
                modified.setter(),
                dirty.clone(),
                formatted.clone(),
            )));

            || drop(subs)
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
        clone!(modified, dirty, formatted);
        move |_, (text, error, props)| {
            props.on_save(text, text.setter(), error, &modified, &dirty, &formatted)
        }
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
        clone!(modified, dirty, formatted);
        move |_, (text, error, props)| {
            props.on_save(text, text.setter(), error, &modified, &dirty, &formatted)
        }
    });

    let onreset = use_callback((expr.setter(), error.clone(), props.clone()), {
        clone!(modified, dirty, formatted);
        move |_, (text, error, props)| {
            dirty.set(false);
            props.set_text(text.clone(), dirty.clone(), formatted.clone());
            error.set(None);
            modified.set(false);
        }
    });

    let onformatted = use_callback((expr.clone(), is_formatted.clone()), {
        clone!(formatted);
        move |_, (text, is_formatted)| {
            let next = !**is_formatted;
            formatted.set(next);
            is_formatted.set(next);
            if let Some(source) = reformat(text, next) {
                text.set(Rc::new(source));
            }
        }
    });

    let onpaste = use_callback((expr.clone(), error.clone(), props.clone()), {
        clone!(modified, dirty, formatted);
        move |_, (text, error, props)| {
            clone!(text, error, props, modified, dirty, formatted);
            ApiFuture::spawn(async move {
                if let Some(x) = paste_from_clipboard().await {
                    let x = Rc::new(x);
                    dirty.set(true);
                    modified.set(true);
                    error.set(None);
                    text.set(x.clone());
                    props.on_save(&x, text.setter(), &error, &modified, &dirty, &formatted);
                }

                Ok(())
            });
        }
    });

    let id = props.id;
    html! {
        <>
            <div id={format!("{id}-overflow")}>
                <div {id} class="sidebar_column" ref={sizer}>
                    <div id={format!("{id}-controls")} class="sidebar-controls">
                        <button id={format!("{id}-apply")} disabled={!*modified} onclick={onapply} />
                        <button id={format!("{id}-reset")} disabled={!*modified} onclick={onreset} />
                        <button id={format!("{id}-copy")} onclick={oncopy} />
                        <button id={format!("{id}-paste")} onclick={onpaste} />
                        <button
                            id={format!("{id}-formatted")}
                            aria-pressed={is_formatted.to_string()}
                            onclick={onformatted}
                        />
                    </div>
                    <div id={format!("{id}-editor")}>
                        <CodeEditor
                            expr={&*expr}
                            disabled=false
                            contained=true
                            wordwrap={!*is_formatted}
                            {oninput}
                            {onsave}
                            select_all={select_all.subscriber()}
                            error={(*error).clone()}
                        />
                        if let Some(err) = &*error {
                            <div id={format!("{id}-error")} class="error">
                                { &err.error_message }
                            </div>
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

impl JsonPanelProps {
    /// Asynchronously read the source's config into the editor, unless the
    /// editor has unapplied text by the time the read lands.
    fn set_text(&self, setter: UseStateSetter<Rc<String>>, dirty: Dirty, formatted: Formatted) {
        let source = self.source.clone();
        ApiFuture::spawn(async move {
            let text = source.read(formatted.get()).await?;
            if !dirty.get() {
                setter.set(Rc::new(text));
            }

            Ok(())
        });
    }

    fn reset_callback(
        &self,
        text: UseStateSetter<Rc<String>>,
        error: UseStateSetter<Option<ExprValidationError>>,
        modified: UseStateSetter<bool>,
        dirty: Dirty,
        formatted: Formatted,
    ) -> impl Fn(()) + use<> {
        let props = self.clone();
        move |_| {
            if dirty.get() {
                return;
            }

            error.set(None);
            props.set_text(text.clone(), dirty.clone(), formatted.clone());
            modified.set(false);
        }
    }

    fn on_save(
        &self,
        source: &Rc<String>,
        text: UseStateSetter<Rc<String>>,
        error: &UseStateHandle<Option<ExprValidationError>>,
        modified: &UseStateHandle<bool>,
        dirty: &Dirty,
        formatted: &Formatted,
    ) {
        let props = self.clone();
        clone!(source, error, modified, dirty, formatted);
        ApiFuture::spawn(async move {
            match props.source.apply(&source).await {
                Ok(()) => {
                    dirty.set(false);
                    error.set(None);
                    modified.set(false);
                    props.set_text(text, dirty.clone(), formatted);
                },
                Err((message, (line, column))) => {
                    dirty.set(true);
                    modified.set(true);
                    error.set(Some(ExprValidationError {
                        error_message: message,
                        line,
                        column,
                    }));
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

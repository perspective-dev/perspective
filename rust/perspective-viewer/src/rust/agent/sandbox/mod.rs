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
use std::collections::{HashMap, VecDeque};
use std::rc::Rc;

use futures::channel::oneshot;
use perspective_client::{
    Client, DeleteOptions, Table, TableInitOptions, UpdateData, UpdateOptions,
};
use perspective_js::utils::{ApiError, ApiResult};
use serde_json::{Value, json};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::{HtmlIFrameElement, MessageChannel, MessageEvent, MessagePort};

const FRAME_HTML: &str = include_str!("frame.html");

const HARNESS_JS: &str = include_str!("harness.js");

const LOG_CAPACITY: usize = 20;

const LOG_ENTRY_CHARS: usize = 400;

const QUEUE_CAPACITY: usize = 64;

type MessageCallback = Closure<dyn FnMut(MessageEvent)>;

/// The outcome of a script's first `psp.emit()`, reported to `run_script`.
pub type FirstEmit = Result<(), String>;

/// A script's lifecycle as reported to the model.
#[derive(Clone, Copy, PartialEq)]
pub enum ScriptStatus {
    Running,
    Finished,
    Stopped,
}

impl ScriptStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Finished => "finished",
            Self::Stopped => "stopped",
        }
    }
}

enum SandboxMessage {
    Started,
    Emit { data: UpdateData, replace: bool },
    Log(String),
    Finished,
    Error(String),
}

impl SandboxMessage {
    fn decode(data: &JsValue) -> Result<Self, String> {
        let field = |key: &str| js_sys::Reflect::get(data, &JsValue::from_str(key)).ok();
        let text = |key: &str| field(key).and_then(|x| x.as_string());
        match text("t").as_deref() {
            Some("started") => Ok(Self::Started),
            Some("finished") => Ok(Self::Finished),
            Some("log") => Ok(Self::Log(text("text").unwrap_or_default())),
            Some("error") => Ok(Self::Error(
                text("message").unwrap_or_else(|| "Unknown script error".to_owned()),
            )),
            Some("emit") => {
                let payload = field("data").unwrap_or(JsValue::UNDEFINED);
                let data = match text("kind").as_deref() {
                    Some("rows") => payload.as_string().map(UpdateData::JsonRows),
                    Some("columns") => payload.as_string().map(UpdateData::JsonColumns),
                    Some("csv") => payload.as_string().map(UpdateData::Csv),
                    Some("arrow") => payload
                        .dyn_into::<js_sys::ArrayBuffer>()
                        .ok()
                        .map(|x| UpdateData::Arrow(js_sys::Uint8Array::new(&x).to_vec().into())),
                    _ => None,
                };

                let replace = field("replace").and_then(|x| x.as_bool()).unwrap_or(false);
                data.map(|data| Self::Emit { data, replace })
                    .ok_or_else(|| "Malformed `psp.emit()` message".to_owned())
            },
            _ => Err("Malformed sandbox message".to_owned()),
        }
    }
}

struct JobState {
    status: ScriptStatus,
    started: bool,
    emitted: bool,
    table: Option<Table>,
    replaced_in_place: bool,
    emits: usize,
    dropped: usize,
    last_error: Option<String>,
    log: VecDeque<String>,
    first: Option<oneshot::Sender<FirstEmit>>,
}

impl JobState {
    fn resolve_first(&mut self, outcome: FirstEmit) {
        if let Some(sender) = self.first.take() {
            let _ = sender.send(outcome);
        }
    }

    fn push_log(&mut self, text: String) {
        let text = if text.chars().count() > LOG_ENTRY_CHARS {
            format!(
                "{}…",
                text.chars().take(LOG_ENTRY_CHARS).collect::<String>()
            )
        } else {
            text
        };

        if self.log.len() == LOG_CAPACITY {
            self.log.pop_front();
        }

        self.log.push_back(text);
    }
}

/// One agent-authored module running in a sandboxed iframe + worker, feeding
/// one named hosted table.
pub struct ScriptJob {
    name: String,
    client: Client,
    options: TableInitOptions,
    frame: HtmlIFrameElement,
    port: MessagePort,
    state: RefCell<JobState>,
    queue: RefCell<VecDeque<SandboxMessage>>,
    draining: Cell<bool>,
    on_message: RefCell<Option<MessageCallback>>,
}

impl ScriptJob {
    /// The name of the table this script feeds.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// The table this script feeds, once it exists.
    pub fn table(&self) -> Option<Table> {
        self.state.borrow().table.clone()
    }

    /// Whether the sandbox acknowledged the script source.
    pub fn started(&self) -> bool {
        self.state.borrow().started
    }

    /// The most recent log lines, oldest first.
    pub fn log_tail(&self) -> Vec<String> {
        self.state.borrow().log.iter().cloned().collect()
    }

    /// Tear down the sandbox, which terminates the worker and any timers or
    /// sockets it holds.
    pub fn terminate(&self) {
        self.port.set_onmessage(None);
        self.port.close();
        self.frame.remove();
        self.queue.borrow_mut().clear();
        let mut state = self.state.borrow_mut();
        state.status = ScriptStatus::Stopped;
        state.first.take();
    }

    /// The model-facing description of this script and its table.
    pub async fn summary(&self) -> Value {
        let table = self.table();
        let (schema, rows) = match &table {
            Some(table) => (table.schema().await.ok(), table.size().await.ok()),
            None => (None, None),
        };

        let state = self.state.borrow();
        let mut summary = json!({
            "name": self.name,
            "status": state.status.as_str(),
            "schema": schema,
            "rows": rows,
            "emits": state.emits,
            "log": state.log,
        });

        if let Some(err) = &state.last_error {
            summary["last_error"] = json!(err);
        }

        if state.dropped > 0 {
            summary["dropped_batches"] = json!(state.dropped);
        }

        if state.replaced_in_place {
            summary["note"] = json!(
                "The table is displayed by a panel, so its contents were replaced in place and it \
                 keeps its original schema. Remove the panels that display it (or choose a new \
                 `name`) to change its columns."
            );
        }

        summary
    }

    fn post_start(&self, port: &MessagePort, source: &str) -> ApiResult<()> {
        self.frame.set_onload(None);
        let window = self
            .frame
            .content_window()
            .ok_or_else(|| ApiError::from("the sandbox was removed"))?;

        let message = js_sys::Object::new();
        js_sys::Reflect::set(&message, &"t".into(), &"start".into())?;
        js_sys::Reflect::set(&message, &"harness".into(), &HARNESS_JS.into())?;
        js_sys::Reflect::set(&message, &"source".into(), &source.into())?;
        window.post_message_with_transfer(&message, "*", &js_sys::Array::of1(port))?;
        Ok(())
    }

    fn receive(self: &Rc<Self>, event: MessageEvent) {
        let message = SandboxMessage::decode(&event.data()).unwrap_or_else(SandboxMessage::Error);
        {
            let mut queue = self.queue.borrow_mut();
            if queue.len() >= QUEUE_CAPACITY
                && let Some(idx) = queue
                    .iter()
                    .position(|x| matches!(x, SandboxMessage::Emit { .. }))
            {
                queue.remove(idx);
                self.state.borrow_mut().dropped += 1;
            }

            queue.push_back(message);
        }

        if !self.draining.replace(true) {
            let job = self.clone();
            wasm_bindgen_futures::spawn_local(async move { job.drain().await });
        }
    }

    async fn drain(self: Rc<Self>) {
        loop {
            let next = self.queue.borrow_mut().pop_front();
            let Some(message) = next else {
                break;
            };

            self.apply(message).await;
        }

        self.draining.set(false);
    }

    async fn apply(&self, message: SandboxMessage) {
        match message {
            SandboxMessage::Started => self.state.borrow_mut().started = true,
            SandboxMessage::Log(text) => self.state.borrow_mut().push_log(text),
            SandboxMessage::Finished => {
                let mut state = self.state.borrow_mut();
                if state.status == ScriptStatus::Running {
                    state.status = ScriptStatus::Finished;
                }

                if !state.emitted {
                    state.resolve_first(Err(
                        "The script finished without calling `psp.emit()`".to_owned()
                    ));
                }
            },
            SandboxMessage::Error(message) => self.fail(message),
            SandboxMessage::Emit { data, replace } => {
                if self.state.borrow().status == ScriptStatus::Stopped {
                    return;
                }

                match self.ingest(data, replace).await {
                    Ok(()) => {
                        let mut state = self.state.borrow_mut();
                        state.emits += 1;
                        state.emitted = true;
                        state.resolve_first(Ok(()));
                    },
                    Err(err) => self.fail(format!("`psp.emit()` was rejected: {err}")),
                }
            },
        }
    }

    fn fail(&self, message: String) {
        let mut state = self.state.borrow_mut();
        state.push_log(format!("error: {message}"));
        state.last_error = Some(message.clone());
        if !state.emitted {
            state.resolve_first(Err(message));
        }
    }

    async fn ingest(&self, data: UpdateData, replace: bool) -> ApiResult<()> {
        let (table, emitted) = {
            let state = self.state.borrow();
            (state.table.clone(), state.emitted)
        };

        match (table, emitted) {
            (Some(table), true) if replace => table.replace(data).await?,
            (Some(table), true) => table.update(data, UpdateOptions::default()).await?,
            (Some(previous), false) => {
                if previous.delete(DeleteOptions::default()).await.is_ok() {
                    self.state.borrow_mut().table = None;
                    self.create(data).await?;
                } else {
                    previous.replace(data).await?;
                    self.state.borrow_mut().replaced_in_place = true;
                }
            },
            (None, _) => self.create(data).await?,
        }

        Ok(())
    }

    async fn create(&self, data: UpdateData) -> ApiResult<()> {
        let table = self.client.table(data.into(), self.options.clone()).await?;
        self.state.borrow_mut().table = Some(table);
        Ok(())
    }
}

/// The registry of running agent scripts, keyed by table name.
#[derive(Default)]
pub struct AgentSandbox {
    jobs: RefCell<HashMap<String, Rc<ScriptJob>>>,
}

impl AgentSandbox {
    /// The script feeding the table `name`, if any.
    pub fn get(&self, name: &str) -> Option<Rc<ScriptJob>> {
        self.jobs.borrow().get(name).cloned()
    }

    /// Forget the script `name` without touching its table.
    pub fn remove(&self, name: &str) -> Option<Rc<ScriptJob>> {
        self.jobs.borrow_mut().remove(name)
    }

    /// Every registered script, ordered by name.
    pub fn jobs(&self) -> Vec<Rc<ScriptJob>> {
        let mut jobs = self.jobs.borrow().values().cloned().collect::<Vec<_>>();
        jobs.sort_by(|a, b| a.name.cmp(&b.name));
        jobs
    }

    /// Terminate every script, leaving their tables hosted.
    pub fn stop_all(&self) {
        for job in self.jobs() {
            job.terminate();
        }
    }

    /// Launch `source` in a new sandbox feeding the table `options.name`,
    /// resolving the receiver on its first emit.
    pub fn start(
        &self,
        source: &str,
        client: Client,
        options: TableInitOptions,
        previous: Option<Table>,
    ) -> ApiResult<(Rc<ScriptJob>, oneshot::Receiver<FirstEmit>)> {
        let name = options
            .name
            .clone()
            .ok_or_else(|| ApiError::from("A script table requires a name"))?;

        let document = web_sys::window()
            .and_then(|x| x.document())
            .ok_or_else(|| ApiError::from("No document"))?;

        let body = document
            .body()
            .ok_or_else(|| ApiError::from("No document body"))?;

        let frame = document
            .create_element("iframe")?
            .unchecked_into::<HtmlIFrameElement>();

        frame.set_attribute("sandbox", "allow-scripts")?;
        frame.set_attribute("srcdoc", FRAME_HTML)?;
        frame.set_attribute("aria-hidden", "true")?;
        frame.set_attribute("data-perspective-agent-script", &name)?;
        frame.set_attribute("style", "display:none")?;
        let channel = MessageChannel::new()?;
        let (sender, receiver) = oneshot::channel();
        let job = Rc::new(ScriptJob {
            name: name.clone(),
            client,
            options,
            frame: frame.clone(),
            port: channel.port1(),
            state: RefCell::new(JobState {
                status: ScriptStatus::Running,
                started: false,
                emitted: false,
                table: previous,
                replaced_in_place: false,
                emits: 0,
                dropped: 0,
                last_error: None,
                log: VecDeque::new(),
                first: Some(sender),
            }),
            queue: RefCell::default(),
            draining: Cell::new(false),
            on_message: RefCell::default(),
        });

        let weak = Rc::downgrade(&job);
        let on_message = MessageCallback::new(move |event| {
            if let Some(job) = weak.upgrade() {
                job.receive(event);
            }
        });

        job.port
            .set_onmessage(Some(on_message.as_ref().unchecked_ref()));

        *job.on_message.borrow_mut() = Some(on_message);
        let weak = Rc::downgrade(&job);
        let port = channel.port2();
        let source = source.to_owned();
        let on_load = Closure::once_into_js(move || {
            if let Some(job) = weak.upgrade()
                && let Err(err) = job.post_start(&port, &source)
            {
                job.fail(format!("The script sandbox failed to start: {err}"));
            }
        });

        frame.set_onload(Some(on_load.unchecked_ref()));
        if let Err(err) = body.append_child(&frame) {
            job.terminate();
            return Err(err.into());
        }

        self.jobs.borrow_mut().insert(name, job.clone());
        Ok((job, receiver))
    }
}

impl Drop for AgentSandbox {
    fn drop(&mut self) {
        self.stop_all();
    }
}

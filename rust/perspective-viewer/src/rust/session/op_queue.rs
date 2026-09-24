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

//! The per-panel op queue: every writer of a panel's committed state is an
//! [`OpKind`] submitted here, and the queue's single drain runs them one at a
//! time in SUBMIT order.

use std::cell::{Cell, RefCell};
use std::collections::{BTreeSet, VecDeque};

use futures::channel::oneshot;
use futures::future::LocalBoxFuture;
use perspective_client::config::ViewConfigUpdate;
use perspective_js::utils::*;

use crate::config::ColumnConfigFieldUpdate;
use crate::utils::InFlightGuard;

/// What an op's step hands back to the drain.
pub enum StepOutcome {
    /// The op is finished; its ticket resolves now.
    Done,

    /// The op's WRITE is finished, and the drain may run the next op; its
    /// ticket resolves when this render lands.
    Render(LocalBoxFuture<'static, ApiResult<()>>),
}

pub type StepFuture = LocalBoxFuture<'static, ApiResult<StepOutcome>>;
type Step = Box<dyn FnOnce(OpCtx) -> StepFuture>;

/// The top-level config keys an op OVERWRITES.
pub type Fields = Option<BTreeSet<&'static str>>;

/// What a UI edit changes — enough to PROJECT it onto the committed state
/// before the drain commits it.
#[derive(Clone)]
pub enum EditDelta {
    /// Boxed: `ViewConfigUpdate` is several times the size of every other
    /// variant, and every queued op pays for it.
    View(Box<ViewConfigUpdate>),

    /// One plugin-level settings field of the selected plugin.
    PluginField(ColumnConfigFieldUpdate),

    /// One style field of one column, for the selected plugin.
    ColumnField {
        column: String,
        update: ColumnConfigFieldUpdate,
    },

    /// Keys merged into the selected plugin's `plugin_config`.
    PluginConfig(serde_json::Map<String, serde_json::Value>),
    Theme(Option<String>),
    Title(Option<String>),
}

pub enum OpKind {
    /// A UI edit.
    Edit { delta: EditDelta, fields: Fields },

    /// A restore-family op.
    Restore { fields: Fields },

    /// The element's global filter, broadcast to this panel.
    Overlay,

    /// A `load()`.
    Load { table_known: bool },
}

impl OpKind {
    fn fields(&self) -> &Fields {
        match self {
            OpKind::Edit { fields, .. } | OpKind::Restore { fields } => fields,
            OpKind::Load { .. } | OpKind::Overlay => &None,
        }
    }

    /// Whether this LATER op makes the `earlier` one pointless: everything
    /// `earlier` would write, this op overwrites.
    fn covers(&self, earlier: &OpKind) -> bool {
        match (self, earlier) {
            (OpKind::Overlay, OpKind::Overlay) => true,
            (OpKind::Overlay, _) | (_, OpKind::Overlay) => false,
            (OpKind::Load { .. }, OpKind::Load { .. }) => true,
            (OpKind::Load { table_known }, _) => *table_known,
            (_, OpKind::Load { .. }) => false,
            (later, earlier) => match (later.fields(), earlier.fields()) {
                (Some(later), Some(earlier)) => earlier.is_subset(later),
                _ => false,
            },
        }
    }
}

/// A submitted op's handle: resolves exactly once, when the op (or, for a
/// superseded op, the op that superseded it) has finished AND rendered.
pub struct Ticket(oneshot::Receiver<ApiResult<()>>);

impl Ticket {
    /// A ticket for an op that will never run (the panel is disposed).
    pub fn settled(result: ApiResult<()>) -> Self {
        let (sender, receiver) = oneshot::channel();
        let _ = sender.send(result);
        Ticket(receiver)
    }

    pub async fn settle(self) -> ApiResult<()> {
        match self.0.await {
            Ok(result) => result,
            Err(_) => Err(ApiError::new("Cancelled")),
        }
    }
}

/// What a running step can ask of the queue.
#[derive(Clone)]
pub struct OpCtx {
    queue: std::rc::Rc<OpQueue>,
    kind_is_load: bool,
}

impl OpCtx {
    /// Whether a `load()` submitted since this op began makes its table binding
    /// pointless: a `load()` abandons for ANY later `load()`, a restore's
    /// rebind only for one already known to carry a `Table`.
    pub fn is_superseded(&self) -> bool {
        self.queue
            .entries
            .borrow()
            .iter()
            .any(|later| match later.kind {
                OpKind::Load { table_known } => self.kind_is_load || table_known,
                _ => false,
            })
    }
}

struct Entry {
    kind: OpKind,
    step: Step,
    replies: Vec<oneshot::Sender<ApiResult<()>>>,
    guards: Vec<Pending>,
}

impl Entry {
    fn resolve(self, result: ApiResult<()>) {
        resolve(self.replies, self.guards, result)
    }
}

fn resolve(
    replies: Vec<oneshot::Sender<ApiResult<()>>>,
    guards: Vec<Pending>,
    result: ApiResult<()>,
) {
    for reply in replies {
        let _ = reply.send(result.clone());
    }

    drop(guards);
}

/// One unsettled op's accounts, released together when its ticket resolves — on
/// every path (rendered, rejected, superseded, disposed): the busy indicator,
/// and the queue's own count of ops still in flight.
struct Pending {
    _busy: InFlightGuard,
    queue: std::rc::Weak<OpQueue>,
}

impl Drop for Pending {
    fn drop(&mut self) {
        if let Some(queue) = self.queue.upgrade() {
            queue.in_flight.set(queue.in_flight.get() - 1);
            if queue.in_flight.get() == 0 {
                for waiter in queue.idle_waiters.take() {
                    let _ = waiter.send(());
                }
            }
        }
    }
}

/// What happened to an entry the drain took off the queue without running.
pub enum Exit {
    Superseded,
    Rejected,
}

#[derive(Default)]
pub struct OpQueue {
    entries: RefCell<VecDeque<Entry>>,
    draining: Cell<bool>,
    load_running: Cell<bool>,

    /// Ops whose tickets have not resolved — queued, running, or committed with
    /// a detached render still to land.
    in_flight: Cell<usize>,
    idle_waiters: RefCell<Vec<oneshot::Sender<()>>>,
}

impl OpQueue {
    /// Append an op.
    pub fn push(
        self: &std::rc::Rc<Self>,
        kind: OpKind,
        guard: InFlightGuard,
        step: impl FnOnce(OpCtx) -> StepFuture + 'static,
    ) -> (Ticket, bool) {
        let (sender, receiver) = oneshot::channel();
        self.in_flight.set(self.in_flight.get() + 1);
        self.entries.borrow_mut().push_back(Entry {
            kind,
            step: Box::new(step),
            replies: vec![sender],
            guards: vec![Pending {
                _busy: guard,
                queue: std::rc::Rc::downgrade(self),
            }],
        });

        (Ticket(receiver), !self.draining.replace(true))
    }

    /// The deltas of every pending [`OpKind::Edit`], in submit order.
    pub fn pending_edits(&self) -> Vec<EditDelta> {
        self.entries
            .borrow()
            .iter()
            .filter_map(|entry| match &entry.kind {
                OpKind::Edit { delta, .. } => Some(delta.clone()),
                _ => None,
            })
            .collect()
    }

    /// Resolves once every submitted op's ticket has — nothing queued, nothing
    /// running, no committed render still to land.
    pub async fn idle(&self) {
        while self.in_flight.get() > 0 {
            let (sender, receiver) = oneshot::channel();
            self.idle_waiters.borrow_mut().push(sender);
            let _ = receiver.await;
        }
    }

    /// Whether a `load()` is queued or running.
    pub fn has_load(&self) -> bool {
        self.load_running.get() || self.has_queued_load()
    }

    /// Whether a `load()` is queued behind the running op.
    pub fn has_queued_load(&self) -> bool {
        self.entries
            .borrow()
            .iter()
            .any(|entry| matches!(entry.kind, OpKind::Load { .. }))
    }

    /// Run every queued op, one at a time, in submit order.
    pub async fn drain(self: std::rc::Rc<Self>, on_exit: impl Fn(Exit)) {
        loop {
            let Some(mut entry) = self.entries.borrow_mut().pop_front() else {
                break;
            };

            let is_edit = matches!(entry.kind, OpKind::Edit {
                delta: EditDelta::View(_),
                ..
            });
            let superseded = {
                let mut entries = self.entries.borrow_mut();
                match entries
                    .iter_mut()
                    .find(|later| later.kind.covers(&entry.kind))
                {
                    Some(later) => {
                        later.replies.append(&mut entry.replies);
                        later.guards.append(&mut entry.guards);
                        true
                    },
                    None => false,
                }
            };

            if superseded {
                if is_edit {
                    on_exit(Exit::Superseded);
                }

                continue;
            }

            let Entry {
                kind,
                step,
                replies,
                guards,
            } = entry;

            let kind_is_load = matches!(kind, OpKind::Load { .. });
            self.load_running.set(kind_is_load);
            let outcome = step(OpCtx {
                queue: self.clone(),
                kind_is_load,
            })
            .await;

            self.load_running.set(false);
            match outcome {
                Ok(StepOutcome::Done) => resolve(replies, guards, Ok(())),
                Ok(StepOutcome::Render(render)) => ApiFuture::spawn(async move {
                    resolve(replies, guards, render.await);
                    Ok(())
                }),
                Err(error) => {
                    if is_edit {
                        tracing::warn!("Edit rejected: {}", error);
                        on_exit(Exit::Rejected);
                    }

                    resolve(replies, guards, Err(error));
                },
            }
        }

        self.draining.set(false);
    }

    /// Reject everything still queued — the panel is gone.
    pub fn reject_all(&self, error: ApiResult<()>) {
        let entries = std::mem::take(&mut *self.entries.borrow_mut());
        for entry in entries {
            entry.resolve(error.clone());
        }
    }
}

/// The top-level view-config keys `update` overwrites.
pub fn view_fields(update: &ViewConfigUpdate) -> BTreeSet<&'static str> {
    let ViewConfigUpdate {
        group_by,
        split_by,
        columns,
        filter,
        sort,
        expressions,
        windows,
        aggregates,
        group_by_depth,
        filter_op,
        group_rollup_mode,
        split_rollup_mode,
    } = update;

    let mut fields = BTreeSet::new();
    let mut set = |name: &'static str, present: bool| {
        if present {
            fields.insert(name);
        }
    };

    set(
        "group_by",
        group_by.is_some() || group_rollup_mode.is_some(),
    );
    set(
        "group_rollup_mode",
        group_by.is_some() || group_rollup_mode.is_some(),
    );
    set("split_by", split_by.is_some());
    set("columns", columns.is_some());
    set("filter", filter.is_some());
    set("sort", sort.is_some());
    set("expressions", expressions.is_some());
    set("windows", windows.is_some());
    set("aggregates", aggregates.is_some());
    set("group_by_depth", group_by_depth.is_some());
    set("filter_op", filter_op.is_some());
    set("split_rollup_mode", split_rollup_mode.is_some());
    fields
}

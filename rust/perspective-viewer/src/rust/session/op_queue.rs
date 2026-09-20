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
use std::collections::VecDeque;
use std::rc::Rc;

use futures::channel::oneshot;
use futures::future::LocalBoxFuture;
use perspective_client::config::ViewConfigUpdate;
use perspective_js::utils::*;

use crate::config::{OptionalUpdate, ViewerConfigUpdate};
use crate::utils::InFlightGuard;

/// The render an op's ticket waits on after its write is finished.
pub type RenderFuture = LocalBoxFuture<'static, ApiResult<()>>;

/// An op's write, which yields the render its ticket resolves with, if any.
pub type StepFuture = LocalBoxFuture<'static, ApiResult<Option<RenderFuture>>>;
type Step = Box<dyn FnOnce(OpCtx) -> StepFuture>;

/// What a UI edit changes — enough to PROJECT it onto the committed state
/// before the drain commits it.
#[derive(Clone)]
pub enum EditDelta {
    View(Box<ViewConfigUpdate>),
    Title(Option<String>),

    /// An edit of the renderer's own state, which the renderer projects.
    Renderer,
}

pub enum OpKind {
    /// A UI edit, which a later op may supersede unless it swaps the plugin.
    Edit {
        delta: EditDelta,
        swaps_plugin: bool,
    },

    /// A restore-family op, which a later op may supersede when it carries
    /// its `update`.
    Restore {
        update: Option<Rc<ViewerConfigUpdate>>,
    },

    /// The element's global filter, broadcast to this panel.
    Overlay,

    /// A `load()`.
    Load { table_known: bool },
}

impl OpKind {
    fn writes(&self) -> Option<Writes<'_>> {
        match self {
            OpKind::Edit {
                delta: EditDelta::View(update),
                swaps_plugin: false,
            } => Some((update, None)),
            OpKind::Restore {
                update: Some(update),
            } => Some((&update.view_config, Some(update))),
            OpKind::Edit { .. }
            | OpKind::Restore { .. }
            | OpKind::Load { .. }
            | OpKind::Overlay => None,
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
            (later, earlier) => match (later.writes(), earlier.writes()) {
                (Some(later), Some(earlier)) => overwrites(later, earlier),
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
        {
            let replies = self.replies;
            for reply in replies {
                let _ = reply.send(result.clone());
            }
        }
    }
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
                Ok(None) => {
                    let result = Ok(());
                    for reply in replies {
                        let _ = reply.send(result.clone());
                    }

                    drop(guards);
                },
                Ok(Some(render)) => ApiFuture::spawn(async move {
                    {
                        let result = render.await;
                        for reply in replies {
                            let _ = reply.send(result.clone());
                        }

                        drop(guards);
                    };
                    Ok(())
                }),
                Err(error) => {
                    if is_edit {
                        tracing::warn!("Edit rejected: {}", error);
                        on_exit(Exit::Rejected);
                    }

                    {
                        let result = Err(error);
                        for reply in replies {
                            let _ = reply.send(result.clone());
                        }

                        drop(guards);
                    };
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

type Writes<'a> = (&'a ViewConfigUpdate, Option<&'a ViewerConfigUpdate>);

/// Whether `later` overwrites every top-level key `earlier` writes, which a
/// merging `plugin_config` / `columns_config` update never does.
fn overwrites((later_view, later): Writes, (earlier_view, earlier): Writes) -> bool {
    let empty = ViewerConfigUpdate::default();
    let later = later.unwrap_or(&empty);
    let ViewerConfigUpdate {
        version,
        plugin,
        plugin_config,
        columns_config,
        settings,
        theme,
        title,
        table,
        view_config,
    } = earlier.unwrap_or(&empty);

    let _ = (version, view_config);

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
    } = earlier_view;

    fn merges<T: Clone>(update: &OptionalUpdate<T>) -> bool {
        matches!(update, OptionalUpdate::Update(_))
    }

    fn kept<T: Clone>(earlier: &OptionalUpdate<T>, later: &OptionalUpdate<T>) -> bool {
        !matches!(earlier, OptionalUpdate::Missing) && matches!(later, OptionalUpdate::Missing)
    }

    let merging = merges(plugin_config)
        || merges(columns_config)
        || merges(&later.plugin_config)
        || merges(&later.columns_config);

    let groups = |x: &ViewConfigUpdate| x.group_by.is_some() || x.group_rollup_mode.is_some();
    let kept_view = (group_by.is_some() || group_rollup_mode.is_some()) && !groups(later_view)
        || split_by.is_some() && later_view.split_by.is_none()
        || columns.is_some() && later_view.columns.is_none()
        || filter.is_some() && later_view.filter.is_none()
        || sort.is_some() && later_view.sort.is_none()
        || expressions.is_some() && later_view.expressions.is_none()
        || windows.is_some() && later_view.windows.is_none()
        || aggregates.is_some() && later_view.aggregates.is_none()
        || group_by_depth.is_some() && later_view.group_by_depth.is_none()
        || filter_op.is_some() && later_view.filter_op.is_none()
        || split_rollup_mode.is_some() && later_view.split_rollup_mode.is_none();

    !merging
        && !kept_view
        && !kept(plugin, &later.plugin)
        && !kept(plugin_config, &later.plugin_config)
        && !kept(columns_config, &later.columns_config)
        && !kept(settings, &later.settings)
        && !kept(theme, &later.theme)
        && !kept(title, &later.title)
        && !kept(table, &later.table)
}

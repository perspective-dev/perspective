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

//! The multi-panel model backing a single `<perspective-viewer>`.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use perspective_client::Client;
use perspective_client::config::Filter;

use crate::renderer::Renderer;
use crate::session::Session;
use crate::utils::{EffectLedger, PubSub, Subscription, spawn_owned};

/// A unique identifier for a [`Panel`] within a [`Workspace`].
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct PanelId(String);

impl PanelId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for PanelId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for PanelId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl From<&str> for PanelId {
    fn from(value: &str) -> Self {
        Self(value.to_owned())
    }
}

/// The element-level global filter state (master/detail cross-filter.
#[derive(Default)]
struct GlobalFilterSet {
    restored: Vec<Filter>,
    contributions: Vec<(PanelId, Vec<Filter>)>,
}

impl GlobalFilterSet {
    /// The effective set: `restored`, then each contribution in order,
    /// deduped by clause equality.
    fn flatten(&self) -> Vec<Filter> {
        let mut flat: Vec<Filter> = Vec::new();
        let all = self
            .restored
            .iter()
            .chain(self.contributions.iter().flat_map(|(_, fs)| fs.iter()));

        for filter in all {
            if !flat.contains(filter) {
                flat.push(filter.clone());
            }
        }

        flat
    }

    /// Apply `f`, reporting whether the EFFECTIVE (flattened) set changed —
    /// internal-only moves (e.g. a clause migrating buckets) don't count, so
    /// observers re-render/re-query only on visible change.
    fn with_change(&mut self, f: impl FnOnce(&mut Self)) -> bool {
        let before = self.flatten();
        f(self);
        before != self.flatten()
    }

    /// Replace `id`'s contribution.
    fn set_contribution(&mut self, id: &PanelId, filters: Vec<Filter>) -> bool {
        self.with_change(|s| {
            if filters.is_empty() {
                s.contributions.retain(|(pid, _)| pid != id);
            } else {
                s.restored.clear();
                match s.contributions.iter_mut().find(|(pid, _)| pid == id) {
                    Some((_, fs)) => *fs = filters,
                    None => s.contributions.push((id.clone(), filters)),
                }
            }
        })
    }

    /// Remove the flattened-view clause at `index` from EVERY bucket.
    fn remove_clause(&mut self, index: usize) -> (bool, Vec<PanelId>) {
        let Some(clause) = self.flatten().get(index).cloned() else {
            return (false, Vec::new());
        };

        let owners = self
            .contributions
            .iter()
            .filter(|(_, fs)| fs.contains(&clause))
            .map(|(pid, _)| pid.clone())
            .collect();

        let changed = self.with_change(|s| {
            s.restored.retain(|f| f != &clause);
            for (_, fs) in s.contributions.iter_mut() {
                fs.retain(|f| f != &clause);
            }

            s.contributions.retain(|(_, fs)| !fs.is_empty());
        });

        (changed, owners)
    }

    /// Drop both buckets, returning the contribution owners (for
    /// selection-state cleanup).
    fn clear(&mut self) -> (bool, Vec<PanelId>) {
        let owners = self
            .contributions
            .iter()
            .map(|(pid, _)| pid.clone())
            .collect();

        let changed = self.with_change(|s| {
            s.restored.clear();
            s.contributions.clear();
        });

        (changed, owners)
    }

    /// `restoreWorkspace`: replace everything with an unattributed set.
    fn set_restored(&mut self, filters: Vec<Filter>) -> bool {
        self.with_change(|s| {
            s.contributions.clear();
            s.restored = filters;
        })
    }
}

/// A single, fully-independent viewer-like unit within a [`Workspace`].
#[derive(Clone)]
pub struct Panel {
    pub id: PanelId,
    pub session: Session,
    pub renderer: Renderer,
    _subs: Rc<Vec<Subscription>>,
}

impl Panel {
    pub fn new(id: PanelId, session: Session, renderer: Renderer, subs: Vec<Subscription>) -> Self {
        Self {
            id,
            session,
            renderer,
            _subs: Rc::new(subs),
        }
    }
}

/// A placed panel's layout phase.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PanelPhase {
    Staging,
    Placed,
}

/// A [`Panel`] as registered in the placed set.
struct PanelEntry {
    panel: Panel,
    phase: PanelPhase,
    master: bool,
}

#[derive(Default)]
enum Reservation {
    #[default]
    Idle,
    Pending(Panel),
    Claimed {
        has_table: bool,
    },
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum FlushState {
    #[default]
    Idle,
    Queued {
        layout: bool,
        active: bool,
    },
}

impl FlushState {
    /// Merge newly-dirty events, returning the next state and whether a flush
    /// task must be spawned.
    fn mark(self, layout: bool, active: bool) -> (Self, bool) {
        match self {
            _ if !layout && !active => (self, false),
            Self::Idle => (Self::Queued { layout, active }, true),
            Self::Queued {
                layout: l,
                active: a,
            } => (
                Self::Queued {
                    layout: l || layout,
                    active: a || active,
                },
                false,
            ),
        }
    }
}

#[derive(Default)]
struct LayoutEmitter {
    state: Cell<FlushState>,
    layout_changed: Rc<PubSub<Vec<PanelId>>>,
    active_changed: Rc<PubSub<Option<PanelId>>>,
}

impl LayoutEmitter {
    fn mark(&self, layout: bool, active: bool, workspace: &Workspace) {
        let (next, spawn) = self.state.get().mark(layout, active);
        self.state.set(next);
        if spawn {
            let workspace = workspace.clone();
            spawn_owned("workspace_layout_flush", async move {
                workspace.effects().settle().await;
                workspace.flush_layout_events();
                Ok(())
            });
        }
    }
}

/// The loaded-[`Client`]s registry and the default-client designation. The
/// invariant "the default is always a registered client" holds in this one
/// impl: every default assignment registers first, and removal clears both.
#[derive(Default)]
struct ClientRegistry {
    clients: Vec<Client>,
    default: Option<Client>,
    client_registered: Rc<PubSub<Client>>,
}

impl ClientRegistry {
    /// Add `client` if a client with the same (globally unique) name isn't
    /// already present, returning — for a genuinely-new client — the pubsub
    /// for the caller to emit OUTSIDE its borrow.
    fn register(&mut self, client: Client) -> Option<Rc<PubSub<Client>>> {
        if self
            .clients
            .iter()
            .any(|c| c.get_name() == client.get_name())
        {
            return None;
        }

        self.clients.push(client);
        Some(self.client_registered.clone())
    }

    /// Drop the client named `name`, clearing the default designation if it
    /// referred to it.
    fn remove(&mut self, name: &str) {
        self.clients.retain(|c| c.get_name() != name);
        if self.default.as_ref().is_some_and(|c| c.get_name() == name) {
            self.default = None;
        }
    }
}

/// The multi-panel model backing a single `<perspective-viewer>`. See the
/// module docs for the Phase 1 (single-panel) invariants.
#[derive(Clone)]
pub struct Workspace(Rc<RefCell<WorkspaceData>>);

impl PartialEq for Workspace {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.0, &other.0)
    }
}

struct WorkspaceData {
    /// Panels in insertion order, each with its per-panel attributes
    /// (placement phase, master role).
    panels: Vec<PanelEntry>,

    /// The currently active/selected panel (a live panel in `panels`).
    active: Option<PanelId>,

    /// The element-level global filters.
    filters: GlobalFilterSet,
    filters_changed: Rc<PubSub<()>>,

    /// The loaded-clients registry + default designation.
    clients: ClientRegistry,

    /// Monotonic counter backing [`Workspace::generate_id`].
    next_id: usize,

    /// The `load()` reservation slot (see [`Reservation`]).
    reservation: Reservation,

    /// A layout tree staged by `restoreWorkspace`.
    pending_layout: Option<crate::js::Layout>,

    /// In-flight effects (public mutators + scheduled internal flows),
    /// drained by `flush()`.
    effects: EffectLedger,

    /// Fires on every [`PanelPhase`] transition.
    staged_changed: Rc<PubSub<()>>,

    /// Coalesced `layout_changed`/`active_changed` delivery (see
    /// [`LayoutEmitter`]).
    emitter: LayoutEmitter,
}

impl Default for Workspace {
    fn default() -> Self {
        Self::new()
    }
}

impl Workspace {
    /// Create an EMPTY `Workspace`.
    pub fn new() -> Self {
        Self(Rc::new(RefCell::new(WorkspaceData {
            panels: Vec::new(),
            active: None,
            filters: GlobalFilterSet::default(),
            filters_changed: Rc::new(PubSub::default()),
            clients: ClientRegistry::default(),
            next_id: 0,
            reservation: Reservation::Idle,
            pending_layout: None,
            effects: EffectLedger::default(),
            staged_changed: Rc::new(PubSub::default()),
            emitter: LayoutEmitter::default(),
        })))
    }

    /// The element's in-flight effect ledger (see [`EffectLedger`]).
    pub fn effects(&self) -> EffectLedger {
        self.0.borrow().effects.clone()
    }

    pub fn layout_changed(&self) -> Rc<PubSub<Vec<PanelId>>> {
        self.0.borrow().emitter.layout_changed.clone()
    }

    pub fn active_changed(&self) -> Rc<PubSub<Option<PanelId>>> {
        self.0.borrow().emitter.active_changed.clone()
    }

    /// Deliver whatever the queued flush recorded, outside any borrow — the
    /// body of the task [`LayoutEmitter::mark`] spawns.
    fn flush_layout_events(&self) {
        let (state, panels, active_id, layout_pubsub, active_pubsub) = {
            let data = self.0.borrow();
            (
                data.emitter.state.replace(FlushState::Idle),
                data.panels
                    .iter()
                    .map(|p| p.panel.id.clone())
                    .collect::<Vec<_>>(),
                data.active.clone(),
                data.emitter.layout_changed.clone(),
                data.emitter.active_changed.clone(),
            )
        };

        if let FlushState::Queued { layout, active } = state {
            if layout {
                layout_pubsub.emit(panels);
            }

            if active {
                active_pubsub.emit(active_id);
            }
        }
    }

    /// Stage a layout tree for `MainPanel` to apply at its next `rendered`
    /// pass (see [`WorkspaceData::pending_layout`]).
    pub fn set_pending_layout(&self, layout: crate::js::Layout) {
        self.0.borrow_mut().pending_layout = Some(layout);
    }

    /// Take (consume) the staged layout tree, if any.
    pub fn take_pending_layout(&self) -> Option<crate::js::Layout> {
        self.0.borrow_mut().pending_layout.take()
    }

    /// A handle to the `staged_changed` PubSub (see
    /// [`WorkspaceData::staged_changed`]).
    pub fn staged_changed(&self) -> Rc<PubSub<()>> {
        self.0.borrow().staged_changed.clone()
    }

    /// Promote a staged panel toward layout insertion, returning whether it
    /// was still staged — restore completion and the staging deadline RACE
    /// to promote, and only the winner proceeds. Emits `staged_changed` —
    /// outside the borrow — iff the phase changed.
    pub fn promote(&self, id: &PanelId) -> bool {
        let (promoted, pubsub) = {
            let mut data = self.0.borrow_mut();
            let promoted = data
                .panels
                .iter_mut()
                .find(|p| &p.panel.id == id)
                .map(|entry| {
                    matches!(
                        std::mem::replace(&mut entry.phase, PanelPhase::Placed),
                        PanelPhase::Staging
                    )
                })
                .unwrap_or(false);

            (promoted, data.staged_changed.clone())
        };

        if promoted {
            pubsub.emit(());
        }

        promoted
    }

    /// Whether `id` is a staged (created, not yet layout-inserted) panel.
    pub fn is_staged(&self, id: &PanelId) -> bool {
        self.0
            .borrow()
            .panels
            .iter()
            .any(|p| &p.panel.id == id && p.phase == PanelPhase::Staging)
    }

    /// The EFFECTIVE element-level global filters (master/detail
    /// cross-filter): the restored bucket then each master's contribution,
    /// deduped, as a snapshot clone.
    pub fn global_filters(&self) -> Vec<Filter> {
        self.0.borrow().filters.flatten()
    }

    /// A handle to the `filters_changed` PubSub (fires after any change to the
    /// global filter set).
    pub fn filters_changed(&self) -> Rc<PubSub<()>> {
        self.0.borrow().filters_changed.clone()
    }

    /// Run `f` against the filter set inside the borrow, then emit
    /// `filters_changed` — outside it — iff the effective set changed.
    /// Returns `f`'s auxiliary payload.
    fn mutate_filters<T>(&self, f: impl FnOnce(&mut GlobalFilterSet) -> (bool, T)) -> T {
        let (changed, payload, pubsub) = {
            let mut data = self.0.borrow_mut();
            let (changed, payload) = f(&mut data.filters);
            (changed, payload, data.filters_changed.clone())
        };

        if changed {
            pubsub.emit(());
        }

        payload
    }

    /// Replace the global filter set.
    pub fn set_global_filters(&self, filters: Vec<Filter>) {
        self.mutate_filters(|s| (s.set_restored(filters), ()));
    }

    /// Replace master `id`'s contribution with a new selection (empty =
    /// deselect). See [`GlobalFilterSet::set_contribution`].
    pub fn set_contribution(&self, id: &PanelId, filters: Vec<Filter>) {
        self.mutate_filters(|s| (s.set_contribution(id, filters), ()));
    }

    /// Drop master `id`'s contribution (deselect / demote / close).
    pub fn clear_contribution(&self, id: &PanelId) {
        self.mutate_filters(|s| (s.set_contribution(id, Vec::new()), ()));
    }

    /// Remove the effective-set clause at `index`.
    pub fn remove_global_filter(&self, index: usize) -> Vec<PanelId> {
        self.mutate_filters(|s| s.remove_clause(index))
    }

    /// Drop the entire global filter set (the `GlobalFilterBar` "Clear" /
    /// element `reset()`).
    pub fn clear_global_filters(&self) -> Vec<PanelId> {
        self.mutate_filters(GlobalFilterSet::clear)
    }

    /// The master (filter-source) panel ids.
    pub fn masters(&self) -> Vec<PanelId> {
        let mut masters: Vec<_> = self
            .0
            .borrow()
            .panels
            .iter()
            .filter(|p| p.master)
            .map(|p| p.panel.id.clone())
            .collect();

        masters.sort();
        masters
    }

    /// Replace the master role set — the `restoreWorkspace` entry point
    /// (ids already remapped to the fresh panel ids). Ids naming no panel are
    /// dropped (the caller has already warned on them).
    pub fn set_masters(&self, ids: Vec<PanelId>) {
        let mut data = self.0.borrow_mut();
        for entry in data.panels.iter_mut() {
            entry.master = ids.contains(&entry.panel.id);
        }
    }

    /// Whether `id` is a master (filter-source) panel.
    pub fn is_master(&self, id: &PanelId) -> bool {
        self.0
            .borrow()
            .panels
            .iter()
            .any(|p| &p.panel.id == id && p.master)
    }

    /// Toggle `id`'s master/detail role, returning the new state (`true` =
    /// master). `false` (no role) if `id` names no panel.
    pub fn toggle_master(&self, id: &PanelId) -> bool {
        let mut data = self.0.borrow_mut();
        match data.panels.iter_mut().find(|p| &p.panel.id == id) {
            Some(entry) => {
                entry.master = !entry.master;
                entry.master
            },
            None => false,
        }
    }

    /// Generate a fresh [`PanelId`], unique within this workspace.
    pub fn generate_id(&self) -> PanelId {
        let mut data = self.0.borrow_mut();
        let n = data.next_id;
        data.next_id += 1;
        PanelId(format!("PERSPECTIVE_GENERATED_ID_{n}"))
    }

    /// The id of the active panel, or `None` with zero panels.
    pub fn active_id(&self) -> Option<PanelId> {
        self.0.borrow().active.clone()
    }

    /// The active [`Panel`] (clone; shares engine state), or `None` with zero
    /// panels.
    pub fn active_panel(&self) -> Option<Panel> {
        let data = self.0.borrow();
        let active = data.active.as_ref()?;
        data.panels
            .iter()
            .find(|p| &p.panel.id == active)
            .map(|p| p.panel.clone())
    }

    /// The active panel's [`Session`], or `None` with zero panels.
    pub fn active_session(&self) -> Option<Session> {
        self.active_panel().map(|p| p.session)
    }

    /// The active panel's [`Renderer`], or `None` with zero panels.
    pub fn active_renderer(&self) -> Option<Renderer> {
        self.active_panel().map(|p| p.renderer)
    }

    /// Look up a [`Panel`] by id.
    pub fn panel(&self, id: &PanelId) -> Option<Panel> {
        self.0
            .borrow()
            .panels
            .iter()
            .find(|p| &p.panel.id == id)
            .map(|p| p.panel.clone())
    }

    /// Resolve a panel by id, or the active panel when `id` is `None` — the
    /// shape the public `*Panel(name?)` delegating methods will use.
    pub fn panel_or_active(&self, id: Option<&PanelId>) -> Option<Panel> {
        match id {
            Some(id) => self.panel(id),
            None => self.active_panel(),
        }
    }

    /// Snapshot of all [`Panel`]s, in insertion order — the canonical
    /// fan-out source (fan-outs collect per-panel results; they never
    /// sequential-abort on one panel's error).
    pub fn panels(&self) -> Vec<Panel> {
        self.0
            .borrow()
            .panels
            .iter()
            .map(|p| p.panel.clone())
            .collect()
    }

    /// The number of PLACED panels (panels minus staged) — the single
    /// source for panel-count chrome (`single`/`multi`, closable,
    /// draggable, `only-child`).
    pub fn placed_count(&self) -> usize {
        self.0
            .borrow()
            .panels
            .iter()
            .filter(|p| p.phase == PanelPhase::Placed)
            .count()
    }

    /// All panel ids, in insertion order.
    pub fn panel_ids(&self) -> Vec<PanelId> {
        self.0
            .borrow()
            .panels
            .iter()
            .map(|p| p.panel.id.clone())
            .collect()
    }

    /// The number of panels (may be `0` — an empty stage).
    pub fn len(&self) -> usize {
        self.0.borrow().panels.len()
    }

    /// Whether the element has zero panels.
    pub fn is_empty(&self) -> bool {
        self.0.borrow().panels.is_empty()
    }

    /// Append a [`Panel`] at `phase`. When the element had zero panels, the
    /// inserted panel becomes the active one (there is no other candidate).
    /// A [`PanelPhase::Staging`] insert emits `staged_changed` — outside the
    /// borrow — so the phase and its announcement are one operation.
    pub fn insert_panel(&self, panel: Panel, phase: PanelPhase) {
        let staged_pubsub = {
            let mut data = self.0.borrow_mut();
            let activated = if data.active.is_none() {
                data.active = Some(panel.id.clone());
                true
            } else {
                false
            };

            panel
                .renderer
                .set_active_flag(data.active.as_ref() == Some(&panel.id));
            data.panels.push(PanelEntry {
                panel,
                phase,
                master: false,
            });

            Self::sync_solo_flags(&data);
            data.emitter.mark(true, activated, self);
            (phase == PanelPhase::Staging).then(|| data.staged_changed.clone())
        };

        if let Some(pubsub) = staged_pubsub {
            pubsub.emit(());
        }
    }

    /// Hold `panel` in the reservation slot ([`Reservation::Pending`]):
    /// NOT placed, invisible to every placed-panel consumer, awaiting a
    /// pending `load()`'s payload classification or an interim claimant.
    /// Resets any prior claim record — the slot serves one `load()` cycle at
    /// a time.
    pub fn reserve_panel(&self, panel: Panel) {
        let mut data = self.0.borrow_mut();
        debug_assert!(
            !matches!(data.reservation, Reservation::Pending(_)),
            "reservation overwritten while pending — adopt via `reserved_panel` first"
        );

        data.reservation = Reservation::Pending(panel);
    }

    /// The reservation slot's current occupant (shared handles), without a
    /// transfer — a second `load()` on a still-empty element adopts the same
    /// reservation rather than creating a competing one.
    pub fn reserved_panel(&self) -> Option<Panel> {
        match &self.0.borrow().reservation {
            Reservation::Pending(panel) => Some(panel.clone()),
            _ => None,
        }
    }

    /// CLAIM the reserved panel: transfer it out of the reservation slot into
    /// the placed set ([`Self::insert_panel`] — auto-activating on an empty
    /// element), recording `has_table` — whether the claimant carried a
    /// `table` — atomically with the transfer ([`Reservation::Claimed`]).
    /// `None` when nothing is pending (no reservation, or the other actor
    /// transferred first).
    pub fn claim_reserved(&self, has_table: bool) -> Option<Panel> {
        let panel = {
            let mut data = self.0.borrow_mut();
            match std::mem::take(&mut data.reservation) {
                Reservation::Pending(panel) => {
                    data.reservation = Reservation::Claimed { has_table };
                    Some(panel)
                },
                other => {
                    data.reservation = other;
                    None
                },
            }
        }?;

        self.insert_panel(panel.clone(), PanelPhase::Placed);
        Some(panel)
    }

    /// DISCARD the reserved panel: transfer it out of the reservation slot
    /// WITHOUT placing it, for disposal (an inert `Client` payload with no
    /// claimant, or teardown draining). `None` when nothing is pending; a
    /// claim record is left intact for [`Self::resolve_claim`].
    pub fn take_reserved(&self) -> Option<Panel> {
        let mut data = self.0.borrow_mut();
        match std::mem::take(&mut data.reservation) {
            Reservation::Pending(panel) => Some(panel),
            other => {
                data.reservation = other;
                None
            },
        }
    }

    /// ONE-SHOT read of the claim record: `Some(has_table)` if the
    /// reservation was claimed ([`Reservation::Claimed`]) — resetting the
    /// slot to [`Reservation::Idle`] — or `None` if no claim happened.
    /// Consuming closes the stale-flag window the former boolean had —
    /// `load()`'s inert-`Client` epilogue is the only reader, and reads it
    /// exactly once (eviction arms on `Some(false)`).
    pub fn resolve_claim(&self) -> Option<bool> {
        let mut data = self.0.borrow_mut();
        match data.reservation {
            Reservation::Claimed { has_table } => {
                data.reservation = Reservation::Idle;
                Some(has_table)
            },
            _ => None,
        }
    }

    /// Sync every panel renderer's solo (lone-panel) flag with the current
    /// panel count — called from each count-changing mutation site (data
    /// only; the `single`/`multi` CSS classes land inside each panel's next
    /// locked plugin dispatch — see `Renderer::stamp_active`).
    fn sync_solo_flags(data: &WorkspaceData) {
        let is_solo = data.panels.len() == 1;
        for entry in data.panels.iter() {
            entry.panel.renderer.set_solo_flag(is_solo);
        }
    }

    /// Remove a [`Panel`] by id, returning it if present. The entry's
    /// attributes (phase, master role) leave with it structurally; its
    /// global-filter contribution is dropped here, so neither can outlive
    /// the panel on ANY removal path (close, `restoreWorkspace`'s batch
    /// replacement).
    pub fn remove_panel(&self, id: &PanelId) -> Option<Panel> {
        let (removed, changed, filters_pubsub, was_staged, staged_pubsub) = {
            let mut data = self.0.borrow_mut();
            let changed = data.filters.set_contribution(id, Vec::new());
            let (removed, was_staged) = match data.panels.iter().position(|p| &p.panel.id == id) {
                Some(idx) => {
                    let entry = data.panels.remove(idx);
                    (Some(entry.panel), entry.phase == PanelPhase::Staging)
                },
                None => (None, false),
            };

            let deactivated = data.active.as_ref() == Some(id);
            if deactivated {
                data.active = None;
            }

            Self::sync_solo_flags(&data);
            data.emitter.mark(removed.is_some(), deactivated, self);
            (
                removed,
                changed,
                data.filters_changed.clone(),
                was_staged,
                data.staged_changed.clone(),
            )
        };

        if changed {
            filters_pubsub.emit(());
        }

        if was_staged {
            staged_pubsub.emit(());
        }

        removed
    }

    /// Set the active panel. Returns `false` (no-op) if `id` is not a known
    /// panel.
    pub fn set_active(&self, id: PanelId) -> bool {
        let mut data = self.0.borrow_mut();
        if data.panels.iter().any(|p| p.panel.id == id) {
            let changed = data.active.as_ref() != Some(&id);
            data.active = Some(id);
            for entry in data.panels.iter() {
                entry
                    .panel
                    .renderer
                    .set_active_flag(data.active.as_ref() == Some(&entry.panel.id));
            }

            data.emitter.mark(false, changed, self);
            true
        } else {
            false
        }
    }

    /// The default [`Client`], if one has been loaded.
    pub fn default_client(&self) -> Option<Client> {
        self.0.borrow().clients.default.clone()
    }

    /// The active panel's bound [`Client`], if any — the default target of a
    /// no-argument `eject()`.
    pub fn active_client(&self) -> Option<Client> {
        self.active_panel().and_then(|p| p.session.get_client())
    }

    /// The ids of every panel whose session is bound to the [`Client`] named
    /// `name` (client names are globally unique), in insertion order.
    pub fn panels_for_client(&self, name: &str) -> Vec<PanelId> {
        self.0
            .borrow()
            .panels
            .iter()
            .filter(|p| {
                p.panel
                    .session
                    .get_client()
                    .is_some_and(|c| c.get_name() == name)
            })
            .map(|p| p.panel.id.clone())
            .collect()
    }

    /// Drop the [`Client`] named `name` from the loaded-clients registry, and
    /// clear the default-client designation if it referred to this client.
    /// Callers must have already removed every panel bound to it (see
    /// [`Workspace::panels_for_client`]) — `clients()` unions in live panel
    /// sessions, so a lingering panel would resurrect it.
    pub fn remove_client(&self, name: &str) {
        self.0.borrow_mut().clients.remove(name);
    }

    /// Record the default [`Client`] if not already set (first-wins, matching
    /// the "first `Client` passed to `load()` is the default" rule). Always
    /// registers the client (see [`Workspace::register_client`]) — first-wins
    /// applies only to the *default* designation, which is assigned BEFORE
    /// the registration event fires, so listeners observe both together.
    pub fn set_default_client(&self, client: Client) {
        let pubsub = {
            let mut data = self.0.borrow_mut();
            let pubsub = data.clients.register(client.clone());
            if data.clients.default.is_none() {
                data.clients.default = Some(client.clone());
            }

            pubsub
        };

        if let Some(pubsub) = pubsub {
            pubsub.emit(client);
        }
    }

    /// Add a [`Client`] to the loaded-clients registry, if a client with the
    /// same (globally unique) name isn't already present. Emits
    /// `client_registered` — outside the borrow — for a genuinely-new client.
    pub fn register_client(&self, client: Client) {
        let pubsub = self.0.borrow_mut().clients.register(client.clone());
        if let Some(pubsub) = pubsub {
            pubsub.emit(client);
        }
    }

    /// A handle to the `client_registered` PubSub (see [`ClientRegistry`]).
    pub fn client_registered(&self) -> Rc<PubSub<Client>> {
        self.0.borrow().clients.client_registered.clone()
    }

    /// All loaded [`Client`]s: the registry, unioned with every panel
    /// session's bound client (belt-and-braces for any binding path that
    /// bypasses registration), deduped by name in registration order.
    pub fn clients(&self) -> Vec<Client> {
        let data = self.0.borrow();
        let mut clients = data.clients.clients.clone();
        for entry in &data.panels {
            if let Some(client) = entry.panel.session.get_client()
                && !clients.iter().any(|c| c.get_name() == client.get_name())
            {
                clients.push(client);
            }
        }

        clients
    }

    /// Resolve which loaded [`Client`] a panel should bind to serve the `Table`
    /// named `table_name`, given its `current` binding (if any).
    pub async fn resolve_client_for_table(
        &self,
        table_name: &str,
        current: Option<&Client>,
    ) -> Option<Client> {
        let clients = self.clients();

        // A single bound client is already correct — no probe, no rebind.
        if current.is_some() && clients.len() <= 1 {
            return None;
        }

        let mut host = None;
        for client in &clients {
            if let Ok(names) = client.get_hosted_table_names().await
                && names.iter().any(|n| n.as_str() == table_name)
            {
                host = Some(client.clone());
                break;
            }
        }

        match host {
            Some(host) if current.map(|c| c.get_name()) != Some(host.get_name()) => Some(host),
            Some(_) => None,
            // No host: seed an unbound session with the default client; leave a
            // bound session as-is.
            None => current.is_none().then(|| self.default_client()).flatten(),
        }
    }
}

#[cfg(test)]
mod tests {
    use perspective_client::config::FilterTerm;

    use super::*;

    fn f(col: &str, term: &str) -> Filter {
        Filter::new(col, "==", FilterTerm::Scalar(term.into()))
    }

    fn p(id: &str) -> PanelId {
        PanelId::from(id)
    }

    #[test]
    fn flatten_orders_and_dedups_across_buckets() {
        let mut s = GlobalFilterSet::default();
        assert!(s.set_restored(vec![f("a", "1"), f("b", "2")]));
        // A non-empty contribution drops the restored bucket entirely.
        assert!(s.set_contribution(&p("x"), vec![f("b", "2"), f("c", "3")]));
        assert_eq!(s.flatten(), vec![f("b", "2"), f("c", "3")]);
        assert!(s.set_contribution(&p("y"), vec![f("c", "3"), f("d", "4")]));
        assert_eq!(s.flatten(), vec![f("b", "2"), f("c", "3"), f("d", "4")]);
    }

    #[test]
    fn set_contribution_replaces_not_accumulates() {
        let mut s = GlobalFilterSet::default();
        assert!(s.set_contribution(&p("x"), vec![f("a", "1")]));
        assert!(s.set_contribution(&p("x"), vec![f("a", "2")]));
        assert_eq!(s.flatten(), vec![f("a", "2")]);
        // Re-selecting the same value reports no visible change.
        assert!(!s.set_contribution(&p("x"), vec![f("a", "2")]));
        // Empty = deselect: the entry is removed.
        assert!(s.set_contribution(&p("x"), Vec::new()));
        assert_eq!(s.flatten(), Vec::<Filter>::new());
    }

    #[test]
    fn contributions_are_per_panel() {
        let mut s = GlobalFilterSet::default();
        s.set_contribution(&p("x"), vec![f("a", "1")]);
        s.set_contribution(&p("y"), vec![f("b", "2")]);
        // Clearing one master's contribution leaves the other's intact.
        assert!(s.set_contribution(&p("x"), Vec::new()));
        assert_eq!(s.flatten(), vec![f("b", "2")]);
    }

    #[test]
    fn remove_clause_removes_from_every_bucket_and_reports_owners() {
        let mut s = GlobalFilterSet::default();
        s.set_contribution(&p("x"), vec![f("a", "1"), f("b", "2")]);
        s.set_contribution(&p("y"), vec![f("a", "1")]);
        // flatten = [a==1, b==2]; removing index 0 must drop BOTH copies of
        // a==1 (owners x AND y), and the now-empty "y" entry with it.
        let (changed, owners) = s.remove_clause(0);
        assert!(changed);
        assert_eq!(owners, vec![p("x"), p("y")]);
        assert_eq!(s.flatten(), vec![f("b", "2")]);
        // Out-of-range is a no-op.
        assert_eq!(s.remove_clause(5), (false, Vec::new()));
    }

    #[test]
    fn restored_bucket_survives_deselect_but_not_selection() {
        let mut s = GlobalFilterSet::default();
        s.set_restored(vec![f("a", "1")]);
        // A deselect (empty contribution) does NOT drop the restored bucket.
        assert!(!s.set_contribution(&p("x"), Vec::new()));
        assert_eq!(s.flatten(), vec![f("a", "1")]);
        // A real selection replaces it.
        assert!(s.set_contribution(&p("x"), vec![f("b", "2")]));
        assert_eq!(s.flatten(), vec![f("b", "2")]);
        assert!(s.restored.is_empty());
    }

    #[test]
    fn clear_drops_everything_and_reports_owners() {
        let mut s = GlobalFilterSet::default();
        s.set_restored(vec![f("a", "1")]);
        s.set_contribution(&p("x"), vec![f("b", "2")]);
        let (changed, owners) = s.clear();
        assert!(changed);
        assert_eq!(owners, vec![p("x")]);
        assert_eq!(s.flatten(), Vec::<Filter>::new());
        assert_eq!(s.clear(), (false, Vec::new()));
    }

    #[test]
    fn flush_state_spawns_exactly_once_per_cycle() {
        let (state, spawn) = FlushState::Idle.mark(true, false);
        assert!(spawn);
        assert_eq!(state, FlushState::Queued {
            layout: true,
            active: false
        });

        // Subsequent marks merge without re-spawning.
        let (state, spawn) = state.mark(false, true);
        assert!(!spawn);
        assert_eq!(state, FlushState::Queued {
            layout: true,
            active: true
        });

        let (state, spawn) = state.mark(true, true);
        assert!(!spawn);
        assert_eq!(state, FlushState::Queued {
            layout: true,
            active: true
        });
    }

    #[test]
    fn flush_state_ignores_empty_marks() {
        // A no-event mark neither queues nor spawns — `Queued{false,false}`
        // is unconstructible through `mark`.
        let (state, spawn) = FlushState::Idle.mark(false, false);
        assert!(!spawn);
        assert_eq!(state, FlushState::Idle);

        let queued = FlushState::Queued {
            layout: true,
            active: false,
        };

        let (state, spawn) = queued.mark(false, false);
        assert!(!spawn);
        assert_eq!(state, queued);
    }
}

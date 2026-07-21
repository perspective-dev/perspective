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

use std::cell::RefCell;
use std::collections::HashSet;
use std::rc::Rc;

use perspective_client::Client;
use perspective_client::config::Filter;

use crate::renderer::Renderer;
use crate::session::Session;
use crate::utils::{PubSub, Subscription};

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

/// The element-level global filter state (master/detail cross-filter): an
/// unattributed `restored` bucket (from whole-element `restore` — per-master
/// attribution is not persisted) plus one contribution per master panel, in
/// first-contribution order. The effective set is the ordered, deduped
/// flattening of both. Pure data — factored out of [`WorkspaceData`] so the
/// replace/dedup/removal semantics are unit-testable without engine handles.
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

    /// Replace `id`'s contribution (a master's new selection REPLACES its
    /// prior one — no plugin-remembered remove-lists). A non-empty selection
    /// also drops the `restored` bucket, which is a stale snapshot of some
    /// pre-save master's selection. Empty removes the entry (deselect).
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

    /// Remove the flattened-view clause at `index` from EVERY bucket (a chip
    /// stands for the clause, not one bucket's copy — removing it from only
    /// one would resurface the duplicate). Returns whether the effective set
    /// changed and the OWNING master panels of the removed clause (for
    /// selection-state cleanup). Out-of-range is a no-op.
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

    /// Whole-element `restore`: replace everything with an unattributed set.
    fn set_restored(&mut self, filters: Vec<Filter>) -> bool {
        self.with_change(|s| {
            s.contributions.clear();
            s.restored = filters;
        })
    }
}

/// A single, fully-independent viewer-like unit within a [`Workspace`]: its own
/// [`Session`] (table binding + view config) and [`Renderer`] (active plugin).
#[derive(Clone)]
pub struct Panel {
    pub id: PanelId,
    pub session: Session,
    pub renderer: Renderer,

    /// Subscriptions owned for this panel's lifetime: its redraw subscription
    /// (`table_updated` → redraw) plus its custom-event fanout
    /// (`wire_panel_events`). Held here — not on the element — so they drop
    /// exactly when the panel is removed from the [`Workspace`], with no
    /// separate add/remove bookkeeping.
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

/// The multi-panel model backing a single `<perspective-viewer>`. See the
/// module docs for the Phase 1 (single-panel) invariants.
#[derive(Clone)]
pub struct Workspace(Rc<RefCell<WorkspaceData>>);

struct WorkspaceData {
    /// Panels in insertion order.
    panels: Vec<Panel>,

    /// The currently active/selected panel. Always refers to a live panel in
    /// `panels`.
    active: PanelId,

    /// The first [`Client`] loaded via the element's `load()`, used as the
    /// default for panels which don't bind a `Table` from another client.
    /// First-wins (see [`Workspace::set_default_client`]).
    default_client: Option<Client>,

    /// Every [`Client`] ever loaded into this element (registration order,
    /// deduped by client name — globally unique). Feeds "all loaded clients"
    /// consumers (the context menu's New sub-menu) and client-by-name
    /// resolution; see [`Workspace::register_client`].
    clients: Vec<Client>,

    /// Monotonic counter backing [`Workspace::generate_id`].
    next_id: usize,

    /// Panels designated as master/detail filter sources: a master's
    /// selection or click applies a derived filter to the other (detail)
    /// panels. Toggled via the context menu; persisted (as ids) in the
    /// whole-element config.
    masters: HashSet<PanelId>,

    /// The element-level global filters (fed by master-panel selections),
    /// applied as a transient overlay to every non-master panel's view — see
    /// `tasks::apply_global_filters`. Never persisted per-panel. One
    /// REPLACEABLE contribution per master (plus a restored bucket), so
    /// bucket ownership both implements replace-semantics and tells
    /// `tasks::clear_master_selections` whose selection visual to clear.
    filters: GlobalFilterSet,

    /// Fires after any change to `global_filters`, so observers (the root
    /// component's render snapshot) can refresh. `Rc`-wrapped so a handle can
    /// be taken out of a borrow (to emit outside it) and shared with
    /// subscribers.
    filters_changed: Rc<PubSub<()>>,

    /// A layout tree staged by whole-element `restore` for `MainPanel` to
    /// apply (via `restoreSync`) at its next `rendered` pass, BEFORE the
    /// insert reconcile — so restored panels mount directly at their saved
    /// positions instead of transiting the synthetic equal-split inserts.
    /// Taken (consumed) by the applier; regular-layout stays a slave view
    /// synced from this model exactly once per restore.
    pending_layout: Option<crate::js::Layout>,
}

impl Workspace {
    /// Create a `Workspace` seeded with a single active [`Panel`] built from
    /// the supplied engine handles. `subs` are the seed panel's owned
    /// subscriptions (redraw + custom-event fanout; see [`Panel`]); the caller
    /// wires them so this module stays clear of the render/event plumbing.
    pub fn new(session: Session, renderer: Renderer, subs: Vec<Subscription>) -> Self {
        let id = PanelId("PERSPECTIVE_GENERATED_ID_0".to_owned());
        renderer.set_slot_name(id.as_str());
        renderer.set_active_flag(true);
        renderer.set_solo_flag(true);
        let panel = Panel::new(id.clone(), session, renderer, subs);
        Self(Rc::new(RefCell::new(WorkspaceData {
            panels: vec![panel],
            active: id,
            default_client: None,
            clients: Vec::new(),
            next_id: 1,
            masters: HashSet::new(),
            filters: GlobalFilterSet::default(),
            filters_changed: Rc::new(PubSub::default()),
            pending_layout: None,
        })))
    }

    /// Stage a layout tree for `MainPanel` to apply at its next `rendered`
    /// pass (see `WorkspaceData::pending_layout`).
    pub fn set_pending_layout(&self, layout: crate::js::Layout) {
        self.0.borrow_mut().pending_layout = Some(layout);
    }

    /// Take (consume) the staged layout tree, if any.
    pub fn take_pending_layout(&self) -> Option<crate::js::Layout> {
        self.0.borrow_mut().pending_layout.take()
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

    /// Replace the global filter set with an UNATTRIBUTED (restored) bucket,
    /// dropping every master contribution — the whole-element `restore`
    /// entry point. Callers push the new set into panel sessions via
    /// `tasks::apply_global_filters`.
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

    /// Remove the effective-set clause at `index` (the `GlobalFilterBar`
    /// chip ×), returning the OWNING master panels of the removed clause so
    /// the caller can clear their selection state
    /// (`tasks::clear_master_selections`).
    pub fn remove_global_filter(&self, index: usize) -> Vec<PanelId> {
        self.mutate_filters(|s| s.remove_clause(index))
    }

    /// Drop the entire global filter set (the `GlobalFilterBar` "Clear" /
    /// element `reset()`), returning the contribution owners for
    /// selection-state cleanup. Master ROLES are untouched — like the
    /// layout, they are workspace structure, not filter state.
    pub fn clear_global_filters(&self) -> Vec<PanelId> {
        self.mutate_filters(GlobalFilterSet::clear)
    }

    /// The master (filter-source) panel ids, SORTED — `save()` serializes
    /// this, and a `HashSet`'s per-instance iteration order would make
    /// consecutive `save()` outputs byte-unstable (cf. the `panels`
    /// `BTreeMap`).
    pub fn masters(&self) -> Vec<PanelId> {
        let mut masters: Vec<_> = self.0.borrow().masters.iter().cloned().collect();
        masters.sort();
        masters
    }

    /// Replace the master role set — the whole-element `restore` entry point
    /// (ids already remapped to the fresh panel ids).
    pub fn set_masters(&self, ids: Vec<PanelId>) {
        self.0.borrow_mut().masters = ids.into_iter().collect();
    }

    /// Whether `id` is a master (filter-source) panel.
    pub fn is_master(&self, id: &PanelId) -> bool {
        self.0.borrow().masters.contains(id)
    }

    /// Toggle `id`'s master/detail role, returning the new state (`true` =
    /// master).
    pub fn toggle_master(&self, id: &PanelId) -> bool {
        let mut data = self.0.borrow_mut();
        if data.masters.remove(id) {
            false
        } else {
            data.masters.insert(id.clone());
            true
        }
    }

    /// Generate a fresh [`PanelId`], unique within this workspace.
    pub fn generate_id(&self) -> PanelId {
        let mut data = self.0.borrow_mut();
        let n = data.next_id;
        data.next_id += 1;
        PanelId(format!("PERSPECTIVE_GENERATED_ID_{n}"))
    }

    /// The id of the active panel.
    pub fn active_id(&self) -> PanelId {
        self.0.borrow().active.clone()
    }

    /// The active [`Panel`] (clone; shares engine state).
    pub fn active_panel(&self) -> Panel {
        let data = self.0.borrow();
        data.panels
            .iter()
            .find(|p| p.id == data.active)
            .cloned()
            .expect("Workspace has no active panel")
    }

    /// The active panel's [`Session`].
    pub fn active_session(&self) -> Session {
        self.active_panel().session
    }

    /// The active panel's [`Renderer`].
    pub fn active_renderer(&self) -> Renderer {
        self.active_panel().renderer
    }

    /// Look up a [`Panel`] by id.
    pub fn panel(&self, id: &PanelId) -> Option<Panel> {
        self.0.borrow().panels.iter().find(|p| &p.id == id).cloned()
    }

    /// Resolve a panel by id, or the active panel when `id` is `None` — the
    /// shape the public `*Panel(name?)` delegating methods will use.
    pub fn panel_or_active(&self, id: Option<&PanelId>) -> Option<Panel> {
        match id {
            Some(id) => self.panel(id),
            None => Some(self.active_panel()),
        }
    }

    /// All panel ids, in insertion order.
    pub fn panel_ids(&self) -> Vec<PanelId> {
        self.0
            .borrow()
            .panels
            .iter()
            .map(|p| p.id.clone())
            .collect()
    }

    /// The number of panels (always ≥1).
    pub fn len(&self) -> usize {
        self.0.borrow().panels.len()
    }

    /// Always `false` — a `Workspace` always has at least one panel. Provided
    /// for API completeness / clippy.
    pub fn is_empty(&self) -> bool {
        self.0.borrow().panels.is_empty()
    }

    /// Append a [`Panel`].
    pub fn insert_panel(&self, panel: Panel) {
        let mut data = self.0.borrow_mut();
        panel.renderer.set_active_flag(panel.id == data.active);
        data.panels.push(panel);
        Self::sync_solo_flags(&data);
    }

    /// Sync every panel renderer's solo (lone-panel) flag with the current
    /// panel count — called from each count-changing mutation site (data
    /// only; the `single`/`multi` CSS classes land inside each panel's next
    /// locked plugin dispatch — see `Renderer::stamp_active`).
    fn sync_solo_flags(data: &WorkspaceData) {
        let is_solo = data.panels.len() == 1;
        for panel in data.panels.iter() {
            panel.renderer.set_solo_flag(is_solo);
        }
    }

    /// Remove a [`Panel`] by id, returning it if present.
    /// Remove a [`Panel`] by id, returning it if present. Model cleanup is
    /// structural: EVERY removal path (close, whole-element restore's batch
    /// replacement) drops the panel's master role and its global-filter
    /// contribution here, so neither can outlive the panel.
    pub fn remove_panel(&self, id: &PanelId) -> Option<Panel> {
        let (removed, changed, pubsub) = {
            let mut data = self.0.borrow_mut();
            data.masters.remove(id);
            let changed = data.filters.set_contribution(id, Vec::new());
            let removed = data
                .panels
                .iter()
                .position(|p| &p.id == id)
                .map(|idx| data.panels.remove(idx));
            Self::sync_solo_flags(&data);

            (removed, changed, data.filters_changed.clone())
        };

        if changed {
            pubsub.emit(());
        }

        removed
    }

    /// Set the active panel. Returns `false` (no-op) if `id` is not a known
    /// panel.
    pub fn set_active(&self, id: PanelId) -> bool {
        let mut data = self.0.borrow_mut();
        if data.panels.iter().any(|p| p.id == id) {
            data.active = id;
            // Sync the per-renderer activation flags (data only; the CSS
            // class lands inside each panel's next locked plugin dispatch —
            // see `Renderer::stamp_active`).
            for panel in data.panels.iter() {
                panel.renderer.set_active_flag(panel.id == data.active);
            }

            true
        } else {
            false
        }
    }

    /// The default [`Client`], if one has been loaded.
    pub fn default_client(&self) -> Option<Client> {
        self.0.borrow().default_client.clone()
    }

    /// The active panel's bound [`Client`], if any — the default target of a
    /// no-argument `eject()`.
    pub fn active_client(&self) -> Option<Client> {
        self.active_panel().session.get_client()
    }

    /// The ids of every panel whose session is bound to the [`Client`] named
    /// `name` (client names are globally unique), in insertion order.
    pub fn panels_for_client(&self, name: &str) -> Vec<PanelId> {
        self.0
            .borrow()
            .panels
            .iter()
            .filter(|p| p.session.get_client().is_some_and(|c| c.get_name() == name))
            .map(|p| p.id.clone())
            .collect()
    }

    /// Drop the [`Client`] named `name` from the loaded-clients registry, and
    /// clear the default-client designation if it referred to this client.
    /// Callers must have already removed every panel bound to it (see
    /// [`Workspace::panels_for_client`]) — `clients()` unions in live panel
    /// sessions, so a lingering panel would resurrect it.
    pub fn remove_client(&self, name: &str) {
        let mut data = self.0.borrow_mut();
        data.clients.retain(|c| c.get_name() != name);
        if data
            .default_client
            .as_ref()
            .is_some_and(|c| c.get_name() == name)
        {
            data.default_client = None;
        }
    }

    /// Record the default [`Client`] if not already set (first-wins, matching
    /// the "first `Client` passed to `load()` is the default" rule). Always
    /// registers the client (see [`Workspace::register_client`]) — first-wins
    /// applies only to the *default* designation.
    pub fn set_default_client(&self, client: Client) {
        self.register_client(client.clone());
        let mut data = self.0.borrow_mut();
        if data.default_client.is_none() {
            data.default_client = Some(client);
        }
    }

    /// Add a [`Client`] to the loaded-clients registry, if a client with the
    /// same (globally unique) name isn't already present.
    pub fn register_client(&self, client: Client) {
        let mut data = self.0.borrow_mut();
        if !data
            .clients
            .iter()
            .any(|c| c.get_name() == client.get_name())
        {
            data.clients.push(client);
        }
    }

    /// All loaded [`Client`]s: the registry, unioned with every panel
    /// session's bound client (belt-and-braces for any binding path that
    /// bypasses registration), deduped by name in registration order.
    pub fn clients(&self) -> Vec<Client> {
        let data = self.0.borrow();
        let mut clients = data.clients.clone();
        for panel in &data.panels {
            if let Some(client) = panel.session.get_client()
                && !clients.iter().any(|c| c.get_name() == client.get_name())
            {
                clients.push(client);
            }
        }

        clients
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
}

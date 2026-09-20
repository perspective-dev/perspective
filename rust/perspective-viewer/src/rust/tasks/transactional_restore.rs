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

//! A restore as a TRANSACTION: [`prepare`] makes every check that can fail —
//! and waits on every round trip — without writing anything; [`commit`] then
//! replaces the panel's state in ONE swap and cannot fail.

use std::rc::Rc;

use perspective_client::config::ViewConfigUpdate;
use perspective_js::utils::*;

use super::pipeline::{Committed, RunCommit, RunOrigin, RunSpec, locked_run, run_locked};
use crate::config::{OptionalUpdate, SettingsUpdate, ThemeUpdate, ViewerConfigUpdate};
use crate::presentation::Presentation;
use crate::renderer::{
    Renderer, ValidatedColumnsConfig, ValidatedPluginConfig, apply_columns_config_to,
    apply_plugin_config_to,
};
use crate::session::{
    BindPlan, BindingEffects, OverlayClause, PluginRef, PreparedView, Session, ViewDefaults,
};

/// A restore that has passed every check and only awaits [`commit`].
pub(crate) struct Prepared {
    state: PreparedState,
    effects: Effects,
}

/// The panel state a [`Prepared`] restore commits.
struct PreparedState {
    view: PreparedView,

    /// The plugin selection to commit, when the restore ends on a plugin other
    /// than the one selected (or selects the first).
    plugin: Option<PluginRef>,

    /// The name of the plugin the restore ends on — whose bucket the validated
    /// bucket updates belong to.
    target_name: String,
    plugin_config: ValidatedPluginConfig,
    columns_config: ValidatedColumnsConfig,
    theme: Option<Option<String>>,
    title: Option<Option<String>>,
}

/// What a restore does to the ELEMENT rather than the panel — applied once the
/// restore can no longer be rejected, as part of rendering it.
pub(crate) struct Effects {
    settings: SettingsUpdate,
    host_theme: ThemeUpdate,
}

/// Every fallible and asynchronous part of a restore.
pub(crate) async fn prepare(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    active: bool,
    plan: BindPlan,
    overlay: Option<Rc<Vec<OverlayClause>>>,
    update: ViewerConfigUpdate,
) -> ApiResult<Prepared> {
    let ViewerConfigUpdate {
        plugin,
        plugin_config,
        columns_config,
        settings,
        theme,
        title,
        view_config,
        ..
    } = update;

    renderer.check_plugin_update(&plugin)?;
    let named = renderer.resolve_plugin_update(&plugin);
    let (target, swap_idx) = renderer.resolve_target(&plugin)?;
    let defaults = match &named {
        Some((_, metadata)) => ViewDefaults::Swap(metadata),
        None => ViewDefaults::Rollup(&target.static_config),
    };

    let rebinds = !matches!(plan, BindPlan::Keep);
    let view = session
        .prepare_view(plan, view_config, defaults, overlay)
        .await?;
    let (plugin_config, columns_config) = renderer.prepare_buckets(
        &target,
        session,
        view.config(),
        view.view_schema(),
        rebinds,
        plugin_config,
        columns_config,
    )?;

    let panel_theme = match &theme {
        OptionalUpdate::Update(theme) => Some(Some(theme.clone())),
        OptionalUpdate::SetDefault => Some(presentation.get_default_theme_name().await),
        OptionalUpdate::Missing if renderer.committed_theme().is_none() => {
            Some(presentation.get_default_theme_name().await).filter(|x| x.is_some())
        },
        OptionalUpdate::Missing => None,
    };

    let title = match title {
        OptionalUpdate::Update(title) => Some(Some(title).filter(|x| !x.is_empty())),
        OptionalUpdate::SetDefault => Some(None),
        OptionalUpdate::Missing => None,
    };

    Ok(Prepared {
        state: PreparedState {
            view,
            plugin: swap_idx.map(|idx| renderer.plugin_ref(idx)).transpose()?,
            target_name: target.static_config.name.clone(),
            plugin_config,
            columns_config,
            theme: panel_theme,
            title,
        },
        effects: Effects {
            settings,
            host_theme: if active {
                theme
            } else {
                OptionalUpdate::Missing
            },
        },
    })
}

/// A UI edit as the transaction it is: the view-config `update` — and the
/// plugin swap `plugin_idx`, when the control made one — validated against what
/// the ops AHEAD of it left committed, including the server's `describe`.
pub(crate) async fn prepare_edit(
    session: &Session,
    renderer: &Renderer,
    update: ViewConfigUpdate,
    plugin_idx: Option<usize>,
) -> ApiResult<Prepared> {
    let selected = renderer.committed_plugin_idx();
    let (target, swap_idx) = match plugin_idx.filter(|idx| Some(*idx) != selected) {
        Some(idx) => (renderer.target_at(idx)?, Some(idx)),
        None => renderer.resolve_target(&OptionalUpdate::Missing)?,
    };

    let view = session
        .prepare_view(BindPlan::Keep, update, ViewDefaults::AsGiven, None)
        .await?
        .projected();

    edit_of(renderer, view, &target.static_config.name, swap_idx)
}

/// A new global-filter overlay as the transaction it is: the committed config
/// re-described with the clauses this panel's table honors.
pub(crate) async fn prepare_overlay(
    session: &Session,
    renderer: &Renderer,
    overlay: Rc<Vec<OverlayClause>>,
) -> ApiResult<Prepared> {
    let (target, swap_idx) = renderer.resolve_target(&OptionalUpdate::Missing)?;
    let view = session
        .prepare_view(
            BindPlan::Keep,
            ViewConfigUpdate::default(),
            ViewDefaults::AsGiven,
            Some(overlay),
        )
        .await?;

    edit_of(renderer, view, &target.static_config.name, swap_idx)
}

fn edit_of(
    renderer: &Renderer,
    view: PreparedView,
    target_name: &str,
    swap_idx: Option<usize>,
) -> ApiResult<Prepared> {
    Ok(Prepared {
        state: PreparedState {
            view,
            plugin: swap_idx.map(|idx| renderer.plugin_ref(idx)).transpose()?,
            target_name: target_name.to_owned(),
            plugin_config: ValidatedPluginConfig::Missing,
            columns_config: ValidatedColumnsConfig::Missing,
            theme: None,
            title: None,
        },
        effects: Effects {
            settings: OptionalUpdate::Missing,
            host_theme: OptionalUpdate::Missing,
        },
    })
}

/// Commit a [`prepare_edit`] NOW, in the op's step — so the write is the
/// drain's, and the render that follows may be detached.
pub(crate) fn commit_edit(session: &Session, renderer: &Renderer, prepared: Prepared) -> Committed {
    let (committed, binding) = commit(session, renderer, prepared.state);
    debug_assert!(!binding.rebound());
    binding.forget();
    committed
}

/// Commit and render a [`Prepared`] restore under a draw lock the caller
/// ALREADY holds (`load()`, which holds it across its payload's arrival).
pub(crate) async fn commit_and_render_locked(
    guard: crate::utils::RenderGuard,
    session: &Session,
    renderer: &Renderer,
    Prepared { state, .. }: Prepared,
) -> ApiResult<()> {
    let commit = {
        let (session, renderer) = (session.clone(), renderer.clone());
        Box::new(move || commit(&session, &renderer, state))
    };

    run_locked(guard, session.clone(), renderer.clone(), RunSpec {
        origin: RunOrigin::Public,
        commit: RunCommit::Deferred(commit),
        presentation: None,
    })
    .await
}

/// Replace the panel's state with a [`Prepared`] restore, in one swap.
fn commit(
    session: &Session,
    renderer: &Renderer,
    prepared: PreparedState,
) -> (Committed, BindingEffects) {
    let PreparedState {
        view,
        plugin,
        target_name,
        plugin_config,
        columns_config,
        theme,
        title,
    } = prepared;

    let had_plugin = renderer.active_plugin().is_some();
    let activate = plugin.is_some();
    let mut plugin_config_changed = false;
    let mut columns_config_changed = false;
    let binding = session.commit_view(view, |mut next| {
        if let Some(plugin) = plugin {
            next = next.with_plugin(plugin);
        }

        let mut bucket = next.bucket(&target_name);
        plugin_config_changed = apply_plugin_config_to(&mut bucket, plugin_config);
        columns_config_changed = apply_columns_config_to(&mut bucket, columns_config);
        if plugin_config_changed || columns_config_changed {
            next = next.with_bucket(&target_name, bucket);
        }

        if let Some(theme) = theme {
            next = next.with_theme(theme);
        }

        if let Some(title) = title {
            next = next.with_title(title);
        }

        next
    });

    let committed = Committed {
        activate,
        plugin_swapped: activate && had_plugin,
        plugin_config_changed,
        columns_config_changed,
    };

    (committed, binding)
}

/// A restore that leaves the table binding alone, for the host's own re-renders
/// (a reset, an auto-pause resume): to be called only from a running op's step.
pub(crate) async fn restore_in_place(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    origin: RunOrigin,
    update: ViewerConfigUpdate,
) -> ApiResult<()> {
    let prepared = prepare(
        session,
        renderer,
        presentation,
        false,
        BindPlan::Keep,
        None,
        update,
    )
    .await?;
    commit_and_render(session, renderer, presentation, origin, prepared)
        .await
        .result
}

/// Whether a restore that failed had ALREADY committed — what tells a rejection
/// (the panel is as it was) from a failure to render valid state.
pub(crate) struct Outcome {
    pub committed: bool,
    pub result: ApiResult<()>,
}

/// Commit a [`Prepared`] restore and render it: element-level effects, then the
/// locked run, whose first act is the commit — under the draw lock, so no
/// render of the outgoing state can bind a `View` over the incoming table.
pub(crate) async fn commit_and_render(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    origin: RunOrigin,
    Prepared { state, effects }: Prepared,
) -> Outcome {
    let Effects {
        settings,
        host_theme,
    } = effects;

    let did_commit = std::rc::Rc::new(std::cell::Cell::new(false));
    let result = render(
        session,
        renderer,
        presentation,
        origin,
        settings,
        host_theme,
        {
            let (session, renderer, did_commit) =
                (session.clone(), renderer.clone(), did_commit.clone());
            Box::new(move || {
                did_commit.set(true);
                commit(&session, &renderer, state)
            })
        },
    )
    .await;

    Outcome {
        committed: did_commit.get(),
        result,
    }
}

#[allow(clippy::too_many_arguments)]
async fn render(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    origin: RunOrigin,
    settings: SettingsUpdate,
    host_theme: ThemeUpdate,
    commit: Box<dyn FnOnce() -> (Committed, BindingEffects)>,
) -> ApiResult<()> {
    if let OptionalUpdate::Update(x) = settings {
        presentation.set_settings_attribute(x);
        presentation.set_settings_before_open(x);
    }

    match host_theme {
        OptionalUpdate::SetDefault => {
            if presentation.get_selected_theme_name().await.is_some() {
                presentation.set_theme_name(None).await?;
            }
        },
        OptionalUpdate::Update(x) => {
            presentation.set_theme_name(Some(&x)).await?;
        },
        OptionalUpdate::Missing => {},
    }

    locked_run(session, renderer, RunSpec {
        origin,
        commit: RunCommit::Deferred(commit),
        presentation: Some(presentation.clone()),
    })
    .await?;

    if renderer.needs_restyle() {
        renderer.restyle_all().await?;
    }

    presentation.publish_theme_config().await?;
    Ok(())
}

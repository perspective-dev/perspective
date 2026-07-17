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

//! Apply a full [`ViewerConfigUpdate`] (settings, theme, title, plugin,
//! plugin_config, columns_config, view_config) and re-draw, on the snapshot
//! pipeline (see `tasks/pipeline.rs` / `SESSION_CONFIG_COHERENCE_PLAN.md`).

use futures::Future;
use perspective_client::clone;

use super::pipeline::{RunOrigin, bind_snapshot, dispatch_bound};
use crate::config::{OptionalUpdate, ViewerConfigUpdate};
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::Session;
use crate::*;

/// Apply a full [`ViewerConfigUpdate`] (theme, title, plugin selection,
/// plugin config, columns config, view config) to the engines and re-draw.
/// Returns an [`ApiFuture<()>`] which resolves when the draw completes.
///
/// `origin` says who initiated the restore ([`RunOrigin`]): a `Public`
/// element-API call keeps the no-op-restore refresh affordance (an
/// `Unchanged` reconcile still repaints via `update`); an `Internal`
/// restore that reconciles `Unchanged` and changes no plugin state
/// dispatches nothing.
pub fn restore_and_render(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    origin: RunOrigin,
    ViewerConfigUpdate {
        plugin,
        plugin_config,
        columns_config,
        settings,
        theme: theme_name,
        title,
        mut view_config,
        ..
    }: ViewerConfigUpdate,
    task: impl Future<Output = Result<(), ApiError>> + 'static,
) -> ApiFuture<()> {
    clone!(session, renderer, presentation);
    ApiFuture::new(async move {
        if let OptionalUpdate::Update(x) = settings {
            presentation.set_settings_attribute(x);
            presentation.set_settings_before_open(x);
        }

        if let OptionalUpdate::Update(title) = title {
            session.set_title(Some(title));
        } else if matches!(title, OptionalUpdate::SetDefault) {
            session.set_title(None);
        }

        // Mirror a config-carried theme onto the host attribute (the shared
        // chrome). The restyle a theme change requires is owned by the
        // MUTATION SITES (`restorePanel`'s own-theme tail, the theme-picker
        // task), not here — this run's own draw below already stamps the new
        // effective theme before the plugin's first style read.
        match theme_name {
            OptionalUpdate::SetDefault => {
                let current_name = presentation.get_selected_theme_name().await;
                if current_name.is_some() {
                    presentation.set_theme_name(None).await?;
                }
            },
            OptionalUpdate::Update(x) => {
                // No pre-resolution gate: `set_theme_name` stamps the host
                // attribute SYNCHRONOUSLY before its registry await and
                // no-ops on literal equality itself. The old
                // `get_selected_theme_name().await` guard was precisely
                // the former-theme window on a cold registry — the host
                // held the old attribute until stylesheet parsing (and
                // everything queued behind it) resolved.
                presentation.set_theme_name(Some(&x)).await?;
            },
            _ => {},
        };

        // Resolve the target plugin here (pure — needed now for
        // `set_update_column_defaults`), but COMMIT it only inside the locked
        // run below, atomically with the view rebind it belongs to. No swap
        // intent may exist outside that run: an unrelated run that wins the
        // lock first (e.g. a `table_updated` redraw) must observe either the
        // fully-old or fully-new world, never a staged half of this one.
        let resolved_plugin = renderer.resolve_plugin_update(&plugin);
        if let Some((_, metadata)) = &resolved_plugin {
            session.set_update_column_defaults(&mut view_config, metadata);
        } else {
            // Same-plugin (or plugin-less) restore: `resolve_plugin_update`
            // returns `None`, but the plugin-advised `group_rollup_mode`
            // must STILL be enforced against the active plugin's metadata —
            // `restorePanel`'s table-change reset wipes the committed mode,
            // and nothing else on this path would restore it, leaving a
            // flat-only chart (Treemap / Sunburst) rendering rollup
            // subtotal rows. Rollup only; the full column-defaults pass is
            // reserved for plugin swaps, where `columns` genuinely needs
            // re-defaulting.
            session.set_update_rollup_defaults(&mut view_config, &renderer.metadata());
        }

        let plugin_idx = resolved_plugin.map(|(idx, _)| idx);

        // The config COMMIT: synchronous, validated, atomic (I1/I4). Under
        // I2/I3 committing before the lock is safe — whichever queued run
        // snapshots next picks it up, and this run's own snapshot (taken
        // inside the lock below) can only be this commit or fresher.
        session.commit_view_config(view_config)?;

        // Spinner accounting (RAII): held to the end of this restore —
        // INCLUDING the deferred-draw exit below (no table yet → no
        // `bind_snapshot`), which under the old edge-counted scheme
        // stranded the `StatusIndicator` spinner permanently.
        let _run_token = session.begin_config_run();

        // Awaits theme-registry init, so the stamp below can never observe a
        // pre-init (empty) theme set on a cold first load. Seeds this
        // panel's renderer default-theme cache, which every locked draw
        // stamps the effective theme from.
        renderer.set_default_theme(presentation.get_default_theme_name().await);
        let run_result = {
            clone!(session, renderer, presentation);
            renderer
                .clone()
                .render_task(|guard| async move {
                    // Mount eagerly — BEFORE the (possibly slow) `task`
                    // completion gate — so the panel's frame is never empty
                    // while it resolves. Idempotent; pre-swap this is the
                    // outgoing plugin, exactly as before.
                    renderer.mount_active_plugin()?;
                    task.await?;
                    let plugin_swapped = renderer.commit_plugin(plugin_idx)?;
                    // `commit_plugin` above already selected, so the pure query
                    // returns it (no need to re-select via
                    // `ensure_plugin_selected`).
                    let plugin = renderer.active_plugin().ok_or("No Plugin")?;

                    // "Stamp before restyle": the plugin captures its `--psp-*`
                    // CSS at first `draw()`, so stamp the effective `theme` attr
                    // NOW, inside the locked run, before any plugin style read —
                    // this covers the `plugin.restore` below even when the run
                    // draws nothing (hidden panel / no table yet); the draw
                    // paths stamp for themselves (`draw_view`).
                    renderer.stamp_theme(Some(&plugin));

                    // The previous call which acquired the lock errored, so skip
                    // this render
                    if let Some(error) = session.get_error() {
                        return Err(error);
                    }

                    // Snapshot + validate + bind BEFORE applying
                    // columns_config / plugin_config updates, so the
                    // strip-on-write and materialize passes see fresh
                    // `expression_schema` and `view_schema`.
                    //
                    // Guard on a bound `Table`: a `restore()` with no table of
                    // its own can land before a `load()` that sets it. The
                    // config is already committed above, so defer the draw: the
                    // eventual `load()` run binds the view from this commit.
                    let (disposition, _pin) = if session.get_table().is_some() {
                        bind_snapshot(&guard, &session, &renderer).await?
                    } else {
                        (crate::session::BindDisposition::Deferred, None)
                    };

                    // Apply incoming updates into the now-active plugin's
                    // bucket on `Renderer`. Per-plugin storage means no
                    // schema filter is needed before restore — foreign keys
                    // cannot appear in the bucket by construction.
                    let view_config_snapshot = session.get_view_config().clone();
                    let plugin_config_changed =
                        renderer.update_plugin_config(&view_config_snapshot, plugin_config);
                    let columns_config_changed = renderer.update_columns_configs(
                        &view_config_snapshot,
                        &session,
                        columns_config,
                    );
                    let changed = plugin_config_changed || columns_config_changed;

                    // Force a materialized restore when the plugin just
                    // swapped — `commit_plugin_idx` already restored from the
                    // raw bucket, but the materialized restore is needed for
                    // schema-revealed `include: true` defaults to reach the
                    // plugin before its first draw.
                    if changed || plugin_swapped {
                        let plugin_config_snapshot = renderer.get_plugin_config();
                        let plugin_update =
                            wasm_bindgen::JsValue::from_serde_ext(&plugin_config_snapshot).unwrap();
                        let columns_config = renderer
                            .all_columns_configs_materialized(&view_config_snapshot, &session)
                            .await;
                        plugin.restore(&plugin_update, Some(&columns_config))?;
                        if plugin_config_changed {
                            renderer.plugin_config_changed.emit(plugin_config_snapshot);
                        }
                    }

                    if presentation.is_visible() {
                        // `plugin.draw` iff the bind REBUILT (or this
                        // plugin owes its first paint); `update` iff a
                        // source changed — the `Adopted` config delta, the
                        // `changed` plugin-config restore above, or an
                        // explicit `Public` API request; else nothing.
                        dispatch_bound(&guard, &renderer, disposition, changed, origin).await?;
                    }

                    Ok(())
                })
                .await
        };

        run_result?;
        Ok(())
    })
}

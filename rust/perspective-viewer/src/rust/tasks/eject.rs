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

use futures::future::join_all;
use perspective_client::clone;
use perspective_js::utils::{ApiError, ApiResult};
use yew::Component;

use crate::ApiFuture;
use crate::root::Root;
use crate::session::{ResetOptions, TableIntermediateState};
use crate::workspace::Workspace;

/// Tear down the entire viewer: dispose EVERY panel's engines (emit
/// `table_unloaded`, destroy the renderer under its own draw lock, eject the
/// session), then drop the Yew root once. Fans out over all panels — not just
/// the seed — so panels added via `addPanel` or a whole-element `restore` don't
/// leak their `View`/`Table` + plugin when the element is deleted or ejected.
pub fn delete_all<T: Component>(workspace: &Workspace, root: &Root<T>) -> ApiFuture<()> {
    clone!(workspace, root);
    ApiFuture::new(async move {
        let panels = workspace
            .panel_ids()
            .into_iter()
            .filter_map(|id| workspace.panel(&id))
            .collect::<Vec<_>>();

        // Each panel owns its own `Renderer`/draw lock, so dispose them
        // concurrently. `renderer.delete()` must hold the draw lock (it runs
        // `plugin.delete()` synchronously), hence the per-panel `with_lock`.
        // BEST-EFFORT teardown: attempt EVERY panel and ALWAYS destroy the
        // Yew root, then report the first error. Aborting on the first
        // failed panel (the previous behavior) leaked the root and every
        // remaining panel's `View`/plugin.
        let results = join_all(panels.iter().map(|panel| {
            clone!(panel.session, panel.renderer);
            session.table_unloaded.emit(false);
            renderer.clone().with_lock(async move {
                renderer.delete()?;
                session
                    .reset(ResetOptions {
                        config: true,
                        expressions: true,
                        table: Some(TableIntermediateState::Ejected),
                        ..ResetOptions::default()
                    })
                    .await?;
                Ok(())
            })
        }))
        .await;

        // Drop the Yew root once, after every panel's teardown was
        // attempted — UNCONDITIONALLY, before error propagation, so a failed
        // panel can't leak it.
        let root_result = root
            .borrow_mut()
            .take()
            .ok_or_else(|| ApiError::from("Already deleted"))
            .map(|x| x.destroy());

        results.into_iter().collect::<ApiResult<Vec<_>>>()?;
        root_result?;
        Ok(())
    })
}

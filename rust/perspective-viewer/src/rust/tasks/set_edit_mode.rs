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

use perspective_client::clone;
use perspective_js::utils::*;

use crate::config::*;
use crate::renderer::Renderer;
use crate::session::{EditDelta, OpKind, Session, StepOutcome};

/// Set the active plugin's `edit_mode`, persisting it in the [`Renderer`]'s
/// plugin bucket and re-`restore`+rendering (the same merged-token path as
/// [`super::send_plugin_config`], so column styles/sizes survive).
///
/// Master/detail uses this to put a master into `SELECT_ROW_TREE` (the mode
/// in which the datagrid emits `perspective-global-filter` selections) and to
/// restore `READ_ONLY` on demotion. Plugins with no `edit_mode` schema field
/// (e.g. charts) schema-gate the key out in [`Renderer::update_plugin_config`],
/// making this a no-op for them.
pub fn set_edit_mode(session: &Session, renderer: &Renderer, mode: &str) {
    let mut map = serde_json::Map::new();
    map.insert(
        "edit_mode".to_owned(),
        serde_json::Value::String(mode.to_owned()),
    );

    let kind = OpKind::Edit {
        delta: EditDelta::PluginConfig(map.clone()),
        fields: None,
    };

    let ticket = session.submit(kind, {
        clone!(session, renderer);
        move |_ctx| {
            Box::pin(async move {
                let view_config = session.committed_view_config().clone();
                let changed = renderer
                    .update_plugin_config(&view_config, OptionalUpdate::Update(map))
                    .unwrap_or_default();

                Ok(StepOutcome::Render(Box::pin(async move {
                    if changed {
                        super::send_plugin_config::deliver_plugin_config(&session, &renderer)
                            .await?;
                    }

                    Ok(())
                })))
            })
        }
    });

    ApiFuture::spawn(ticket.settle());
}

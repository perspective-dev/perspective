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

use perspective_client::config::ViewConfig;
use perspective_js::utils::ApiFuture;
use yew::prelude::*;

// use crate::derived::suggest_name;
use crate::presentation::Presentation;
// use crate::queries::fetch_hosted_tables;
use crate::renderer::Renderer;
use crate::session::{Session, SessionMetadataRc};
use crate::tasks::release_derived;
// use crate::tasks::{can_derive, create_derived, release_derived};
use crate::utils::{AddListener, PtrEqRc, Subscription, left_click, read_intl_string};
use crate::workspace::Workspace;

#[derive(Clone, Properties)]
pub struct DerivedControlProps {
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
    pub workspace: Workspace,
    pub metadata: SessionMetadataRc,
    pub view_config: PtrEqRc<ViewConfig>,

    /// The `Table` this panel is bound to, threaded as a value prop so the
    /// chain re-renders when the binding changes.
    pub table: Option<String>,
}

impl PartialEq for DerivedControlProps {
    fn eq(&self, other: &Self) -> bool {
        self.table == other.table
            && self.metadata == other.metadata
            && self.view_config == other.view_config
    }
}

pub enum DerivedControlMsg {
    // Create,
    Release(bool),

    /// Some panel's table binding changed — re-render so the consumer
    /// count ([`Workspace::derived_consumers`]) gating refreshes.
    Refresh,
}

pub struct DerivedControl {
    /// Keeps the [`Workspace::bindings_changed`] listener attached for this
    /// component's lifetime.
    _bindings_sub: Subscription,
}

impl Component for DerivedControl {
    type Message = DerivedControlMsg;
    type Properties = DerivedControlProps;

    fn create(ctx: &Context<Self>) -> Self {
        let link = ctx.link().clone();
        let _bindings_sub = ctx
            .props()
            .workspace
            .bindings_changed()
            .add_listener(move |_| link.send_message(DerivedControlMsg::Refresh));

        Self { _bindings_sub }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            // DerivedControlMsg::Create => {
            //     let props = ctx.props().clone();
            //     ApiFuture::spawn(async move {
            //         let name = suggest_name(
            //             &fetch_hosted_tables(&props.workspace)
            //                 .await
            //                 .into_iter()
            //                 .flat_map(|(_, tables)| tables)
            //                 .collect(),
            //             &props.view_config,
            //             &props.table,
            //         );

            //         create_derived(
            //             &props.session,
            //             &props.renderer,
            //             &props.presentation,
            //             &props.workspace,
            //             name,
            //         )
            //         .await
            //     });

            //     false
            // },
            DerivedControlMsg::Release(delete) => {
                let props = ctx.props().clone();
                let effect = props.workspace.effects().guard();
                ApiFuture::spawn(async move {
                    let _effect = effect;
                    release_derived(
                        &props.session,
                        &props.renderer,
                        &props.presentation,
                        &props.workspace,
                        delete,
                    )
                    .await
                });

                false
            },
            DerivedControlMsg::Refresh => true,
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let props = ctx.props();
        let workspace = &props.workspace;
        let bound = props.table.clone().unwrap_or_default();
        let is_derived = workspace.is_derived(&bound);
        // let is_pivoted =
        //     !props.view_config.group_by.is_empty() ||
        // !props.view_config.split_by.is_empty();

        // let _can_create = is_pivoted && can_derive(&props.session);
        // if !is_derived && !can_create {
        //     return html! {};
        // }

        if !is_derived {
            return html! {};
        }

        let is_snapshot = !props.metadata.get_features().is_some_and(|x| x.on_update);
        let mut chain = workspace.derived_ancestors(&bound);
        chain.reverse();
        if is_derived {
            chain.push(bound.clone());
            chain.remove(0);
        }

        let sole_consumer = workspace.derived_consumers(&bound) == 1;
        let release = left_click(
            ctx.link()
                .callback(|event: MouseEvent| DerivedControlMsg::Release(event.shift_key())),
        );

        // let create = ctx.link().callback(|_| DerivedControlMsg::Create);
        // let last = chain.len().saturating_sub(1);
        let viewer = props.presentation.viewer_elem();
        let intl = |slug: &str, fallback: &str| {
            read_intl_string(viewer, slug).unwrap_or_else(|| fallback.to_owned())
        };

        // let _create_title = intl("derive-table-title", "Derive a new table
        // from this view");
        let snapshot_title = intl(
            "derived-snapshot-title",
            "This data source does not stream - this table's data is fixed at the point it was \
             derived.",
        );

        let release_title = if sole_consumer {
            intl(
                "derived-release-delete-title",
                "Back to the parent table - shift-click to delete this one",
            )
        } else {
            intl("derived-release-title", "Back to the parent table")
        };

        let last = chain.len().saturating_sub(1);
        let derived_tables = chain.iter().enumerate().map(|(idx, name)| {
            let is_own = is_derived && idx == last;
            // let consumers = workspace.derived_consumers(name);
            let mut close_class = classes!("derived_release");
            if sole_consumer {
                close_class.push("shift-alt-icon");
            }

            let mut level_class = classes!("derived_level");
            if is_own {
                level_class.push("is-own");
            }

            html! {
                <div class={level_class}>
                    <div class="derived_label_wrapper">
                        <span class="derived_icon" />
                        <span class="derived_label">{ name }</span>
                    </div>
                    // if consumers > 1 { <span class="derived_consumers">{ consumers }</span> }
                    if is_snapshot {
                        <span class="derived_snapshot" title={snapshot_title.clone()} />
                    }
                    if is_own {
                        <span
                            class={close_class}
                            title={release_title.clone()}
                            onmousedown={release.clone()}
                        />
                    } else {
                        <span class="derived_release disabled" />
                    }
                </div>
            }
        });

        html! {
            <div id="derived_stack">
                // if can_create {
                //     <div class="derived_create" title={create_title} onmousedown={create} />
                // }
                { for derived_tables }
            </div>
        }
    }
}

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

mod draft;
mod slot_column;

use std::collections::HashSet;
use std::rc::Rc;

use perspective_client::config::{WindowSortDir, WindowSpec};
use wasm_bindgen::JsCast;
use web_sys::{HtmlInputElement, MouseEvent};
use yew::prelude::*;

use self::draft::{WindowDraft, frame_label, frame_name, op_spec};
use self::slot_column::WindowSlotColumn;
use crate::components::column_dropdown::{ColumnDropDownElement, ColumnDropDownPortal};
use crate::components::column_selector::{InPlaceColumn, PivotColumn};
use crate::components::dragdrop_list::{DragDropList, DragListEvent};
use crate::presentation::Presentation;
use crate::session::{Session, SessionMetadataRc};
use crate::ui::{IntlLabel, Select, SelectItem};
use crate::utils::{AddListener, DragEffect, DragTarget, Subscription, left_click};

#[derive(Clone, Properties)]
pub struct WindowEditorProps {
    pub metadata: SessionMetadataRc,

    /// The saved spec under edit, or `None` for the "new column" drawer.
    pub initial: Option<WindowSpec>,

    /// Fires on every form mutation with the draft spec when it validates,
    /// else `None`. The spec's `name` is a placeholder - the editable header
    /// owns naming.
    pub on_change: Callback<Option<WindowSpec>>,

    /// Incremented by the parent to discard the draft.
    pub reset_count: u8,

    /// Drag/drop state - the editor's column slots are STAGED drop targets
    /// ([`DragTarget::is_staged`]): drops mutate the draft only, and the
    /// drag origin never self-removes.
    pub presentation: Presentation,

    /// Threaded for the slots' autocomplete dropdown
    /// ([`ColumnDropDownElement`]).
    pub session: Session,

    /// Selected theme name, threaded for the autocomplete dropdown's
    /// `PortalModal`.
    #[prop_or_default]
    pub selected_theme: Option<String>,
}

impl PartialEq for WindowEditorProps {
    fn eq(&self, other: &Self) -> bool {
        self.metadata == other.metadata
            && self.initial == other.initial
            && self.reset_count == other.reset_count
            && self.selected_theme == other.selected_theme
    }
}

#[derive(Clone, Debug)]
pub enum WindowEditorMsg {
    SetOp(String),
    ClearSource,
    ClearOrderBy,
    ToggleOrderDir,
    RemovePartition(usize),
    SetFrameType(String),
    /// Number-field messages carry the input's `value_as_number` (`NaN` for
    /// empty or unparseable text); the handlers clamp to each field's
    /// domain, resetting to the default `1` on invalid input.
    SetFrameRows(f64),
    SetFrameRange(f64),
    SetOffset(f64),
    SetAlpha(f64),
    /// A completed drop concerning this editor: a staged target to fill,
    /// and/or the staged origin slot (`DragEffect::Move` from a slot pill)
    /// to clear.
    Drop(String, DragTarget, Option<DragTarget>),
    New(DragTarget, InPlaceColumn),
    DragEnter(DragTarget, usize),
    DragLeave(DragTarget),
}

/// Routes each staged slot's [`DragDropList`] events into the editor's draft.
impl From<DragListEvent> for WindowEditorMsg {
    fn from(event: DragListEvent) -> Self {
        match event {
            DragListEvent::DragEnter(target, index) => Self::DragEnter(target, index),
            DragListEvent::DragLeave(target) => Self::DragLeave(target),
            DragListEvent::Close(DragTarget::WindowSource, _) => Self::ClearSource,
            DragListEvent::Close(DragTarget::WindowOrderBy, _) => Self::ClearOrderBy,
            DragListEvent::Close(_, index) => Self::RemovePartition(index),
            DragListEvent::Create(target, column) => Self::New(target, column),
        }
    }
}

pub struct WindowEditor {
    draft: WindowDraft,
    error: Option<String>,
    column_dropdown: ColumnDropDownElement,
    _drop_sub: Subscription,
}

impl WindowEditor {
    fn initialize(ctx: &Context<Self>) -> WindowDraft {
        ctx.props()
            .initial
            .as_ref()
            .map(WindowDraft::from_spec)
            .unwrap_or_else(WindowDraft::new_default)
    }

    fn emit(&mut self, ctx: &Context<Self>) {
        match self.draft.validate(&ctx.props().metadata) {
            Ok(spec) => {
                self.error = None;
                ctx.props().on_change.emit(Some(spec));
            },
            Err(msg) => {
                self.error = Some(msg);
                ctx.props().on_change.emit(None);
            },
        }
    }
}

impl Component for WindowEditor {
    type Message = WindowEditorMsg;
    type Properties = WindowEditorProps;

    fn create(ctx: &Context<Self>) -> Self {
        let _drop_sub = {
            let link = ctx.link().clone();
            ctx.props().presentation.drop_received.add_listener(
                move |(column, target, effect, _index): (String, DragTarget, DragEffect, usize)| {
                    let staged_origin = match effect {
                        DragEffect::Move(origin) if origin.is_staged() => Some(origin),
                        _ => None,
                    };

                    if target.is_staged() || staged_origin.is_some() {
                        link.send_message(WindowEditorMsg::Drop(column, target, staged_origin));
                    }
                },
            )
        };

        let mut this = Self {
            draft: Self::initialize(ctx),
            error: None,
            column_dropdown: ColumnDropDownElement::new(ctx.props().session.clone()),
            _drop_sub,
        };

        this.emit(ctx);
        this
    }

    fn changed(&mut self, ctx: &Context<Self>, old_props: &Self::Properties) -> bool {
        if ctx.props().reset_count != old_props.reset_count
            || ctx.props().initial != old_props.initial
        {
            self.draft = Self::initialize(ctx);
            self.emit(ctx);
            true
        } else {
            false
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            WindowEditorMsg::DragEnter(target, index) => {
                return ctx.props().presentation.notify_drag_enter(target, index);
            },
            WindowEditorMsg::DragLeave(target) => {
                ctx.props().presentation.notify_drag_leave(target);
                return true;
            },
            WindowEditorMsg::New(target, InPlaceColumn::Column(column)) => {
                ctx.link()
                    .send_message(WindowEditorMsg::Drop(column, target, None));
                return false;
            },
            WindowEditorMsg::New(_, InPlaceColumn::Expression(_)) => {
                // In-place expression creation is a config-selector affordance;
                // staged window slots take existing columns only.
                return false;
            },
            WindowEditorMsg::Drop(column, target, origin) => {
                // The origin slot clears FIRST so a self-move (origin ==
                // target) re-inserts the same column and nets to no change.
                match origin {
                    Some(DragTarget::WindowSource) => self.draft.source = String::default(),
                    Some(DragTarget::WindowOrderBy) => self.draft.order_by = String::default(),
                    Some(DragTarget::WindowPartitionBy) => {
                        self.draft.partition_by.retain(|x| x != &column)
                    },
                    _ => {},
                }

                // Slots take true `Table` columns ONLY - a staged drop of
                // an expression or window column is rejected outright (the
                // list already showed the invalid-X overlay during hover).
                let is_table_column = ctx
                    .props()
                    .metadata
                    .get_table_columns()
                    .into_iter()
                    .flatten()
                    .any(|x| *x == column);

                match target {
                    _ if target.is_staged() && !is_table_column => {},
                    DragTarget::WindowSource => {
                        self.draft.source = column;

                        // The op selector only offers the feature-declared
                        // set for the source's type, so an op orphaned by
                        // the new source coerces to that set's first entry.
                        let available = ctx
                            .props()
                            .metadata
                            .get_column_table_type(&self.draft.source)
                            .and_then(|ty| {
                                ctx.props()
                                    .metadata
                                    .get_features()
                                    .map(|x| x.get_window_aggregates(ty))
                            })
                            .unwrap_or_default();

                        if !available.iter().any(|x| x.name == self.draft.op)
                            && let Some(first) = available.first()
                        {
                            self.draft.op = first.name.clone();
                        }
                    },
                    DragTarget::WindowOrderBy => self.draft.order_by = column,
                    DragTarget::WindowPartitionBy
                        if !column.is_empty() && !self.draft.partition_by.contains(&column) =>
                    {
                        self.draft.partition_by.push(column);
                    },
                    // A committing target: the config zone handles its own
                    // insert; only the staged origin cleanup applies here.
                    _ => {},
                }
            },
            WindowEditorMsg::SetOp(op) => {
                self.draft.op = op;

                // Keep the frame coherent as the op changes - an op that
                // does not accept the current frame kind coerces to its
                // first declared one (the dropdown omits the rest).
                if let Some(declared) =
                    op_spec(&ctx.props().metadata, &self.draft.source, &self.draft.op)
                    && !declared.frames.is_empty()
                    && !declared
                        .frames
                        .iter()
                        .any(|x| x == frame_name(&self.draft.frame_type))
                    && let Some(first) = declared.frames.first()
                {
                    self.draft.frame_type = frame_label(first).to_string();
                }
            },
            WindowEditorMsg::ClearSource => self.draft.source = String::default(),
            WindowEditorMsg::ClearOrderBy => self.draft.order_by = String::default(),
            WindowEditorMsg::ToggleOrderDir => self.draft.order_desc = !self.draft.order_desc,
            WindowEditorMsg::RemovePartition(idx) => {
                if idx < self.draft.partition_by.len() {
                    self.draft.partition_by.remove(idx);
                }
            },
            WindowEditorMsg::SetFrameType(x) => self.draft.frame_type = x,
            WindowEditorMsg::SetFrameRows(x) => {
                self.draft.frame_rows = if x.is_finite() && x >= 0.0 {
                    x as u32
                } else {
                    1
                };
            },
            WindowEditorMsg::SetFrameRange(x) => {
                self.draft.frame_range = if x.is_finite() && x > 0.0 { x } else { 1.0 };
            },
            WindowEditorMsg::SetOffset(x) => {
                self.draft.offset = if x.is_finite() && x >= 0.0 {
                    x as u32
                } else {
                    1
                };
            },
            WindowEditorMsg::SetAlpha(x) => {
                self.draft.alpha = if x.is_finite() && x > 0.0 && x <= 1.0 {
                    x
                } else {
                    1.0
                };
            },
        }

        self.emit(ctx);
        true
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let declared = op_spec(&ctx.props().metadata, &self.draft.source, &self.draft.op);

        // The op selector renders the FEATURE-DECLARED window aggregates
        // for the source column's type, in the server's declared order -
        // capability and type-validity both come from the data model
        // (`GetFeaturesResp::window_aggregates`), not a hardcoded list.
        let ops: Rc<Vec<SelectItem<String>>> = Rc::new(
            ctx.props()
                .metadata
                .get_column_table_type(&self.draft.source)
                .and_then(|ty| {
                    ctx.props()
                        .metadata
                        .get_features()
                        .map(|x| x.get_window_aggregates(ty))
                })
                .unwrap_or_default()
                .into_iter()
                .map(|x| SelectItem::Option(x.name.clone()))
                .collect(),
        );

        // Number inputs report `value_as_number` (`NaN` for empty/garbage),
        // the Style tab `NumberField` idiom - the handlers reset invalid
        // values to the default.
        let on_number_input = |f: fn(f64) -> WindowEditorMsg| {
            ctx.link().callback(move |event: InputEvent| {
                let value = event
                    .target()
                    .and_then(|t| t.dyn_into::<HtmlInputElement>().ok())
                    .map(|x| x.value_as_number())
                    .unwrap_or(f64::NAN);
                f(value)
            })
        };

        // Frame type as a dropdown; like the op selector, invalid choices
        // are omitted rather than disabled - the declared `frames` are the
        // menu, and `SetOp` already coerces the draft into them.
        let frame_types: Rc<Vec<SelectItem<String>>> = Rc::new(
            declared
                .as_ref()
                .map(|x| x.frames.clone())
                .unwrap_or_default()
                .iter()
                .map(|x| SelectItem::Option(frame_label(x).to_string()))
                .collect(),
        );

        // Slots take true `Table` columns ONLY - expression aliases and
        // other window columns would create dependency cycles (and force
        // delete-blocking). They join every slot's `exclude` set (removing
        // them from the autocomplete dropdowns), the drop handler rejects
        // them, and an invalid hover shows the X overlay below.
        let non_table: HashSet<String> = ctx
            .props()
            .metadata
            .get_expression_columns()
            .chain(ctx.props().metadata.get_window_columns())
            .cloned()
            .collect();

        let is_invalid_drag = |target: DragTarget| {
            ctx.props()
                .presentation
                .is_dragover(target)
                .map(|(_, col)| non_table.contains(&col))
                .unwrap_or_default()
        };

        // The op selector renders in the source pill's aggregate-selector
        // space - the ONLY place a window op control exists in the UI.
        let source_exclude: HashSet<String> = std::iter::once(self.draft.source.clone())
            .chain(non_table.iter().cloned())
            .collect();

        let source_list = html! {
            <DragDropList<WindowEditor, WindowSlotColumn>
                name="window-source"
                target={DragTarget::WindowSource}
                parent={ctx.link().clone()}
                presentation={ctx.props().presentation.clone()}
                column_dropdown={self.column_dropdown.clone()}
                exclude={source_exclude}
                is_dragover={ctx.props().presentation.is_dragover(DragTarget::WindowSource)}
                is_invalid={is_invalid_drag(DragTarget::WindowSource)}
                single_slot=true
            >
                { for (!self.draft.source.is_empty()).then(|| yew::html_nested! {
                        <WindowSlotColumn
                            column={self.draft.source.clone()}
                            column_type={ctx.props().metadata.get_column_table_type(&self.draft.source)}
                            action={DragTarget::WindowSource}
                            presentation={ctx.props().presentation.clone()}
                            aggregate={html! {
                                <div class="aggregate-selector-wrapper">
                                    <Select<String>
                                        wrapper_class="aggregate-selector"
                                        values={ops.clone()}
                                        selected={self.draft.op.clone()}
                                        on_select={ctx.link().callback(WindowEditorMsg::SetOp)}
                                    />
                                </div>
                            }}
                        />
                    }) }
            </DragDropList<WindowEditor, WindowSlotColumn>>
        };

        let order_exclude: HashSet<String> = std::iter::once(self.draft.order_by.clone())
            .chain(non_table.iter().cloned())
            .collect();
        let order_list = html! {
            <DragDropList<WindowEditor, WindowSlotColumn>
                name="window-order-by"
                target={DragTarget::WindowOrderBy}
                parent={ctx.link().clone()}
                presentation={ctx.props().presentation.clone()}
                column_dropdown={self.column_dropdown.clone()}
                exclude={order_exclude}
                is_dragover={ctx.props().presentation.is_dragover(DragTarget::WindowOrderBy)}
                is_invalid={is_invalid_drag(DragTarget::WindowOrderBy)}
                single_slot=true
            >
                { for (!self.draft.order_by.is_empty()).then(|| {
                        // The sort pill's direction affordance, staged: the
                        // toggle mutates the draft only, committed by Save.
                        let dir = if self.draft.order_desc {
                            WindowSortDir::Desc
                        } else {
                            WindowSortDir::Asc
                        };

                        let onmousedown = left_click(
                            ctx.link()
                                .callback(|_: MouseEvent| WindowEditorMsg::ToggleOrderDir),
                        );

                        yew::html_nested! {
                            <WindowSlotColumn
                                column={self.draft.order_by.clone()}
                                column_type={ctx.props().metadata.get_column_table_type(&self.draft.order_by)}
                                action={DragTarget::WindowOrderBy}
                                presentation={ctx.props().presentation.clone()}
                                trailing={html! {
                                    <span
                                        class={format!("sort-icon {}", dir)}
                                        {onmousedown}
                                    />
                                }}
                            />
                        }
                    }) }
            </DragDropList<WindowEditor, WindowSlotColumn>>
        };

        let partition_exclude: HashSet<String> = self
            .draft
            .partition_by
            .iter()
            .cloned()
            .chain(non_table.iter().cloned())
            .collect();
        let partition_list = html! {
            <DragDropList<WindowEditor, PivotColumn>
                name="window-partition-by"
                target={DragTarget::WindowPartitionBy}
                parent={ctx.link().clone()}
                presentation={ctx.props().presentation.clone()}
                column_dropdown={self.column_dropdown.clone()}
                exclude={partition_exclude}
                is_dragover={ctx.props().presentation.is_dragover(DragTarget::WindowPartitionBy)}
                is_invalid={is_invalid_drag(DragTarget::WindowPartitionBy)}
            >
                { for self.draft.partition_by.iter().map(|col| yew::html_nested! {
                        <PivotColumn
                            column={col.clone()}
                            column_type={ctx.props().metadata.get_column_table_type(col)}
                            action={DragTarget::WindowPartitionBy}
                            presentation={ctx.props().presentation.clone()}
                        />
                    }) }
            </DragDropList<WindowEditor, PivotColumn>>
        };

        let show_frame = declared
            .as_ref()
            .map(|x| !x.frames.is_empty())
            .unwrap_or_default();
        let show_offset = declared.as_ref().map(|x| x.offset).unwrap_or_default();
        let show_alpha = declared.as_ref().map(|x| x.alpha).unwrap_or_default();

        html! {
            <>
                <div id="window-editor-slots">{ source_list }{ order_list }{ partition_list }</div>
                <div id="window-editor-container">
                    if show_frame {
                        <div class="column-style-label"><IntlLabel name="window-frame" /></div>
                        <div class="row">
                            <Select<String>
                                id="window-frame-type"
                                values={frame_types}
                                selected={self.draft.frame_type.clone()}
                                on_select={ctx.link().callback(WindowEditorMsg::SetFrameType)}
                            />
                        </div>
                        if self.draft.frame_type == "Rows" {
                            <div class="row">
                                <input
                                    type="number"
                                    class="parameter"
                                    min="0"
                                    value={self.draft.frame_rows.to_string()}
                                    oninput={on_number_input(WindowEditorMsg::SetFrameRows)}
                                />
                            </div>
                        }
                        if self.draft.frame_type == "Range" {
                            <div class="row">
                                <input
                                    type="number"
                                    class="parameter"
                                    min="0"
                                    value={self.draft.frame_range.to_string()}
                                    oninput={on_number_input(WindowEditorMsg::SetFrameRange)}
                                />
                            </div>
                        }
                    }
                    if show_offset {
                        <div class="column-style-label">
                            <IntlLabel name="window-offset" class="indent" />
                        </div>
                        <div class="row">
                            <input
                                type="number"
                                class="parameter"
                                min="0"
                                value={self.draft.offset.to_string()}
                                oninput={on_number_input(WindowEditorMsg::SetOffset)}
                            />
                        </div>
                    }
                    if show_alpha {
                        <div class="column-style-label">
                            <IntlLabel name="window-alpha" class="indent" />
                        </div>
                        <div class="row">
                            <input
                                type="number"
                                class="parameter"
                                step="0.05"
                                min="0"
                                max="1"
                                value={self.draft.alpha.to_string()}
                                oninput={on_number_input(WindowEditorMsg::SetAlpha)}
                            />
                        </div>
                    }
                    if let Some(error) = &self.error {
                        <div class="row window-editor-error">{ error.clone() }</div>
                    }
                </div>
                <ColumnDropDownPortal
                    element={self.column_dropdown.clone()}
                    theme={ctx.props().selected_theme.clone().unwrap_or_default()}
                />
            </>
        }
    }
}

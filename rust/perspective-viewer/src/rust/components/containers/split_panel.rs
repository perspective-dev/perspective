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

use std::cmp::max;

use perspective::utils::global;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::HtmlElement;
use yew::html::Scope;
use yew::prelude::*;

use crate::components::style::LocalStyle;
#[cfg(test)]
use crate::utils::*;
use crate::*;

/// The state for the `Resizing` action, including the `MouseEvent` callbacks
/// and panel starting dimensions.
struct ResizingState {
    mousemove: Closure<dyn Fn(MouseEvent)>,
    mouseup: Closure<dyn Fn(MouseEvent)>,
    cursor: String,
    index: usize,
    start: i32,
    total: i32,
    alt: i32,
    orientation: Orientation,
    reverse: bool,
    body_style: web_sys::CssStyleDeclaration,
    pointer_id: i32,
    pointer_elem: HtmlElement,
}

impl Drop for ResizingState {
    /// On `drop`, we must remove these event listeners from the document
    /// `body`. Without this, the `Closure` objects would not leak, but the
    /// document will continue to call them, causing runtime exceptions.
    fn drop(&mut self) {
        let result: ApiResult<()> = maybe! {
            let mousemove = self.mousemove.as_ref().unchecked_ref();
            global::body().remove_event_listener_with_callback("mousemove", mousemove)?;
            let mouseup = self.mouseup.as_ref().unchecked_ref();
            global::body().remove_event_listener_with_callback("mouseup", mouseup)?;
            self.release_cursor()?;
            Ok(())
        };

        result.expect("Drop failed")
    }
}

/// When the instantiated, capture the initial dimensions and create the
/// MouseEvent callbacks.
impl ResizingState {
    pub fn new(
        index: usize,
        client_offset: i32,
        ctx: &Context<SplitPanel>,
        first_elem: &HtmlElement,
        pointer_id: i32,
        pointer_elem: HtmlElement,
    ) -> ApiResult<Self> {
        let orientation = ctx.props().orientation;
        let reverse = ctx.props().reverse;
        let split_panel = ctx.link();
        let total = match orientation {
            Orientation::Horizontal => first_elem.offset_width(),
            Orientation::Vertical => first_elem.offset_height(),
        };

        let alt = match orientation {
            Orientation::Horizontal => first_elem.offset_height(),
            Orientation::Vertical => first_elem.offset_width(),
        };

        let mouseup = Closure::new({
            let cb = split_panel.callback(|_| SplitPanelMsg::StopResizing);
            move |x| cb.emit(x)
        });

        let mousemove = Closure::new({
            let cb = split_panel.callback(move |event: MouseEvent| {
                SplitPanelMsg::MoveResizing(match orientation {
                    Orientation::Horizontal => event.client_x(),
                    Orientation::Vertical => event.client_y(),
                })
            });
            move |x| cb.emit(x)
        });

        let mut state = Self {
            index,
            cursor: "".to_owned(),
            start: client_offset,
            orientation,
            reverse,
            total,
            alt,
            body_style: global::body().style(),
            mouseup,
            mousemove,
            pointer_id,
            pointer_elem,
        };

        state.capture_cursor()?;
        state.register_listeners()?;
        Ok(state)
    }

    fn get_offset(&self, client_offset: i32) -> i32 {
        let delta = if self.reverse {
            self.start - client_offset
        } else {
            client_offset - self.start
        };

        max(0, self.total + delta)
    }

    pub fn get_style(&self, client_offset: i32) -> Option<String> {
        let offset = self.get_offset(client_offset);
        Some(match self.orientation {
            Orientation::Horizontal => format!(
                "max-width:{}px;min-width:{}px;width:{}px",
                offset, offset, offset
            ),
            Orientation::Vertical => format!(
                "max-height:{}px;min-height:{}px;height:{}px",
                offset, offset, offset
            ),
        })
    }

    pub fn get_dimensions(&self, client_offset: i32) -> (i32, i32) {
        let offset = self.get_offset(client_offset);
        match self.orientation {
            Orientation::Horizontal => (std::cmp::max(0, offset), self.alt),
            Orientation::Vertical => (self.alt, std::cmp::max(0, offset)),
        }
    }

    /// Adds the event listeners, the corollary of `Drop`.
    fn register_listeners(&self) -> ApiResult<()> {
        let mousemove = self.mousemove.as_ref().unchecked_ref();
        global::body().add_event_listener_with_callback("mousemove", mousemove)?;
        let mouseup = self.mouseup.as_ref().unchecked_ref();
        Ok(global::body().add_event_listener_with_callback("mouseup", mouseup)?)
    }

    /// Helper functions capture and release the global cursor while dragging is
    /// occurring.
    fn capture_cursor(&mut self) -> ApiResult<()> {
        self.pointer_elem.set_pointer_capture(self.pointer_id)?;
        self.cursor = self.body_style.get_property_value("cursor")?;
        self.body_style
            .set_property("cursor", match self.orientation {
                Orientation::Horizontal => "col-resize",
                Orientation::Vertical => "row-resize",
            })?;

        Ok(())
    }

    /// " but for release
    fn release_cursor(&self) -> ApiResult<()> {
        self.pointer_elem.release_pointer_capture(self.pointer_id)?;
        Ok(self.body_style.set_property("cursor", &self.cursor)?)
    }
}

#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub enum Orientation {
    #[default]
    Horizontal,
    Vertical,
}

#[derive(Properties, Default)]
pub struct SplitPanelProps {
    pub children: Children,

    #[prop_or_default]
    pub id: Option<String>,

    #[prop_or_default]
    pub orientation: Orientation,

    /// Whether to render `<></>` empty templates as empty child panels, or
    /// omit them entirely.
    #[prop_or_default]
    pub skip_empty: bool,

    /// Should the child panels by wrapped in `<div>` elements?
    #[prop_or_default]
    pub no_wrap: bool,

    /// Should the panels be rendered/sized in _reverse_ order?
    #[prop_or_default]
    pub reverse: bool,

    #[prop_or_default]
    pub on_reset: Option<Callback<()>>,

    #[prop_or_default]
    pub on_resize: Option<Callback<(i32, i32)>>,

    #[prop_or_default]
    pub on_resize_finished: Option<Callback<()>>,

    #[cfg(test)]
    #[prop_or_default]
    pub weak_link: WeakScope<SplitPanel>,

    #[prop_or_default]
    pub initial_size: Option<i32>,
}

impl SplitPanelProps {
    fn validate(&self) -> bool {
        !self.children.is_empty()
    }
}

impl PartialEq for SplitPanelProps {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
            && self.children == other.children
            && self.orientation == other.orientation
            && self.reverse == other.reverse
    }
}

pub enum SplitPanelMsg {
    StartResizing(usize, i32, i32, HtmlElement),
    MoveResizing(i32),
    StopResizing,
    Reset(usize),
}

/// A panel with 2 sub panels and a mouse-draggable divider which allows
/// apportioning the panel's width.
///
/// # Examples
///
/// ```
/// html! {
///     <SplitPanel id="app_panel">
///         <div id="A">
///         <div id="B">
///             <a href=".."></a>
///         </div>
///     </SplitPanel>
/// }
/// ```
pub struct SplitPanel {
    resize_state: Option<ResizingState>,
    refs: Vec<NodeRef>,
    styles: Vec<Option<String>>,
    on_reset: Option<Callback<()>>,
}

impl Component for SplitPanel {
    type Message = SplitPanelMsg;
    type Properties = SplitPanelProps;

    fn create(ctx: &Context<Self>) -> Self {
        assert!(ctx.props().validate());
        enable_weak_link_test!(ctx.props(), ctx.link());
        let len = ctx.props().children.len();
        // cant just use vec![Default::default(); len] as it would
        // use the same underlying NodeRef for each element.
        let refs = Vec::from_iter(std::iter::repeat_with(Default::default).take(len));

        let mut styles = vec![Default::default(); len];
        if let Some(x) = &ctx.props().initial_size {
            styles[0] = Some(match ctx.props().orientation {
                Orientation::Horizontal => {
                    format!("max-width:{}px;min-width:{}px;width:{}px", x, x, x)
                },
                Orientation::Vertical => {
                    format!("max-height:{}px;min-height:{}px;height:{}px", x, x, x)
                },
            });
        }

        Self {
            resize_state: None,
            refs,
            styles,
            on_reset: None,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            SplitPanelMsg::Reset(index) => {
                self.styles[index] = None;
                self.on_reset = ctx.props().on_reset.clone();
            },
            SplitPanelMsg::StartResizing(index, client_offset, pointer_id, pointer_elem) => {
                let elem = self.refs[index].cast::<HtmlElement>().unwrap();
                let state =
                    ResizingState::new(index, client_offset, ctx, &elem, pointer_id, pointer_elem);

                self.resize_state = state.ok();
            },
            SplitPanelMsg::StopResizing => {
                self.resize_state = None;
                if let Some(cb) = &ctx.props().on_resize_finished {
                    cb.emit(());
                }
            },
            SplitPanelMsg::MoveResizing(client_offset) => {
                if let Some(state) = self.resize_state.as_ref() {
                    if let Some(ref cb) = ctx.props().on_resize {
                        cb.emit(state.get_dimensions(client_offset));
                    }

                    self.styles[state.index] = state.get_style(client_offset);
                }
            },
        };
        true
    }

    fn rendered(&mut self, _ctx: &Context<Self>, _first_render: bool) {
        if let Some(on_reset) = self.on_reset.take() {
            on_reset.emit(());
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        assert!(ctx.props().validate());
        let new_len = ctx.props().children.len();
        self.refs.resize_with(new_len, Default::default);
        self.styles.resize(new_len, Default::default());
        true
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let mut iter = ctx.props().children.iter();
        let orientation = ctx.props().orientation;
        let mut classes = classes!("split-panel");
        if orientation == Orientation::Vertical {
            classes.push("orient-vertical");
        }

        if ctx.props().reverse {
            classes.push("orient-reverse");
        }

        let head = iter.next().unwrap();

        let tail = iter
            .filter(|x| !ctx.props().skip_empty || x != &html! { <></> })
            .enumerate()
            .map(|(i, x)| {
                html! {
                    <key={i + 2}>
                        <SplitPanelDivider
                            {i}
                            orientation={ctx.props().orientation}
                            link={ctx.link().clone()}
                        />
                        if i == ctx.props().children.len() - 2 { { x } } else {
                            <SplitPanelChild
                                style={self.styles[i + 1].clone()}
                                ref_={self.refs[i + 1].clone()}
                            >
                                { x }
                            </SplitPanelChild>
                        }
                    </>
                }
            });

        let contents = html! {
            <>
                <LocalStyle key=0 href={css!("containers/split-panel")} />
                <SplitPanelChild key=1 style={self.styles[0].clone()} ref_={self.refs[0].clone()}>
                    { head }
                </SplitPanelChild>
                { for tail }
            </>
        };

        // TODO consider removing this
        if ctx.props().no_wrap {
            html! { { contents } }
        } else {
            html! { <div id={ctx.props().id.clone()} class={classes}>{ contents }</div> }
        }
    }
}

#[derive(Properties)]
struct SplitPanelDividerProps {
    i: usize,
    orientation: Orientation,
    link: Scope<SplitPanel>,
}

impl PartialEq for SplitPanelDividerProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.i == rhs.i && self.orientation == rhs.orientation
    }
}

/// The resize handle for a `SplitPanel`.
#[function_component(SplitPanelDivider)]
fn split_panel_divider(props: &SplitPanelDividerProps) -> Html {
    let orientation = props.orientation;
    let i = props.i;
    let link = props.link.clone();
    let onmousedown = link.callback(move |event: PointerEvent| {
        let target = event.target().unwrap().unchecked_into::<HtmlElement>();
        let pointer_id = event.pointer_id();
        let size = match orientation {
            Orientation::Horizontal => event.client_x(),
            Orientation::Vertical => event.client_y(),
        };

        SplitPanelMsg::StartResizing(i, size, pointer_id, target)
    });

    let ondblclick = props.link.callback(move |event: MouseEvent| {
        event.prevent_default();
        event.stop_propagation();
        SplitPanelMsg::Reset(i)
    });

    // TODO Not sure why, but under some circumstances this can trigger a
    // `dragstart`, leading to further drag events which cause perspective
    // havoc.  `event.prevent_default()` in `onmousedown` alternatively fixes
    // this, but also prevents this event from trigger focus-stealing e.g. from
    // open dialogs.
    let ondragstart = Callback::from(|event: DragEvent| event.prevent_default());

    html! {
        <>
            <div
                class="split-panel-divider"
                {ondragstart}
                onpointerdown={onmousedown}
                {ondblclick}
            />
        </>
    }
}

#[derive(Properties, PartialEq)]
struct SplitPanelChildProps {
    style: Option<String>,
    ref_: NodeRef,
    children: Children,
}

#[function_component(SplitPanelChild)]
fn split_panel_child(props: &SplitPanelChildProps) -> Html {
    let class = if props.style.is_some() {
        classes!("split-panel-child", "is-width-override")
    } else {
        classes!("split-panel-child")
    };
    html! {
        <div {class} ref={props.ref_.clone()} style={props.style.clone()}>
            { props.children.iter().next().unwrap() }
        </div>
    }
}

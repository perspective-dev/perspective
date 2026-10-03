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

use perspective_js::utils::{ApiResult, global};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::HtmlElement;
use yew::html::Scope;
use yew::prelude::*;

#[derive(Properties, Default)]
pub struct SplitPanelProps {
    pub children: Children,

    #[prop_or_default]
    pub id: Option<String>,

    #[prop_or_default]
    pub class: Classes,

    #[prop_or_default]
    pub orientation: Orientation,

    #[prop_or_default]
    pub skip_empty: bool,

    #[prop_or_default]
    pub no_wrap: bool,

    #[prop_or_default]
    pub reverse: bool,

    #[prop_or_default]
    pub on_reset: Option<Callback<()>>,

    #[prop_or_default]
    pub on_resize: Option<Callback<(i32, i32)>>,

    #[prop_or_default]
    pub on_resize_finished: Option<Callback<()>>,

    #[prop_or_default]
    pub initial_size: Option<i32>,

    #[prop_or_default]
    pub deferred: bool,

    #[prop_or_default]
    pub size: Option<i32>,
}

fn is_empty_html(node: &Html) -> bool {
    match node {
        Html::VList(list) => list.iter().all(is_empty_html),
        _ => false,
    }
}

fn size_style(orientation: Orientation, x: i32) -> String {
    match orientation {
        Orientation::Horizontal => {
            format!("max-width:{x}px;min-width:{x}px;width:{x}px")
        },
        Orientation::Vertical => {
            format!("max-height:{x}px;min-height:{x}px;height:{x}px")
        },
    }
}

impl SplitPanelProps {
    fn validate(&self) -> bool {
        !self.children.is_empty()
    }
}

impl PartialEq for SplitPanelProps {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
            && self.class == other.class
            && self.children == other.children
            && self.orientation == other.orientation
            && self.reverse == other.reverse
            && self.size == other.size
            && self.deferred == other.deferred
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
        let len = ctx.props().children.len();
        let refs = Vec::from_iter(std::iter::repeat_with(Default::default).take(len));

        let mut styles = vec![Default::default(); len];
        if let Some(x) = ctx.props().size.or(ctx.props().initial_size) {
            styles[0] = Some(size_style(ctx.props().orientation, x));
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
                if ctx.props().deferred {
                    if let Some(cb) = &ctx.props().on_reset {
                        cb.emit(());
                    }

                    return false;
                }

                self.styles[index] = None;
                self.on_reset.clone_from(&ctx.props().on_reset);
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

                    if !ctx.props().deferred {
                        self.styles[state.index] = state.get_style(client_offset);
                    }
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

        if let Some(state) = self.resize_state.as_ref() {
            let skip_empty = ctx.props().skip_empty;
            let still_visible = ctx
                .props()
                .children
                .iter()
                .enumerate()
                .any(|(i, x)| i == state.index && (!skip_empty || !is_empty_html(&x)));

            if !still_visible {
                self.resize_state = None;
            }
        }

        if ctx.props().deferred {
            self.styles[0] = ctx
                .props()
                .size
                .map(|x| size_style(ctx.props().orientation, x));
        }

        true
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let skip_empty = ctx.props().skip_empty;
        let orientation = ctx.props().orientation;

        let panes = ctx
            .props()
            .children
            .iter()
            .enumerate()
            .filter(|(_, x)| !skip_empty || !is_empty_html(x))
            .collect::<Vec<_>>();

        let last = panes.len().saturating_sub(1);
        let mut nodes: Vec<Html> = Vec::with_capacity(panes.len() * 2);
        let mut prev: Option<usize> = None;
        for (pos, (i, x)) in panes.into_iter().enumerate() {
            if let Some(p) = prev {
                nodes.push(html! {
                    <SplitPanelDivider
                        key={format!("divider-{i}")}
                        i={p}
                        {orientation}
                        link={ctx.link().clone()}
                    />
                });
            }

            nodes.push(if pos == last {
                html! { <key={i}>{ x }</> }
            } else {
                html! {
                    <SplitPanelChild
                        key={i}
                        style={self.styles[i].clone()}
                        ref_={self.refs[i].clone()}
                    >
                        { x }
                    </SplitPanelChild>
                }
            });

            prev = Some(i);
        }

        let mut classes = classes!("split-panel");
        classes.extend(ctx.props().class.clone());
        if orientation == Orientation::Vertical {
            classes.push("orient-vertical");
        }

        if ctx.props().reverse {
            classes.push("orient-reverse");
        }

        let contents = html! { <>{ for nodes.into_iter() }</> };
        if ctx.props().no_wrap {
            html! { { contents } }
        } else {
            html! { <div id={ctx.props().id.clone()} class={classes}>{ contents }</div> }
        }
    }
}

#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub enum Orientation {
    #[default]
    Horizontal,
    Vertical,
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
    fn drop(&mut self) {
        let result: ApiResult<()> = (|| {
            let mousemove = self.mousemove.as_ref().unchecked_ref();
            global::body().remove_event_listener_with_callback("mousemove", mousemove)?;
            let mouseup = self.mouseup.as_ref().unchecked_ref();
            global::body().remove_event_listener_with_callback("mouseup", mouseup)?;
            self.release_cursor()?;
            Ok(())
        })();

        result.expect("Drop failed")
    }
}

const MINIMUM_SIZE: i32 = 8;

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

        max(MINIMUM_SIZE, self.total + delta)
    }

    pub fn get_style(&self, client_offset: i32) -> Option<String> {
        let offset = self.get_offset(client_offset);
        Some(match self.orientation {
            Orientation::Horizontal => {
                format!("max-width:{offset}px;min-width:{offset}px;width:{offset}px")
            },
            Orientation::Vertical => {
                format!("max-height:{offset}px;min-height:{offset}px;height:{offset}px")
            },
        })
    }

    pub fn get_dimensions(&self, client_offset: i32) -> (i32, i32) {
        let offset = self.get_offset(client_offset);
        match self.orientation {
            Orientation::Horizontal => (std::cmp::max(MINIMUM_SIZE, offset), self.alt),
            Orientation::Vertical => (self.alt, std::cmp::max(MINIMUM_SIZE, offset)),
        }
    }

    fn register_listeners(&self) -> ApiResult<()> {
        let mousemove = self.mousemove.as_ref().unchecked_ref();
        global::body().add_event_listener_with_callback("mousemove", mousemove)?;
        let mouseup = self.mouseup.as_ref().unchecked_ref();
        Ok(global::body().add_event_listener_with_callback("mouseup", mouseup)?)
    }

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

    fn release_cursor(&self) -> ApiResult<()> {
        self.pointer_elem.release_pointer_capture(self.pointer_id)?;
        Ok(self.body_style.set_property("cursor", &self.cursor)?)
    }
}

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

use std::borrow::{Borrow, Cow};
use std::fmt::Display;
use std::rc::Rc;

use wasm_bindgen::JsCast;
use yew::prelude::*;

#[derive(Properties)]
pub struct SelectProps<T>
where
    T: Clone + Display + PartialEq + 'static,
{
    pub values: Rc<Vec<SelectItem<T>>>,
    pub selected: T,
    pub on_select: Callback<T>,

    #[prop_or_default]
    pub is_autosize: bool,

    #[prop_or_default]
    pub label: Option<Cow<'static, str>>,

    #[prop_or_default]
    pub id: Option<&'static str>,

    #[prop_or_default]
    pub class: Option<String>,

    #[prop_or_default]
    pub wrapper_class: Option<String>,
}

impl<T> PartialEq for SelectProps<T>
where
    T: Clone + Display + PartialEq + 'static,
{
    fn eq(&self, rhs: &Self) -> bool {
        self.selected == rhs.selected && self.values == rhs.values
    }
}

pub enum SelectMsg {
    SelectedChanged(i32),
    KeyboardInput(bool, i32, String),
}

/// A `<select>` HTML elements, lifted to support parameterization over a set of
/// values of a type `T`.
pub struct Select<T>
where
    T: Clone + Display + PartialEq + 'static,
{
    select_ref: NodeRef,
    selected: T,
}

impl<T> Component for Select<T>
where
    T: Clone + Display + PartialEq + 'static,
{
    type Message = SelectMsg;
    type Properties = SelectProps<T>;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            select_ref: NodeRef::default(),
            selected: _ctx.props().selected.clone(),
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            SelectMsg::SelectedChanged(x) => {
                self.selected = find_nth(x, &ctx.props().values).unwrap().clone();
                ctx.props().on_select.emit(self.selected.clone());
                true
            },

            // All the up and down arrow keys to instantly select, which is
            // useful for keyboard warrios. This is not ada without the shift
            // key. I'm not sure if it is _with_ the shift key either, but its
            // cool.
            SelectMsg::KeyboardInput(is_shift, idx, code) => {
                if is_shift {
                    if code.as_str() == "ArrowUp" {
                        if let Some(x) = find_nth(idx - 1, &ctx.props().values) {
                            self.selected = x.clone();
                            ctx.props().on_select.emit(self.selected.clone());
                            return true;
                        }
                    } else if code.as_str() == "ArrowDown"
                        && let Some(x) = find_nth(idx + 1, &ctx.props().values)
                    {
                        self.selected = x.clone();
                        ctx.props().on_select.emit(self.selected.clone());
                        return true;
                    }
                }

                false
            },
        }
    }

    // The `<select>` has its own state not refelcted by `SelectProps`.
    fn changed(&mut self, ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        self.selected = ctx.props().selected.clone();
        true
    }

    // Annoyingly, `<select>` cannot be updated from its HTML alone.
    fn rendered(&mut self, _ctx: &Context<Self>, _first_render: bool) {
        if let Some(elem) = self.select_ref.cast::<web_sys::HtmlSelectElement>() {
            elem.set_value(&format!("{}", self.selected))
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let callback = ctx.link().callback(|event: InputEvent| {
            let value = event
                .target()
                .unwrap()
                .unchecked_into::<web_sys::HtmlSelectElement>()
                .selected_index();
            SelectMsg::SelectedChanged(value)
        });

        let key_callback = ctx.link().callback(|event: KeyboardEvent| {
            event.prevent_default();
            let value = event
                .target()
                .unwrap()
                .unchecked_into::<web_sys::HtmlSelectElement>()
                .selected_index();

            let is_shift = event.shift_key();
            SelectMsg::KeyboardInput(is_shift, value, event.code())
        });

        let class = if let Some(class) = &ctx.props().class {
            format!("noselect {class}")
        } else {
            "noselect".to_owned()
        };

        let is_group_selected = !ctx
            .props()
            .values
            .iter()
            .any(|x| matches!(x, SelectItem::Option(y) if *y == ctx.props().selected));

        let select = html! {
            <select
                id={ctx.props().id}
                {class}
                ref={&self.select_ref}
                oninput={callback}
                onkeydown={key_callback}
            >
                { for ctx.props().values.iter().map(|value| match value {
                        SelectItem::Option(value) => {
                            let selected = *value == ctx.props().selected;
                            html! {
                                <option
                                    key={ format!("{}", value) }
                                    selected={ selected }
                                    value={ format!("{value}") }>
                                    { format!("{}", value) }
                                </option>
                            }
                        },
                        SelectItem::OptGroup(name, group) => html! {
                            <optgroup
                                key={ name.to_string() }
                                label={ name.to_string() }>
                                {
                                    for group.iter().map(|value| {
                                        let selected =
                                            *value == ctx.props().selected;

                                        let label = format!("{value}");
                                        let category: &str = name.borrow();
                                        let label = label
                                            .strip_prefix(category)
                                            .unwrap_or(&label)
                                            .trim()
                                            .to_owned();

                                        html! {
                                            <option
                                                key={ format!("{}", value) }
                                                selected={ selected }
                                                value={ format!("{value}") }>
                                                { label }
                                            </option>
                                        }
                                    })
                                }
                            </optgroup>
                        }
                    }) }
            </select>
        };

        let wrapper_class = match &ctx.props().wrapper_class {
            Some(x) => classes!("dropdown-width-container", x),
            None => classes!("dropdown-width-container"),
        };

        let value = if ctx.props().is_autosize {
            self.selected.to_string()
        } else {
            "".to_owned()
        };

        html! {
            if is_group_selected && ctx.props().label.is_some() {
                <label>
                    { ctx.props().label.as_ref().map(|x| x.to_string()).unwrap_or_default() }
                </label>
                <div class={wrapper_class} data-value={value.clone()}>{ select }</div>
            } else {
                <div class={wrapper_class} data-value={value}>{ select }</div>
            }
        }
    }
}

#[derive(Clone, Eq, PartialEq)]
pub enum SelectItem<T> {
    Option(T),
    OptGroup(Cow<'static, str>, Vec<T>),
}

impl<T: Display> SelectItem<T> {
    pub fn name<'a>(&self) -> Cow<'a, str> {
        match self {
            Self::Option(x) => format!("{x}").into(),
            Self::OptGroup(x, _) => x.clone(),
        }
    }
}

fn find_nth<T>(mut count: i32, items: &[SelectItem<T>]) -> Option<&T> {
    for ref item in items.iter() {
        match item {
            SelectItem::Option(_) if count > 0 => {
                count -= 1;
            },
            SelectItem::OptGroup(_, items) if count >= items.len() as i32 => {
                count -= items.len() as i32;
            },
            SelectItem::OptGroup(_, items) => return items.get(count as usize),
            SelectItem::Option(x) => return Some(x),
        }
    }

    None
}

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

use std::rc::Rc;

use itertools::Itertools;
use web_sys::{FocusEvent, HtmlInputElement, KeyboardEvent};
use yew::{Callback, Component, Html, NodeRef, Properties, TargetCast, classes, html};

use super::type_icon::TypeIconType;
use crate::components::type_icon::TypeIcon;
use crate::maybe;
use crate::session::{Session, SessionMetadata};

#[derive(Clone, PartialEq, Properties)]
pub struct EditableHeaderProps {
    pub icon_type: Option<TypeIconType>,
    pub on_change: Callback<(Option<String>, bool)>,
    pub editable: bool,
    pub initial_value: Option<String>,
    pub placeholder: Rc<String>,

    #[prop_or_default]
    pub reset_count: u8,

    /// Session metadata snapshot — threaded from `SessionProps`.
    pub metadata: SessionMetadata,

    // State
    pub session: Session,
}

impl EditableHeaderProps {
    fn split_placeholder(&self) -> String {
        let split = self
            .placeholder
            .split_once('\n')
            .map(|(a, _)| a)
            .unwrap_or(&*self.placeholder);

        match split.char_indices().nth(25) {
            None => split.to_string(),
            Some((idx, _)) => split[..idx].to_owned(),
        }
    }
}

pub enum EditableHeaderMsg {
    SetNewValue(String),
    OnClick(()),
}

#[derive(Debug)]
pub struct EditableHeader {
    noderef: NodeRef,
    edited: bool,
    valid: bool,
    value: Option<String>,
    placeholder: String,
}

impl Component for EditableHeader {
    type Message = EditableHeaderMsg;
    type Properties = EditableHeaderProps;

    fn create(ctx: &yew::prelude::Context<Self>) -> Self {
        Self {
            value: ctx.props().initial_value.clone(),
            placeholder: ctx.props().split_placeholder(),
            valid: true,
            noderef: NodeRef::default(),
            edited: false,
        }
    }

    fn changed(&mut self, ctx: &yew::prelude::Context<Self>, old_props: &Self::Properties) -> bool {
        if ctx.props().reset_count != old_props.reset_count {
            self.value.clone_from(&ctx.props().initial_value);
        }
        if ctx.props().initial_value != old_props.initial_value {
            self.edited = false;
            self.value.clone_from(&ctx.props().initial_value);
        }
        if !ctx.props().editable {
            self.edited = false;
        }
        self.placeholder = ctx.props().split_placeholder();
        ctx.props() != old_props
    }

    fn update(&mut self, ctx: &yew::prelude::Context<Self>, msg: Self::Message) -> bool {
        match msg {
            EditableHeaderMsg::SetNewValue(new_value) => {
                let maybe_value = (!new_value.is_empty()).then_some(new_value.clone());
                self.edited = ctx.props().initial_value != maybe_value;

                self.valid = maybe!({
                    if maybe_value
                        .as_ref()
                        .map(|v| v == &self.placeholder)
                        .unwrap_or(true)
                    {
                        return Some(true);
                    }
                    if !self.edited {
                        return Some(true);
                    }
                    let metadata = &ctx.props().metadata;
                    let expressions = metadata.get_expression_columns();
                    let found = metadata
                        .get_table_columns()?
                        .iter()
                        .chain(expressions)
                        .contains(&new_value);
                    Some(!found)
                })
                .unwrap_or(true);

                self.value.clone_from(&maybe_value);
                ctx.props().on_change.emit((maybe_value, self.valid));
                true
            },
            EditableHeaderMsg::OnClick(()) => {
                self.noderef
                    .cast::<HtmlInputElement>()
                    .unwrap()
                    .focus()
                    .unwrap();
                false
            },
        }
    }

    fn view(&self, ctx: &yew::prelude::Context<Self>) -> Html {
        let mut classes = classes!("sidebar_header_contents");
        if ctx.props().editable {
            classes.push("editable");
        }

        if !self.valid {
            classes.push("invalid");
        }

        if self.edited {
            classes.push("edited");
        }

        let onkeyup = ctx.link().callback(|e: KeyboardEvent| {
            let value = e.target_unchecked_into::<HtmlInputElement>().value();
            EditableHeaderMsg::SetNewValue(value)
        });

        let onblur = ctx.link().callback(|e: FocusEvent| {
            let value = e.target_unchecked_into::<HtmlInputElement>().value();
            EditableHeaderMsg::SetNewValue(value)
        });

        html! {
            <div class={classes} onclick={ctx.link().callback(|_| EditableHeaderMsg::OnClick(()))}>
                if let Some(icon) = ctx.props().icon_type { <TypeIcon ty={icon} /> }
                <input
                    ref={self.noderef.clone()}
                    type="search"
                    class="sidebar_header_title"
                    disabled={!ctx.props().editable}
                    {onblur}
                    {onkeyup}
                    value={self.value.clone()}
                    placeholder={self.placeholder.clone()}
                />
            </div>
        }
    }
}

#[derive(Default, Debug, PartialEq, Copy, Clone)]
pub enum ValueState {
    #[default]
    Unedited,
    Edited,
}

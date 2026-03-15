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

use perspective_client::{ExprValidationError, clone};
use yew::prelude::*;

use super::form::code_editor::*;
use super::style::LocalStyle;
use crate::session::{Session, SessionMetadata};
use crate::*;

#[derive(Properties, PartialEq, Clone)]
pub struct ExpressionEditorProps {
    pub on_save: Callback<()>,
    pub on_validate: Callback<bool>,
    pub on_input: Callback<Rc<String>>,
    pub alias: Option<String>,
    pub disabled: bool,

    #[prop_or_default]
    pub reset_count: u8,

    /// Session metadata snapshot — threaded from `SessionProps`.
    pub metadata: SessionMetadata,

    // State
    pub session: Session,
}

#[derive(Debug)]
pub enum ExpressionEditorMsg {
    SetExpr(Rc<String>),
    ValidateComplete(Option<ExprValidationError>),
}

/// Expression editor component `CodeEditor` and a button toolbar.
pub struct ExpressionEditor {
    expr: Rc<String>,
    error: Option<ExprValidationError>,
    oninput: Callback<Rc<String>>,
}

impl Component for ExpressionEditor {
    type Message = ExpressionEditorMsg;
    type Properties = ExpressionEditorProps;

    fn create(ctx: &Context<Self>) -> Self {
        let oninput = ctx.link().callback(ExpressionEditorMsg::SetExpr);
        let expr = initial_expr(&ctx.props().metadata, &ctx.props().alias);
        ctx.link()
            .send_message(Self::Message::SetExpr(expr.clone()));

        Self {
            error: None,
            expr,
            oninput,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            ExpressionEditorMsg::SetExpr(val) => {
                ctx.props().on_input.emit(val.clone());
                self.expr = val.clone();
                clone!(ctx.props().session);
                ctx.link().send_future(async move {
                    match session.validate_expr(&val).await {
                        Ok(x) => ExpressionEditorMsg::ValidateComplete(x),
                        Err(err) => {
                            web_sys::console::error_1(&format!("{err:?}").into());
                            ExpressionEditorMsg::ValidateComplete(None)
                        },
                    }
                });

                true
            },
            ExpressionEditorMsg::ValidateComplete(err) => {
                self.error = err;
                if self.error.is_none() {
                    maybe!({
                        let alias = ctx.props().alias.as_ref()?;
                        let session = &ctx.props().session;
                        let old = ctx.props().metadata.get_expression_by_alias(alias)?;
                        let is_edited = *self.expr != old;
                        session
                            .metadata_mut()
                            .set_edit_by_alias(alias, self.expr.to_string());

                        Some(is_edited)
                    });

                    ctx.props().on_validate.emit(true);
                } else {
                    ctx.props().on_validate.emit(false);
                }
                true
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let disabled_class = ctx.props().disabled.then_some("disabled");
        clone!(ctx.props().disabled);
        html! {
            <>
                <LocalStyle href={css!("expression-editor")} />
                <label class="item_title">{ "Expression" }</label>
                <div id="editor-container" class={disabled_class}>
                    <CodeEditor
                        autofocus=true
                        expr={&self.expr}
                        autosuggest=true
                        error={self.error.clone().map(|x| x.into())}
                        {disabled}
                        oninput={self.oninput.clone()}
                        onsave={ctx.props().on_save.clone()}
                    />
                    <div id="psp-expression-editor-meta">
                        <div class="error">
                            { &self.error.clone().map(|e| e.error_message).unwrap_or_default() }
                        </div>
                    </div>
                </div>
            </>
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, old_props: &Self::Properties) -> bool {
        if ctx.props().alias != old_props.alias || ctx.props().reset_count != old_props.reset_count
        {
            ctx.link()
                .send_message(ExpressionEditorMsg::SetExpr(initial_expr(
                    &ctx.props().metadata,
                    &ctx.props().alias,
                )));
            false
        } else {
            true
        }
    }
}

fn initial_expr(metadata: &SessionMetadata, alias: &Option<String>) -> Rc<String> {
    alias
        .as_ref()
        .and_then(|alias| metadata.get_expression_by_alias(alias))
        .unwrap_or_default()
        .into()
}

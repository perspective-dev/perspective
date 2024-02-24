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

use perspective_client::{clone, ExprValidationError};
use yew::prelude::*;

use super::containers::split_panel::*;
use super::form::code_editor::*;
use super::style::LocalStyle;
use crate::session::Session;
use crate::*;

#[derive(Debug)]
pub enum ExpressionEditorMsg {
    SetExpr(Rc<String>),
    ValidateComplete(Option<ExprValidationError>),
}

#[derive(Properties, PartialEq, Clone)]
pub struct ExpressionEditorProps {
    pub session: Session,
    // called on shift+enter in the code editor
    pub on_save: Callback<()>,
    pub on_validate: Callback<bool>,
    pub on_input: Callback<Rc<String>>,
    pub alias: Option<String>,
    pub disabled: bool,
    #[prop_or_default]
    pub reset_count: u8,
}

impl ExpressionEditorProps {
    fn initial_expr(&self) -> Rc<String> {
        self.alias
            .as_ref()
            .and_then(|alias| self.session.metadata().get_expression_by_alias(alias))
            .unwrap_or_default()
            .into()
    }
}

/// Expression editor component `CodeEditor` and a button toolbar.
pub struct ExpressionEditor {
    expr: Rc<String>,
    error: Option<ExprValidationError>,
}

impl Component for ExpressionEditor {
    type Message = ExpressionEditorMsg;
    type Properties = ExpressionEditorProps;

    fn create(ctx: &Context<Self>) -> Self {
        let expr = ctx.props().initial_expr();
        ctx.link()
            .send_message(Self::Message::SetExpr(expr.clone()));
        Self { error: None, expr }
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
                            web_sys::console::error_1(&format!("{:?}", err).into());
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
                        let old = session.metadata().get_expression_by_alias(alias)?;
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
        let oninput = ctx.link().callback(ExpressionEditorMsg::SetExpr);
        let disabled_class = ctx.props().disabled.then_some("disabled");
        clone!(ctx.props().disabled);

        html! {
            <>
                <LocalStyle href={css!("expression-editor")} />
                <SplitPanel orientation={Orientation::Vertical}>
                    <>
                        <label class="item_title">{ "Expression" }</label>
                        <div id="editor-container" class={disabled_class}>
                            <CodeEditor
                                expr={&self.expr}
                                error={self.error.clone().map(|x| x.into())}
                                {disabled}
                                {oninput}
                                onsave={ctx.props().on_save.clone()}
                            />
                            <div id="psp-expression-editor-meta">
                                <div class="error">
                                    { &self.error.clone().map(|e| e.error_message).unwrap_or_default() }
                                </div>
                            </div>
                        </div>
                    </>
                    <></>
                </SplitPanel>
            </>
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, old_props: &Self::Properties) -> bool {
        if ctx.props().alias != old_props.alias || ctx.props().reset_count != old_props.reset_count
        {
            ctx.link()
                .send_message(ExpressionEditorMsg::SetExpr(ctx.props().initial_expr()))
        }

        true
    }
}

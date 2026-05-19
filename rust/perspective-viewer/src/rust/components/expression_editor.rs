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
use crate::session::{Session, SessionMetadata, SessionMetadataRc};
use crate::tasks::{ExprValidation, validate_expression};
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
    pub metadata: SessionMetadataRc,

    /// Selected theme name, threaded for PortalModal consumers.
    #[prop_or_default]
    pub selected_theme: Option<String>,

    // State
    pub session: Session,
}

#[derive(Debug)]
pub enum ExpressionEditorMsg {
    SetExpr(Rc<String>),
    ValidateComplete(ExprValidation),
}

/// Expression editor component `CodeEditor` and a button toolbar.
pub struct ExpressionEditor {
    expr: Rc<String>,
    error: Option<ExprValidationError>,
    oninput: Callback<Rc<String>>,
    /// Monotonically increasing request id used to drop stale
    /// validation results when the user types faster than the engine
    /// can validate.
    validation_req_id: u64,
    /// The id of the most recently dispatched validation; the result
    /// is only applied when its echoed id matches.
    last_dispatched_req_id: u64,
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
            validation_req_id: 0,
            last_dispatched_req_id: 0,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            ExpressionEditorMsg::SetExpr(val) => {
                ctx.props().on_input.emit(val.clone());
                self.expr = val.clone();
                self.validation_req_id += 1;
                self.last_dispatched_req_id = self.validation_req_id;
                let cb = ctx.link().callback(ExpressionEditorMsg::ValidateComplete);
                validate_expression(
                    &ctx.props().session,
                    cb,
                    self.validation_req_id,
                    (*val).clone(),
                );
                true
            },
            ExpressionEditorMsg::ValidateComplete(result) => {
                if result.req_id != self.last_dispatched_req_id {
                    // Stale result from a superseded request — ignore.
                    return false;
                }
                self.error = result.error;
                if self.error.is_none() {
                    let _: Option<bool> = try {
                        let alias = ctx.props().alias.as_ref()?;
                        let session = &ctx.props().session;
                        let old = ctx.props().metadata.get_expression_by_alias(alias)?;
                        let is_edited = *self.expr != old;
                        session
                            .metadata_mut()
                            .set_edit_by_alias(alias, self.expr.to_string());

                        is_edited
                    };

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
                        theme={ctx.props().selected_theme.clone().unwrap_or_default()}
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
        if ctx.props().alias != old_props.alias
            || ctx.props().reset_count != old_props.reset_count
            || (ctx.props().alias.is_some() && ctx.props().metadata != old_props.metadata)
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

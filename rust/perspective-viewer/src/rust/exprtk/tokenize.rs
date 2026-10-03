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

mod comment;
mod number;
mod string;
mod symbol;

use nom::IResult;
use nom::branch::alt;
use nom::bytes::complete::{is_a, is_not};
use nom::character::complete::{line_ending, space1};
use nom::combinator::map;
use nom::multi::many0;
use yew::prelude::*;

use self::comment::*;
use self::number::*;
use self::string::*;
use self::symbol::*;

/// Syntax-highlightable ExprTK tokens.
///
///  We had the option of implemnting this alternatively as `pub struct
/// Token(TokenType, &'a str);`, but I felt this was less ergonomic for the
/// frequent pattern matching necessary when handling enum tokens.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Token<'a> {
    /// `//``
    Comment(&'a str),

    /// ` `
    Whitespace(&'a str),

    /// `\n`
    Break(&'a str),

    /// `x`
    Symbol(&'a str),

    /// `12`
    Literal(&'a str),

    /// `+`
    Operator(&'a str),

    /// `#`
    Unknown(&'a str),

    /// `"Sales"`
    Column(&'a str),
}

use Token::*;

impl Token<'_> {
    pub fn to_html(&self) -> Html {
        html! {
            if matches!(self, Break(_)) {
                <br />
            } else {
                <span class={self.class_name()}>{ self.content() }</span>
            }
        }
    }
}

impl<'a> Token<'a> {
    const fn class_name(&self) -> &'static str {
        match self {
            Comment(_) => "comment",
            Whitespace(_) => "whitespace",
            Symbol(_) => "symbol",
            Operator(_) => "operator",
            Unknown(_) => "unknown",
            Break(_) => "break",
            Literal(_) => "literal",
            Column(_) => "column",
        }
    }

    /// Note the use of the lifetime `'a` - this function does not work
    /// correctly when it's signature is specified `-> &'_ str` instead, as
    /// `self` and the `str` may have different lifetimes.
    pub const fn content(&self) -> &'a str {
        match self {
            Comment(x) => x,
            Whitespace(x) => x,
            Symbol(x) => x,
            Operator(x) => x,
            Unknown(x) => x,
            Break(x) => x,
            Literal(x) => x,
            Column(x) => x,
        }
    }
}

#[allow(clippy::redundant_closure)]
fn parse_multiline_string<'a>(
    sep: char,
    lit: impl Fn(&'a str) -> Token<'a>,
) -> impl FnMut(&'a str) -> IResult<&'a str, Vec<Token<'a>>> {
    map(parse_string_literal(sep), move |x| {
        x.into_iter()
            .map(|x| lit(x))
            .intersperse(Token::Break("\n"))
            .collect()
    })
}

/// Parse a string representing an ExprTK Expression Column into `Token`s. A
/// token list is sufficient for syntax-highlighting purposes, faster than a
/// full parser and much easier to write a renderer for.
pub fn tokenize(input: &str) -> Vec<Token<'_>> {
    let comment = map(parse_comment, |x| vec![Token::Comment(x)]);
    let string = parse_multiline_string('\'', Token::Literal);
    let column = parse_multiline_string('"', Token::Column);
    let symbol = map(parse_symbol_literal, |x| vec![Token::Symbol(x)]);
    let number = map(parse_number_literal, |x| vec![Token::Literal(x)]);
    let whitespace = map(space1, |x| vec![Token::Whitespace(x)]);
    let linebreak = map(line_ending, |x| vec![Token::Break(x)]);
    let ops = map(is_a("+-/*^%&|=:;,.(){}[]<>\\"), |x| {
        vec![Token::Operator(x)]
    });
    let unknown = map(is_not(" \t\n\r"), |x| vec![Token::Unknown(x)]);
    let token = alt((
        comment, string, column, symbol, number, whitespace, linebreak, ops, unknown,
    ));

    let mut expr = map(many0(token), |x| x.into_iter().flatten().collect());
    let (rest, mut tokens) = expr(input).unwrap_or_else(|_| (input, vec![]));
    if !rest.is_empty() {
        tracing::warn!(
            "Parser terminated at position {}: {}",
            input.len() - rest.len(),
            input
        );

        tokens.push(Token::Unknown(rest))
    }

    tokens
}

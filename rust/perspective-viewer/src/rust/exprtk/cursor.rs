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

use perspective_client::ExprValidationError;
use yew::prelude::*;

/// Because ExprTK reports errors in column/row coordinates and visually needs
/// to be applied to an entire token rather than a single character, we need
/// fairly obnoxious counter logic to figure out how to generate the resulting
/// syntax-highlighted HTML. The `Counter<'a>` struct encpsulates this logic,
/// generating a `NodeRef` to any autocomplete-able `<span>` tokens, as well
/// as other convenient data for HTML rendering, and can be called incrementally
/// while iterating tokens after parsing.
pub struct Cursor<'a> {
    row: u32,
    col: u32,
    index: u32,
    pub err: &'a Option<ExprValidationError>,
    pub txt: &'a str,
    pub noderef: NodeRef,
    pub auto: Option<String>,
}

impl<'a> Cursor<'a> {
    pub fn new(err: &'a Option<ExprValidationError>) -> Self {
        Self {
            row: 1,
            col: 0,
            index: 0,
            err,
            txt: "",
            auto: None,
            noderef: NodeRef::default(),
        }
    }

    /// Is the cursor currently overlapping a token with an error?
    pub const fn is_error(&self) -> bool {
        if let Some(err) = &self.err {
            err.line + 1 == self.row
                && err.column >= self.col
                && err.column < (self.col + self.txt.len() as u32)
        } else {
            false
        }
    }

    /// Is the cursor currently overlapping an  autocomplete-able token?
    pub const fn is_autocomplete(&self, position: u32) -> bool {
        position > self.index && position <= self.index + self.txt.len() as u32
    }

    /// TODO this is alot of type backage for what could just be `num_rows()`.
    pub fn map_rows<T, F: Fn(u32) -> T>(self, f: F) -> impl Iterator<Item = T> {
        (0..self.row).map(f)
    }

    /// Increment the counter column by `size` characters.
    pub fn increment_column(&mut self, size: u32) {
        self.col += size;
        self.index += size;
    }

    /// Increment to the next line, typewriter-style.
    pub fn increment_line(&mut self) {
        self.row += 1;
        self.col = 0;
        self.index += 1;
    }
}

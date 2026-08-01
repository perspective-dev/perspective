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

//! The parser→renderer event vocabulary — the closed set of constructs the
//! chat renderer emits. Anything the parser can't classify degrades to
//! `Text`, so content is never lost, only unstyled.

/// GFM table column alignment.
#[derive(Clone, Debug, PartialEq)]
pub enum Align {
    None,
    Left,
    Center,
    Right,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Tag {
    Paragraph,

    /// ATX heading level, `1..=6`.
    Heading(u8),

    BlockQuote,

    /// A code block; the payload is the fence's language word, if any.
    CodeBlock(Option<String>),

    /// `None` renders `<ul>`; `Some(start)` renders `<ol>`.
    List(Option<u64>),

    Item,
    Emphasis,
    Strong,
    Strikethrough,
    Link {
        dest_url: String,
        title: String,
    },
    Image {
        dest_url: String,
    },
    Table(Vec<Align>),
    TableHead,
    TableRow,
    TableCell,
}

/// `Start`/`End` are emitted in balanced pairs by construction — both come
/// from the same lexical scope in the parser.
#[derive(Clone, Debug, PartialEq)]
pub enum Event {
    Start(Tag),
    End,
    Text(String),

    /// An inline code span (block-level code is `Tag::CodeBlock` + `Text`).
    Code(String),
    SoftBreak,
    HardBreak,
    Rule,
}

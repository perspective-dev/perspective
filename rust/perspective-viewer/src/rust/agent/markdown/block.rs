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

//! Block-level markdown: a line-oriented pass over container structure
//! (blockquotes, list items) via prefix-stripping recursion, with nom
//! recognizers for the line classifiers. Deliberately NOT combinator-driven
//! at the top level — block structure is indentation-context state, which
//! fits a line loop better than a grammar.

use nom::IResult;
use nom::branch::alt;
use nom::character::complete::{digit1, one_of};
use nom::combinator::{map, verify};
use nom::sequence::terminated;

use super::events::{Align, Event, Tag};
use super::inline;

pub fn parse(text: &str) -> Vec<Event> {
    let lines = text.lines().map(str::to_owned).collect::<Vec<_>>();
    let mut events = vec![];
    parse_blocks(&lines, &mut events);
    events
}

fn parse_blocks(lines: &[String], events: &mut Vec<Event>) {
    let mut i = 0;
    while i < lines.len() {
        let line = &lines[i];
        let trimmed = line.trim_start_matches(' ');
        let indent = line.len() - trimmed.len();
        if trimmed.is_empty() {
            i += 1;
        } else if indent <= 3
            && let Some((fence, fence_len, lang)) = fence_open(trimmed)
        {
            i = parse_fence(lines, i, indent, fence, fence_len, lang, events);
        } else if indent >= 4 {
            i = parse_indented_code(lines, i, events);
        } else if let Some((level, content)) = atx_heading(trimmed) {
            events.push(Event::Start(Tag::Heading(level)));
            inline::parse_into(content, events);
            events.push(Event::End);
            i += 1;
        } else if thematic_break(trimmed) {
            events.push(Event::Rule);
            i += 1;
        } else if trimmed.starts_with('>') {
            i = parse_quote(lines, i, events);
        } else if let Some(aligns) = table_start(lines, i) {
            i = parse_table(lines, i, aligns, events);
        } else if let Some((_, start, content_col)) = list_marker(line) {
            i = parse_list(lines, i, start, content_col, events);
        } else {
            i = parse_paragraph(lines, i, events);
        }
    }
}

/// ` ```lang ` / `~~~lang` — 3+ fence chars, optional info string whose
/// first word is the language.
fn fence_open(trimmed: &str) -> Option<(char, usize, Option<String>)> {
    let fence = trimmed.chars().next().filter(|x| *x == '`' || *x == '~')?;
    let len = trimmed.chars().take_while(|x| *x == fence).count();
    if len < 3 {
        return None;
    }

    let info = trimmed[len..].trim();
    if fence == '`' && info.contains('`') {
        return None;
    }

    Some((
        fence,
        len,
        info.split_whitespace().next().map(str::to_owned),
    ))
}

#[allow(clippy::too_many_arguments)]
fn parse_fence(
    lines: &[String],
    i: usize,
    indent: usize,
    fence: char,
    fence_len: usize,
    lang: Option<String>,
    events: &mut Vec<Event>,
) -> usize {
    let mut content = String::new();
    let mut j = i + 1;
    while j < lines.len() {
        let line = &lines[j];
        let trimmed = line.trim_start_matches(' ');
        let close_len = trimmed.chars().take_while(|x| *x == fence).count();
        if close_len >= fence_len && trimmed[close_len..].trim().is_empty() {
            j += 1;
            break;
        }

        // Strip up to the opening fence's indentation.
        let strip = line.chars().take_while(|x| *x == ' ').count().min(indent);

        content.push_str(&line[strip..]);
        content.push('\n');
        j += 1;
    }

    events.push(Event::Start(Tag::CodeBlock(lang)));
    events.push(Event::Text(content));
    events.push(Event::End);
    j
}

fn parse_indented_code(lines: &[String], i: usize, events: &mut Vec<Event>) -> usize {
    let mut collected: Vec<String> = vec![];
    let mut j = i;
    while j < lines.len() {
        let line = &lines[j];
        if line.trim().is_empty() {
            collected.push(String::new());
        } else if indent_of(line) >= 4 {
            collected.push(line[4..].to_owned());
        } else {
            break;
        }

        j += 1;
    }

    while collected.last().is_some_and(|x| x.is_empty()) {
        collected.pop();
    }

    events.push(Event::Start(Tag::CodeBlock(None)));
    events.push(Event::Text(collected.join("\n") + "\n"));
    events.push(Event::End);
    j
}

/// 1–6 `#` + space (or end of line); optional closing `#` run stripped.
fn atx_heading(trimmed: &str) -> Option<(u8, &str)> {
    let level = trimmed.chars().take_while(|x| *x == '#').count();
    if level == 0 || level > 6 {
        return None;
    }

    let rest = &trimmed[level..];
    if !rest.is_empty() && !rest.starts_with(' ') {
        return None;
    }

    let content = rest.trim();
    let stripped = content.trim_end_matches('#');
    let content =
        if stripped.len() < content.len() && (stripped.is_empty() || stripped.ends_with(' ')) {
            stripped.trim_end()
        } else {
            content
        };

    Some((level as u8, content))
}

/// 3+ of the same `-`/`_`/`*` char, optionally space-separated, alone on
/// the line. Checked before list markers so `---` is a rule.
fn thematic_break(trimmed: &str) -> bool {
    for fence in ['-', '_', '*'] {
        if trimmed.chars().all(|x| x == fence || x == ' ')
            && trimmed.chars().filter(|x| *x == fence).count() >= 3
        {
            return true;
        }
    }

    false
}

/// Consecutive `>`-prefixed lines; no lazy continuation.
fn parse_quote(lines: &[String], i: usize, events: &mut Vec<Event>) -> usize {
    let mut inner = vec![];
    let mut j = i;
    while j < lines.len() {
        let trimmed = lines[j].trim_start_matches(' ');
        let Some(rest) = trimmed.strip_prefix('>') else {
            break;
        };

        inner.push(rest.strip_prefix(' ').unwrap_or(rest).to_owned());
        j += 1;
    }

    events.push(Event::Start(Tag::BlockQuote));
    parse_blocks(&inner, events);
    events.push(Event::End);
    j
}

fn nom_bullet(input: &str) -> IResult<&str, Option<u64>> {
    map(one_of("-*+"), |_| None)(input)
}

fn nom_ordered(input: &str) -> IResult<&str, Option<u64>> {
    map(
        terminated(verify(digit1, |x: &str| x.len() <= 9), one_of(".)")),
        |x: &str| Some(x.parse().unwrap_or(1)),
    )(input)
}

/// `- ` / `* ` / `+ ` / `1. ` / `1) ` → (indent, `List` payload, column
/// where item content begins).
fn list_marker(line: &str) -> Option<(usize, Option<u64>, usize)> {
    let indent = indent_of(line);
    if indent > 3 {
        return None;
    }

    let rest = &line[indent..];
    let (after, start) = alt((nom_bullet, nom_ordered))(rest).ok()?;
    if !after.is_empty() && !after.starts_with(' ') {
        return None;
    }

    let width = rest.len() - after.len();
    Some((indent, start, indent + width + 1))
}

fn parse_list(
    lines: &[String],
    i: usize,
    start: Option<u64>,
    content_col: usize,
    events: &mut Vec<Event>,
) -> usize {
    events.push(Event::Start(Tag::List(start)));
    let mut j = i;
    let mut col = content_col;
    loop {
        // One item: the marker line's remainder, plus blank or
        // content-indented continuation lines, prefix-stripped.
        let mut item = vec![line_from(&lines[j], col)];
        j += 1;
        while j < lines.len() {
            let line = &lines[j];
            if line.trim().is_empty() {
                item.push(String::new());
            } else if indent_of(line) >= col {
                item.push(line_from(line, col));
            } else {
                break;
            }

            j += 1;
        }

        while item.last().is_some_and(|x| x.is_empty()) {
            item.pop();
        }

        let mut item_events = vec![];
        parse_blocks(&item, &mut item_events);
        events.push(Event::Start(Tag::Item));
        events.extend(strip_item_paragraphs(item_events));
        events.push(Event::End);

        // Another marker of the same list kind continues the list.
        match lines.get(j).and_then(|x| list_marker(x)) {
            Some((_, next_start, next_col)) if next_start.is_some() == start.is_some() => {
                col = next_col;
            },
            _ => break,
        }
    }

    events.push(Event::End);
    j
}

/// All lists render tight: top-level paragraph wrappers inside an item are
/// stripped (adjacent stripped paragraphs separated by a hard break), so
/// `<li>` holds inline content directly, with nested blocks intact.
fn strip_item_paragraphs(item_events: Vec<Event>) -> Vec<Event> {
    let mut out = Vec::with_capacity(item_events.len());
    let mut depth = 0usize;
    let mut stripped = vec![];
    let mut pending_break = false;
    for event in item_events {
        match event {
            Event::Start(Tag::Paragraph) if depth == 0 => {
                if pending_break {
                    out.push(Event::HardBreak);
                    pending_break = false;
                }

                stripped.push(depth);
                depth += 1;
            },
            Event::Start(tag) => {
                if depth == 0 {
                    pending_break = false;
                }

                depth += 1;
                out.push(Event::Start(tag));
            },
            Event::End => {
                depth -= 1;
                if stripped.last() == Some(&depth) {
                    stripped.pop();
                    pending_break = true;
                } else {
                    out.push(Event::End);
                }
            },
            event => {
                if depth == 0 {
                    pending_break = false;
                }

                out.push(event);
            },
        }
    }

    out
}

/// A table begins at a line containing `|` whose successor is a delimiter
/// row with a MATCHING column count — the count check keeps prose containing
/// pipes (and `---` rules) from false-positives.
fn table_start(lines: &[String], i: usize) -> Option<Vec<Align>> {
    if !lines[i].contains('|') {
        return None;
    }

    let aligns = delimiter_row(lines.get(i + 1)?)?;
    (split_row(&lines[i]).len() == aligns.len()).then_some(aligns)
}

fn delimiter_row(line: &str) -> Option<Vec<Align>> {
    if !line.contains('|') {
        return None;
    }

    let cells = split_row(line);
    if cells.is_empty() {
        return None;
    }

    cells
        .iter()
        .map(|cell| {
            let cell = cell.trim();
            let dashes = cell.trim_start_matches(':').trim_end_matches(':');
            if dashes.is_empty() || !dashes.chars().all(|x| x == '-') {
                return None;
            }

            Some(match (cell.starts_with(':'), cell.ends_with(':')) {
                (true, true) => Align::Center,
                (true, false) => Align::Left,
                (false, true) => Align::Right,
                (false, false) => Align::None,
            })
        })
        .collect()
}

/// Split on unescaped `|` outside backtick code spans; outer pipes dropped,
/// cells trimmed. Per GFM, `\|` unescapes HERE (before inline parsing) —
/// that's how a pipe gets into a cell's code span; other escapes are left
/// for the inline pass.
fn split_row(line: &str) -> Vec<String> {
    let chars = line.trim().chars().collect::<Vec<_>>();
    let mut cells = vec![];
    let mut cell = String::new();
    let mut code: Option<usize> = None;
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '\\' if i + 1 < chars.len() => {
                if chars[i + 1] != '|' {
                    cell.push('\\');
                }

                cell.push(chars[i + 1]);
                i += 2;
            },
            '`' => {
                let run = chars[i..].iter().take_while(|x| **x == '`').count();
                code = match code {
                    None => Some(run),
                    Some(open) if open == run => None,
                    open => open,
                };

                cell.extend(std::iter::repeat_n('`', run));
                i += run;
            },
            '|' if code.is_none() => {
                cells.push(cell.trim().to_owned());
                cell.clear();
                i += 1;
            },
            c => {
                cell.push(c);
                i += 1;
            },
        }
    }

    cells.push(cell.trim().to_owned());
    if cells.first().is_some_and(|x| x.is_empty()) {
        cells.remove(0);
    }

    if cells.last().is_some_and(|x| x.is_empty()) {
        cells.pop();
    }

    cells
}

fn parse_table(lines: &[String], i: usize, aligns: Vec<Align>, events: &mut Vec<Event>) -> usize {
    let columns = aligns.len();
    events.push(Event::Start(Tag::Table(aligns)));
    events.push(Event::Start(Tag::TableHead));
    for cell in split_row(&lines[i]) {
        events.push(Event::Start(Tag::TableCell));
        inline::parse_into(&cell, events);
        events.push(Event::End);
    }

    events.push(Event::End);
    let mut j = i + 2;
    while j < lines.len() && !lines[j].trim().is_empty() && lines[j].contains('|') {
        let cells = split_row(&lines[j]);
        events.push(Event::Start(Tag::TableRow));
        for c in 0..columns {
            events.push(Event::Start(Tag::TableCell));
            inline::parse_into(cells.get(c).map(String::as_str).unwrap_or(""), events);
            events.push(Event::End);
        }

        events.push(Event::End);
        j += 1;
    }

    events.push(Event::End);
    j
}

/// Non-blank lines accumulate until a blank or a construct that interrupts
/// a paragraph; indented lines join it (indented code cannot interrupt).
fn parse_paragraph(lines: &[String], i: usize, events: &mut Vec<Event>) -> usize {
    let mut text = String::new();
    let mut j = i;
    while j < lines.len() {
        let line = &lines[j];
        let trimmed = line.trim_start_matches(' ');
        let indent = line.len() - trimmed.len();
        if trimmed.is_empty()
            || j > i
                && indent <= 3
                && (fence_open(trimmed).is_some()
                    || atx_heading(trimmed).is_some()
                    || thematic_break(trimmed)
                    || trimmed.starts_with('>')
                    || list_marker(line).is_some()
                    || table_start(lines, j).is_some())
        {
            break;
        }

        if j > i {
            text.push('\n');
        }

        // Trailing spaces are significant (hard breaks) — only CR is
        // stripped.
        text.push_str(line.trim_end_matches('\r'));
        j += 1;
    }

    events.push(Event::Start(Tag::Paragraph));
    inline::parse_into(text.trim_start(), events);
    events.push(Event::End);
    j
}

fn indent_of(line: &str) -> usize {
    line.chars().take_while(|x| *x == ' ').count()
}

/// The tail of `line` from byte column `col` (always a char boundary — the
/// prefix is ASCII spaces/markers), or empty when the line is shorter.
fn line_from(line: &str, col: usize) -> String {
    line.get(col..).unwrap_or("").to_owned()
}

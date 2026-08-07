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

//! Inline markdown: code spans, emphasis/strong/strikethrough, links,
//! images, autolinks, entities and breaks. A hand-rolled scanner (delimiter
//! matching needs lookbehind and run-length state that combinators fit
//! poorly) over a simplified flanking rule: a run may open iff its next
//! char is non-whitespace and close iff its previous char is
//! non-whitespace, with `_` additionally barred from opening/closing
//! against an alphanumeric neighbor so `snake_case` identifiers in prose
//! stay literal. Unpaired delimiters degrade to their literal text.

use super::entity;
use super::events::{Event, Tag};

enum Inline {
    Text(String),
    Code(String),
    SoftBreak,
    HardBreak,
    Emphasis(Vec<Inline>),
    Strong(Vec<Inline>),
    Strikethrough(Vec<Inline>),
    Link {
        dest_url: String,
        title: String,
        children: Vec<Inline>,
    },
    Image {
        dest_url: String,
        children: Vec<Inline>,
    },
}

enum ScanItem {
    Node(Inline),
    Delim {
        ch: char,
        len: usize,
        can_open: bool,
        can_close: bool,
    },
}

/// Parse `text` (one paragraph/heading/cell's worth, newlines = soft break
/// candidates) and append its events.
pub fn parse_into(text: &str, events: &mut Vec<Event>) {
    emit(resolve(scan(text)), events);
}

fn scan(text: &str) -> Vec<ScanItem> {
    let chars = text.chars().collect::<Vec<_>>();
    let mut items = vec![];
    let mut buf = String::new();
    let mut i = 0;
    macro_rules! flush {
        () => {
            if !buf.is_empty() {
                items.push(ScanItem::Node(Inline::Text(std::mem::take(&mut buf))));
            }
        };
    }

    while i < chars.len() {
        let c = chars[i];
        match c {
            '\\' if i + 1 < chars.len() => {
                let next = chars[i + 1];
                if next == '\n' {
                    flush!();
                    items.push(ScanItem::Node(Inline::HardBreak));
                } else if next.is_ascii_punctuation() {
                    buf.push(next);
                } else {
                    buf.push('\\');
                    buf.push(next);
                }

                i += 2;
            },
            '\n' => {
                let hard = buf.ends_with("  ");
                while buf.ends_with(' ') {
                    buf.pop();
                }

                flush!();
                items.push(ScanItem::Node(if hard {
                    Inline::HardBreak
                } else {
                    Inline::SoftBreak
                }));

                i += 1;
                while chars.get(i) == Some(&' ') {
                    i += 1;
                }
            },
            '`' => {
                let run = run_len(&chars, i, '`');
                if let Some(close) = find_code_close(&chars, i + run, run) {
                    flush!();
                    let content = chars[i + run..close]
                        .iter()
                        .map(|x| if *x == '\n' { ' ' } else { *x })
                        .collect::<String>();

                    items.push(ScanItem::Node(Inline::Code(trim_code_span(content))));
                    i = close + run;
                } else {
                    buf.extend(std::iter::repeat_n('`', run));
                    i += run;
                }
            },
            '*' | '_' | '~' => {
                let run = run_len(&chars, i, c);
                let prev = if i > 0 { Some(chars[i - 1]) } else { None };
                let next = chars.get(i + run).copied();
                let mut can_open = next.is_some_and(|x| !x.is_whitespace());
                let mut can_close = prev.is_some_and(|x| !x.is_whitespace());
                if c == '_' {
                    can_open &= !prev.is_some_and(|x| x.is_alphanumeric());
                    can_close &= !next.is_some_and(|x| x.is_alphanumeric());
                }

                if c == '~' && run < 2 || !can_open && !can_close {
                    buf.extend(std::iter::repeat_n(c, run));
                } else {
                    flush!();
                    items.push(ScanItem::Delim {
                        ch: c,
                        len: run,
                        can_open,
                        can_close,
                    });
                }

                i += run;
            },
            '[' => match parse_link(&chars, i, false) {
                Some((node, next)) => {
                    flush!();
                    items.push(ScanItem::Node(node));
                    i = next;
                },
                None => {
                    buf.push('[');
                    i += 1;
                },
            },
            '!' if chars.get(i + 1) == Some(&'[') => match parse_link(&chars, i + 1, true) {
                Some((node, next)) => {
                    flush!();
                    items.push(ScanItem::Node(node));
                    i = next;
                },
                None => {
                    buf.push('!');
                    i += 1;
                },
            },
            '<' => match parse_autolink(&chars, i) {
                Some((node, next)) => {
                    flush!();
                    items.push(ScanItem::Node(node));
                    i = next;
                },
                None => {
                    buf.push('<');
                    i += 1;
                },
            },
            '&' => {
                let rest = chars[i + 1..].iter().collect::<String>();
                match entity::decode(&rest) {
                    Some((decoded, used)) => {
                        buf.push(decoded);
                        i += 1 + used;
                    },
                    None => {
                        buf.push('&');
                        i += 1;
                    },
                }
            },
            c => {
                buf.push(c);
                i += 1;
            },
        }
    }

    flush!();
    items
}

fn run_len(chars: &[char], start: usize, ch: char) -> usize {
    chars[start..].iter().take_while(|x| **x == ch).count()
}

/// Find the next backtick run of EXACTLY `n` (longer/shorter runs are
/// skipped whole, per CommonMark).
fn find_code_close(chars: &[char], mut i: usize, n: usize) -> Option<usize> {
    while i < chars.len() {
        if chars[i] == '`' {
            let run = run_len(chars, i, '`');
            if run == n {
                return Some(i);
            }

            i += run;
        } else {
            i += 1;
        }
    }

    None
}

fn trim_code_span(content: String) -> String {
    if content.starts_with(' ')
        && content.ends_with(' ')
        && content.len() > 1
        && !content.chars().all(|x| x == ' ')
    {
        content[1..content.len() - 1].to_owned()
    } else {
        content
    }
}

/// `[text](dest "title")` at `i` (pointing at the `[`). The bracket text is
/// parsed recursively; URL trust policy stays in the renderer.
fn parse_link(chars: &[char], i: usize, image: bool) -> Option<(Inline, usize)> {
    let mut j = i + 1;
    let mut depth = 1;
    while j < chars.len() {
        match chars[j] {
            '\\' => j += 1,
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            },
            _ => (),
        }

        j += 1;
    }

    if depth != 0 || chars.get(j + 1) != Some(&'(') {
        return None;
    }

    let mut k = j + 2;
    while chars.get(k) == Some(&' ') {
        k += 1;
    }

    let mut dest_url = String::new();
    let mut paren_depth = 0;
    while k < chars.len() {
        match chars[k] {
            '\\' if k + 1 < chars.len() => {
                dest_url.push(chars[k + 1]);
                k += 1;
            },
            '(' => {
                paren_depth += 1;
                dest_url.push('(');
            },
            ')' if paren_depth == 0 => break,
            ')' => {
                paren_depth -= 1;
                dest_url.push(')');
            },
            ' ' => break,
            c => dest_url.push(c),
        }

        k += 1;
    }

    while chars.get(k) == Some(&' ') {
        k += 1;
    }

    let mut title = String::new();
    if let Some(quote @ ('"' | '\'')) = chars.get(k).copied() {
        k += 1;
        while k < chars.len() && chars[k] != quote {
            title.push(chars[k]);
            k += 1;
        }

        if k >= chars.len() {
            return None;
        }

        k += 1;
        while chars.get(k) == Some(&' ') {
            k += 1;
        }
    }

    if chars.get(k) != Some(&')') {
        return None;
    }

    let inner = chars[i + 1..j].iter().collect::<String>();
    let children = resolve(scan(&inner));
    let node = if image {
        Inline::Image { dest_url, children }
    } else {
        Inline::Link {
            dest_url,
            title,
            children,
        }
    };

    Some((node, k + 1))
}

/// `<https://…>` / `<mailto:…>` autolinks.
fn parse_autolink(chars: &[char], i: usize) -> Option<(Inline, usize)> {
    let end = i
        + chars[i + 1..]
            .iter()
            .position(|x| *x == '>' || x.is_whitespace() || *x == '<')?
        + 1;

    if chars[end] != '>' {
        return None;
    }

    let dest = chars[i + 1..end].iter().collect::<String>();
    let lower = dest.to_ascii_lowercase();
    if !(lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:"))
    {
        return None;
    }

    Some((
        Inline::Link {
            dest_url: dest.clone(),
            title: String::new(),
            children: vec![Inline::Text(dest)],
        },
        end + 1,
    ))
}

struct Frame {
    /// `Some((char, run length))` for a pending opener; `None` for the
    /// bottom output frame.
    delim: Option<(char, usize)>,
    children: Vec<Inline>,
}

/// Pair delimiter runs into emphasis nodes: strict nesting against the
/// frame stack, with non-matching intervening openers demoted to literal
/// text, and greedy `2 → Strong / 1 → Emphasis` consumption of partial
/// runs (`***x***` → strong + em).
fn resolve(items: Vec<ScanItem>) -> Vec<Inline> {
    let mut stack = vec![Frame {
        delim: None,
        children: vec![],
    }];

    for item in items {
        match item {
            ScanItem::Node(node) => stack.last_mut().unwrap().children.push(node),
            ScanItem::Delim {
                ch,
                len,
                can_open,
                can_close,
            } => {
                let mut remaining = len;
                while remaining > 0 && can_close {
                    let Some(fi) = stack.iter().rposition(|x| {
                        x.delim
                            .is_some_and(|(oc, ol)| oc == ch && (ch != '~' || ol >= 2))
                    }) else {
                        break;
                    };

                    if ch == '~' && remaining < 2 {
                        break;
                    }

                    demote_above(&mut stack, fi);
                    let frame = stack.pop().unwrap();
                    let (_, olen) = frame.delim.unwrap();
                    let take = if ch != '~' && (olen < 2 || remaining < 2) {
                        1
                    } else {
                        2
                    };

                    let node = match (ch, take) {
                        ('~', _) => Inline::Strikethrough(frame.children),
                        (_, 2) => Inline::Strong(frame.children),
                        _ => Inline::Emphasis(frame.children),
                    };

                    let leftover = olen - take;
                    if leftover > 0 {
                        stack.push(Frame {
                            delim: Some((ch, leftover)),
                            children: vec![node],
                        });
                    } else {
                        stack.last_mut().unwrap().children.push(node);
                    }

                    remaining -= take;
                }

                if remaining > 0 {
                    if can_open {
                        stack.push(Frame {
                            delim: Some((ch, remaining)),
                            children: vec![],
                        });
                    } else {
                        stack
                            .last_mut()
                            .unwrap()
                            .children
                            .push(Inline::Text(std::iter::repeat_n(ch, remaining).collect()));
                    }
                }
            },
        }
    }

    demote_above(&mut stack, 0);
    stack.pop().unwrap().children
}

/// Collapse every frame above `fi` into its parent: the unclosed delimiter
/// becomes literal text, its children splice through — content is never
/// dropped.
fn demote_above(stack: &mut Vec<Frame>, fi: usize) {
    while stack.len() - 1 > fi {
        let frame = stack.pop().unwrap();
        let parent = stack.last_mut().unwrap();
        if let Some((ch, len)) = frame.delim {
            parent
                .children
                .push(Inline::Text(std::iter::repeat_n(ch, len).collect()));
        }

        parent.children.extend(frame.children);
    }
}

fn emit(nodes: Vec<Inline>, events: &mut Vec<Event>) {
    for node in nodes {
        match node {
            Inline::Text(text) => events.push(Event::Text(text)),
            Inline::Code(text) => events.push(Event::Code(text)),
            Inline::SoftBreak => events.push(Event::SoftBreak),
            Inline::HardBreak => events.push(Event::HardBreak),
            Inline::Emphasis(children) => wrap(Tag::Emphasis, children, events),
            Inline::Strong(children) => wrap(Tag::Strong, children, events),
            Inline::Strikethrough(children) => wrap(Tag::Strikethrough, children, events),
            Inline::Link {
                dest_url,
                title,
                children,
            } => wrap(Tag::Link { dest_url, title }, children, events),
            Inline::Image { dest_url, children } => wrap(Tag::Image { dest_url }, children, events),
        }
    }
}

fn wrap(tag: Tag, children: Vec<Inline>, events: &mut Vec<Event>) {
    events.push(Event::Start(tag));
    emit(children, events);
    events.push(Event::End);
}

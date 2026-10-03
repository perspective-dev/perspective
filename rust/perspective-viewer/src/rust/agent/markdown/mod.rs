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

mod block;
mod entity;
mod events;
mod inline;

use events::{Align, Event, Tag};
use yew::virtual_dom::{VNode, VTag, VText};
use yew::{Html, html};

/// Render one chat message's markdown as a Yew tree.
pub fn render_markdown(text: &str) -> Html {
    let mut writer = Writer::default();
    for event in block::parse(text) {
        match event {
            Event::Start(tag) => writer.start(tag),
            Event::End => writer.end(),
            event => writer.leaf(event),
        }
    }

    while !writer.stack.is_empty() {
        writer.end();
    }

    html! { <>{ for writer.root.into_iter() }</> }
}

fn is_allowed_url(url: &str) -> bool {
    let url = url.trim().to_ascii_lowercase();
    url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:")
}

fn heading_name(level: u8) -> &'static str {
    match level {
        1 => "h1",
        2 => "h2",
        3 => "h3",
        4 => "h4",
        5 => "h5",
        _ => "h6",
    }
}

fn align_class(align: &Align) -> Option<&'static str> {
    match align {
        Align::None => None,
        Align::Left => Some("chat-md-align-left"),
        Align::Center => Some("chat-md-align-center"),
        Align::Right => Some("chat-md-align-right"),
    }
}

fn external_link(dest_url: &str) -> VTag {
    let mut anchor = VTag::new("a");
    anchor.add_attribute("href", dest_url.to_string());
    anchor.add_attribute("target", "_blank");
    anchor.add_attribute("rel", "noopener noreferrer");
    anchor
}

enum Frame {
    Node(VTag),
    Pre(VTag),
    HeadRow(VTag),
    Transparent(Vec<VNode>),
    Image {
        dest_url: String,
        children: Vec<VNode>,
    },
}

#[derive(Default)]
struct Writer {
    stack: Vec<Frame>,
    root: Vec<VNode>,
    aligns: Vec<Align>,
    in_head: bool,
    cell_idx: usize,
}

impl Writer {
    fn start(&mut self, tag: Tag) {
        let frame = match tag {
            Tag::Paragraph => Frame::Node(VTag::new("p")),
            Tag::Heading(level) => Frame::Node(VTag::new(heading_name(level))),
            Tag::BlockQuote => Frame::Node(VTag::new("blockquote")),
            Tag::CodeBlock(lang) => {
                let mut code = VTag::new("code");
                if let Some(lang) = lang
                    && !lang.is_empty()
                {
                    code.add_attribute("data-lang", lang);
                }

                Frame::Pre(code)
            },
            Tag::List(None) => Frame::Node(VTag::new("ul")),
            Tag::List(Some(start)) => {
                let mut list = VTag::new("ol");
                if start != 1 {
                    list.add_attribute("start", start.to_string());
                }

                Frame::Node(list)
            },
            Tag::Item => Frame::Node(VTag::new("li")),
            Tag::Emphasis => Frame::Node(VTag::new("em")),
            Tag::Strong => Frame::Node(VTag::new("strong")),
            Tag::Strikethrough => Frame::Node(VTag::new("del")),
            Tag::Link { dest_url, title } if is_allowed_url(&dest_url) => {
                let mut anchor = external_link(&dest_url);
                if !title.is_empty() {
                    anchor.add_attribute("title", title);
                }

                Frame::Node(anchor)
            },
            Tag::Link { .. } => Frame::Transparent(vec![]),
            Tag::Image { dest_url } => Frame::Image {
                dest_url,
                children: vec![],
            },
            Tag::Table(aligns) => {
                self.aligns = aligns;
                Frame::Node(VTag::new("table"))
            },
            Tag::TableHead => {
                self.in_head = true;
                self.cell_idx = 0;
                Frame::HeadRow(VTag::new("tr"))
            },
            Tag::TableRow => {
                self.cell_idx = 0;
                Frame::Node(VTag::new("tr"))
            },
            Tag::TableCell => {
                let mut cell = VTag::new(if self.in_head { "th" } else { "td" });
                if let Some(class) = self.aligns.get(self.cell_idx).and_then(align_class) {
                    cell.add_attribute("class", class);
                }

                self.cell_idx += 1;
                Frame::Node(cell)
            },
        };

        self.stack.push(frame);
    }

    fn end(&mut self) {
        match self.stack.pop() {
            Some(Frame::Node(tag)) => self.append(tag.into()),
            Some(Frame::Pre(code)) => {
                let mut pre = VTag::new("pre");

                // Code blocks scroll horizontally (`viewer.css`), so they
                // opt into the viewer's scrollbar styling like every
                // other scroller in the shadow root.
                pre.add_attribute("class", "scrollable");
                pre.add_child(code.into());
                self.append(pre.into());
            },
            Some(Frame::HeadRow(row)) => {
                self.in_head = false;
                let mut head = VTag::new("thead");
                head.add_child(row.into());
                self.append(head.into());
            },
            Some(Frame::Transparent(children)) => {
                for child in children {
                    self.append(child);
                }
            },
            Some(Frame::Image { dest_url, children }) => {
                let mut alt = VTag::new("span");
                alt.add_attribute("class", "chat-md-image");
                for child in children {
                    alt.add_child(child);
                }

                self.append(alt.into());
                if is_allowed_url(&dest_url) {
                    let mut anchor = external_link(&dest_url);
                    anchor.add_child(VText::new(" (image)").into());
                    self.append(anchor.into());
                }
            },
            None => (),
        }
    }

    fn leaf(&mut self, event: Event) {
        match event {
            Event::Text(text) => self.append(VText::new(text).into()),
            Event::Code(text) => {
                let mut code = VTag::new("code");
                code.add_child(VText::new(text).into());
                self.append(code.into());
            },
            Event::SoftBreak => self.append(VText::new(" ").into()),
            Event::HardBreak => self.append(VTag::new("br").into()),
            Event::Rule => self.append(VTag::new("hr").into()),
            Event::Start(_) | Event::End => (),
        }
    }

    fn append(&mut self, node: VNode) {
        match self.stack.last_mut() {
            Some(Frame::Node(tag) | Frame::Pre(tag) | Frame::HeadRow(tag)) => tag.add_child(node),
            Some(Frame::Transparent(children) | Frame::Image { children, .. }) => {
                children.push(node)
            },
            None => self.root.push(node),
        }
    }
}

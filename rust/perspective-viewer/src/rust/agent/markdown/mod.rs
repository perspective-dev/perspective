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

#[cfg(test)]
mod tests {
    use super::events::{Align, Event, Tag};

    fn parse(text: &str) -> Vec<Event> {
        super::block::parse(text)
    }

    fn start(tag: Tag) -> Event {
        Event::Start(tag)
    }

    fn text(x: &str) -> Event {
        Event::Text(x.to_owned())
    }

    #[test]
    fn paragraph_and_emphasis() {
        assert_eq!(parse("**Done!** Key *stats* here."), vec![
            start(Tag::Paragraph),
            start(Tag::Strong),
            text("Done!"),
            Event::End,
            text(" Key "),
            start(Tag::Emphasis),
            text("stats"),
            Event::End,
            text(" here."),
            Event::End,
        ]);
    }

    #[test]
    fn snake_case_is_not_emphasis() {
        assert_eq!(parse("call get_schema then set_view_config"), vec![
            start(Tag::Paragraph),
            text("call get_schema then set_view_config"),
            Event::End,
        ]);
    }

    #[test]
    fn nested_strong_emphasis() {
        assert_eq!(parse("**bold with *ital* inside**"), vec![
            start(Tag::Paragraph),
            start(Tag::Strong),
            text("bold with "),
            start(Tag::Emphasis),
            text("ital"),
            Event::End,
            text(" inside"),
            Event::End,
            Event::End,
        ]);
    }

    #[test]
    fn unpaired_delimiters_stay_literal() {
        // Space on both sides ⇒ the runs can neither open nor close, so
        // they stay in the running text buffer.
        assert_eq!(parse("2 * 3 * 4 and a ~ tilde"), vec![
            start(Tag::Paragraph),
            text("2 * 3 * 4 and a ~ tilde"),
            Event::End,
        ]);
    }

    #[test]
    fn code_spans_and_strikethrough() {
        assert_eq!(parse("run `pnpm test` and ~~skip~~ this"), vec![
            start(Tag::Paragraph),
            text("run "),
            Event::Code("pnpm test".to_owned()),
            text(" and "),
            start(Tag::Strikethrough),
            text("skip"),
            Event::End,
            text(" this"),
            Event::End,
        ]);
    }

    #[test]
    fn heading_rule_and_fence() {
        assert_eq!(parse("## Stats\n\n---\n\n```sql\nSELECT 1;\n```"), vec![
            start(Tag::Heading(2)),
            text("Stats"),
            Event::End,
            Event::Rule,
            start(Tag::CodeBlock(Some("sql".to_owned()))),
            text("SELECT 1;\n"),
            Event::End,
        ]);
    }

    #[test]
    fn nested_list_with_code_block_in_item() {
        assert_eq!(
            parse("- first\n- second:\n  ```\n  x = 1\n  ```\n  - inner"),
            vec![
                start(Tag::List(None)),
                start(Tag::Item),
                text("first"),
                Event::End,
                start(Tag::Item),
                text("second:"),
                start(Tag::CodeBlock(None)),
                text("x = 1\n"),
                Event::End,
                start(Tag::List(None)),
                start(Tag::Item),
                text("inner"),
                Event::End,
                Event::End,
                Event::End,
                Event::End,
            ]
        );
    }

    #[test]
    fn ordered_list_start() {
        assert_eq!(parse("3. three\n4. four"), vec![
            start(Tag::List(Some(3))),
            start(Tag::Item),
            text("three"),
            Event::End,
            start(Tag::Item),
            text("four"),
            Event::End,
            Event::End,
        ]);
    }

    #[test]
    fn table_with_alignment_and_pipe_in_code() {
        assert_eq!(
            parse("| Region | Sales |\n| :--- | ---: |\n| West | `a\\|b` |"),
            vec![
                start(Tag::Table(vec![Align::Left, Align::Right])),
                start(Tag::TableHead),
                start(Tag::TableCell),
                text("Region"),
                Event::End,
                start(Tag::TableCell),
                text("Sales"),
                Event::End,
                Event::End,
                start(Tag::TableRow),
                start(Tag::TableCell),
                text("West"),
                Event::End,
                start(Tag::TableCell),
                Event::Code("a|b".to_owned()),
                Event::End,
                Event::End,
                Event::End,
            ]
        );
    }

    #[test]
    fn dashes_after_paragraph_are_a_rule_not_a_table() {
        assert_eq!(parse("Title\n---"), vec![
            start(Tag::Paragraph),
            text("Title"),
            Event::End,
            Event::Rule,
        ]);
    }

    #[test]
    fn links_images_and_autolinks() {
        assert_eq!(
            parse("[safe](https://example.com \"hi\") ![leak](https://example.com/x.png) <https://a.co>"),
            vec![
                start(Tag::Paragraph),
                start(Tag::Link {
                    dest_url: "https://example.com".to_owned(),
                    title: "hi".to_owned(),
                }),
                text("safe"),
                Event::End,
                text(" "),
                start(Tag::Image {
                    dest_url: "https://example.com/x.png".to_owned(),
                }),
                text("leak"),
                Event::End,
                text(" "),
                start(Tag::Link {
                    dest_url: "https://a.co".to_owned(),
                    title: String::new(),
                }),
                text("https://a.co"),
                Event::End,
                Event::End,
            ]
        );
    }

    #[test]
    fn raw_html_is_literal_text() {
        assert_eq!(parse("<script>alert(1)</script>"), vec![
            start(Tag::Paragraph),
            text("<script>alert(1)</script>"),
            Event::End,
        ]);
    }

    #[test]
    fn blockquote_and_breaks() {
        assert_eq!(parse("> quoted\n> more\n\nafter  \nbreak"), vec![
            start(Tag::BlockQuote),
            start(Tag::Paragraph),
            text("quoted"),
            Event::SoftBreak,
            text("more"),
            Event::End,
            Event::End,
            start(Tag::Paragraph),
            text("after"),
            Event::HardBreak,
            text("break"),
            Event::End,
        ]);
    }

    #[test]
    fn entities_decode_or_stay_literal() {
        assert_eq!(parse("a &amp; b &#65; &unknown; c"), vec![
            start(Tag::Paragraph),
            text("a & b A &unknown; c"),
            Event::End,
        ]);
    }
}

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

pub(crate) struct Color {
    pub hex: String,
    pub had_alpha: bool,
}

pub(crate) fn normalize(src: &str) -> Option<Color> {
    let src = src.trim().to_ascii_lowercase();
    if let Some(hex) = src.strip_prefix('#') {
        return parse_hex(hex);
    }

    if let Some((_, hex)) = NAMED.iter().find(|(name, _)| *name == src) {
        return Some(Color {
            hex: format!("#{hex}"),
            had_alpha: false,
        });
    }

    let body = src
        .strip_prefix("rgba(")
        .or_else(|| src.strip_prefix("rgb("))?
        .strip_suffix(')')?;

    let (channels, alpha) = match body.split_once('/') {
        Some((channels, alpha)) => (channels, Some(alpha)),
        None => (body, None),
    };

    let tokens = channels
        .split(|c: char| c == ',' || c.is_whitespace())
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>();

    let (rgb, alpha) = match (tokens.as_slice(), alpha) {
        ([r, g, b], alpha) => ([*r, *g, *b], alpha.map(str::trim)),
        ([r, g, b, a], None) => ([*r, *g, *b], Some(*a)),
        _ => return None,
    };

    let [r, g, b] = [channel(rgb[0])?, channel(rgb[1])?, channel(rgb[2])?];
    Some(Color {
        hex: format!("#{r:02x}{g:02x}{b:02x}"),
        had_alpha: alpha.is_some_and(|a| !is_opaque(a)),
    })
}

fn parse_hex(hex: &str) -> Option<Color> {
    let digit = |i: usize, n: usize| u8::from_str_radix(hex.get(i..i + n)?, 16).ok();
    let (r, g, b) = match hex.len() {
        3 | 4 => (digit(0, 1)? * 17, digit(1, 1)? * 17, digit(2, 1)? * 17),
        6 | 8 => (digit(0, 2)?, digit(2, 2)?, digit(4, 2)?),
        _ => return None,
    };

    let had_alpha = match hex.len() {
        4 => digit(3, 1)? != 15,
        8 => digit(6, 2)? != 255,
        _ => false,
    };

    Some(Color {
        hex: format!("#{r:02x}{g:02x}{b:02x}"),
        had_alpha,
    })
}

fn channel(token: &str) -> Option<u8> {
    let value = match token.strip_suffix('%') {
        Some(pct) => pct.parse::<f64>().ok()? / 100.0 * 255.0,
        None => token.parse::<f64>().ok()?,
    };

    Some(value.round().clamp(0.0, 255.0) as u8)
}

fn is_opaque(alpha: &str) -> bool {
    match alpha.strip_suffix('%') {
        Some(pct) => pct.parse::<f64>().is_ok_and(|x| x >= 100.0),
        None => alpha.parse::<f64>().is_ok_and(|x| x >= 1.0),
    }
}

const NAMED: &[(&str, &str)] = &[
    ("aliceblue", "f0f8ff"),
    ("antiquewhite", "faebd7"),
    ("aqua", "00ffff"),
    ("aquamarine", "7fffd4"),
    ("azure", "f0ffff"),
    ("beige", "f5f5dc"),
    ("bisque", "ffe4c4"),
    ("black", "000000"),
    ("blanchedalmond", "ffebcd"),
    ("blue", "0000ff"),
    ("blueviolet", "8a2be2"),
    ("brown", "a52a2a"),
    ("burlywood", "deb887"),
    ("cadetblue", "5f9ea0"),
    ("chartreuse", "7fff00"),
    ("chocolate", "d2691e"),
    ("coral", "ff7f50"),
    ("cornflowerblue", "6495ed"),
    ("cornsilk", "fff8dc"),
    ("crimson", "dc143c"),
    ("cyan", "00ffff"),
    ("darkblue", "00008b"),
    ("darkcyan", "008b8b"),
    ("darkgoldenrod", "b8860b"),
    ("darkgray", "a9a9a9"),
    ("darkgreen", "006400"),
    ("darkgrey", "a9a9a9"),
    ("darkkhaki", "bdb76b"),
    ("darkmagenta", "8b008b"),
    ("darkolivegreen", "556b2f"),
    ("darkorange", "ff8c00"),
    ("darkorchid", "9932cc"),
    ("darkred", "8b0000"),
    ("darksalmon", "e9967a"),
    ("darkseagreen", "8fbc8f"),
    ("darkslateblue", "483d8b"),
    ("darkslategray", "2f4f4f"),
    ("darkslategrey", "2f4f4f"),
    ("darkturquoise", "00ced1"),
    ("darkviolet", "9400d3"),
    ("deeppink", "ff1493"),
    ("deepskyblue", "00bfff"),
    ("dimgray", "696969"),
    ("dimgrey", "696969"),
    ("dodgerblue", "1e90ff"),
    ("firebrick", "b22222"),
    ("floralwhite", "fffaf0"),
    ("forestgreen", "228b22"),
    ("fuchsia", "ff00ff"),
    ("gainsboro", "dcdcdc"),
    ("ghostwhite", "f8f8ff"),
    ("gold", "ffd700"),
    ("goldenrod", "daa520"),
    ("gray", "808080"),
    ("green", "008000"),
    ("greenyellow", "adff2f"),
    ("grey", "808080"),
    ("honeydew", "f0fff0"),
    ("hotpink", "ff69b4"),
    ("indianred", "cd5c5c"),
    ("indigo", "4b0082"),
    ("ivory", "fffff0"),
    ("khaki", "f0e68c"),
    ("lavender", "e6e6fa"),
    ("lavenderblush", "fff0f5"),
    ("lawngreen", "7cfc00"),
    ("lemonchiffon", "fffacd"),
    ("lightblue", "add8e6"),
    ("lightcoral", "f08080"),
    ("lightcyan", "e0ffff"),
    ("lightgoldenrodyellow", "fafad2"),
    ("lightgray", "d3d3d3"),
    ("lightgreen", "90ee90"),
    ("lightgrey", "d3d3d3"),
    ("lightpink", "ffb6c1"),
    ("lightsalmon", "ffa07a"),
    ("lightseagreen", "20b2aa"),
    ("lightskyblue", "87cefa"),
    ("lightslategray", "778899"),
    ("lightslategrey", "778899"),
    ("lightsteelblue", "b0c4de"),
    ("lightyellow", "ffffe0"),
    ("lime", "00ff00"),
    ("limegreen", "32cd32"),
    ("linen", "faf0e6"),
    ("magenta", "ff00ff"),
    ("maroon", "800000"),
    ("mediumaquamarine", "66cdaa"),
    ("mediumblue", "0000cd"),
    ("mediumorchid", "ba55d3"),
    ("mediumpurple", "9370db"),
    ("mediumseagreen", "3cb371"),
    ("mediumslateblue", "7b68ee"),
    ("mediumspringgreen", "00fa9a"),
    ("mediumturquoise", "48d1cc"),
    ("mediumvioletred", "c71585"),
    ("midnightblue", "191970"),
    ("mintcream", "f5fffa"),
    ("mistyrose", "ffe4e1"),
    ("moccasin", "ffe4b5"),
    ("navajowhite", "ffdead"),
    ("navy", "000080"),
    ("oldlace", "fdf5e6"),
    ("olive", "808000"),
    ("olivedrab", "6b8e23"),
    ("orange", "ffa500"),
    ("orangered", "ff4500"),
    ("orchid", "da70d6"),
    ("palegoldenrod", "eee8aa"),
    ("palegreen", "98fb98"),
    ("paleturquoise", "afeeee"),
    ("palevioletred", "db7093"),
    ("papayawhip", "ffefd5"),
    ("peachpuff", "ffdab9"),
    ("peru", "cd853f"),
    ("pink", "ffc0cb"),
    ("plum", "dda0dd"),
    ("powderblue", "b0e0e6"),
    ("purple", "800080"),
    ("rebeccapurple", "663399"),
    ("red", "ff0000"),
    ("rosybrown", "bc8f8f"),
    ("royalblue", "4169e1"),
    ("saddlebrown", "8b4513"),
    ("salmon", "fa8072"),
    ("sandybrown", "f4a460"),
    ("seagreen", "2e8b57"),
    ("seashell", "fff5ee"),
    ("sienna", "a0522d"),
    ("silver", "c0c0c0"),
    ("skyblue", "87ceeb"),
    ("slateblue", "6a5acd"),
    ("slategray", "708090"),
    ("slategrey", "708090"),
    ("snow", "fffafa"),
    ("springgreen", "00ff7f"),
    ("steelblue", "4682b4"),
    ("tan", "d2b48c"),
    ("teal", "008080"),
    ("thistle", "d8bfd8"),
    ("tomato", "ff6347"),
    ("turquoise", "40e0d0"),
    ("violet", "ee82ee"),
    ("wheat", "f5deb3"),
    ("white", "ffffff"),
    ("whitesmoke", "f5f5f5"),
    ("yellow", "ffff00"),
    ("yellowgreen", "9acd32"),
];

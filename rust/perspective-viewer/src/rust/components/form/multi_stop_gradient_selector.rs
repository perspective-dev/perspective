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

use itertools::Itertools;
use wasm_bindgen::JsCast;
use web_sys::*;
use yew::prelude::*;

use crate::config::{GradientStopSpec, canonicalize_gradient_stops};

/// The widget for [`crate::config::ControlSpec::GradientStops`]: a
/// horizontal gradient preview bar with one handle per stop.
#[derive(Properties, PartialEq)]
pub struct MultiStopGradientProps {
    pub stops: Vec<GradientStopSpec>,
    pub on_change: Callback<Vec<GradientStopSpec>>,
    pub on_reset: Callback<()>,
    pub is_modified: bool,

    #[prop_or_default]
    pub discrete: bool,

    #[prop_or_default]
    pub title: Option<String>,
}

fn event_index(target: &Element) -> Option<usize> {
    target
        .get_attribute("data-index")
        .and_then(|x| x.parse::<usize>().ok())
}

fn parse_hex_color(color: &str) -> Option<(f64, f64, f64)> {
    let hex = color.strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }

    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some((r as f64, g as f64, b as f64))
}

pub(crate) fn sample_gradient_hex(stops: &[GradientStopSpec], t: f64) -> String {
    let Some(first) = stops.first() else {
        return "#000000".to_owned();
    };

    if t <= first.offset {
        return first.color.clone();
    }

    let last = stops.last().unwrap();
    if t >= last.offset {
        return last.color.clone();
    }

    for pair in stops.windows(2) {
        let (a, b) = (&pair[0], &pair[1]);
        if t > b.offset {
            continue;
        }

        let span = b.offset - a.offset;
        let u = if span > 0.0 {
            (t - a.offset) / span
        } else {
            0.0
        };
        let nearer = if u < 0.5 { a } else { b };
        let (Some((ar, ag, ab)), Some((br, bg, bb))) =
            (parse_hex_color(&a.color), parse_hex_color(&b.color))
        else {
            return nearer.color.clone();
        };

        let scale = |x: f64, y: f64| ((x + (y - x) * u).round().clamp(0.0, 255.0)) as u8;
        return format!(
            "#{:02x}{:02x}{:02x}",
            scale(ar, br),
            scale(ag, bg),
            scale(ab, bb)
        );
    }

    last.color.clone()
}

const EDGE_PAD_PX: f64 = 8.0;

fn track_position(offset: f64) -> String {
    format!(
        "calc({EDGE_PAD_PX}px + (100% - {:.0}px) * {offset:.4})",
        EDGE_PAD_PX * 2.0
    )
}

fn css_gradient(stops: &[GradientStopSpec]) -> String {
    let body = stops
        .iter()
        .sorted_by(|a, b| {
            a.offset
                .partial_cmp(&b.offset)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|stop| format!("{} {}", stop.color, track_position(stop.offset)))
        .join(", ");

    format!("background:linear-gradient(to right, {body})")
}

fn equalized_offset(stops: &[GradientStopSpec], index: usize) -> f64 {
    let left = if index == 0 {
        0.0
    } else {
        stops[index - 1].offset
    };

    let right = if index + 1 < stops.len() {
        stops[index + 1].offset
    } else {
        1.0
    };

    (left + right) / 2.0
}

fn offset_from_pointer(bar: &Option<Element>, client_x: i32) -> Option<f64> {
    let rect = bar.as_ref()?.get_bounding_client_rect();
    let track_width = rect.width() - 2.0 * EDGE_PAD_PX;
    if track_width <= 0.0 {
        return None;
    }

    Some(((client_x as f64 - rect.left() - EDGE_PAD_PX) / track_width).clamp(0.0, 1.0))
}

#[function_component(MultiStopGradientSelector)]
pub fn multi_stop_gradient_selector(props: &MultiStopGradientProps) -> Html {
    let bar_ref = use_node_ref();

    let drag = use_state(|| Option::<(usize, f64)>::None);

    let display = {
        let mut stops = props.stops.clone();
        if let Some((index, offset)) = *drag
            && let Some(stop) = stops.get_mut(index)
        {
            stop.offset = offset;
        }

        stops
    };

    let on_color = use_callback(
        (props.stops.clone(), props.on_change.clone()),
        |event: InputEvent, (stops, on_change)| {
            let input = event.target().unwrap().unchecked_into::<HtmlInputElement>();

            let Some(index) = event_index(&input) else {
                return;
            };

            let mut next = stops.clone();
            let Some(stop) = next.get_mut(index) else {
                return;
            };

            stop.color = input.value();
            on_change.emit(canonicalize_gradient_stops(next));
        },
    );

    let on_pointerdown = {
        let drag = drag.clone();
        let stops = props.stops.clone();
        Callback::from(move |event: PointerEvent| {
            let Some(target) = event.target().and_then(|x| x.dyn_into::<Element>().ok()) else {
                return;
            };

            let Some(index) = event_index(&target) else {
                return;
            };

            let Some(stop) = stops.get(index) else {
                return;
            };

            let _ = target.set_pointer_capture(event.pointer_id());
            drag.set(Some((index, stop.offset)));
        })
    };

    let on_pointermove = {
        let drag = drag.clone();
        let bar_ref = bar_ref.clone();
        Callback::from(move |event: PointerEvent| {
            let Some((index, _)) = *drag else {
                return;
            };

            let Some(offset) = offset_from_pointer(&bar_ref.cast::<Element>(), event.client_x())
            else {
                return;
            };

            drag.set(Some((index, offset)));
        })
    };

    let on_pointerup = {
        let drag = drag.clone();
        let bar_ref = bar_ref.clone();
        let stops = props.stops.clone();
        let on_change = props.on_change.clone();
        Callback::from(move |event: PointerEvent| {
            let Some((index, offset)) = *drag else {
                return;
            };

            let offset =
                offset_from_pointer(&bar_ref.cast::<Element>(), event.client_x()).unwrap_or(offset);

            drag.set(None);

            let unchanged = stops
                .get(index)
                .map(|stop| (stop.offset * 1000.0).round() == (offset * 1000.0).round())
                .unwrap_or(true);

            if unchanged {
                return;
            }

            let mut next = stops.clone();
            if let Some(stop) = next.get_mut(index) {
                stop.offset = offset;
            }

            on_change.emit(canonicalize_gradient_stops(next));
        })
    };

    let on_grip_dblclick = use_callback(
        (props.stops.clone(), props.on_change.clone()),
        |event: MouseEvent, (stops, on_change)| {
            event.stop_propagation();
            let Some(target) = event.target().and_then(|x| x.dyn_into::<Element>().ok()) else {
                return;
            };

            let Some(index) = event_index(&target) else {
                return;
            };

            if index >= stops.len() {
                return;
            }

            let mut next = stops.clone();
            next[index].offset = equalized_offset(stops, index);
            on_change.emit(canonicalize_gradient_stops(next));
        },
    );

    let on_remove = use_callback(
        (props.stops.clone(), props.on_change.clone()),
        |event: MouseEvent, (stops, on_change)| {
            let Some(target) = event.target().and_then(|x| x.dyn_into::<Element>().ok()) else {
                return;
            };

            let Some(index) = event_index(&target) else {
                return;
            };

            if stops.len() > 2 && index < stops.len() {
                let mut next = stops.clone();
                next.remove(index);
                on_change.emit(canonicalize_gradient_stops(next));
            }
        },
    );

    let can_add = !props.discrete;

    let on_dblclick = {
        let bar_ref = bar_ref.clone();
        let stops = props.stops.clone();
        let on_change = props.on_change.clone();
        Callback::from(move |event: MouseEvent| {
            if !can_add {
                return;
            }

            let Some(bar) = bar_ref.cast::<Element>() else {
                return;
            };

            if event.target() != Some(bar.clone().unchecked_into()) {
                return;
            }

            let Some(offset) = offset_from_pointer(&Some(bar), event.client_x()) else {
                return;
            };

            let mut next = stops.clone();
            next.push(GradientStopSpec {
                color: sample_gradient_hex(&next, offset),
                offset,
            });

            on_change.emit(canonicalize_gradient_stops(next));
        })
    };

    let on_reset = use_callback(props.on_reset.clone(), |_: MouseEvent, on_reset| {
        on_reset.emit(())
    });

    let can_remove = props.stops.len() > 2;
    let can_drag = !props.discrete;
    let pinned = props.discrete && !can_remove;
    html! {
        <>
            <label id={props.title.as_deref().unwrap_or("gradient-label").to_owned()} />
            <div class="color-gradient-container gradient-stops-selector">
                <div
                    class={if props.discrete {"gradient-stops-bar discrete"} else {"gradient-stops-bar"}}
                    ref={bar_ref}
                    style={css_gradient(&display)}
                    onclick={on_dblclick}
                >
                    { for display.iter().enumerate().map(|(index, stop)| html! {
                        <div
                            class="gradient-stop-handle"
                            key={index.to_string()}
                            style={format!("left:{}", track_position(stop.offset))}
                        >
                            <span
                                class={classes!("gradient-stop-grip", (!can_drag).then_some("disabled"))}
                                data-index={index.to_string()}
                                onpointerdown={can_drag.then(|| on_pointerdown.clone())}
                                onpointermove={can_drag.then(|| on_pointermove.clone())}
                                onpointerup={can_drag.then(|| on_pointerup.clone())}
                                ondblclick={can_drag.then(|| on_grip_dblclick.clone())}
                            />
                            if pinned {
                                <span class="gradient-stop-lock" />
                            } else {
                                <span
                                    class={classes!("gradient-stop-remove", (!can_remove).then_some("disabled"))}
                                    data-index={index.to_string()}
                                    onclick={can_remove.then(|| on_remove.clone())}
                                />
                            }
                            <input
                                class="parameter"
                                type="color"
                                value={stop.color.to_owned()}
                                data-index={index.to_string()}
                                oninput={on_color.clone()}
                            />
                        </div>
                    }) }
                </div>
                if props.is_modified {
                    <span class="reset-default-style" onclick={on_reset} />
                } else {
                    <span class="reset-default-style-disabled" />
                }
            </div>
        </>
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stop(color: &str, offset: f64) -> GradientStopSpec {
        GradientStopSpec {
            color: color.to_owned(),
            offset,
        }
    }

    #[test]
    fn sample_clamps_outside_stop_range() {
        let stops = vec![stop("#000000", 0.25), stop("#ff0000", 0.75)];
        assert_eq!(sample_gradient_hex(&stops, 0.0), "#000000");
        assert_eq!(sample_gradient_hex(&stops, 1.0), "#ff0000");
    }

    #[test]
    fn sample_interpolates_linearly() {
        let stops = vec![stop("#000000", 0.0), stop("#ff0000", 1.0)];
        assert_eq!(sample_gradient_hex(&stops, 0.5), "#800000");

        let stops = vec![
            stop("#000000", 0.0),
            stop("#ffffff", 0.5),
            stop("#ff0000", 1.0),
        ];

        assert_eq!(sample_gradient_hex(&stops, 0.25), "#808080");
        assert_eq!(sample_gradient_hex(&stops, 0.75), "#ff8080");
    }

    #[test]
    fn track_positions_pad_the_bar_edges() {
        assert_eq!(track_position(0.0), "calc(8px + (100% - 16px) * 0.0000)");
        assert_eq!(track_position(1.0), "calc(8px + (100% - 16px) * 1.0000)");
        assert_eq!(track_position(0.333), "calc(8px + (100% - 16px) * 0.3330)");
    }

    #[test]
    fn gradient_interpolates_on_padded_track() {
        let stops = vec![
            stop("#333333", 1.0),
            stop("#111111", 0.0),
            stop("#222222", 0.5),
        ];

        assert_eq!(
            css_gradient(&stops),
            format!(
                "background:linear-gradient(to right, #111111 {}, #222222 {}, #333333 {})",
                track_position(0.0),
                track_position(0.5),
                track_position(1.0)
            )
        );
    }

    #[test]
    fn equalize_centers_between_neighbors_or_edges() {
        let stops = vec![
            stop("#111111", 0.2),
            stop("#222222", 0.25),
            stop("#333333", 0.4),
        ];

        assert_eq!(equalized_offset(&stops, 1), (0.2 + 0.4) / 2.0);

        assert_eq!(equalized_offset(&stops, 0), 0.125);
        assert_eq!(equalized_offset(&stops, 2), (0.25 + 1.0) / 2.0);

        let single = vec![stop("#111111", 0.9)];
        assert_eq!(equalized_offset(&single, 0), 0.5);
    }

    #[test]
    fn sample_degenerate_cases() {
        assert_eq!(sample_gradient_hex(&[], 0.5), "#000000");
        let stops = vec![stop("#123456", 0.5)];
        assert_eq!(sample_gradient_hex(&stops, 0.1), "#123456");
        assert_eq!(sample_gradient_hex(&stops, 0.9), "#123456");

        let stops = vec![stop("red", 0.0), stop("blue", 1.0)];
        assert_eq!(sample_gradient_hex(&stops, 0.25), "red");
        assert_eq!(sample_gradient_hex(&stops, 0.75), "blue");
    }
}

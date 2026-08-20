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

use wasm_bindgen::JsCast;
use web_sys::*;
use yew::prelude::*;

/// The widget for [`crate::config::ControlSpec::Palette`]: an ordered row
/// of discrete color swatches with per-swatch edit/remove, pointer-drag
/// reordering, and a trailing add tile.
#[derive(Properties, PartialEq)]
pub struct PaletteProps {
    pub values: Vec<String>,
    pub on_change: Callback<Vec<String>>,
    pub on_reset: Callback<()>,
    pub is_modified: bool,

    #[prop_or_default]
    pub max: Option<usize>,

    #[prop_or_default]
    pub title: Option<String>,
}

const DRAG_THRESHOLD_PX: f64 = 4.0;

#[derive(Clone, Copy)]
struct Press {
    pointer_id: i32,
    x: i32,
    y: i32,
    from: usize,
}

fn event_index(target: &Element) -> Option<usize> {
    target
        .get_attribute("data-index")
        .and_then(|x| x.parse::<usize>().ok())
}

fn insertion_index(centers: &[(f64, f64)], x: f64, y: f64) -> usize {
    let nearest = centers
        .iter()
        .enumerate()
        .min_by(|(_, a), (_, b)| {
            let da = (a.0 - x).hypot(a.1 - y);
            let db = (b.0 - x).hypot(b.1 - y);
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(index, _)| index);

    match nearest {
        Some(index) if x < centers[index].0 => index,
        Some(index) => index + 1,
        None => 0,
    }
}

fn reordered<T: Clone>(values: &[T], from: usize, insert: usize) -> Option<Vec<T>> {
    if from >= values.len() || insert > values.len() || insert == from || insert == from + 1 {
        return None;
    }

    let mut next = values.to_vec();
    let color = next.remove(from);
    let at = if insert > from { insert - 1 } else { insert };
    next.insert(at, color);
    Some(next)
}

fn slot_from_display(slot: usize, shown_at: usize, from: usize) -> usize {
    let shown = if slot > shown_at { slot - 1 } else { slot };
    match shown.cmp(&from) {
        std::cmp::Ordering::Less => shown,
        std::cmp::Ordering::Greater => shown + 1,
        std::cmp::Ordering::Equal => from,
    }
}

fn swatch_centers(container: &Element) -> Vec<(f64, f64, usize)> {
    let Ok(nodes) = container.query_selector_all(".palette-swatch") else {
        return vec![];
    };

    (0..nodes.length())
        .filter_map(|i| nodes.get(i))
        .filter_map(|node| node.dyn_into::<Element>().ok())
        .filter_map(|el| {
            let index = event_index(&el)?;
            let rect = el.get_bounding_client_rect();
            Some((
                rect.left() + rect.width() / 2.0,
                rect.top() + rect.height() / 2.0,
                index,
            ))
        })
        .collect()
}

#[function_component(PaletteSelector)]
pub fn palette_selector(props: &PaletteProps) -> Html {
    let oninput = use_callback(
        (props.values.clone(), props.on_change.clone()),
        |event: InputEvent, (values, on_change)| {
            let input = event.target().unwrap().unchecked_into::<HtmlInputElement>();

            let Some(index) = event_index(&input) else {
                return;
            };

            let mut next = values.clone();
            let Some(slot) = next.get_mut(index) else {
                return;
            };

            *slot = input.value();
            on_change.emit(next);
        },
    );

    let on_remove = use_callback(
        (props.values.clone(), props.on_change.clone()),
        |event: MouseEvent, (values, on_change)| {
            let Some(target) = event.target().and_then(|x| x.dyn_into::<Element>().ok()) else {
                return;
            };

            let Some(index) = event_index(&target) else {
                return;
            };

            if values.len() > 1 && index < values.len() {
                let mut next = values.clone();
                next.remove(index);
                on_change.emit(next);
            }
        },
    );

    let swatches_ref = use_node_ref();
    let open_index = use_mut_ref(|| None::<usize>);
    let on_add = use_callback(
        (
            props.values.clone(),
            props.on_change.clone(),
            props.max,
            open_index.clone(),
        ),
        |_: MouseEvent, (values, on_change, max, open_index)| {
            if max.map(|max| values.len() < max).unwrap_or(true)
                && let Some(last) = values.last()
            {
                let mut next = values.clone();
                next.push(last.clone());
                *open_index.borrow_mut() = Some(values.len());
                on_change.emit(next);
            }
        },
    );

    {
        let swatches_ref = swatches_ref.clone();
        let open_index = open_index.clone();
        use_effect(move || {
            let Some(index) = *open_index.borrow() else {
                return;
            };

            let input = swatches_ref
                .cast::<Element>()
                .and_then(|el| {
                    el.query_selector(&format!("input[data-index=\"{index}\"]"))
                        .ok()
                        .flatten()
                })
                .and_then(|el| el.dyn_into::<HtmlInputElement>().ok());

            if let Some(input) = input {
                *open_index.borrow_mut() = None;
                let _ = input.focus();
                if input.show_picker().is_err() {
                    input.click();
                }
            }
        });
    }

    let press = use_mut_ref(|| None::<Press>);
    let drag = use_state(|| None::<(usize, usize)>);
    let suppress_click = use_mut_ref(|| false);

    let on_pointerdown = {
        let press = press.clone();
        let suppress_click = suppress_click.clone();
        Callback::from(move |event: PointerEvent| {
            if event.button() != 0 {
                return;
            }

            let Some(target) = event.target().and_then(|x| x.dyn_into::<Element>().ok()) else {
                return;
            };

            if target.class_list().contains("palette-swatch-remove") {
                return;
            }

            let Some(swatch) = target.closest(".palette-swatch").ok().flatten() else {
                return;
            };

            let Some(from) = event_index(&swatch) else {
                return;
            };

            *suppress_click.borrow_mut() = false;
            *press.borrow_mut() = Some(Press {
                pointer_id: event.pointer_id(),
                x: event.client_x(),
                y: event.client_y(),
                from,
            });
        })
    };

    let on_pointermove = {
        let press = press.clone();
        let drag = drag.clone();
        let swatches_ref = swatches_ref.clone();
        let suppress_click = suppress_click.clone();
        Callback::from(move |event: PointerEvent| {
            let Some(pressed) = *press.borrow() else {
                return;
            };

            if pressed.pointer_id != event.pointer_id() {
                return;
            }

            let Some(container) = swatches_ref.cast::<Element>() else {
                return;
            };

            if drag.is_none() {
                let dx = (event.client_x() - pressed.x) as f64;
                let dy = (event.client_y() - pressed.y) as f64;
                if dx.hypot(dy) < DRAG_THRESHOLD_PX {
                    return;
                }

                let _ = container.set_pointer_capture(pressed.pointer_id);
                *suppress_click.borrow_mut() = true;
            }

            let shown = swatch_centers(&container);
            let Some(shown_at) = shown
                .iter()
                .position(|(_, _, index)| *index == pressed.from)
            else {
                return;
            };

            let centers = shown.iter().map(|(x, y, _)| (*x, *y)).collect::<Vec<_>>();
            let slot = insertion_index(&centers, event.client_x() as f64, event.client_y() as f64);
            let insert = slot_from_display(slot, shown_at, pressed.from);
            if *drag != Some((pressed.from, insert)) {
                drag.set(Some((pressed.from, insert)));
            }
        })
    };

    let on_pointerup = {
        let press = press.clone();
        let drag = drag.clone();
        let values = props.values.clone();
        let on_change = props.on_change.clone();
        Callback::from(move |event: PointerEvent| {
            let pressed = press
                .borrow()
                .is_some_and(|p| p.pointer_id == event.pointer_id());

            if !pressed {
                return;
            }

            *press.borrow_mut() = None;
            if let Some((from, insert)) = *drag {
                drag.set(None);
                if let Some(next) = reordered(&values, from, insert) {
                    on_change.emit(next);
                }
            }
        })
    };

    let on_pointercancel = {
        let press = press.clone();
        let drag = drag.clone();
        Callback::from(move |_: PointerEvent| {
            *press.borrow_mut() = None;
            if drag.is_some() {
                drag.set(None);
            }
        })
    };

    let on_swatch_click = {
        let suppress_click = suppress_click.clone();
        Callback::from(move |event: MouseEvent| {
            if std::mem::replace(&mut *suppress_click.borrow_mut(), false) {
                event.prevent_default();
            }
        })
    };

    let on_reset = use_callback(props.on_reset.clone(), |_: MouseEvent, on_reset| {
        on_reset.emit(())
    });

    let drag_from = drag.map(|(from, _)| from);
    let identity = (0..props.values.len()).collect::<Vec<_>>();
    let display = (*drag)
        .and_then(|(from, insert)| reordered(&identity, from, insert))
        .unwrap_or(identity);

    let can_add = props
        .max
        .map(|max| props.values.len() < max)
        .unwrap_or(true);
    let can_remove = props.values.len() > 1;

    html! {
        <>
            <label id={props.title.as_deref().unwrap_or("palette-label").to_owned()} />
            <div class="color-gradient-container palette-selector">
                <div
                    class={classes!("palette-swatches", drag.is_some().then_some("reordering"))}
                    ref={swatches_ref}
                    onpointerdown={on_pointerdown}
                    onpointermove={on_pointermove}
                    onpointerup={on_pointerup}
                    onpointercancel={on_pointercancel}
                >
                    { for display.iter().map(|&index| html! {
                        <div
                            class={classes!(
                                "palette-swatch",
                                (drag_from == Some(index)).then_some("dragging"),
                            )}
                            key={index.to_string()}
                            data-index={index.to_string()}
                        >
                            <input
                                class="parameter"
                                type="color"
                                value={props.values[index].clone()}
                                data-index={index.to_string()}
                                oninput={oninput.clone()}
                                onclick={on_swatch_click.clone()}
                            />
                            if can_remove {
                                <span
                                    class="palette-swatch-remove"
                                    data-index={index.to_string()}
                                    onclick={on_remove.clone()}
                                />
                            }
                        </div>
                    }) }
                    if can_add { <span class="palette-add" onclick={on_add} /> }
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

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn insertion_index_splits_at_centers_and_resolves_rows() {
        let centers = [(12.0, 12.0), (40.0, 12.0), (68.0, 12.0), (12.0, 40.0)];
        assert_eq!(insertion_index(&centers, 0.0, 12.0), 0);
        assert_eq!(insertion_index(&centers, 13.0, 12.0), 1);
        assert_eq!(insertion_index(&centers, 39.0, 12.0), 1);
        assert_eq!(insertion_index(&centers, 41.0, 12.0), 2);
        assert_eq!(insertion_index(&centers, 90.0, 12.0), 3);
        assert_eq!(insertion_index(&centers, 10.0, 41.0), 3);
        assert_eq!(insertion_index(&centers, 30.0, 41.0), 4);
        assert_eq!(insertion_index(&[], 5.0, 5.0), 0);
    }

    #[test]
    fn slot_from_display_maps_previewed_slots_back_to_original_order() {
        assert_eq!(slot_from_display(3, 2, 0), 3);
        assert_eq!(slot_from_display(2, 2, 0), 3);
        assert_eq!(slot_from_display(1, 2, 0), 2);
        assert_eq!(slot_from_display(0, 2, 0), 0);
        assert_eq!(slot_from_display(0, 0, 2), 0);
        assert_eq!(slot_from_display(1, 0, 2), 0);
        assert_eq!(slot_from_display(2, 0, 2), 1);
        assert_eq!(slot_from_display(3, 0, 2), 2);
        assert_eq!(slot_from_display(4, 0, 2), 4);
        assert_eq!(slot_from_display(1, 1, 1), 1);
        assert_eq!(slot_from_display(2, 1, 1), 1);
        assert_eq!(slot_from_display(3, 1, 1), 3);
    }

    #[test]
    fn reordered_moves_and_rejects_no_ops() {
        let values = v(&["a", "b", "c", "d"]);
        assert_eq!(reordered(&values, 0, 4), Some(v(&["b", "c", "d", "a"])));
        assert_eq!(reordered(&values, 3, 0), Some(v(&["d", "a", "b", "c"])));
        assert_eq!(reordered(&values, 0, 2), Some(v(&["b", "a", "c", "d"])));
        assert_eq!(reordered(&values, 2, 1), Some(v(&["a", "c", "b", "d"])));
        assert_eq!(reordered(&values, 1, 1), None);
        assert_eq!(reordered(&values, 1, 2), None);
        assert_eq!(reordered(&values, 4, 0), None);
        assert_eq!(reordered(&values, 0, 5), None);
    }
}

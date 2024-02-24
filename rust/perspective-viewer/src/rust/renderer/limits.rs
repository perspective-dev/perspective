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

use perspective::utils::ApiError;

use crate::js::plugin::*;

pub async fn get_row_and_col_limits(
    view: &perspective_client::View,
    plugin_metadata: &ViewConfigRequirements,
) -> Result<(usize, usize, Option<usize>, Option<usize>), ApiError> {
    let dimensions = view.dimensions().await?;
    let num_cols = dimensions.num_view_columns as usize;
    let num_rows = dimensions.num_view_rows as usize;
    match (plugin_metadata.max_columns, plugin_metadata.render_warning) {
        (Some(_), false) => Ok((num_cols, num_rows, None, None)),
        (max_columns, _) => {
            let schema = view.schema().await?;
            let keys = schema.keys();
            let num_schema_columns = std::cmp::max(1, keys.len() as usize);
            let max_cols = max_columns.and_then(|max_columns| {
                let column_group_diff = max_columns % num_schema_columns;
                let column_limit = max_columns + column_group_diff;
                if column_limit < num_cols {
                    Some(column_limit)
                } else {
                    None
                }
            });

            let max_rows = plugin_metadata.max_cells.map(|max_cells| {
                match max_cols {
                    Some(max_cols) => max_cells as f64 / max_cols as f64,
                    None => max_cells as f64 / num_cols as f64,
                }
                .ceil() as usize
            });

            Ok((num_cols, num_rows, max_cols, max_rows))
        },
    }
}

// #[cfg(test)]
// mod tests {
//     use super::*;

//     fn closure_helper<T>(x: T) -> Closure<dyn Fn(JsValue) -> js_sys::Promise>
//     where
//         T: Into<JsValue>,
//     {
//         let val = x.into();
//         Closure::new(move |_: JsValue| {
//             clone!(val);
//             future_to_promise(async move { Ok(val.clone()) })
//         })
//     }

//     #[wasm_bindgen_test]
//     pub async fn test_emtpy_schema_no_columns() {
//         let closure = closure_helper(0);
//         let closure2 = closure_helper(json!({}));
//         let view = json!({
//             "num_columns": closure.as_ref().unchecked_ref::<JsValue>(),
//             "num_rows": closure.as_ref().unchecked_ref::<JsValue>(),
//             "schema": closure2.as_ref().unchecked_ref::<JsValue>()
//         })
//         .unchecked_into::<JsPerspectiveView>();

//         let reqs = ViewConfigRequirements {
//             render_warning: true,
//             ..ViewConfigRequirements::default()
//         };
//         let (_, _, max_cols, max_rows) = get_row_and_col_limits(&view,
// &reqs).await.unwrap();         assert_eq!(max_cols, None);
//         assert_eq!(max_rows, None);
//     }

//     #[wasm_bindgen_test]
//     pub async fn test_columns_do_not_exceed_max_columns() {
//         let closure = closure_helper(1);
//         let closure2 = closure_helper(0);
//         let closure3 = closure_helper(json!({}));
//         let view = json!({
//             "num_columns": closure.as_ref().unchecked_ref::<JsValue>(),
//             "num_rows": closure2.as_ref().unchecked_ref::<JsValue>(),
//             "schema": closure3.as_ref().unchecked_ref::<JsValue>()
//         })
//         .unchecked_into::<JsPerspectiveView>();

//         let reqs = ViewConfigRequirements {
//             max_columns: Some(2),
//             render_warning: true,
//             ..ViewConfigRequirements::default()
//         };

//         let (_, _, max_cols, max_rows) = get_row_and_col_limits(&view,
// &reqs).await.unwrap();         assert_eq!(max_cols, None);
//         assert_eq!(max_rows, None);
//     }

//     #[wasm_bindgen_test]
//     pub async fn test_columns_exceed_max_columns() {
//         let closure = closure_helper(2);
//         let closure2 = closure_helper(0);
//         let closure3 = closure_helper(json!({}));
//         let view = json!({
//             "num_columns": closure.as_ref().unchecked_ref::<JsValue>(),
//             "num_rows": closure2.as_ref().unchecked_ref::<JsValue>(),
//             "schema": closure3.as_ref().unchecked_ref::<JsValue>()
//         })
//         .unchecked_into::<JsPerspectiveView>();

//         let reqs = ViewConfigRequirements {
//             max_columns: Some(1),
//             render_warning: true,
//             ..ViewConfigRequirements::default()
//         };
//         let (_, _, max_cols, max_rows) = get_row_and_col_limits(&view,
// &reqs).await.unwrap();         assert_eq!(max_cols, Some(1));
//         assert_eq!(max_rows, None);
//     }

//     #[wasm_bindgen_test]
//     pub async fn test_when_schema_columns_are_present() {
//         let closure = closure_helper(100);
//         let closure2 = closure_helper(0);
//         let closure3 = closure_helper(json!({"x": "string", "y": "string"}));
//         let view = json!({
//             "num_columns": closure.as_ref().unchecked_ref::<JsValue>(),
//             "num_rows": closure2.as_ref().unchecked_ref::<JsValue>(),
//             "schema": closure3.as_ref().unchecked_ref::<JsValue>()
//         })
//         .unchecked_into::<JsPerspectiveView>();

//         let reqs = ViewConfigRequirements {
//             max_columns: Some(3),
//             render_warning: true,
//             ..ViewConfigRequirements::default()
//         };
//         let (_, _, max_cols, max_rows) = get_row_and_col_limits(&view,
// &reqs).await.unwrap();         assert_eq!(max_cols, Some(4));
//         assert_eq!(max_rows, None);
//     }

//     #[wasm_bindgen_test]
//     pub async fn test_when_max_cells_exits() {
//         let closure = closure_helper(1);
//         let closure2 = closure_helper(0);
//         let closure3 = closure_helper(json!({}));
//         let view = json!({
//             "num_columns": closure.as_ref().unchecked_ref::<JsValue>(),
//             "num_rows": closure2.as_ref().unchecked_ref::<JsValue>(),
//             "schema": closure3.as_ref().unchecked_ref::<JsValue>()
//         })
//         .unchecked_into::<JsPerspectiveView>();

//         let reqs = ViewConfigRequirements {
//             max_cells: Some(2),
//             render_warning: true,
//             ..ViewConfigRequirements::default()
//         };
//         let (_, _, max_cols, max_rows) = get_row_and_col_limits(&view,
// &reqs).await.unwrap();         assert_eq!(max_cols, None);
//         assert_eq!(max_rows, Some(2));
//     }

//     #[wasm_bindgen_test]
//     pub async fn test_when_columns_exceed_max_columns_and_max_cells_exists()
// {         let closure = closure_helper(4);
//         let closure2 = closure_helper(0);
//         let closure3 = closure_helper(json!({}));
//         let view = json!({
//             "num_columns": closure.as_ref().unchecked_ref::<JsValue>(),
//             "num_rows": closure2.as_ref().unchecked_ref::<JsValue>(),
//             "schema": closure3.as_ref().unchecked_ref::<JsValue>()
//         })
//         .unchecked_into::<JsPerspectiveView>();

//         let reqs = ViewConfigRequirements {
//             max_columns: Some(2),
//             max_cells: Some(10),
//             render_warning: true,
//             ..ViewConfigRequirements::default()
//         };

//         let (_, _, max_cols, max_rows) = get_row_and_col_limits(&view,
// &reqs).await.unwrap();         assert_eq!(max_cols, Some(2));
//         assert_eq!(max_rows, Some(5));
//     }
// }

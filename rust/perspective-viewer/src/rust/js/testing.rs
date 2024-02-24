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

#[cfg(test)]
use wasm_bindgen::prelude::*;

// Must use inline build because the test runner does not import itself in
// the browser with `type=module` which causes `import.meta` calls to fail,
// and `currentScript` does not resolve dynamic imports so the polyfill
// for `import.meta` does not work either.
#[cfg(test)]
#[wasm_bindgen(inline_js = "

    export async function worker() {
        await import('/dist/pkg/test/perspective.js');
        return window.perspective.worker();
    }

")]
extern "C" {
    fn worker() -> js_sys::Promise;
}

// /// Generate a test `Table`, but only create teh webworker once or the tests
// /// will figuratively literally run forever.
// #[cfg(test)]
// pub async fn get_mock_table() -> JsPerspectiveTable {
//     thread_local! {
//         static WORKER: RefCell<Option<JsPerspectiveWorker>> =
// RefCell::new(None);     }

//     let worker: JsPerspectiveWorker = match WORKER.with(|x|
// x.borrow().clone()) {         Some(x) => x,
//         None => JsFuture::from(worker()).await.unwrap().unchecked_into(),
//     };

//     WORKER.with(|x| {
//         *x.borrow_mut() = Some(worker.clone());
//     });

//     worker
//         .table(
//             json!({
//                 "A": [1, 2, 3]
//             })
//             .unchecked_into(),
//         )
//         .await
//         .unwrap()
// }

/// A macro which set a property called `weak_link` on the container
/// `Properties` when `cfg(test)`, such that unit tests may send messages to a
/// component. This macro needs to be called in `create()` on any Component
/// which needs to receive messages in a test.
#[macro_export]
macro_rules! enable_weak_link_test {
    ($props:expr, $link:expr) => {
        #[cfg(test)]
        {
            *$props.weak_link.borrow_mut() = Some($link.clone());
        }
    };
}

/// A macro which derives a `yew::Component` for an arbitrary HTML snippet and
/// mounts it, for testing.
#[macro_export]
macro_rules! test_html {
    ($($html:tt)*) => {{
        use wasm_bindgen::JsCast;
        use yew::prelude::*;

        struct TestElement {}

        #[derive(Properties, PartialEq)]
        struct TestElementProps {
            html: Html,
            root: NodeRef,
        }

        impl Component for TestElement {
            type Message = ();
            type Properties = TestElementProps;

            fn create(_ctx: &Context<Self>) -> Self {
                TestElement {}
            }

            fn update(&mut self, _ctx: &Context<Self>, _msg: Self::Message) -> bool {
                false
            }

            fn changed(&mut self, _ctx: &Context<Self>, _old: &Self::Properties) -> bool {
                true
            }

            fn view(&self, ctx: &Context<Self>) -> Html {
                html! {
                    <>
                        <style>
                            { "#test{position:absolute;top:0;bottom:0;left:0;right:0;}" }
                        </style>
                        <div ref={ ctx.props().root.clone() }>
                            { ctx.props().html.clone() }
                        </div>
                    </>
                }
            }
        }

        let document = ::perspective::utils::global::document();
        let body = document.body().unwrap();
        let div = document.create_element("div").unwrap();
        body.append_child(&div).unwrap();

        let init = web_sys::ShadowRootInit::new(web_sys::ShadowRootMode::Open);
        let shadow_root = div
            .attach_shadow(&init)
            .unwrap()
            .unchecked_into::<web_sys::Element>();

        let root = NodeRef::default();
        let props = TestElementProps {
            html: html!{ $($html)* },
            root: root.clone(),
        };

        yew::Renderer::<TestElement>::with_root_and_props(shadow_root, props).render();
        request_animation_frame().await;
        root.cast::<web_sys::HtmlElement>()
            .unwrap()
            .children()
            .get_with_index(0)
            .unwrap()
            .unchecked_into::<web_sys::HtmlElement>()
    }}
}

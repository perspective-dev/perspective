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

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::thread::LocalKey;

use extend::ext;
use perspective_js::utils::global;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::*;

use crate::config::{ColumnSelectMode, PluginStaticConfig};
use crate::js::plugin::*;

thread_local! {
    pub static PLUGIN_REGISTRY: Rc<RefCell<Vec<PluginRecord>>> = Rc::new(RefCell::new(vec![]));
}

pub struct PluginRecord {
    tag_name: String,
    config: Rc<PluginStaticConfig>,
}

/// A global registry of all plugins that have been registered.
#[ext]
pub impl LocalKey<Rc<RefCell<Vec<PluginRecord>>>> {
    fn create_plugins(&'static self) -> Vec<JsPerspectiveViewerPlugin> {
        register_default();
        self.with(
            |plugins| -> Result<Vec<JsPerspectiveViewerPlugin>, JsValue> {
                let mut elements = vec![];
                for plugin in plugins.borrow().iter() {
                    let element = create_plugin(&plugin.tag_name);
                    let style = element.unchecked_ref::<HtmlElement>().style();
                    style.set_property("position", "absolute")?;
                    style.set_property("top", "0")?;
                    style.set_property("right", "0")?;
                    style.set_property("bottom", "0")?;
                    style.set_property("left", "0")?;
                    elements.push(element);
                }

                Ok(elements)
            },
        )
        .unwrap()
    }

    /// Returns the cached `PluginStaticConfig`s for every registered
    /// plugin, in registration order. The renderer reads these at
    /// activation time instead of calling back into JS for each field.
    fn plugin_configs(&'static self) -> Vec<Rc<PluginStaticConfig>> {
        register_default();
        self.with(|plugins| {
            plugins
                .borrow()
                .iter()
                .map(|plugin| plugin.config.clone())
                .collect()
        })
    }

    fn default_plugin_name(&'static self) -> String {
        register_default();
        self.with(|plugins| {
            plugins
                .borrow()
                .iter()
                .map(|plugin| plugin.config.name.clone())
                .next()
                .unwrap()
        })
    }

    fn available_plugin_names_by_category(&'static self) -> HashMap<String, Vec<String>> {
        register_default();
        self.with(|plugins| {
            plugins.borrow().iter().fold(
                HashMap::<String, Vec<String>>::default(),
                |mut acc, plugin| {
                    let category = plugin
                        .config
                        .category
                        .clone()
                        .unwrap_or_else(|| "Custom".to_owned());

                    acc.entry(category)
                        .or_default()
                        .push(plugin.config.name.clone());
                    acc
                },
            )
        })
    }

    fn register_plugin(&'static self, tag_name: &str) {
        assert!(
            !self.with(|plugin| plugin.borrow().iter().any(|n| n.tag_name == tag_name)),
            "Plugin Custom Element '{tag_name}' already registered"
        );

        self.with(|plugin| {
            let plugin_inst = create_plugin(tag_name);
            let config = Rc::new(plugin_inst.read_static_config());
            let record = PluginRecord {
                tag_name: tag_name.to_owned(),
                config,
            };

            let mut plugins = plugin.borrow_mut();
            if let Some(first) = plugins.first()
                && first.tag_name.as_str() == "perspective-viewer-plugin"
            {
                plugins.clear();
            }

            plugins.push(record);
            plugins.sort_by(|a, b| {
                Ord::cmp(
                    &b.config.priority.unwrap_or(0),
                    &a.config.priority.unwrap_or(0),
                )
            });
        });
    }

    #[cfg(test)]
    fn reset(&'static self) {
        self.with(|plugins| plugins.borrow_mut().clear());
    }
}

fn register_default() {
    PLUGIN_REGISTRY.with(|plugins| {
        if plugins.borrow().is_empty() {
            plugins.borrow_mut().push(PluginRecord {
                tag_name: "perspective-viewer-plugin".to_owned(),
                config: Rc::new(PluginStaticConfig {
                    name: "Debug".to_owned(),
                    category: Some("Custom".to_owned()),
                    select_mode: ColumnSelectMode::Select,
                    priority: Some(-1),
                    ..PluginStaticConfig::default()
                }),
            })
        }
    })
}

fn create_plugin(tag_name: &str) -> JsPerspectiveViewerPlugin {
    global::document()
        .create_element(tag_name)
        .unwrap()
        .unchecked_into()
}

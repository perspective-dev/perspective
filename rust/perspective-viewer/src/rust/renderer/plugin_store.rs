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

use std::collections::HashMap;
use std::rc::Rc;

use super::registry::*;
use crate::config::PluginStaticConfig;
use crate::js::plugin::*;

#[derive(Default)]
pub struct PluginStore {
    plugins: Option<Vec<JsPerspectiveViewerPlugin>>,
    plugin_configs: Option<Vec<Rc<PluginStaticConfig>>>,
    plugin_records: Option<HashMap<String, Vec<String>>>,
}

impl PluginStore {
    fn init_lazy(&mut self) {
        self.plugins = Some(PLUGIN_REGISTRY.create_plugins());
        self.plugin_configs = Some(PLUGIN_REGISTRY.plugin_configs());
        self.plugin_records = Some(PLUGIN_REGISTRY.available_plugin_names_by_category());
    }

    pub fn plugins(&mut self) -> &Vec<JsPerspectiveViewerPlugin> {
        if self.plugins.is_none() {
            self.init_lazy();
        }

        self.plugins.as_ref().unwrap()
    }

    pub fn plugin_configs(&mut self) -> &Vec<Rc<PluginStaticConfig>> {
        if self.plugins.is_none() {
            self.init_lazy();
        }

        self.plugin_configs.as_ref().unwrap()
    }

    pub fn plugin_records(&mut self) -> &HashMap<String, Vec<String>> {
        if self.plugins.is_none() {
            self.init_lazy();
        }

        self.plugin_records.as_ref().unwrap()
    }
}

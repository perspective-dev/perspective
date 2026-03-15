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

use perspective_js::utils::*;

use crate::config::ColumnConfigValueUpdate;
use crate::tasks::*;

pub trait SendPluginConfig {
    /// Update te urrent plugin with a [`ColumnonfigValueUpdate`]
    fn send_plugin_config(&self, column_name: &str, update: ColumnConfigValueUpdate);
}

impl<A> SendPluginConfig for A
where
    A: Clone + HasCustomEvents + HasPresentation + HasRenderer + HasSession + 'static,
{
    fn send_plugin_config(&self, column_name: &str, update: ColumnConfigValueUpdate) {
        let name = column_name.to_string();
        let props = self.clone();
        ApiFuture::spawn(async move {
            props
                .presentation()
                .update_columns_config_value(name.clone(), update);

            let columns_configs = props.presentation().all_columns_configs();
            let plugin_config = props.renderer().get_active_plugin()?.save()?;
            props
                .renderer()
                .get_active_plugin()?
                .restore(&plugin_config, Some(&columns_configs))?;

            props.renderer().update(props.session().get_view()).await?;
            let detail = serde_wasm_bindgen::to_value(&columns_configs).unwrap();
            props
                .custom_events()
                .dispatch_column_style_changed(&detail)?;

            Ok(())
        })
    }
}

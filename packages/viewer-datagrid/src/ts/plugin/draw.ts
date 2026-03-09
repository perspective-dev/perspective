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

import {
    restore_column_size_overrides,
    save_column_size_overrides,
} from "../model/column_overrides.js";
import type { View } from "@perspective-dev/client";
import type { DatagridPluginElement } from "../types.js";

interface DatagridPluginWithActivate extends DatagridPluginElement {
    activate(view: View): Promise<void>;
}

export async function draw(
    this: DatagridPluginWithActivate,
    view: View,
): Promise<void> {
    if (this.parentElement) {
        await this.activate(view);
    }

    if (!this.isConnected || this.offsetParent == null || !this.model) {
        return;
    }

    const old_sizes = save_column_size_overrides.call(this);
    const drawPromise = this.regular_table.draw({
        invalid_columns: true,
    } as any);

    if (this._reset_scroll_top) {
        this.regular_table.scrollTop = 0;
        this._reset_scroll_top = false;
    }

    if (this._reset_scroll_left) {
        this.regular_table.scrollLeft = 0;
        this._reset_scroll_left = false;
    }
    if (this._reset_select) {
        this.regular_table.dispatchEvent(
            new CustomEvent("psp-deselect-all", { bubbles: false }),
        );
        this._reset_select = false;
    }

    if (this._reset_column_size) {
        this.regular_table.resetAutoSize();
        this._reset_column_size = false;
    }

    restore_column_size_overrides.call(this, old_sizes);
    await drawPromise;

    this._toolbar?.classList.toggle(
        "aggregated",
        this.model._config.group_by.length > 0 ||
            this.model._config.split_by.length > 0,
    );
}

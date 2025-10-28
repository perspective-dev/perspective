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

import { CommandRegistry } from "@lumino/commands";
import { Menu, Widget } from "@lumino/widgets";
import { Signal } from "@lumino/signaling";

import type {
    HTMLPerspectiveViewerCopyMenu,
    HTMLPerspectiveViewerExportMenu,
} from "@finos/perspective-viewer";

import type { PerspectiveWorkspace } from "./workspace";
import { WorkspaceMenu } from "./menu";

export const createCommands = (
    workspace: PerspectiveWorkspace,
    indicator: HTMLElement
) => {
    const commands = new CommandRegistry();

    commands.addCommand("workspace:export", {
        execute: async (args) => {
            const menu = document.createElement(
                "perspective-export-menu"
            ) as unknown as HTMLPerspectiveViewerExportMenu;

            workspace.apply_indicator_theme();
            const widget = workspace.getWidgetByName(
                args.widget_name as string
            )!;

            menu.set_model(widget.viewer.get_model());
            menu.open(indicator);
            workspace.get_context_menu()?.init_overlay?.();
            menu.addEventListener("blur", () => {
                const context_menu = workspace.get_context_menu()!;
                const signal = context_menu.aboutToClose as Signal<
                    WorkspaceMenu,
                    any
                >;
                signal.emit({});
            });
        },
        isEnabled: (args) => {
            if (workspace.get_context_menu()?.node.isConnected) {
                const box = workspace
                    .get_context_menu()
                    ?.node.getBoundingClientRect();

                if (box) {
                    indicator.style.top = box.top + "px";
                    indicator.style.left = box.left + "px";
                }
            }

            return true;
        },
        // iconClass: "menu-export",
        label: "Export",
        mnemonic: 0,
    });

    commands.addCommand("workspace:copy", {
        execute: async (args) => {
            const menu = document.createElement(
                "perspective-copy-menu"
            ) as HTMLPerspectiveViewerCopyMenu;

            workspace.apply_indicator_theme();
            const widget = workspace.getWidgetByName(
                args.widget_name as string
            )!;
            menu.set_model(widget.viewer.get_model());

            menu.open(indicator);
            workspace.get_context_menu()?.init_overlay?.();
            menu.addEventListener("blur", () => {
                (
                    workspace.get_context_menu()?.aboutToClose as
                        | Signal<WorkspaceMenu, any>
                        | undefined
                )?.emit({});
            });
        },
        isEnabled: (_) => {
            if (workspace.get_context_menu()?.node.isConnected) {
                const box = workspace
                    .get_context_menu()
                    ?.node.getBoundingClientRect();

                if (box) {
                    indicator.style.top = box.top + "px";
                    indicator.style.left = box.left + "px";
                }
            }

            return true;
        },
        // iconClass: "menu-copy",
        label: "Copy",
        mnemonic: 0,
    });

    commands.addCommand("workspace:new", {
        execute: (args) => {
            const widget = workspace._createWidgetAndNode({
                config: { table: args.table as string },
                slot: undefined,
            });

            workspace.get_dock_panel().addWidget(widget, {
                mode: "split-right",
                ref: workspace.getWidgetByName(args.widget_name as string),
            });
        },
        // iconClass: "menu-new-tables",
        label: (args) => {
            return args.table as string;
        },
    });

    commands.addCommand("workspace:newview", {
        execute: async (args) => {
            const widget = workspace.getWidgetByName(
                args.widget_name as string
            );

            const target_widget = workspace.getWidgetByName(
                args.target_widget_name as string
            )!;

            const config = await target_widget.save();
            const new_widget = workspace._createWidgetAndNode({
                config,
                slot: undefined,
            });

            workspace.get_dock_panel().addWidget(new_widget, {
                mode: "split-right",
                ref: widget,
            });
        },
        // iconClass: "menu-new-tables",
        isVisible: (args) => {
            const target_widget = workspace.getWidgetByName(
                args.target_widget_name as string
            );

            return target_widget?.title.label !== "";
        },
        label: (args) => {
            const target_widget = workspace.getWidgetByName(
                args.target_widget_name as string
            )!;

            return target_widget.title.label || "untitled";
        },
    });

    commands.addCommand("workspace:reset", {
        execute: (args) => {
            workspace
                .getWidgetByName(args.widget_name as string)!
                .viewer.reset();
        },
        label: "Reset",
        mnemonic: 0,
    });

    commands.addCommand("workspace:settings", {
        execute: async ({ widget_name }) => {
            const widget = workspace.getWidgetByName(widget_name as string);
            if (!widget) {
                throw new Error(`No widget ${widget_name}`);
            }

            if (!widget.viewer.hasAttribute("settings")) {
                workspace._maximize(widget);
                requestAnimationFrame(() => widget.viewer.toggleConfig());
            } else {
                widget.viewer.toggleConfig();
            }
        },
        isVisible: (args) => {
            const widget = workspace.getWidgetByName(
                args.widget_name as string
            );

            return widget?.parent === (workspace.get_dock_panel() as Widget)
                ? true
                : false;
        },
        label: (args) => {
            const widget = workspace.getWidgetByName(
                args.widget_name as string
            )!;
            if (widget.viewer.hasAttribute("settings")) {
                return "Close Settings";
            } else {
                return "Open Settings";
            }
        },
        mnemonic: 0,
    });

    commands.addCommand("workspace:duplicate", {
        execute: ({ widget_name }) =>
            workspace.duplicate(
                workspace.getWidgetByName(widget_name as string)!
            ),
        // iconClass: "menu-duplicate",
        isVisible: (args) => {
            const parent = workspace.getWidgetByName(
                args.widget_name as string
            )?.parent;
            return parent === (workspace.get_dock_panel() as Widget)
                ? true
                : false;
        },
        label: "Duplicate",
        mnemonic: 0,
    });

    commands.addCommand("workspace:master", {
        execute: (args) =>
            workspace.toggleMasterDetail(
                workspace.getWidgetByName(args.widget_name as string)!
            ),
        isVisible: (args) => {
            return !!workspace.getWidgetByName(args.widget_name as string)
                ?._is_pivoted;
        },

        label: (args) => {
            return workspace.getWidgetByName(args.widget_name as string)!
                .parent === workspace.get_dock_panel()
                ? "Create Global Filter"
                : "Remove Global Filter";
        },
        mnemonic: 0,
    });

    commands.addCommand("workspace:close", {
        execute: (args) => {
            workspace.getWidgetByName(args.widget_name as string)!.close();
        },
        // iconClass: "menu-close",
        label: () => "Close",
        mnemonic: 0,
    });

    commands.addCommand("workspace:help", {
        // iconClass: "menu-close",
        execute: () => {},
        label: "Shift+Click for Browser Menu",
        isEnabled: () => false,
        // mnemonic: 0,
    });

    return commands;
};

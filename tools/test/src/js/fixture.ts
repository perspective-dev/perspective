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

import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

type Logs = { [x: string]: string[] };
type LogFilter = RegExp | [RegExp, { expected: boolean }];
type ExpectedLogs = {
    [x: string]: LogFilter[];
} & {
    push: (type: string, filter: LogFilter) => void;
};
function stub_local_fonts() {
    const FAMILIES = ["Test Mono", "Test Sans", "Test Serif"];
    const permissions = navigator.permissions;
    const query = permissions.query.bind(permissions);
    const status = { state: "granted", onchange: null };
    Object.defineProperty(navigator, "permissions", {
        configurable: true,
        value: {
            query: (desc: PermissionDescriptor) =>
                desc?.name === ("local-fonts" as PermissionName)
                    ? Promise.resolve(status)
                    : query(desc),
        },
    });

    Object.defineProperty(window, "queryLocalFonts", {
        configurable: true,
        value: async () => FAMILIES.map((family) => ({ family })),
    });
}

export const test = base.extend<{
    consoleLogs: { logs: Logs; expectedLogs: ExpectedLogs };
}>({
    context: async ({ context }, use) => {
        await context.addInitScript(stub_local_fonts);
        await use(context);
    },
    consoleLogs: [
        async ({ page }, use) => {
            const logs: Logs = {};

            page.setDefaultTimeout(5000);

            page.on("console", (msg) => {
                let type = msg.type();
                let text = msg.text();
                logs[type] ? logs[type].push(text) : (logs[type] = [text]);
            });
            let expectedLogsConstructor: any = {
                warning: [[/Legacy `expressions` format/, { expected: false }]],
                error: [[/RENDERED STUB/, { expected: false }]],
            };

            // this is crazy
            expectedLogsConstructor.push = (
                type: string,
                filter: LogFilter
            ) => {
                ((
                    expectedLogs: ExpectedLogs,
                    type: string,
                    filter: LogFilter
                ) => {
                    expectedLogs[type]
                        ? expectedLogs[type].push(filter)
                        : (expectedLogs[type] = [filter]);
                })(expectedLogsConstructor, type, filter);
            };

            let expectedLogs = expectedLogsConstructor as ExpectedLogs;

            await use({ logs, expectedLogs });

            Object.entries(expectedLogs).forEach(([type, filters]) => {
                if (typeof filters == "function") {
                    return;
                }
                for (let filter of filters) {
                    let filterText: string | RegExp,
                        expected = true;
                    if (Array.isArray(filter)) {
                        filterText = filter[0];
                        expected = filter[1].expected;
                    } else {
                        filterText = filter;
                    }
                    let matched_expr = logs[type]?.find((msg) =>
                        msg.match(filterText)
                    );
                    let msgLogs = Array.from(Object.entries(logs)).map(
                        ([k, v]) =>
                            `"${k}": [\n\t` +
                            v.map((v) => `"${v}"`).join(",\n\t") +
                            "\n],\n"
                    );
                    let message = `Filter was "${filterText}"\nLogs were: ${msgLogs}`;
                    expected
                        ? test
                              .expect(matched_expr, {
                                  message,
                              })
                              .toBeDefined()
                        : test
                              .expect(matched_expr, {
                                  message,
                              })
                              .toBeUndefined();
                }
            });
        },
        { auto: true },
    ],
});

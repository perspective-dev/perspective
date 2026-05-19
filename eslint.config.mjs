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

import tseslint from "typescript-eslint";
// import globals from "globals";

export default tseslint.config(
    {
        ignores: [
            "docs/**",
            "tools/**",
            "rust/**",
            "examples/**",
            "packages/cli/**/*",
            "packages/jupyterlab/**/*",
            // "packages/viewer-charts/**/*",
            // "packages/viewer-datagrid/**/*",
            "packages/workspace/**/*",
            "packages/react/**/*",

            ".emsdk/**",
            "**/py_modules/**",
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "**/target/**",
            "**/pkg/**",
        ],
    },
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{ts,mts,tsx}"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
            // globals: {
            //     ...globals.browser,
            //     ...globals.node,
            // },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            curly: "warn",
            "padding-line-between-statements": [
                "warn",
                { blankLine: "always", prev: "block-like", next: "*" },
            ],
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    args: "none",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],

            // // This is why we can't have nice things. I like this rule, but
            // // `prettier` doesn't, so we conform or perish.
            //
            // "lines-around-comment": [
            //     "warn",
            //     {
            //         beforeLineComment: true,
            //         beforeBlockComment: true,
            //     },
            // ],
            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/no-unused-expressions": "off",
            "@typescript-eslint/no-this-alias": "off",
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-wrapper-object-types": "off",
            "@typescript-eslint/no-unsafe-function-type": "off",
            "no-empty": "off",
            "no-prototype-builtins": "off",
            "no-control-regex": "off",
            "no-useless-escape": "off",
            "no-async-promise-executor": "off",
            "no-cond-assign": "off",
            "no-misleading-character-class": "off",
        },
    },
    {
        files: ["examples/**/*.{ts,mts,tsx}", "tools/bench/**/*.{ts,mts,tsx}"],
        rules: {
            "@typescript-eslint/no-unused-vars": "warn",
        },
    },
);

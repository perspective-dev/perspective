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

import { Octokit } from "octokit";
import fs from "node:fs/promises";
import { execSync } from "child_process";

import "zx/globals";

// GitHub API Wrapper
const OCTOKIT = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

const CURRENT_TAG = $.sync`git describe --exact-match --tags`.toString().trim();

const IS_DIRTY =
    (await $`git status --untracked-files=no --porcelain`).stdout.trim()
        .length > 0;

async function get_release_assets() {
    const resp = await OCTOKIT.request("GET /repos/{owner}/{repo}/releases", {
        owner: "perspective-dev",
        repo: "perspective",
    });

    for (const release of resp.data) {
        if (release.tag_name === CURRENT_TAG) {
            return release.assets;
        }
    }

    throw new Error(`No release ${CURRENT_TAG} found`);
}

async function download_release_assets(releases) {
    await Promise.all(
        releases.map(async (release) => {
            const resp = await OCTOKIT.request(
                "GET /repos/{owner}/{repo}/releases/assets/{asset_id}",
                {
                    owner: "perspective-dev",
                    repo: "perspective",
                    asset_id: release.id,
                    headers: {
                        Accept: "application/octet-stream",
                    },
                },
            );

            console.log(`Writing ${release.name}`);
            await fs.writeFile(release.name, Buffer.from(resp.data));
        }),
    );
}

const SH_ENV = {
    env: process.env,
    stdio: "inherit",
};

async function publish_release_assets(releases) {
    if (process.env.COMMIT) {
        for (const release of releases) {
            if (
                (release.name.endsWith("whl") ||
                    release.name.endsWith("tar.gz")) &&
                release.name.indexOf("wasm") === -1
            ) {
                execSync(`twine upload ${release.name}`, SH_ENV);
            } else if (release.name.endsWith(".tgz")) {
                execSync(`npm publish ${release.name}`, SH_ENV);
            } else {
                console.log(`Skipping  "${release.name}"`);
            }
        }

        await $`mkdir -p rust/target/package && mv *.crate rust/target/package`;

        execSync(
            `cargo publish -p perspective-server --allow-dirty --no-verify`,
            SH_ENV,
        );

        execSync(
            `cargo publish -p perspective-client --allow-dirty --no-verify`,
            SH_ENV,
        );

        execSync(
            `cargo publish -p perspective-python --allow-dirty --no-verify`,
            SH_ENV,
        );

        execSync(
            `cargo publish -p perspective-js --allow-dirty --no-verify`,
            SH_ENV,
        );

        execSync(
            `cargo publish -p perspective-viewer --allow-dirty --no-verify`,
            SH_ENV,
        );

        execSync(
            `cargo publish -p perspective --allow-dirty --no-verify`,
            SH_ENV,
        );
    } else {
        console.warn(`COMMIT not specified, aborting`);
    }
}

if (!process.env.GITHUB_TOKEN) {
    throw new Error("Missing Personal Access Token (GITHUB_TOKEN)");
}

if (!process.env.COMMIT) {
    console.warn(
        "Running a dry run, this WILL NOT publish. Set the env var COMMIT to publish.",
    );
}

if (IS_DIRTY) {
    throw new Error("Working tree dirty, aborting");
}

const releases = await get_release_assets();
console.log(`Found ${releases.length} artifacts for ${CURRENT_TAG}`);
for (const release of releases) {
    console.log(`  ${release.name}`);
}

await download_release_assets(releases);
await publish_release_assets(releases);

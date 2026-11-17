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

import fs from "fs";
import { Octokit } from "octokit";
import { parseReleases } from "auto-changelog/src/releases.js";
import { fetchTags } from "auto-changelog/src/tags.js";
import { fetchRemote } from "auto-changelog/src/remote.js";
import * as toml from "@iarna/toml";

import "zx/globals";

// if (!process.env.GITHUB_TOKEN) {
//     throw new Error("Missing GITHUB_TOKEN");
// }

const IS_NIGHTLY = process.argv.indexOf("--nightly") > -1;

const PKG_VERSION = JSON.parse(fs.readFileSync("./package.json")).version.match(
    /[0-9]+\.[0-9]+\.[0-9]+/,
)[0];

const GIT_REV = await $`git show --no-patch --format=%ct HEAD`;

console.log();

const NEW_VERSION = IS_NIGHTLY
    ? `${PKG_VERSION}-dev${+new Date(parseInt(GIT_REV.toString()))}`
    : PKG_VERSION;

/**
 * A Github data fetching cache designed to run in parallel with changelog formatting.
 * When a SHA is requested, it is looked up in a local cache, and if it isn't there,
 * the next Github API page is awaited.  Requests are always triggered in advance.
 */
class GithubPRCache {
    constructor() {
        this.prs = new Map();
        this.page = 1;
        this.octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN,
        });
        this.next();
    }
    async next() {
        let ret;
        if (this._next_req) {
            ret = await this._next_req;
        }
        console.log(
            `Fetching Github commits ${(this.page - 1) * 100} - ${
                this.page * 100 - 1
            }`,
        );
        this._next_req = this.octokit.request(
            "GET /repos/{owner}/{repo}/pulls?state=closed&per_page={per_page}&page={page}",
            {
                owner: "perspective-dev",
                repo: "perspective",
                per_page: 100,
                page: this.page++,
            },
        );
        return ret;
    }
    async get(sha) {
        while (!this.prs.has(sha) && !this.failed) {
            const resp = await this.next();
            if (resp.data.length == 0) {
                this.failed = true;
            }
            for (const pr of resp.data) {
                this.prs.set(pr.merge_commit_sha, pr);
            }
        }
        return this.prs.get(sha);
    }
}
function template_group(label, rows, prs) {
    if (rows.length > 0) {
        const group_prs = rows
            .map((merge) => `- ${merge.message} [#${merge.id}](${merge.href})`)
            .join("\n");
        return `${label}\n\n${group_prs}\n`;
    } else {
        return "";
    }
}
function template_release(args) {
    const prs = Object.keys(args.row)
        .map((label) => template_group(label, args.row[label]))
        .filter((x) => x.length > 0)
        .join("\n");
    return `# [${args.release.title}](https://github.com/perspective-dev/perspective/releases/tag/${args.release.title})

_${args.release.niceDate}_ ([Full changelog](${args.release.href}))

${prs}
`;
}

/**
 * Generate the changelog text from the output of `auto-changelog`, iteratively calling
 * Github's API when necessary to get label information for grouping.
 *
 * @param {*} json the output data from `auto-changelog`
 * @returns
 */
async function template(json) {
    const cache = new GithubPRCache();
    let changelog = "";
    for (const release of json) {
        const row = {
            "**Breaking**": [],
            Features: [],
            Fixes: [],
            Misc: [],
        };
        for (const merge of release.merges) {
            const pr = await cache.get(merge.commit.hash);
            merge.pr = pr;
            if (pr) {
                const labels = pr.labels.map((x) => x.name);
                if (labels.indexOf("breaking") > -1) {
                    row["**Breaking**"].push(merge);
                } else if (labels.indexOf("enhancement") > -1) {
                    row.Features.push(merge);
                } else if (labels.indexOf("bug") > -1) {
                    row.Fixes.push(merge);
                } else {
                    row.Misc.push(merge);
                }
            } else {
                row.Misc.push(merge);
            }
        }
        changelog += template_release({
            row,
            release,
        });
    }
    return changelog;
}

/**
 * Update the `CHANGELOG.md` file from Github API.
 */
async function update_changelog() {
    let options = {
        remote: "origin",
        commitLimit: 10000,
        backfillLimit: 10000,
        tagPrefix: "",
        sortCommits: "relevance",
        appendGitLog: "",
        appendGitTag: "",
        latestVersion: NEW_VERSION,
    };
    const remote = await fetchRemote(options);
    options = {
        ...options,
        ...remote,
    };
    console.log("Fetching tags…");
    const tags = await fetchTags(options);
    console.log(`${tags.length} version tags found…`);
    const onParsed = ({ title }) => console.log(`Fetched ${title}…`);
    const json = await parseReleases(tags, options, onParsed);
    const changelog = await template(json);
    fs.writeFileSync("./CHANGELOG.md", changelog);
    $.sync`git add CHANGELOG.md`;
}

/**
 * Update all project `package.json` files.
 */
async function update_package_jsons() {
    const pkg = JSON.parse(fs.readFileSync("./package.json"));
    pkg.version = NEW_VERSION;
    const pkg_json = `${JSON.stringify(pkg, undefined, 4)}\n`;
    fs.writeFileSync("./package.json", pkg_json);
    const packages = {};
    for (const ws of pkg.workspaces) {
        if (ws === "packages/jupyterlab" && IS_NIGHTLY) {
            continue;
        }

        for (const path of glob.sync(`${ws}/package.json`, {
            sync: true,
        })) {
            const pkg = JSON.parse(fs.readFileSync(path));
            pkg.version = NEW_VERSION;
            fs.writeFileSync(path, JSON.stringify(pkg, undefined, 4) + "\n");
            packages[pkg.name] = {
                pkg,
                path,
            };
        }
    }

    const cargo = toml.parse(fs.readFileSync("./Cargo.toml"));
    for (const pkg of cargo.workspace.members) {
        const crate = toml.parse(fs.readFileSync(`./${pkg}/Cargo.toml`));
        if (crate?.package.version) {
            crate.package.version = NEW_VERSION;
        }

        for (const key of Object.keys(crate?.dependencies)) {
            if (key.startsWith("perspective")) {
                crate.dependencies[key].version = `~${NEW_VERSION}`;
            }
        }
        fs.writeFileSync(`./${pkg}/Cargo.toml`, toml.stringify(crate));
    }

    // if (!IS_NIGHTLY) {
    const pyproject = toml.parse(
        fs.readFileSync(`./rust/perspective-python/pyproject.toml`),
    );

    pyproject.tool.maturin.data = `perspective_python-${NEW_VERSION}.data`;
    fs.writeFileSync(
        `./rust/perspective-python/pyproject.toml`,
        toml.stringify(pyproject),
    );
    // }
}

if (!IS_NIGHTLY) {
    if (!process.env.GITHUB_TOKEN) {
        throw new Error("Missing GITHUB_TOKEN");
    }

    await update_changelog();
}

await update_package_jsons();

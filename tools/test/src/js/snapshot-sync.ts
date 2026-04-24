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

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_ROOT = path.resolve(__dirname, "..", "..");
const CACHE_DIR = path.join(TEST_ROOT, "dist", "git_snapshots");
const DEST_DIR = path.join(TEST_ROOT, "dist", "snapshots");
const DEFAULT_REF = "master";

function git(args: string[], cwd: string) {
    execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function remoteHasRef(remoteUrl: string, ref: string): boolean {
    try {
        const out = execFileSync(
            "git",
            ["ls-remote", "--heads", remoteUrl, ref],
            { stdio: ["ignore", "pipe", "pipe"] },
        )
            .toString()
            .trim();
        return out.length > 0;
    } catch {
        return false;
    }
}

function buildRemoteUrl(repo: string, token: string | undefined): string {
    if (token) {
        return `https://x-access-token:${token}@github.com/${repo}.git`;
    }
    return `git@github.com:${repo}.git`;
}

function mirrorSnapshots(srcRoot: string, dest: string) {
    const srcSnapshots = path.join(srcRoot);
    if (!fs.existsSync(srcSnapshots)) {
        throw new Error(
            `Snapshot clone at ${srcRoot} does not contain dist/snapshots/`,
        );
    }

    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(srcSnapshots, dest, { recursive: true });
}

export async function fetchSnapshots(): Promise<void> {
    const repo = process.env.PSP_SNAPSHOT_REPO;
    if (!repo) {
        throw new Error(
            "PSP_SNAPSHOT_REPO is required when fetching snapshots (e.g. 'perspective-dev/perspective-snapshots').",
        );
    }

    const token =
        process.env.PSP_SNAPSHOT_TOKEN || process.env.GITHUB_TOKEN || undefined;
    const requestedRef = process.env.PSP_SNAPSHOT_REF || DEFAULT_REF;
    const remoteUrl = buildRemoteUrl(repo, token);

    let ref = requestedRef;
    if (
        requestedRef !== DEFAULT_REF &&
        !remoteHasRef(remoteUrl, requestedRef)
    ) {
        console.log(
            `Snapshot branch '${requestedRef}' not found on ${repo}; falling back to '${DEFAULT_REF}'.`,
        );
        ref = DEFAULT_REF;
    }

    const cacheGitDir = path.join(CACHE_DIR, ".git");
    if (fs.existsSync(cacheGitDir)) {
        try {
            git(["remote", "set-url", "origin", remoteUrl], CACHE_DIR);
            git(["fetch", "--depth", "1", "origin", ref], CACHE_DIR);
            git(["checkout", "-B", ref, "FETCH_HEAD"], CACHE_DIR);
            git(["reset", "--hard", "FETCH_HEAD"], CACHE_DIR);
            git(["clean", "-fdx"], CACHE_DIR);
        } catch {
            fs.rmSync(CACHE_DIR, { recursive: true, force: true });
        }
    }

    if (!fs.existsSync(cacheGitDir)) {
        fs.mkdirSync(path.dirname(CACHE_DIR), { recursive: true });
        execFileSync(
            "git",
            [
                "clone",
                "--depth",
                "1",
                "--filter=blob:none",
                "--branch",
                ref,
                remoteUrl,
                CACHE_DIR,
            ],
            { stdio: ["ignore", "pipe", "pipe"] },
        );
    }

    console.log(`Fetched snapshots from ${repo}@${ref}`);
    mirrorSnapshots(CACHE_DIR, DEST_DIR);
}

export async function writebackSnapshots(): Promise<void> {
    if (!fs.existsSync(path.join(CACHE_DIR, ".git"))) {
        console.log(
            `No snapshot clone at ${CACHE_DIR}; skipping writeback. Run with --fetch-snapshots first to populate the cache.`,
        );
        return;
    }
    if (!fs.existsSync(DEST_DIR)) {
        return;
    }
    fs.cpSync(DEST_DIR, CACHE_DIR, { recursive: true, force: true });
    console.log(`Copied updated snapshots into ${CACHE_DIR}`);
}

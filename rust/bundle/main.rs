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

#![feature(lazy_cell)]

use std::path::Path;
use std::process::{exit, Command};

use clap::*;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct BundleArgs {
    /// Artifact name
    artifact: String,

    /// Compile in release mode?
    #[arg(short, long)]
    release: bool,

    /// Extra features to build with
    #[arg(long)]
    features: Option<String>,
}

use wasm_bindgen_cli_support::Bindgen;
use wasm_opt::OptimizationOptions;

/// Run the packages `build` task with the appropriate flags. These can't be
/// defined in the `/.cargo/config.toml` because they would define this build
/// script's parameters also, and there is no way to reset e.g. the `target`
/// field to the host platform.
fn build(pkg: Option<&str>, is_release: bool, features: Vec<String>) {
    let mut debug_flags = vec![];
    if is_release {
        debug_flags.push("--release");
    }

    let mut cmd = Command::new("cargo");
    let features = format!("tracing/release_max_level_warn,{}", features.join(","));
    cmd.env("RUSTFLAGS", "--cfg=web_sys_unstable_apis")
        .args(["build"])
        .args(["--features", &features])
        .args(["--target", "wasm32-unknown-unknown"])
        .args(["-Z", "build-std=std,panic_abort"])
        .args(["-Z", "build-std-features=panic_immediate_abort"])
        .args(debug_flags);

    if let Some(pkg) = pkg {
        cmd.args(["-p", pkg]);
    }

    cmd.execute()
}

/// Generate the `wasm-bindgen` JavaScript and WASM bindings.
fn bindgen(outdir: &Path, artifact: &str, is_release: bool) {
    let input = Path::new("../target/wasm32-unknown-unknown")
        .join(if is_release { "release" } else { "debug" })
        .join(format!("{}.wasm", artifact));

    Bindgen::new()
        .web(true)
        .unwrap()
        .input_path(input)
        .typescript(true)
        .out_name(&format!("{}.wasm", artifact.replace('_', "-")))
        .generate(outdir)
        .unwrap();
}

/// Run `wasm-opt` and output the new binary on top of the old one.
fn opt(outpath: &Path, is_release: bool) {
    if is_release {
        OptimizationOptions::new_optimize_for_size()
            .one_caller_inline_max_size(15)
            .run(outpath, outpath)
            .unwrap();
    }

    Command::new("cargo")
        .args(["run"])
        .args(["-p", "perspective-bootstrap"])
        .args(["--release"])
        .args(["--target", env!("TARGET")])
        .args(["--"])
        .args([outpath])
        .execute();
}

fn main() {
    let args = BundleArgs::parse();
    let outdir = Path::new("dist/pkg");
    let is_release = args.release;
    let package = args.artifact.clone().replace('_', "-");
    let outpath = &Path::new(outdir).join(format!("{}.wasm", args.artifact.replace('_', "-")));
    let features = args
        .features
        .unwrap_or_default()
        .split(',')
        .map(|x| x.to_string())
        .collect();

    build(Some(package.as_str()), is_release, features);
    bindgen(outdir, args.artifact.as_str(), is_release);
    opt(outpath, is_release);
}

trait SimpleCommand {
    fn execute(&mut self);
}

impl SimpleCommand for Command {
    fn execute(&mut self) {
        match self.status().ok().and_then(|x| x.code()) {
            Some(0) => (),
            Some(x) => exit(x),
            None => exit(1),
        }
    }
}

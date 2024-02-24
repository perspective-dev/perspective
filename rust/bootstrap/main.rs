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

use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{exit, Command};

use clap::*;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use wasm_opt::OptimizationOptions;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct BundleArgs {
    /// Input path
    input: String,

    /// Output path
    #[arg(short, long)]
    output: Option<String>,
}

fn zip(outpath: &Path) {
    let input = std::fs::read(outpath).unwrap();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(&input).unwrap();
    let encoded = encoder.finish().unwrap();
    std::fs::write(outpath, encoded).unwrap();
}

fn main() {
    let args = BundleArgs::parse();
    zip(Path::new(&args.input));
    Command::new("cargo")
        .args(["build"])
        .args(["-p", "perspective-bootstrap-runtime"])
        .args(["--target", "wasm32-unknown-unknown"])
        .args(["--features", "env_target"])
        .args(["-Z", "build-std=std,panic_abort"])
        .args(["-Z", "build-std-features=panic_immediate_abort"])
        .args(["--release"])
        .env("TARGET", &fs::canonicalize(args.input.clone()).unwrap())
        .execute();

    let inpath = Path::new("../target/wasm32-unknown-unknown/release")
        .join("perspective_bootstrap_runtime.wasm");

    OptimizationOptions::new_optimize_for_size()
        .one_caller_inline_max_size(15)
        .run(inpath.clone(), args.output.unwrap_or(args.input))
        .unwrap();
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

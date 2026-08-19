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

use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, exit};

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

use wasm_bindgen_cli_support::{Bindgen, EncodeInto};

/// Run the packages `build` task with the appropriate flags. These can't be
/// defined in the `/.cargo/config.toml` because they would define this build
/// script's parameters also, and there is no way to reset e.g. the `target`
/// field to the host platform.
fn build(pkg: Option<&str>, is_release: bool, features: Vec<String>) {
    let features = format!("tracing/release_max_level_warn,{}", features.join(","));

    // Build RUSTFLAGS including target-specific flags from config.toml and new
    // panic flags These are the flags from .cargo/config.toml for
    // wasm32-unknown-unknown target
    let target_flags = [
        "--cfg=getrandom_backend=\"wasm_js\"",
        "--cfg=web_sys_unstable_apis",
        "-Ctarget-feature=+bulk-memory,+simd128,+relaxed-simd,+reference-types",
    ];

    let rustflags = target_flags.join(" ");
    let mut cmd = Command::new("cargo");
    cmd.env("RUSTFLAGS", rustflags)
        .args(["build"])
        .args(["--lib"])
        .args(["--features", &features])
        .args(["--target", "wasm32-unknown-unknown"])
        .args(["-Z", "build-std=std,panic_abort"]);

    if is_release {
        cmd.args(["--release"]);
    }

    if let Some(pkg) = pkg {
        cmd.args(["-p", pkg]);
    }

    cmd.execute()
}

/// The workspace root, per the repo-wide `$PSP_ROOT_DIR` convention (set by
/// each package's `build.mjs`).
fn root_dir() -> Option<PathBuf> {
    Some(PathBuf::from(env::var("PSP_ROOT_DIR").ok()?))
}

/// The `cargo` target directory: `$CARGO_TARGET_DIR` when set (which
/// [`build`]'s `cargo` invocation honors too, keeping the two coherent),
/// else the workspace-config target directory under `$PSP_ROOT_DIR`.
fn target_dir() -> PathBuf {
    let dir = env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .ok()
        .or_else(|| Some(root_dir()?.join("rust/target")));

    let Some(dir) = dir else {
        eprintln!("Set $PSP_ROOT_DIR (or $CARGO_TARGET_DIR) to locate build artifacts.");
        exit(1);
    };

    dir
}

/// Generate the `wasm-bindgen` JavaScript and WASM bindings.
fn bindgen(outdir: &Path, artifact: &str, is_release: bool) {
    let input = target_dir()
        .join("wasm32-unknown-unknown")
        .join(if is_release { "release" } else { "debug" })
        .join(format!("{artifact}.wasm"));

    Bindgen::new()
        .web(true)
        .unwrap()
        .keep_debug(!is_release)
        .input_path(input)
        .encode_into(EncodeInto::Always)
        .typescript(true)
        // .reference_types(true)
        .out_name(&format!("{}.wasm", artifact.replace('_', "-")))
        .generate(outdir)
        .unwrap();
}

/// The oldest Binaryen accepted. Version 116 verifiably lacks `table.fill`
/// parsing, which wasm-bindgen's externref pass emits when the artifact is
/// built without `strip`; `install_binaryen.mjs` pins 132. The floor is
/// defensive, not exact.
const WASM_OPT_MIN_VERSION: u32 = 118;

/// One command line for EVERY bundle build. The feature set is the union of
/// what `build`'s RUSTFLAGS request and what the `target_features` section
/// advertises un-stripped (among them `multivalue`, which `wasm-bindgen`
/// auto-enables from that same section). `-g` preserves the name section
/// when one exists; on a stripped artifact it costs only an empty
/// name-section header, so prod and dev need not diverge.
const WASM_OPT_ARGS: &[&str] = &[
    "-Oz",
    "--enable-bulk-memory",
    "--enable-reference-types",
    "--enable-simd",
    "--enable-relaxed-simd",
    "--enable-nontrapping-float-to-int",
    "--enable-multivalue",
    "--enable-sign-ext",
    "--enable-mutable-globals",
    "-g",
];

/// Locate the Binaryen `wasm-opt` binary: `$WASM_OPT`, the native toolchain
/// installed by `tools/scripts/install_binaryen.mjs` under `$PSP_ROOT_DIR`,
/// then `$PATH`.
fn find_wasm_opt() -> Option<PathBuf> {
    if let Ok(path) = env::var("WASM_OPT") {
        return Some(PathBuf::from(path));
    }

    if let Some(toolchain) = root_dir().map(|x| x.join(".binaryen/bin/wasm-opt"))
        && toolchain.exists()
    {
        return Some(toolchain);
    }

    Some(PathBuf::from("wasm-opt")).filter(|x| {
        Command::new(x)
            .arg("--version")
            .output()
            .is_ok_and(|x| x.status.success())
    })
}

/// Binaryen's major version, from `wasm-opt --version`.
fn wasm_opt_version(bin: &Path) -> Option<u32> {
    let output = Command::new(bin).arg("--version").output().ok()?;
    String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .find_map(|x| x.parse().ok())
}

/// Run `wasm-opt` and output the new binary on top of the old one.
fn opt(outpath: &Path, is_release: bool) {
    if !is_release {
        return;
    }

    let Some(bin) = find_wasm_opt() else {
        eprintln!(
            "`wasm-opt` (Binaryen >= {WASM_OPT_MIN_VERSION}) is required. `pnpm run \
             postinstall:binaryen` installs it under $PSP_ROOT_DIR/.binaryen, or set $WASM_OPT."
        );

        exit(1);
    };

    match wasm_opt_version(&bin) {
        Some(version) if version >= WASM_OPT_MIN_VERSION => (),
        version => {
            let version = version.map_or("unknown".to_string(), |x| x.to_string());
            eprintln!(
                "{} is Binaryen version {version}; version >= {WASM_OPT_MIN_VERSION} is required \
                 (`table.fill` parsing, emitted by wasm-bindgen's externref pass on un-stripped \
                 artifacts).",
                bin.display(),
            );

            exit(1);
        },
    }

    Command::new(&bin)
        .args(WASM_OPT_ARGS)
        .arg(outpath)
        .arg("-o")
        .arg(outpath)
        .execute();
}

fn main() {
    let args = BundleArgs::parse();
    let outdir = Path::new("dist/wasm");
    let is_release = args.release;
    let package = args.artifact.clone().replace('_', "-");
    let outpath = &Path::new(outdir).join(format!(
        "{}.wasm",
        args.artifact.replace("-js", "").replace('_', "-")
    ));

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

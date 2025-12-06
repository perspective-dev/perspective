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

use std::fs;
use std::path::{Path, PathBuf};

use cmake::Config;
use protobuf_src::protoc;
use shlex::Shlex;

fn main() -> Result<(), std::io::Error> {
    if std::env::var("DOCS_RS").is_ok() {
        return Ok(());
    }

    if std::option_env!("PSP_DISABLE_CPP").is_none()
        && std::env::var("CARGO_FEATURE_DISABLE_CPP").is_err()
    {
        if let Some(artifact_dir) = cmake_build()? {
            cmake_link_deps(&artifact_dir)?;
        }
    }

    Ok(())
}

fn cmake_build() -> Result<Option<PathBuf>, std::io::Error> {
    let mut dst = Config::new("cpp/perspective");
    if let Some(cpp_build_dir) = std::option_env!("PSP_CPP_BUILD_DIR") {
        std::fs::create_dir_all(cpp_build_dir)?;
        dst.out_dir(cpp_build_dir);
    }

    let profile = std::env::var("PROFILE").unwrap();
    dst.always_configure(true);
    dst.define("CMAKE_BUILD_TYPE", profile.as_str());
    dst.define("ARROW_BUILD_EXAMPLES", "OFF");
    dst.define("RAPIDJSON_BUILD_EXAMPLES", "OFF");
    dst.define("ARROW_CXX_FLAGS_DEBUG", "-Wno-error");
    dst.define("PSP_PROTOC_PATH", protoc().parent());
    dst.define("CMAKE_COLOR_DIAGNOSTICS", "ON");
    dst.define(
        "PSP_PROTO_PATH",
        std::env::var("DEP_PERSPECTIVE_CLIENT_PROTO_PATH").unwrap(),
    );

    dst.env(
        "DEP_PERSPECTIVE_CLIENT_PROTO_PATH",
        std::env::var("DEP_PERSPECTIVE_CLIENT_PROTO_PATH").unwrap(),
    );

    if cfg!(target_os = "macos") {
        // Set CMAKE_OSX_ARCHITECTURES et al. for Mac builds.  Arrow does not forward on
        // CMAKE_OSX_ARCHITECTURES but it does forward on a CMAKE_TOOLCHAIN_FILE. In
        // Conda builds, the environment sets `CMAKE_ARGS` up with various
        // toolchain arguments. This block may need to be patched out or
        // adjusted for Conda.
        let toolchain_file = match std::env::var("PSP_ARCH").as_deref() {
            Ok("x86_64") => Some("./cmake/toolchains/darwin-x86_64.cmake"),
            Ok("aarch64") => Some("./cmake/toolchains/darwin-arm64.cmake"),
            Err(std::env::VarError::NotPresent) => None,
            arch @ Ok(_) | arch @ Err(_) => {
                panic!("Unknown PSP_ARCH value: {arch:?}")
            },
        };

        if let Some(path) = toolchain_file {
            dst.define(
                "CMAKE_TOOLCHAIN_FILE",
                std::fs::canonicalize(path).expect("Failed to canonicalize toolchain file."),
            );
        }
    }

    if std::env::var("TARGET")
        .unwrap_or_default()
        .contains("wasm32")
    {
        dst.define("PSP_WASM_BUILD", "1");
    } else {
        dst.define("PSP_WASM_BUILD", "0");
    }

    if std::env::var("CARGO_FEATURE_PYTHON").is_ok() {
        dst.define("CMAKE_POSITION_INDEPENDENT_CODE", "ON");
        dst.define("PSP_PYTHON_BUILD", "1");
    }

    if std::env::var("CARGO_FEATURE_EXTERNAL_CPP").is_err() {
        dst.env("PSP_DISABLE_CLANGD", "1");
    }

    // WASM Exceptions don't work with the prebuilt Pyodide distribution.
    // It must be rebuilt with WASM exceptions enabled
    if std::env::var("CARGO_FEATURE_WASM_EXCEPTIONS").is_ok() {
        dst.define("PSP_WASM_EXCEPTIONS", "1");
    } else {
        dst.define("PSP_WASM_EXCEPTIONS", "0");
    }

    if !cfg!(windows) {
        dst.build_arg(format!("-j{}", num_cpus::get()));
    }

    // Conda sets CMAKE_ARGS for e.g. cross-compiling toolchain in the environment -
    // normally they are passed directly to a cmake invocation in the recipe,
    // but our conda recipe doesn't directly invoke cmake
    if let Ok(cmake_args) = std::env::var("CMAKE_ARGS") {
        println!("cargo:warning=Setting CMAKE_ARGS from environment {cmake_args:?}");
        for arg in Shlex::new(&cmake_args) {
            dst.configure_arg(arg);
        }
    }

    println!("cargo:warning=Building cmake {profile}");
    if std::env::var("PSP_BUILD_VERBOSE").unwrap_or_default() != "" {
        // checks non-empty env var
        dst.very_verbose(true);
    }

    let artifact_dir = dst.build();
    Ok(Some(artifact_dir))
}

fn cmake_link_deps(cmake_build_dir: &Path) -> Result<(), std::io::Error> {
    println!(
        "cargo:rustc-link-search=native={}/build",
        cmake_build_dir.display()
    );

    // println!("cargo:warning=MESSAGE {}/build", cmake_build_dir.display());
    println!("cargo:rustc-link-lib=static=psp");
    link_cmake_static_archives(cmake_build_dir)?;
    println!("cargo:rerun-if-changed=cpp/perspective");
    Ok(())
}

/// Walk the cmake output path and emit link instructions for all archives.
/// TODO Can this be faster pls?
/// TODO update apparently not https://github.com/rust-lang/cmake-rs/issues/149
fn link_cmake_static_archives(dir: &Path) -> Result<(), std::io::Error> {
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let path = entry?.path();
            if path.is_dir() {
                link_cmake_static_archives(&path)?;
            } else {
                let ext = path.extension().as_ref().map(|x| x.to_string_lossy());
                let stem = path.file_stem().as_ref().map(|x| x.to_string_lossy());
                let is_archive = (cfg!(windows)
                    && ext.as_deref() == Some("lib")
                    && stem.as_deref() != Some("perspective"))
                    || (!cfg!(windows) && ext.as_deref() == Some("a"));
                if is_archive {
                    let a = if cfg!(windows) {
                        stem.unwrap().to_string()
                    } else {
                        stem.expect("bad")[3..].to_string()
                    };

                    // println!("cargo:warning=static link {} {}", a, dir.display());
                    println!("cargo:rustc-link-search=native={}", dir.display());
                    println!("cargo:rustc-link-lib=static={a}");
                }
            }
        }
    }

    Ok(())
}

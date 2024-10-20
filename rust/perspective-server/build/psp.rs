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
use shlex::Shlex;

pub fn cmake_build() -> Result<Option<PathBuf>, std::io::Error> {
    let mut dst = Config::new("cpp/perspective");
    if let Some(cpp_build_dir) = std::option_env!("PSP_CPP_BUILD_DIR") {
        std::fs::create_dir_all(cpp_build_dir)?;
        dst.out_dir(cpp_build_dir);
    }

    let profile = std::env::var("PROFILE").unwrap();
    dst.always_configure(true);
    dst.define("CMAKE_BUILD_TYPE", profile.as_str());
    if std::env::var("PSP_ARCH").as_deref() == Ok("x86_64") {
        dst.define("CMAKE_OSX_ARCHITECTURES", "x86_64");
    } else if std::env::var("PSP_ARCH").as_deref() == Ok("arm64") {
        dst.define("CMAKE_OSX_ARCHITECTURES", "arm64");
    }

    if std::env::var("TARGET")
        .unwrap_or_default()
        .contains("wasm32")
    {
        dst.define("PSP_WASM_BUILD", "1");
    } else {
        dst.define("PSP_WASM_BUILD", "0");
    }

    if cfg!(windows) {
        match std::env::var("VCPKG_ROOT") {
            Ok(vcpkg_root) => {
                dst.define(
                    "CMAKE_TOOLCHAIN_FILE",
                    format!(
                        "{}/scripts/buildsystems/vcpkg.cmake",
                        vcpkg_root.replace("\\", "/")
                    ),
                );
            },
            Err(_) => {
                println!(
                    "cargo:warning=MESSAGE VCPKG_ROOT not set in environment, not setting \
                     CMAKE_TOOLCHAIN_FILE"
                )
            },
        }
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
        println!(
            "cargo:warning=MESSAGE Setting CMAKE_ARGS from enviornment {:?}",
            cmake_args
        );
        for arg in Shlex::new(&cmake_args) {
            dst.configure_arg(arg);
        }
    }

    println!("cargo:warning=MESSAGE Building cmake {}", profile);
    if std::env::var("PSP_BUILD_VERBOSE").unwrap_or_default() != "" {
        // checks non-empty env var
        dst.very_verbose(true);
    }
    let artifact_dir = dst.build();

    Ok(Some(artifact_dir))
}

pub fn cmake_link_deps(cmake_build_dir: &Path) -> Result<(), std::io::Error> {
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
pub fn link_cmake_static_archives(dir: &Path) -> Result<(), std::io::Error> {
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

                    // println!("cargo:warning=MESSAGE static link {} {}", a, dir.display());
                    println!("cargo:rustc-link-search=native={}", dir.display());
                    println!("cargo:rustc-link-lib=static={}", a);
                }
            }
        }
    }

    Ok(())
}

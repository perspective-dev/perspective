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

use python_config::PythonConfig;

fn main() {
    pyo3_build_config::add_extension_module_link_args();
    if std::env::var("CARGO_FEATURE_BUILDPYTHON").is_ok() {
        println!("cargo:warning=MESSAGE Building cmake");
        use cmake::Config;

        // let reconfigure = !std::path::Path::new("perspective/libpsp.so").exists();
        let cfg = PythonConfig::new(); // Python 3
        let version = cfg.semantic_version().unwrap();
        let lib_dir = format!(
            "{}/perspective",
            std::env::var("CARGO_MANIFEST_DIR").unwrap()
        );

        let _dst = Config::new("../../cpp/perspective")
            .always_configure(true)
            .define("CMAKE_LIBRARY_OUTPUT_DIRECTORY", &lib_dir)
            // .define("CMAKE_LIBRARY_OUTPUT_DIRECTORY_DEBUG", &lib_dir)
            // .define("CMAKE_LIBRARY_OUTPUT_DIRECTORY_RELEASE", &lib_dir)
            .define("PSP_CPP_BUILD", "1")
            .define("CMAKE_BUILD_TYPE", std::env::var("PROFILE").unwrap())
            .define("PSP_WASM_BUILD", "0")
            .define("PSP_PYTHON_BUILD", "1")
            .define(
                "Python_ADDITIONAL_VERSIONS",
                format!("{}.{}", version.major, version.minor),
            )
            .define(
                "Python_FIND_VERSION",
                format!("{}.{}", version.major, version.minor),
            )
            .define(
                "PSP_PYTHON_VERSION",
                format!("{}.{}", version.major, version.minor),
            )
            .define(
                "PYTHON_LIBRARY",
                format!("{}/lib", cfg.exec_prefix().unwrap()),
            )
            .define(
                "PYTHON_INCLUDE_DIR",
                format!("{}/include/python3.11", cfg.exec_prefix().unwrap()),
            )
            // .define(
            //     "Python_EXECUTABLE",
            //     "/Users/texodus/work/perspective/py_modules/bin/python",
            // )
            .build();

        // println!("cargo:warning=MESSAGE Written to {}", dst.display());
        println!("cargo:warning=MESSAGE Building cxx");
        cxx_build::bridge("src/ffi.rs")
            .file("src/server.cpp")
            .include("include")
            .include("../../cpp/perspective/src/include")
            .flag_if_supported("-std=c++17")
            .compile("perspective");

        if cfg!(target_os = "macos") {
            println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path/");
        } else {
            println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN/");
        }

        // println!("cargo:rustc-link-search=native={}/build", dst.display());
        println!("cargo:rustc-link-search=native={}", &lib_dir);
        println!("cargo:rustc-link-lib=psp");

        println!("cargo:rerun-if-changed=perspective/libpsp.so");
        println!("cargo:rerun-if-changed=include/server.h");
        println!("cargo:rerun-if-changed=src/server.cpp");
        println!("cargo:rerun-if-changed=src/lib.rs");
    }
}

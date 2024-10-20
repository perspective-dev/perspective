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

mod psp;

use std::collections::HashSet;
use std::path::Path;
use std::{fs, io};

use base64::prelude::*;
use regex::{Captures, Regex};

pub fn copy_dir_all(
    src: impl AsRef<Path>,
    dst: impl AsRef<Path>,
    skip: &HashSet<&str>,
) -> io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            if !skip.contains(&*entry.file_name().to_string_lossy()) {
                copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()), skip)?;
            }
        } else {
            fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }

    Ok(())
}

fn main() -> Result<(), std::io::Error> {
    if std::env::var("DOCS_RS").is_ok() {
        return Ok(());
    }

    let markdown = fs::read_to_string("./docs/lib.md")?;
    let markdown = Regex::new("<img src=\"(.+?)\"")
        .expect("regex")
        .replace_all(markdown.as_str(), |caps: &Captures| {
            let x = &caps[1];
            let svg = fs::read_to_string(format!("./docs/{}", x)).expect("svg");
            format!(
                "<img src=\"data:image/svg+xml;base64,{}\"",
                base64::prelude::BASE64_STANDARD.encode(svg)
            )
        });

    std::fs::write("docs/lib_gen.md", markdown.as_ref())?;
    if std::env::var("CARGO_FEATURE_EXTERNAL_CPP").is_ok() {
        println!("cargo:warning=MESSAGE Building in development mode");
        let root_dir_env = std::env::var("PSP_ROOT_DIR").expect("Must set PSP_ROOT_DIR");
        let root_dir = Path::new(root_dir_env.as_str());
        copy_dir_all(Path::join(root_dir, "cpp"), "cpp", &HashSet::from(["dist"]))?;
        copy_dir_all(Path::join(root_dir, "cmake"), "cmake", &HashSet::new())?;
        println!(
            "cargo:rerun-if-changed={}/cpp/perspective",
            root_dir.display()
        );
    }

    if std::option_env!("PSP_DISABLE_CPP").is_none()
        && std::env::var("CARGO_FEATURE_DISABLE_CPP").is_err()
    {
        if let Some(artifact_dir) = psp::cmake_build()? {
            psp::cmake_link_deps(&artifact_dir)?;
        }
    }

    Ok(())
}

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
use std::io::Result;
use std::path::Path;

fn main() -> Result<()> {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let proto_file = Path::new(&manifest_dir).join("../../cpp/protos/perspective.proto");
    let include_path = proto_file
        .parent()
        .expect("Couldn't determine parent directory of proto_file")
        .to_path_buf();

    println!("cargo:rerun-if-changed={}", proto_file.to_str().unwrap());
    prost_build::Config::new()
        .bytes(["."])
        .type_attribute(
            "ViewDimensionsResp",
            "#[derive(serde::Serialize,serde::Deserialize)]",
        )
        .type_attribute(
            "TableValidateExprResp",
            "#[derive(serde::Serialize,serde::Deserialize)]",
        )
        // .type_attribute(
        //     "ExprValidationResult.result",
        //     "#[derive(serde::Serialize,serde::Deserialize)]",
        // )
        .type_attribute(
            "ColumnType",
            "#[derive(serde::Serialize,serde::Deserialize)]  #[serde(rename_all = \"snake_case\")]",
        )
        .type_attribute(
            "ExprValidationError",
            "#[derive(serde::Serialize,serde::Deserialize)]",
        )
        .compile_protos(&[proto_file], &[include_path])
        .unwrap();

    std::fs::rename(
        std::env::var("OUT_DIR").unwrap() + "/perspective.proto.rs",
        "src/rust/proto.rs",
    )?;

    Ok(())
}

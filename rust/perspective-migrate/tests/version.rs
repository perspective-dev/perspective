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

use perspective_migrate::{Kind, MigrateError, Migrator, Notice, Version};
use serde_json::{Value, json};

fn workspace(version: &str) -> Value {
    json!({
        "version": version,
        "layout": {"type": "tab-layout", "tabs": ["P"]},
        "panels": {
            "P": {"version": version, "plugin": "Datagrid", "table": "t"}
        }
    })
}

#[test]
fn newer_patch_passes_through_with_notice() {
    let migrator = Migrator::new();
    let schema = migrator.schema_version();
    let newer = Version::new(schema.major, schema.minor, schema.patch + 1).to_string();
    let migrated = migrator
        .migrate(Kind::Workspace, None, workspace(&newer))
        .unwrap();

    assert_eq!(migrated.value, workspace(&newer));
    assert!(migrated.steps.is_empty());
    assert_eq!(migrated.notices, vec![
        Notice::NewerPatch {
            pointer: String::new(),
            version: newer.clone(),
        },
        Notice::NewerPatch {
            pointer: "/panels/P".to_owned(),
            version: newer,
        },
    ]);
}

#[test]
fn newer_patch_from_argument_passes_through_with_notice() {
    let migrator = Migrator::new();
    let schema = migrator.schema_version();
    let newer = Version::new(schema.major, schema.minor, schema.patch + 1).to_string();
    let migrated = migrator
        .migrate(
            Kind::Viewer,
            Some(&newer),
            json!({"plugin": "Datagrid", "group_by": ["x"]}),
        )
        .unwrap();

    assert_eq!(
        migrated.value,
        json!({"plugin": "Datagrid", "group_by": ["x"], "version": newer})
    );
    assert_eq!(migrated.notices, vec![Notice::NewerPatch {
        pointer: String::new(),
        version: newer,
    }]);
}

#[test]
fn newer_minor_or_major_is_rejected() {
    let migrator = Migrator::new();
    let schema = migrator.schema_version();
    for newer in [
        Version::new(schema.major, schema.minor + 1, 0),
        Version::new(schema.major + 1, 0, 0),
    ] {
        let newer = newer.to_string();
        assert_eq!(
            migrator.migrate(Kind::Workspace, None, workspace(&newer)),
            Err(MigrateError::FromFuture { version: newer })
        );
    }
}

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

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use perspective_migrate::{Kind, Migrator};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const CURRENT: &str = "CURRENT";

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Case {
    kind: Kind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    from: Option<String>,
    source: String,
    input: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    output: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
    #[serde(default)]
    notices: Vec<Value>,
    #[serde(default)]
    steps: Vec<String>,
}

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).to_path_buf()
}

fn corpus() -> Vec<(PathBuf, Case)> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(&path, out);
            } else if path.extension().is_some_and(|x| x == "json") {
                out.push(path);
            }
        }
    }

    let mut paths = vec![];
    walk(&root().join("corpus"), &mut paths);
    paths.sort();
    paths
        .into_iter()
        .map(|path| {
            let text = std::fs::read_to_string(&path).unwrap();
            let case =
                serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            (path, case)
        })
        .collect()
}

fn swap_stamps(kind: Kind, value: &mut Value, from: &str, to: &str) {
    let replace = |slot: Option<&mut Value>| {
        if let Some(slot) = slot
            && slot.as_str() == Some(from)
        {
            *slot = Value::from(to);
        }
    };

    replace(value.get_mut("version"));
    if kind == Kind::Workspace
        && let Some(Value::Object(panels)) = value.get_mut("panels")
    {
        for panel in panels.values_mut() {
            replace(panel.get_mut("version"));
        }
    }
}

fn actual(migrator: &Migrator, case: &Case) -> Case {
    let mut out = Case {
        output: None,
        error: None,
        notices: vec![],
        steps: vec![],
        ..case.clone()
    };

    let schema = migrator.schema_version().to_string();
    match migrator.migrate(case.kind, case.from.as_deref(), case.input.clone()) {
        Ok(mut migrated) => {
            swap_stamps(case.kind, &mut migrated.value, &schema, CURRENT);

            out.output = Some(migrated.value);
            out.notices = migrated
                .notices
                .iter()
                .map(|x| serde_json::to_value(x).unwrap())
                .collect();
            out.steps = migrated.steps.iter().map(|x| (*x).to_owned()).collect();
        },
        Err(error) => out.error = Some(serde_json::to_value(error).unwrap()),
    }

    out
}

#[test]
fn corpus_matches() {
    let migrator = Migrator::new();
    let bless = std::env::var("PSP_MIGRATE_BLESS").is_ok();
    let mut failures = vec![];
    for (path, case) in corpus() {
        let actual = actual(&migrator, &case);
        if bless {
            let mut text = vec![];
            let formatter = serde_json::ser::PrettyFormatter::with_indent(b"    ");
            let mut ser = serde_json::Serializer::with_formatter(&mut text, formatter);
            actual.serialize(&mut ser).unwrap();
            text.push(b'\n');
            std::fs::write(&path, text).unwrap();
            continue;
        }

        let expected = json!({
            "output": case.output,
            "error": case.error,
            "notices": case.notices,
            "steps": case.steps,
        });

        let got = json!({
            "output": actual.output,
            "error": actual.error,
            "notices": actual.notices,
            "steps": actual.steps,
        });

        if expected != got {
            failures.push(format!(
                "{}\nexpected: {}\n     got: {}",
                path.display(),
                serde_json::to_string_pretty(&expected).unwrap(),
                serde_json::to_string_pretty(&got).unwrap()
            ));
        }
    }

    assert!(failures.is_empty(), "{}", failures.join("\n\n"));
}

#[test]
fn outputs_are_not_migrated_again() {
    let migrator = Migrator::new();
    let schema = migrator.schema_version().to_string();
    for (path, case) in corpus() {
        let Some(output) = case.output else {
            continue;
        };

        let mut input = output.clone();
        swap_stamps(case.kind, &mut input, CURRENT, &schema);
        let mut migrated = migrator
            .migrate(case.kind, None, input)
            .unwrap_or_else(|e| panic!("{}: {e}", path.display()));

        swap_stamps(case.kind, &mut migrated.value, &schema, CURRENT);
        assert_eq!(migrated.value, output, "{}", path.display());
        assert!(migrated.notices.is_empty(), "{}", path.display());
        assert!(migrated.steps.is_empty(), "{}", path.display());
    }
}

#[test]
fn every_step_is_covered() {
    let migrator = Migrator::new();
    let covered = corpus()
        .into_iter()
        .flat_map(|(_, case)| {
            let failed = case
                .error
                .as_ref()
                .and_then(|x| x.get("step"))
                .and_then(Value::as_str)
                .map(str::to_owned);

            case.steps.into_iter().chain(failed)
        })
        .collect::<BTreeSet<_>>();

    let all = migrator
        .step_ids()
        .into_iter()
        .map(str::to_owned)
        .collect::<BTreeSet<_>>();

    let missing = all.difference(&covered).collect::<Vec<_>>();
    assert!(
        missing.is_empty(),
        "steps without a corpus case: {missing:?}"
    );
}

#[test]
fn view_outputs_are_current() {
    for (path, case) in corpus() {
        if case.kind == Kind::View
            && let Some(output) = case.output
        {
            serde_json::from_value::<perspective_client::config::ViewConfigUpdate>(output)
                .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
        }
    }
}

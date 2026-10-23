#  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
#  ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
#  ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
#  ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
#  ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
#  ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
#  ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
#  ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
#  ┃ This file is part of the Perspective library, distributed under the terms ┃
#  ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
#  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

import pytest

import perspective
from perspective import PerspectiveError, migrate

V2_VIEW = {
    "row_pivot": ["State"],
    "expressions": ['//profit\n"Sales" - "Cost"'],
}


class TestMigrate:
    def test_upgrades_a_2x_engine_config(self):
        assert migrate("view", V2_VIEW, "2.6.0") == {
            "value": {
                "group_by": ["State"],
                "expressions": {"profit": '"Sales" - "Cost"'},
            },
            "notices": [],
            "steps": ["view.v2_aliases", "view.expressions_map"],
        }

    def test_an_upgraded_config_creates_a_view(self):
        client = perspective.Server().new_local_client()
        table = client.table({"State": ["NY", "NJ"], "Sales": [5, 7], "Cost": [1, 2]})
        view = table.view(**migrate("view", V2_VIEW, "2.6.0")["value"])
        assert view.to_columns()["profit"] == [9, 5, 4]

    def test_a_token_version_overrides_from_version(self):
        result = migrate(
            "viewer",
            {
                "version": "5.4.0",
                "plugin": "Datagrid",
                "columns_config": {"Sales": {"number_fg_mode": "bar"}},
            },
            from_version="2.0.0",
        )

        assert result["value"]["columns_config"] == {"Sales": {"fg_mode": "bar"}}
        assert result["steps"] == ["datagrid.mode_renames"]

    def test_rejects_an_unknown_kind(self):
        with pytest.raises(ValueError, match="Unknown config kind"):
            migrate("table", {})

    def test_names_the_step_which_rejected_a_config(self):
        with pytest.raises(PerspectiveError, match="view.v2_aliases"):
            migrate("view", {"row_pivot": ["a"], "group_by": ["b"]}, "2.0.0")

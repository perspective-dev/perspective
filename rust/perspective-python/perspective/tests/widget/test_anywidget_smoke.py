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

import pathlib

import anywidget
import pyarrow as pa
import pytest

import perspective.widget as widget_module
from perspective.widget import PerspectiveWidget

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")

_STATIC = pathlib.Path(widget_module.__file__).parent / "static"


class TestAnyWidgetSmoke:
    def test_instantiates_outside_jupyterlab(self):
        widget = PerspectiveWidget({"a": [1, 2, 3, 4, 5]}, plugin="X Bar")
        assert isinstance(widget, anywidget.AnyWidget)
        assert widget.plugin == "X Bar"

    def test_traits_round_trip(self):
        widget = PerspectiveWidget(
            {"a": [1, 2, 3]}, group_by=["a"], sort=[["a", "desc"]]
        )
        assert widget.group_by == ["a"]
        assert widget.sort == [["a", "desc"]]
        widget.split_by = ["a"]
        assert widget.split_by == ["a"]

    def test_columns_config_and_group_rollup_mode(self):
        widget = PerspectiveWidget({"a": [1, 2, 3]})
        assert widget.columns_config == {}
        assert widget.group_rollup_mode == "rollup"
        assert PerspectiveWidget.columns_config.metadata.get("sync") is True
        assert PerspectiveWidget.group_rollup_mode.metadata.get("sync") is True

        widget = PerspectiveWidget(
            {"a": [1, 2, 3]},
            columns_config={"a": {"fg_mode": "bar"}},
            group_rollup_mode="flat",
        )
        assert widget.columns_config == {"a": {"fg_mode": "bar"}}
        assert widget.group_rollup_mode == "flat"

    def test_frontend_state_update_applies_with_version(self):
        widget = PerspectiveWidget({"a": [1, 2, 3]})
        widget.set_state(
            {
                "plugin": "X Bar",
                "columns": ["a"],
                "group_by": ["a"],
                "settings": False,
                "theme": "Pro Dark",
                "version": "0.0.0",
            }
        )

        assert widget.plugin == "X Bar"
        assert widget.columns == ["a"]
        assert widget.group_by == ["a"]
        assert widget.settings is False
        assert widget.theme == "Pro Dark"
        assert widget.version == "0.0.0"

    def test_not_a_labextension_widget(self):
        widget = PerspectiveWidget({"a": [1, 2, 3]})
        assert widget._model_module == "anywidget"
        assert widget._view_module == "anywidget"
        for attr in (
            "_model_module",
            "_view_module",
            "_model_name",
            "_view_name",
        ):
            assert getattr(widget, attr, "") != "@perspective-dev/jupyterlab"

    def test_esm_css_configured(self):
        assert PerspectiveWidget._esm is not None
        assert PerspectiveWidget._css is not None

    def test_bundle_is_packaged(self):
        esm = _STATIC / "perspective-anywidget.js"
        css = _STATIC / "perspective-anywidget.css"
        if not esm.exists():
            pytest.skip("anywidget bundle not built in this environment")
        assert esm.stat().st_size > 0
        assert css.exists() and css.stat().st_size > 0

    def test_proxy_session_lifecycle(self):
        widget = PerspectiveWidget({"a": [1, 2, 3]})
        widget.handle_message(widget, {"type": "connect", "client_id": "c1"}, [])
        assert "c1" in widget._sessions
        widget.handle_message(widget, {"type": "hangup", "client_id": "c1"}, [])
        assert "c1" not in widget._sessions

    def test_deferred_load_without_data(self):
        widget = PerspectiveWidget(None, group_by=["a"])
        assert widget.group_by == ["a"]

    def test_forwards_list_flatten_with_index(self):
        widget = PerspectiveWidget(
            {"id": [1, 2], "y": [[10, 20], [30]]},
            index="id",
            list_flatten="stringify",
        )

        assert widget.table.get_index() == "id"
        assert widget.table.view().to_columns() == {
            "id": [1, 2],
            "y": ["[10,20]", "[30]"],
        }

    def test_forwards_page_to_disk_and_name(self):
        widget = PerspectiveWidget(
            {"a": [1, 2, 3]}, page_to_disk=True, name="forwarded"
        )

        assert widget.table.get_name() == "forwarded"
        assert widget.table.view().to_columns() == {"a": [1, 2, 3]}

    def test_forwards_map_flatten(self):
        data = pa.table(
            {
                "m": pa.array(
                    [[("a", 1)]], type=pa.map_(pa.string(), pa.int64())
                )
            }
        )

        widget = PerspectiveWidget(data, map_flatten="stringify")
        assert widget.table.view().to_columns() == {"m": ['{"a":1}']}

    def test_table_options_without_data(self):
        with pytest.raises(TypeError):
            PerspectiveWidget(None, list_flatten="stringify")

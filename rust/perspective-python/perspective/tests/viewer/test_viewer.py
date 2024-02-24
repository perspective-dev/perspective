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

import numpy as np
import pandas as pd
from perspective import PerspectiveViewer, Table


class TestViewer:
    def test_viewer_get_table(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer()
        viewer.load(table)
        assert viewer.table == table

    # loading

    def test_viewer_load_table(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer()
        viewer.load(table)
        assert viewer.columns == ["a"]

    def test_viewer_load_named_table(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer()
        viewer.load(table, name="data_1")
        assert viewer.columns == ["a"]
        assert viewer.table_name == "data_1"
        assert viewer.table == table

    def test_viewer_load_data(self):
        viewer = PerspectiveViewer()
        viewer.load({"a": [1, 2, 3]})
        assert viewer.columns == ["a"]

    def test_viewer_load_named_data(self):
        viewer = PerspectiveViewer()
        viewer.load({"a": [1, 2, 3]}, name="data_1")
        assert viewer.columns == ["a"]
        assert viewer.table_name == "data_1"

    def test_viewer_load_schema(self):
        viewer = PerspectiveViewer()
        viewer.load({"a": str, "b": int, "c": bool, "d": str})
        for col in viewer.columns:
            assert col in ["a", "b", "c", "d"]

    def test_viewer_load_table_with_options(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer()
        # options should be disregarded when loading Table
        viewer.load(table, limit=1)
        assert viewer.columns == ["a"]
        assert viewer.table.size() == 3

    def test_viewer_load_data_with_options(self):
        viewer = PerspectiveViewer()
        # options should be forwarded to the Table constructor
        viewer.load({"a": [1, 2, 3]}, limit=1)
        assert viewer.columns == ["a"]
        assert viewer.table.size() == 1

    def test_viewer_load_clears_state(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer(theme="Pro Dark", group_by=["a"])
        viewer.load(table)
        assert viewer.group_by == ["a"]
        viewer.load({"b": [1, 2, 3]})
        assert viewer.group_by == []
        assert viewer.theme == "Pro Dark"  # should not break UI

    def test_viewer_load_np(self):
        table = Table({"a": np.arange(1, 100)})
        viewer = PerspectiveViewer()
        viewer.load(table)
        assert viewer.columns == ["a"]

    def test_viewer_load_np_data(self):
        viewer = PerspectiveViewer()
        viewer.load({"a": np.arange(1, 100)})
        assert viewer.columns == ["a"]
        assert viewer.table.size() == 99

    def test_viewer_load_df(self):
        table = Table(pd.DataFrame({"a": np.arange(1, 100)}))
        viewer = PerspectiveViewer()
        viewer.load(table)
        for col in viewer.columns:
            assert col in ["index", "a"]
        assert viewer.table.size() == 99

    def test_viewer_load_df_data(self):
        viewer = PerspectiveViewer()
        viewer.load(pd.DataFrame({"a": np.arange(1, 100)}))
        for col in viewer.columns:
            assert col in ["index", "a"]

    # update

    def test_viewer_update_dict(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer()
        viewer.load(table)
        viewer.update({"a": [4, 5, 6]})
        assert table.size() == 6
        assert viewer.table.size() == 6
        assert viewer.table.view().to_dict() == {"a": [1, 2, 3, 4, 5, 6]}

    def test_viewer_update_list(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer()
        viewer.load(table)
        viewer.update([{"a": 4}, {"a": 5}, {"a": 6}])
        assert table.size() == 6
        assert viewer.table.size() == 6
        assert viewer.table.view().to_dict() == {"a": [1, 2, 3, 4, 5, 6]}

    def test_viewer_update_df(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer()
        viewer.load(table)
        viewer.update(pd.DataFrame({"a": [4, 5, 6]}))
        assert table.size() == 6
        assert viewer.table.size() == 6
        assert viewer.table.view().to_dict() == {"a": [1, 2, 3, 4, 5, 6]}

    def test_viewer_update_dict_partial(self):
        table = Table({"a": [1, 2, 3], "b": [5, 6, 7]}, index="a")
        viewer = PerspectiveViewer()
        viewer.load(table)
        viewer.update({"a": [1, 2, 3], "b": [8, 9, 10]})
        assert table.size() == 3
        assert viewer.table.size() == 3
        assert viewer.table.view().to_dict() == {"a": [1, 2, 3], "b": [8, 9, 10]}

    # clear

    def test_viewer_clear(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer()
        viewer.load(table)
        viewer.clear()
        assert viewer.table.size() == 0
        assert viewer.table.schema() == {"a": int}

    # replace

    def test_viewer_replace(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer()
        viewer.load(table)
        viewer.replace({"a": [4, 5, 6]})
        assert viewer.table.size() == 3
        assert viewer.table.schema() == {"a": int}
        assert viewer.table.view().to_dict() == {"a": [4, 5, 6]}

    # reset

    def test_viewer_reset(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer(plugin="X Bar", filter=[["a", "==", 2]])
        viewer.load(table)
        assert viewer.filter == [["a", "==", 2]]
        viewer.reset()
        assert viewer.plugin == "Datagrid"
        assert viewer.filter == []

    # delete

    def test_viewer_delete(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer(plugin="X Bar", filter=[["a", "==", 2]])
        viewer.load(table)
        assert viewer.filter == [["a", "==", 2]]
        viewer.delete()
        assert viewer.table_name is None
        assert viewer.table is None

    def test_viewer_delete_without_table(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer(plugin="X Bar", filter=[["a", "==", 2]])
        viewer.load(table)
        assert viewer.filter == [["a", "==", 2]]
        viewer.delete(delete_table=False)
        assert viewer.table_name is not None
        assert viewer.table is not None
        assert viewer.filter == []

    def test_save_restore(self):
        table = Table({"a": [1, 2, 3]})
        viewer = PerspectiveViewer(
            plugin="X Bar", filter=[["a", "==", 2]], expressions={'"a" * 2': '"a" * 2'}
        )
        viewer.load(table)

        # Save config
        config = viewer.save()
        assert viewer.filter == [["a", "==", 2]]
        assert config["filter"] == [["a", "==", 2]]
        assert viewer.plugin == "X Bar"
        assert config["plugin"] == "X Bar"
        assert config["expressions"] == {'"a" * 2': '"a" * 2'}

        # reset configuration
        viewer.reset()
        assert viewer.plugin == "Datagrid"
        assert viewer.filter == []
        assert viewer.expressions == {}

        # restore configuration
        viewer.restore(**config)
        assert viewer.filter == [["a", "==", 2]]
        assert viewer.plugin == "X Bar"
        assert viewer.expressions == {'"a" * 2': '"a" * 2'}

    def test_save_restore_plugin_config(self):
        viewer = PerspectiveViewer(
            plugin="Datagrid", plugin_config={"columns": {"a": {"fixed": 4}}}
        )
        config = viewer.save()

        assert config["plugin_config"] == {"columns": {"a": {"fixed": 4}}}

        viewer.reset()
        assert viewer.plugin_config == {}

        viewer.restore(**config)
        assert viewer.plugin_config == config["plugin_config"]

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

from random import random
from .viewer_traitlets import PerspectiveTraitlets

from ..core.exception import PerspectiveError
from ..legacy import PerspectiveManager, Table


class PerspectiveViewer(PerspectiveTraitlets, object):
    """PerspectiveViewer wraps the `perspective.Table` API and exposes an API
    around creating views, loading data, and updating data.
    """

    # Viewer attributes that should be saved in `save()` and restored using
    # `restore()`. Symmetric to `PERSISTENT_ATTRIBUTES` in `perspective-viewer`.
    PERSISTENT_ATTRIBUTES = (
        "group_by",
        "split_by",
        "filter",
        "sort",
        "aggregates",
        "columns",
        "expressions",
        "plugin",
        "plugin_config",
        "theme",
        "settings",
        "title",
        "version",
    )

    def __init__(
        self,
        plugin="Datagrid",
        columns=None,
        group_by=None,
        split_by=None,
        aggregates=None,
        sort=None,
        filter=None,
        expressions=None,
        plugin_config=None,
        settings=True,
        theme=None,
        title=None,
        # ignored, here for restore compatibility
        version=None,
    ):
        """Initialize an instance of `PerspectiveViewer` with the given viewer
        configuration.  Do not pass a `Table` or data into the constructor -
        use the :func:`load()` method to provide the viewer with data.

        Keyword Arguments:
            columns (:obj:`list` of :obj:`str`): A list of column names to be
                visible to the user.
            group_by (:obj:`list` of :obj:`str`): A list of column names to
                use as group by.
            split_by (:obj:`list` of :obj:`str`): A list of column names
                to use as split by.
            aggregates (:obj:`dict` of :obj:`str` to :obj:`str`):  A dictionary
                of column names to aggregate types, which specify aggregates
                for individual columns.
            sort (:obj:`list` of :obj:`list` of :obj:`str`): A list of lists,
                each list containing a column name and a sort direction
                (``asc``, ``desc``, ``asc abs``, ``desc abs``, ``col asc``,
                ``col desc``, ``col asc abs``, ``col desc abs``).
            filter (:obj:`list` of :obj:`list` of :obj:`str`): A list of lists,
                each list containing a column name, a filter comparator, and a
                value to filter by.
            expressions (:obj:`list` of :obj:`str`): A list of string
                expressions which are applied to the view.
            plugin (:obj:`str`/:obj:`perspective.Plugin`): Which plugin to
                select by default.
            plugin_config (:obj:`dict`): A configuration for the plugin, i.e.
                the datagrid plugin or a chart plugin.
            settings(:obj:`bool`): Whether the perspective query settings
                panel should be open.
            theme (:obj:`str`): The color theme to use.
            version (:obj:`str`): The version this configuration is restored from.
                This should only be used when restoring a configuration,
                and should not be set manually.

        Examples:
            >>> viewer = PerspectiveViewer(
            ...     aggregates={"a": "avg"},
            ...     group_by=["a"],
            ...     sort=[["b", "desc"]],
            ...     filter=[["a", ">", 1]],
            ...     expressions=["\"a\" + 100"]
            ... )
        """

        # Create an instance of `PerspectiveManager`, which receives messages
        # from the `PerspectiveJupyterClient` on the front-end.
        self.manager = PerspectiveManager()

        # The string name of the Table under management by this viewer and its
        # attached PerspectiveManager
        self.table_name = None

        # Viewer configuration
        self.plugin = validate_plugin(plugin)
        self.columns = validate_columns(columns) or []
        self.group_by = validate_group_by(group_by) or []
        self.split_by = validate_split_by(split_by) or []
        self.aggregates = validate_aggregates(aggregates) or {}
        self.sort = validate_sort(sort) or []
        self.filter = validate_filter(filter) or []
        self.expressions = validate_expressions(expressions) or {}
        self.plugin_config = validate_plugin_config(plugin_config) or {}
        self.settings = settings
        self.theme = theme
        self.title = title

    @property
    def table(self):
        """Returns the ``perspective.Table`` under management by the viewer."""
        return self.manager.get_table(self.table_name)

    def load(self, data, **options):
        """Given a ``perspective.Table``, a ``perspective.View``,
        or data that can be handled by ``perspective.Table``, pass it to the
        viewer.  Like `__init__`, load accepts a `perspective.Table`, a dataset,
        or a schema. If running in client mode, `load` defers to the browser's
        Perspective engine. This means that loading Python-only datasets,
        especially ones that cannot be serialized into JSON, may cause some
        issues.

        ``load()`` resets the state of the viewer :

        * If a ``perspective.Table`` has already been  loaded, ``**options`` is
          ignored as the options already set on the ``Table`` take precedence.

        * If a ``perspective.View`` is loaded, the options on the
          ``perspective.Table`` linked to the view take precedence.

        If data is passed in, a ``perspective.Table`` is automatically created
        by this method, and the options passed to ``**config`` are extended to
        the new Table.  If the widget already has a dataset, and the new data
        has different columns to the old one, then the widget state (pivots,
        sort, etc.) is cleared to prevent applying settings on columns that
        don't exist.

        Args:
            data (:obj:`Table`|:obj:`View`|:obj:`dict`|:obj:`list`|:obj:`pandas.DataFrame`|:obj:`bytes`|:obj:`str`): a
                `perspective.Table` instance, a `perspective.View` instance, or
                a dataset to be loaded in the viewer.

        Keyword Arguments:
            name (:obj:`str`): An optional name to reference the table by so it can
                be accessed from the front-end. If not provided, a name will
                be generated.
            index (:obj:`str`): A column name to be used as the primary key.
                Ignored if a ``Table`` or ``View`` is supplied.
            limit (:obj:`int`): A upper limit on the number of rows in the Table.
                Cannot be set at the same time as `index`. Ignored if a
                ``Table`` or ``View`` is supplied.

        Examples:
            >>> from perspective import Table, PerspectiveViewer
            >>> data = {"a": [1, 2, 3]}
            >>> tbl = Table(data)
            >>> viewer = PerspectiveViewer()
            >>> viewer.load(tbl)
            >>> viewer.load(data, index="a") # viewer state is reset
            >>> viewer2 = PerspectiveViewer()
            >>> viewer2.load(tbl.view())

        """
        name = options.pop("name", str(random()))

        if isinstance(data, Table):
            table = data
        elif isinstance(data, View):
            raise PerspectiveError("Only `Table` or data can be loaded.")
        else:
            table = Table(data, **options)

        self.manager.host_table(name, table)

        # Reset the viewer when `load()` is called multiple times.
        if self.table_name is not None:
            self.reset()

        # If the user does not set columns to show, synchronize viewer state
        # with dataset.
        if len(self.columns) == 0:
            self.columns = table.columns()

        self.table_name = name

    def update(self, data):
        """Update the table under management by the viewer with new data.
        This function follows the semantics of `Table.update()`, and will be
        affected by whether an index is set on the underlying table.

        Args:
            data (:obj:`dict`|:obj:`list`|:obj:`pandas.DataFrame`): the
            update data for the table.
        """
        self.table.update(data)

    def clear(self):
        """Clears the rows of this viewer's ``Table``."""
        if self.table is not None:
            self.table.clear()

    def replace(self, data):
        """Replaces the rows of this viewer's `Table` with new data.

        Args:
            data (:obj:`dict`|:obj:`list`|:obj:`pandas.DataFrame`): new data
            to set into the table - must conform to the table's schema.
        """
        if self.table is not None:
            self.table.replace(data)

    def save(self):
        """Get the viewer's attribute as a dictionary, symmetric with `restore`
        so that a viewer's configuration can be reproduced."""
        return {
            attr: getattr(self, attr)
            for attr in PerspectiveViewer.PERSISTENT_ATTRIBUTES
        }

    def restore(self, **kwargs):
        """Restore a given set of attributes, passed as kwargs
        (e.g. dictionary). Symmetric with `save` so that a given viewer's
        configuration can be reproduced."""
        for k, v in kwargs.items():
            if k in PerspectiveViewer.PERSISTENT_ATTRIBUTES:
                setattr(self, k, v)

    def reset(self):
        """Resets the viewer's attributes and state, but does not delete or
        modify the underlying `Table`.

        Example:
            widget = PerspectiveWidget(data, group_by=["date"], plugin=Plugin.XBAR)
            widget.reset()
            widget.plugin  #
        """
        self.group_by = []
        self.split_by = []
        self.filter = []
        self.sort = []
        self.expressions = {}
        self.aggregates = {}
        self.columns = []
        self.plugin = "Datagrid"
        self.plugin_config = {}

    def delete(self, delete_table=True):
        """Delete the Viewer's data and clears its internal state. If
        ``delete_table`` is True, the underlying `perspective.Table` and the
        internal `View` object will be deleted.

        Args:
            delete_table (:obj:`bool`) : whether the underlying `Table` will be
                deleted. Defaults to True.
        """
        if delete_table:
            # Delete all created views on the widget's manager instance
            for view in self.manager._views.values():
                view.delete()

            # Reset view cache
            self.manager._views = {}

            # Delete table
            self.table.delete()
            self.manager._tables.pop(self.table_name)
            self.table_name = None

        self.reset()

    def __setattr__(self, name, value):
        """Override __setattr__ in order to allow Enums to be validated
        through Traitlets."""
        if name in PerspectiveViewer.ENUM_VALIDATORS:
            # call the validator and set
            validated = PerspectiveViewer.ENUM_VALIDATORS[name](value)
            value = validated
        super(PerspectiveViewer, self).__setattr__(name, value)

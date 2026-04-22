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

import base64
import logging
import os
import re
import importlib.metadata
import inspect

from string import Template
from ipywidgets import DOMWidget
from traitlets import Unicode, observe
from .viewer import PerspectiveViewer

__version__ = re.sub(".dev[0-9]+", "", importlib.metadata.version("perspective-python"))

__all__ = ["PerspectiveWidget"]

__doc__ = """
`PerspectiveWidget` is a JupyterLab widget that implements the same API as
`<perspective-viewer>`, allowing for fast, intuitive
transformations/visualizations of various data formats within JupyterLab.

`PerspectiveWidget` is compatible with Jupyterlab 3 and Jupyter Notebook 6 via a
[prebuilt extension](https://jupyterlab.readthedocs.io/en/stable/extension/extension_dev.html#prebuilt-extensions).
To use it, simply install `perspective-python` and the extensions should be
available.

`perspective-python`'s JupyterLab extension also provides convenient builtin
viewers for `csv`, `json`, or `arrow` files. Simply right-click on a file with
this extension and choose the appropriate `Perpective` option from the context
menu.

## `PerspectiveWidget`

Building on top of the API provided by `perspective.Table`, the
`PerspectiveWidget` is a JupyterLab plugin that offers the entire functionality
of Perspective within the Jupyter environment. It supports the same API
semantics of `<perspective-viewer>`, along with the additional data types
supported by `perspective.Table`. `PerspectiveWidget` takes keyword arguments
for the managed `View`:

```python
from perspective.widget import PerspectiveWidget
w = perspective.PerspectiveWidget(
    data,
    plugin="X Bar",
    aggregates={"datetime": "any"},
    sort=[["date", "desc"]]
)
```

### Creating a widget

A widget is created through the `PerspectiveWidget` constructor, which takes as
its first, required parameter a `perspective.Table`, a dataset, a schema, or
`None`, which serves as a special value that tells the Widget to defer loading
any data until later. In maintaining consistency with the Javascript API,
Widgets cannot be created with empty dictionaries or lists—`None` should be used
if the intention is to await data for loading later on. A widget can be
constructed from a dataset:

```python
from perspective.widget import PerspectiveWidget
PerspectiveWidget(data, group_by=["date"])
```

.. or a schema:

```python
PerspectiveWidget({"a": int, "b": str})
```

.. or an instance of a `perspective.Table`:

```python
table = perspective.table(data)
PerspectiveWidget(table)
```
"""


class PerspectiveWidget(DOMWidget, PerspectiveViewer):
    """`PerspectiveWidget` allows for Perspective to be used as a Jupyter
    widget.

    Using `perspective.Table`, you can create a widget that extends the full
    functionality of `perspective-viewer`.  Changes on the viewer can be
    programatically set on the `PerspectiveWidget` instance.

    # Examples

    >>> from perspective.widget import PerspectiveWidget
    >>> data = {
    ...     "a": [1, 2, 3],
    ...     "b": [
    ...         "2019/07/11 7:30PM",
    ...         "2019/07/11 8:30PM",
    ...         "2019/07/11 9:30PM"
    ...     ]
    ... }
    >>> widget = PerspectiveWidget(
    ...     data,
    ...     group_by=["a"],
    ...     sort=[["b", "desc"]],
    ...     filter=[["a", ">", 1]]
    ... )
    >>> widget.sort
    [["b", "desc"]]
    >>> widget.sort.append(["a", "asc"])
    >>> widget.sort
    [["b", "desc"], ["a", "asc"]]
    >>> widget.table.update({"a": [4, 5]}) # Browser UI updates
    """

    # Required by ipywidgets for proper registration of the backend
    _model_name = Unicode("PerspectiveModel").tag(sync=True)
    _model_module = Unicode("@perspective-dev/jupyterlab").tag(sync=True)
    _model_module_version = Unicode("~{}".format(__version__)).tag(sync=True)
    _view_name = Unicode("PerspectiveView").tag(sync=True)
    _view_module = Unicode("@perspective-dev/jupyterlab").tag(sync=True)
    _view_module_version = Unicode("~{}".format(__version__)).tag(sync=True)

    def __init__(
        self,
        data,
        index=None,
        limit=None,
        binding_mode="server",
        **kwargs,
    ):
        """Initialize an instance of `PerspectiveWidget`
        with the given table/data and viewer configuration.

        If an `AsyncTable` is passed in, then certain widget methods like
        `update()` and `delete()` return coroutines which must be awaited.

        # Arguments

        -   `data` (`Table`|`AsyncTable`|`dict`|`list`|`pandas.DataFrame`|`bytes`|`str`): a
            `perspective.Table` instance, a `perspective.AsyncTable` instance, or
            a dataset to be loaded in the widget.

        # Keyword Arguments

        -   `index` (`str`): A column name to be used as the primary key.
            Ignored if `server` is True.
        -   `binding_mode` (`str`): "client-server" or "server"
        -   `limit` (`int`): A upper limit on the number of rows in the Table.
            Cannot be set at the same time as `index`, ignored if `server`
            is True.
        -   `kwargs` (`dict`): configuration options for the `PerspectiveViewer`,
            and `Table` constructor if `data` is a dataset.

        # Examples

        >>> widget = PerspectiveWidget(
        ...     {"a": [1, 2, 3]},
        ...     aggregates={"a": "avg"},
        ...     group_by=["a"],
        ...     sort=[["b", "desc"]],
        ...     filter=[["a", ">", 1]],
        ...     expressions=["\"a\" + 100"])
        """

        self.binding_mode = binding_mode

        # Pass table load options to the front-end, unless in server mode
        self._options = {}

        if index is not None and limit is not None:
            raise TypeError("Index and Limit cannot be set at the same time!")

        # Parse the dataset we pass in - if it's Pandas, preserve pivots
        # if isinstance(data, pandas.DataFrame) or isinstance(data, pandas.Series):
        #     data, config = deconstruct_pandas(data)

        #     if config.get("group_by", None) and "group_by" not in kwargs:
        #         kwargs.update({"group_by": config["group_by"]})

        #     if config.get("split_by", None) and "split_by" not in kwargs:
        #         kwargs.update({"split_by": config["split_by"]})

        #     if config.get("columns", None) and "columns" not in kwargs:
        #         kwargs.update({"columns": config["columns"]})

        # Initialize the viewer
        super(PerspectiveWidget, self).__init__(**kwargs)

        # Handle messages from the the front end
        self.on_msg(self.handle_message)
        self._sessions = {}

        # If an empty dataset is provided, don't call `load()` and wait
        # for the user to call `load()`.
        if data is None:
            if index is not None or limit is not None:
                raise TypeError(
                    "Cannot initialize PerspectiveWidget `index` or `limit` without a Table, data, or schema!"
                )
        else:
            if index is not None:
                self._options.update({"index": index})

            if limit is not None:
                self._options.update({"limit": limit})

            loading = self.load(data, **self._options)
            if inspect.isawaitable(loading):
                import asyncio

                asyncio.create_task(loading)

    def load(self, data, **options):
        """Load the widget with data."""
        # Viewer will ignore **options if `data` is a Table or View.
        return super(PerspectiveWidget, self).load(data, **options)

    def update(self, data):
        """Update the widget with new data."""
        return super(PerspectiveWidget, self).update(data)

    def clear(self):
        """Clears the widget's underlying `Table`."""
        return super(PerspectiveWidget, self).clear()

    def replace(self, data):
        """Replaces the widget's `Table` with new data conforming to the same
        schema. Does not clear user-set state. If in client mode, serializes
        the data and sends it to the browser.
        """
        return super(PerspectiveWidget, self).replace(data)

    def delete(self, delete_table=True):
        """Delete the Widget's data and clears its internal state.

        # Arguments

        -   `delete_table` (`bool`): whether the underlying `Table` will be
            deleted. Defaults to True.
        """
        ret = super(PerspectiveWidget, self).delete(delete_table)

        # Close the underlying comm and remove widget from the front-end
        self.close()
        return ret

    @observe("value")
    def handle_message(self, widget, content, buffers):
        """Given a message from `PerspectiveJupyterClient.send`, process the
        message and return the result to `self.post`.

        # Arguments

        -   `widget`: a reference to the `Widget` instance that received the
            message.
        -   `content` (dict): - the message from the front-end. Automatically
            de-serialized by ipywidgets.
        -   `buffers`: optional arraybuffers from the front-end, if any.
        """
        if content["type"] == "connect":
            client_id = content["client_id"]
            logging.debug("view {} connected", client_id)

            def send_response(msg):
                self.send({"type": "binary_msg", "client_id": client_id}, [msg])

            self._sessions[client_id] = self.new_proxy_session(send_response)
        elif content["type"] == "binary_msg":
            [binary_msg] = buffers
            client_id = content["client_id"]
            session = self._sessions[client_id]
            if session is not None:
                import asyncio

                asyncio.create_task(session.handle_request_async(binary_msg))
            else:
                logging.error("No session for client_id {}".format(client_id))
        elif content["type"] == "hangup":
            # XXX(tom): client won't reliably send this so shouldn't rely on it
            # to clean up; does jupyter notify us when the client on the
            # websocket, i.e. the view, disconnects?
            client_id = content["client_id"]
            logging.debug("view {} hangup", client_id)
            session = self._sessions.pop(client_id, None)
            if session:
                session.close()

    def _repr_mimebundle_(self, **kwargs):
        super_bundle = super(DOMWidget, self)._repr_mimebundle_(**kwargs)
        if not _jupyter_html_export_enabled():
            return super_bundle

        # Serialize viewer attrs + view data to be rendered in the template
        viewer_attrs = self.save()
        data = self.table.view().to_arrow()
        b64_data = base64.encodebytes(data)
        template_path = os.path.join(
            os.path.dirname(__file__), "../templates/exported_widget.html.template"
        )
        with open(template_path, "r") as template_data:
            template = Template(template_data.read())

        def psp_cdn(module, path=None):
            if path is None:
                path = f"cdn/{module}.js"

            # perspective developer affordance: works with your local `pnpm run start blocks`
            # return f"http://localhost:8080/node_modules/@perspective-dev/{module}/dist/{path}"
            return f"https://cdn.jsdelivr.net/npm/@perspective-dev/{module}@{__version__}/dist/{path}"

        return super(DOMWidget, self)._repr_mimebundle_(**kwargs) | {
            "text/html": template.substitute(
                psp_cdn_perspective=psp_cdn("perspective"),
                psp_cdn_perspective_viewer=psp_cdn("perspective-viewer"),
                psp_cdn_perspective_viewer_datagrid=psp_cdn(
                    "perspective-viewer-datagrid"
                ),
                psp_cdn_perspective_viewer_d3fc=psp_cdn("perspective-viewer-charts"),
                psp_cdn_perspective_viewer_themes=psp_cdn(
                    "perspective-viewer-themes", "css/themes.css"
                ),
                viewer_id=self.model_id,
                viewer_attrs=viewer_attrs,
                b64_data=b64_data.decode("utf-8"),
            )
        }


def _jupyter_html_export_enabled():
    return os.environ.get("PSP_JUPYTER_HTML_EXPORT", None) == "1"


def set_jupyter_html_export(val):
    """Enables HTML export for Jupyter widgets, when set to True.
    HTML export can also be enabled by setting the environment variable
    `PSP_JUPYTER_HTML_EXPORT` to the string `1`.
    """
    os.environ["PSP_JUPYTER_HTML_EXPORT"] = "1" if val else "0"

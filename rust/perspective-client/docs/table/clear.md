Removes all the rows in the [`Table`], but preserves everything else including
the schema, index, and any callbacks or registered [`View`] instances.

Calling [`clear()`], like [`update()`] and [`remove()`], will trigger an update event
to any registered listeners via [`on_update()`].

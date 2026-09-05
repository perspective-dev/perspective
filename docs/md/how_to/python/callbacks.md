# Callbacks and Events

`perspective.Table` allows for `on_update` and `on_delete` callbacks to be
set—simply call `on_update` or `on_delete` with a reference to a function or a
lambda without any parameters:

```python
def update_callback():
    print("Updated!")

# set the update callback
on_update_id = view.on_update(update_callback)


def delete_callback():
    print("Deleted!")

# set the delete callback
on_delete_id = view.on_delete(delete_callback)

# set a lambda as a callback
view.on_delete(lambda: print("Deleted x2!"))
```

If the callback is a named reference to a function, it can be removed with
`remove_update` or `remove_delete`:

```python
view.remove_update(on_update_id)
view.remove_delete(on_delete_id)
```

Callbacks defined with a lambda function cannot be removed, as lambda functions
have no identifier.

`on_remove` fires when rows are removed from a `View`'s `Table` with an `index`,
and receives the port ID and the removed index values as an Apache Arrow
(`bytes`) of one column named after the index:

```python
def remove_callback(port_id, indices):
    print("Removed", client.table(indices).view().to_records())

on_remove_id = view.on_remove(remove_callback)
view.remove_remove(on_remove_id)
```

Register a callback which is called exactly once, when this [`Table`] is deleted
with the [`Table::delete`] method.

[`Table::on_delete`] resolves when the subscription message is sent, not when
the _delete_ event occurs.

Delete this [`Table`] and cleans up associated resources, assuming it has no
[`View`] instances registered to it (which must be deleted first).

[`Table`]s do not stop consuming resources or processing updates when they are
garbage collected in their host language - you must call this method to reclaim
these.

Returns the column names of this [`Table`] in "natural" order (the ordering
implied by the input format).

[```]javascript
const table = await worker.table("x,y\n1,2");
const columns = await table.columns();

// Prints [`["x", "y"]`]
console.log(columns);
[```]

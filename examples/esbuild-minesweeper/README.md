# Minesweeper Example

[Live demo](https://perspective-dev.github.io/examples/esbuild-minesweeper/)

Minesweeper played in a `<perspective-viewer>` Datagrid. The board is a `Table`,
and the game's rules are ExprTK expressions. `restoreWorkspace()` lays out three
panels from `src/workspace.js`: the board, plus two developer panels that give
the game away.

## Running

From the repository root, after building Perspective:

```bash
pnpm run start esbuild-minesweeper
```

# pz-lua-stubgen

A command-line tool for generating Lua typestubs that are compatible with [EmmyLua](https://github.com/EmmyLuaLs/emmylua-analyzer-rust)
and [LuaLS](https://github.com/LuaLS/lua-language-server).

The primary purpose of this tool is to generate the Lua typestubs included in [Umbrella](https://github.com/PZ-Umbrella/Umbrella).
Since it's made with Project Zomboid in mind, it includes some heuristics and class definitions that are specific to that codebase.

## Installation
You can install the tool using `npm`:

```
npm i
npm run build
```

## Usage
The primary command of the tool generates typestubs given a Lua source directory.
From the top-level directory, use:
```
pz-lua-stubgen -i <input-directory> -o <output-directory>`
```

On Linux, use `./pz-lua-stubgen` instead.

When building stubs for Umbrella, some additional flags that should probably be included:
- `-k`, to include a stub for Kahlua functions.
- `-r <stub-data-directory>`, to include [Rosetta](https://github.com/asledgehammer/PZ-Rosetta-Schema) stub data.
- `--helper-pattern ^umbrella\.`, to avoid emitting globals for umbrella helper classes.
- `--no-ambiguity`, to avoid emitting analyzed union types.

For information about other commands and the other available options, use `pz-lua-stubgen --help`.

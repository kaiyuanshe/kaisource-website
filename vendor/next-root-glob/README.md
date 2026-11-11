# Next lint root directory glob adapter

Next ESLint 16.4.0 uses `fast-glob.globSync(pattern, { onlyDirectories: true })`
only in its root directory discovery helper. The current fast-glob/micromatch
chain uses braces 3.0.3, which has an unresolved nesting DoS advisory. This local
adapter replaces that one filesystem operation with tinyglobby 0.2.17 and
picomatch, with a bounded pattern and nesting depth.

All Next ESLint rules remain enabled. Unsupported options fail closed, so a
future Next version using more of the fast-glob API requires review. The adapter
uses `expandDirectories: false` to retain fast-glob matching semantics. Its actual
module resolution and directory/brace matching are covered by
`tests/next-root-glob.test.mjs`.

The root `fast-glob` development dependency and `$fast-glob` override keep this
local package path portable in clean npm installs. This is a replacement
implementation, not a relabeled vulnerable package or an audit suppression.

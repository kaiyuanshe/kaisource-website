// Scoped replacement for Next ESLint's only fast-glob call: globSync(pattern,
// { onlyDirectories: true }). Keep all Next rules while avoiding braces.
const { globSync: tinyGlobSync } = require('tinyglobby');

function globSync(pattern, options = {}) {
  if (typeof pattern !== 'string' || pattern.length > 4096) {
    throw new TypeError('Next root directory pattern must be a bounded string');
  }
  if (Object.keys(options).some(key => key !== 'onlyDirectories') || options.onlyDirectories !== true) {
    throw new TypeError('Only Next directory discovery is supported');
  }
  // Reject adversarial nesting before any glob parser sees the pattern.
  let depth = 0;
  for (const character of pattern) {
    if ('{(['.includes(character) && ++depth > 32) throw new RangeError('Root glob nesting limit');
    if ('})]'.includes(character)) depth = Math.max(0, depth - 1);
  }
  return tinyGlobSync(pattern, { onlyDirectories: true, expandDirectories: false }).map(name => name.replace(/\/$/, ''));
}

module.exports = { globSync };

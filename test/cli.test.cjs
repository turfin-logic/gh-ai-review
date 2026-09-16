const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('compiled CLI loads its dependencies and renders configuration', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../dist/index.js'), 'config'], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Configuration Status:/);
});

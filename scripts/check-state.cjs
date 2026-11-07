const { spawnSync } = require('node:child_process');
// Legacy placement assertions remain regression material; no placement UI is enabled.
for (const script of ['scripts/check-room-state.cjs', 'scripts/check-gift-state.cjs', 'scripts/check-placement-state.cjs', 'scripts/check-room-focus-state.cjs', 'scripts/check-room-definition.cjs', 'scripts/check-room-model-state.cjs', 'scripts/check-photo-state.cjs']) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

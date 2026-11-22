import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMicrophonePermission } from './microphone-permission';

const denied = { granted: false, canAskAgain: true };
const granted = { granted: true, canAskAgain: true };
const active = () => true;

test('resuming during the permission dialog shares one prompt and subsequent starts only check', async () => {
  let status = denied;
  let prompts = 0;
  let resolve!: (status: typeof granted) => void;
  const permission = createMicrophonePermission(async () => status, () => {
    prompts++;
    return new Promise(done => { resolve = done; });
  });
  const first = permission(active);
  const resumed = permission(active);
  await Promise.resolve();
  assert.equal(prompts, 1);
  status = granted;
  resolve(status);
  assert.deepEqual(await Promise.all([first, resumed, permission(active)]), [granted, granted, granted]);
  assert.equal(prompts, 1);
});

test('denial survives foreground changes, and a later settings grant is recognized', async () => {
  let status = denied;
  let prompts = 0;
  const permission = createMicrophonePermission(async () => status, async () => { prompts++; return denied; });
  assert.equal(await permission(() => false), denied);
  assert.equal(prompts, 0);
  assert.equal(await permission(active), status);
  assert.equal(await permission(active), status);
  assert.equal(prompts, 1);
  status = granted;
  assert.equal(await permission(active), granted);
  status = { granted: false, canAskAgain: false };
  assert.equal(await permission(active), status);
  assert.equal(prompts, 1);
});

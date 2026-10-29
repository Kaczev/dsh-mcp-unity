import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { requestProject } from '../lib/project-lifecycle.mjs';
import { installCoderGamester, UPSTREAM } from '../lib/install-codergamester.mjs';
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-lifecycle-'));
  for (const dir of ['Assets', 'ProjectSettings', 'Packages']) await mkdir(path.join(root, dir));
  await writeFile(path.join(root, 'Packages/manifest.json'), JSON.stringify({ dependencies: { other: '1.0' } }));
  return root;
}
test('offline installer preserves dependencies, is repeatable and rejects replacement', async () => {
  const root = await fixture();
  try {
    const deps = { platform: 'win32', processes: async () => [] };
    const result = await installCoderGamester({ projectPath: root }, deps);
    assert.equal(result.ready, false); assert.equal(result.enableStatus, 'pending_editor_start');
    const manifest = JSON.parse(await readFile(path.join(root, 'Packages/manifest.json')));
    assert.equal(manifest.dependencies.other, '1.0'); assert.equal(manifest.dependencies['com.gamelovers.mcp-unity'], UPSTREAM);
    assert.equal((await installCoderGamester({ projectPath: root }, deps)).dependencyAdded, false);
    manifest.dependencies['com.gamelovers.mcp-unity'] = 'other-version';
    await writeFile(path.join(root, 'Packages/manifest.json'), JSON.stringify(manifest));
    await assert.rejects(installCoderGamester({ projectPath: root }, deps), /Refusing to replace/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('installer waits before manifest edits and leaves dependencies unchanged on readiness failure', async () => {
  const root = await fixture();
  try {
    const file = path.join(root, 'Packages/manifest.json');
    const before = await readFile(file, 'utf8');
    const deps = { platform: 'win32', processes: async () => [{ ProcessId: 7, CommandLine: `Unity.exe -projectPath "${root}"` }], waitReady: async () => { assert.equal(await readFile(file, 'utf8'), before); throw Error('still loading'); } };
    await assert.rejects(installCoderGamester({ projectPath: root, timeoutMs: 1000 }, deps), /dependencies were not changed/);
    assert.equal(await readFile(file, 'utf8'), before);
    let checked = false;
    const result = await installCoderGamester({ projectPath: root }, { ...deps, waitReady: async () => { assert.equal(await readFile(file, 'utf8'), before); checked = true; }, request: async () => ({}) });
    assert.ok(checked); assert.equal(result.enableStatus, 'start_requested');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('lifecycle response identity, failure, success and confirmed exit', async () => {
  const root = await fixture();
  let running = true;
  const deps = { platform: 'win32', processes: async () => running ? [{ ProcessId: 7, CommandLine: `Unity.exe -projectPath "${root}"` }] : [] };
  async function respond(success, close = false) {
    const directory = path.join(root, 'Library/DshUnityMcp');
    for (let i = 0; i < 100; i++) {
      const file = (await readdir(directory).catch(() => [])).find(f => f.endsWith('.request.json'));
      if (file) {
        const request = JSON.parse(await readFile(path.join(directory, file)));
        await rm(path.join(directory, file));
        await writeFile(path.join(directory, request.id + '.response.json'), JSON.stringify({ id: request.id, pid: 7, success, message: 'Unnamed scene' }));
        if (close) running = false;
        return;
      }
      await delay(10);
    }
    throw Error('No request');
  }
  try {
    const failed = requestProject({ projectPath: root, timeoutMs: 2000 }, 'close', deps);
    await respond(false); await assert.rejects(failed, /Unnamed scene/); assert.ok(running);
    const ready = requestProject({ projectPath: root, timeoutMs: 2000 }, 'ready', deps);
    await respond(true); assert.equal((await ready).status, 'editor_ready');
    const save = requestProject({ projectPath: root, timeoutMs: 2000 }, 'save', deps);
    await respond(true); assert.equal((await save).status, 'saved');
    const close = requestProject({ projectPath: root, timeoutMs: 2000 }, 'close', deps);
    await respond(true, true); assert.equal((await close).status, 'closed');
  } finally { await rm(root, { recursive: true, force: true }); }
});

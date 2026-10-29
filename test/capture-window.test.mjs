import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { captureProject, screenshotTool } from '../lib/capture-window.mjs';
import { powershell } from '../lib/open-project.mjs';
test('PowerShell process JSON preserves non-ASCII project paths on Windows', { skip: process.platform !== 'win32' }, async () => {
  assert.equal(await powershell("'工程 测试' | ConvertTo-Json -Compress"), '工程 测试');
});
test('window capture selects explicit project, validates identity and produces durable image blocks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unity-capture-'));
  try {
    for (const dir of ['Assets', 'ProjectSettings']) await mkdir(path.join(root, dir));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
    const deps = { platform: 'win32', processes: async () => [{ ProcessId: 42, CommandLine: `Unity.exe -projectPath "${root}"` }], capture: async pid => ({ pid, title: 'Editor', width: 1, height: 1, method: 'PrintWindow', data: png.toString('base64') }) };
    assert.equal((await captureProject({ projectPath: root }, deps)).pid, 42);
    await assert.rejects(captureProject({ projectPath: root, typo: true }, deps), /only projectPath/);
    await assert.rejects(captureProject({ projectPath: root }, { ...deps, processes: async () => [] }), /No matching/);
    await assert.rejects(captureProject({ projectPath: root }, { ...deps, capture: async () => ({ pid: 9 }) }), /identity/);
    await assert.rejects(captureProject({ projectPath: root }, { ...deps, capture: async pid => ({ pid, data: 'bad' }) }), /Invalid PNG/);
    const attachment = { attachmentId: 'test', mediaType: 'image/png', width: 1, height: 1, bytes: png.length };
    const tool = screenshotTool({ attachments: { saveImage: async input => { assert.deepEqual(input.data, png); return attachment; } } }, deps);
    const result = await tool.execute({ projectPath: root });
    const content = tool.output.render({}, result);
    assert.equal(content[1].type, 'image'); assert.equal(content[1].attachment, attachment);
    assert.ok(!content[0].text.includes(png.toString('base64')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

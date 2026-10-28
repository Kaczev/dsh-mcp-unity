import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configurationTool } from '../lib/configure-project.mjs';

test('configure validates before edit, preserves settings and detects races', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unity-config-'));
  try {
    const entry = { options: { name: 'dsh-unity-mcp' } };
    let raw = { projectPath: 'old', serverPath: 'old', port: 12, lazyTools: false, unknown: 42 }, edits = 0, race = false;
    const ctx = { configEditor: {
      entries: () => [entry],
      configuration: () => [{ entry, inherited: {}, override: { ...raw } }],
      edit: async (_, change) => { if (race) raw.port++; const next = change({ ...raw }, {}); edits++; raw = next; }
    } };
    const tool = configurationTool(ctx);
    await assert.rejects(tool.execute({ projectPath: 'relative' }), /absolute/);
    await assert.rejects(tool.execute({ projectPath: root }));
    assert.equal(edits, 0);
    for (const dir of ['Assets', 'ProjectSettings', 'Packages/com.gamelovers.mcp-unity/Server~/build']) await mkdir(path.join(root, dir), { recursive: true });
    await assert.rejects(tool.execute({ projectPath: root }), /not found/);
    assert.equal(edits, 0);
    await writeFile(path.join(root, 'Packages/com.gamelovers.mcp-unity/Server~/build/index.js'), '');
    const result = await tool.execute({ projectPath: root });
    assert.equal(result.saved, true);
    assert.equal(raw.projectPath, root); assert.equal(raw.serverPath, ''); assert.equal(raw.port, 0);
    assert.equal(raw.lazyTools, false); assert.equal(raw.unknown, 42); assert.equal(raw.authTokenPath, '');
    race = true;
    await assert.rejects(tool.execute({ projectPath: root }), /changed during validation/);
    assert.equal(edits, 1);
    ctx.configEditor.entries = () => [entry, entry];
    await assert.rejects(tool.execute({ projectPath: root }), /exactly one/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { listProjects, manageProject, projectTool, connectionTarget } from '../lib/project.mjs';
test('inventory is read-only, sanitized, includes unknown processes and marks selected target', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unity-inventory-'));
  try {
    await mkdir(path.join(root, 'Assets'));
    await mkdir(path.join(root, 'ProjectSettings')); await writeFile(path.join(root, 'ProjectSettings/ProjectVersion.txt'), 'm_EditorVersion: 2022.3.62t5');
    const before = await readdir(root);
    const deps = { platform: 'win32', processes: async () => [{ ProcessId: 3, ExecutablePath: 'Tuanjie.exe', CommandLine: `Tuanjie.exe -projectPath "${root}" -secret SENSITIVE` }, { ProcessId: 4, CommandLine: null }] };
    const result = await listProjects({ projectPath: root }, deps);
    assert.equal(result.projects.length, 2); assert.equal(result.projects[0].configuredTarget, true);
    assert.equal(result.projects[0].state, 'running_not_verified'); assert.equal(result.projects[1].state, 'project_unknown');
    assert.ok(!JSON.stringify(result).includes('SENSITIVE')); assert.deepEqual(await readdir(root), before);
    const many = await listProjects({}, { ...deps, processes: async () => Array.from({ length: 101 }, (_, i) => ({ ProcessId: i + 1 })) });
    assert.equal(many.total, 101); assert.equal(many.projects.length, 100); assert.equal(many.truncated, true);
    await assert.rejects(manageProject({ action: 'status', projectPath: root }, {}, { ...deps, processes: async () => [{ ProcessId: 1, CommandLine: `Unity.exe -projectPath "${root}"` }, { ProcessId: 2, CommandLine: `Unity.exe -projectPath "${root}"` }] }), /Multiple editor/);
    const closed = await manageProject({ action: 'status', projectPath: root }, {}, { ...deps, processes: async () => [] }); assert.equal(closed.status, 'not_running');
    const ready = await manageProject({ action: 'status', projectPath: root }, {}, { ...deps, request: async (_, action) => assert.equal(action, 'ready') }); assert.equal(ready.editorReady, true);
    const failed = await manageProject({ action: 'status', projectPath: root }, {}, { ...deps, request: async () => { throw Error('compile blocked'); } }); assert.equal(failed.status, 'readiness_unconfirmed');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('unified actions route explicitly and connection target remains read-only', async () => {
  const ctx = { configEditor: { configuration: () => [{ entry: { options: { name: 'dsh-unity-mcp' } }, inherited: { projectPath: 'old' }, override: { projectPath: 'selected' } }] } };
  assert.equal(connectionTarget(ctx).projectPath, 'selected');
  const tool = projectTool(ctx); assert.equal(tool.name, 'unity_project');
  assert.throws(() => tool.execute({ action: 'list', projectPath: 'x' }), /accepts no/);
  assert.throws(() => tool.execute({ action: 'close', editorPath: 'x' }), /only used/);
  await assert.rejects(manageProject({ action: 'close' }), /required/);
  for (const action of ['save', 'close']) assert.equal(await manageProject({ action, projectPath: 'explicit' }, {}, { request: async (input, received) => { assert.equal(input.projectPath, 'explicit'); return received; } }), action);
  assert.equal(await manageProject({ action: 'open', projectPath: 'explicit' }, {}, { open: async () => 'opened' }), 'opened');
});

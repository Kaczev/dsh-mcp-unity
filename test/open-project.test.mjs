import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openProject, projectFromCommandLine } from '../lib/open-project.mjs';
test('command parsing handles quoted spaces and case', () => {
  assert.equal(projectFromCommandLine('Unity.exe -projectPath "C:/a b/工程" -logFile x'), 'C:/a b/工程');
  assert.equal(projectFromCommandLine('Tuanjie.exe -PROJECTPATH C:/project'), 'C:/project');
});
test('open validates version, detects existing/locked project and launches exact argv', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unity-open-'));
  try {
    for (const dir of ['Assets', 'ProjectSettings']) await mkdir(path.join(root, dir));
    await writeFile(path.join(root, 'ProjectSettings/ProjectVersion.txt'), 'm_EditorVersion: 2022.3.62t5\n');
    const editor = path.join(root, 'Tuanjie.exe'); await writeFile(editor, '');
    let launches = 0;
    const deps = { waitReady: async () => {}, platform: 'win32', processes: async () => [], versionOf: async () => '2022.3.62t5_hash', discover: async () => [editor], launch: async (exe, project) => { assert.equal(exe, editor); assert.equal(project, root); launches++; return 123; } };
    await assert.rejects(openProject({ projectPath: root }, { ...deps, platform: 'linux' }), /Windows/);
    await assert.rejects(openProject({ projectPath: 'relative' }, deps), /absolute/);
    await assert.rejects(openProject({ projectPath: root }, { ...deps, versionOf: async () => '2022.3.62f3' }), /found 0/);
    const opened = await openProject({ projectPath: root }, deps); assert.equal(opened.status, 'editor_ready'); assert.equal(launches, 1);
    const existing = await openProject({ projectPath: root }, { ...deps, processes: async () => [{ CommandLine: `Tuanjie.exe -projectpath "${root}"`, ProcessId: 55, ExecutablePath: editor }] });
    assert.equal(existing.status, 'editor_ready'); assert.equal(existing.editorReady, true); assert.equal(launches, 1);
    const loading = await openProject({ projectPath: root, timeoutMs: 1000 }, { ...deps, processes: async () => [{ CommandLine: `Tuanjie.exe -projectpath "${root}"`, ProcessId: 55, ExecutablePath: editor }], waitReady: async () => { throw Error('Still importing'); } });
    assert.equal(loading.status, 'readiness_unconfirmed'); assert.equal(loading.editorReady, null); assert.equal(loading.running, true); assert.match(loading.message, /Still importing/); assert.equal(launches, 1);
    await assert.rejects(openProject({ projectPath: root }, deps), /last 60 seconds/);
    const locked = path.join(root, 'locked');
    for (const dir of ['Assets', 'ProjectSettings', 'Temp']) await mkdir(path.join(locked, dir), { recursive: true });
    await writeFile(path.join(locked, 'ProjectSettings/ProjectVersion.txt'), 'm_EditorVersion: 2022.3.62t5\n');
    await writeFile(path.join(locked, 'Temp/UnityLockfile'), '');
    await assert.rejects(openProject({ projectPath: locked }, deps), /UnityLockfile/); assert.equal(launches, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import path from 'node:path';
import { readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { projectRoot, ensureBridge, matchingProcess, requestProject } from './project-lifecycle.mjs';
import { resolveServer } from './connection.mjs';
import { launchPending, waitForEditor } from './open-project.mjs';
const PACKAGE = 'com.gamelovers.mcp-unity';
export const UPSTREAM = 'https://github.com/CoderGamester/mcp-unity.git#382a43a30f4dab4c7f02d770b4ec7d084813bbe4';
const installing = new Set();
export async function installCoderGamester(input, deps = {}) {
  if ((deps.platform ?? process.platform) !== 'win32') throw Error('Installation tool currently supports Windows only.');
  const root = await projectRoot(input.projectPath);
  if (installing.has(root)) throw Error('Installation is in progress for this project.');
  installing.add(root);
  try {
    const deadline = Date.now() + (input.timeoutMs ?? 120000);
    const editor = await matchingProcess(root, deps.processes);
    const lock = await stat(path.join(root, 'Temp/UnityLockfile')).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (editor || launchPending(root) || lock) {
      try { await (deps.waitReady ?? waitForEditor)(root, Math.max(1, deadline - Date.now()), deps); }
      catch (error) { throw Error('Editor readiness unconfirmed; package dependencies were not changed. Check unity_project action=list before deciding whether to wait. Do not launch another editor. ' + error.message); }
    }
    const manifest = path.join(root, 'Packages/manifest.json');
    const original = await readFile(manifest, 'utf8');
    const parsed = JSON.parse(original);
    if (!parsed.dependencies || typeof parsed.dependencies !== 'object' || Array.isArray(parsed.dependencies)) throw Error('Invalid package manifest dependencies.');
    const current = parsed.dependencies[PACKAGE];
    if (current && current !== UPSTREAM) throw Error('CoderGamester already has a different dependency. Refusing to replace it: ' + current);
    await ensureBridge(root);
    const settings = path.join(root, 'ProjectSettings/McpUnitySettings.json');
    let text; try { text = await readFile(settings, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const config = text ? JSON.parse(text) : {};
    config.AutoStartServer = true;
    if (text && JSON.parse(text).AutoStartServer !== true) await copyFile(settings, settings + '.dsh-backup', 1);
    if (!current) {
      const backup = manifest + '.dsh-backup';
      await copyFile(manifest, backup, 1);
      if (await readFile(manifest, 'utf8') !== original) throw Error('Manifest changed during preparation; retry.');
      parsed.dependencies[PACKAGE] = UPSTREAM;
      await writeFile(manifest, JSON.stringify(parsed, null, 2) + '\n');
    }
    await writeFile(settings, JSON.stringify(config, null, 2) + '\n');
    let enableStatus = 'pending_editor_start';
    if (await matchingProcess(root, deps.processes)) {
      try { await (deps.request ?? requestProject)({ projectPath: root, timeoutMs: Math.max(1, deadline - Date.now()) }, 'enable', deps); enableStatus = 'start_requested'; }
      catch (error) { enableStatus = 'pending: ' + error.message; }
    }
    let serverPath = '';
    try { serverPath = await resolveServer({ projectPath: root }); } catch {}
    return { projectPath: root, dependency: UPSTREAM, dependencyAdded: !current, enableStatus, serverPath, ready: false,
      message: 'Dependency and Editor bridge prepared; package resolution, compilation and service connectivity are separate. Open/refresh the editor to resolve the pinned package. If serverPath is empty, build its Server~ with npm install and npm run build. If a profile-wide connection switch was requested, configure the target. Verify the intended project with a read-only scene query. No other MCP packages were removed.' };
  } finally { installing.delete(root); }
}
export function installationTool() {
  return { name: 'unity_install_codergamester', description: 'Prepare pinned CoderGamester/mcp-unity in a Windows project: writes the Editor bridge, package dependency and auto-start settings. A running editor must confirm readiness before dependencies change; a closed project stays closed. Requests server start if open. Preserves other packages; will not replace a different CoderGamester dependency. Does not build the Node server or switch/verify the DSH connection.',
    parameters: { type: 'object', properties: { projectPath: { type: 'string', description: 'Absolute project directory with Packages/manifest.json.' }, timeoutMs: { type: 'integer', minimum: 1000, maximum: 180000, description: 'Wait for compilation/start request, default 120000 ms.' } }, required: ['projectPath'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { projectPath: { type: 'string' }, dependency: { type: 'string' }, dependencyAdded: { type: 'boolean' }, enableStatus: { type: 'string' }, serverPath: { type: 'string' }, ready: { type: 'boolean' }, message: { type: 'string' } }, required: ['projectPath', 'dependency', 'dependencyAdded', 'enableStatus', 'serverPath', 'ready', 'message'], additionalProperties: false }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] }, execute: input => installCoderGamester(input) };
}

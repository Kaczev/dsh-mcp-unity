import path from 'node:path';
import { readFile, stat, realpath, readdir } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const pending = new Set();
const recentLaunches = new Map();
export function launchPending(root) { return pending.has(root.toLowerCase()) || Date.now() - (recentLaunches.get(root.toLowerCase()) ?? 0) < 60000; }
export async function waitForEditor(root, timeoutMs, deps = {}) {
  const { setTimeout: delay } = await import('node:timers/promises');
  const { requestProject, matchingProcess } = await import('./project-lifecycle.mjs');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await matchingProcess(root, deps.processes)) return await requestProject({ projectPath: root, timeoutMs: Math.max(1, deadline - Date.now()) }, 'ready', deps);
    await delay(250);
  }
  throw Error('Editor process did not become available within the wait budget.');
}
async function finishOpen(result, input, deps) {
  try {
    await (deps.waitReady ?? waitForEditor)(result.projectPath, input.timeoutMs ?? 120000, deps);
    return { ...result, status: 'editor_ready', editorReady: true, message: 'Editor responded after import/compilation settled. MCP connectivity is not verified.' };
  } catch (error) {
    return { ...result, status: 'editor_loading', editorReady: false, message: 'Not ready: ' + error.message + ' Do not assume loading finished. Retry unity_project action=status or open to wait again; do not relaunch or configure MCP yet.' };
  }
}
async function powershell(script) {
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || 'null');
}
export function projectFromCommandLine(command = '') {
  return /(?:^|\s)-projectpath\s+(?:"([^"]+)"|([^\s]+))/i.exec(command)?.slice(1).find(Boolean);
}
export async function windowsProcesses() {
  return await powershell("@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe' OR Name='Tuanjie.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine) | ConvertTo-Json -Compress") ?? [];
}
async function editorVersion(file) {
  const quoted = file.replaceAll("'", "''");
  return powershell(`(Get-Item -LiteralPath '${quoted}').VersionInfo.ProductVersion | ConvertTo-Json -Compress`);
}
async function discoverEditors() {
  const roots = [path.join(process.env.ProgramFiles || 'C:/Program Files', 'Unity/Hub/Editor'), path.join(process.env.ProgramFiles || 'C:/Program Files', 'Tuanjie/Hub/Editor')];
  const candidates = [];
  for (const root of roots) {
    let entries; try { entries = await readdir(root); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    for (const entry of entries) for (const name of ['Unity.exe', 'Tuanjie.exe']) candidates.push(path.join(root, entry, 'Editor', name));
    for (const name of ['Unity.exe', 'Tuanjie.exe']) candidates.push(path.join(root, name));
  }
  return candidates;
}
export async function openProject(input, deps = {}) {
  const { platform = process.platform, processes = windowsProcesses, versionOf = editorVersion, discover = discoverEditors, launch = launchEditor } = deps;
  if (platform !== 'win32') throw Error('unity_open_project currently supports Windows only.');
  if (!path.isAbsolute(input.projectPath || '')) throw Error('projectPath must be absolute.');
  const projectPath = await realpath(input.projectPath);
  for (const dir of ['Assets', 'ProjectSettings']) if (!(await stat(path.join(projectPath, dir))).isDirectory()) throw Error('Not a Unity/Tuanjie project: ' + dir);
  const text = await readFile(path.join(projectPath, 'ProjectSettings/ProjectVersion.txt'), 'utf8');
  const version = /^m_EditorVersion:\s*(\S+)/m.exec(text)?.[1];
  if (!version || !/^\d+\.\d+\.\d+[a-z]\d+$/i.test(version)) throw Error('Cannot determine exact editor version from ProjectVersion.txt.');
  const key = projectPath.toLowerCase();
  if (pending.has(key)) throw Error('An open request for this project is already in progress.');
  pending.add(key);
  try {
    const rows = await processes();
    for (const row of Array.isArray(rows) ? rows : [rows]) {
      const target = projectFromCommandLine(row.CommandLine);
      if (target && await realpath(target).then(p => p.toLowerCase() === key, () => false)) return await finishOpen({ status: 'already_open', projectPath, editorPath: row.ExecutablePath || '', version, pid: row.ProcessId }, input, deps);
    }
    if (Date.now() - (recentLaunches.get(key) ?? 0) < 60000) throw Error('A launch was requested within the last 60 seconds; wait for the editor before retrying.');
    const lock = await stat(path.join(projectPath, 'Temp/UnityLockfile')).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (lock) throw Error('UnityLockfile exists but no matching editor could be confirmed. Refusing duplicate launch; check the editor/lock manually.');
    const explicit = input.editorPath;
    if (explicit && !path.isAbsolute(explicit)) throw Error('editorPath must be absolute.');
    const matches = [];
    for (const candidate of explicit ? [explicit] : await discover()) {
      if (!/^(Unity|Tuanjie)\.exe$/i.test(path.basename(candidate))) continue;
      let info; try { info = await stat(candidate); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      if (!info.isFile()) continue;
      const actual = await versionOf(candidate);
      if (typeof actual === 'string' && (actual === version || actual.startsWith(version + '_'))) matches.push(candidate);
    }
    if (matches.length !== 1) throw Error(`Expected one editor matching ${version}; found ${matches.length}. Provide editorPath to the matching Unity.exe/Tuanjie.exe. No version upgrade is allowed.`);
    const { ensureBridge } = await import('./project-lifecycle.mjs');
    await ensureBridge(projectPath);
    const pid = await launch(matches[0], projectPath);
    for (const [name, time] of recentLaunches) if (Date.now() - time >= 60000) recentLaunches.delete(name);
    recentLaunches.set(key, Date.now());
    return await finishOpen({ status: 'launch_requested', projectPath, editorPath: matches[0], version, pid }, input, deps);
  } finally { pending.delete(key); }
}
async function launchEditor(editor, project) {
  return new Promise((resolve, reject) => {
    const env = {}, keys = new Set();
    for (const [key, value] of Object.entries(process.env)) if (!keys.has(key.toLowerCase())) { keys.add(key.toLowerCase()); env[key] = value; }
    const child = spawn(editor, ['-projectPath', project], { detached: true, stdio: 'ignore', shell: false, env });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(child.pid); });
  });
}

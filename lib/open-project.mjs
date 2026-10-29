import path from 'node:path';
import { readFile, stat, realpath, readdir } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const pending = new Set();
const recentLaunches = new Map();
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
      if (target && await realpath(target).then(p => p.toLowerCase() === key, () => false)) return { status: 'already_open', projectPath, editorPath: row.ExecutablePath || '', version, pid: row.ProcessId };
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
    const pid = await launch(matches[0], projectPath);
    for (const [name, time] of recentLaunches) if (Date.now() - time >= 60000) recentLaunches.delete(name);
    recentLaunches.set(key, Date.now());
    return { status: 'launch_requested', projectPath, editorPath: matches[0], version, pid };
  } finally { pending.delete(key); }
}
async function launchEditor(editor, project) {
  return new Promise((resolve, reject) => {
    const child = spawn(editor, ['-projectPath', project], { detached: true, stdio: 'ignore', shell: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(child.pid); });
  });
}
export function openProjectTool() {
  return { name: 'unity_open_project', description: 'Open a local Unity/Tuanjie project in its exact matching Windows editor, or report already open. Launching may import assets and execute project editor scripts. Does not save MCP configuration or prove MCP readiness.',
    parameters: { type: 'object', properties: { projectPath: { type: 'string', description: 'Absolute existing project directory.' }, editorPath: { type: 'string', description: 'Optional absolute matching Unity.exe/Tuanjie.exe; omit to search standard Hub install locations.' } }, required: ['projectPath'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { status: { type: 'string' }, projectPath: { type: 'string' }, editorPath: { type: 'string' }, version: { type: 'string' }, pid: { type: 'integer' } }, required: ['status', 'projectPath', 'editorPath', 'version', 'pid'], additionalProperties: false }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] }, execute: input => openProject(input) };
}

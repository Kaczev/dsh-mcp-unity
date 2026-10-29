import path from 'node:path';
import { readFile, writeFile, mkdir, stat, realpath, rename, unlink } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { windowsProcesses, projectFromCommandLine } from './open-project.mjs';
const pending = new Set();
export async function projectRoot(value) {
  if (!path.isAbsolute(value || '')) throw Error('projectPath must be absolute.');
  const root = await realpath(value);
  for (const dir of ['Assets', 'ProjectSettings']) if (!(await stat(path.join(root, dir))).isDirectory()) throw Error('Not a Unity/Tuanjie project: ' + dir);
  return root;
}
export async function matchingProcess(root, processes = windowsProcesses) {
  const rows = await processes();
  const matches = [];
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    const target = projectFromCommandLine(row?.CommandLine);
    if (target && await realpath(target).then(p => p.toLowerCase() === root.toLowerCase(), () => false)) matches.push(row);
  }
  if (matches.length > 1) throw Error('Multiple editor processes match this project.');
  return matches[0];
}
export async function ensureBridge(root) {
  const source = await readFile(new URL('../engine/Editor/ProjectBridge.cs', import.meta.url), 'utf8');
  const directory = path.join(root, 'Assets/Editor/DshUnityMcp');
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, 'ProjectBridge.cs');
  let current; try { current = await readFile(target, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (current && current !== source) {
    const hash = createHash('sha256').update(current.replaceAll('\r\n', '\n')).digest('hex');
    if (hash !== '19352eb60addf7ea12b9f5a55fbb1b5e3c33b273bfeb1fda7814cba1a3bd6915') throw Error('Existing DSH bridge differs. Review/remove it explicitly before installing this version.');
    await writeFile(target + '.v0.0.4.backup', current, { flag: 'wx' });
    if (await readFile(target, 'utf8') !== current) throw Error('Bridge changed during upgrade; retry.');
    await writeFile(target, source);
  } else if (current !== source) await writeFile(target, source, { flag: 'wx' });
}
export async function requestProject(input, action, deps = {}) {
  if ((deps.platform ?? process.platform) !== 'win32') throw Error('Project lifecycle tools currently support Windows only.');
  const root = await projectRoot(input.projectPath);
  if (pending.has(root)) throw Error('A lifecycle request for this project is in progress.');
  pending.add(root);
  const processes = deps.processes ?? windowsProcesses;
  let request;
  try {
    const editor = await matchingProcess(root, processes);
    if (!editor) throw Error('No running editor for the requested project.');
    await ensureBridge(root);
    const directory = path.join(root, 'Library/DshUnityMcp'); await mkdir(directory, { recursive: true });
    const id = randomUUID().replaceAll('-', ''), timeout = input.timeoutMs ?? 60000;
    request = path.join(directory, id + '.request.json');
    const response = path.join(directory, id + '.response.json');
    await writeFile(request + '.tmp', JSON.stringify({ id, action, expires: Date.now() + timeout }));
    await rename(request + '.tmp', request);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      let reply;
      try { reply = JSON.parse(await readFile(response, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (reply) {
        await unlink(response);
        if (reply.id !== id || reply.pid !== editor.ProcessId) throw Error('Editor response identity mismatch.');
        if (!reply.success) throw Error(reply.message);
        if (action === 'close') {
          while (Date.now() < deadline) {
            const active = await matchingProcess(root, processes);
            if (!active) return { status: 'closed', projectPath: root, pid: editor.ProcessId };
            if (active.ProcessId !== editor.ProcessId) throw Error('Project reopened in a different process; not closing it.');
            await delay(500);
          }
          throw Error('Save acknowledged but normal exit not confirmed. No force kill was attempted.');
        }
        return { status: action === 'save' ? 'saved' : action === 'ready' ? 'editor_ready' : 'enable_requested', projectPath: root, pid: editor.ProcessId };
      }
      await delay(250);
    }
    throw Error('Editor response timed out. Operation may have begun; inspect the editor before retrying. No force kill was attempted.');
  } finally { if (request) await unlink(request).catch(() => {}); pending.delete(root); }
}

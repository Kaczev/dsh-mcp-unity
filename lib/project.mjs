import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { windowsProcesses, projectFromCommandLine, openProject } from './open-project.mjs';
import { requestProject, projectRoot } from './project-lifecycle.mjs';

export function connectionTarget(ctx) {
  const rows = ctx.configEditor.configuration().filter(row => row.entry.options.name === 'dsh-unity-mcp');
  if (rows.length !== 1) return { status: 'ambiguous', projectPath: '', serverPath: '' };
  const config = { ...rows[0].inherited, ...rows[0].override };
  return { status: config.projectPath || config.serverPath ? 'configured_not_verified' : 'not_configured', projectPath: config.projectPath || '', serverPath: config.serverPath || '' };
}
export async function listProjects(target = {}, deps = {}) {
  if ((deps.platform ?? process.platform) !== 'win32') throw Error('Project discovery currently supports Windows only.');
  const processes = await (deps.processes ?? windowsProcesses)();
  const canonical = async value => value ? realpath(value).catch(() => path.resolve(value)) : '';
  const selected = (await canonical(target.projectPath)).toLowerCase();
  const projects = [];
  for (const row of Array.isArray(processes) ? processes : [processes]) {
    if (!row) continue;
    const raw = projectFromCommandLine(row.CommandLine);
    const projectPath = await canonical(raw);
    let version = '';
    if (projectPath) version = /^m_EditorVersion:\s*(\S+)/m.exec(await readFile(path.join(projectPath, 'ProjectSettings/ProjectVersion.txt'), 'utf8').catch(() => ''))?.[1] || '';
    projects.push({ pid: row.ProcessId, projectPath, editorPath: row.ExecutablePath || '', version, state: projectPath ? 'running_not_verified' : 'project_unknown', configuredTarget: Boolean(selected && selected === projectPath.toLowerCase()) });
  }
  projects.sort((a, b) => a.pid - b.pid);
  return { projects: projects.slice(0, 100), total: projects.length, truncated: projects.length > 100, connection: target, message: 'Process inventory only; readiness and MCP connectivity are not verified. Unknown project paths may reflect inaccessible process arguments. Use status for a selected project. Connection settings affect all profile sessions.' };
}
export async function manageProject(input, target = {}, deps = {}) {
  if (input.action === 'list') return listProjects(target, deps);
  if (!input.projectPath) throw Error('projectPath is required for this action. Use action=list to discover open projects.');
  if (input.action === 'open') return (deps.open ?? openProject)(input, deps);
  if (input.action === 'save' || input.action === 'close') return (deps.request ?? requestProject)(input, input.action, deps);
  if (input.action === 'status') {
    const root = await projectRoot(input.projectPath);
    const inventory = await listProjects(target, deps);
    if (inventory.truncated) throw Error('Editor inventory exceeds 100 processes; status cannot safely select a project.');
    const matches = inventory.projects.filter(p => p.projectPath.toLowerCase() === root.toLowerCase());
    if (!matches.length) return { status: 'not_running', projectPath: root, editorReady: false, connection: target, message: 'No matching editor process found; MCP connectivity is not verified.' };
    if (matches.length !== 1) throw Error('Multiple editor processes match this project. Resolve duplicates before acting.');
    try {
      await (deps.request ?? requestProject)({ ...input, timeoutMs: input.timeoutMs ?? 10000 }, 'ready', deps);
      return { ...matches[0], state: 'editor_ready', status: 'editor_ready', editorReady: true, connection: target, message: 'Editor readiness confirmed; MCP connectivity is not verified.' };
    } catch (error) {
      return { ...matches[0], status: 'readiness_unconfirmed', editorReady: false, connection: target, message: error.message };
    }
  }
  throw Error('Unknown project action.');
}
export function projectTool(ctx) {
  return { name: 'unity_project', description: 'Discover and manage Windows Unity/Tuanjie projects without MCP. list is read-only and shows all editor processes plus the configured DSH target; it does not prove readiness. status waits for readiness without launching; open launches if needed and waits. status/open/save/close may install an Editor bridge and trigger compilation. close saves first, verifies normal exit, never force-kills or discards changes. Save/close reject Play Mode, Prefab Mode and unnamed scenes. Does not switch or verify MCP connections.',
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['list', 'status', 'open', 'save', 'close'], description: 'Start with list to choose an explicit project. status checks readiness; open also starts a closed project; save saves all named loaded scenes/assets; close saves then exits.' },
      projectPath: { type: 'string', description: 'Absolute project directory; required except for list. Never inferred from the current connection.' },
      editorPath: { type: 'string', description: 'Only for open: optional absolute exact-version Unity.exe/Tuanjie.exe.' },
      timeoutMs: { type: 'integer', minimum: 1000, maximum: 180000, description: 'Wait budget: status default 10000 ms, open 120000 ms, save/close 60000 ms. Retry status/open after an unconfirmed readiness result; do not assume it is ready.' }
    }, required: ['action'], additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: input => {
      if (input.action === 'list' && (input.projectPath || input.editorPath)) throw Error('list accepts no projectPath or editorPath.');
      if (input.editorPath && input.action !== 'open') throw Error('editorPath is only used by open.');
      return manageProject(input, connectionTarget(ctx));
    } };
}

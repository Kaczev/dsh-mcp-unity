import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { matchingProcess, projectRoot } from './project-lifecycle.mjs';
const exec = promisify(execFile);
export async function captureWindow(pid) {
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./capture-window.ps1', import.meta.url)), '-EditorPid', String(pid)], { windowsHide: true, timeout: 20000, maxBuffer: 12 * 1024 * 1024 });
  return JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
}
export async function captureProject(input, deps = {}) {
  if ((deps.platform ?? process.platform) !== 'win32') throw Error('Editor window capture currently supports Windows only.');
  if (!input || Object.keys(input).some(key => key !== 'projectPath')) throw Error('Capture accepts only projectPath.');
  const root = await projectRoot(input.projectPath);
  const editor = await matchingProcess(root, deps.processes);
  if (!editor) throw Error('No matching editor process. Use unity_project action=list to inspect running editors.');
  const image = await (deps.capture ?? captureWindow)(editor.ProcessId);
  if (image.pid !== editor.ProcessId) throw Error('Screenshot process identity mismatch.');
  const after = await matchingProcess(root, deps.processes);
  if (after?.ProcessId !== editor.ProcessId) throw Error('Editor changed during capture; screenshot discarded.');
  const data = Buffer.from(image.data ?? '', 'base64');
  if (data.length < 24 || data.length > 8 * 1024 * 1024 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.toString('base64') !== image.data) throw Error('Invalid PNG window capture.');
  if (data.readUInt32BE(16) !== image.width || data.readUInt32BE(20) !== image.height) throw Error('Screenshot dimensions mismatch.');
  return { projectPath: root, pid: editor.ProcessId, title: image.title, width: image.width, height: image.height, method: image.method, data };
}
export function screenshotTool(ctx, deps = {}) {
  return { name: 'unity_capture_window', description: 'Capture the main Windows Unity/Tuanjie editor window for an explicit project, including editor panels, without MCP or an Editor bridge. Returns an image. Does not focus/restore windows or capture the desktop. Minimized or unavailable windows fail; GPU-rendered views may be black or stale.',
    parameters: { type: 'object', properties: { projectPath: { type: 'string', description: 'Absolute directory of the open project. Use unity_project action=list to select it.' } }, required: ['projectPath'], additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_, value) => [{ type: 'text', text: JSON.stringify({ ...value, attachment: undefined }) }, { type: 'image', attachment: value.attachment }] },
    execute: async input => {
      const { data, ...metadata } = await captureProject(input, deps);
      const attachment = await ctx.attachments.saveImage({ data, mediaType: 'image/png', name: 'unity-editor.png' });
      return { ...metadata, attachment };
    }
  };
}

import path from 'node:path';
import { stat } from 'node:fs/promises';
import { connectionConfig } from './connection.mjs';

export function configurationTool(ctx) {
  return {
    name: 'unity_configure_project',
    description: 'Save the Unity/Tuanjie project connection for this DSH profile and reconnect. Affects all sessions and clears host/port/auth-file overrides to use the selected project settings. Validates local paths before saving; does not start or modify the engine project. Requires CoderGamester/mcp-unity in the engine.',
    parameters: { type: 'object', properties: {
      projectPath: { type: 'string', description: 'Absolute Unity/Tuanjie project directory containing Assets and ProjectSettings.' },
      serverPath: { type: 'string', description: 'Optional absolute built CoderGamester Server~/build/index.js. Omit or empty to auto-discover in the selected project.' }
    }, required: ['projectPath'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { projectPath: { type: 'string' }, serverPath: { type: 'string' }, saved: { type: 'boolean' }, message: { type: 'string' } }, required: ['projectPath', 'serverPath', 'saved', 'message'], additionalProperties: false }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async ({ projectPath, serverPath = '' }) => {
      if (typeof projectPath !== 'string' || !path.isAbsolute(projectPath)) throw Error('projectPath must be an absolute Unity/Tuanjie project path.');
      for (const directory of ['Assets', 'ProjectSettings']) {
        if (!(await stat(path.join(projectPath, directory))).isDirectory()) throw Error('Not a Unity/Tuanjie project: missing ' + directory);
      }
      const entries = ctx.configEditor.entries().filter(entry => entry.options.name === 'dsh-unity-mcp');
      if (entries.length !== 1) throw Error('Expected exactly one dsh-unity-mcp configuration entry; resolve duplicate/missing plugin entries first.');
      const entry = entries[0];
      const snapshot = ctx.configEditor.configuration().find(row => row.entry === entry);
      if (!snapshot) throw Error('Unity configuration changed; retry.');
      const patch = { projectPath, serverPath, host: '', port: 0, authTokenPath: '' };
      const current = { ...snapshot.inherited, ...snapshot.override };
      await connectionConfig({ ...current, ...patch });
      await ctx.configEditor.edit(entry, raw => {
        for (const key of ['projectPath', 'serverPath', 'host', 'port', 'authTokenPath']) {
          if (JSON.stringify(raw[key]) !== JSON.stringify(current[key])) throw Error('Unity connection configuration changed during validation; retry.');
        }
        return { ...raw, ...patch };
      });
      return { projectPath, serverPath, saved: true, message: 'Configuration saved and Loader reconciliation completed. Host/port/auth overrides cleared to use this project settings. Load Unity tools again; tool discovery alone does not prove the editor is online.' };
    }
  };
}

import path from 'node:path';
import { stat, readdir } from 'node:fs/promises';

async function isFile(file) { try { return (await stat(file)).isFile(); } catch { return false; } }
export async function resolveServer({ serverPath = '', projectPath = '' }) {
  if (serverPath) {
    if (!path.isAbsolute(serverPath)) throw Error('serverPath must be an absolute path to CoderGamester Server~/build/index.js');
    if (!await isFile(serverPath)) throw Error('CoderGamester server file not found: ' + serverPath);
    return serverPath;
  }
  if (!projectPath) throw Error('Configure projectPath and install/build CoderGamester/mcp-unity in the Unity or Tuanjie project, or set serverPath.');
  for (const packageName of ['com.gamelovers.mcp-unity', 'com.codergamester.mcp-unity']) {
    const direct = path.join(projectPath, 'Packages', packageName, 'Server~/build/index.js');
    if (await isFile(direct)) return direct;
  }
  const cache = path.join(projectPath, 'Library/PackageCache');
  let entries;
  try { entries = await readdir(cache); } catch (error) { if (error.code !== 'ENOENT') throw error; entries = []; }
  const candidates = [];
  for (const entry of entries.sort()) {
    if (!/^com[.](?:gamelovers|codergamester)[.]mcp-unity(?:@|$)/.test(entry)) continue;
    const file = path.join(cache, entry, 'Server~/build/index.js');
    if (await isFile(file)) candidates.push(file);
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) throw Error('Multiple cached CoderGamester servers found; set serverPath to select one.');
  throw Error('Built CoderGamester server not found in this project. Build Server~ with npm install and npm run build, then set serverPath.');
}
export async function connectionConfig(config) {
  if (config.projectPath && !path.isAbsolute(config.projectPath)) throw Error('projectPath must be an absolute Unity or Tuanjie project directory.');
  if (config.projectPath && !(await stat(config.projectPath)).isDirectory()) throw Error('projectPath is not a directory.');
  const server = await resolveServer(config);
  const env = { ELECTRON_RUN_AS_NODE: '1' };
  if (config.host) env.UNITY_HOST = config.host;
  if (config.port) env.UNITY_PORT = String(config.port);
  if (config.projectPath) env.MCP_UNITY_SETTINGS_PATH = path.join(config.projectPath, 'ProjectSettings/McpUnitySettings.json');
  if (config.authTokenPath) {
    if (!path.isAbsolute(config.authTokenPath)) throw Error('authTokenPath must be an absolute path.');
    env.MCP_UNITY_AUTH_TOKEN_PATH = config.authTokenPath;
  }
  return { serverName: 'unity', transport: 'stdio', command: process.execPath, args: [server],
    ...(config.projectPath ? { cwd: config.projectPath } : {}), env,
    toolCallTimeoutMs: config.toolCallTimeoutMs ?? 120000, failOnStartupError: false };
}

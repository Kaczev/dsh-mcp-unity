import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveServer, connectionConfig } from '../lib/connection.mjs';
import { Config } from '../index.mjs';

test('configuration defaults keep tools lazy', () => { assert.equal(Config({}).lazyTools, true); assert.equal(Config({}).port, 0); });
test('missing configuration gives actionable error', async () => { await assert.rejects(resolveServer({}), /Configure projectPath/); });
test('relative paths are rejected', async () => { await assert.rejects(resolveServer({ serverPath: 'relative.js' }), /absolute/); await assert.rejects(connectionConfig({ projectPath: 'relative' }), /absolute/); });
test('project discovery, ambiguity, explicit override and environment', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-unity-test-'));
  const make = async relative => { const file = path.join(root, relative, 'Server~/build/index.js'); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, ''); return file; };
  try {
    await assert.rejects(resolveServer({ projectPath: root }), /Built CoderGamester/);
    const cached = await make('Library/PackageCache/com.gamelovers.mcp-unity@abc');
    assert.equal(await resolveServer({ projectPath: root }), cached);
    await make('Library/PackageCache/com.codergamester.mcp-unity@def');
    await assert.rejects(resolveServer({ projectPath: root }), /Multiple cached/);
    const direct = await make('Packages/com.gamelovers.mcp-unity');
    assert.equal(await resolveServer({ projectPath: root }), direct);
    assert.equal(await resolveServer({ projectPath: root, serverPath: cached }), cached);
    const config = await connectionConfig({ projectPath: root, serverPath: cached, port: 8090, host: '127.0.0.1', authTokenPath: path.join(root, 'token') });
    assert.equal(config.env.UNITY_PORT, '8090'); assert.equal(config.env.UNITY_HOST, '127.0.0.1'); assert.equal(config.env.ELECTRON_RUN_AS_NODE, '1');
    assert.equal(config.cwd, root); assert.equal(config.serverName, 'unity'); assert.deepEqual(config.args, [cached]);
    assert.equal(config.env.MCP_UNITY_SETTINGS_PATH, path.join(root, 'ProjectSettings/McpUnitySettings.json'));
    await assert.rejects(connectionConfig({ serverPath: cached, authTokenPath: 'relative' }), /authTokenPath/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

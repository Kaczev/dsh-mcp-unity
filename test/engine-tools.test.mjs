import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngineTools, normalizeEngineArgs } from '../lib/engine-tools.mjs';
const prefix = 'mcp__unity__';
const raw = (name, properties = {}, required = []) => ({ name: prefix + name, description: name, parameters: { type: 'object', properties, required, additionalProperties: false }, output: { schema: {}, render: () => [] }, execute: async (args, exec) => ({ content: [{ type: 'text', text: JSON.stringify({ name, args, marker: exec?.marker }) }] }) });
test('transform group maps actions without inventing unused arguments or dropping exec', async () => {
  const tools = createEngineTools([raw('move_gameobject', { instanceId: {}, objectPath: {}, position: {}, space: {}, relative: {} }, ['position']), raw('set_transform', { instanceId: {}, position: {} }), raw('get_scene_info')]);
  const transform = tools.find(t => t.name === 'unity_transform');
  const result = await transform.execute({ action: 'translate', instanceId: 42, position: { x: 1, y: 2, z: 3 }, relative: true }, { marker: 'forwarded' });
  assert.deepEqual(JSON.parse(result.content[0].text), { name: 'move_gameobject', args: { instanceId: 42, position: { x: 1, y: 2, z: 3 }, relative: true }, marker: 'forwarded' });
  await assert.rejects(transform.execute({ action: 'translate', instanceId: 42 }), /position is required/);
  await assert.rejects(transform.execute({ action: 'set', instanceId: 42, relative: true }), /relative is not valid/);
  assert.equal(tools.some(t => t.name === prefix + 'move_gameobject'), false);
});
test('target and dangerous defaults fail before any upstream mutation', () => {
  assert.throws(() => normalizeEngineArgs('delete_gameobject', {}), /exactly one/);
  assert.throws(() => normalizeEngineArgs('update_gameobject', { instanceId: 1, objectPath: 'A' }), /exactly one/);
  assert.throws(() => normalizeEngineArgs('update_gameobject', { instanceId: 1, gameObjectData: { layer: 32 } }), /0 to 31/);
  assert.throws(() => normalizeEngineArgs('reparent_gameobject', { instanceId: 1 }), /explicitly/);
  assert.throws(() => normalizeEngineArgs('reparent_gameobject', { instanceId: 1, newParent: null, worldPositionStays: false }), /AND scale/);
  assert.equal(normalizeEngineArgs('reparent_gameobject', { instanceId: 1, newParent: null }).worldPositionStays, true);
  assert.equal(normalizeEngineArgs('delete_gameobject', { objectPath: '/Root/Child' }).objectPath, 'Root/Child');
});
test('bounded read defaults preserve explicit detailed requests', () => {
  assert.deepEqual(normalizeEngineArgs('get_gameobject', { idOrName: '42' }), { idOrName: '42', maxDepth: 0, includeComponents: true, includeComponentProperties: false });
  assert.equal(normalizeEngineArgs('get_gameobject', { idOrName: '42', includeComponentProperties: true }).includeComponentProperties, true);
  assert.equal(normalizeEngineArgs('get_console_logs', {}).includeStackTrace, false);
  assert.throws(() => normalizeEngineArgs('modify_material', { materialPath: 'Packages/X.mat', properties: { _Metallic: 0 } }), /Assets/);
  assert.throws(() => normalizeEngineArgs('modify_material', { materialPath: 'Assets/X.mat', properties: { _MainTex: null } }), /cannot clear/);
});
test('adapter validates types and preserves output projection before upstream writes', async () => {
  const calls = [];
  const def = raw('move_gameobject', { instanceId: { type: 'number' }, position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'], additionalProperties: false }, relative: { type: 'boolean' } }, ['position']);
  def.execute = async args => { calls.push(args); return { content: [] }; };
  def.projectContent = (exec, value) => [{ type: 'text', text: exec.marker + value.marker }];
  const tool = createEngineTools([def])[0];
  await assert.rejects(tool.execute({ action: 'translate', instanceId: 1, position: { x: 1, y: 2, z: 3 }, relative: 'false' }), /boolean/);
  await assert.rejects(tool.execute({ action: 'translate', instanceId: 1, position: { x: 1, y: 2 } }), /z is required/);
  await assert.rejects(tool.execute({ action: 'translate', instanceId: 1, position: { x: Infinity, y: 2, z: 3 } }), /finite/);
  assert.equal(calls.length, 0);
  assert.deepEqual(tool.projectContent({ arguments: { action: 'translate' }, marker: 'a' }, { marker: 'b' }), [{ type: 'text', text: 'ab' }]);
});
test('Play action reaches upstream action rather than being consumed by grouping', async () => {
  const tool = createEngineTools([raw('get_play_mode_status'), raw('set_play_mode_status', { action: {} }, ['action'])])[0];
  assert.equal(tool.name, 'unity_play');
  assert.deepEqual(JSON.parse((await tool.execute({ action: 'pause' })).content[0].text).args, { action: 'pause' });
  assert.deepEqual(JSON.parse((await tool.execute({ action: 'status' })).content[0].text).args, {});
  assert.throws(() => tool.execute({ action: 'stop', typo: true }), /only action/);
});
test('Play preserves upstream rendering and content projection', () => {
  const status = raw('get_play_mode_status'), control = raw('set_play_mode_status', { action: {} });
  status.output.render = args => ({ status: args });
  control.output.render = args => ({ control: args });
  const exec = { arguments: { action: 'pause' } }, value = {};
  control.projectContent = (actualExec, actualValue) => { assert.equal(actualExec, exec); assert.equal(actualValue, value); return ['projected']; };
  const tool = createEngineTools([status, control])[0];
  assert.deepEqual(tool.output.render({ action: 'status' }, value), { status: {} });
  assert.deepEqual(tool.output.render({ action: 'pause' }, value), { control: { action: 'pause' } });
  assert.deepEqual(tool.projectContent(exec, value), ['projected']);
});

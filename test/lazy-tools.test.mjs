import test from 'node:test';
import assert from 'node:assert/strict';
import { installLazyTools } from '../lib/lazy-tools.mjs';
function harness(lazy = true) {
  const globals = new Map(), events = {}, owners = [], agents = [];
  const effect = list => fn => { const cleanup = fn(); let active = true; const dispose = () => { if (active) { active = false; cleanup(); } }; list.push(dispose); return dispose; };
  const root = { tools: { schemas: () => [...globals.values()], get: name => globals.get(name) }, agents: { list: () => agents }, on: (name, fn) => { events[name] = fn; }, effect: effect(owners) };
  const makeAgent = () => {
    const local = new Map(), masks = new Set(), effects = [];
    const agent = { ctx: { effect: effect(effects), tools: {
      register(def) { assert.ok(!local.has(def.name)); local.set(def.name, def); return () => local.delete(def.name); },
      restrict({ deny }) { deny.forEach(name => assert.ok(globals.has(name))); const mask = new Set(deny); masks.add(mask); return () => masks.delete(mask); }
    } }, visible: () => [...new Set([...local.keys(), ...[...globals.keys()].filter(name => ![...masks].some(mask => mask.has(name)))])], local, masks, dispose: () => effects.forEach(fn => fn()) };
    agents.push(agent); events['agent/created']?.({ agent }); return agent;
  };
  const tool = (name, execute = async () => name) => ({ name: 'mcp__unity__' + name, description: name, parameters: { type: 'object', properties: {}, additionalProperties: false }, output: { schema: {}, render: () => [] }, execute });
  const start = () => installLazyTools(root, lazy);
  const step = agent => events['agent/pre-step']({ agent }, () => 'next');
  return { globals, root, makeAgent, tool, start, step, dispose: () => owners.forEach(fn => fn()) };
}
test('tools hidden before loading, agent isolation, adapter forwarding and cleanup', async () => {
  const h = harness(), a = h.makeAgent(), calls = [];
  const def = h.tool('get_scene_info', async (args, exec) => { calls.push({ args, exec }); return { scene: 'fixture' }; });
  const compatible = h.tool('execute_menu_item', async (args, exec) => { calls.push({ args, exec }); return { menu: 'executed' }; });
  compatible.parameters.properties.menuPath = { type: 'string' };
  h.globals.set(def.name, def); h.globals.set(compatible.name, compatible); h.start(); const b = h.makeAgent();
  try {
    assert.deepEqual(a.visible(), ['unity_load_tools']); assert.deepEqual(b.visible(), ['unity_load_tools']);
    const result = await a.local.get('unity_load_tools').execute(); assert.deepEqual(result.tools, ['unity_scene', compatible.name]);
    const exec = { marker: 'execution-context' };
    assert.deepEqual(await a.local.get('unity_scene').execute({ action: 'info' }, exec), { scene: 'fixture' });
    assert.deepEqual(await a.local.get(compatible.name).execute({ menuPath: 'Fixture/Menu' }, exec), { menu: 'executed' });
    assert.deepEqual(calls, [{ args: {}, exec }, { args: { menuPath: 'Fixture/Menu' }, exec }]);
    assert.equal(calls[0].exec, exec); assert.equal(calls[1].exec, exec);
    assert.ok(a.visible().includes('unity_scene')); assert.ok(!a.visible().includes(def.name)); assert.ok(!b.visible().includes('unity_scene'));
    await a.local.get('unity_load_tools').execute(); assert.equal(a.local.size, 3);
  } finally { h.dispose(); }
  assert.equal(a.local.size, 0); assert.equal(b.local.size, 0); assert.equal(a.masks.size, 0); assert.equal(b.masks.size, 0);
});
test('late discovery, adapter schema refresh, disconnection and retry', async () => {
  const h = harness(); h.start(); const a = h.makeAgent();
  try {
    await assert.rejects(a.local.get('unity_load_tools').execute(), /not connected/);
    const def = h.tool('get_scene_info'); h.globals.set(def.name, def); assert.equal(h.step(a), 'next'); assert.deepEqual(a.visible(), ['unity_load_tools']);
    await a.local.get('unity_load_tools').execute();
    assert.deepEqual(a.local.get('unity_scene').parameters.properties.action.enum, ['info']);
    const save = h.tool('save_scene'); h.globals.set(save.name, save); h.step(a);
    assert.deepEqual(a.local.get('unity_scene').parameters.properties.action.enum, ['info', 'save']);
    assert.equal(await a.local.get('unity_scene').execute({ action: 'save' }), 'save_scene');
    const compatible = h.tool('execute_menu_item'); h.globals.set(compatible.name, compatible); h.step(a);
    h.globals.set(compatible.name, { ...compatible, description: 'updated' }); h.step(a); assert.equal(a.local.get(compatible.name).description, 'updated');
    h.globals.clear(); h.step(a); assert.deepEqual(a.visible(), ['unity_load_tools']);
    h.globals.set(def.name, def); h.step(a); assert.ok(a.visible().includes('unity_scene')); assert.ok(!a.visible().includes(def.name));
    assert.equal(await a.local.get('unity_scene').execute({ action: 'info' }), 'get_scene_info');
    a.dispose(); assert.equal(a.local.size, 0); assert.equal(a.masks.size, 0);
  } finally { h.dispose(); }
});
test('eager mode hides raw scene tools and exposes callable adapters without loader', async () => {
  const h = harness(false), def = h.tool('get_scene_info'); h.globals.set(def.name, def); h.start(); const a = h.makeAgent();
  try {
    assert.deepEqual(a.visible(), ['unity_scene']); assert.equal(a.local.size, 1);
    assert.equal(await a.local.get('unity_scene').execute({ action: 'info' }), 'get_scene_info');
  } finally { h.dispose(); }
  assert.equal(a.local.size, 0); assert.equal(a.masks.size, 0);
});
for (const lazy of [true, false]) {
  test(`${lazy ? 'lazy' : 'eager'} refreshes executors after same-schema reconnection without a disconnect step`, async () => {
    const h = harness(lazy), calls = [];
    const before = h.tool('get_scene_info', async (args, exec) => { calls.push({ connection: 'before', args, exec }); return 'before'; });
    h.globals.set(before.name, before); h.start(); const a = h.makeAgent();
    try {
      if (lazy) await a.local.get('unity_load_tools').execute();
      assert.equal(await a.local.get('unity_scene').execute({ action: 'info' }), 'before');
      const previousAdapter = a.local.get('unity_scene');
      const after = { ...before, execute: async (args, exec) => { calls.push({ connection: 'after', args, exec }); return 'after'; } };
      assert.deepEqual(after.parameters, before.parameters);
      assert.equal(after.description, before.description);
      h.globals.set(after.name, after);
      assert.equal(h.step(a), 'next');
      assert.notEqual(a.local.get('unity_scene'), previousAdapter);
      const exec = { marker: 'reconnected-context' };
      assert.equal(await a.local.get('unity_scene').execute({ action: 'info' }, exec), 'after');
      assert.deepEqual(calls.map(call => call.connection), ['before', 'after']);
      assert.deepEqual(calls[1].args, {}); assert.equal(calls[1].exec, exec);
      assert.ok(!a.visible().includes(before.name));
      assert.deepEqual(a.visible(), lazy ? ['unity_load_tools', 'unity_scene'] : ['unity_scene']);
      assert.equal(a.masks.size, 1);
      h.step(a); assert.equal(a.masks.size, 1);
    } finally { h.dispose(); }
    assert.equal(a.local.size, 0); assert.equal(a.masks.size, 0);
  });
}
test('schema byte comparison quantifies deferred context', () => {
  const h = harness(); for (let i = 0; i < 40; i++) { const def = h.tool('editor_operation_' + i); def.parameters = { type: 'object', properties: { objectPath: { type: 'string', description: 'Scene hierarchy path of the target GameObject' } } }; h.globals.set(def.name, def); }
  h.start(); const a = h.makeAgent(); const project = ({ name, description, parameters }) => ({ name, description, parameters });
  const eagerBytes = Buffer.byteLength(JSON.stringify([...h.globals.values()].map(project)));
  const lazyBytes = Buffer.byteLength(JSON.stringify([...a.local.values()].map(project)));
  assert.ok(lazyBytes < eagerBytes / 4); h.dispose();
});

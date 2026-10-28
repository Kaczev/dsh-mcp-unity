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
  const tool = (name, execute = async () => name) => ({ name: 'mcp__unity__' + name, description: name, parameters: { type: 'object' }, output: { schema: {}, render: () => [] }, execute });
  const start = () => installLazyTools(root, lazy);
  const step = agent => events['agent/pre-step']({ agent }, () => 'next');
  return { globals, root, makeAgent, tool, start, step, dispose: () => owners.forEach(fn => fn()) };
}
test('tools hidden before loading, agent isolation, exact forwarding and cleanup', async () => {
  const h = harness(), a = h.makeAgent(); const def = h.tool('get_scene_info'); h.globals.set(def.name, def); h.start(); const b = h.makeAgent();
  assert.deepEqual(a.visible(), ['unity_load_tools']); assert.deepEqual(b.visible(), ['unity_load_tools']);
  const result = await a.local.get('unity_load_tools').execute(); assert.deepEqual(result.tools, [def.name]);
  assert.equal(a.local.get(def.name).execute, def.execute); assert.ok(a.visible().includes(def.name)); assert.ok(!b.visible().includes(def.name));
  await a.local.get('unity_load_tools').execute(); assert.equal(a.local.size, 2);
  h.dispose(); assert.equal(a.local.size, 0); assert.equal(b.local.size, 0); assert.equal(a.masks.size, 0);
});
test('late discovery, schema refresh, disconnection and retry', async () => {
  const h = harness(); h.start(); const a = h.makeAgent();
  await assert.rejects(a.local.get('unity_load_tools').execute(), /not connected/);
  const def = h.tool('get_scene_info'); h.globals.set(def.name, def); assert.equal(h.step(a), 'next'); assert.deepEqual(a.visible(), ['unity_load_tools']);
  await a.local.get('unity_load_tools').execute();
  h.globals.set(def.name, { ...def, description: 'updated' }); h.step(a); assert.equal(a.local.get(def.name).description, 'updated');
  h.globals.clear(); h.step(a); assert.deepEqual(a.visible(), ['unity_load_tools']);
  h.globals.set(def.name, def); h.step(a); assert.ok(a.visible().includes(def.name)); a.dispose(); assert.equal(a.local.size, 0); h.dispose();
});
test('eager mode preserves globals and adds no loader', () => {
  const h = harness(false), def = h.tool('get_scene_info'); h.globals.set(def.name, def); h.start(); const a = h.makeAgent();
  assert.deepEqual(a.visible(), [def.name]); assert.equal(a.local.size, 0); h.dispose();
});
test('schema byte comparison quantifies deferred context', () => {
  const h = harness(); for (let i = 0; i < 40; i++) { const def = h.tool('editor_operation_' + i); def.parameters = { type: 'object', properties: { objectPath: { type: 'string', description: 'Scene hierarchy path of the target GameObject' } } }; h.globals.set(def.name, def); }
  h.start(); const a = h.makeAgent(); const project = ({ name, description, parameters }) => ({ name, description, parameters });
  const eagerBytes = Buffer.byteLength(JSON.stringify([...h.globals.values()].map(project)));
  const lazyBytes = Buffer.byteLength(JSON.stringify([...a.local.values()].map(project)));
  assert.ok(lazyBytes < eagerBytes / 4); console.log(JSON.stringify({ fixture: '40 synthetic tools; UTF-8 bytes, not model tokens', eagerBytes, lazyBytes })); h.dispose();
});

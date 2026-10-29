import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, Service } from '@deepseek-ai/cordis';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope';
import { screenshotTool } from '../lib/capture-window.mjs';
import { projectTool } from '../lib/project.mjs';
import { installationTool } from '../lib/install-codergamester.mjs';
import { configurationTool } from '../lib/configure-project.mjs';
import { installLazyTools } from '../lib/lazy-tools.mjs';

function runtime() {
  const ctx = new Context();
  class Prompt extends Service { constructor(ctx) { super(ctx, 'systemPrompt'); } tools() { return () => {}; } }
  new Prompt(ctx); new ToolRuntime(ctx);
  const scopes = [createScope(ctx, {}), createScope(ctx, {})];
  const agents = scopes.map(({ ctx }) => ({ ctx }));
  class Agents extends Service { constructor(ctx) { super(ctx, 'agents'); } list() { return agents; } }
  new Agents(ctx);
  const names = i => ctx.tools.schemas(scopeOf(agents[i].ctx)).map(t => t.name);
  const get = (i, name) => ctx.tools.get(name, scopeOf(agents[i].ctx));
  return { ctx, scopes, agents, names, get };
}
test('late MCP registration stays hidden before any pre-step and refreshes loaded agents immediately', async () => {
  const { ctx, scopes, names, get } = runtime();
  const owner = ctx.plugin(context => installLazyTools(context, true, setupTools())); await owner;
  const disposers = [];
  try {
    await get(0, 'unity_load_tools').execute();
    const before = sceneTool(async () => 'before');
    disposers.push(ctx.tools.register(before));
    assert.deepEqual(names(1), ['unity_load_tools']);
    assert.ok(names(0).includes('unity_scene'));
    assert.equal(await get(0, 'unity_scene').execute({ action: 'info' }), 'before');
    disposers.pop()();
    assert.ok(!names(0).includes('unity_scene'));
    disposers.push(ctx.tools.register(sceneTool(async () => 'after')));
    assert.deepEqual(names(1), ['unity_load_tools']);
    assert.equal(await get(0, 'unity_scene').execute({ action: 'info' }), 'after');
    const scope = createScope(ctx, {}); scopes.push(scope);
    const agent = { ctx: scope.ctx };
    await ctx.serial('agent/created', { agent });
    assert.deepEqual(ctx.tools.schemas(scopeOf(agent.ctx)).map(t => t.name), ['unity_load_tools']);
    disposers.push(ctx.tools.register({ ...sceneTool(async () => 'menu'), name: 'mcp__unity__execute_menu_item' }));
    assert.deepEqual(names(1), ['unity_load_tools']);
    assert.ok(names(0).includes('mcp__unity__execute_menu_item'));
    await scopes[0].dispose();
    assert.ok(!names(0).includes('unity_load_tools'));
    assert.ok(!names(0).includes('unity_scene'));
  } finally { await owner.dispose(); disposers.forEach(dispose => dispose()); for (const scope of scopes) await scope.dispose(); }
});

const setupTools = () => [projectTool({}), screenshotTool({}), installationTool(), configurationTool({})];
const sceneTool = execute => ({ name: 'mcp__unity__get_scene_info', description: 'Read scene', parameters: { type: 'object', properties: {}, additionalProperties: false }, output: { schema: {}, render: () => [] }, execute });

test('offline setup loads per agent using real ToolRuntime', async () => {
  const { ctx, scopes, names, get } = runtime(), setup = setupTools();
  const owner = ctx.plugin(context => installLazyTools(context, true, setup)); await owner;
  try {
    assert.deepEqual(names(0), ['unity_load_tools']);
    const result = await get(0, 'unity_load_tools').execute();
    assert.deepEqual(result.tools, setup.map(tool => tool.name));
    assert.ok(names(0).includes('unity_configure_project'));
    assert.deepEqual(names(1), ['unity_load_tools']);
  } finally { await owner.dispose(); for (const scope of scopes) await scope.dispose(); }
});

test('real Cordis ToolRuntime hides globals and exposes agent-local adapters', async () => {
  const { ctx, scopes, names, get } = runtime(), calls = [];
  const raw = sceneTool(async (args, exec) => { calls.push({ args, exec }); return { ok: true }; });
  const disposeTool = ctx.tools.register(raw);
  const owner = ctx.plugin(context => installLazyTools(context)); await owner;
  try {
    assert.deepEqual(names(0), ['unity_load_tools']); assert.deepEqual(names(1), ['unity_load_tools']);
    assert.deepEqual((await get(0, 'unity_load_tools').execute()).tools, ['unity_scene']);
    const exec = { marker: 'runtime-execution' };
    assert.deepEqual(await get(0, 'unity_scene').execute({ action: 'info' }, exec), { ok: true });
    assert.deepEqual(calls, [{ args: {}, exec }]); assert.equal(calls[0].exec, exec);
    assert.ok(names(0).includes('unity_scene')); assert.ok(!names(0).includes(raw.name));
    assert.ok(!names(1).includes('unity_scene')); assert.ok(!names(1).includes(raw.name));
    await owner.dispose();
    assert.ok(!names(0).includes('unity_load_tools')); assert.ok(!names(0).includes('unity_scene'));
    assert.ok(names(0).includes(raw.name)); assert.ok(names(1).includes(raw.name));
  } finally { await owner.dispose(); disposeTool(); for (const scope of scopes) await scope.dispose(); }
});

test('real ToolRuntime eager mode exposes setup once, masks raw scene and forwards adapter calls', async () => {
  const { ctx, scopes, names, get } = runtime(), calls = [], setup = setupTools();
  const raw = sceneTool(async (args, exec) => { calls.push({ args, exec }); return { activeScene: 'fixture' }; });
  const disposeTool = ctx.tools.register(raw);
  const owner = ctx.plugin(context => installLazyTools(context, false, setup)); await owner;
  try {
    for (let i = 0; i < 2; i++) {
      const visible = names(i);
      assert.equal(visible.length, new Set(visible).size);
      for (const tool of setup) assert.equal(visible.filter(name => name === tool.name).length, 1);
      assert.ok(!visible.includes('unity_load_tools')); assert.ok(!visible.includes(raw.name));
      assert.ok(visible.includes('unity_scene'));
      const exec = { agentIndex: i };
      assert.deepEqual(await get(i, 'unity_scene').execute({ action: 'info' }, exec), { activeScene: 'fixture' });
      assert.deepEqual(calls[i].args, {}); assert.equal(calls[i].exec, exec);
    }
    assert.equal(calls.length, 2);
    await owner.dispose();
    for (let i = 0; i < 2; i++) {
      assert.ok(!names(i).includes('unity_scene')); assert.ok(names(i).includes(raw.name));
      for (const tool of setup) assert.ok(!names(i).includes(tool.name));
    }
  } finally { await owner.dispose(); disposeTool(); for (const scope of scopes) await scope.dispose(); }
});

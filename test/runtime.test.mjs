import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, Service } from '@deepseek-ai/cordis';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope';
import { installLazyTools } from '../lib/lazy-tools.mjs';

test('offline setup loads per agent using real ToolRuntime', async () => {
  const ctx = new Context();
  class Prompt extends Service { constructor(ctx) { super(ctx, 'systemPrompt'); } tools() { return () => {}; } }
  new Prompt(ctx); new ToolRuntime(ctx);
  const scopes = [createScope(ctx, {}), createScope(ctx, {})];
  const agents = scopes.map(({ ctx }) => ({ ctx }));
  class Agents extends Service { constructor(ctx) { super(ctx, 'agents'); } list() { return agents; } }
  new Agents(ctx);
  const setup = { name: 'unity_configure_project', description: 'Configure', parameters: { type: 'object' }, output: { schema: {}, render: () => [] }, execute: async () => ({}) };
  const owner = ctx.plugin(context => installLazyTools(context, true, [setup])); await owner;
  try {
    const names = i => ctx.tools.schemas(scopeOf(agents[i].ctx)).map(t => t.name);
    assert.deepEqual(names(0), ['unity_load_tools']);
    const result = await ctx.tools.get('unity_load_tools', scopeOf(agents[0].ctx)).execute();
    assert.deepEqual(result.tools, ['unity_configure_project']);
    assert.ok(names(0).includes('unity_configure_project'));
    assert.deepEqual(names(1), ['unity_load_tools']);
  } finally { await owner.dispose(); for (const scope of scopes) await scope.dispose(); }
});

test('real Cordis ToolRuntime hides globals and exposes agent-local copies', async () => {
  const ctx = new Context();
  class Prompt extends Service {
    constructor(ctx) { super(ctx, 'systemPrompt'); }
    tools() { return () => {}; }
  }
  new Prompt(ctx);
  new ToolRuntime(ctx);
  const scopes = [createScope(ctx, {}), createScope(ctx, {})];
  const agents = scopes.map(({ ctx }) => ({ ctx }));
  class Agents extends Service {
    constructor(ctx) { super(ctx, 'agents'); }
    list() { return agents; }
  }
  new Agents(ctx);
  const execute = async () => ({ ok: true });
  const name = 'mcp__unity__get_scene_info';
  const disposeTool = ctx.tools.register({ name, description: 'Read scene', parameters: { type: 'object', properties: {} }, output: { schema: {}, render: () => [] }, execute });
  const owner = ctx.plugin(context => installLazyTools(context));
  await owner;
  try {
    assert.deepEqual(agents[0].ctx.tools.schemas(scopeOf(agents[0].ctx)).map(t => t.name), ['unity_load_tools']);
    assert.deepEqual(agents[1].ctx.tools.schemas(scopeOf(agents[1].ctx)).map(t => t.name), ['unity_load_tools']);
    await agents[0].ctx.tools.get('unity_load_tools', scopeOf(agents[0].ctx)).execute();
    assert.equal(agents[0].ctx.tools.get(name, scopeOf(agents[0].ctx)).execute, execute);
    assert.ok(agents[0].ctx.tools.schemas(scopeOf(agents[0].ctx)).some(t => t.name === name));
    assert.ok(!agents[1].ctx.tools.schemas(scopeOf(agents[1].ctx)).some(t => t.name === name));
    await owner.dispose();
    assert.ok(!agents[0].ctx.tools.schemas(scopeOf(agents[0].ctx)).some(t => t.name === 'unity_load_tools'));
  } finally {
    await owner.dispose();
    disposeTool();
    for (const scope of scopes) await scope.dispose();
  }
});

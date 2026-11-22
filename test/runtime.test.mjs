import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, Service } from '@deepseek-ai/cordis';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createScope } from '@deepseek-ai/dsh-scope';
import { installLazyTools } from '../lib/lazy-tools.mjs';
import { readPackagedSkills } from '../lib/packaged-skills.mjs';
import { apply } from '../index.mjs';

const directory = new URL('../skills/', import.meta.url);
const base = ['unity_load_tools', 'unity_project'];
const tool = (name, execute) => ({ name, execute, description: name, parameters: { type: 'object', properties: {} }, output: { schema: {}, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] } });
const valueOf = skill => ({ name: skill.name, content: skill.content, provider: 'runtime', resourceBase: skill.resourceBase });
const render = skill => `<skill_content name="unity">\n<skill_resources>\nBase directory for this skill: ${skill.resourceBase.path.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}\nResolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.\n</skill_resources>\n\n<skill_instructions>\n${skill.content}\n</skill_instructions>\n</skill_content>`;
function runtime() {
  const ctx = new Context(), agents = [], scopes = [], catalog = new Map();
  class Prompt extends Service { constructor(ctx) { super(ctx, 'systemPrompt'); } tools() { return () => {}; } }
  class Agents extends Service { constructor(ctx) { super(ctx, 'agents'); } list() { return agents; } get(id) { return agents.find(a => a.session.id === id); } }
  class Skills extends Service { constructor(ctx) { super(ctx, 'skills'); } register(skill) { catalog.set(skill.name, skill); return () => catalog.delete(skill.name); } }
  new Prompt(ctx); new ToolRuntime(ctx); new Agents(ctx); new Skills(ctx);
  let seq = 0;
  const add = async (parent, events = []) => {
    const agent = { session: { id: 'session-' + agents.length, events } };
    const scope = createScope(ctx, agent, parent ? { parent } : undefined);
    scopes.push(scope); agents.push(agent); agent.ctx = scope.ctx;
    await ctx.serial('agent/created', { agent }); return agent;
  };
  const names = agent => ctx.tools.schemas(agent).map(t => t.name).filter(n => /^(?:unity_|mcp__unity__)/.test(n)).sort();
  const execute = (agent, name, args) => ctx.tools.execute({ callId: `call-${++seq}`, name, arguments: args, agent, signal: new AbortController().signal });
  const dispose = async () => { for (const scope of [...scopes].reverse()) await scope.dispose(); };
  return { ctx, catalog, add, names, execute, dispose };
}

test('offline plugin requires a same-agent packaged load; legacy eager config, copied text and fork history do not activate', async () => {
  const h = runtime(), a = await h.add(), b = await h.add();
  const owner = h.ctx.plugin(ctx => apply(ctx, { lazyTools: false })); await owner;
  const skill = h.catalog.get('unity'); assert.ok(skill);
  let lookup = () => { throw Error('unavailable'); };
  const undo = h.ctx.tools.register(tool('skill', args => lookup(args.name)));
  const load = agent => h.execute(agent, 'skill', { name: 'unity' });
  const groups = (agent, names) => h.execute(agent, 'unity_load_tools', { groups: names });
  const event = { type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'unity', form: 'instructions' }, content: [{ type: 'text', text: render(skill) }] } };
  try {
    assert.deepEqual(h.names(a), []); assert.deepEqual(h.names(b), []);
    assert.equal((await groups(a, ['setup'])).isError, true);
    assert.equal((await load(a)).isError, true);
    lookup = () => ({ ...valueOf(skill), provider: 'user-dsh' }); await load(a);
    assert.deepEqual(h.names(a), []);
    lookup = () => valueOf(skill); assert.equal((await load(a)).isError, false);
    assert.deepEqual(h.names(a), base); assert.deepEqual(h.names(b), []);
    const child = await h.add(a, [event]); assert.deepEqual(h.names(child), []);
    for (const args of [{}, { groups: [] }, { groups: ['capture', 'all'] }]) {
      assert.equal((await h.execute(a, 'unity_load_tools', args)).isError, true); assert.deepEqual(h.names(a), base);
    }
    const project = h.ctx.tools.get('unity_project', a);
    assert.equal((await groups(a, ['capture'])).isError, false);
    assert.deepEqual(h.names(a), [...base, 'unity_capture_window'].sort());
    assert.deepEqual(h.names(child), []); assert.equal((await groups(child, ['setup'])).isError, true);
    assert.throws(() => project.execute({ action: 'list' }, { agent: child }), /unavailable/);
    await groups(a, ['setup', 'capture']); assert.equal(h.ctx.tools.get('unity_project', a), project);
    assert.deepEqual(h.names(a), [...base, 'unity_capture_window', 'unity_configure_project', 'unity_install_codergamester'].sort());
    await h.ctx.serial('session/event', { id: child.session.id }, event);
    await h.ctx.serial('session/event', child.session, { ...event, data: { ...event.data, source: { kind: 'user' } } });
    assert.deepEqual(h.names(child), []);
    await h.ctx.serial('session/event', child.session, event);
    assert.deepEqual(h.names(child), base); assert.deepEqual(h.names(b), []);
    assert.equal((await groups(child, ['setup'])).isError, false);
    assert.ok(!h.names(child).includes('unity_capture_window'));
    await owner.dispose(); assert.equal(h.catalog.size, 0);
    for (const agent of [a, b, child]) assert.deepEqual(h.names(agent), []);
  } finally { await owner.dispose(); undo(); await h.dispose(); }
});

test('private discovery publishes only to editor subscribers, replaces executors and withdraws stale registrations', async () => {
  const h = runtime(), a = await h.add(), b = await h.add(), [skill] = readPackagedSkills(directory);
  let bridge;
  const owner = h.ctx.plugin(ctx => { bridge = installLazyTools(ctx, { skill, project: tool('unity_project', () => 'project'), setup: [], capture: tool('unity_capture_window', () => 'capture') }); }); await owner;
  const undoSkill = h.ctx.tools.register(tool('skill', () => valueOf(skill)));
  const unrelated = h.ctx.tools.register(tool('mcp__other__list', () => 'other'));
  const raw = 'mcp__unity__get_scene_info';
  let unregister = bridge.register(tool(raw, () => 'before'));
  try {
    await Promise.resolve(); assert.deepEqual(h.names(a), []); assert.deepEqual(h.names(b), []);
    for (const agent of [a, b]) await h.execute(agent, 'skill', { name: 'unity' });
    await h.execute(a, 'unity_load_tools', { groups: ['editor'] });
    assert.deepEqual(h.names(a), [...base, 'unity_scene']); assert.deepEqual(h.names(b), base);
    assert.equal(h.ctx.tools.get(raw), undefined);
    assert.equal((await h.execute(a, 'unity_scene', { action: 'info' })).value, 'before');
    const prior = h.ctx.tools.get('unity_scene', a);
    unregister(); unregister = bridge.register(tool(raw, () => 'after'));
    assert.throws(() => prior.execute({ action: 'info' }, { agent: a }), /unavailable/);
    await Promise.resolve(); assert.notEqual(h.ctx.tools.get('unity_scene', a), prior);
    assert.equal((await h.execute(a, 'unity_scene', { action: 'info' })).value, 'after');
    const joined = await h.add(a); assert.deepEqual(h.names(joined), []);
    unregister(); await Promise.resolve(); assert.deepEqual(h.names(a), base);
    assert.equal((await h.execute(joined, 'mcp__other__list', {})).value, 'other');
    await owner.dispose(); assert.deepEqual(h.names(a), []); assert.deepEqual(h.names(b), []);
    assert.equal((await h.execute(a, 'mcp__other__list', {})).value, 'other');
  } finally { unregister(); await owner.dispose(); unrelated(); undoSkill(); await h.dispose(); }
});

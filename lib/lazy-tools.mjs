import { createEngineTools } from './engine-tools.mjs';
import { matchesSkillResult, matchesSkillInvocation } from './packaged-skills.mjs';

const groupNames = ['setup', 'capture', 'editor'];
const stringList = { type: 'array', items: { type: 'string' } };
const loader = {
  name: 'unity_load_tools',
  description: 'Add named Unity tool groups for this agent: setup (install and configure), capture (editor window), editor (connected engine). Does not install, connect or edit anything.',
  parameters: { type: 'object', properties: { groups: { type: 'array', minItems: 1, items: { type: 'string', enum: groupNames } } }, required: ['groups'], additionalProperties: false },
  output: { schema: { type: 'object', properties: { groups: stringList, tools: stringList }, required: ['groups', 'tools'], additionalProperties: false }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
};

export function installLazyTools(ctx, { skill, project, setup, capture }) {
  const states = new Map(), raw = new Map(), owners = new WeakMap();
  let stopped = false, version = 0, editorVersion = -1, editorTools = [], queued = false;

  // Older hosts ignore register(..., { when }). Hide a parent's local entries
  // there as well. Restrict inherited definitions only, never unrelated tools.
  function maskInherited() {
    const names = new Set();
    for (const state of states.values()) for (const name of state.entries.keys()) names.add(name);
    for (const [agent, state] of states) {
      for (const [name, mask] of state.masks) {
        if (states.get(mask.owner)?.entries.has(name)) continue;
        state.masks.delete(name);
        mask.undo();
      }
      for (const name of names) {
        if (state.masks.has(name) || state.entries.has(name)) continue;
        const owner = owners.get(ctx.tools.get(name, agent));
        if (owner && owner !== agent) {
          const undo = agent.ctx.tools.restrict({ deny: [name] });
          state.masks.set(name, { owner, undo });
        }
      }
    }
  }

  function sync(agent, state) {
    if (!state.active) return;
    const wanted = [project, state.loader];
    if (state.groups.has('setup')) wanted.push(...setup);
    if (state.groups.has('capture')) wanted.push(capture);
    if (state.groups.has('editor')) {
      if (editorVersion !== version) {
        editorTools = createEngineTools([...raw.values()]);
        editorVersion = version;
      }
      wanted.push(...editorTools);
    }
    const current = new Set(wanted);
    for (const [name, entry] of state.entries) if (!current.has(entry.source)) {
      state.entries.delete(name);
      entry.undo();
    }
    for (const source of wanted) {
      if (state.entries.has(source.name)) continue;
      const generation = editorTools.includes(source) ? version : undefined;
      const allowed = candidate => candidate === agent && states.get(agent) === state && state.active &&
        state.entries.get(source.name)?.source === source && (generation === undefined || generation === version);
      const definition = { ...source, execute(args, exec) {
        if (!allowed(exec?.agent)) throw Error('Unity tool is unavailable for this agent or connection.');
        return source.execute(args, exec);
      } };
      owners.set(definition, agent);
      const undo = agent.ctx.tools.register(definition, { when: ({ agent: candidate }) => allowed(candidate) });
      state.entries.set(source.name, { source, undo });
    }
  }

  function attach(agent) {
    if (stopped || states.has(agent)) return;
    const state = { active: false, groups: new Set(), entries: new Map(), masks: new Map() };
    state.loader = { ...loader, execute(args) {
      if (!args || Object.keys(args).some(key => key !== 'groups') || !Array.isArray(args.groups) || !args.groups.length ||
          !args.groups.every(name => groupNames.includes(name))) throw Error('Specify one or more Unity groups: setup, capture, editor.');
      for (const name of args.groups) state.groups.add(name);
      sync(agent, state);
      maskInherited();
      return { groups: [...state.groups], tools: [...state.entries.keys()] };
    } };
    states.set(agent, state);
    state.dispose = agent.ctx.effect(() => () => {
      states.delete(agent);
      for (const entry of state.entries.values()) entry.undo();
      for (const { undo } of state.masks.values()) undo();
      if (!stopped) maskInherited();
    }, 'unity.agent-tools');
    maskInherited();
  }
  function activate(agent) {
    const state = states.get(agent);
    if (!state) return;
    state.active = true;
    sync(agent, state);
    maskInherited();
  }
  ctx.on('tools/result', (exec, result) => {
    if (matchesSkillResult(skill, exec, result)) activate(exec.agent);
  });
  ctx.on('session/event', (session, event) => {
    if (!matchesSkillInvocation(skill, event)) return;
    const agent = ctx.agents.get(session.id);
    if (agent?.session === session) activate(agent);
  });
  ctx.on('agent/created', ({ agent }) => attach(agent));
  ctx.on('agent/pre-step', ({ agent }, next) => { attach(agent); return next(); });
  for (const agent of ctx.agents.list()) attach(agent);
  ctx.effect(() => () => {
    stopped = true;
    for (const state of [...states.values()]) state.dispose();
    raw.clear(); editorTools = [];
  }, 'unity.plugin-tools');

  // The MCP client replaces a generation in a synchronous unregister/register
  // batch. Invalidate old executors immediately, then publish the final list.
  function changed() {
    version++;
    if (queued || stopped) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (stopped) return;
      try {
        for (const [agent, state] of states) if (state.groups.has('editor')) sync(agent, state);
      } catch (error) { ctx.logger.warn(`Unity tool refresh failed: ${error.message}`); }
      finally { maskInherited(); }
    });
  }
  return { register(definition) {
    if (stopped || !definition.name.startsWith('mcp__unity__')) throw Error('Unexpected Unity MCP registration.');
    if (raw.has(definition.name)) throw Error('Duplicate Unity MCP tool: ' + definition.name);
    raw.set(definition.name, definition); changed();
    return () => {
      if (raw.get(definition.name) !== definition) return;
      raw.delete(definition.name); changed();
    };
  } };
}

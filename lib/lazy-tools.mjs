import { createEngineTools } from './engine-tools.mjs';
const PREFIX = 'mcp__unity__';
const empty = { type: 'object', properties: {}, additionalProperties: false };
export function installLazyTools(ctx, lazy = true, setupTools = []) {
  const states = new Map();
  const rawDefinitions = () => ctx.tools.schemas().filter(tool => tool.name.startsWith(PREFIX)).map(tool => ctx.tools.get(tool.name)).filter(Boolean);
  const definitions = () => [...setupTools, ...createEngineTools(rawDefinitions())];
  function attach(agent) {
    if (states.has(agent)) return;
    const state = { loaded: !lazy, signature: '', disposers: [], tools: [] };
    const refresh = () => {
      const raw = rawDefinitions();
      const defs = [...setupTools, ...createEngineTools(raw)], signature = JSON.stringify(defs.map(({ name, description, parameters }) => ({ name, description, parameters })));
      if (signature === state.signature && raw.length === state.raw?.length && raw.every((tool, i) => tool === state.raw[i])) return;
      state.raw = raw;
      for (const dispose of state.tools.splice(0).reverse()) dispose();
      if (state.mask) { state.mask(); state.mask = undefined; }
      const engineNames = rawDefinitions().map(tool => tool.name);
      if (engineNames.length) state.mask = agent.ctx.tools.restrict({ deny: engineNames });
      if (state.loaded) {
        const installed = [];
        try { for (const definition of defs) installed.push(agent.ctx.tools.register({ ...definition })); }
        catch (error) { for (const dispose of installed.reverse()) dispose(); throw error; }
        state.tools.push(...installed);
      }
      state.signature = signature;
    };
    state.refresh = refresh;
    state.dispose = agent.ctx.effect(() => () => {
      for (const dispose of state.tools.splice(0).reverse()) dispose();
      state.mask?.();
      for (const dispose of state.disposers.splice(0).reverse()) dispose();
      states.delete(agent);
    }, 'unity.lazy-tools');
    states.set(agent, state);
    if (lazy) state.disposers.push(agent.ctx.tools.register({
      name: 'unity_load_tools',
      description: 'Load Unity/Tuanjie tools for this agent. Start with unity_project action=list to discover open projects and the configured DSH target; then inspect/open/save/close a chosen project. Local management and package installation work without MCP; scene/object/asset tools require CoderGamester in the selected engine. Loading changes no project or connection.',
      parameters: empty,
      output: { schema: { type: 'object', properties: { tools: { type: 'array', items: { type: 'string' } } }, required: ['tools'], additionalProperties: false }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async () => {
        if (!definitions().length) throw Error('Unity MCP is not connected. Check projectPath/serverPath in plugin settings and start CoderGamester in Unity or Tuanjie.');
        state.loaded = true; state.signature = ''; refresh();
        return { tools: definitions().map(tool => tool.name) };
      }
    }));
    refresh();
  }
  ctx.on('agent/created', ({ agent }) => { attach(agent); });
  ctx.on('agent/pre-step', ({ agent }, next) => { attach(agent); states.get(agent).refresh(); return next(); });
  for (const agent of ctx.agents.list()) attach(agent);
  ctx.effect(() => () => { for (const state of [...states.values()]) state.dispose(); }, 'unity.lazy-owner');
}

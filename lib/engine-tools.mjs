const PREFIX = 'mcp__unity__';
const object = properties => ({ type: 'object', properties, additionalProperties: false });
const text = value => [{ type: 'text', text: JSON.stringify(value) }];
const has = (o, k) => Object.hasOwn(o, k) && o[k] !== undefined;
function target(args) {
  const id = has(args, 'instanceId'), p = has(args, 'objectPath');
  if (id === p) throw Error('Provide exactly one target: instanceId or objectPath. Use an instanceId from a recent read for inactive or ambiguous objects.');
  if (id && (!Number.isInteger(args.instanceId) || args.instanceId === 0)) throw Error('instanceId must be a nonzero integer.');
  if (p) {
    if (typeof args.objectPath !== 'string' || !args.objectPath.trim()) throw Error('objectPath must be nonempty.');
    args.objectPath = args.objectPath.replace(/^\/+/, '');
    if (!args.objectPath.trim()) throw Error('objectPath must identify an object, not the hierarchy root.');
  }
}
export function normalizeEngineArgs(name, input) {
  const args = { ...input };
  const finite = value => { if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Numeric values must be finite.'); if (value && typeof value === 'object') for (const item of Object.values(value)) finite(item); };
  finite(args);
  if (['move_gameobject', 'rotate_gameobject', 'scale_gameobject', 'set_transform', 'update_gameobject', 'delete_gameobject', 'duplicate_gameobject', 'reparent_gameobject', 'update_component', 'assign_material', 'select_gameobject'].includes(name)) {
    if (name === 'select_gameobject' && args.objectName && !args.objectPath) { args.objectPath = args.objectName; delete args.objectName; }
    target(args);
  }
  if (name === 'get_gameobject') {
    if (typeof args.idOrName !== 'string' || !args.idOrName.trim()) throw Error('idOrName must be a nonempty ID or hierarchy path.');
    args.idOrName = args.idOrName.replace(/^\/+/, '');
    args.maxDepth ??= 0; args.includeComponents ??= true; args.includeComponentProperties ??= false;
  }
  if (name === 'get_console_logs') { args.includeStackTrace ??= false; args.limit ??= 20; args.offset ??= 0; }
  if (name === 'reparent_gameobject') {
    if (!has(args, 'newParent') && !has(args, 'newParentId')) throw Error('Specify newParent or newParentId explicitly; use newParent:null to move to the scene root.');
    if (has(args, 'newParent') && has(args, 'newParentId')) throw Error('Provide only one new parent selector.');
    if (args.worldPositionStays === false) throw Error('Upstream false resets local position, rotation AND scale. Reparent with worldPositionStays:true, then set explicit local TRS.');
    args.worldPositionStays = true;
  }
  if (name === 'update_gameobject') {
    const data = args.gameObjectData;
    if (!data || !Object.keys(data).length) throw Error('gameObjectData must contain a change.');
    if (has(data, 'layer') && (!Number.isInteger(data.layer) || data.layer < 0 || data.layer > 31)) throw Error('layer must be an integer from 0 to 31.');
  }
  if (name === 'set_transform' && !['position', 'rotation', 'scale'].some(k => has(args, k))) throw Error('Supply at least one of position, rotation or scale.');
  if (name === 'update_component' && args.componentData && Object.values(args.componentData).some(v => typeof v === 'number' && !Number.isFinite(v))) throw Error('Component values must be finite.');
  if (name === 'save_scene' && args.saveAs && !args.scenePath) throw Error('scenePath is required for Save As.');
  if (name === 'save_scene' && args.scenePath && args.saveAs !== true) throw Error('scenePath always saves the ACTIVE scene to a destination; set saveAs:true explicitly. It is not a scene selector.');
  if (name === 'modify_material' && (!args.properties || !Object.keys(args.properties).length)) throw Error('properties must contain at least one shader property.');
  if (['load_scene', 'unload_scene', 'delete_scene'].includes(name) && !args.scenePath && !args.sceneName) throw Error('Provide scenePath or sceneName. Prefer scenePath for an unambiguous scene.');
  if (['create_material', 'modify_material', 'get_material_info', 'assign_material'].includes(name)) {
    const key = name === 'create_material' ? 'savePath' : 'materialPath';
    if (typeof args[key] !== 'string' || !/^Assets\/.+\.mat$/i.test(args[key]) || args[key].split('/').includes('..')) throw Error(key + ' must be an explicit Assets/.../*.mat path; Packages paths are not supported by this upstream implementation.');
    if (args.properties && Object.values(args.properties).some(v => v === null)) throw Error('Upstream cannot clear textures with null. Use an explicit supported shader value.');
  }
  return args;
}
const notes = {
  update_gameobject: ' Updates may create missing paths. Prefer instanceId to update existing objects. Invalid tags can be silently ignored upstream; read back after writing.',
  update_component: ' May add a missing component; failed updates may leave partial changes. Enum integers are indices, not underlying values; prefer names. References accept assets, not scene instance IDs. Read back after writing.',
  duplicate_gameobject: ' Upstream returns only an acknowledgement: query the new hierarchy for IDs before further edits.',
  reparent_gameobject: ' Parent must be explicit; only preserving world TRS is supported here.',
  batch_execute: ' Upstream batch is not an adapter transaction. Tool names/params use raw upstream contracts; do not use batch to bypass safer domain selectors or assume every write is atomic.',
};
function validate(schema, value, path = 'arguments') {
  if (schema.oneOf) {
    let matches = 0;
    for (const branch of schema.oneOf) { try { validate(branch, value, path); matches++; } catch {} }
    if (matches !== 1) throw Error(path + ' must match exactly one supported shape.');
  }
  const type = schema.type;
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(path + ' must be an object.');
    for (const key of schema.required ?? []) if (!has(value, key)) throw Error(path + '.' + key + ' is required.');
    for (const [key, item] of Object.entries(value)) {
      const child = schema.properties?.[key];
      if (child) validate(child, item, path + '.' + key);
      else if (schema.additionalProperties === false) throw Error(path + '.' + key + ' is not supported.');
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) throw Error(path + ' must be an array.');
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, path + '[' + i + ']'));
  } else if (type === 'null' ? value !== null : type === 'integer' ? !Number.isInteger(value) : type && typeof value !== type) throw Error(path + ' must be ' + type + '.');
  if (schema.enum && !schema.enum.includes(value)) throw Error(path + ' is not a supported value.');
  if (has(schema, 'const') && value !== schema.const) throw Error(path + ' does not match the required value.');
  if (typeof value === 'number' && (!Number.isFinite(value) || has(schema, 'minimum') && value < schema.minimum || has(schema, 'maximum') && value > schema.maximum)) throw Error(path + ' is outside the supported numeric range.');
}
export function createEngineTools(rawTools) {
  const raw = new Map(rawTools.map(t => [t.name.slice(PREFIX.length), t]));
  const invoke = async (name, input, exec) => {
    const definition = raw.get(name);
    if (!definition) throw Error('Unity tool is unavailable: ' + name + '. Check the connection and reload tools.');
    const args = normalizeEngineArgs(name, input);
    validate(definition.parameters, args);
    return definition.execute(args, exec);
  };
  const result = [], consumed = new Set();
  function group(name, description, actions) {
    const entries = Object.entries(actions).filter(([, upstream]) => raw.has(upstream));
    if (!entries.length) return;
    const branches = entries.map(([action, upstream]) => {
      consumed.add(upstream);
      const schema = structuredClone(raw.get(upstream).parameters);
      delete schema.$schema;
      schema.properties = { action: { type: 'string', const: action }, ...schema.properties };
      schema.required = ['action', ...(schema.required ?? [])];
      return schema;
    });
    const properties = { action: { type: 'string', enum: entries.map(([a]) => a) } };
    for (const branch of branches) for (const [key, value] of Object.entries(branch.properties)) if (key !== 'action') properties[key] ??= value;
    for (const [key, schema] of Object.entries(properties)) {
      if (key === 'action') continue;
      const used = entries.filter(([, upstream]) => has(raw.get(upstream).parameters.properties ?? {}, key)).map(([a]) => a);
      const required = entries.filter(([, upstream]) => raw.get(upstream).parameters.required?.includes(key)).map(([a]) => a);
      properties[key] = { ...schema, description: (schema.description ? schema.description + ' ' : '') + 'Actions: ' + used.join(', ') + '.' + (required.length ? ' Required for: ' + required.join(', ') + '.' : '') };
    }
    result.push({ name, description, parameters: { ...object(properties), required: ['action'] },
      output: { schema: {}, render: (args, value) => { const { action, ...input } = args; return raw.get(actions[action]).output.render(input, value); } },
      projectContent: (exec, value) => raw.get(actions[exec.arguments.action])?.projectContent?.(exec, value),
      execute: async (input, exec) => {
        const upstream = actions[input.action];
        if (!entries.some(([a]) => a === input.action)) throw Error('Unsupported action: ' + input.action);
        const { action, ...args } = input;
        const schema = raw.get(upstream).parameters;
        for (const key of Object.keys(args)) if (!has(schema.properties ?? {}, key)) throw Error(key + ' is not valid for action ' + action);
        for (const key of schema.required ?? []) if (!has(args, key)) throw Error(key + ' is required for action ' + action);
        return invoke(upstream, args, exec);
      } });
  }
  group('unity_transform', 'Set position/rotation/local scale, translate, rotate or multiply local scale. Targets require exactly one instanceId or objectPath. Relative rotation composes rotations; local translation adds parent-local coordinates. Writes return upstream acknowledgement, not verified actual TRS; read the object to verify.', { set: 'set_transform', translate: 'move_gameobject', rotate: 'rotate_gameobject', scale: 'scale_gameobject' });
  group('unity_scene', 'Inspect or manage scenes. create uses Single mode even with makeActive:false and can replace open scenes. load defaults to saving then replacing open scenes (save failure is not checked upstream); additive:true keeps them. unload defaults to saveIfDirty:true but does not verify save success; delete closes without saving. Prefer scenePath over ambiguous names. save targets the ACTIVE scene; scenePath is a Save As destination, never a selector. For verified all-scene save use unity_project save.', { info: 'get_scene_info', create: 'create_scene', load: 'load_scene', save: 'save_scene', unload: 'unload_scene', delete: 'delete_scene' });
  group('unity_material', 'Inspect/create/modify a material asset or bind an existing Renderer slot. Modification affects every shared reference and saves the asset. Creation may replace an existing asset: choose a new path. Unknown/invalid properties may be ignored upstream; read info after writes. Texture clearing is unsupported.', { info: 'get_material_info', create: 'create_material', modify: 'modify_material', assign: 'assign_material' });
  // Play control already uses action, so expose direct state actions rather than nesting it.
  if (raw.has('get_play_mode_status') && raw.has('set_play_mode_status')) {
    consumed.add('get_play_mode_status'); consumed.add('set_play_mode_status');
    result.push({ name: 'unity_play', description: 'Read or control Play Mode. pause toggles pause; play starts/unpauses; stop exits; step advances a paused frame. Play Mode changes can be discarded on stop.', parameters: { ...object({ action: { type: 'string', enum: ['status', 'play', 'pause', 'stop', 'step'] } }), required: ['action'] }, output: { schema: {}, render: (args, value) => raw.get(args.action === 'status' ? 'get_play_mode_status' : 'set_play_mode_status').output.render(args.action === 'status' ? {} : args, value) }, projectContent: (exec, value) => raw.get(exec.arguments.action === 'status' ? 'get_play_mode_status' : 'set_play_mode_status')?.projectContent?.(exec, value), execute: (input, exec) => {
      if (Object.keys(input).some(key => key !== 'action')) throw Error('Play accepts only action.');
      if (!['status', 'play', 'pause', 'stop', 'step'].includes(input.action)) throw Error('Unsupported Play action.');
      return invoke(input.action === 'status' ? 'get_play_mode_status' : 'set_play_mode_status', input.action === 'status' ? {} : { action: input.action }, exec);
    } });
  }
  for (const [name, tool] of raw) if (!consumed.has(name)) {
    const parameters = structuredClone(tool.parameters);
    if (name === 'get_gameobject') {
      parameters.properties.maxDepth = { ...parameters.properties.maxDepth, default: 0, description: 'Child depth; default 0. Query children directly when truncated.' };
      parameters.properties.includeComponentProperties = { type: 'boolean', default: false, description: 'Include serialized component values; default false.' };
    }
    if (name === 'get_console_logs') {
      parameters.properties.includeStackTrace = { type: 'boolean', default: false, description: 'Include stack traces; default false.' };
      parameters.properties.limit = { ...parameters.properties.limit, default: 20, description: 'Page size; default 20, maximum 500.' };
    }
    result.push({ ...tool, parameters, description: tool.description + (notes[name] ?? ''), execute: (args, exec) => invoke(name, args, exec) });
  }
  return result;
}

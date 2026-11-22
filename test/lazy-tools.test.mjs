import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, Service } from '@deepseek-ai/cordis';
import { privateBridgeContext } from '../index.mjs';
import { matchesSkillResult, matchesSkillInvocation } from '../lib/packaged-skills.mjs';

const skill = { name: 'unity', content: '\nUse Unity.\n', resourceBase: { kind: 'directory', path: '/A&B/<unity>/' } };
const source = { kind: 'skill-invocation', name: 'unity', form: 'instructions' };
const rendered = '<skill_content name="unity">\n<skill_resources>\nBase directory for this skill: /A&amp;B/&lt;unity&gt;/\nResolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.\n</skill_resources>\n\n<skill_instructions>\n\nUse Unity.\n\n</skill_instructions>\n</skill_content>';
const invocation = (text, metadata = source) => ({ type: 'user/message', data: { source: metadata, content: [{ type: 'text', text }] } });

test('activation requires the final success for this exact packaged skill', () => {
  const exec = { name: 'skill', arguments: { name: 'unity' } };
  const value = { ...skill, provider: 'runtime' };
  const result = { isError: false, value };
  assert.equal(matchesSkillResult(skill, exec, result), true);
  for (const wrong of [{ provider: 'user-dsh' }, { name: 'other' }, { content: 'copied' }, { resourceBase: undefined }, { resourceBase: { kind: 'directory', path: '/other' } }]) {
    assert.equal(matchesSkillResult(skill, exec, { ...result, value: { ...value, ...wrong } }), false);
  }
  for (const wrong of [{ isError: true }, { isError: undefined }, { value: undefined }]) assert.equal(matchesSkillResult(skill, exec, { ...result, ...wrong }), false);
  for (const wrong of [{ name: 'read' }, { arguments: { name: 'other' } }]) assert.equal(matchesSkillResult(skill, { ...exec, ...wrong }, result), false);
});

test('slash activation accepts only host invocation metadata and the complete directory-backed rendering', () => {
  assert.equal(matchesSkillInvocation(skill, invocation(rendered)), true);
  for (const text of ['/unity', skill.content, `prefix${rendered}`, `${rendered}suffix`, rendered.replace('/A&amp;B/', '/else/')]) {
    assert.equal(matchesSkillInvocation(skill, invocation(text)), false);
  }
  for (const wrong of [{}, { ...source, kind: 'paste' }, { ...source, name: 'other' }, { ...source, form: 'command' }]) assert.equal(matchesSkillInvocation(skill, invocation(rendered, wrong)), false);
  const event = invocation(rendered); event.data.content.push({ type: 'text', text: 'extra' });
  assert.equal(matchesSkillInvocation(skill, event), false);
  assert.equal(matchesSkillInvocation(skill, { ...invocation(rendered), type: 'assistant/message' }), false);
});

test('upstream cannot register tools, resources or server instructions on the parent context', () => {
  const ctx = new Context();
  class PublicService extends Service { constructor(ctx, name) { super(ctx, name); } }
  for (const name of ['tools', 'systemPrompt', 'mcpResources']) new PublicService(ctx, name);
  const privateTools = { register() { return 'private'; } };
  const bridge = privateBridgeContext(ctx, privateTools);
  assert.equal(bridge.tools.register(), 'private');
  assert.notEqual(ctx.tools, privateTools);
  for (const name of ['systemPrompt', 'mcpResources']) {
    assert.ok(ctx.get(name)); assert.equal(bridge.get(name), undefined);
  }
});

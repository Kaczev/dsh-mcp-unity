import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPackagedSkills, installPackagedSkills } from '../lib/packaged-skills.mjs';
const directory = new URL('../skills/', import.meta.url);

test('all packaged skills retain metadata, body and resolvable resource bases', () => {
  const skills = readPackagedSkills(directory);
  assert.deepEqual(skills.map(s => s.name), ['unity-safe-verification']);
  for (const skill of skills) {
    assert.equal(skill.source, 'runtime');
    assert.deepEqual(skill.invocation, { modelInvocable: true, userInvocable: true });
    assert.ok(skill.description.length > 10);
    assert.ok(readFileSync(skill.path, 'utf8').endsWith(skill.content));
    assert.ok(existsSync(join(skill.resourceBase.path, 'SKILL.md')));
  }
  const entry = readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
  assert.match(entry, /inject =.*'skills'/);
  assert.ok(entry.indexOf('installPackagedSkills(ctx,') < entry.indexOf('await mcp.apply'));
});

test('effects dispose exactly their own registrations and permit repeated enable', () => {
  const user = { name: 'unity-safe-verification', source: 'user-dsh', content: 'keep user skill' };
  const rows = [user], effects = [];
  const ctx = { skills: { register(skill) { rows.push(skill); return () => { const i = rows.indexOf(skill); if (i >= 0) rows.splice(i, 1); }; } }, effect(create) { effects.push(create()); } };
  for (let i = 0; i < 3; i++) {
    installPackagedSkills(ctx, directory);
    assert.equal(rows.length, 2);
    while (effects.length) effects.pop()();
    assert.deepEqual(rows, [user]);
  }
});

test('invalid skill metadata fails before any registration', () => {
  const temp = mkdtempSync(join(tmpdir(), 'dsh-skill-test-'));
  try {
    mkdirSync(join(temp, 'a')); mkdirSync(join(temp, 'b'));
    writeFileSync(join(temp, 'a', 'SKILL.md'), '---\nname: a\ndescription: valid\n---\nbody');
    writeFileSync(join(temp, 'b', 'SKILL.md'), '---\nname: wrong\ndescription: invalid\n---\nbody');
    let registered = 0;
    assert.throws(() => installPackagedSkills({ effect: f => f(), skills: { register() { registered++; } } }, pathToFileURL(temp + '/')), /Invalid packaged skill frontmatter/);
    assert.equal(registered, 0);
  } finally { rmSync(temp, { recursive: true }); }
});

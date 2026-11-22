import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function readPackagedSkills(directory) {
  const base = new URL('unity/', directory), path = new URL('SKILL.md', base);
  const source = readFileSync(path, 'utf8');
  const match = /^---\r?\nname: unity\r?\ndescription: ([^\r\n]+)\r?\n---\r?\n([\s\S]*)$/u.exec(source);
  if (!match || !match[1].trim() || !match[2].trim()) throw Error('Invalid packaged skill frontmatter or body: unity');
  return [{ name: 'unity', description: match[1], content: match[2], source: 'runtime', path: fileURLToPath(path),
    resourceBase: { kind: 'directory', path: fileURLToPath(base) }, invocation: { modelInvocable: true, userInvocable: true } }];
}

export function installPackagedSkills(ctx, directory) {
  const skills = readPackagedSkills(directory);
  for (const skill of skills) ctx.effect(() => ctx.skills.register(skill));
  return skills;
}

export function matchesSkillResult(skill, exec, result) {
  const value = result?.value;
  return exec.name === 'skill' && exec.arguments?.name === skill.name && result?.isError === false &&
    value?.name === skill.name && value.provider === 'runtime' && value.content === skill.content &&
    value.resourceBase?.kind === 'directory' && value.resourceBase.path === skill.resourceBase.path;
}

// Match the host's complete directory-backed invocation, not a body substring
// or a user-typed slash command. A changed host format must fail closed.
export function matchesSkillInvocation(skill, event) {
  if (event.type !== 'user/message') return false;
  const { source, content } = event.data;
  if (source?.kind !== 'skill-invocation' || source.name !== skill.name || source.form !== 'instructions' ||
      !Array.isArray(content) || content.length !== 1 || content[0]?.type !== 'text') return false;
  const path = skill.resourceBase.path.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const rendered = [`<skill_content name="unity">`, '<skill_resources>', `Base directory for this skill: ${path}`,
    'Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.',
    '</skill_resources>', '', '<skill_instructions>', skill.content, '</skill_instructions>', '</skill_content>'].join('\n');
  return content[0].text === rendered;
}

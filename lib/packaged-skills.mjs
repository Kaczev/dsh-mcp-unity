import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function readPackagedSkills(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort().map(name => {
      const base = new URL(`${name}/`, directory);
      const path = new URL('SKILL.md', base);
      const source = readFileSync(path, 'utf8');
      const match = /^---\r?\nname: ([^\r\n]+)\r?\ndescription: ([^\r\n]+)\r?\n---\r?\n([\s\S]*)$/u.exec(source);
      if (!match || match[1] !== name || !match[2].trim()) {
        throw new Error(`Invalid packaged skill frontmatter: ${name}`);
      }
      return {
        name, description: match[2], content: match[3], source: 'runtime',
        path: fileURLToPath(path),
        resourceBase: { kind: 'directory', path: fileURLToPath(base) },
        invocation: { modelInvocable: true, userInvocable: true },
      };
    });
}

export function installPackagedSkills(ctx, directory) {
  // Validate all plain name/description frontmatter before registering any entry.
  const skills = readPackagedSkills(directory);
  for (const skill of skills) ctx.effect(() => ctx.skills.register(skill));
}

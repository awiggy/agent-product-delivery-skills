// Packaging checks only; these do not evaluate an assistant's behavior.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inside = (base, target) => {
  const path = relative(base, target);
  return path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith(sep);
};
assert(inside(root, join(root, 'skills', 'example')));
assert(!inside(root, resolve(root, '..', 'outside')));
assert(!inside(root, `${root}-other/file.md`));

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.'))
    .flatMap(entry => entry.isDirectory()
      ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)]);
}

const skillsRoot = join(root, 'skills');
const skills = readdirSync(skillsRoot).filter(name => statSync(join(skillsRoot, name)).isDirectory());
assert.deepEqual(skills.slice().sort(), [
  'agent-blueprint', 'agent-frontend-delivery', 'agent-mvp-delivery', 'agent-release-readiness',
], 'Expected four independently packaged skills');
for (const skill of skills) {
  const directory = join(skillsRoot, skill);
  const entry = readFileSync(join(directory, 'SKILL.md'), 'utf8');
  assert.equal(entry.match(/^name: (.+)$/m)?.[1], skill, 'Folder and skill name must match');
  assert(entry.split('\n').length <= 80, 'Entrypoint grew beyond the suite context budget');
  const metadata = readFileSync(join(directory, 'agents/openai.yaml'), 'utf8');
  assert(metadata.includes(`$${skill}`), 'Default invocation must reference this skill');
}

let checkedLinks = 0;
for (const file of filesIn(root).filter(file => file.endsWith('.md'))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1];
    if (/^[a-z][a-z\d+.-]*:|^#/i.test(link)) continue;
    const target = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
    assert(inside(root, target), `Reference outside repository: ${file} -> ${link}`);
    assert(existsSync(target), `Broken reference: ${file} -> ${link}`);
    if (inside(skillsRoot, file)) {
      const skill = relative(skillsRoot, file).split(sep)[0];
      assert(inside(join(skillsRoot, skill), target), `Skill is not independently portable: ${link}`);
    }
    checkedLinks++;
  }
}
console.log(`PASS: ${skills.length} skills; ${checkedLinks} local links; portable references and entrypoint budgets.`);

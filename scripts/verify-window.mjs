import { listProjects } from '../lib/project.mjs';
import { captureProject } from '../lib/capture-window.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
const inventory = await listProjects();
if (inventory.projects.length !== 1 || !inventory.projects[0].projectPath) throw Error('Expected one identifiable editor for read-only capture probe.');
const image = await captureProject({ projectPath: inventory.projects[0].projectPath });
await mkdir('.tmp', { recursive: true });
await writeFile('.tmp/editor-window.png', image.data);
console.log(JSON.stringify({ ...image, data: undefined, output: '.tmp/editor-window.png' }));

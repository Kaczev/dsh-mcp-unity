import { manageProject } from '../lib/project.mjs';
const projectPath = new URL('../output/lifecycle-project', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
for (const action of ['list', 'status', 'open', 'list', 'status', 'save', 'close', 'list']) {
  const result = await manageProject({ action, ...(action === 'list' ? {} : { projectPath, timeoutMs: 180000 }), ...(action === 'open' ? { editorPath: 'C:/Program Files/Tuanjie/Hub/Editor/Tuanjie.exe' } : {}) });
  console.log(JSON.stringify({ action, result }));
  if (action === 'open' && !result.editorReady) throw Error('Editor readiness not confirmed; inspect before continuing.');
}

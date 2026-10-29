import { spawn } from 'node:child_process';
const env = {};
const seen = new Set();
for (const [key, value] of Object.entries(process.env)) if (!seen.has(key.toLowerCase())) { seen.add(key.toLowerCase()); env[key] = value; }
const root = new URL('../output/lifecycle-project', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const args = process.argv.includes('--interactive') ? ['-projectPath', root] : ['-batchmode', '-quit', '-projectPath', root];
const child = spawn('C:/Program Files/Tuanjie/Hub/Editor/Tuanjie.exe', [...args, '-logFile', root.replace(/\/lifecycle-project$/, '/lifecycle-compile.log')], { env, stdio: 'inherit' });
child.on('exit', code => process.exitCode = code);

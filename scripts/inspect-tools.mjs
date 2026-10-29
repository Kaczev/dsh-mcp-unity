import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { connectionConfig, resolveServer } from '../lib/connection.mjs';
const root = fileURLToPath(new URL('../output/lifecycle-project/', import.meta.url));
const server = await resolveServer({ projectPath: root });
const require = createRequire(server);
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const config = await connectionConfig({ projectPath: root, serverPath: server });
const client = new Client({ name: 'dsh-tool-inventory', version: '0.0.7' });
const transport = new StdioClientTransport({ command: process.execPath, args: [server], env: { ...process.env, ...config.env }, stderr: 'pipe' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  await mkdir(new URL('../output/audit/', import.meta.url), { recursive: true });
  await writeFile(new URL('../output/audit/tools.json', import.meta.url), JSON.stringify(tools, null, 2));
  console.log(JSON.stringify({ count: tools.length, bytes: Buffer.byteLength(JSON.stringify(tools)), tools: tools.map(t => ({ name:t.name, required:t.inputSchema.required ?? [], optional:Object.keys(t.inputSchema.properties ?? {}).filter(p => !t.inputSchema.required?.includes(p)) })) }, null, 2));
} finally { await client.close(); }

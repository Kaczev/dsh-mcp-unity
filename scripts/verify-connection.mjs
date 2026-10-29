import { createRequire } from 'node:module';
import { connectionConfig } from '../lib/connection.mjs';
const root = new URL('../output/lifecycle-project/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const server = root + 'Library/PackageCache/com.gamelovers.mcp-unity@382a43a30f/Server~/build/index.js';
const require = createRequire(server);
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const config = await connectionConfig({projectPath:root,serverPath:server});
const client = new Client({name:'dsh-isolated-validation',version:'0.0.4'});
const transport = new StdioClientTransport({command:process.execPath,args:[server],env:{...process.env,...config.env},stderr:'pipe'});
try { await client.connect(transport); const result=await client.callTool({name:'get_scene_info',arguments:{}}); console.log(JSON.stringify(result)); if(result.isError)process.exitCode=1; } finally { await client.close(); }

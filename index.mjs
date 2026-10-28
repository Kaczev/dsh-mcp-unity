import z from '@deepseek-ai/schemastery';
import * as mcp from '@deepseek-ai/dsh-mcp-client';
import { connectionConfig } from './lib/connection.mjs';
import { installLazyTools } from './lib/lazy-tools.mjs';
import { configurationTool } from './lib/configure-project.mjs';
export const name = 'dsh-unity-mcp';
export const inject = ['tools', 'agents', 'configEditor'];
export const Config = z.object({
  projectPath: z.string().default('').description('Unity / Tuanjie 项目绝对路径 / Absolute project directory'),
  serverPath: z.string().default('').description('CoderGamester Server~/build/index.js 绝对路径；留空从项目发现 / Built server path; blank discovers in project'),
  lazyTools: z.boolean().default(true).description('按 Agent 懒加载工具 / Load editor tools only when requested'),
  host: z.string().default('').description('覆盖 Unity 主机；留空沿用项目设置 / Host override; blank uses project settings'),
  port: z.number().min(0).max(65535).step(1).default(0).description('覆盖 Unity 端口；0 沿用项目设置 / Port override; 0 uses project settings'),
  authTokenPath: z.string().default('').description('可选认证 token 文件绝对路径；不在配置中存 token / Optional absolute token file path'),
  toolCallTimeoutMs: z.number().min(1000).max(600000).step(1).default(120000).description('工具超时（毫秒） / Tool timeout (ms)')
});
export async function apply(ctx, config) {
  // Install the loader even before configuration, so discovery explains setup.
  installLazyTools(ctx, config.lazyTools, [configurationTool(ctx)]);
  if (!config.projectPath && !config.serverPath) {
    ctx.logger.info('Unity MCP: configure projectPath or serverPath to connect CoderGamester/mcp-unity.');
    return;
  }
  await mcp.apply(ctx, mcp.Config(await connectionConfig(config)));
}

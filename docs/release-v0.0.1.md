# v0.0.1

首次发布 `dsh-unity-mcp`，把 CoderGamester/mcp-unity 接入 DSH。

- 默认只向每个 Agent 暴露 `unity_load_tools`；调用后加载上游原生工具，其他 Agent 不受影响。
- 支持 Unity / Tuanjie 工程内服务器发现、显式服务器路径、端口和认证文件配置。
- 提供中英文插件信息和 Krea 2 Turbo 生成的图标。
- README 说明引擎端安装要求，并链接到上游 https://github.com/CoderGamester/mcp-unity 。本包不包含上游服务器或引擎代码。

## 安装

在 DSH 插件管理中安装 `dsh-unity-mcp`。先在 Unity / Tuanjie 安装并启动上游 MCP Unity Server，然后设置插件的 `projectPath` 或 `serverPath`。支持 Node.js 22+、DSH >=0.2.1-rc.3 <0.3.0。

## 验证与限制

9 项测试通过，包括真实 Cordis ToolRuntime 的 Agent 隔离和卸载清理；语法检查及 npm 包内容检查通过。本机安装成功并可读取配置 schema。本次未通过新插件执行引擎工程操作，浏览器图标显示也未做截图验收。

依赖审计报告 18 个受影响依赖项（15 high、3 moderate），来自当前 DSH peer 依赖链中的 zod、undici、MCP HTTP client 等；数量包含向上传播的依赖项，并非 18 个独立漏洞。本插件使用 stdio，不使用 MCP HTTP/OAuth 传输，但不能据此认定所有通告都不适用。没有执行会更换 DSH 兼容版本的强制修复；宿主依赖更新后应重新验证。

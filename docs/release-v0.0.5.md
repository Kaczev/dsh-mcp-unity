# dsh-unity-mcp 0.0.5

打开工程现在会等待编辑器回应新鲜的就绪请求，而不再把进程启动当作加载完成。检查包含当前导入、编译结束后的短暂稳定期；超时返回 `editor_loading` / `editorReady: false`，再次调用可继续等待，不重复启动。就绪不等于 MCP 已连通。

运行或启动中的工程，安装 CoderGamester 前也会等待就绪；等待失败不修改包依赖。关闭的工程仍可离线准备安装，不会因此自动打开。首次检查会安装 Editor 桥接；未改动的官方 0.0.4 桥接备份后升级，未知或自定义内容拒绝覆盖。

README 改为当前版本使用流程：可手工安装 CoderGamester，也可交给 Agent，并按是否依赖引擎端 MCP 说明能力，不再逐版本累加功能清单。

## 验证

- `npm test`：16 项通过，包含打开后的等待、超时、安装前等待失败时保留依赖、就绪请求应答、懒加载隔离与生命周期检查。
- `npm run build`、`npm run pack:check`：通过；打包清单不含测试工程或日志。
- 独立团结工程（2022.3.62t5）的真实启动返回 `editor_ready`、`editorReady: true`，PID 13132；随后安装调用返回 `start_requested`。该就绪验收不证明 MCP 查询已连通，也不代表所有 Unity/团结版本均兼容。

- 本机 profile 重载已应用；通过实际懒加载工具再次打开已运行的独立工程，返回 `editor_ready`；随后安全关闭返回 `closed`，确认 PID 13132 退出。现有 MCP 连接配置未切换。

本地工程工具仍仅支持 Windows。依赖审计报告 18 项通告（3 moderate、15 high），未强制升级宿主依赖。

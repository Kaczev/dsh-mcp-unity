# v0.0.2

新增 `unity_configure_project`，让 Agent 直接配置 Unity / Tuanjie 工程路径。

- `unity_load_tools` 在未连接引擎时也能加载配置工具；初始仍只暴露一个加载入口。
- 配置工具检查工程目录和已构建的 CoderGamester 服务器，通过 DSH 官方 configEditor 保存并重载插件。
- 换工程时清空旧 host、port 和认证文件覆盖项，使用所选工程的设置。其他配置保留；并发修改连接字段时拒绝覆盖。

配置会影响当前 DSH profile 的所有会话。工具不会安装引擎包、构建服务器或启动编辑器；仍需先在引擎中安装并运行 https://github.com/CoderGamester/mcp-unity 。

## 验证

11 项测试通过，包括路径校验、保存前失败、未知设置保留、并发冲突，以及真实 Cordis ToolRuntime 的离线加载与 Agent 隔离。本机通过新工具保存测试工程路径、重载并发现引擎工具；只读场景查询返回 SampleScene，Is Dirty 为 false。

依赖链仍有此前报告的 18 个受影响依赖项（15 high、3 moderate），包含向上传播的依赖项。未强制升级 DSH peer 依赖；详见 0.0.1 发布说明。

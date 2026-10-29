# dsh-unity-mcp 0.0.4

新增按 Agent 懒加载、无需已有 MCP 连接的 Windows 工具：

- `unity_save_project` 保存所有有路径的已加载场景和修改资源；拒绝 Play Mode、Prefab Mode、未命名场景及保存后仍有修改的状态。
- `unity_close_project` 保存成功后请求正常退出，并确认目标工程进程退出；不强杀、不丢弃修改。
- `unity_install_codergamester` 保留其他依赖，添加固定 commit 的 CoderGamester 包，准备 Editor 桥接与自动启动设置。已有不同依赖时不替换。

首次使用会在目标工程的 Assets/Editor/DshUnityMcp 写入随包分发的 C# 桥接，可能触发编译。安装结果区分依赖准备和启动请求，不宣称已经连通；Node 服务缺少构建文件时仍需构建，再配置 DSH 连接并做只读验证。

## 验证

- `npm test`：15 项通过，包括离线安装保留依赖、重复调用、拒绝替换，以及生命周期错误、保存与退出确认。
- `npm run build`：JavaScript 语法检查通过。
- `npm run pack:check`：分发包含 C# 桥接，不包含测试工程和运行日志。
- 独立团结工程中创建的未保存对象已写入场景文件；关闭返回 `closed` 并确认原进程退出。
- 独立工程的 Package Manager 已解析固定版本并编译 CoderGamester。默认端口 8090 与现有工程冲突；仅将测试工程改为 18094 后，已通过独立 Node MCP 客户端读取 `Lifecycle` 场景，确认 `Is Dirty: false`。未改变现有 DSH 连接。
- 本机重载插件后，`unity_load_tools` 返回五个本地工具；通过真实工具调用安装、保存与关闭，分别返回 `start_requested`、`saved`、`closed`。测试工程已正常退出。
- 修复团结引擎 `Library/tuanjie default resources` 被误判为未保存工程资源的问题，保留 Assets 下资源的脏状态检查。

当前只支持 Windows。安装不会下载或构建 Node 服务器，不自动启动编辑器，也不修改 DSH 连接。依赖审计仍报告 18 项通告（3 moderate、15 high）；未为此强制升级宿主依赖。

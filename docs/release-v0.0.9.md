# v0.0.9

修复已打开的 Unity / Tuanjie 工程被误报为未运行或仍在加载的问题，并增加按 Agent 懒加载的编辑器窗口截图。

## 变更

- Windows PowerShell 进程查询显式输出 UTF-8，保留中文工程路径，避免路径匹配失败。
- 就绪握手失败返回 `readiness_unconfirmed`、`editorReady: null`，不据此推断仍在加载。进程参数不可读时返回 `process_unconfirmed`，并阻止无法排除的重复启动。
- 新增 `unity_capture_window`，按明确工程路径截取 Windows 编辑器主窗口，返回图片附件。不依赖 MCP 或 Editor 桥接，不抓桌面、不切换焦点、不还原最小化窗口。
- 截图脚本仅在自身 PowerShell 子进程指定 `-ExecutionPolicy Bypass`，不修改系统或用户策略。
- README 更新工程状态解释、截图用法及限制。

## 验证

- 30 项自动测试通过，覆盖中文输出、截图身份与格式检查，以及真实 Cordis ToolRuntime 的懒加载和 Agent 隔离。
- `npm run build`、`npm run pack:check`、`git diff --check` 通过。
- 本机 DSH 工具正确识别已打开的中文路径团结工程；截图工具通过 DSH 返回 2880 × 1800 编辑器窗口图片。

截图当前仅支持 Windows。最小化或不可用窗口会报错；GPU 视图可能黑屏或未刷新，独立弹窗不保证包含在主窗口图片中。截图实测没有改变工程场景、启动播放或关闭编辑器。

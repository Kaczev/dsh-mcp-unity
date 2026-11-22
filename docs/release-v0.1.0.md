# 0.1.0

新代理起初只有 `unity` 技能目录条目。当前代理成功加载该技能，或用户执行 `/unity` 之后，才会看到 `unity_project` 和 `unity_load_tools`。复制技能正文或从已加载会话派生子代理不会解锁工具。旧配置 `lazyTools: false` 不再提前公开工具。

工具按组追加：`setup` 负责安装和连接配置，`capture` 负责编辑器窗口截图，`editor` 负责当前连接上已发现的引擎工具。空列表和未知组名会被拒绝。原来的 `unity-safe-verification` 收进 `unity` 这一个入口。

## 验证

- `npm test`：28 通过。
- 未重跑真实 Unity / Tuanjie 编辑器。

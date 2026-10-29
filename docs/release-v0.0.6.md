# dsh-unity-mcp 0.0.6

Agent 现在可以通过 `unity_project` 的 `list` 操作查看所有可发现的 Unity/Tuanjie 编辑器进程，包括工程路径、PID、编辑器路径、工程版本，以及是否为 DSH 配置的连接目标。路径不可读的进程保留为 `project_unknown`，不输出原始命令行。清单只读，不安装桥接；进程存在不代表编辑器就绪，也不代表 MCP 已连通。

原来的 `unity_open_project`、`unity_save_project`、`unity_close_project` 合并为 `unity_project`，以 `open`、`save`、`close` 选择操作，另有不启动编辑器的 `status` 就绪检查。除 `list` 外都要求明确工程路径，不从当前连接猜测目标。已加载旧工具的 Agent 需要重新加载工具；脚本调用需改用新入口。

安装 CoderGamester 与配置 profile 连接仍为独立工具，因为改包和切换所有会话的连接不应成为打开工程的隐含副作用。保存失败不关闭、不强杀、不丢弃修改的约束保留。

## 验证

- 独立团结 2022.3.62t5 工程真实完成 list（空）、status（未运行）、open（就绪，PID 40888）、list（正确路径/PID）、status（就绪）、save（saved）、close（closed）、list（空）的流程。没有切换现有 DSH 连接，也没有关闭用户工作工程。
- `npm test`：18 项通过，新增只读清单、命令行脱敏、未知进程、配置目标标记、状态分支与动作路由；真实 Cordis 测试使用实际的新工具定义检验 Agent 隔离。
- 本机 profile 重载已应用，实际懒加载返回三个本地入口；`unity_project list` 返回空进程清单和原有配置目标，未改写连接。
- 同一安装/配置定义下比较本地工具 schema：旧生命周期入口组合为3791 UTF-8字节，新组合3031字节，减少约20%；这是字节比较，不是模型token测量。初始加载入口因新增发现指引从405字节增至476字节。
- 构建和打包检查用于确认新模块可分发，测试工程和日志不进入 npm 包。

工程管理仍仅支持 Windows。编辑器就绪与 MCP 连通分开判断；本次生命周期实验不声称已通过新的 MCP 场景查询。依赖审计仍报告18项通告（3 moderate、15 high），未强制升级宿主依赖。

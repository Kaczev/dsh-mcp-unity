# dsh-unity-mcp

<img src="assets/icon_00001_.png" width="128" alt="Unity MCP: white and blue cubes" />

把 [CoderGamester/mcp-unity](https://github.com/CoderGamester/mcp-unity) 接入 DSH，让 Agent 操作 Unity / Tuanjie（团结引擎）工程。工具默认按 Agent 懒加载，平时只提供一个加载入口。

## 能做什么

**不依赖已连接的 Unity MCP：** 在 Windows 上查看已打开的工程及 DSH 配置的连接目标，按工程版本匹配并打开编辑器、等待工程就绪、准备 CoderGamester 安装、保存已加载场景和修改资源、先保存再安全关闭编辑器，以及保存 DSH 的工程连接配置。保存、关闭和就绪检查会向工程加入一个小型 Editor 桥接，仍需编辑器正常编译并运行。

**依赖引擎端 CoderGamester MCP：** 查询和编辑场景、GameObject、组件、材质与资源，查看控制台，以及调用上游提供的编辑器和测试功能。具体能力随上游版本变化；有工具清单不代表编辑器已经连通。

本项目是 DSH 适配插件，不是 Unity、团结引擎或 CoderGamester 官方产品。控制编辑器内容前，必须在目标工程中安装并启动 [CoderGamester/mcp-unity](https://github.com/CoderGamester/mcp-unity)；可以自己安装，也可以让 Agent 准备安装。

## 安装 DSH 插件

需要 Node.js 22+、DSH `>=0.2.1-rc.3 <0.3.0`。在 DSH 插件管理中安装：

```text
dsh-unity-mcp
```

本地工程管理目前只支持 Windows。上游声明 Unity 2022.3+；本插件已在独立团结工程中验证，但不能保证所有 Unity / Tuanjie 版本都兼容。

## 连接你的工程

### 让 Agent 安装并连接

可以直接说：“打开 `C:/Projects/MyGame`，准备 CoderGamester，再连接这个工程。”

Agent 加载工具后，先用 `unity_project` 的 `list` 查看打开的工程和 DSH 配置的连接目标，再对明确的工程路径执行 `status`、`open`、`save` 或 `close`。`list` 只读，不会写入桥接或启动工程；工程路径无法读取的编辑器进程也会列出，并标为未知。`status` 会检查就绪但不启动编辑器，`open` 则在需要时按版本匹配并启动。

安装 CoderGamester 和保存 DSH 连接分别由独立工具处理，避免把打开工程、修改包和切换所有会话的连接混为一次操作。工程处于关闭状态时，也可以先离线准备安装，再打开编辑器。包依赖固定在已核验的上游 commit，已有不同的 CoderGamester 依赖时不会擅自替换；其他包会保留。

**打开工程需要时间。** 工具会等待编辑器完成当前导入、编译并回应新鲜握手：返回 `editor_ready` / `editorReady: true` 才代表这次编辑器就绪检查通过。`list` 中的 `running_not_verified` 只表示发现了进程。`status` 或 `open` 返回 `readiness_unconfirmed` 时，`running: true` 表示已发现该工程进程，`editorReady: null` 表示未能确认就绪，不能据此断定仍在加载。`process_unconfirmed` 表示部分进程的工程路径不可读，不能确认该工程是否运行。不要重复启动；可先截图查看编辑器。运行或启动中的工程，安装工具也会在修改依赖前执行就绪检查；等待失败不会改写依赖。关闭工程的离线安装只代表文件准备完成，不代表工程已打开。

编辑器就绪仍不等于 MCP 连通。Package Manager 还需下载和编译引擎包，服务需要成功启动；Node 服务器缺少构建文件时，还需在其 `Server~` 目录执行 `npm install` 和 `npm run build`。安装工具不会代为下载或构建 Node 服务器，也不自动改变 DSH 连接。

最后让 Agent 保存工程连接配置，并做一次只读场景查询。只有查询返回目标工程的信息，才能确认这条连接可用。

### 自己在工程里安装

1. 在 Unity / Tuanjie 的 Package Manager 中选择 **Add package from git URL**，按上游安装说明添加：
   ```text
   https://github.com/CoderGamester/mcp-unity.git
   ```
2. 等待包解析和编译，在 **Tools → MCP Unity → Server Window** 启动服务。找到对应的 `Server~/build/index.js`；缺少时在 `Server~` 中运行 `npm install` 和 `npm run build`。
3. 告诉 Agent：“把 Unity MCP 连接到 `C:/Projects/MyGame`。”也可以在 DSH 插件配置中手工填写 `projectPath`。自动发现失败时再指定已构建的 `serverPath`。
4. 做一次只读场景查询，核对工程和场景，而不只是确认工具已加载。

## 使用与安全边界

每个 Agent 初始只看到 `unity_load_tools`，调用后才获得本地工程管理和已发现的引擎工具；其他 Agent 不受影响。未连接 MCP 时仍可加载本地功能。服务器重连、工具更新和移除会同步到已加载的 Agent。需要立即暴露全部工具时，可将 `lazyTools` 设为 `false`，参数检查仍然有效。

引擎操作按领域组织：`unity_transform` 处理位置、旋转和缩放，`unity_scene` 管理场景，`unity_material` 管理共享材质与绑定，`unity_play` 查询或控制播放状态。其他操作保留上游名称。目标对象只能指定一个 `instanceId` 或 `objectPath`；对象详情默认只读自身且不展开组件属性，核对变换或组件值时需显式设置 `includeComponentProperties: true`。控制台默认返回 20 条且不带堆栈。

场景操作沿用上游副作用：创建场景使用 Single 模式；非 additive 加载会先尝试保存再替换已打开场景；删除场景不保存脏修改。场景 `save` 的 `scenePath` 是当前活动场景的另存目标，必须配合 `saveAs: true`，不能用来选择待保存场景。工程级安全保存请用 `unity_project`。材质修改会保存共享资源；未知 shader 属性可能被上游忽略，写后应回读。播放 `pause` 是切换操作，失败或超时后先查状态，不要盲目重试。

适配层会拒绝容易误操作的参数，包括冲突目标、缺省父级、越界 layer、非有限数值及不受上游支持的材质路径。组件更新可能添加组件或留下部分修改，批量调用也不保证所有操作可回滚；工具成功回执不能替代回读验证。

打开工程可能导入资源、运行工程内的编辑器脚本；安装包也会执行第三方代码。请只操作可信且已备份的工程。工具不会用不匹配的编辑器版本自动升级工程；自定义编辑器位置或多个匹配时，需要提供确切的 `editorPath`。

保存会处理所有已加载的具名场景和修改资源；未命名场景需先在编辑器中选择保存路径。Play Mode 和 Prefab Mode 会阻止保存与关闭。关闭只有在保存成功后才请求正常退出，并确认目标工程进程结束；不强杀，不提供丢弃修改选项。超时可能意味着操作已开始，重试前先检查编辑器。

就绪、保存、关闭和安装使用本插件分发的 Editor 桥接。首次使用会在 `Assets/Editor/DshUnityMcp` 写入脚本，可能触发编译；官方未改动的 0.0.4 桥接会备份后升级，自定义或未知内容不覆盖。安装修改包依赖或已有自动启动设置前也会保留 `.dsh-backup`。

**保存 DSH 连接配置会影响当前 profile 的所有会话。** 配置工具会校验路径，清空旧的 host、port、authTokenPath 覆盖项，再保存并重载插件。打开工程本身不会切换连接。多个工程同时运行时，要为它们安排不同的 MCP 端口，避免服务冲突。

## 配置

```json
{
  "projectPath": "C:/Projects/MyGame",
  "lazyTools": true
}
```

| 字段 | 默认值 | 用途 |
| --- | --- | --- |
| `projectPath` | 空 | 工程绝对路径；发现服务器并读取该工程设置 |
| `serverPath` | 空 | 已构建的上游 `Server~/build/index.js` 绝对路径；优先于自动发现 |
| `lazyTools` | `true` | 按 Agent 加载工具 |
| `host` | 空 | 覆盖 `UNITY_HOST`；留空沿用上游设置 |
| `port` | `0` | 覆盖 `UNITY_PORT`；0 沿用项目设置 |
| `authTokenPath` | 空 | 可选认证文件绝对路径；不在配置中存 token |
| `toolCallTimeoutMs` | `120000` | 上游 MCP 调用超时，1000–600000 毫秒；不控制本地工程打开的等待时间 |

插件从工程的 `Packages` 或 `Library/PackageCache` 发现服务器，兼容 `com.gamelovers.mcp-unity` 和 `com.codergamester.mcp-unity` 目录名。存在多个缓存版本时需明确指定 `serverPath`，也可以使用单独克隆并构建的上游服务器。

桥接进程使用工程的 `ProjectSettings/McpUnitySettings.json`。认证由上游控制，不要把 token 提交到 Git。已有其他 Unity MCP 连接时，避免重复注册相同的 `unity` 命名空间。

## 排障

- **工程就绪检查一直未确认**：进程已发现时不会据此报为“仍在加载”。用 `unity_capture_window` 并指定 `projectPath` 查看编辑器面板，再检查包解析、编译错误、模态窗口或自动刷新；不要因为超时再次启动编辑器。
- **查看编辑器窗口**：懒加载后可调用 `unity_capture_window({projectPath: "C:/Projects/MyGame"})`，不依赖 MCP 或 Editor 桥接。仅支持 Windows，返回指定工程主窗口的图片附件，不抓桌面、不切换焦点、不还原最小化窗口。最小化、窗口不可用会报错；GPU 视图可能黑屏或未刷新，主窗口截图也不保证包含独立弹窗。截图可能包含工程中的敏感内容。工具仅为截图 PowerShell 子进程指定 `-ExecutionPolicy Bypass`，不修改系统或用户策略。
- **安装等待失败**：运行中的工程尚未回应就绪检查，依赖未修改。先让工程完成加载；若修改过桥接源码，需人工处理冲突。
- **Built CoderGamester server not found**：确认引擎包已经安装且 Node 服务器已构建，或手工设置 `serverPath`。
- **Multiple cached CoderGamester servers found**：明确选择 `serverPath`。
- **端口占用、认证失败或工具调用失败**：检查目标工程的 Server Window、端口、认证文件和 DSH MCP 日志。安装准备成功、编辑器就绪、加载工具清单，都不能替代真实场景查询。

## 开发与来源

```sh
npm install
npm test
npm run build
npm run pack:check
```

测试覆盖服务器发现、配置边界、就绪等待、安装保护、保存关闭和 Agent 隔离。上下文大小测试比较 UTF-8 schema 字节数，不把字节数当作模型 token 数。

本适配插件采用 MIT 许可证。上游 [CoderGamester/mcp-unity](https://github.com/CoderGamester/mcp-unity) 也采用 MIT 许可证；本包不分发上游引擎或服务器源码。图标由 Krea 2 Turbo 生成，不使用 Unity 官方标志。许可与素材说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 按需技能目录

- [unity-safe-verification](skills/unity-safe-verification/SKILL.md)：安全操作、回读和 Play 验收。

这些技能需单独复制或链接到 `$DSH_HOME/skills/<技能名>`（缺省 `~/.dsh/skills`）；安装 MCP 插件不会安装它们。目录联接保留单一源，移动仓库后需重建。安装后在新会话确认发现，并用 `skill` 加载。跨技能引用需同时安装对应技能。

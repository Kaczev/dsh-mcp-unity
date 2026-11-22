---
name: unity
description: Use when working with Unity or Tuanjie to find open projects, check editor readiness or scene connectivity, edit scenes or assets, save or close an editor, or verify behavior in Play Mode.
---

# Working with Unity and Tuanjie

Load the packaged `unity` skill in the agent that will operate the editor. Calling `skill({"name":"unity"})`, or the user invoking `/unity` in that session, exposes `unity_project` and `unity_load_tools`. Pasting these instructions or forking an agent that loaded the skill does not expose its tools. Request additional groups only as needed; discovery does not install anything or switch the connection.

## Find the editor and verify the target

1. **Which projects are open?** On Windows, call `unity_project({"action":"list"})`. Report running editors separately from the profile's configured target. `running_not_verified` means a process was found; `project_unknown` means its project path could not be read. Stop here for an inventory request: no bridge or connection is needed.
2. **Is this editor ready?** Use `unity_project` with `action:"status"` and the project's absolute `projectPath`. It does not launch an editor, but it can write a bridge under `Assets/Editor/DshUnityMcp` and trigger compilation. Use `open` only when opening a trusted project is in scope: it can run project scripts during import. Match the project's editor version; do not upgrade it to get a match. `editor_ready` confirms a fresh bridge response. An unconfirmed result does not tell you whether the editor is still loading. After a timeout, list processes before considering another launch.
3. **Which scene will receive an edit?** Request `unity_load_tools({"groups":["editor"]})`, then call `unity_scene({"action":"info"})`. Compare the active scene's project-relative path and loaded scenes with what is expected in the target project. `Assets/Scenes/Main.unity` alone does not distinguish two projects that both have it. Look for a known, distinctive object or asset with a read-only query. If the evidence conflicts or remains ambiguous, report it and stop before writing. Neither the process list, bridge handshake nor tool list proves which editor answered MCP.

For a visual check of a specific editor, load `capture` and call `unity_capture_window` with its absolute `projectPath`. This does not need MCP or the bridge. Capture only when the window contents are in scope; other panels may show private work. A black or stale Game view is not evidence of a rendering failure.

## Edit an object or asset

Read the target and the values that should change before writing. For example, `mcp__unity__get_gameobject({"idOrName":"World/Spawn","includeComponentProperties":true})` reads the object's serialized component values. By default it reads only the object itself and omits those values. For an object write, pass exactly one of `instanceId` or `objectPath`; prefer an ID from a fresh read for inactive objects or repeated names.

- **Move or reparent an object.** Use `unity_transform` and choose local or world coordinates deliberately. To reparent, specify the new parent explicitly (`newParent:null` means the scene root). Preserve world placement during reparenting; if the user asked for a local offset, set it under the new parent afterward. Read back the hierarchy and Transform in the requested coordinate space. A success response does not establish placement.
- **Change a component.** Inspect the existing component first: an update can add a missing component, and an error can leave some fields changed. Read back the named fields, including after a failure. After duplicating an object, find the new object's ID before editing it. Batches use raw upstream arguments and do not roll back as a unit; inspect individual targets before retrying.
- **Change a material.** Use `unity_material` with an explicit `Assets/.../*.mat` path. Modifying a shared material saves it and affects every renderer using it. For a change limited to one object, use a separate material at an unused path and assign the intended renderer slot. Read back both the material property and the binding: the shader can ignore an unknown property without failing the call.

## Protect unsaved work

Inspect loaded scenes, dirty state and editor mode before a scene operation. `unity_scene` with `create` uses Single mode and can replace open scenes. Use additive loading when the existing scenes should stay open. Non-additive `load` and `unload` may proceed without verifying a requested save; `delete` closes the scene without saving its edits. When work must be preserved, verify the save before proceeding. On `save`, `scenePath` is a **Save As destination for the active scene** and requires `saveAs:true`; it does not select the scene to save.

For a project-wide save, use `unity_project` with `action:"save"` and the absolute `projectPath`: it saves all loaded named scenes and modified assets. `close` performs that save before requesting a normal exit and checking that the process ended. Both can install the bridge and refuse Play Mode, Prefab Mode or unnamed scenes. Report the blocker rather than leaving a user's mode, choosing an unnamed scene's destination or discarding edits. If the result is uncertain, inspect the editor and process list before repeating the action.

## Test a playable change

Start with `unity_play({"action":"status"})` and note whether the user is already playing or paused. In an authorized test, exercise the requested input and observe the result: for example, cross a trigger and verify its effect, not just that the scene entered Play. Check relevant console errors or test results. `pause` toggles; after an uncertain response, query status rather than toggling again.

If you started Play Mode, stop it after the test and read back the edit-mode scene or asset: runtime changes can disappear on stop. Preserve a Play session that was already in progress unless asked to change it. Report separately what persisted, what behavior you observed, and anything you could not test.

## Install or change the connection

Load `setup` only for an authorized installation or profile change. `unity_install_codergamester` prepares the project manifest, Editor bridge and server auto-start setting. It refuses to replace a different pinned dependency; preparing a closed project does not open it, build the Node server, or verify a connection. If the server build is missing, report that prerequisite.

`unity_configure_project` changes the connection for **all sessions in the profile**, clears host, port and auth-file overrides, and requests a plugin reload. Opening a project does not select it for MCP. After an authorized change and reload, load this skill again, request `editor` and verify the scene as above. Do not reconfigure a profile merely to make a failed probe pass.

---
name: unity
description: Use when working with Unity or Tuanjie to find open projects, check editor readiness or scene connectivity, edit assets, save or close an editor, or verify changes in Play Mode.
---

# Working with Unity and Tuanjie

Load this skill in the agent that will do the work. It exposes `unity_project` and `unity_load_tools` to that agent. For a project listing or lifecycle action, no additional tools are needed. Request other tools by name with `unity_load_tools`, for example `{"groups":["editor"]}`. `setup` adds installation and profile configuration; `capture` adds window capture; `editor` adds tools discovered on the current MCP connection. Loading a group does not install software, switch projects, or establish that an editor is connected.

## Find the project

On Windows, start with `unity_project({"action":"list"})`. It reads editor processes and this profile's configured project without opening an editor or writing a bridge. If the user only wants an inventory, report the list and stop. `running_not_verified` is process evidence, not a handshake. `project_unknown` means the process could not be mapped to a project; do not guess the path. Use an absolute `projectPath` for lifecycle actions.

- **Check readiness.** `action:"status"` checks an already running editor. It can write an Editor bridge under `Assets/Editor/DshUnityMcp` and trigger compilation. Use it only when those changes are in scope. `editor_ready` confirms a bridge handshake, not MCP connectivity. An unconfirmed result does not prove the editor is still loading.
- **Open.** `action:"open"` starts a matching editor if necessary and waits for readiness. A project can import assets and run editor scripts when opened. Use a trusted project and do not upgrade it to make the version match. After a timeout, list running editors before considering another launch. For a visual check, load `capture` and use `unity_capture_window` with the explicit path. Capture needs no bridge or MCP and may show private project content.
- **Identify the connected scene.** Load `editor` and call `unity_scene({"action":"info"})` when available. Match the returned path or other identifying data to the intended project; a common scene name alone is ambiguous. If the target differs or cannot be verified, stop before editing. Report the mismatch or the missing evidence; do not switch the profile to make the check pass.
- **Save or close.** `action:"save"` saves all loaded named scenes and modified assets. `action:"close"` saves first, requests normal exit, and checks that the target process ended. Both can install the bridge. Play Mode, Prefab Mode, or an unnamed scene prevents these actions. Let the user resolve unsaved work rather than exiting a mode or discarding work on their behalf. After a timeout, inspect the editor and list its process before retrying.

Only load `setup` for an authorized installation or connection change. `unity_install_codergamester` prepares the manifest, Editor bridge and auto-start setting; it does not build the Node server or verify connectivity. `unity_configure_project` changes the connection for all sessions in the profile, clears host, port and auth-file overrides, and requests a plugin reload. Opening an editor does not select it for MCP. After a switch and reload, load this skill again, request `editor`, and repeat the scene check.

## Edit and verify

1. Read the active scene, Play/Prefab state and target properties. Record the object's path or instance ID, coordinate space and original values. Check which objects share a material or Prefab before changing it. Use the current tool schema for parameter names.
2. Scene `create` can replace open scenes; non-additive `load` attempts a save but does not verify it. `delete` closes without saving. On `save`, `scenePath` is a destination for the active scene, not a selector, and requires `saveAs:true`. A disk copy omits unsaved edits; complete an authorized save first if the copy must include them.
3. Read back the changed values and references, using `includeComponentProperties:true` when needed. Check import, compilation and relevant console errors. After a move, for example, read the Transform and inspect its position in the target scene. An acknowledgment or clean compile does not prove placement. A failed batch can leave partial changes; inspect before retrying, deleting or reparenting.
4. For a playable change, check `unity_play` with `action:"status"`, then exercise the requested input, visible result and failure cases in Play Mode. `pause` toggles; query status after a timeout. Exit Play after the test, verify the edit-mode result, and inspect saved scene, asset and `.meta` changes. Runtime edits may be discarded on stop. Use isolated fixtures and clean up only your own objects. Report what was tested and what remains unverified.

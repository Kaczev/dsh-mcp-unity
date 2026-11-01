---
name: unity-safe-verification
description: Use when operating Unity or Tuanjie projects, changing scenes or assets, or delivering a playable build; confirm readiness, read back targets and verify in Play mode.
---

# Safe Unity/Tuanjie operations and live verification

## Confirm the target

Load the current tool catalog, enumerate projects and pin the absolute project path. Confirm editor readiness, the MCP connection, the scene and Play/Prefab states separately. A process, directory or handshake proves only its own layer; the read-only scene query must match the project. After a timeout, do not launch again or switch the global connection blindly.

## Before making changes

Read the target, affected scenes, Prefabs, shared materials and references. Record locators and original values; do not infer object names from script class names. Clarify world/local coordinates, shared/instance resources and the active scene versus the save-as target. Validate parameters and enums against the current schema.

Save the user's changes before copying the project; a disk copy excludes unsaved state. Keep package installation, editor upgrades, connection changes and opening untrusted projects within the authorized scope.

## Read back after writing

After a small write, query actual object values, components and references, and check the console. An acknowledgment does not guarantee the final value. Partial changes may already have occurred; assess batch rollback against the actual contract. Check other references before changing shared resources. Query state first after a timeout, especially for playback toggles, deletion and reparenting.

## Verify by layer

1. Files: inspect diffs, asset/meta pairs and references. Hashes prove only byte equality.
2. Import and compilation: wait for completion and read relevant stack traces. Do not clear logs to hide errors.
3. Scene: load the explicit scene and check its hierarchy and appearance. A default empty scene does not prove that the project is corrupt.
4. Play: exercise required main paths and failure branches. Check input, state, actual visuals and runtime errors. Static tests do not replace playing.
5. Persistence: exit Play, confirm the edit-mode result, save named scenes and resources, and check disk state. Runtime changes may be discarded.

Use isolated objects or fixtures for tests and clean up only your own objects. Report the scope verified at each layer. If Play cannot be entered, list the unverified features.

For example, after changing a position, read back the Transform and check the landing point in the target scene. Successful compilation does not prove that the character is grounded.

# v0.0.10

## Changes

- Package the existing skills and companion resources in the npm distribution.
- Register runtime skills through the current Host skills service when enabled; dispose registrations with the plugin. Preserve independent same-name user skills.
- Update README installation, ownership and migration instructions. No tool routing or application behavior redesign.

## Verification

- npm run check; npm test: 33 tests passed.
- npm run pack:check includes all owned SKILL.md files and companion resources.
- Current DSH profile: official plugin-manager enable/disable; every owned skill loaded from this package directory and disappeared from the live catalog on disable. Local duplicate junctions were backed up outside skill scanning; no skill bodies deleted.
- Restored original enabled states: Unity enabled; ComfyUI and Photoshop disabled.
- Same-name coexistence is covered by registration/disposal regression tests; not tested by adding a temporary real user skill.
- No new engine scene edits, image generation or Photoshop document edits were required or tested for this skill-lifecycle change.

# Repository navigation

- [README.md](README.md): engine prerequisites, DSH setup and tool loading.
- [index.mjs](index.mjs): plugin entry and configuration schema.
- [lib/open-project.mjs](lib/open-project.mjs): Windows matching editor discovery, duplicate detection and launch.
- [test/open-project.test.mjs](test/open-project.test.mjs): project launch safety and version checks.
- [docs/release-v0.0.3.md](docs/release-v0.0.3.md): launch tool release and verification limits.
- [lib/connection.mjs](lib/connection.mjs): server discovery and stdio connection mapping.
- [lib/configure-project.mjs](lib/configure-project.mjs): validate project paths and persist connection through configEditor.
- [test/configure-project.test.mjs](test/configure-project.test.mjs): configuration safety and concurrency checks.
- [docs/release-v0.0.2.md](docs/release-v0.0.2.md): configuration tool release and live verification.
- [lib/lazy-tools.mjs](lib/lazy-tools.mjs): per-agent tool visibility and lifecycle.
- [test/connection.test.mjs](test/connection.test.mjs), [test/lazy-tools.test.mjs](test/lazy-tools.test.mjs): offline verification.
- [test/runtime.test.mjs](test/runtime.test.mjs): real Cordis ToolRuntime per-agent visibility and disposal.
- [docs/design/icon.html](docs/design/icon.html): canonical Krea icon preview.
- [docs/release-v0.0.1.md](docs/release-v0.0.1.md): release notes, verification and dependency audit limits.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): upstream and artwork provenance.

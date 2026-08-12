# Repository Guidelines

## Project Structure & Module Organization

This repository is a `pnpm` workspace for a cross-platform IM app. Primary code lives in `apps/` (`web`, `electron`, `mobile`), `server/` (Express, WebSocket, outbox worker), and `packages/` (`shared`, `app-core`). Shared docs are in `docs/`, and root helper scripts are in `scripts/`. Tests currently live beside their packages, for example `server/test/*.test.mjs` and `packages/shared/test/*.test.mjs`.

## Build, Test, and Development Commands

Use Node 22 (LTS) and pnpm 8+. Minimum supported: Node 20.

- `pnpm install`: install workspace dependencies.
- `pnpm dev`: run the root development orchestrator in `scripts/dev.js`.
- `pnpm dev:server`, `pnpm dev:web`, `pnpm dev:electron`, `pnpm dev:mobile`: start one target locally.
- `pnpm build`: run the root build orchestrator in `scripts/build.js`.
- `pnpm build:web`, `pnpm build:electron`, `pnpm build:mobile`, `pnpm build:server`: build a single target.
- `pnpm lint`: run ESLint across `.ts`, `.tsx`, `.js`, and `.jsx`.
- `pnpm type-check` or `pnpm type-check:all`: run TypeScript checks across the workspace.
- `pnpm --filter @mushroom/server test`
- `pnpm --filter @mushroom/shared test`

## Build & Package Verification Restrictions

AI agents must NOT proactively execute app packaging / build-to-artifact commands such as `./gradlew :app:assembleDebug`, `./gradlew assembleRelease`, or any other `gradlew` assemble/bundle tasks. If verification of such a build is needed, ask the user first before running anything.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF line endings, final newline, and 2-space indentation. Prefer TypeScript for new code. Use `PascalCase` for React components, `camelCase` for functions and hooks, and lowercase snake-style filenames already common in the server such as `message_service.ts` and `outbox_worker.ts`. Run `pnpm lint` before opening a PR; Prettier is installed for formatting when needed.

## Encoding & Line Endings

- All text files must be read and written as UTF-8 without BOM across Windows, Linux, and macOS.
- When generating or overwriting text from PowerShell, Bash, or any other shell, explicitly use UTF-8 without BOM instead of relying on the shell's default encoding.
- Preserve the existing document language. If a file is already in Chinese, continue in Chinese unless the user explicitly requests a language change.
- Follow `.editorconfig` for line endings and final newline handling:
  - Use LF for normal source files and documentation.
  - Use CRLF only for `*.bat`, `*.cmd`, and `*.ps1` as defined in `.editorconfig`.
  - Always keep a final trailing newline.
- After writing any file containing Chinese or other non-ASCII text, reopen it and verify that no mojibake or encoding corruption was introduced.
- If a file appears garbled, do not continue editing the garbled text in place. Restore from a trusted UTF-8 source or rewrite it as valid UTF-8 first.
- When using PowerShell operations such as using the Out-File, Set-Content, Get-Content, etc. commands, when specifying the encoding through this parameter, the -Encoding parameter must also be added: -Encoding utf8

## Testing Guidelines

The active test runner is Node's built-in `node --test`, wrapped by package scripts. Add new tests as `*.test.mjs` under the owning package's `test/` directory. Prioritize coverage for shared business logic and server behavior; UI packages currently rely more on type checks and manual verification.

## Commit & Pull Request Guidelines

Recent history is mostly short messages like `update`, with occasional conventional prefixes such as `feat:`. Prefer clear, imperative commit subjects, ideally `type: summary` when the change fits (`feat`, `fix`, `refactor`, `docs`). PRs should explain scope, note affected apps/packages, link issues when available, and include screenshots for visible `apps/web` or Electron UI changes. Call out any required `.env` changes or migration steps explicitly.

## Configuration Tips

Each target maintains its own `.env`: `server/`, `apps/web/`,
`apps/electron/`, and `apps/mobile/` each ship a `.env.example`; copy it to
`.env` in the same directory and fill in local values. The repository root
no longer provides a unified `.env`, and client packages never read env
files from the root, so that server-side secrets are never bundled into
client artifacts. Do not commit secrets; keep local overrides out of
version control.

Logger-related env variables (`LOG_LEVEL` / `LOG_MAX_FILE_MB` /
`LOG_RETENTION_DAYS` / `LOG_TO_FILE`) are documented in
[`docs/logging.md`](docs/logging.md); server settings live in
`server/.env`, desktop settings in `apps/electron/.env`, and mobile
settings in `apps/mobile/.env`.

Attachment / text-length limits and chunked-upload parameters
(`MAX_*_SIZE_MB`, `UPLOAD_*`) are managed centrally in `server/.env` and
delivered to clients via `GET /api/config/limits`; see
`docs/upload-architecture.md` for details.

## Debug Logging for Bug Diagnosis

When diagnosing hard-to-reproduce bugs (especially UI rendering issues), use targeted `console.warn` with a unique tag prefix to pinpoint the root cause:

1. **Add debug logs** with a unique tag like `[DBG-<short-description>]` using `console.warn`, e.g.:
   ```typescript
   console.warn(
     "[DBG-IMG5] displayUri changed",
     "from:",
     prevUri,
     "to:",
     displayUri
   );
   ```
2. **View mobile logs** (Android):
   ```bash
   adb logcat -s ReactNativeJS:W | grep DBG-<tag>
   ```
3. **View web/Electron logs**: Open DevTools Console and filter by the tag.
4. **Add logs at key decision points**: URL priority chain, cache resolution, message state transitions, component re-renders.

**Critical rule**: After the bug is fixed, remove ALL temporary debug logs. Before declaring done, grep for `[DBG-` across the codebase and verify no debug logs remain. Use the Diagnose skill (`/diagnose`) for structured bug-hunting workflow.

## Code Quality Checks

**After each code modification**, ESLint checks must be run:

- `pnpm run lint`

**After fixing a bug, adding a feature, or refactoring code**, you must evaluate whether the change needs to be applied to both mobile and desktop platforms (apps/web, apps/electron, apps/mobile), as well as the server and shared packages when applicable.

- Do not write code for migrating legacy data. When necessary, I will manually clear and rebuild the database myself.
- Do not write redundant code. Extract and reuse public functions whenever possible.
- When listing alternative solutions, clearly mark which one is the recommended approach. Do not propose superficial workarounds that only address symptoms.
- When designing solutions, reference mainstream applications such as WhatsApp, Telegram, and WeChat as much as possible.
- Whenever you fix a bug, add a feature, or refactor code, review the documentation under the `docs/` directory to determine whether any updates are needed, and verify that both tests and type checks pass. Run `pnpm --filter <affected_package> test` and `pnpm type-check:all` as appropriate.
- Do not commit code autonomously. Wait for human review before finalizing any changes.
- After adding a new feature, if you find that existing code files or modules have become bloated or poorly organized, you must propose a refactoring. Keep modules decoupled and easy to maintain.

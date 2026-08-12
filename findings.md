# Findings and Decisions

## Current Alignment Check

- `task_plan.md` and the execution history are now aligned on the major state:
  - Stages `0` through `7` are complete.
  - `Stage 8` is complete.
  - `Stage 9` is complete.
  - `Stage 10` is complete.
- The next-turn continuation point is clear:
  - keep `Stage 8`, `Stage 9`, and `Stage 10` closed
  - track any new work as post-plan iteration
  - avoid reopening the completed 0-10 stage line without a concrete regression

## Repository-Level Decisions

- `task_plan.md` remains the user-facing Chinese execution plan.
- `progress.md` and `findings.md` are maintained in English.
- Messages are immutable.
- Message edit remains intentionally out of scope.
- Electron-first execution order remains valid even though shared/web paths continue to be updated.

## Stage 0 Findings

- Explicit API visibility was required in addition to websocket visibility.
- Health/readiness endpoints are more useful when startup issues are surfaced through the running HTTP server instead of terminating before diagnostics can be read.
- The Stage 0 work is complete; the remaining work is no longer environment-baseline work.

## Stage 1 Findings

- The auth/contact core path was already close to complete, but UX and verification debt remained.
- Normalized user-facing error text was necessary because raw backend messages were not acceptable product UX.
- Built-server startup correctness mattered because fake-green builds without runnable dist output would have invalidated later acceptance work.
- The registration contract needed a shared API surface and proper nickname persistence to count as complete.

## Stage 2 Findings

- The most important Stage 2 stabilization target was unread/read consistency, not adding more message types.
- Reconnect and cold-start recovery had to be treated as first-class product behavior, not as "maybe later" polish.
- A dedicated executable Stage 2 regression entry point was necessary because compile-only checks could not protect websocket/runtime behavior.

## Stage 3 Findings

- Most Stage 3 mechanics already existed in code before formal acceptance.
- The real gap was not implementation absence; it was missing repeatable verification.
- Current conversation-state semantics after incoming group messages are explicit and should be treated as contract unless deliberately changed:
  - pin persists
  - mute persists
  - archive clears
  - recipient draft persists

## Stage 4 Findings

- Stage 4 was partially built before formal acceptance, but it lacked a reliable acceptance boundary.
- Media support should be treated as image/file scope only for this stage.
- Voice/video remain future-stage work and should not be implied as currently supported.
- Media verification must include HTTP upload, websocket ack, realtime delivery, and sync recovery together.

## Stage 5 Findings

- The highest-leverage early quality work was package-level and server-level regression coverage, not UI automation.
- `@mushroom/shared` needed dual-format output because the built server test path still exercises CommonJS loading.
- A complete Stage 5 required both executable checks and written regression checklists.

## Stage 6 Findings

- Stage 6 is complete for the current repository scope.
- The important result is not "full production readiness," but that the repository now has:
  - ops smoke checks
  - load baselines
  - deployment checklist
  - metrics baseline
  - alert-rule template
  - rollback drill notes
- These scripts still require a running target service in real use; they are not fake self-contained proofs.

## Stage 7 Findings

- Stage 7 is complete.
- The mature-IM interpretation of Stage 7 is now correct:
  - recall
  - reply closure
  - forwarding
  - favorites
  - pins
  - search enhancement
  - clear-message governance
  - cross-device sync for personal message state
- Stage 7 should not be reopened for message edit work because that conflicts with the immutable-message rule.

## Stage 8 Findings

- Stage 8 does not start from zero on the group side.
- The codebase already contains substantial group-governance foundations:
  - announcement update paths
  - role update paths
  - owner transfer
  - member removal
  - leave/disband handling
  - related UI in `GroupManageModal.tsx`
- The most obvious missing mature-IM gap at Stage 8 start was contact governance, so `delete friend` was the right first item.
- Stage 8 is now complete.
- Contact governance closure required:
  - shared API exposure for `delete friend`, `block`, and `unblock`
  - renderer action wiring
  - local cache cleanup after relationship removal
  - database support for `friends.status = 4`
- Group-governance closure required executable verification, not just existing code paths.
- A dedicated `verify:stage8` script now proves:
  - announcement updates
  - owner/admin permission boundaries
  - invite permission enforcement
  - member removal visibility
  - owner transfer before leave
  - disband behavior

## Planning-Doc Findings

- Earlier `progress.md` and `findings.md` corruption was caused by two separate mistakes:
  - overwriting from an already-truncated working version
  - incorrect PowerShell string handling when stitching `git show` output back into files
- Those broken historical fragments are not useful as long-term state.
- The correct maintenance model is:
  - keep the logs in English
  - keep them structured
  - summarize real milestones and decisions
  - preserve explicit resume anchors

## What Was Missing and Is Now Captured

- The current active stage is explicitly recorded.
- The immutable-message rule is explicitly recorded.
- Stage 7 completion scope is explicitly recorded.
- Stage 8 completion and delivered governance work are explicitly recorded.
- The next recommended implementation stage is explicitly recorded.
- The doc-language rule is explicitly recorded:
  - Chinese for `task_plan.md`
  - English for `progress.md` and `findings.md`

## Stage 9 Findings

- Stage 9 did not require a new transport or server-side media protocol.
- The codebase already had:
  - generic attachment upload
  - audio/video message-type detection
  - inline audio/video rendering
  - media-panel and image-preview support
- The real Stage 9 gap was product closure in the composer and notification layer:
  - emoji entry existed only as a dead button
  - audio/video were artificially disabled despite supported payloads
  - desktop/unread notification behavior was not closed
- Stage 9 is now complete.
- The implemented Stage 9 scope is intentionally pragmatic:
  - emoji panel with common emoji insertion
  - audio/video as attachment-based media messages
  - unread-aware window title updates
  - desktop notifications with mute-aware filtering and `@`-mention priority

## Stage 10 Findings

- Stage 10 did not require a brand-new account system; it required closing the existing auth/user foundation into usable product surfaces.
- The repository already had:
  - profile read API
  - device ID generation in Electron
  - websocket presence counters in Redis
  - local/global message search primitives
- The real Stage 10 gaps were product and integration closure:
  - no profile update path
  - no user-facing device/presence summary
  - no top-level global search entry
  - no attachment-center style global media surface
- Stage 10 is now complete.
- The implemented Stage 10 scope is pragmatic and repository-aligned:
  - authenticated profile update API and UI
  - session/device summary using real websocket presence state
  - global message search entry with jump-to-message closure
  - attachment center backed by local Electron media aggregation
  - config-level env loading so direct imports and tests do not silently fall back to default Redis config before `.env` is read

## Known Remaining Risks

## Desktop Media Cache Findings

- Electron currently centralizes runtime paths through `app.getPath("userData")` and a development-only instance-aware path.
- The desktop SQLite migration list is in `apps/electron/src/main/migration.ts`; new local tables should be added as a new migration.
- Electron has no package-level test script yet, so this cache implementation needs to add one if it introduces package-specific test coverage.
- The renderer currently uses remote URLs directly for image, video, and audio messages, and generic file download uses browser `fetch` plus blob download.
- A pure cache core module is preferable for tests because Electron main modules import `electron`, which is awkward to exercise with Node's built-in test runner.
- Electron main build originally emitted only `index.js`; package-level tests now use a secondary `media-cache-core` main input so Node tests can import the pure cache rules.
- `pnpm run lint` currently formats the root `README.md` command table even though the cache task does not logically touch README content.

- Some older files in the repository still contain mojibake in user-facing strings and should be cleaned when those modules are touched again.
- The Stage 0-10 plan is complete for the current repository scope.

## Mobile Media Cache and Paging Findings

- `docs/message-media-strategy.md` requires opening a conversation with the latest 50 messages and appending older pages when the user scrolls upward.
- Mobile currently stores messages in SQLite, but `MobileDataRepository.listMessages()` returns the full visible conversation history and the chat detail screen renders that array with `ScrollView`.
- The mobile package already has `@shopify/flash-list`, so virtualization can be implemented without adding a list dependency.
- Mobile currently renders image messages directly from `content.url`, opens files with `Linking.openURL(content.url)`, and plays voice/audio directly from `content.url`.
- Mobile had no file-system dependency before this iteration. `react-native-fs` was added because the cache needs native file writes, hashing, existence checks, and local file URLs.
- Server and shared API already support `/message/list` with `beforeSequence` and `limit`, but mobile does not yet expose a controller action for explicit older-history paging.
- Video message payloads do not include a thumbnail URL today, so mobile now uses a paused `react-native-video` source to display the first frame from the remote URL or the cached local file. Dedicated generated thumbnail files would still require a future native thumbnail extractor or server-provided thumbnail.

## Next Recommended Actions

1. Treat new work as post-plan iteration, not as an unfinished Stage 10 carry-over.
2. If more account/platform work is needed later, prioritize abnormal-login alerts, deeper device-session controls, and governance surfaces.
3. Keep Stage 8, Stage 9, and Stage 10 closed unless a concrete regression is found.

## Post-Plan Iteration Findings: Message Sync Redesign

- A dedicated design doc now exists at `docs/message-sync-technical-design.md`.
- The most urgent implementation slice is client-side and does not require a full server redesign yet.
- The first practical wins are:
  - remove duplicate login-time sync
  - paginate conversation sync on the client
  - stop triggering message backfill for every updated conversation
- The server already returns a per-user delivered sequence through remote conversations.
- The current web mapper/diff path discards that remote delivered sequence and therefore cannot distinguish:

## Post-Plan Iteration Findings: Signal-Style Architecture Migration

- The repository can move off the legacy friend-request-centric UI without deleting all historical friend modules in one pass.
- The pragmatic migration boundary is:
  - search only by stable identifiers
  - open direct conversations explicitly
  - treat contacts and blocks as sync data
  - enforce privacy and block rules on the backend
- Web and mobile both had product assumptions tied to "新的朋友 / 添加好友 / 删除好友" entry points.
- The safest client migration was to keep local cache compatibility with existing `Friend`-shaped records while switching the remote source of truth to:
  - `/auth/contacts`
  - `/auth/blocks`
  - `/auth/privacy`
  - `/conversation/direct`
- The mobile UI needed an explicit cleanup of old request props and tests; type-checking alone was not enough until the screen tests were updated to the new contracts.
  - conversation metadata changes
  - actual message gaps
- This means the current client pays message-sync cost for many state-only updates.
- The first implementation slice is now in place:

## Post-Plan Iteration Findings: Mobile SQLite Storage

- Mobile app-core already depends on an injected `MobileDataRepository`, so the SQLite migration can stay in `apps/mobile` without coupling `packages/app-core` to React Native native modules.
- Existing MMKV usage also stores lightweight values such as device id, theme preference, language preference, pending notification opens, and auth JSON. These match the requested MMKV boundary and should remain there.
- Existing address-book recommendation cache is already backed by `react-native-nitro-sqlite`, but the generic local data repository still used JSON over MMKV before this iteration.
- `react-native-nitro-sqlite` returns `result.results` and also a TypeORM-style `result.rows._array`; test helpers should support the same shape.
- Message-state sync can arrive independently of message rows, so the SQLite repository should persist message states separately and merge them into messages when messages are inserted or listed.
  - login no longer runs a separate pre-Home sync pass
  - conversation sync now paginates through `pageNo/pageSize`
  - message backfill now only runs when remote delivered sequence is ahead of the local synced sequence
- This slice improves startup efficiency, but it does not yet solve:
  - contiguous local sync cursor safety
  - realtime gap repair
  - reinstall cold-start strategy
  - overly eager auto-read behavior
- The second implementation slice is now in place:
  - active-conversation auto-read is now gated by actual app visibility/focus
  - messages received while the window is hidden keep unread state instead of being cleared immediately
  - when the window regains focus or becomes visible again, the active conversation is read-synced
- This reduces read-state false positives, but it still does not guarantee:
  - that the message was visually rendered in the viewport
  - that local sync sequence advancement is contiguous-safe
- The third implementation slice is now in place:
- The message-sync redesign is now complete through the planned P0-P3 scope.
- The final delivered model now includes:
  - a shared sync orchestrator for startup and reconnect
  - stable composite cursors for conversation sync and message-state sync
  - per-conversation paged delta and history APIs
  - cold-start recent-window hydration instead of eager full-history import
  - persisted local backfill jobs with priority scheduling
  - contiguous local sequence advancement with gap repair
  - viewport-aware read synchronization
  - private-chat last-message read signaling
  - a metrics baseline document and scenario baseline script
- The remaining work after this point is no longer structural sync debt.
- Future improvements should focus on:
  - production thresholds for the new metrics
  - richer dashboards and alerts fed by real telemetry
  - scale validation against production-like datasets
  - conversation state now distinguishes contiguous local sync progress from the highest known server tail sequence
  - realtime message arrival and ack updates no longer advance `last_sync_sequence` by max value
  - local gap detection is persisted in SQLite and surfaced into renderer state
  - gap repair can now be triggered both proactively for the active conversation and periodically in the background
  - client-side `message/sync` execution is chunked to reduce one-shot request size across many conversations
- This closes the most dangerous silent-loss path in the current architecture:
  - receiving sequence `105` no longer implies that `104` was safely synced
  - local read state no longer automatically crosses a gap
  - missing ranges remain discoverable and repairable
- Important residual limitation:
  - the server still exposes bulk `POST /message/sync` instead of a true per-conversation paged delta/list API
  - client batching lowers peak request size, but it does not fully solve cold-start and reinstall cost at very large history sizes

## Post-Plan Iteration Findings: Realtime Audio/Video Calling

- The user clarified that the desired capability is realtime calling, not attachment-based media shortcuts.
- The current Stage 9 audio/video buttons are product-misaligned for a mature IM:
  - they only open file pickers
  - they do not capture microphone or camera
  - they do not create a live media session
- The new direction is now explicit:
  - realtime audio calling
  - realtime video calling
  - both direct-chat and group-chat support
  - Electron first
  - mobile deferred
  - 45-second timeout
  - all devices ring
  - hard busy-line behavior
  - call record message persisted into chat
  - weak-network support and TURN required in the first release

## Mature-Product Gaps That Must Be Accounted For

- A mature calling product needs an independent call-domain model.
- Reusing the message model for live-call state would create brittle behavior and poor debuggability.
- Group calling dramatically changes the architecture:
  - mesh may work for tiny groups
  - it does not scale predictably
  - a path toward SFU should be assumed early
- TURN is not an optional polish item:
  - without it, real-world NAT traversal success will be inconsistent
  - the first release would feel randomly broken even if local testing looks good
- Weak-network handling must be productized, not left as a WebRTC default:
  - audio should be prioritized over video
  - users need explicit UI state when video degrades or reconnects
- Multi-device ringing requires a strict ownership model:
  - all devices may ring
  - only one device should become the accepted active endpoint for a participant
  - the rest must be deterministically resolved to avoid ghost sessions
- Group-call records are more complicated than direct-call records:
  - one summary line is easy
  - preserving who joined, declined, timed out, or was busy is harder
  - the product should decide whether chat history stores a summary or participant-level detail

## Primary Pitfalls

- Pitfall: Trying to launch group calls on pure peer-to-peer mesh for all cases.
  - Impact:
    - CPU spikes
    - bandwidth explosion
    - poor call quality as participant count grows
  - Mitigation:
    - define explicit supported participant limits for the first release
    - keep the signaling and session model SFU-ready
    - avoid UI or protocol assumptions that lock the product into mesh forever

- Pitfall: Treating signaling as "just send some websocket events."
  - Impact:
    - race conditions between cancel, accept, timeout, and busy
    - duplicate ringing across devices
    - orphaned calls after reconnect
  - Mitigation:
    - define a formal call state machine before coding
    - make every signaling event idempotent
    - persist authoritative server-side call state

- Pitfall: Letting clients decide final call truth.
  - Impact:
    - different devices show different call outcomes
    - records disagree with actual behavior
  - Mitigation:
    - server owns final call status transitions
    - clients render server-confirmed state
    - call record messages are generated from authoritative server state

- Pitfall: Under-specifying multi-device behavior.
  - Impact:
    - same user answers on one device while another still rings
    - one device hangs up and another remains in-call
  - Mitigation:
    - model participant identity separately from device identity
    - allow many ringing devices but only one joined device per user unless explicitly supported
    - broadcast terminal resolution to sibling devices immediately

- Pitfall: Assuming Electron permissions are easy.
  - Impact:
    - microphone/camera denial loops
    - confusing "no sound/no video" failure cases
  - Mitigation:
    - define permission prompts and denied-state UX up front
    - add device unavailable / permission denied / device busy error surfaces
    - test macOS and Windows permission flows separately when implementation begins

- Pitfall: Delaying TURN and weak-network work until after the "happy path" ships.
  - Impact:
    - apparently successful local demos but poor real-world connection rate
    - late architectural rewrites
  - Mitigation:
    - include TURN configuration from the first end-to-end milestone
    - add call-quality telemetry early
    - test with packet loss, high RTT, and reconnect scenarios before launch

- Pitfall: Not defining group-call scope tightly enough.
  - Impact:
    - accidental expansion into meeting-product features
    - delayed launch and excessive complexity
  - Mitigation:
    - keep first release to join/leave/ringing/member-state basics
    - defer host controls, raised hands, screen share, and moderation tools

- Pitfall: Generating vague call-history messages.
  - Impact:
    - users cannot tell whether a call was missed, rejected, busy, or completed
    - support and debugging become harder
  - Mitigation:
    - define a structured call-record schema
    - include call type, initiator, outcome, duration, and timestamps
    - decide whether group records also include participant outcome summary

## Recommended Guardrails

1. Freeze the direct-call and group-call state machines before implementation.
2. Treat TURN, weak-network handling, and observability as release-critical, not stretch goals.
3. Keep the server authoritative for call lifecycle and call-record generation.
4. Separate participant-level state from device-level state from the beginning.
5. Put hard limits on first-release group size until infrastructure proves otherwise.
6. Add a written failure matrix for:
   - cancel vs accept races
   - timeout vs accept races
   - reconnect during ringing
   - reconnect during active call
   - device permission denial
   - camera/microphone hot unplug

## Frozen Technical Direction

- The core architecture direction is now explicitly frozen:
  - direct calls use `WebRTC P2P`
  - group calls use `SFU`
  - relay / NAT traversal uses self-hosted `coturn`
  - server state is authoritative for call lifecycle
  - all devices ring, but only one device may actually join per user
- This is a meaningful transition point:
  - the work is no longer just exploratory discussion
  - the next step should be implementation planning at task granularity

## Implementation Audit Findings: 2026-04-07

- Direct-call scope is no longer just planned work; it is implemented end to end in the current repository.
- The implemented direct-call evidence includes:
  - server-side call-domain tables, repository, and service logic
  - websocket `call.*` lifecycle handling plus `offer` / `answer` / `ice` relay
  - renderer-side `RTCPeerConnection` session handling and call modal UI
  - persisted `call_record` messages verified by `server/test/stage11-direct-call.mjs`
- Group calling is now implemented as a real media path:
  - the server carries group-scoped call state and issues room config for joined participants
  - the current client joins group calls through `LiveKit` instead of direct-call offer creation
  - group-call leave behavior is now aligned with the agreed rule:
    - one participant leaving does not close the remaining participants' window
    - once only one joined participant remains, the group call is ended authoritatively by the server
- Voice-message support is now tracked as complete in the current project status:
  - `Iteration E / 语音消息闭环` 已标记为完成
  - 后续不再把语音消息作为当前未完成主线
- TURN support is partially complete:
  - ICE config issuance, TURN credential generation, client fetch, and relay/debug flags exist
  - real `coturn` deployment and relay-path verification are still outstanding
- The fixed incoming-call timeout should now be treated as `45` seconds across all docs and future code changes.
- A true automated `LiveKit` room-join test cannot be completed in the current pure-Node harness:
  - `livekit-client` requires browser/Electron WebRTC primitives such as `RTCPeerConnection` and `MediaStream`
  - Node-only validation can still prove business lifecycle, token issuance, and room endpoint reachability
- The next product step should be:
  - finish `coturn` relay verification
  - complete weak-network validation
  - then close release-readiness and operations material for realtime calling

## Post-Plan Iteration Findings: Mobile React Native Direction

- The repository now has a real mobile client foundation:
  - `apps/mobile` is a React Native native app with Android / iOS host projects, Metro, Babel, Jest, and a live app entry
  - `packages/app-core` now carries the first mobile-ready shared application/domain layer
- The reusable assets are concentrated in protocol/domain code, not UI:
  - `@mushroom/shared` already provides API transport, API types, websocket types, call-state helpers, and general domain utilities
  - the old empty `@mushroom/ui` and `@mushroom/native-bridge` packages were removed because they were not providing real abstraction value
- The server is already closer to mobile-readiness than the current app shell suggests:
  - login device registration includes `device_type`, `device_name`, `app_version`, and `push_token`
  - realtime call signaling and group-call room-config issuance already exist
  - `voice_message` and `call_record` are already part of the current message model
- The chosen mobile strategy has been validated in code:
  - replace the previous shell with a real React Native app
  - keep Android and iOS on one parallel delivery track
  - reuse protocol/domain logic
  - rebuild UI in native mobile patterns

## Mobile Architecture Guardrails

1. Do not reintroduce `Capacitor` or other Web-container assumptions into the mobile app.
2. Do not try to force Web / Electron DOM components into React Native.
3. Introduce a shared app-domain layer before implementing many mobile features, otherwise the repository will accumulate a third copy of sync and chat logic.
4. Treat local persistence as a first-class mobile requirement:
   - messages
   - sync cursors
   - gap-repair state
   - drafts and lightweight session data
5. Keep push, background recovery, and call-entry behavior in the plan early, even if they are phased after the core chat path.

## Mobile M1/M2 Completion Findings

- `M1` is now complete:
  - the React Native host exists in-repo
  - workspace resolution is wired through Metro
  - the shared app-domain layer is separated into `@mushroom/app-core`
- `M2` is now complete:
  - auth bootstrap, register/login, token refresh, device registration, startup sync, and local persistence all run through the React Native host
  - the current app already renders sync status, account summary, conversation preview, and message preview from persisted/mobile-synced data
- The remaining work should now be tracked as `M3+`, not as unfinished M1/M2 carry-over.

## Mobile M3 Completion Findings

- `M3` is now complete:
  - the React Native host has a usable chats/contacts/account shell
  - a friend can be used as the entry point into a direct conversation
  - the chat detail view can send text messages over websocket and reconcile ack back into local state
  - incoming realtime chat messages and read events are applied back into the local repository
  - conversation drafts are restored and persisted from the mobile host
- The right abstraction split is now clearer:
  - `app-core` should own message/repository/controller semantics
  - the React Native app should own websocket runtime, AppState bridging, and mobile interaction surfaces
- The next architectural boundary should remain:
  - extend this same shared controller/repository path into media messages and message actions
  - do not bypass it by building one-off page-local chat state

## Recommended Mobile Technical Direction

- Runtime:
  - `React Native + TypeScript + Hermes + New Architecture`
- Navigation:
  - `React Navigation`
- State split:
  - server state via `TanStack Query`
  - UI/client state via `Zustand`
- Persistence:
  - lightweight KV via `MMKV`
  - structured chat storage via `SQLite`
- Realtime/media:
  - direct call via `react-native-webrtc`
  - group call via `LiveKit` React Native SDK
- Notifications:
  - push plus local notification stack must be part of the mobile plan, not an afterthought

## Primary Mobile Risks

- Pitfall: Building screens before extracting shared app logic.
  - Impact:
    - mobile becomes another bespoke client with duplicate sync behavior
  - Mitigation:
    - create a platform-neutral app-core layer in the first milestone

- Pitfall: Over-reusing desktop UI assumptions.
  - Impact:
    - poor mobile ergonomics
    - complicated gesture and keyboard handling
  - Mitigation:
    - keep the product semantics the same, but rebuild the surface in native mobile interaction patterns

- Pitfall: Deferring background and push work too late.
  - Impact:
    - the app may look complete in foreground demos but fail as a real mobile IM product
  - Mitigation:
    - keep push, background recovery, and call notification requirements visible in milestone planning from the start

## Mobile Implementation Findings: 2026-04-08

- The first useful implementation move was not a React Native screen tree; it was a platform-neutral app core.
- A dedicated `@mushroom/app-core` package is now the right place for:
  - auth bootstrap
  - token refresh
  - device registration payload rules
  - portable sync orchestration
  - local persisted repository contracts
- This confirms an important architecture point:
  - the mobile project should not start by cloning Web hooks or Electron preload patterns
  - it should start by extracting the stable application-domain layer and letting each client host it
- The current `apps/mobile` implementation is now materially more useful than the original empty shell:
  - it proves the M1/M3 business path
  - it exercises real auth, sync, realtime, and text-chat flows
  - it provides a visible effect surface for user review
- The remaining architectural truth is now:
  - the native host and core chat path are in place
  - the unfinished work has moved on to media/actions, governance, calling, and push/background behavior
  - the correct next step is to transplant the new app-core into a true React Native host rather than continuing to deepen the old shell

## Mobile M4 Findings: 2026-04-08

- `M4` validated that the right reuse boundary is still the shared controller/repository layer, not UI reuse:
  - attachment upload, recall, favorite/pin state mutation, and search all fit naturally inside `@mushroom/app-core`
  - the React Native host only needs thin picker/upload wiring and native interaction surfaces
- The current mobile attachment implementation is intentionally pragmatic:
  - authenticated upload runs through the existing server endpoint
  - image and file selection are native-module driven
  - image preview is handled in the RN view layer without introducing another abstraction yet
- Search and clear-message behavior were kept local-first for this milestone:
  - in-conversation search works directly on the persisted mobile repository snapshot
  - clear conversation currently clears local cached messages so later sync can repopulate them
  - global search and attachment-center style aggregation remain better scoped for `M5`
- After `M4`, the highest-value missing product areas are now:
  - profile editing
  - device summary and multi-device visibility
  - governance flows
  - global search / attachment center
  - voice / calling / background delivery

## Mobile M5 Findings: 2026-04-08

- `M5` reinforced that governance and account capabilities belong in the shared controller layer, not in ad-hoc screen state:
  - device management
  - security-event retrieval
  - friend moderation
  - group governance mutations
  - attachment-center aggregation
    all mapped cleanly into `@mushroom/app-core`
- The React Native host now has a clearer responsibility split:
  - app-core owns durable business operations and sync follow-up
  - the RN app owns presentation, confirmation UI, and mobile-first action surfaces
- Local-first search strategy continues to pay off for mobile:
  - workspace search and attachment center run from the persisted repository snapshot
  - this keeps the interaction fast and avoids introducing a second server search model just for mobile
- The highest-value remaining product gap after `M5` is no longer governance:
  - it has moved to voice messages, foreground calling, background behavior, and push delivery

## Mobile M6 Findings: 2026-04-08

- `M6` confirmed that voice messaging and foreground calling can still reuse the same shared-domain strategy:
  - voice messages fit the existing attachment/file-message transport with explicit mobile metadata for duration and waveform
  - mobile call UI can consume the existing `call.*` protocol and shared call-phase helpers without cloning desktop business logic
- The right mobile boundary is now clearer:
  - `@mushroom/app-core` owns optimistic voice-message creation and repository integration
  - `@mushroom/shared` owns protocol typing and message/call interpretation helpers
  - the React Native host owns recorder/player wiring, permission prompts, AppState behavior, and mobile call overlays
- The implemented `M6` scope is intentionally honest and pragmatic:
  - voice-message record / upload / send / playback is complete in the RN host
  - realtime call signaling, participant-state sync, local media-state toggles, and call-session overlays are complete for the foreground-online path
  - direct-call ICE config and group-call LiveKit room-config fetch are wired into the mobile session UI
  - background calling, push wake-up, system call integration, and full device-build validation remain correctly scoped to `M7`
- A useful technical constraint was confirmed during implementation:
  - `react-native-audio-recorder-player` needs an explicit narrow exported interface to avoid leaking the package's anonymous-class private fields into TypeScript consumers
  - once that boundary is narrowed, the recorder/player integration is stable in tests and type-checks
- The next highest-value gap after `M6` is no longer the foreground chat/calling path:
  - it is now notifications, background recovery, native delivery behavior, and release-readiness

## Mobile M7 Findings: 2026-04-21

- `M7` confirmed that push, call notifications, and reconnect recovery still fit the existing layered split:
  - `@mushroom/shared` only needed portable API typing additions
  - the server remained responsible for outbox fan-out and push payload construction
  - the React Native host remained responsible for notification SDK wiring, CallKeep integration, and AppState / network recovery behavior
- The right integration strategy was additive rather than architectural churn:
  - the existing authenticated device registration flow already carried enough metadata to extend with `push_token`
  - the existing outbox worker could absorb push delivery as another event type instead of introducing a parallel delivery subsystem
  - the existing `call.*` realtime protocol remained the source of truth, while notification payloads only served as a wake-up and recovery trigger
- The implemented scope is intentionally honest:
  - message push, incoming-call push, notification-open routing, system incoming-call presentation, and reconnect-driven sync closure are now wired
  - native permission declarations and test doubles are in place
  - the remaining work is environmental verification, not a missing product architecture
- The highest-value residual risks are now operational rather than structural:
  - real `FCM/APNs` credentials must still be injected and validated on devices
  - CallKeep and background-notification behavior still require true Android/iOS device rehearsal
  - store-signing, provisioning, and release packaging remain outside the desktop test surface

## Electron Desktop Notification Findings: 2026-04-21

- The right desktop notification boundary is the Electron main process, not the browser `Notification` API alone:
  - taskbar flashing
  - notification click routing
  - per-conversation and per-call cleanup
    all belong in a main-process coordinator because they need `BrowserWindow` control
- The existing renderer architecture was already sufficient for desktop notification triggers:
  - ordinary message notifications could be attached directly to the persisted `onMessageAdded` path in `useChat`
  - incoming-call notifications could be attached directly to the existing `call.*` websocket lifecycle in `useChatCallSession`
  - this avoided introducing any second realtime channel or desktop-only signaling path
- The implemented scope is intentionally additive:
  - Electron now owns native presentation and attention-grabbing behavior
  - the renderer still owns business decisions such as mute checks, active-conversation suppression, and read-state closure
  - notification clicks round-trip back into the existing conversation-open flow rather than bypassing chat state
- After this round, the remaining highest-value notification gap is no longer desktop local presentation:
  - it is mobile multi-provider push abstraction and real-device validation across `FCM` and vendor channels

## Mobile Multi-Provider Push Findings: 2026-04-21

- The right push abstraction boundary is split across client and server, not concentrated in either side alone:
  - the server must own provider routing, credential isolation, and device-target fan-out
  - the mobile host must own provider detection, token acquisition, and normalized notification/open callbacks
  - shared/app-core only needs stable registration payload fields rather than SDK-specific logic
- The migration path worked best as an extraction, not a rewrite:
  - the existing FCM implementation could be moved into a `PushProvider` without changing message or call business services
  - the existing notification-center could stay focused on payload parsing and local presentation while delegating transport specifics to a provider runtime
  - this kept the already-working `M7` notification and CallKeep logic intact
- The implemented `Huawei` path is intentionally a production-shaped skeleton:
  - server-side OAuth token exchange and push-send routing are in place
  - Android Gradle wiring and RN token/message hooks are in place
  - the remaining uncertainty is cloud-side AppGallery credentials and device rehearsal, not missing code structure
- The main residual risks are now environmental:
  - Huawei and FCM projects still need real secrets and app registration material
  - Huawei devices still require `agconnect-services.json` and physical-device verification
  - iOS still depends on final APNs / signing validation before `M7` can be marked truly complete

## Mobile Xiaomi Push Findings: 2026-04-21

- Xiaomi required a different integration strategy than `FCM` or `Huawei`:
  - the Android client SDK is distributed as vendor artifacts rather than a normal npm/autolink path
  - the official server push path is Java SDK oriented rather than a small existing Node client
  - the practical repository-safe approach was to keep Xiaomi-specific SDKs outside version control and integrate through explicit intake points
- The right code boundary for Xiaomi was still the existing provider abstraction:
  - shared/app-core only needed the additional `xiaomi` provider identity
  - the React Native host only needed device-family detection, native registration bridging, and normalized `regId` sync
  - the server only needed a provider implementation that can hand off to a Java helper without polluting message/call business services
- The implemented Xiaomi path is intentionally build-safe:
  - Android native code uses reflection so the repository can still compile without bundling Xiaomi proprietary SDK binaries
  - Gradle now exposes a `libs/` intake point and manifest placeholders so real vendor artifacts can be dropped in later
  - the server provider delegates to a Java helper classpath so the Node service does not need to vendor or transpile the Xiaomi SDK
- The remaining Xiaomi risks are entirely environmental:
  - official Xiaomi client `AAR/JAR` assets must still be supplied locally
  - official Xiaomi server SDK jars and helper compilation output must still be provided through env-configured paths
  - Xiaomi-device push, notification-open, and incoming-call rehearsal still need to be validated on real hardware

## Mobile Conversation-Switch Performance (2026-05)

- Symptom: switching to a conversation with very long history (e.g. the `test`
  account chat) caused multi-hundred-millisecond to second-level UI freeze on
  both desktop (Electron) and mobile (RN) clients, while other conversations
  remained snappy.
- Electron root cause: `apps/electron/src/main/database.ts` `db:get-messages`
  no-cursor branch used `JOIN local_conversations` + `ORDER BY CASE ... END,
sequence DESC` + `COALESCE/OR` predicate. SQLite could not use
  `idx_local_messages_conversation_sequence` for sort early-stop and ended up
  scanning every row in the conversation then sorting in memory.
- Electron fix: rewrote the branch into two stages — read
  `local_hidden_before_seq` as a constant via a primary-key lookup, then a
  pure `WHERE sequence > ? ORDER BY sequence DESC LIMIT ?` covered by the
  partial index, plus a fallback query for outbox rows (`sequence <= 0`) only
  when sequenced rows are not enough to fill the limit.
- Mobile root cause was different in shape but worse in effect:
  `apps/mobile/src/data/sqlite-data-repository.ts`
  - `loadMessagesForConversation` had no LIMIT and pulled the entire
    conversation history into memory.
  - `snapshot()` invoked that helper for **every** conversation on every
    `publishSnapshot` (81 call sites in `packages/app-core/src/controller.ts`).
- Mobile fix:
  - Added `loadRecentMessagesForConversation` (two-stage query mirroring
    Electron) and a new repository method `listRecentMessages(convId, {limit})`.
  - Kept the existing `loadMessagesForConversation` / `listMessages` for paths
    that still want a full timeline (`loadOlderMessages`, `loadMessagesAround`,
    `searchMessages`).
  - Threaded `activeClientConversationId` through `MobileDataRepository.snapshot`
    and `MobileAppController.snapshot`. The SQLite repository now only loads
    messages for the active conversation; non-active conversations get `[]`,
    which the UI never reads (verified: `useMobileAppState.ts:36-41` is the
    only consumer of `messagesByConversation`).
- In-memory repository (`packages/app-core/src/storage.ts`) intentionally
  ignores the new `activeClientConversationId` field so existing storage
  tests keep their old assertions.
- Regression coverage: 7 new Jest cases in
  `apps/mobile/__tests__/sqlite-data-repository.test.ts` covering snapshot
  active-only behaviour, null-active behaviour, LIMIT early-stop, outbox
  back-fill, multi-switch correctness, no-regression of `listMessages`, and
  `local_hidden_before_seq` filtering.

### Contacts / Conversations performance — deferred (option 1 from plan)

- `listContacts` (`SELECT payload FROM mobile_contacts ORDER BY sort_name ASC`)
  and `listConversations` (`SELECT payload FROM mobile_conversations
ORDER BY is_archived ASC, is_pinned DESC, last_message_time DESC`) still
  run on every `publishSnapshot` without LIMIT.
- These were intentionally left untouched in this performance fix because:
  - The row counts are bounded by a user's social/contact graph, not by
    message history, and are 1–2 orders of magnitude smaller than the
    message tables (typically 100–1000 contacts and 50–300 conversations).
  - Single-pass cost is in the low-millisecond range and well below the
    100ms perception threshold even at high `publishSnapshot` cadence.
  - Optimising them would require either snapshot caching (with 81 cache
    invalidation points) or rewriting the controller subscription to push
    deltas instead of full snapshots — both of which carry more risk than
    benefit until profiling data shows they are a real bottleneck.
- Action item if future telemetry shows contact/conversation snapshots are
  contributing to perceived lag:
  - First option: introduce a result cache in the SQLite repository keyed by
    a monotonic mutation counter that `upsertContacts` / `upsertConversations`
    bump; invalidate on every contacts/conversations write.
  - Second option: change `MobileAppSnapshot` consumers to subscribe to
    fine-grained events (`contactsChanged`, `conversationsChanged`,
    `messagesChanged`) instead of a single full-snapshot stream.

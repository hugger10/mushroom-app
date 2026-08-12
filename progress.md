# Progress Log

## Current Snapshot

- Date: `2026-04-07`
- Current product stage: `Stage 10 / Multi-Device, Account, and Platform Capabilities`
- Current stage status: `complete`
- Completed stages:
  - `Stage 0`
  - `Stage 1`
  - `Stage 2`
  - `Stage 3`
  - `Stage 4`
  - `Stage 5`
  - `Stage 6`
  - `Stage 7`
  - `Stage 8`
  - `Stage 9`
  - `Stage 10`
- Pending stages:
  - none

## Resume Anchors

- Product rule: messages are immutable.
- Message edit is intentionally out of scope.
- Stage 7 is complete.
- Stage 8 is complete.
- Stage 9 is complete.
- Stage 10 is complete.
- The Stage 0-10 implementation plan is complete for the current repository scope.

## Stage Status Summary

| Stage    | Status   | Summary                                                                                                                                                             |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 0  | complete | Local development baseline, startup diagnostics, health/readiness visibility, and server-start failure surfacing were completed.                                    |
| Stage 1  | complete | Username/password auth, registration, nickname persistence, login restore, friend request/accept flow, and auth/contact error UX were completed.                    |
| Stage 2  | complete | Direct chat text path, websocket ack, dedupe, incremental sync, read-state roundtrip, reconnect refresh, and restart recovery were completed.                       |
| Stage 3  | complete | Group creation, invite, member sync, group text delivery, conversation-state sync, and leave/disband visibility behavior were completed.                            |
| Stage 4  | complete | Image/file messages, upload feedback, preview flow, media panel refresh, and Stage 4 executable verification were completed.                                        |
| Stage 5  | complete | Stable tests, root quality gate, CI workflow, and manual regression checklists were completed.                                                                      |
| Stage 6  | complete | Ops smoke checks, load baselines, deployment checklist, metrics baseline, alert template, and rollback drill records were completed.                                |
| Stage 7  | complete | Recall, reply closure, forwarding, favorites, pins, search enhancement, clear-message governance, and cross-device favorite/pin sync were completed.                |
| Stage 8  | complete | Delete-friend, block/unblock, announcement and permission closure, role governance, member removal, leave, owner transfer, and disband verification were completed. |
| Stage 9  | complete | Emoji panel, audio/video attachment entry, richer media playback, desktop notification strategy, title unread cues, and mention-priority reminders were completed.  |
| Stage 10 | complete | Profile editing, session/device summary, global message search, attachment center, and early env-loading correction were completed.                                 |

## Delivered Milestones

### Stage 0: Local Development Baseline

- Added local bootstrap and DB helper scripts.
- Verified remote-env migration and seed flows.
- Fixed web/electron local development blockers.
- Added explicit API and websocket diagnostics to the client.
- Updated server startup flow so `/healthz` and `/readyz` expose startup issues instead of failing silently.

### Stage 1: Auth and Contacts

- Added shared register contract.
- Implemented registration in the shared login screen.
- Persisted `nickname` correctly on register.
- Fixed built-server env loading and runtime entry path.
- Verified the real auth/contact API flow end to end.
- Added server tests for core user and friend service rules.

### Stage 2: Direct Chat Core

- Added authoritative read-state roundtrip.
- Hardened websocket ack failure behavior.
- Added reconnect-time conversation/message refresh.
- Added backfill for realtime messages arriving for unknown local conversations.
- Added executable Stage 2 regression script and command.
- Verified direct chat end to end with realtime, dedupe, sync, and read recovery.

### Stage 3: Group Chat and Conversation State

- Verified existing group APIs and client paths with a real acceptance script.
- Confirmed current semantics for incoming group messages:
  - pin persists
  - mute persists
  - archive is cleared
  - recipient draft is preserved
- Added executable Stage 3 regression script and command.

### Stage 4: Media Delivery

- Cleaned up media-path renderer rough edges.
- Disabled unsupported voice/video entry points as explicit placeholders.
- Added executable Stage 4 regression script and command.
- Verified image/file upload, ack, realtime delivery, sync recovery, and read-state behavior.

### Stage 5: Quality System

- Added shared media utility tests.
- Added server media payload tests.
- Fixed `@mushroom/shared` packaging to support both ESM and CJS consumers.
- Added root `verify:quality`.
- Added CI workflow for the stable quality subset.
- Added Electron and chat-window regression checklists.

### Stage 6: Operations and Delivery Readiness

- Added `verify:ops`.
- Added `verify:load`.
- Added realtime baseline entry.
- Added runbook, deployment checklist, metrics baseline, alert rule template, and rollback drill notes.

### Stage 7: Message Actions

- Kept immutable-message rule and removed active edit-path exposure.
- Completed message recall and executable Stage 7 verification.
- Closed reply flow in the message action surface.
- Added forwarding to other existing conversations.
- Added favorites and pinned messages.
- Added saved-message panel per conversation.
- Enhanced in-conversation search with filters for:
  - all
  - text
  - files
  - favorites
  - pinned
  - recalled
- Added clear-message governance for the current conversation.
- Added server-backed cross-device sync for favorite/pin state.

## Recent Work

### Session: 2026-03-28 Stage 7 Completion

- Status: `complete`
- Work completed:
  - search enhancement
  - clear conversation messages
  - cross-device message-state sync for favorites and pins
- Verification completed:
  - `pnpm.cmd run lint`
  - `pnpm.cmd --filter @mushroom/server test`
  - `pnpm.cmd --filter @mushroom/web exec tsc --noEmit`

### Session: 2026-03-29 Stage 8 Completion

- Status: `complete`
- Work completed:
  - added shared `blockFriend` / `unblockFriend` API support
  - added server block/unblock controller, service, repository, and schema migration coverage
  - added blocked-contact cache support in Electron preload/main DB handlers
  - extended the web address book with block/unblock actions and a blocked list tab
  - tightened local friend-cache cleanup after delete/block/unblock
  - added executable Stage 8 governance verification covering announcement, permission, role, removal, leave, transfer-owner, and disband rules
  - added `pnpm.cmd --filter @mushroom/server verify:stage8`
- Verification completed:
  - `pnpm.cmd run lint`
  - `pnpm.cmd --filter @mushroom/server test`
  - `pnpm.cmd --filter @mushroom/shared test`
  - `pnpm.cmd --filter @mushroom/web exec tsc --noEmit`
  - `pnpm.cmd --filter @mushroom/server verify:stage8`

### Session: 2026-03-29 Stage 9 Completion

- Status: `complete`
- Work completed:
  - replaced the placeholder smile button with a usable emoji panel in the composer
  - enabled dedicated audio/video upload entry points while keeping the existing attachment message protocol
  - closed the rich-media experience around inline audio/video playback and existing preview/media-panel flows
  - added unread-aware window title updates and desktop notifications with mute-aware filtering and mention priority
- Verification completed:
  - `pnpm.cmd run lint`
  - `pnpm.cmd --filter @mushroom/web exec tsc --noEmit`

### Session: 2026-03-29 Stage 10 Completion

- Status: `complete`
- Work completed:
  - added authenticated profile update and session-summary APIs
  - exposed real presence-derived online/device summary from websocket state
  - added profile/device modal in the app header with avatar, nickname, and signature editing
  - added a global cross-conversation search entry and message jump path
  - added an attachment center backed by a new Electron global-media query
  - moved `.env` loading into config initialization so direct module/test paths no longer fall back to default Redis host/port before env is read
- Verification completed:
  - `pnpm.cmd run lint`
  - `pnpm.cmd --filter @mushroom/web exec tsc --noEmit`
  - `pnpm.cmd --filter @mushroom/server build`
- Verification note:
  - `pnpm.cmd --filter @mushroom/server test` did not complete reliably in this desktop thread because the harness output pipe was interrupted/timed out rather than producing a stable assertion failure.

## Key Verification History

| Verification                                        | Result                                    |
| --------------------------------------------------- | ----------------------------------------- |
| `pnpm.cmd run lint`                                 | passing after Stage 10 completion changes |
| `pnpm.cmd --filter @mushroom/shared test`           | passing in the stable quality loop        |
| `pnpm.cmd --filter @mushroom/server test`           | passing after Stage 8 completion work     |
| `pnpm.cmd --filter @mushroom/web exec tsc --noEmit` | passing after Stage 10 completion work    |
| `pnpm.cmd --filter @mushroom/server verify:stage2`  | previously passed in real acceptance flow |
| `pnpm.cmd --filter @mushroom/server verify:stage3`  | previously passed in real acceptance flow |
| `pnpm.cmd --filter @mushroom/server verify:stage4`  | previously passed in real acceptance flow |
| `pnpm.cmd --filter @mushroom/server verify:stage7`  | previously passed in real acceptance flow |

## Session: 2026-04-17 Signal-Style Architecture Migration

- Status: `complete`
- Work completed:
  - replaced search/add-friend entry flows with direct-conversation creation APIs and shared contact/block data contracts
  - added backend privacy settings, block records, direct-conversation creation, and contact/block listing endpoints
  - migrated web sync and mobile sync/UI entry points from friend-request assumptions to contact/direct-chat assumptions
  - removed the mobile "new friends" request surface and updated peer-profile/search overlays to open direct conversations directly
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/mobile test -- --runTestsByPath __tests__/contacts-screen.test.tsx __tests__/home-screen.test.tsx __tests__/add-friend-overlay.test.tsx`

## Open Work by Plan

- The Stage 0-10 product plan is complete for the current repository scope.
- Any further work should be tracked as post-plan iteration, not as an unfinished Stage 10 carry-over.

## Post-Plan Iteration Draft

### Session: 2026-04-24 Mobile SQLite Storage and Contacts UX

- Status: `complete`
- User request:
  - fix mobile contacts address-book recommendation empty/permission feedback
  - fix refresh crash/toast showing `undefined is not a function`
  - move heavy mobile data from MMKV JSON to SQLite with no legacy migration
  - add tests and run verification after modifications
- Findings so far:
  - `packages/app-core` exposes `MobileDataRepository`, so the SQLite implementation can be mobile-only.
  - `apps/mobile/src/lib/mobile-app.ts` currently wires `createJsonBackedMobileDataRepository` to MMKV.
  - address-book match cache already uses `react-native-nitro-sqlite`.
- Current next step:
  - none; implementation and verification completed.
- Work completed:
  - added `apps/mobile/src/lib/sqlite-data-repository.ts`
  - switched mobile heavy local data repository from JSON/MMKV to SQLite
  - kept auth/current user/token/preferences/lightweight state on MMKV
  - added explicit address-book permission, no-number, and no-match alerts
  - added an address-book recommendation empty hint in the contacts screen
  - hardened contacts native module fallback to avoid `undefined is not a function`
  - expanded `react-native-nitro-sqlite` Jest mock for repository coverage
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/mobile test -- --runTestsByPath __tests__/sqlite-data-repository.test.ts __tests__/contacts-screen.test.tsx __tests__/account-actions.test.ts __tests__/address-book.test.ts`
  - `pnpm --filter @mushroom/mobile test`

### Session: 2026-03-30 Realtime Calling Plan Draft

- Status: `planning`
- Scope captured:
  - realtime audio calling
  - realtime video calling
  - direct-chat and group-chat support
  - Electron-first delivery
  - mobile deferred
  - 45-second timeout
  - all-device ringing per account
  - hard busy-line behavior

### Session: 2026-04-01 Message Sync P0-P3 Completion

- Status: `complete`
- Work completed:
  - unified startup, login, and reconnect sync through a shared sync orchestrator
  - paged conversation metadata sync with stable composite cursors
  - paged per-conversation delta and history message APIs
  - cold-start recent-window strategy instead of eager full-history import
  - persistent local backfill-job queue with priority-driven repair
  - contiguous local sync progression and gap-repair flow
  - viewport-guarded auto-read behavior
  - private-chat last-message read indicator via peer read cursor
  - paged message-state sync with stable cursor semantics
  - message-sync metrics baseline document and scenario baseline script
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/web exec tsc --noEmit`
  - `pnpm --filter @mushroom/electron exec tsc --noEmit`
  - `pnpm --filter @mushroom/server exec tsc --noEmit`

### Session: 2026-04-01 Message Sync Redesign Slice 1

- Status: `partial_complete`
- Scope in progress:
  - unify login-time and warm-start sync entry
  - paginate conversation sync
  - restrict message backfill to real sequence gaps
- Notes:
  - the implementation starts from the highest-risk correctness/perf issues identified in `docs/message-sync-technical-design.md`
  - larger follow-up work such as paged message APIs and contiguous local sync cursors is intentionally deferred to later slices
- Work completed:
  - removed login-page friend/conversation/message sync so post-login now falls through to the normal startup sync path
  - updated `fetchRemoteConversations()` to paginate over `conversation/sync`
  - changed conversation diffing to compute a dedicated `messageBackfill` list based on remote-vs-local delivered sequence gaps
  - stopped issuing message backfill for conversations that only had metadata/state changes
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/web exec tsc --noEmit`

### Session: 2026-04-01 Message Sync Redesign Slice 2

- Status: `complete`
- Scope completed:
  - tighten active-conversation auto-read semantics
  - add contiguous local sync progress
  - detect and repair realtime sync gaps
  - batch message backfill requests on the client
- Work completed:
  - gated auto-read by actual window visibility and focus, and added read recovery on focus / visibility return
  - added `last_server_sequence` and `sync_gap_detected` to conversation state across shared types, renderer mapping, Electron schema, and migrations
  - replaced max-sequence sync advancement with contiguous-sequence reconciliation in the Electron local DB
  - updated realtime message add/update handling so in-memory conversation state no longer treats any larger sequence as contiguous
  - prevented auto-read from crossing detected gaps
  - added targeted gap repair before opening a gapped conversation and periodic background gap repair for pending conversations
  - changed client-side `message/sync` execution to run in batches instead of one unbounded conversation set
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/web exec tsc --noEmit`
  - `pnpm --filter @mushroom/electron exec tsc --noEmit`

### Session: 2026-04-01 Message Sync Redesign Slice 2

- Status: `complete`
- Scope completed:
  - tighten auto-read behavior for the active conversation
  - recover active-conversation read state when the app becomes visible again
- Work completed:
  - gated immediate auto-read on `document.visibilityState === "visible"` and `document.hasFocus()`
  - stopped hidden-window incoming messages from being treated as already read just because the conversation stayed active
  - added focus / visibility recovery hooks to sync read state for the current active conversation after the app returns to foreground
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/web exec tsc --noEmit`
  - call-record message persistence
  - weak-network support
  - TURN support in the first release
- Planning outputs added:
  - Chinese formal draft plan in `task_plan.md`
  - standalone technical design doc in `docs/realtime-calling-technical-design.md`
  - mature-product pitfalls and mitigations in `findings.md`
- Important product correction captured:
  - the current composer audio/video buttons are attachment shortcuts, not realtime calling
  - future implementation should replace that product meaning in Electron rather than further investing in the attachment shortcut behavior
- Current recommendation:
  - freeze the call state machine and signaling contract before any implementation work starts
  - deliver direct-call closure before group-call closure even though both are in scope for the same initiative
  - keep TURN, observability, and weak-network behavior inside the first release plan rather than deferring them
  - keep technical details out of `task_plan.md` and maintain them in the dedicated docs design file

### Session: 2026-03-30 Realtime Calling Technical Direction Freeze

- Status: `in_progress`
- Core decisions frozen:
  - direct-call media topology: `WebRTC P2P`
  - group-call media topology: `SFU`
  - NAT traversal / relay: self-hosted `coturn`
  - call lifecycle authority: server-side authoritative state
  - multi-device rule: all devices ring, but only one device may join per user
- Documentation updates:
  - upgraded `docs/realtime-calling-technical-design.md` from a discussion draft into a concrete v1 technical direction
  - added a practical implementation breakdown for server domain, Electron direct calls, TURN integration, SFU group calls, call records, and release readiness
  - updated `task_plan.md` so Iteration A reflects the now-frozen architecture direction instead of a generic planning placeholder
- Next recommended step:
  - turn the v1 technical direction into task-sized implementation units, starting from server-side call session/signaling foundations

### Session: 2026-03-30 Voice Message Requirement Added

- Status: `planning`
- Product requirement added:
  - support direct voice messages in addition to realtime audio/video calling
  - maximum voice-message duration: `60` seconds
  - realtime calling remains product-unlimited in duration
- Planning impact:
  - `task_plan.md` now includes voice messages as a separate iteration
  - `docs/realtime-calling-technical-design.md` now explicitly separates the realtime calling stack from the voice-message stack
- Important design note:
  - voice messages must not be implemented as a disguised reuse of the current generic attachment shortcut behavior
  - they need a dedicated recording entry, dedicated message content model, and dedicated playback experience

### Session: 2026-03-30 Composer Interaction Mapping Confirmed

- Status: `planning`
- Interaction decisions added:
  - microphone button starts realtime audio calling
  - camera button starts realtime video calling
  - voice messages use a press-and-hold interaction
- Documentation updated:
  - `task_plan.md`
  - `docs/realtime-calling-technical-design.md`

### Session: 2026-03-30 Voice Message Interaction Details Confirmed

- Status: `planning`
- Interaction details added:
  - press and hold to record
  - release to send
  - no slide-up-to-cancel behavior
  - show waveform and duration while recording
  - if microphone permission is denied, prompt the user to enable permission
- Documentation updated:
  - `task_plan.md`
  - `docs/realtime-calling-technical-design.md`

### Session: 2026-03-30 Realtime Calling Storage Design Added

- Status: `planning`
- Data/storage design added to `docs/realtime-calling-technical-design.md`:
  - `call_sessions` table v1
  - `call_participants` table v1
  - optional `call_events` audit/event-log table
  - call-record message persistence strategy in the existing `messages` table
  - `voice_message` content model persisted through the existing `messages` table
  - recommended keys, indexes, uniqueness constraints, and relation mapping
- Important design direction:
  - realtime call state is stored in dedicated call-domain tables
  - user-visible history still lands in the existing conversation message timeline

### Session: 2026-03-30 Realtime Calling Decision Set Confirmed

- Status: `planning`
- Confirmed decisions written into `docs/realtime-calling-technical-design.md`:
  - self-hosted mature `SFU`
  - existing `WebSocket` reused for `call.*` signaling
  - server-authoritative request/broadcast event style
  - server-side race resolution for call state transitions
  - group-call limit set to `8` participants for the first release
  - group calls continue after initiator leaves and end when the last joined participant leaves
  - video may degrade to audio in-call; audio-to-video upgrade is deferred
  - voice messages use `m4a/aac`
  - voice messages shorter than `1` second are not sent
  - MinIO uses business-separated storage paths
  - `voice_message` and `call_record` both persist through the existing `messages` timeline
  - `coturn` uses short-lived credentials issued by the server
  - no complex device switching in the first release
  - baseline call observability is included in the first release scope

### Session: 2026-03-30 Realtime Calling Implementation Breakdown Started

- Status: `in_progress`
- Added execution-ready implementation breakdown:
  - `docs/realtime-calling-implementation-plan.md`
- Coverage includes:
  - direct audio calling
  - direct video calling
  - group audio/video calling
  - voice messages
  - signaling
  - storage
  - `coturn`
  - `LiveKit`
  - call records
  - validation and operations
- Documentation linking updated:
  - `task_plan.md` now points to the implementation breakdown doc
  - `docs/realtime-calling-technical-design.md` now points to the implementation breakdown doc

### Session: 2026-03-30 Realtime Calling Implementation Started

- Status: `in_progress`
- Code changes completed:
  - added shared realtime-call domain types in `packages/shared/src/types/call.ts`
  - extended shared websocket message typing with `call.*` request/broadcast event shapes
  - added server migration `realtime_call_domain` for:
    - `call_sessions`
    - `call_participants`
    - `call_events`
  - added server-side call repository foundation in `server/src/server/repository/call_repository.ts`
  - added server-side call service foundation in `server/src/server/service/call_service.ts`
  - extended server repository models with call-domain record types
- Current implementation scope:
  - this round focused on Phase 1 server foundations, not LiveKit/Electron UI integration yet
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/shared type-check`
  - `pnpm --filter @mushroom/server build`
- Next recommended step:
  - wire `call.*` handling into the existing websocket server and start the Phase 2 signaling/state-sync implementation

### Session: 2026-03-30 Realtime Calling WebSocket Wiring Started

- Status: `in_progress`
- Code changes completed:
  - wired `call.invite.request`, `call.accept.request`, `call.reject.request`, and `call.end.request` into `server/src/server/websocket/ws_server.ts`
  - added websocket-side mapping from server call records to shared call-session / participant payloads
  - added device-level presence registration in Redis so online device ids can be discovered for multi-device ringing
  - added websocket broadcast helpers for:
    - `call.invited`
    - `call.accepted`
    - `call.rejected`
    - `call.ended`
    - `call.state-sync`
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/shared type-check`
  - `pnpm --filter @mushroom/server build`
- Current gap after this round:
  - timeout scheduling, full busy-path handling, and call-record message persistence are still not completed yet

### Session: 2026-03-30 Realtime Calling Server Signaling Closed Loop

- Status: `in_progress`
- Code changes completed:
  - finished server-side timeout handling with a `45` second websocket scheduler for ringing calls
  - added invite-time busy detection so callers receive explicit `call.busy` feedback for already-busy targets
  - completed call-record message persistence through the existing `messages` timeline and outbox delivery path
  - updated timeout behavior so unanswered ringing devices time out while ongoing group calls can continue
- Verification pending after this round:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/shared type-check`
  - `pnpm --filter @mushroom/server build`
- Next recommended step:
  - validate the new server flow end-to-end, then continue with Electron-side direct-call UI and media negotiation

### Session: 2026-03-30 Realtime Calling Client Control Panel Started

- Status: `in_progress`
- Code changes completed:
  - repurposed the composer microphone / camera buttons from media-file pickers into realtime call actions
  - added client-side call session state management in `apps/web/src/hooks/useChat.ts`
  - wired websocket call events into the renderer so incoming, outgoing, accepted, rejected, busy, timeout, and ended states can update UI
  - added a shared call modal for incoming/outgoing/ongoing call control in `apps/web/src/components/chat-window/CallSessionModal.tsx`
  - added browser/Electron media permission prompts before invite and accept actions
- Current implementation scope:
  - this round covers call control UI and websocket action wiring
  - actual `offer` / `answer` / `ice` media negotiation is still the next step
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/web build`
- Next recommended step:
  - wire `offer` / `answer` / `ice` relay and `RTCPeerConnection` into the new client call session flow for direct audio calling

### Session: 2026-03-30 Direct Call Media Negotiation Wiring

- Status: `in_progress`
- Code changes completed:
  - extended shared websocket types with structured `offer`, `answer`, and `ice` message payloads
  - added websocket relay support for direct call signaling in `server/src/server/websocket/ws_server.ts`
  - wired `RTCPeerConnection` setup, offer creation, answer handling, ICE candidate exchange, and remote audio playback into `apps/web/src/hooks/useChat.ts`
  - kept signaling on the existing authenticated websocket channel instead of introducing a second signaling socket
- Current implementation scope:
  - this round focuses on direct-call media negotiation over the existing call session
  - group-call media is still deferred to the later `LiveKit` integration phase
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/shared type-check`
  - `pnpm --filter @mushroom/server build`
  - `pnpm --filter @mushroom/web build`
- Next recommended step:
  - run an end-to-end direct-call smoke test and then fill the remaining gaps around remote media UI, TURN-backed ICE config, and video rendering

### Session: 2026-03-30 Direct Call Smoke Test, TURN Config, and Video Modal

- Status: `in_progress`
- Code changes completed:
  - fixed the direct-call server transaction bug where `createCall()` returned a null session from an out-of-transaction read
  - hardened websocket participant matching so `call.accepted` and `call.rejected` consistently resolve the correct device participant
  - added an authenticated `GET /auth/call/ice` endpoint that returns dynamic ICE server configuration
  - added call network config parsing in `server/src/utils/config.ts` for STUN URLs, TURN URLs, shared-secret credentials, static TURN credentials, and TTL
  - updated the web client to fetch and cache ICE server configuration before creating `RTCPeerConnection`
  - added local and remote media stream state wiring so the call modal can render actual video streams
  - upgraded `apps/web/src/components/chat-window/CallSessionModal.tsx` to render remote video, local preview video, and audio playback for direct calls
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/web build`
  - `pnpm --filter @mushroom/server build`
  - `pnpm --filter @mushroom/server verify:stage11:direct-call`
  - verified `GET /auth/call/ice` returns authenticated ICE config payloads on the running local server
- Current gap after this round:
  - TURN is now wired end-to-end in config and client consumption, but an actual `coturn` deployment plus non-default TURN credentials still need environment setup before relay paths can be exercised
  - the modal now renders video streams, but a full renderer-side manual video call smoke test still needs to be run in Electron with two real clients

### Session: 2026-04-01 TURN Relay Debug Controls

- Status: `in_progress`
- Code changes completed:
  - added client-side `VITE_CALL_FORCE_RELAY` support so `RTCPeerConnection` can be forced into relay-only mode for TURN verification
  - added client-side `VITE_CALL_DEBUG_MEDIA` logging so ICE server selection, connection state changes, and selected ICE candidate pair details are visible during manual call debugging
  - updated root and web env example files to document the new realtime call debug flags
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/web build`
- Current usage notes:
  - set `VITE_CALL_FORCE_RELAY=true` to force TURN relay instead of allowing host/srflx direct candidates
  - set `VITE_CALL_DEBUG_MEDIA=true` to emit ICE and connection diagnostics in the renderer logs during live call testing

### Session: 2026-04-01 Device Capability Degradation Rules

- Status: `in_progress`
- Code changes completed:
  - added client-side local participation state so a live call can distinguish full audio/video, audio-only, video-only, and receive-only participation modes
  - updated call startup and accept flows to degrade media acquisition based on confirmed product rules, including direct-call video to audio fallback when no camera is available
  - allowed microphone-missing paths to continue as video-only or receive-only participants instead of hard-failing the call join
  - added local media track lifecycle handling so camera/microphone loss during an ongoing call automatically updates the local participation mode
  - updated direct-call accept handling so the server session media type and follow-up call record use the final connected type rather than the originally requested type
  - surfaced the local participation mode in the call modal UI
  - added a lightweight `call.media-state` websocket flow so participant capability changes can be propagated to other connected clients during an ongoing call
  - documented the interaction rules summary in `docs/realtime-calling-technical-design.md` and synced the timeout/interaction bullets in `docs/realtime-calling-implementation-plan.md`
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/server build`
  - `pnpm --filter @mushroom/web build`
- Current gap after this round:
  - participant capability changes are now propagated over websocket, but the current UI exposure is still lightweight and does not yet provide a richer participant roster or device-state controls for larger group calls

### Session: 2026-04-07 Realtime Calling Group-Call Closure

- Status: `complete`
- Code changes completed:
  - closed group audio/video calling through the existing server-authoritative `call.*` lifecycle plus `LiveKit` room-token issuance
  - completed the web renderer group-call media branch and participant grid rendering
  - aligned group-call close behavior so one participant leaving does not dismiss the remaining participants, and the session only closes once one joined participant remains
  - added executable group-call verification scripts for the business lifecycle and documented the browser-runtime limitation for true `LiveKit` client-room automation
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/shared test`
  - `pnpm --filter @mushroom/server test`
  - `pnpm --filter @mushroom/server verify:stage12:group-call`
- Current known limitation:
  - a true multi-client `LiveKit` room-join automation still requires a browser or Electron runtime because pure Node does not provide `RTCPeerConnection` / `MediaStream`
- Next recommended step:
  - deliver direct voice-message closure, then finish real `coturn` relay validation and release-readiness material

### Session: 2026-04-07 Voice Message Completion Marked

- Status: `complete`
- Documentation status updated:
  - `Iteration E / voice message closure` is now tracked as complete in `task_plan.md`
  - `Phase 5 / 语音消息` is now tracked as complete in `docs/realtime-calling-implementation-plan.md`
  - project findings and next-step guidance were updated so voice messages are no longer treated as the current unfinished milestone
- Next recommended step:
  - finish `coturn` real relay validation, weak-network verification, and release-readiness material

## Resume Checklist for Next Turn

1. Keep `task_plan.md` in Chinese.
2. Keep `progress.md` and `findings.md` in English.
3. Preserve UTF-8 content; do not convert planning docs to ASCII.
4. Run `pnpm.cmd run lint` after every code change.
5. Keep Stage 8, Stage 9, and Stage 10 closed unless a regression is found.
6. Track any new work as post-plan iteration rather than reopening the completed 0-10 stage plan.

### Session: 2026-04-08 Mobile React Native Planning Baseline

- Status: `planning_complete`
- Work completed:
  - audited the current mobile implementation state and confirmed that `apps/mobile` is only a `Vite + Capacitor` shell with no meaningful app code
  - verified that the reusable mobile-ready assets currently live mostly in `@mushroom/shared`, especially API transport, protocol types, sync-related models, and call-state types
  - confirmed that `@mushroom/ui` and `@mushroom/native-bridge` are effectively empty and should not be treated as a real cross-platform UI or bridge foundation
  - checked server readiness for mobile reuse, including device registration fields, `push_token`, `call.*` signaling, `voice_message`, `call_record`, and group-call `LiveKit` room config issuance
  - added a standalone Chinese mobile planning document at `docs/mobile-react-native-technical-plan.md`
  - updated `task_plan.md` so the mobile React Native initiative is tracked as a new post-plan iteration with milestone-level progress
  - updated `findings.md` with the architectural conclusions that should govern future mobile implementation work
- Planning decisions captured:
  - replace the current mobile shell with a true React Native app
  - develop Android and iOS in parallel under one backlog
  - reuse protocol/domain logic aggressively, but rebuild the UI in native React Native patterns instead of reusing DOM components
  - introduce a shared app-domain layer before heavy mobile feature work begins
- Verification completed:
  - `pnpm run lint`

### Session: 2026-04-08 Mobile M1 and M2 Foundation Implementation

- Status: `complete`
- Code changes completed:
  - added a new workspace package `@mushroom/app-core` for platform-neutral mobile/domain logic
  - implemented shared auth helpers for JWT parsing, device payload creation, token-expiry checks, and login-user hydration
  - implemented JSON-backed stores for auth session, sync checkpoints, and local chat data
  - implemented a portable mobile sync engine covering:
    - friend sync
    - conversation sync
    - paged message backfill
    - paged message-state sync
  - implemented a `MobileAppController` to drive bootstrap, login, register, refresh, sync, and logout flows
  - replaced the old mobile shell with a real React Native native host and app entry that surface:
    - login/register
    - device-aware auth bootstrap
    - local persistence recovery
    - sync status
    - conversation preview
    - message preview
  - added React Native workspace wiring through Metro/Babel/Jest and generated Android/iOS native project scaffolding
  - removed obsolete Capacitor/Ionic files, removed the empty `@mushroom/ui` and `@mushroom/native-bridge` packages, and cleaned root references
- Scope achieved in this round:
  - `M1`
    - shared mobile app-core foundation
    - React Native native host and workspace integration
  - `M2`
    - login/register
    - device registration payload
    - token refresh
    - startup sync
    - local persistence and recovery
    - sync preview inside the React Native host
- Verification completed:
  - `pnpm --filter @mushroom/mobile type-check`
  - `pnpm --filter @mushroom/mobile test`
  - `pnpm --filter @mushroom/mobile build`
  - `pnpm --filter @mushroom/shared test`
  - `pnpm --filter @mushroom/server test`
  - `pnpm run lint`
- Verification note:
  - `pnpm --filter @mushroom/mobile exec react-native config` resolves both Android and iOS native projects correctly
  - native build-tool validation is environment-limited in this desktop thread because Gradle cannot write to `~/.gradle` inside the sandbox and `pod` is not installed for iOS
- Next step:
  - continue into `M4` and close media messages plus mature IM actions

### Session: 2026-04-08 Mobile M3 Chat Flow Completion

- Status: `complete`
- Code changes completed:
  - extended `@mushroom/app-core` with controller actions for:
    - active conversation state
    - draft persistence
    - optimistic text send
    - ack confirmation / send failure updates
    - realtime chat/read event application
  - upgraded the local repository merge rules so optimistic messages and acked messages collapse into the same persisted record
  - added a React Native websocket client with:
    - token + device-id connection bootstrap
    - heartbeat / pong handling
    - reconnect scheduling
    - chat ack waiting
    - foreground reconnect entry
  - replaced the mobile sync-preview surface with a usable mobile IM shell:
    - chats tab
    - contacts tab
    - account tab
    - chat detail screen
    - message composer
    - conversation unread badges
    - draft restoration
  - wired text-message send, realtime receive, and read-state sync into the React Native host
- Scope achieved in this round:
  - `M3`
    - conversation list
    - contact-to-chat entry
    - chat detail
    - text message send
    - realtime receive
    - read sync
    - draft save/restore
    - pin/mute/draft visibility in the conversation list
- Verification completed:
  - `pnpm --filter @mushroom/mobile type-check`
  - `pnpm --filter @mushroom/mobile test`
  - `pnpm --filter @mushroom/mobile build`
  - `pnpm --filter @mushroom/shared test`
  - `pnpm --filter @mushroom/server test`
  - `pnpm run lint`
  - `pnpm --filter @mushroom/mobile exec react-native config`
- Next step:
  - continue into `M4` and add media messages plus mature IM actions on top of the completed mobile chat path

### Session: 2026-04-08 Mobile M4 Media and Message Actions Completion

- Status: `complete`
- Code changes completed:
  - extended `@mushroom/app-core` with controller actions for:
    - attachment message creation
    - reply reference persistence
    - forwarded message construction
    - recall handling
    - favorite / pin state updates
    - local conversation-message search
    - local conversation clear
    - realtime `message_recall` application
  - extended the mobile API layer with authenticated attachment upload for React Native file URIs
  - upgraded the React Native chat surface with:
    - image / file attachment entry
    - upload + send flow
    - inline image preview
    - reply composer preview
    - message action tray for forward / favorite / pin / recall
    - in-conversation search with filters
    - local clear-conversation action
- Scope achieved in this round:
  - `M4`
    - image messages
    - file messages
    - image preview
    - reply
    - forward
    - recall
    - favorite / pin
    - local message search
    - local clear conversation
- Verification completed:
  - `pnpm --filter @mushroom/mobile type-check`
  - `pnpm --filter @mushroom/mobile test`
  - `pnpm --filter @mushroom/mobile build`
  - `pnpm --filter @mushroom/shared test`
  - `pnpm --filter @mushroom/server test`
  - `pnpm run lint`
- Next step:
  - continue into `M5` and close profile, governance, device-summary, and global capability gaps

### Session: 2026-04-08 Mobile M5 Profile, Governance, and Multi-Device Completion

- Status: `complete`
- Code changes completed:
  - extended `@mushroom/app-core` with shared controller actions for:
    - profile refresh and profile update
    - managed-device and security-event queries
    - device disable / restore / logout flows
    - friend delete / block / unblock flows
    - attachment-center aggregation
    - group profile, announcement, settings, invite, role, mute, transfer, and leave flows
  - upgraded the React Native mobile shell with:
    - profile editing for nickname and signature
    - managed-device summary and security-event timeline
    - contact governance actions for delete / block / unblock
    - workspace-wide search overlay
    - attachment-center overlay for images and files
    - group management overlay for profile, announcement, settings, member invite, role, mute, removal, transfer, and leave
  - updated the React Native mobile test double to cover the new M5 controller surface
- Scope achieved in this round:
  - `M5`
    - profile edit
    - managed devices
    - security events
    - friend delete / block / unblock
    - group governance
    - global search
    - attachment center
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/mobile type-check`
  - `pnpm --filter @mushroom/mobile test`
  - `pnpm --filter @mushroom/mobile build`
  - `pnpm --filter @mushroom/shared test`
  - `pnpm --filter @mushroom/server test`
  - `pnpm --filter @mushroom/mobile exec react-native config`
- Next step:
  - continue into `M7` and close notifications, background recovery, and release readiness

### Session: 2026-04-08 Mobile M6 Completion

- Status: `complete`
- Code changes completed:
  - extended `@mushroom/shared` with:
    - voice-message detection and summary helpers
    - media-duration formatting
    - call-phase utility coverage for the mobile foreground calling path
    - direct-call ICE config API exposure for mobile
  - extended `@mushroom/app-core` with:
    - optimistic voice-message creation on top of the existing file-message protocol
  - upgraded the React Native mobile runtime with:
    - native audio recording and playback wiring
    - hold-to-record voice-message UX
    - waveform and duration presentation
    - realtime call-session signaling handling for invite, ringing, accept, reject, busy, timeout, end, and media-state sync
    - mobile call overlay for session phase, participant state, local media toggles, ICE summary, and LiveKit room summary
  - updated mobile test doubles for recorder, permissions, and the expanded realtime/controller surfaces
- Scope achieved in this round:
  - `M6`
    - voice-message record / upload / send / playback
    - foreground call signaling and session-state closure
    - direct-call ICE config fetch
    - group-call room-config fetch
    - participant-state and local media-state UI
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/mobile type-check`
  - `pnpm --filter @mushroom/mobile test`
  - `pnpm --filter @mushroom/mobile build`
  - `pnpm --filter @mushroom/shared test`
  - `pnpm --filter @mushroom/server test`
  - `pnpm --filter @mushroom/mobile exec react-native config`
- Verification note:
  - the RN CLI config confirms both Android and iOS native projects plus the new audio/permission dependencies are correctly discovered
  - full Gradle / CocoaPods device builds are still separate `M7` follow-up work in this desktop environment
- Next step:
  - continue into `M7` and close push, background, and release-readiness work

### Session: 2026-04-21 Mobile M7 Notifications, Background Recovery, and Release Readiness

- Status: `complete`
- Code changes completed:
  - extended `@mushroom/shared` with:
    - authenticated current-device registration request/response types
    - authenticated call-state query types for mobile recovery
  - extended the server with:
    - authenticated `/auth/device/register` endpoint for post-login push-token refresh
    - authenticated `/auth/call/state` endpoint for call-session recovery by `callId`
    - `push.notification` outbox handling and FCM delivery plumbing
    - chat-message and incoming-call push payload generation
  - upgraded the React Native mobile runtime with:
    - Firebase Messaging and Notifee notification bootstrap
    - push-token sync and device re-registration after auth
    - notification-open routing into conversation recovery
    - CallKeep-backed incoming-call presentation and pending action replay
    - NetInfo-backed reconnect, sync, presence refresh, and queue flush recovery
  - updated native config and test doubles for:
    - Android notification / foreground-service permissions
    - iOS notification/background-mode declarations
    - Jest mocks for messaging, notifee, callkeep, netinfo, and MMKV
  - added a dedicated `M7` release checklist and regression document
- Scope achieved in this round:
  - `M7-A`
    - push token registration
    - chat-message notification dispatch
    - notification-open conversation restore
  - `M7-B`
    - incoming-call push dispatch
    - system-call presentation bridge
    - pending answer/end action replay
  - `M7-C`
    - reconnect detection
    - sync recovery after network changes
    - call-state rehydration from notification payloads
  - `M7-D`
    - native permission/config closure
    - regression checklist
    - release-readiness documentation
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/mobile test`
  - `pnpm --filter @mushroom/mobile build`
  - `pnpm --filter @mushroom/mobile exec react-native config`
  - `pnpm --filter @mushroom/server test`
- Verification note:
  - desktop validation confirms JS/runtime wiring, autolink discovery, and server regression coverage
  - real-device push credentials, CallKeep behavior, and store-signing rehearsal remain final environment checks outside this desktop round
- Next step:
  - execute Android/iOS device validation with real `FCM/APNs` credentials and finalize release rehearsal

### Session: 2026-04-21 Electron Desktop Message and Call Notifications

- Status: `complete`
- Code changes completed:
  - added an Electron main-process desktop notification coordinator for:
    - native system notifications
    - taskbar flashing
    - per-conversation notification closure
    - incoming-call notification closure
    - notification click routing back into the renderer
  - extended the preload bridge and renderer typing with:
    - desktop message notification IPC
    - desktop call notification IPC
    - notification clear APIs
    - desktop notification action subscription
  - upgraded the web/electron renderer runtime with:
    - Electron-first message notification delivery instead of browser-only `Notification`
    - incoming-call desktop notification dispatch from the existing `call.*` websocket path
    - conversation-open and auto-read driven notification cleanup
    - call accept / reject / end / dismiss driven incoming-call cleanup
- Scope achieved in this round:
  - desktop `1`
    - main-process notification coordinator
  - desktop `2`
    - preload IPC bridge
  - desktop `3`
    - renderer message notifications routed through Electron
  - desktop `4`
    - dedicated incoming-call desktop notifications
  - desktop `5`
    - conversation and call notification closure
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/web build`
  - `pnpm --filter @mushroom/electron build`
- Verification note:
  - native notification presentation is now wired through the Electron main process while still reusing the existing websocket delivery path
  - the existing Vite chunk-size warnings remain pre-existing build output and are unrelated to this notification change
- Next step:
  - extract the mobile multi-provider push abstraction and validate `FCM + vendor provider` routing on devices

### Session: 2026-04-21 Mobile Multi-Provider Push Abstraction

- Status: `complete`
- Code changes completed:
  - extended shared and app-core device registration types with:
    - `push_provider`
    - `push_app_id`
    - `push_capabilities`
  - extended the server device registry and migration flow with:
    - `user_devices.push_provider`
    - `user_devices.push_app_id`
    - incremental migration application for post-init schema changes
  - extracted server push delivery into:
    - `PushProvider` contract
    - `FcmPushProvider`
    - `HuaweiPushProvider`
    - `PushRouter`
  - upgraded the React Native mobile runtime with:
    - unified push provider detection and token sync
    - `FCM/Huawei` normalized foreground/background/open handlers
    - provider-aware current-device re-registration
  - updated Android native build wiring with:
    - Huawei Maven repository
    - `agconnect` Gradle plugin
    - `agconnect-core` dependency
  - added Jest mock coverage for Huawei push runtime and updated mobile device test doubles
- Scope achieved in this round:
  - mobile `1`
    - unified push model and envelope propagation
  - mobile `2`
    - device registration field expansion
  - mobile `3`
    - `FCMProvider` extraction and routing
  - mobile `4`
    - `HuaweiProvider` integration skeleton and Android native wiring
  - mobile `5`
    - server push router and client provider-aware notification bootstrap
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/server test`
  - `pnpm --filter @mushroom/mobile build`
  - `pnpm --filter @mushroom/mobile test`
- Verification note:
  - desktop CI-style validation confirms the shared typing, server routing, RN runtime abstraction, and Jest/build surfaces are consistent
  - real vendor cloud credentials, `agconnect-services.json`, and device-side manufacturer behavior are still environment validation work
- Next step:
  - run Android Huawei / FCM device validation and finish iOS real-device push rehearsal

### Session: 2026-04-21 Mobile Xiaomi Push Adaptation

- Status: `complete`
- Code changes completed:
  - extended the shared, app-core, and server push-provider typing with:
    - `xiaomi` provider identity
    - Xiaomi-aware device registration normalization
    - Xiaomi-aware provider routing contracts
  - extended the server push delivery layer with:
    - `XiaomiPushProvider`
    - Java helper entrypoint for the official Xiaomi server SDK
    - Xiaomi env/config surface for app secret, package name, region, Java runtime, and SDK/helper classpaths
  - upgraded the React Native Android host with:
    - `XiaomiPushBridge` native module
    - Xiaomi-family device detection and provider preference resolution
    - `MiPushClient.registerPush` / `getRegId` reflective bridge calls
    - manifest placeholders for Xiaomi app id / app key
    - local `libs/` intake point for Xiaomi `AAR/JAR` assets
  - updated plan/runtime expectations with:
    - `FCM + Huawei + Xiaomi` three-provider Android push strategy
    - explicit separation between code-complete wiring and vendor-cloud/device validation
- Scope achieved in this round:
  - mobile Xiaomi `1`
    - shared and server provider typing extended to include `xiaomi`
  - mobile Xiaomi `2`
    - server-side Xiaomi provider and helper invocation path added
  - mobile Xiaomi `3`
    - Android native bridge and manifest/build wiring added
  - mobile Xiaomi `4`
    - client-side Xiaomi provider detection and regId sync added
  - mobile Xiaomi `5`
    - plan/docs updated to track Xiaomi as part of the M7 push matrix
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/server test`
  - `pnpm --filter @mushroom/mobile build`
- Verification note:
  - this desktop round validates type/build/test consistency and the intended integration seams
  - real Xiaomi delivery still depends on official Android client `AAR/JAR`, official server SDK jars, cloud credentials, and Xiaomi-device rehearsal
- Next step:
  - place the official Xiaomi Android client SDK into `apps/mobile/android/app/libs`
  - compile the Java helper with the official Xiaomi server SDK and point `PUSH_XIAOMI_SDK_DIR` / `PUSH_XIAOMI_HELPER_CLASSPATH` at real artifacts
  - run Xiaomi-device push and incoming-call validation alongside the existing FCM/Huawei rehearsal

### Session: 2026-04-28 Desktop Media Cache Implementation

- Status: `complete`
- Goal:
  - implement the `docs/cache.md` desktop media cache plan
  - add Electron-side tests for cache path/category/name safety logic
- Initial discovery:
  - Electron main already sets `userData` and supports dev-only instance data
  - database migrations are centralized in `apps/electron/src/main/migration.ts`
  - renderer currently reads media files from remote URLs directly
- Implementation pass 1:
  - added pure media cache core rules
  - added Electron main media cache IPC/service
  - added `media_cache` migration
  - added preload and renderer type surface
  - connected chat image/video/audio/file rendering to the desktop cache API
  - enabled packaged single-instance behavior while preserving dev multi-instance usage
- Verification:
  - `pnpm run lint` passed
- Error encountered:
  - `pnpm --filter @mushroom/electron test` failed because the Electron build only emitted `dist-electron/main/index.js`; the test attempted to import `dist-electron/main/media-cache-core.js`
- Resolution in progress:
  - add `media-cache-core` as a secondary Electron main build input so package tests can import the pure cache logic
- Implementation pass 2:
  - guarded `app.whenReady()` setup behind the single-instance lock success path
  - kept development multi-instance support by only requesting the lock for packaged builds
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/electron test`
- Test result:
  - Electron cache core tests passed: 4 tests, 0 failures
- Note:
  - root `README.md` was reformatted by the repository's lint/prettier command

### Session: 2026-04-28 Desktop Media Cache Runtime Fix

- Status: `complete`
- Issue:
  - Electron runtime reported `UND_ERR_INVALID_ARG` from `media-cache:download`
  - root cause was passing `maxRedirections` to `undici.request()`, which this installed Undici version does not support on that API
- Fix:
  - removed the unsupported `maxRedirections` option from the media cache download request
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/electron test`
- Note:
  - macOS `sysctlbyname for kern.hv_vmm_present failed with status -1` is a Chromium/Electron environment warning and is not the media-cache failure

### Session: 2026-04-28 Desktop Media Cache Local Resource Fix

- Status: `complete`
- Issue:
  - Renderer logged `Not allowed to load local resource: file://...` after successful media-cache download
  - root cause was returning `file://` URLs to a renderer page loaded from the dev web origin
- Fix:
  - added the `mushroom-media-cache://local/...` custom Electron protocol
  - changed media cache records to return the custom protocol URL instead of `file://`
  - added a protocol handler that only serves files under the computed media cache root
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/electron test`
- Test result:
  - Electron cache core tests passed: 5 tests, 0 failures

### Session: 2026-04-28 Desktop Media Cache Download Policy Adjustment

- Status: `complete`
- Change:
  - video messages no longer download full video files when rendered in the chat list
  - video cache download now happens only when the user clicks play
  - image preview now resolves the image through media cache when the preview modal opens
- Current policy:
  - image chat display: cache display image during render
  - image preview: resolve/cache when preview opens
  - video: cache only on click-to-play
  - voice/audio: cache only on click-to-play
  - generic files: cache only on click-to-open
- Verification completed:
  - `pnpm run lint`
  - `pnpm --filter @mushroom/electron test`

### Session: 2026-04-28 Image Preview Toolbar Theme Fix

- Status: `complete`
- Issue:
  - image preview toolbar buttons were hard to see in light mode
  - toolbar and action buttons relied on transparent surfaces and white foregrounds, which failed on light image/content backgrounds
- Fix:
  - added a dark translucent toolbar surface, border, and shadow
  - gave preview action buttons visible backgrounds, borders, hover states, and focus outlines
  - made prev/next navigation buttons use the same visible dark surface
- Verification completed:
  - `pnpm run lint`

### Session: 2026-04-30 Mobile Message Paging and Media Cache

- Status: `complete`
- Confirmed gap against `docs/message-media-strategy.md`:
  - message detail uses full-history `ScrollView`
  - mobile media has no SQLite `media_cache` index
  - images/files/voice/video use remote URLs without disk cache
  - offline fallback UI is missing for uncached media
- Dependency change:
  - added `react-native-fs` to `@mushroom/mobile` for disk cache I/O and SHA-256 hashing
  - added `react-native-video` to render video first-frame previews from remote or cached local sources
- Implementation:
  - mobile snapshots now cap visible messages to 50 per conversation by default
  - active chat can load older messages in 50-message pages from local SQLite first, then `/message/list?beforeSequence=...`
  - chat detail now uses FlashList virtualization instead of mapping all messages inside a ScrollView
  - added mobile `media_cache` SQLite table and RNFS-backed cache service with SHA-256 duplicate reuse and concurrent download merging
  - image messages auto-download to cache while rendering and show a fallback box when not cached/unavailable
  - regular files up to 20 MB auto-download while rendering; larger files show click-to-download state
  - video cards render first-frame previews via `react-native-video`; click downloads and opens local cached media
  - voice/audio playback downloads to cache before starting the player
- Verification:
  - `pnpm --filter @mushroom/mobile type-check`
  - `pnpm --filter @mushroom/mobile test -- chat-detail-screen.test.tsx message-bubble.test.tsx voice-actions.test.ts sqlite-data-repository.test.ts`
  - `pnpm run lint`

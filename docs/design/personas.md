# User Personas and Edge Cases — NotesApp

**Version**: 1.0  
**Date**: 2026-04-01

---

## Table of Contents

1. [Persona Overview](#1-persona-overview)
2. [Persona 1 — Maya Chen (Power User)](#2-persona-1--maya-chen-power-user)
3. [Persona 2 — Sam Okafor (Casual User)](#3-persona-2--sam-okafor-casual-user)
4. [Persona 3 — Dev Team (Collaborative)](#4-persona-3--dev-team-collaborative)
5. [Feature Edge Case Matrix](#5-feature-edge-case-matrix)
   - [Auth](#51-auth)
   - [Notes CRUD](#52-notes-crud)
   - [Rich Text and Tags](#53-rich-text-and-tags)
   - [Real-Time Sync](#54-real-time-sync)

---

## 1. Persona Overview

| Attribute | Maya Chen | Sam Okafor | Dev Team |
|---|---|---|---|
| Role archetype | Power user | Casual user | Collaborative team |
| Note count | 500+ | ~20 | 100–300 (shared workspace) |
| Devices | Laptop + iPad | Single laptop | 2–3 laptops, same WiFi |
| Usage pattern | Daily, heavy, structured | Occasional, quick capture | Sporadic bursts, simultaneous edits |
| Primary concern | Speed, organization, search | Simplicity, reliability | Conflict-free collaboration |
| Risk profile | High data volume, complex FTS | Account recovery, simple errors | Race conditions, sync correctness |

---

## 2. Persona 1 — Maya Chen (Power User)

**Background**: Maya is a data scientist at a mid-size tech company. She uses NotesApp as her primary knowledge management tool, replacing Notion for personal notes. She has built up 500+ notes over two years, organized with 30+ tags and a strict folder-like tagging convention (`project/alpha`, `reading/2026`, `meeting/q1`). She edits long notes (some exceeding 5,000 words) with heavy inline formatting: code blocks, nested lists, bold/italic emphasis, and headings. She frequently switches between her MacBook Pro and iPad throughout the day, expecting seamless continuity.

**Goals**:
- Find any note within 2 seconds using FTS or tag filter
- Switch devices without losing unsaved changes
- Edit a 5,000-word note without editor lag

**Frustrations**:
- Stale search results after bulk note updates
- Losing formatting when pasting from external sources
- Having to re-login on the iPad after the access token expires mid-session

---

## 3. Persona 2 — Sam Okafor (Casual User)

**Background**: Sam is a second-year university student who started using NotesApp for lecture notes and to-do lists. He has about 20 notes, mostly plain text with minimal formatting. He uses a single laptop and visits the app a few times a week. He rarely uses tags, has never done a search, and occasionally forgets his password. His primary need is fast note capture — he wants to open the app and type within 3 seconds.

**Goals**:
- Create a new note in under 5 seconds
- Have notes persist reliably across browser sessions
- Recover account if password is forgotten (Phase 2 feature — email reset)

**Frustrations**:
- Long loading times when reopening the app after a week away
- Unexpected logouts (token expiry mid-session without auto-refresh)
- Editor toolbar complexity obscuring a plain-text writing experience

---

## 4. Persona 3 — Dev Team (Collaborative)

**Background**: A 3-person frontend development team (Alice, Bob, Carol) uses a shared NotesApp account (or future workspace feature) to document sprint decisions, write runbooks, and draft PRDs collaboratively. All three may have the same note open simultaneously. They are technically sophisticated and will notice sync anomalies immediately. Their notes are medium length (500–1,500 words) with code blocks, lists, and inline comments. They stress-test the real-time sync path by typing simultaneously in the same paragraph.

**Goals**:
- See each other's edits within 1–2 seconds
- Not lose their own edits when a concurrent edit arrives
- Reconnect seamlessly if one team member's network drops

**Frustrations**:
- Last-write-wins overwrites from simultaneous paragraph edits
- Phantom duplicate content after a reconnect + re-sync
- STOMP subscription dropping silently without visible error

---

## 5. Feature Edge Case Matrix

---

### 5.1 Auth

**Happy Path — Maya (Power User)**:
Maya opens NotesApp on her MacBook after a long day. She types her email and password, clicks "Sign in", and is redirected to her note list in under 800ms. The access token is stored in memory; the refresh token is stored in `HttpOnly` cookies (or localStorage — implementation decision). When she switches to her iPad and opens the app 20 minutes later, the access token has expired, the Angular `AuthInterceptor` catches the 401, silently calls `POST /auth/refresh`, and retries the original request — Maya never sees a login screen.

| # | Scenario | Expected Behavior | Risk |
|---|---|---|---|
| A-1 | Maya registers with an email that already exists in the database | Server returns `409 Conflict` with `{ error: "EMAIL_ALREADY_REGISTERED" }`. Angular shows a specific inline message: "An account with this email already exists." — not a generic error. | Medium |
| A-2 | Sam enters the wrong password 10 times in a row | After the 5th attempt, server starts rate-limiting: `429 Too Many Requests` with `Retry-After: 60`. Angular shows a countdown timer. After 60 seconds, the form re-enables. Accounts are NOT locked permanently to avoid denial-of-service lockout by a third party. | High |
| A-3 | Maya's refresh token is stolen and used from a different IP before she uses it | Refresh token rotation detects the race: when Maya (the real user) sends the already-rotated refresh token on her next 401, the server finds the token is already `revoked = true`, returns `401`, and forces re-login. If the stolen token was used first, Maya's active session breaks — this is the accepted security trade-off. | Critical |
| A-4 | Sam's browser crashes mid-request while the access token is being refreshed | The in-flight `POST /auth/refresh` may have succeeded on the server (new token issued, old token revoked) but the response never reached the client. On next page load, the interceptor retries refresh with the old token, which is now revoked — `401` is returned, user is redirected to login. Sam sees the login screen unexpectedly. Mitigation: the Angular interceptor should not revoke the old refresh token until the new one is confirmed received. This is a known edge case for Phase 2 hardening. | High |
| A-5 | A user calls `POST /auth/refresh` with a refresh token that has expired (past `expires_at`) | Server returns `401 Unauthorized` with `{ error: "REFRESH_TOKEN_EXPIRED" }`. Angular clears all stored tokens and navigates to `/login` with a toast: "Your session has expired. Please sign in again." | Medium |
| A-6 | JWT is tampered with (signature modified) | `JwtAuthenticationFilter` catches the `SignatureException`, returns `401 Unauthorized` with `{ error: "INVALID_TOKEN" }`. The tampered token is not persisted or used in any way. | Critical |
| A-7 | Two tabs open simultaneously on Maya's laptop both try to refresh the token at the same instant | The second refresh call arrives after the first has already rotated the token. The second call sends the now-revoked original token — `401` returned, second tab redirects to login. Mitigation (Phase 2): implement a browser-level mutex (BroadcastChannel API) so only one tab performs the refresh at a time. | High |

---

### 5.2 Notes CRUD

**Happy Path — Sam (Casual User)**:
Sam clicks the "+ New Note" button. A blank note opens instantly (optimistic creation — the Angular component creates a local Signal state before the `POST /api/v1/notes` completes). He types "Buy groceries" as the title and lists a few items. After a 500ms debounce, the Angular service fires `PUT /api/v1/notes/{id}` with the current ProseMirror content. Sam closes the browser tab. Later he returns, the notes list loads, and his note is there.

| # | Scenario | Expected Behavior | Risk |
|---|---|---|---|
| C-1 | Maya opens a 5,000-word note (large JSONB) on her iPad — slow 3G connection | The `GET /api/v1/notes/{id}` may take 3–5 seconds. Angular shows a skeleton loader. TipTap initializes with empty content first, then replaces with server content once the response arrives. If the response takes >10s, a timeout error is shown with a retry button. The note is not left in a half-initialized state. | Medium |
| C-2 | Sam creates a note with a 100,000-character title | Server validation (`@Size(max = 500)` on `CreateNoteRequest.title`) returns `400 Bad Request` with `{ field: "title", message: "Title must not exceed 500 characters" }`. Angular shows the validation message below the title input. | Low |
| C-3 | Maya deletes a note that has 15 tags attached | `DELETE /api/v1/notes/{id}` triggers `ON DELETE CASCADE` on `note_tags` — all 15 associations are removed atomically. The tags themselves are NOT deleted (they are user-scoped, not note-scoped). The notes list in Angular removes the note optimistically and re-fetches the list in the background. | Low |
| C-4 | Sam's autosave debounce fires while the browser tab is being closed (beforeunload) | The in-flight `PUT` request may or may not reach the server. The browser does not guarantee pending XHR requests complete on tab close. The most recent successfully acknowledged version is the canonical state. Mitigation (Phase 2): use the `navigator.sendBeacon` API for the final save on `beforeunload`. | High |
| C-5 | Maya tries to `GET /api/v1/notes/{id}` for a note that belongs to a different user | Server returns `404 Not Found` (not `403 Forbidden`) — information hiding prevents Maya from confirming another user's note ID exists. | Medium |
| C-6 | Two simultaneous `PUT /api/v1/notes/{id}` requests arrive for the same note (e.g., Maya on two devices, both have unsaved changes from disconnected editing) | Current implementation: last write wins (the second `PUT` overwrites the first). No merge or conflict notification is provided. Angular shows the note content last returned by the server. This is a known Phase 1 limitation; optimistic concurrency (`ETag` + `If-Match` header, or CRDT merge) is planned for Phase 3. | High |
| C-7 | `POST /api/v1/notes` fails due to a database error mid-transaction | Server returns `500 Internal Server Error`. The optimistic note in Angular's local state is marked with an error badge. A retry button is shown. The note is NOT partially persisted (Spring `@Transactional` ensures rollback). | High |
| C-8 | Maya searches for a term she just typed (within the last second, before tsvector update) | The `search_vector` is updated synchronously during the `PUT /notes/{id}` service call before the response is returned. There is no async delay. If a search is issued between `PUT` being received and the service updating `search_vector` (race in same request), the search may miss the update. This is negligible in practice since REST calls are sequential. | Low |

---

### 5.3 Rich Text and Tags

**Happy Path — Maya (Power User)**:
Maya opens a note about a research paper. She selects a sentence and clicks "Bold" in the TipTap toolbar, making the text `**bold**` in the underlying ProseMirror model. She adds a code block with a Python snippet. She then opens the tag panel, creates a new tag called "reading/2026" with color `#10B981`, and applies it to the note. The note's `updated_at` is refreshed, and the tag appears in the sidebar tag list immediately.

| # | Scenario | Expected Behavior | Risk |
|---|---|---|---|
| T-1 | Maya pastes raw HTML from a website into TipTap | TipTap's `pasteRules` clean and normalize the incoming HTML to the ProseMirror schema. Unknown HTML elements (e.g., `<div class="ad-container">`) are stripped. Only elements supported by the configured TipTap extensions (bold, italic, code, headings, lists, links) are preserved. The result is inserted as formatted text without raw HTML in the `content` JSONB. | Medium |
| T-2 | Sam pastes 50,000 characters of plain text into the editor at once | TipTap handles large pastes synchronously on the main thread; for very large inputs this can cause a 200–500ms UI freeze. Angular shows no loading indicator during this (it happens synchronously in the editor). The `content_text` derived from this on save will be large but within PostgreSQL's TOAST storage limit. No data loss occurs. Performance concern is logged as a Phase 2 optimization (chunked paste processing). | Medium |
| T-3 | Maya creates a tag named "important" and then tries to create another tag named "important" (same user) | Server returns `409 Conflict` with `{ error: "TAG_NAME_ALREADY_EXISTS" }`. The unique constraint `(user_id, name)` on the `tags` table enforces this at the database level. Angular shows: "You already have a tag named 'important'." | Low |
| T-4 | A tag is deleted while a note with that tag is open in Maya's editor | `DELETE /api/v1/tags/{id}` cascades through `note_tags`. The note itself is not deleted. The Angular tag panel re-fetches the tag list on the next poll or WebSocket event and removes the deleted tag from the note's displayed tags. If the Angular note view is stale (tag still displayed locally), the next `GET /api/v1/notes/{id}` or tags refresh will reconcile. | Medium |
| T-5 | Maya tries to apply a tag that belongs to a different user to her note | API endpoint `PUT /api/v1/notes/{id}` validates that all `tagIds` in the request body belong to `jwt.sub`. Tags from other users return `403 Forbidden` with `{ error: "TAG_NOT_OWNED_BY_USER", tagId: "..." }`. | High |
| T-6 | Sam tries to update a tag's color to an invalid hex value (`#ZZZZZZ`) | Server-side `@Pattern(regexp="^#[0-9A-Fa-f]{6}$")` validation on `UpdateTagRequest.color` returns `400 Bad Request` with `{ field: "color", message: "Color must be a valid hex color (e.g. #4A90E2)" }`. The Angular color picker prevents invalid input at the UI level, but server validation is the authoritative gate. | Low |
| T-7 | TipTap emits a `transaction` event with zero content changes (e.g., cursor moved) | The Angular `(update)` handler checks `transaction.docChanged` before triggering the 500ms debounce autosave. Cursor-only transactions do not trigger a `PUT`. | Low |
| T-8 | Maya applies 50 tags to a single note (stress test) | The `PUT /api/v1/notes/{id}` request body can contain up to 50 `tagIds`. Server validates `@Size(max = 50)` on the list. All 50 rows are inserted into `note_tags` in a single batch `INSERT`. No N+1 query is triggered. If a user tries to apply 51 tags, `400 Bad Request` is returned. | Medium |

---

### 5.4 Real-Time Sync

**Happy Path — Dev Team (Alice and Bob)**:
Alice opens note `abc-123` in her browser. Angular STOMP client subscribes to `/topic/notes/abc-123`. Bob opens the same note 30 seconds later — his STOMP client also subscribes. Alice types "Meeting agenda: " in the first paragraph. TipTap emits a `transaction`; the Angular STOMP service publishes a SEND frame to `/app/notes/abc-123/edit` with the ProseMirror steps. Spring's `@MessageMapping("/notes/{id}/edit")` handler persists the updated content and broadcasts the patch to `/topic/notes/abc-123`. Bob's client receives the MESSAGE frame and applies the patch to his local TipTap instance. Bob sees Alice's text within ~200ms.

| # | Scenario | Expected Behavior | Risk |
|---|---|---|---|
| R-1 | Alice and Bob type in the same paragraph simultaneously (the classic concurrent edit conflict) | Both clients send STOMP SEND frames to the server within milliseconds of each other. The server processes them sequentially (the Spring `@MessageMapping` handler is single-threaded per STOMP session). The second edit's patch may not apply cleanly on top of the first (position offsets are stale). Current behavior: the server applies the second patch naively (last-write-wins at the step level), broadcasts the result, and both clients receive the final state. One user's keystrokes may be silently dropped. This is a known Phase 1 limitation. Full OT/CRDT resolution is planned for Phase 3 using Yjs. | Critical |
| R-2 | Carol's laptop loses WiFi for 30 seconds while Bob and Alice make 200 edits | Carol's STOMP client disconnects (`@stomp/stompjs` detects heartbeat timeout). On reconnect, Carol's client: (1) re-establishes the WebSocket, (2) re-authenticates, (3) re-subscribes to `/topic/notes/abc-123`, (4) fetches the current server state via `GET /api/v1/notes/abc-123`, (5) resets the TipTap editor with the authoritative server content. Carol's local unsaved edits are discarded. A toast notification informs her: "Connection restored. Note refreshed from server." | High |
| R-3 | The STOMP broker drops a message in transit (network packet loss) | `@stomp/stompjs` does not provide guaranteed delivery — STOMP over WebSocket is best-effort. A dropped broadcast means a subscriber misses a patch. The subscriber's local state diverges from the server. Angular's periodic "reconciliation ping" (polling `GET /api/v1/notes/{id}` every 30 seconds while a note is open) detects the divergence and resets the editor. This is a Phase 1 mitigant; full message ordering is a Phase 3 concern. | High |
| R-4 | Bob has the note open but is idle (no edits) for 10 minutes; the server's JWT expires | The STOMP connection's JWT was validated at handshake time and is not re-validated on every frame (Spring WebSocket does not re-run the JWT filter per message). The connection remains alive past token expiry. However, when Bob's Angular interceptor tries to make a REST call (e.g., save), the 401 triggers a silent refresh. The STOMP connection is not affected by this REST 401. If the STOMP connection drops and Bob tries to reconnect after the access token expiry, the re-handshake will fail with `401` — the Angular app then refreshes the token and re-connects. | Medium |
| R-5 | Alice sends a STOMP SEND frame for a note she does not own (forged `noteId` in the destination) | The `@MessageMapping` handler calls `noteService.validateOwnership(userId, noteId)` before applying any patch. If the user does not own the note, a STOMP ERROR frame is returned to Alice and the broadcast does not occur. | Critical |
| R-6 | The Spring Boot server restarts while Alice has the note open | Alice's WebSocket connection is closed with a `1006 Abnormal Closure` code. `@stomp/stompjs` reconnect logic kicks in (exponential backoff: 5s, 10s, 20s, max 60s). Once the server is back up, reconnect succeeds. Alice receives a toast: "Reconnecting…" during the attempt and "Reconnected" on success. Any edits made during the server downtime that were not yet sent are lost (TipTap buffer is not persisted locally in Phase 1). | High |
| R-7 | Carol subscribes to `/topic/notes/abc-123` but does not have read access to that note (e.g., she guessed the UUID) | The STOMP SUBSCRIBE handler calls `noteService.validateOwnership(userId, noteId)` on subscription. If Carol does not own the note, the subscription is rejected with a STOMP ERROR frame and Carol's session does not receive broadcasts for that note. | Critical |
| R-8 | 10 users all edit the same note simultaneously (load test) | The STOMP topic `/topic/notes/{id}` fans out to all 10 subscribers on each broadcast. Each edit triggers a DB write + 10 message sends. At this scale, the server handles the load on a single JVM with virtual threads. Expected throughput degrades gracefully but does not crash. Observed risk: thundering herd of patches produces rapid `updated_at` updates, potentially causing DB write contention. Phase 2 mitigation: buffer patches in memory for 100ms and batch-write. | High |

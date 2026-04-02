# System Design — NotesApp

**Version**: 1.0  
**Date**: 2026-04-01  
**Status**: Current

---

## Table of Contents

1. [System Components Overview](#1-system-components-overview)
2. [Auth Flow](#2-auth-flow)
3. [Note CRUD Flow](#3-note-crud-flow)
4. [Real-Time Sync Flow](#4-real-time-sync-flow)
5. [Security Boundary Diagram](#5-security-boundary-diagram)
6. [Deployment Topology](#6-deployment-topology)

---

## 1. System Components Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT TIER                                   │
│                                                                         │
│  ┌──────────────────────────────────┐   ┌──────────────────────────┐   │
│  │    Angular 21 Web App            │   │   iOS App (Phase 2)      │   │
│  │                                  │   │   Swift / UIKit          │   │
│  │  ┌─────────────┐ ┌────────────┐  │   │                          │   │
│  │  │  TipTap     │ │  Signals   │  │   │  WKWebView (TipTap)      │   │
│  │  │  Editor     │ │  Store     │  │   │  or native renderer      │   │
│  │  └─────────────┘ └────────────┘  │   └──────────────────────────┘   │
│  │  ┌─────────────┐ ┌────────────┐  │                                   │
│  │  │  HTTP       │ │  STOMP     │  │                                   │
│  │  │  Client     │ │  Client    │  │                                   │
│  │  └──────┬──────┘ └─────┬──────┘  │                                   │
│  └─────────┼──────────────┼─────────┘                                   │
└────────────┼──────────────┼─────────────────────────────────────────────┘
             │  REST/HTTPS  │  WS/wss
             │  (port 443)  │  (port 443 /ws)
             ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API TIER                                      │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                  Spring Boot 4 / Java 25                         │  │
│  │                                                                  │  │
│  │  ┌─────────────────┐   ┌──────────────┐   ┌──────────────────┐  │  │
│  │  │  REST            │   │  WebSocket   │   │  Spring Security │  │  │
│  │  │  Controllers     │   │  STOMP       │   │  JWT Filter      │  │  │
│  │  │  /api/v1/*       │   │  /ws         │   │  Chain           │  │  │
│  │  └────────┬─────────┘   └──────┬───────┘   └─────────────────-┘  │  │
│  │           │                    │                                   │  │
│  │  ┌────────▼────────────────────▼──────────────────────────────┐  │  │
│  │  │                    Service Layer                            │  │  │
│  │  │  AuthService  NoteService  TagService  SearchService        │  │  │
│  │  └────────────────────────────┬───────────────────────────────┘  │  │
│  │                               │                                   │  │
│  │  ┌────────────────────────────▼───────────────────────────────┐  │  │
│  │  │                  Repository Layer (Spring Data JPA)         │  │  │
│  │  │  UserRepo  NoteRepo  TagRepo  RefreshTokenRepo              │  │  │
│  │  └────────────────────────────┬───────────────────────────────┘  │  │
│  └───────────────────────────────┼──────────────────────────────────┘  │
└──────────────────────────────────┼──────────────────────────────────────┘
                                   │  JDBC / JPA
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA TIER                                     │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     PostgreSQL 16                                │  │
│  │                                                                  │  │
│  │   users    notes    tags    note_tags    refresh_tokens          │  │
│  │                                                                  │  │
│  │   FTS: tsvector index on notes.search_vector                     │  │
│  │   JSONB: notes.content (ProseMirror document)                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| Angular 21 Web App | Renders UI, manages local state via Signals, sends REST calls, maintains STOMP connection |
| TipTap Editor | Provides rich-text editing, produces ProseMirror JSON on each keystroke |
| STOMP Client (`@stomp/stompjs`) | Subscribes to `/topic/notes/{id}`, publishes edit events to `/app/notes/{id}/edit` |
| Spring Boot REST Controllers | Validates requests, delegates to service layer, returns JSON responses |
| Spring WebSocket / STOMP Broker | Routes STOMP frames between clients and server message handlers |
| Spring Security JWT Filter | Intercepts every HTTP and WebSocket handshake request, validates JWT, populates `SecurityContext` |
| Service Layer | Owns business logic: ownership checks, tag validation, FTS indexing, token rotation |
| Repository Layer | JPA entities + Spring Data interfaces; `NoteRepository` includes custom `@Query` for FTS |
| PostgreSQL 16 | Single source of truth; enforces FK constraints, stores JSONB content, provides FTS |

---

## 2. Auth Flow

### 2.1 Registration

```
Client                              Server                           Database
  │                                    │                                │
  │── POST /api/v1/auth/register ──────►│                                │
  │   { email, password, displayName } │                                │
  │                                    │── validate email format ───────│
  │                                    │── check email uniqueness ──────►│
  │                                    │◄─ exists: false ───────────────│
  │                                    │── bcrypt hash password ────────│
  │                                    │── INSERT users row ────────────►│
  │                                    │◄─ user row saved ──────────────│
  │                                    │── generate access JWT ─────────│
  │                                    │── generate refresh token ──────│
  │                                    │── INSERT refresh_tokens row ───►│
  │◄── 201 { accessToken,              │◄─ token saved ─────────────────│
  │         refreshToken,              │                                │
  │         user: { id, email, ... } } │                                │
```

### 2.2 Login

```
Client                              Server                           Database
  │                                    │                                │
  │── POST /api/v1/auth/login ─────────►│                                │
  │   { email, password }             │                                │
  │                                    │── SELECT user WHERE email ─────►│
  │                                    │◄─ user row ────────────────────│
  │                                    │── bcrypt.verify(password,      │
  │                                    │       user.password_hash)      │
  │                                    │   [match: proceed]             │
  │                                    │── generate access JWT ─────────│
  │                                    │   (sub=userId, exp=+15min)     │
  │                                    │── generate refresh token ──────│
  │                                    │   (opaque, 256-bit random)     │
  │                                    │── hash refresh token ──────────│
  │                                    │── INSERT refresh_tokens row ───►│
  │◄── 200 { accessToken,              │                                │
  │         refreshToken,             │                                │
  │         expiresIn: 900 }          │                                │
```

### 2.3 Authenticated Request (Bearer Token)

```
Client                         JWT Filter              Controller        Database
  │                                │                       │                │
  │── GET /api/v1/notes ───────────►│                       │                │
  │   Authorization: Bearer <jwt> │                       │                │
  │                                │── parse JWT header ───│                │
  │                                │── verify signature ───│                │
  │                                │── check exp claim ────│                │
  │                                │── extract userId ─────│                │
  │                                │── set SecurityContext │                │
  │                                │── forward request ────►               │
  │                                │                       │── query DB ───►│
  │                                │                       │◄─ results ─────│
  │◄── 200 { notes: [...] } ───────│◄──────────────────────│                │
```

### 2.4 Token Refresh Flow

```
Client                              Server                           Database
  │                                    │                                │
  │  [access token expires — 401]      │                                │
  │                                    │                                │
  │── POST /api/v1/auth/refresh ───────►│                                │
  │   { refreshToken: "<opaque>" }    │                                │
  │                                    │── hash incoming token ─────────│
  │                                    │── SELECT refresh_tokens        │
  │                                    │     WHERE token_hash = ? ──────►│
  │                                    │◄─ token row ───────────────────│
  │                                    │── check revoked = false ───────│
  │                                    │── check expires_at > NOW() ────│
  │                                    │── ROTATE: mark old row         │
  │                                    │     revoked = true ────────────►│
  │                                    │── generate new access JWT ─────│
  │                                    │── generate new refresh token ──│
  │                                    │── INSERT new refresh_tokens ───►│
  │◄── 200 { accessToken,              │                                │
  │         refreshToken }            │                                │
```

### 2.5 Logout

```
Client                              Server                           Database
  │                                    │                                │
  │── POST /api/v1/auth/logout ────────►│                                │
  │   Authorization: Bearer <jwt>     │                                │
  │   { refreshToken: "<opaque>" }    │                                │
  │                                    │── hash refresh token ──────────│
  │                                    │── UPDATE refresh_tokens        │
  │                                    │     SET revoked = true ─────────►│
  │◄── 204 No Content ─────────────────│                                │
  │                                    │                                │
  │  [client deletes tokens from       │                                │
  │   localStorage/memory]            │                                │
```

---

## 3. Note CRUD Flow

### 3.1 Create Note

```
Angular                          NoteController        NoteService        DB
  │                                    │                    │              │
  │── POST /api/v1/notes ──────────────►│                    │              │
  │   { title, content (ProseMirror   │                    │              │
  │     JSON), tagIds[] }             │                    │              │
  │                                    │── validate body ───►│              │
  │                                    │                    │── extract    │
  │                                    │                    │   content_   │
  │                                    │                    │   text from  │
  │                                    │                    │   ProseMirror│
  │                                    │                    │── generate   │
  │                                    │                    │   tsvector   │
  │                                    │                    │── INSERT     │
  │                                    │                    │   notes ────►│
  │                                    │                    │── link tags  │
  │                                    │                    │── INSERT     │
  │                                    │                    │   note_tags ─►│
  │◄── 201 { note: { id, title, ... }}│◄───────────────────│◄─────────────│
```

### 3.2 Read Notes (List with Pagination)

```
Angular                          NoteController        NoteService        DB
  │                                    │                    │              │
  │── GET /api/v1/notes                │                    │              │
  │   ?page=0&size=20&tag=work ────────►│                    │              │
  │                                    │── parse query ─────►│              │
  │                                    │                    │── SELECT     │
  │                                    │                    │   notes JOIN │
  │                                    │                    │   note_tags  │
  │                                    │                    │   WHERE      │
  │                                    │                    │   user_id=?  │
  │                                    │                    │   AND tag=?  │
  │                                    │                    │   LIMIT 20   │
  │                                    │                    │   OFFSET 0 ─►│
  │◄── 200 { items: [...],             │◄───────────────────│◄─────────────│
  │         totalCount, page, size }  │                    │              │
```

### 3.3 Update Note

```
Angular (TipTap)                 NoteController        NoteService        DB
  │                                    │                    │              │
  │  [user types in editor]            │                    │              │
  │  [debounce 500ms]                  │                    │              │
  │── PUT /api/v1/notes/{id} ──────────►│                    │              │
  │   { title?, content? }            │                    │              │
  │                                    │── ownership check ──►│              │
  │                                    │   SELECT notes WHERE│              │
  │                                    │   id=? AND          │              │
  │                                    │   user_id=? ────────────────────►│
  │                                    │                    │◄─────────────│
  │                                    │                    │── re-extract │
  │                                    │                    │   content_text│
  │                                    │                    │── re-generate│
  │                                    │                    │   tsvector   │
  │                                    │                    │── UPDATE     │
  │                                    │                    │   notes ────►│
  │◄── 200 { note: { ...updated } } ──│◄───────────────────│◄─────────────│
  │                                    │                    │              │
  │  [STOMP broadcast — see §4]        │                    │              │
```

### 3.4 Delete Note

```
Angular                          NoteController        NoteService        DB
  │                                    │                    │              │
  │── DELETE /api/v1/notes/{id} ───────►│                    │              │
  │   Authorization: Bearer <jwt>     │                    │              │
  │                                    │── ownership check ──►│              │
  │                                    │                    │── DELETE     │
  │                                    │                    │   note_tags  │
  │                                    │                    │   WHERE      │
  │                                    │                    │   note_id=? ─►│
  │                                    │                    │── DELETE     │
  │                                    │                    │   notes      │
  │                                    │                    │   WHERE id=? ►│
  │◄── 204 No Content ─────────────────│◄───────────────────│◄─────────────│
```

### 3.5 Full-Text Search

```
Angular                          NoteController        NoteService            DB
  │                                    │                    │                  │
  │── GET /api/v1/notes/search         │                    │                  │
  │   ?q=quarterly+report ─────────────►│                    │                  │
  │                                    │── parse q ──────────►│                  │
  │                                    │                    │── plainto_tsquery │
  │                                    │                    │── SELECT notes    │
  │                                    │                    │   WHERE           │
  │                                    │                    │   user_id=?       │
  │                                    │                    │   AND             │
  │                                    │                    │   search_vector   │
  │                                    │                    │   @@ tsquery      │
  │                                    │                    │   ORDER BY        │
  │                                    │                    │   ts_rank DESC ───►│
  │◄── 200 { items: [...] } ───────────│◄───────────────────│◄──────────────────│
```

---

## 4. Real-Time Sync Flow

### 4.1 WebSocket Connection and STOMP Handshake

```
Angular (STOMP Client)               Spring WebSocket Server
  │                                         │
  │── HTTP GET /ws (Upgrade: websocket) ────►│
  │◄── 101 Switching Protocols ─────────────│
  │                                         │
  │── STOMP CONNECT frame ──────────────────►│
  │   Authorization: Bearer <jwt>           │
  │                                         │── JWT filter validates token
  │                                         │── sets SecurityContext
  │◄── STOMP CONNECTED frame ───────────────│
  │   { version: 1.2, heartbeat: 10000 }   │
  │                                         │
  │── STOMP SUBSCRIBE ──────────────────────►│
  │   destination: /topic/notes/{noteId}   │
  │                                         │── registers subscription
  │◄── (acknowledgement or silence) ────────│
```

### 4.2 Note Edit Event — Editor to Server

```
Angular (TipTap Editor)              NoteService         STOMP Broker    Subscribers
  │                                      │                    │               │
  │  [user types a character]            │                    │               │
  │  [TipTap emits transaction]          │                    │               │
  │  [Signals: noteContent updated]      │                    │               │
  │                                      │                    │               │
  │── STOMP SEND ────────────────────────►│                    │               │
  │   destination: /app/notes/{id}/edit │                    │               │
  │   body: {                           │                    │               │
  │     noteId: "uuid",                 │                    │               │
  │     patch: { ... ProseMirror steps }│                    │               │
  │     version: 42                     │                    │               │
  │   }                                 │                    │               │
  │                                      │── validate ownership ────────────────│
  │                                      │── apply patch ─────────────────────│
  │                                      │── persist to DB ────────────────────│
  │                                      │── broadcast ────────►│              │
  │                                      │                    │── push to all ►│
  │                                      │                    │   /topic/notes │
  │                                      │                    │   /{id}        │
```

### 4.3 Receiving a Patch — Client Update

```
Angular (STOMP Client)              Angular (TipTap)         Signals Store
  │                                      │                        │
  │◄── STOMP MESSAGE ────────────────────│                        │
  │   destination: /topic/notes/{id}    │                        │
  │   body: {                           │                        │
  │     noteId: "uuid",                 │                        │
  │     patch: { ... },                 │                        │
  │     authorId: "other-user-uuid",    │                        │
  │     version: 43                     │                        │
  │   }                                 │                        │
  │                                      │                        │
  │  [if authorId != currentUserId]      │                        │
  │── apply patch to TipTap editor ─────►│                        │
  │                                      │── editor.commands      │
  │                                      │   .insertContent(patch)│
  │                                      │── emit update ─────────►│
  │                                      │                        │── noteContent
  │                                      │                        │   signal updated
```

### 4.4 Disconnect and Reconnect

```
Angular (STOMP Client)              Spring Server
  │                                      │
  │  [network interruption]              │
  │                                      │── heartbeat timeout detected
  │                                      │── session removed
  │                                      │
  │  [@stomp/stompjs auto-reconnect]     │
  │── re-initiate WS connection ─────────►│
  │── re-authenticate with JWT ──────────►│
  │── re-subscribe /topic/notes/{id} ────►│
  │── GET /api/v1/notes/{id} (REST) ─────►│  [fetch current server state]
  │◄── 200 { note: { content: ... } } ───│
  │── reset TipTap editor with latest ───│
  │   server content                     │
```

---

## 5. Security Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PUBLIC ZONE (No Auth Required)                   │
│                                                                         │
│   POST /api/v1/auth/register   — create account                        │
│   POST /api/v1/auth/login      — obtain tokens                         │
│   POST /api/v1/auth/refresh    — rotate tokens (refresh token in body) │
│   GET  /api/v1/health          — liveness probe                        │
│                                                                         │
│   Angular static assets (HTML, JS, CSS) served by CDN/nginx            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                        ┌──────────▼───────────┐
                        │   JWT Filter         │
                        │                      │
                        │ 1. Extract Bearer    │
                        │    token from header │
                        │ 2. Verify HMAC-SHA256│
                        │    signature         │
                        │ 3. Check exp > NOW   │
                        │ 4. Extract sub (uid) │
                        │ 5. Set              │
                        │    SecurityContext   │
                        │                      │
                        │ FAIL → 401 Unauthorized│
                        └──────────┬───────────┘
                                    │ PASS
┌─────────────────────────────────▼───────────────────────────────────────┐
│                       PROTECTED ZONE (JWT Required)                     │
│                                                                         │
│   POST /api/v1/auth/logout                                              │
│   GET  /api/v1/notes                                                    │
│   POST /api/v1/notes                                                    │
│   GET  /api/v1/notes/{id}                 ─── ownership check:          │
│   PUT  /api/v1/notes/{id}                      note.user_id == jwt.sub  │
│   DELETE /api/v1/notes/{id}                    → 403 if mismatch        │
│   GET  /api/v1/notes/search                                             │
│   GET  /api/v1/tags                                                     │
│   POST /api/v1/tags                                                     │
│   PUT  /api/v1/tags/{id}                  ─── ownership check:          │
│   DELETE /api/v1/tags/{id}                     tag.user_id == jwt.sub   │
│                                                → 403 if mismatch        │
│   WS  /ws (STOMP)                         ─── JWT validated at          │
│       /topic/notes/{id}                        handshake                │
│       /app/notes/{id}/edit                     + note ownership         │
└─────────────────────────────────────────────────────────────────────────┘

Data-level isolation rules:
  - All DB queries filter by user_id extracted from JWT (never from request body)
  - A user can only read, write, or subscribe to their own notes
  - Tags are user-scoped: a tag created by user A cannot be applied to user B's notes
  - Refresh tokens are invalidated on logout; rotation on every use prevents replay
```

### 5.1 CORS Policy

```
Allowed Origins:   http://localhost:4200 (dev), https://notesapp.example.com (prod)
Allowed Methods:   GET, POST, PUT, DELETE, OPTIONS
Allowed Headers:   Authorization, Content-Type, X-Requested-With
Exposed Headers:   X-Total-Count (pagination)
Allow Credentials: true (required for WebSocket upgrade cookies, if used)
Max Age:           3600 seconds
```

### 5.2 Rate Limiting (Target — Phase 2)

| Endpoint | Limit | Window |
|---|---|---|
| POST /auth/login | 10 requests | per IP per minute |
| POST /auth/register | 5 requests | per IP per minute |
| POST /auth/refresh | 30 requests | per user per minute |
| All other endpoints | 300 requests | per user per minute |

---

## 6. Deployment Topology

```
Internet
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Reverse Proxy / TLS Termination (nginx or cloud LB)         │
│                                                              │
│  :443 → /api/*    →  Spring Boot :8080                       │
│  :443 → /ws       →  Spring Boot :8080 (WebSocket upgrade)   │
│  :443 → /*        →  Angular static files (nginx or CDN)     │
└──────────────────────────────────────────────────────────────┘
           │                               │
           ▼                               ▼
  ┌─────────────────┐             ┌─────────────────┐
  │  Spring Boot    │             │  Angular App    │
  │  JVM Container  │             │  Static Hosting │
  │  (Docker)       │             │  (nginx/CDN)    │
  │  :8080          │             └─────────────────┘
  └────────┬────────┘
           │ JDBC
           ▼
  ┌─────────────────┐
  │  PostgreSQL 16  │
  │  Container      │
  │  :5432          │
  └─────────────────┘
```

**Phase 2 additions**: Redis for token blocklist and WebSocket session affinity; horizontal Spring Boot pod scaling behind a load balancer.

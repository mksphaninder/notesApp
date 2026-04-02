# ADR-0001: Technology Stack Selection

## Status

Accepted — 2026-04-01

---

## Context

NotesApp is a personal and team-oriented note-taking application targeting web browsers as the primary platform, with a native iOS client planned for Phase 2. The core requirements that drove technology evaluation were:

- **Rich-text authoring**: users need more than plain Markdown — inline formatting, nested lists, embedded content blocks, and a document model that can be serialized and desynchronized across devices.
- **Real-time collaboration**: two or more users editing the same note simultaneously must see each other's changes within seconds, without full-page refreshes.
- **Full-text search**: a user with hundreds of notes needs sub-second keyword and tag-based search across note bodies, not just titles.
- **Structured tagging**: notes are organized by user-defined tags with colors; the tag graph must support efficient queries (notes by tag, tags by note).
- **Secure multi-user isolation**: each user's notes are private by default; the auth model must be stateless enough to serve a future mobile client without server-side session storage.
- **Cross-platform API reuse**: the same REST + WebSocket API must serve Angular on the web and (Phase 2) a Swift iOS app without two separate backend codebases.
- **Operational simplicity**: a small team should be able to deploy, migrate, and monitor the stack without specialist DevOps expertise.

The evaluation process compared several candidate stacks and ran proof-of-concept prototypes for rich-text sync and full-text search before finalizing choices.

---

## Decision

The following technologies were selected:

| Layer | Choice |
|---|---|
| Frontend framework | Angular 21 (Standalone Components + Signals) |
| Rich-text editor | TipTap 2 (ProseMirror-based) |
| Frontend state | Angular Signals (no NgRx) |
| Backend framework | Spring Boot 4 on Java 25 |
| Backend persistence | PostgreSQL 16 |
| Authentication | JWT (access + refresh token pair) |
| Real-time transport | STOMP over WebSocket (Spring WebSocket) |
| Database migrations | Flyway |
| iOS (Phase 2) | Native Swift — same REST/WS API |

---

## Rationale

### Angular 21

Angular was chosen over React 19 and Vue 3 for three reasons. First, Angular's opinionated structure (modules, DI, typed forms, built-in HTTP client) reduces architectural decision fatigue on a small team — every developer knows where routing, services, and interceptors live. Second, Angular 21's Signals-based reactivity model provides fine-grained change detection without the boilerplate of Redux-style stores, making real-time note updates straightforward to propagate through the UI. Third, Angular's strong TypeScript-first approach makes the OpenAPI-generated client types useful without extra configuration layers. React was considered but its lack of built-in conventions for dependency injection and HTTP would require adopting additional libraries (TanStack Query, Zustand) that add fragmentation.

### Spring Boot 4 / Java 25

Spring Boot 4 running on Java 25 (virtual threads via Project Loom, stable since Java 21) was chosen over Node.js/Express and Quarkus. Spring Boot's mature ecosystem covers WebSocket/STOMP, JPA/Hibernate, Spring Security, and Flyway integration out of the box — the alternative stacks would require individually vetting and wiring separate libraries. Java 25 virtual threads allow high-concurrency WebSocket handling without the callback-pyramid complexity of Node.js async patterns. Spring Security's JWT filter chain is well-documented and integrates naturally with the role-based access model needed for future team notes. Quarkus was considered as a lighter alternative but its smaller community for Spring-ecosystem libraries (notably Spring Data JPA) and steeper learning curve for new contributors made it a lower-priority choice.

### PostgreSQL 16

PostgreSQL was chosen over MongoDB and MySQL for four specific capabilities required by this application. First, `JSONB` columns allow the ProseMirror document structure to be stored natively without a separate document store, while still supporting indexed queries into the JSON tree. Second, PostgreSQL's `tsvector` / `tsquery` full-text search eliminates the need for an external search service (Elasticsearch) at the current scale. Third, relational integrity (foreign keys, composite primary keys on `note_tags`) enforces data consistency at the database layer rather than relying entirely on application code. Fourth, PostgreSQL 16's logical replication support keeps future scaling options open. MongoDB was evaluated but its lack of native ACID transactions across collections made the `notes ↔ tags` relationship harder to enforce; it also would have required a separate FTS solution.

### TipTap 2 (over Quill, Slate, ProseMirror raw)

TipTap was chosen as the rich-text editor because it provides a production-ready, ProseMirror-based component with an Angular integration (`@tiptap/angular`), a clean extension API, and a well-defined JSON document model (ProseMirror `doc` JSON) that maps directly to the `content` JSONB column in PostgreSQL. Quill was ruled out because its internal data model (Delta format) does not cleanly represent nested document structures (tables, code blocks with inline marks) and its Angular wrapper is a community port with limited maintenance. Raw ProseMirror was considered for maximum flexibility but would require building the entire toolbar, extension, and collaboration plugin layer from scratch — a significant investment for a feature that TipTap already covers. Slate.js was evaluated but lacks a maintained Angular binding and its React-centric model would force a hybrid rendering approach.

### JWT Access + Refresh Token Pair (over server-side sessions)

Stateless JWT authentication was chosen over cookie-session (express-session / Spring Session) and OAuth2 delegation-only approaches. The primary driver is the Phase 2 iOS requirement: a native Swift app cannot share server-managed session cookies across domains in the same way a browser can, making a Bearer token model the natural fit. The chosen implementation issues short-lived access tokens (15 minutes) paired with long-lived refresh tokens stored as hashed values in the `refresh_tokens` table — this limits the blast radius of a leaked access token while maintaining usability. Spring Security's `JwtAuthenticationFilter` validates access tokens on every request without a database hit. Refresh tokens are rotated on each use (refresh token rotation), mitigating theft scenarios. Pure OAuth2 (via an external IdP) was considered but adds operational dependency on a third-party service that is not required for the current single-tenant scope.

### STOMP over WebSocket (over raw WebSocket, SSE, Socket.IO)

STOMP (Simple Text Oriented Messaging Protocol) over WebSocket, provided by Spring's `spring-websocket`, was chosen over raw WebSocket and Server-Sent Events for real-time note sync. Raw WebSocket was ruled out because it provides no pub/sub routing — every client message would require custom dispatch logic on both the server and client side. Server-Sent Events were evaluated as a simpler alternative but are unidirectional (server-to-client only), which prevents the client from pushing edit operations back through the same channel. Socket.IO was considered but introduces a Node.js-centric ecosystem dependency that conflicts with the Java backend; its binary protocol also requires a matching client library version to be pinned. STOMP gives a topic-based subscription model (`/topic/notes/{id}`) that maps naturally to note rooms, and the `@stomp/stompjs` Angular client library is well-maintained with Signals-compatible RxJS interop.

### Angular Signals (over NgRx)

Angular Signals (introduced in Angular 17, matured in Angular 21) were chosen over NgRx for local state management. NgRx's Redux architecture (actions → reducers → effects → selectors) is appropriate for large teams working on enterprise applications where strict data-flow tracing is necessary. For a two-to-four developer team building a focused notes app, NgRx introduces significant boilerplate (one action file, one reducer, one effect, one selector per feature) that slows iteration without a proportional benefit. Angular Signals provide computed state derivation, effect-based side effects, and template binding with zero external dependencies. Real-time WebSocket events can update signals directly in a service, and the UI reacts automatically — the pattern is simpler to debug and onboard new contributors to.

---

## Consequences

### What becomes easier

- **API reuse**: the Spring Boot REST + STOMP API is consumed identically by Angular and the future iOS client. No GraphQL or BFF layer is needed at this scale.
- **FTS without Elasticsearch**: PostgreSQL `tsvector` search covers current scale without operating an additional service. The `search_vector` column is updated via a PostgreSQL trigger and an index on it keeps queries fast.
- **Schema evolution**: Flyway versioned migrations give a complete, auditable history of every schema change. Rolling back a deployment means reverting a migration file and replaying.
- **Type safety end-to-end**: The OpenAPI specification is the source of truth; Angular generates typed HTTP clients and Java generates request/response DTOs from the same YAML.
- **Testability**: Spring Boot's test slice annotations (`@WebMvcTest`, `@DataJpaTest`) allow unit-testing each layer in isolation. Angular's TestBed with Signals works without a store mock.

### What becomes harder

- **Optimistic concurrency**: the STOMP broadcast model sends full note patches to all subscribers. Without Operational Transformation (OT) or CRDTs, simultaneous edits to the same paragraph can produce last-write-wins conflicts. This is an accepted limitation for the current phase; Yjs CRDT integration is planned for Phase 3.
- **Token revocation**: because access tokens are stateless JWTs, revoking an access token before its 15-minute expiry requires either a blocklist (Redis) or waiting for expiry. The current design accepts this risk given the short expiry window; a Redis blocklist is a Phase 2 addition.
- **iOS TipTap parity**: the Angular TipTap editor stores ProseMirror JSON in the `content` JSONB column. The iOS client must either render ProseMirror JSON (via a WKWebView TipTap embed) or implement its own renderer. This is a known Phase 2 design challenge.
- **PostgreSQL JSONB query complexity**: filtering notes by content of nested ProseMirror nodes requires `jsonb_path_query` expressions, which are less readable than a purpose-built document store query API.
- **Angular bundle size**: Angular 21 tree-shaking has improved, but a full TipTap installation with extensions adds ~150 KB gzipped to the initial bundle. Lazy-loading the editor module mitigates this for list/search views.

---

## Alternatives Considered

| Layer | Chosen | Alternative | Reason Rejected |
|---|---|---|---|
| Frontend | Angular 21 | React 19 | No built-in DI, HTTP client, or forms — requires additional library choices per developer preference |
| Frontend | Angular 21 | Vue 3 | Smaller enterprise ecosystem; TypeScript integration less mature for large codebases |
| Rich text | TipTap 2 | Quill | Delta model limits nested structures; Angular wrapper poorly maintained |
| Rich text | TipTap 2 | Raw ProseMirror | Full editor/toolbar build required — weeks of undifferentiated work |
| State | Signals | NgRx | Excessive boilerplate for team size and app scope |
| Backend | Spring Boot 4 | Node.js + Express | Callback complexity with high-concurrency WS; no type-safe DI out of the box |
| Backend | Spring Boot 4 | Quarkus | Smaller Spring-ecosystem library support; steeper learning curve |
| Database | PostgreSQL 16 | MongoDB | No ACID cross-collection transactions; requires separate FTS service |
| Database | PostgreSQL 16 | MySQL 8 | Weaker JSONB support; no native `tsvector` FTS |
| Auth | JWT pair | Spring Session (cookies) | Cannot share session cookies with iOS native client |
| Auth | JWT pair | External OAuth2 IdP | Adds operational dependency; over-engineered for single-tenant scope |
| Real-time | STOMP/WS | Raw WebSocket | No pub/sub routing; requires custom dispatch logic |
| Real-time | STOMP/WS | Server-Sent Events | Unidirectional; cannot receive client edits |
| Real-time | STOMP/WS | Socket.IO | Node.js-centric; binary protocol requires pinned client library |
| Migrations | Flyway | Liquibase | Both are valid; Flyway's SQL-first approach is simpler to review and audit |

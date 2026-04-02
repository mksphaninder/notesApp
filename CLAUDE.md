# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

Monorepo with two top-level packages:

```
NotesApp/
├── frontend/        # Angular app (web client)
├── backend/         # Java Spring Boot REST API + WebSocket server
├── docker-compose.yml
└── CLAUDE.md
```

## Local Development

### Prerequisites
- Docker + Docker Compose (for PostgreSQL)
- Java 21+
- Node 20+ / npm
- Angular CLI: `npm install -g @angular/cli`

### Start the database
```bash
docker-compose up -d
```

### Run the backend
```bash
cd backend
./mvnw spring-boot:run
```

### Run the frontend
```bash
cd frontend
npm install
ng serve
```

Frontend: http://localhost:4200  
Backend API: http://localhost:8080/api/v1  
WebSocket: ws://localhost:8080/ws

### Run backend tests
```bash
cd backend
./mvnw test                          # all tests
./mvnw test -Dtest=NoteServiceTest   # single test class
```

### Run frontend tests
```bash
cd frontend
ng test                              # all tests (Karma)
ng test --include="**/note*"         # filtered
```

## Architecture

### Backend (Spring Boot 3 / Java 21)

- **Entry point:** `backend/src/main/java/com/notesapp/`
- **Layer structure:** `controller → service → repository → entity`
- **Auth:** Spring Security + JWT. Every request (except `/api/v1/auth/**`) requires a valid Bearer token. JWT filter is in `security/JwtAuthFilter.java`.
- **Real-time:** STOMP over WebSocket. Clients subscribe to `/topic/notes/{noteId}` for live updates. Config in `config/WebSocketConfig.java`.
- **API versioning:** All REST endpoints are prefixed `/api/v1/`. Do not break this — iOS Phase 2 reuses the same API.
- **Tests:** Use TestContainers for integration tests (real PostgreSQL, not H2). Unit tests mock the repository layer.

### Frontend (Angular 17+)

- **Standalone components** — no NgModules.
- **Auth flow:** `AuthService` stores JWT in `localStorage`, `JwtInterceptor` attaches it to every HTTP request, `AuthGuard` protects note routes.
- **Rich text:** TipTap editor, content stored as ProseMirror JSON in the backend. Markdown import/export handled server-side.
- **Real-time:** `WebSocketService` wraps STOMP client, subscribed per open note.
- **State:** Angular Signals for local UI state; no external state library.

### Database (PostgreSQL)

- Schema managed by **Flyway** migrations in `backend/src/main/resources/db/migration/`.
- Never edit existing migration files — always add a new `V{n}__description.sql`.
- Full-text search uses PostgreSQL native `tsvector` — no Elasticsearch needed.

## Key Design Decisions

- **Rich text format:** ProseMirror JSON (from TipTap). Raw markdown is a derived format, converted server-side.
- **Real-time conflict strategy:** Last-write-wins in Phase 1, arbitrated by server timestamp. OT/CRDT is Phase 2+ consideration.
- **Auth tokens:** Access token (15 min) + refresh token (7 days), both JWT. Refresh token stored in HttpOnly cookie.
- **Tags:** Many-to-many between `notes` and `tags` tables, scoped per user.

# GitHub Copilot Instructions — NotesApp

## Project Overview
Real-time rich-text notes app. Angular 21 frontend, Spring Boot 4 / Java 25 backend, PostgreSQL 16 database. iOS Phase 2 will reuse the same backend API.

## Architecture
- **Backend layers:** `controller → service → repository → entity`
- **Frontend structure:** `core/` (singletons), `features/auth/`, `features/notes/`, `shared/`
- **Auth:** Spring Security + JWT. Bearer token on every request except `/api/v1/auth/**`
- **Real-time:** STOMP over WebSocket. Subscribe to `/topic/notes/{noteId}`
- **Rich text:** TipTap editor, stored as ProseMirror JSON (JSONB column), markdown is derived

## Critical Rules

### Always
- Prefix all REST endpoints with `/api/v1/`
- Use TestContainers (not H2) for backend integration tests
- Create new Flyway migration files — never edit existing ones
- Use Angular Signals for component state

### Never
- Store rich text as HTML — always ProseMirror JSON
- Use NgModules — standalone components only
- Put business logic in controllers — it belongs in services
- Break the `/api/v1/` contract — iOS depends on it

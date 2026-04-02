# Data Model — NotesApp

**Version**: 1.0  
**Date**: 2026-04-01  
**Database**: PostgreSQL 16  
**Migration Tool**: Flyway  

---

## Table of Contents

1. [Entity-Relationship Diagram](#1-entity-relationship-diagram)
2. [Table Definitions](#2-table-definitions)
3. [Index Strategy](#3-index-strategy)
4. [Flyway Migration Plan](#4-flyway-migration-plan)
5. [Design Notes and Constraints](#5-design-notes-and-constraints)

---

## 1. Entity-Relationship Diagram

```
┌──────────────────────────────┐
│           users              │
├──────────────────────────────┤
│ PK  id           UUID        │
│     email        TEXT        │◄──────────────────────────────┐
│     password_hash TEXT       │                               │
│     display_name TEXT        │                               │
│     created_at   TIMESTAMPTZ │                               │
│     updated_at   TIMESTAMPTZ │                               │
└──────────────────────────────┘                               │
         │                    │                               │
         │ 1                  │ 1                             │
         │                    │                               │
         ▼ N                  ▼ N                             │ N
┌─────────────────────┐  ┌──────────────────────────────────────────────┐
│   refresh_tokens    │  │                  notes                       │
├─────────────────────┤  ├──────────────────────────────────────────────┤
│ PK  id    UUID      │  │ PK  id           UUID                        │
│ FK  user_id → users │  │ FK  user_id → users                          │
│     token_hash TEXT │  │     title        TEXT                        │
│     expires_at TS   │  │     content      JSONB  (ProseMirror doc)    │
│     revoked   BOOL  │  │     content_text TEXT   (plain text extract) │
│     created_at TS   │  │     search_vector TSVECTOR                   │
└─────────────────────┘  │     created_at   TIMESTAMPTZ                 │
                         │     updated_at   TIMESTAMPTZ                 │
                         └──────────────────────────────────────────────┘
                                           │
                                           │ N
                                           │
                                           ▼ N
                         ┌──────────────────────────────────────────────┐
                         │               note_tags (join)               │
                         ├──────────────────────────────────────────────┤
                         │ FK  note_id → notes                          │
                         │ FK  tag_id  → tags                           │
                         │ PK  (note_id, tag_id)                        │
                         └──────────────────────────────────────────────┘
                                           │
                                           │ N
                                           ▼ 1
                         ┌──────────────────────────────────────────────┐
                         │                  tags                        │
                         ├──────────────────────────────────────────────┤
                         │ PK  id       UUID                            │
                         │ FK  user_id → users                          │
                         │     name     TEXT                            │
                         │     color    CHAR(7)  (hex: #RRGGBB)         │
                         │     created_at TIMESTAMPTZ                   │
                         └──────────────────────────────────────────────┘
```

**Cardinalities**:
- One `users` row → many `notes`
- One `users` row → many `tags`
- One `users` row → many `refresh_tokens`
- One `notes` row ↔ many `tags` rows (through `note_tags`)
- One `tags` row ↔ many `notes` rows (through `note_tags`)

---

## 2. Table Definitions

### 2.1 `users`

Stores authenticated user accounts. Passwords are hashed with bcrypt (cost factor 12). The `email` column has a unique index enforced at both the DB and application layer.

```
Column           Type             Nullable    Constraint / Default
──────────────   ──────────────   ─────────   ───────────────────────────────────────
id               UUID             NOT NULL    PRIMARY KEY, DEFAULT gen_random_uuid()
email            TEXT             NOT NULL    UNIQUE
password_hash    TEXT             NOT NULL
display_name     TEXT             NOT NULL
created_at       TIMESTAMPTZ      NOT NULL    DEFAULT now()
updated_at       TIMESTAMPTZ      NOT NULL    DEFAULT now()
```

**Triggers**:
- `set_users_updated_at` — `BEFORE UPDATE` trigger sets `updated_at = now()` automatically.

**Indexes**:
```sql
CREATE UNIQUE INDEX idx_users_email ON users(email);
```

---

### 2.2 `refresh_tokens`

Stores hashed refresh tokens. The raw token is never persisted — only the SHA-256 hash. Tokens are rotated on every use: when a valid refresh request arrives, the current row is marked `revoked = true` and a new row is inserted. This prevents replay attacks.

```
Column           Type             Nullable    Constraint / Default
──────────────   ──────────────   ─────────   ───────────────────────────────────────
id               UUID             NOT NULL    PRIMARY KEY, DEFAULT gen_random_uuid()
user_id          UUID             NOT NULL    FOREIGN KEY → users(id) ON DELETE CASCADE
token_hash       TEXT             NOT NULL    UNIQUE
expires_at       TIMESTAMPTZ      NOT NULL
revoked          BOOLEAN          NOT NULL    DEFAULT false
created_at       TIMESTAMPTZ      NOT NULL    DEFAULT now()
```

**Indexes**:
```sql
CREATE UNIQUE INDEX idx_refresh_tokens_hash   ON refresh_tokens(token_hash);
CREATE        INDEX idx_refresh_tokens_user   ON refresh_tokens(user_id);
CREATE        INDEX idx_refresh_tokens_expiry ON refresh_tokens(expires_at)
              WHERE revoked = false;
```

**Maintenance**:
A scheduled job (Spring `@Scheduled` or pg_cron) should `DELETE FROM refresh_tokens WHERE expires_at < now() OR revoked = true` to keep the table small.

---

### 2.3 `notes`

The core entity. `content` stores the full ProseMirror document as JSONB. `content_text` is a denormalized plain-text extraction used to populate `search_vector`. Both `content_text` and `search_vector` are maintained by the application on every create/update (not by a DB trigger, to keep migration complexity low).

```
Column           Type             Nullable    Constraint / Default
──────────────   ──────────────   ─────────   ───────────────────────────────────────
id               UUID             NOT NULL    PRIMARY KEY, DEFAULT gen_random_uuid()
user_id          UUID             NOT NULL    FOREIGN KEY → users(id) ON DELETE CASCADE
title            TEXT             NOT NULL    DEFAULT ''
content          JSONB            NOT NULL    DEFAULT '{"type":"doc","content":[]}'
content_text     TEXT             NOT NULL    DEFAULT ''
search_vector    TSVECTOR         NOT NULL    DEFAULT ''
created_at       TIMESTAMPTZ      NOT NULL    DEFAULT now()
updated_at       TIMESTAMPTZ      NOT NULL    DEFAULT now()
```

**ProseMirror JSON structure** (stored in `content`):

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Hello, " },
        { "type": "text", "text": "world", "marks": [{ "type": "bold" }] }
      ]
    },
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [{ "type": "text", "text": "Section Title" }]
    }
  ]
}
```

**`search_vector` construction** (in Java service layer before persist):

```sql
-- Equivalent SQL for reference — executed via JPA native query
UPDATE notes
SET search_vector = to_tsvector('english',
    coalesce(title, '') || ' ' || coalesce(content_text, ''))
WHERE id = :id;
```

**Indexes**:
```sql
CREATE INDEX idx_notes_user_id       ON notes(user_id);
CREATE INDEX idx_notes_search_vector ON notes USING GIN(search_vector);
CREATE INDEX idx_notes_updated_at    ON notes(user_id, updated_at DESC);
CREATE INDEX idx_notes_content_jsonb ON notes USING GIN(content jsonb_path_ops);
```

---

### 2.4 `tags`

User-defined labels. Each tag belongs to exactly one user. The `color` column stores a 7-character hex color string (e.g., `#4A90E2`). Tag names are case-sensitive and unique per user.

```
Column           Type             Nullable    Constraint / Default
──────────────   ──────────────   ─────────   ───────────────────────────────────────
id               UUID             NOT NULL    PRIMARY KEY, DEFAULT gen_random_uuid()
user_id          UUID             NOT NULL    FOREIGN KEY → users(id) ON DELETE CASCADE
name             TEXT             NOT NULL
color            CHAR(7)          NOT NULL    DEFAULT '#6B7280'
created_at       TIMESTAMPTZ      NOT NULL    DEFAULT now()
```

**Unique constraint**: `(user_id, name)` — a user cannot have two tags with the same name.

**Indexes**:
```sql
CREATE UNIQUE INDEX idx_tags_user_name ON tags(user_id, name);
CREATE        INDEX idx_tags_user_id   ON tags(user_id);
```

**Validation** (application layer):
- `color` must match the regex `^#[0-9A-Fa-f]{6}$`.
- `name` must be 1–50 characters, trimmed.

---

### 2.5 `note_tags`

Pure join table. No surrogate key — the composite primary key `(note_id, tag_id)` enforces uniqueness. Both foreign keys cascade on delete so that deleting a note or tag automatically cleans up the association.

```
Column           Type             Nullable    Constraint / Default
──────────────   ──────────────   ─────────   ───────────────────────────────────────
note_id          UUID             NOT NULL    FOREIGN KEY → notes(id) ON DELETE CASCADE
tag_id           UUID             NOT NULL    FOREIGN KEY → tags(id) ON DELETE CASCADE
                                              PRIMARY KEY (note_id, tag_id)
```

**Indexes**:
```sql
-- The PK index covers (note_id, tag_id) lookups
-- Add reverse index for "all notes for a tag" queries
CREATE INDEX idx_note_tags_tag_id ON note_tags(tag_id);
```

---

## 3. Index Strategy

The following table summarizes every non-trivial index with the query it supports and the justification for its inclusion.

| Index | Type | Table | Columns | Supports Query | Justification |
|---|---|---|---|---|---|
| `idx_users_email` | UNIQUE B-Tree | users | `email` | `SELECT * FROM users WHERE email = ?` (login, register dupe check) | Equality lookup on login — must be O(log n) |
| `idx_refresh_tokens_hash` | UNIQUE B-Tree | refresh_tokens | `token_hash` | Token validation on refresh | Token lookup must be fast; uniqueness prevents hash collision inserts |
| `idx_refresh_tokens_user` | B-Tree | refresh_tokens | `user_id` | `SELECT * FROM refresh_tokens WHERE user_id = ?` (logout all sessions) | Needed when revoking all tokens for a user |
| `idx_refresh_tokens_expiry` | Partial B-Tree | refresh_tokens | `expires_at` WHERE `revoked = false` | Cleanup job; find next-to-expire active tokens | Partial index is smaller than full; only active tokens need expiry range scan |
| `idx_notes_user_id` | B-Tree | notes | `user_id` | All note list queries (base filter) | Every user-scoped query starts with `WHERE user_id = ?` |
| `idx_notes_search_vector` | GIN | notes | `search_vector` | `WHERE search_vector @@ plainto_tsquery(?)` | GIN required for tsvector `@@` operator; B-Tree cannot serve this |
| `idx_notes_updated_at` | B-Tree | notes | `(user_id, updated_at DESC)` | Default list sort by most recently updated | Composite index avoids a table scan + sort; user_id leading column aligns with base filter |
| `idx_notes_content_jsonb` | GIN (jsonb_path_ops) | notes | `content` | `content @? '$.content[*].text'` style JSONB path queries | Optional — only useful if future features query inside the ProseMirror JSON structure |
| `idx_tags_user_name` | UNIQUE B-Tree | tags | `(user_id, name)` | Tag name uniqueness check + tag lookup by name | Composite unique enforces business rule; also covers tag list queries |
| `idx_tags_user_id` | B-Tree | tags | `user_id` | `SELECT * FROM tags WHERE user_id = ?` (tag list endpoint) | User tag list query |
| `idx_note_tags_tag_id` | B-Tree | note_tags | `tag_id` | `SELECT note_id FROM note_tags WHERE tag_id = ?` (notes by tag) | Without this, filtering notes by tag requires a full note_tags scan |

**Index maintenance**: VACUUM ANALYZE should run on `notes` after bulk imports. The GIN index on `search_vector` is auto-maintained by PostgreSQL on `INSERT`/`UPDATE` to `notes`.

---

## 4. Flyway Migration Plan

All migrations live in `src/main/resources/db/migration/`. Flyway uses versioned migrations (`V<version>__<description>.sql`). Migration versions are integers; the `__` separator (double underscore) precedes the description.

```
src/main/resources/db/migration/
├── V1__create_users_table.sql
├── V2__create_refresh_tokens_table.sql
├── V3__create_notes_table.sql
├── V4__create_tags_table.sql
├── V5__create_note_tags_table.sql
├── V6__create_indexes.sql
├── V7__add_users_updated_at_trigger.sql
└── V8__add_notes_updated_at_trigger.sql
```

### V1 — Create users table

```sql
-- V1__create_users_table.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id            UUID         NOT NULL DEFAULT gen_random_uuid(),
    email         TEXT         NOT NULL,
    password_hash TEXT         NOT NULL,
    display_name  TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email)
);
```

### V2 — Create refresh_tokens table

```sql
-- V2__create_refresh_tokens_table.sql
CREATE TABLE refresh_tokens (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,
    token_hash  TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_refresh_tokens PRIMARY KEY (id),
    CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### V3 — Create notes table

```sql
-- V3__create_notes_table.sql
CREATE TABLE notes (
    id             UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL,
    title          TEXT        NOT NULL DEFAULT '',
    content        JSONB       NOT NULL DEFAULT '{"type":"doc","content":[]}',
    content_text   TEXT        NOT NULL DEFAULT '',
    search_vector  TSVECTOR    NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_notes PRIMARY KEY (id),
    CONSTRAINT fk_notes_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### V4 — Create tags table

```sql
-- V4__create_tags_table.sql
CREATE TABLE tags (
    id         UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL,
    name       TEXT        NOT NULL,
    color      CHAR(7)     NOT NULL DEFAULT '#6B7280',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_tags PRIMARY KEY (id),
    CONSTRAINT uq_tags_user_name UNIQUE (user_id, name),
    CONSTRAINT fk_tags_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### V5 — Create note_tags join table

```sql
-- V5__create_note_tags_table.sql
CREATE TABLE note_tags (
    note_id UUID NOT NULL,
    tag_id  UUID NOT NULL,
    CONSTRAINT pk_note_tags PRIMARY KEY (note_id, tag_id),
    CONSTRAINT fk_note_tags_note
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    CONSTRAINT fk_note_tags_tag
        FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
);
```

### V6 — Create indexes

```sql
-- V6__create_indexes.sql

-- users
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- refresh_tokens
CREATE UNIQUE INDEX idx_refresh_tokens_hash
    ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_user
    ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expiry
    ON refresh_tokens(expires_at)
    WHERE revoked = false;

-- notes
CREATE INDEX idx_notes_user_id
    ON notes(user_id);
CREATE INDEX idx_notes_search_vector
    ON notes USING GIN(search_vector);
CREATE INDEX idx_notes_updated_at
    ON notes(user_id, updated_at DESC);

-- tags
CREATE UNIQUE INDEX idx_tags_user_name
    ON tags(user_id, name);
CREATE INDEX idx_tags_user_id
    ON tags(user_id);

-- note_tags
CREATE INDEX idx_note_tags_tag_id
    ON note_tags(tag_id);
```

### V7 — Add updated_at trigger for users

```sql
-- V7__add_users_updated_at_trigger.sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### V8 — Add updated_at trigger for notes

```sql
-- V8__add_notes_updated_at_trigger.sql
CREATE TRIGGER set_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 5. Design Notes and Constraints

### 5.1 ProseMirror JSON in JSONB

The `content` column stores the ProseMirror `doc` node as JSONB. The choice of JSONB over TEXT has three benefits:
1. PostgreSQL can validate that `content` is well-formed JSON on insert.
2. JSONB path queries (`@?`, `@@`) can be used for future content-aware searches (e.g., find notes with a specific heading text).
3. JSONB storage is slightly more compact than escaped TEXT for typical document sizes.

The trade-off is that JSONB strips insignificant whitespace and reorders object keys, which is acceptable for ProseMirror documents (key order is not semantic).

### 5.2 content_text Denormalization

`content_text` is a plain-text extraction of all text nodes in the ProseMirror tree, stored alongside `content`. It serves two purposes:
- Building the `search_vector` (tsvector cannot be computed directly from JSONB without a custom function).
- Future snippet generation (returning the first N characters of note content in list views without deserializing JSONB).

The application service layer is responsible for keeping `content_text` in sync with `content` on every write. A `CHECK` constraint is intentionally omitted to avoid locking during updates.

### 5.3 UUID Primary Keys

All primary keys use `UUID` (`gen_random_uuid()` from `pgcrypto`). The reasons:
- UUIDs allow the client to generate IDs optimistically (useful for offline-first Phase 2 iOS support).
- No sequential integer leakage (a user cannot infer how many notes exist from an ID).
- Distributed IDs are safe if the database is eventually sharded.

The downside is slightly larger index size vs. `BIGINT`. At the expected note volume (tens of thousands per user), this is negligible.

### 5.4 Cascade Delete Behavior

| Parent deleted | Child table | Cascade behavior |
|---|---|---|
| `users` | `notes` | `ON DELETE CASCADE` — all user notes deleted |
| `users` | `tags` | `ON DELETE CASCADE` — all user tags deleted |
| `users` | `refresh_tokens` | `ON DELETE CASCADE` — all sessions revoked |
| `notes` | `note_tags` | `ON DELETE CASCADE` — tag associations removed |
| `tags` | `note_tags` | `ON DELETE CASCADE` — tag associations removed (note preserved) |

User deletion is a destructive operation and should be confirmed by the application layer before execution. A soft-delete pattern (adding a `deleted_at` column to `users`) can be added in a future migration if GDPR right-to-erasure workflows require a grace period.

### 5.5 Timezone Handling

All timestamp columns are `TIMESTAMPTZ` (timestamp with time zone), stored as UTC. The application layer (Spring Boot) always passes `java.time.Instant` values; the JDBC driver converts to PostgreSQL `TIMESTAMPTZ` automatically. API responses serialize timestamps as ISO-8601 strings with `Z` suffix.

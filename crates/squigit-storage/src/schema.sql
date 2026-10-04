CREATE TABLE profiles (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar_base64 TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    UNIQUE (provider, issuer, subject)
) STRICT;

CREATE TABLE encrypted_keys (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('openrouter', 'imgbb')),
    cipher TEXT NOT NULL CHECK (cipher = 'aes-256-gcm'),
    width INTEGER NOT NULL CHECK (width >= 0),
    kdf TEXT NOT NULL CHECK (kdf = 'hkdf-sha256'),
    salt TEXT NOT NULL,
    nonce TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    PRIMARY KEY (profile_id, provider)
) STRICT;

CREATE TABLE workspaces (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    position INTEGER NOT NULL UNIQUE
) STRICT;

CREATE TABLE workspace_directories (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    path TEXT NOT NULL,
    PRIMARY KEY (workspace_id, position)
) STRICT;

CREATE TABLE conversations (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('thread', 'sidechat')),
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    image_hash TEXT,
    original_image_hash TEXT,
    image_blob TEXT,
    pinned_at TEXT,
    fork_family_id TEXT NOT NULL,
    fork_version INTEGER NOT NULL CHECK (fork_version > 0),
    CHECK (kind = 'thread' OR workspace_id IS NULL)
) STRICT;

CREATE INDEX conversations_workspace ON conversations(workspace_id, kind);
CREATE INDEX conversations_updated ON conversations(updated_at);

CREATE TABLE fork_families (
    kind TEXT NOT NULL CHECK (kind IN ('thread', 'sidechat')),
    id TEXT NOT NULL,
    base_title TEXT NOT NULL,
    last_version INTEGER NOT NULL CHECK (last_version > 0),
    PRIMARY KEY (kind, id)
) STRICT;

CREATE TABLE messages (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    attachments_json TEXT CHECK (attachments_json IS NULL OR json_valid(attachments_json)),
    text_citations_json TEXT CHECK (text_citations_json IS NULL OR json_valid(text_citations_json)),
    message_context_json TEXT CHECK (message_context_json IS NULL OR json_valid(message_context_json)),
    citations_json TEXT CHECK (citations_json IS NULL OR json_valid(citations_json)),
    grounding_json TEXT CHECK (grounding_json IS NULL OR json_valid(grounding_json)),
    error_json TEXT CHECK (error_json IS NULL OR json_valid(error_json)),
    forked_from_json TEXT CHECK (forked_from_json IS NULL OR json_valid(forked_from_json)),
    PRIMARY KEY (conversation_id, id),
    UNIQUE (conversation_id, position)
) STRICT;

CREATE TABLE conversation_context (
    conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tokens_used INTEGER NOT NULL CHECK (tokens_used >= 0),
    compacted_at TEXT,
    compacted_context TEXT
) STRICT;

CREATE TABLE conversation_attachments (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    attachment_hash TEXT NOT NULL,
    position INTEGER NOT NULL,
    display_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('image', 'document', 'video', 'audio')),
    file_brief TEXT,
    last_mention_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, attachment_hash),
    UNIQUE (conversation_id, position)
) STRICT;

CREATE TABLE ocr_results (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    scanned_at TEXT,
    regions_json TEXT NOT NULL CHECK (json_valid(regions_json)),
    PRIMARY KEY (conversation_id, model_id)
) STRICT;

PRAGMA user_version = 1;

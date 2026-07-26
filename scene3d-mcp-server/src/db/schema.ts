// SQLite table definitions — mirror Python history_models.py exactly
// All table names use the scene3d_ prefix to match the existing DeerFlow schema.

export const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS scene3d_chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    user_id TEXT,
    title TEXT NOT NULL DEFAULT '新对话',
    messages_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_chat_sessions_session_id ON scene3d_chat_sessions(session_id)`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_chat_sessions_user_id ON scene3d_chat_sessions(user_id)`,

  `CREATE TABLE IF NOT EXISTS scene3d_scene_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id TEXT NOT NULL UNIQUE,
    session_id TEXT,
    user_id TEXT,
    description TEXT NOT NULL,
    quality TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'processing',
    model_url TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_scene_history_scene_id ON scene3d_scene_history(scene_id)`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_scene_history_session_id ON scene3d_scene_history(session_id)`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_scene_history_user_id ON scene3d_scene_history(user_id)`,

  `CREATE TABLE IF NOT EXISTS scene3d_object_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id TEXT NOT NULL DEFAULT 'individual_object',
    session_id TEXT,
    object_id TEXT NOT NULL,
    object_name TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    model_url TEXT,
    local_path TEXT,
    width_cm REAL,
    height_cm REAL,
    depth_cm REAL,
    file_size_bytes INTEGER,
    format TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_object_records_scene_id ON scene3d_object_records(scene_id)`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_object_records_session_id ON scene3d_object_records(session_id)`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_object_records_object_id ON scene3d_object_records(object_id)`,

  `CREATE TABLE IF NOT EXISTS scene3d_asset_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES scene3d_asset_categories(id) ON DELETE SET NULL,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(parent_id, name)
  )`,

  `CREATE TABLE IF NOT EXISTS scene3d_asset_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS scene3d_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    asset_type TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'user_upload',
    file_format TEXT,
    file_size_bytes INTEGER,
    file_path TEXT,
    thumbnail_url TEXT,
    category_id INTEGER REFERENCES scene3d_asset_categories(id) ON DELETE SET NULL,
    license TEXT,
    user_id TEXT,
    downloads_count INTEGER NOT NULL DEFAULT 0,
    prompt TEXT,
    meta_json TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    version TEXT NOT NULL DEFAULT '1.0',
    source TEXT,
    source_id TEXT,
    source_url TEXT,
    author TEXT,
    tags_csv TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_assets_asset_id ON scene3d_assets(asset_id)`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_assets_asset_type ON scene3d_assets(asset_type)`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_assets_user_id ON scene3d_assets(user_id)`,

  `CREATE TABLE IF NOT EXISTS scene3d_asset_tag_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id TEXT NOT NULL REFERENCES scene3d_assets(asset_id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES scene3d_asset_tags(id) ON DELETE CASCADE,
    UNIQUE(asset_id, tag_id)
  )`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_asset_tag_relations_asset_id ON scene3d_asset_tag_relations(asset_id)`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_asset_tag_relations_tag_id ON scene3d_asset_tag_relations(tag_id)`,

  `CREATE TABLE IF NOT EXISTS scene3d_scene_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id TEXT NOT NULL,
    asset_id TEXT NOT NULL REFERENCES scene3d_assets(asset_id) ON DELETE CASCADE,
    position_x REAL,
    position_y REAL,
    position_z REAL,
    rotation_x REAL,
    rotation_y REAL,
    rotation_z REAL,
    scale_x REAL,
    scale_y REAL,
    scale_z REAL,
    created_at TEXT NOT NULL,
    UNIQUE(scene_id, asset_id)
  )`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_scene_assets_scene_id ON scene3d_scene_assets(scene_id)`,
  `CREATE INDEX IF NOT EXISTS ix_scene3d_scene_assets_asset_id ON scene3d_scene_assets(asset_id)`,
];

// Asset type and provider choices (same as Python)
export const ASSET_TYPE_CHOICES = [
  "model_static", "model_skeletal", "scene", "texture", "material",
  "hdri", "animation", "vfx", "sfx", "music", "voice", "icon",
  "ui", "concept", "blueprint", "prefab",
] as const;

export const ASSET_PROVIDER_CHOICES = [
  "hunyuan3d", "meshy", "tripo3d", "sketchfab",
  "user_upload", "external_import",
] as const;

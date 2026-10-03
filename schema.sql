PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY, owner_token TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', visibility TEXT NOT NULL DEFAULT 'private',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL, type TEXT NOT NULL DEFAULT 'music', prompt TEXT NOT NULL,
  reveal_type TEXT NOT NULL DEFAULT 'media_time', reveal_unit TEXT NOT NULL DEFAULT 'seconds',
  reveal_min INTEGER NOT NULL DEFAULT 1, reveal_max INTEGER NOT NULL DEFAULT 10,
  reveal_step INTEGER NOT NULL DEFAULT 1, media_type TEXT NOT NULL DEFAULT 'youtube',
  media_url TEXT NOT NULL, media_start REAL NOT NULL DEFAULT 0,
  game_round INTEGER NOT NULL DEFAULT 2, listen_seconds INTEGER NOT NULL DEFAULT 5,
  answer_seconds INTEGER NOT NULL DEFAULT 12,
  primary_answer TEXT NOT NULL, artist TEXT NOT NULL DEFAULT '', hint TEXT NOT NULL DEFAULT '',
  UNIQUE(quiz_id, order_index)
);
CREATE TABLE IF NOT EXISTS accepted_answers (
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer TEXT NOT NULL, PRIMARY KEY(question_id, answer)
);
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY, owner_token TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, pin TEXT UNIQUE NOT NULL, quiz_id TEXT NOT NULL REFERENCES quizzes(id),
  host_token TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'LOBBY', question_index INTEGER NOT NULL DEFAULT 0,
  active_bid INTEGER, phase_started_at INTEGER NOT NULL, phase_ends_at INTEGER,
  wrong_penalty_percentage INTEGER NOT NULL DEFAULT 0, paused_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL, avatar_id INTEGER NOT NULL DEFAULT 1, score INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, UNIQUE(room_id, nickname)
);
CREATE TABLE IF NOT EXISTS bids (
  room_id TEXT NOT NULL, question_index INTEGER NOT NULL, player_id TEXT NOT NULL REFERENCES players(id),
  amount INTEGER NOT NULL, auto_assigned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
  PRIMARY KEY(room_id, question_index, player_id)
);
CREATE TABLE IF NOT EXISTS answers (
  room_id TEXT NOT NULL, question_index INTEGER NOT NULL, player_id TEXT NOT NULL REFERENCES players(id),
  amount INTEGER NOT NULL, text TEXT NOT NULL, correct INTEGER NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(room_id, question_index, player_id)
);
CREATE TABLE IF NOT EXISTS score_events (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL, question_index INTEGER NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id), delta INTEGER NOT NULL, reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_events_room ON game_events(room_id, id);

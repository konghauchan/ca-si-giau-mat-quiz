import { traceDb } from './timing';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client, type Transaction, type Value, type InStatement } from '@libsql/client';

type Args = (string | number | null)[];
type Row = Record<string, Value>;
const transactionContext = new AsyncLocalStorage<Transaction>();
const globalDb = globalThis as typeof globalThis & { gameDbPromise?: Promise<Client>; gameWriteTail?: Promise<void> };

async function initialize(): Promise<Client> {
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  const filename = path.resolve(process.env.DATABASE_PATH || './data/game.sqlite');
  if (!remoteUrl) fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (remoteUrl && !process.env.TURSO_AUTH_TOKEN) throw new Error('Thiếu TURSO_AUTH_TOKEN cho database online.');
  const client = createClient({ url: remoteUrl || `file:${filename}`, authToken: remoteUrl ? process.env.TURSO_AUTH_TOKEN : undefined });
  if (remoteUrl) {
    try {
      // A deployed function should not run DDL on every cold start. Check the
      // columns it needs with one read, and migrate only an older database.
      await client.execute(`SELECT q.deleted_at,q.replacement_id,q.cover_url,q.game_type,q.owner_user_id,s.clues_json,s.game_round,s.listen_seconds,s.answer_seconds,s.bid_seconds,s.topic_id,s.result_start,s.result_seconds,r.paused_at,r.clue_state,p.ready,p.avatar_id,a.id,u.id,us.token_hash
        FROM quizzes q,questions s,rooms r,players p,answer_attempts a,users u,user_sessions us,narration_cache nc,narration_usage nu LIMIT 0`);
      return client;
    } catch (error) {
      if (!/no such (?:table|column)/i.test(String(error))) { client.close(); throw error; }
      // A new or older database needs the additive migration below.
    }
  }
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8').replace(/^PRAGMA journal_mode\s*=\s*WAL;\s*/mi, '');
  const migration = await client.transaction('write');
  try {
    const indexes = schema.match(/CREATE(?: UNIQUE)? INDEX[\s\S]*?;/g) || [];
    await migration.executeMultiple(schema.replace(/CREATE(?: UNIQUE)? INDEX[\s\S]*?;/g, ''));

    async function addColumn(table: string, name: string, definition: string) {
      const columns = (await migration.execute(`PRAGMA table_info(${table})`)).rows;
      if (!columns.some(column => column.name === name)) await migration.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
    await addColumn('quizzes', 'game_type', "TEXT NOT NULL DEFAULT 'MUSIC_BID'");
    await addColumn('questions', 'clues_json', "TEXT NOT NULL DEFAULT '[]'");
    await addColumn('rooms', 'clue_state', "TEXT NOT NULL DEFAULT '{}'");
    await addColumn('players', 'ready', 'INTEGER NOT NULL DEFAULT 0');
    await addColumn('quizzes', 'deleted_at', 'INTEGER');
    await addColumn('quizzes', 'replacement_id', 'TEXT');
    await addColumn('quizzes', 'cover_url', 'TEXT');
    await addColumn('quizzes', 'owner_user_id', 'TEXT REFERENCES users(id)');
    await addColumn('questions', 'game_round', 'INTEGER NOT NULL DEFAULT 2');
    await addColumn('questions', 'listen_seconds', 'INTEGER NOT NULL DEFAULT 5');
    await addColumn('questions', 'answer_seconds', 'INTEGER NOT NULL DEFAULT 12');
    await addColumn('questions', 'bid_seconds', 'INTEGER NOT NULL DEFAULT 30');
    await addColumn('questions', 'topic_id', 'TEXT REFERENCES topics(id)');
    await addColumn('questions', 'result_start', 'REAL');
    await addColumn('questions', 'result_seconds', 'INTEGER');
    await addColumn('rooms', 'paused_at', 'INTEGER');
    await addColumn('players', 'avatar_id', 'INTEGER NOT NULL DEFAULT 1');
    await migration.execute(`INSERT OR IGNORE INTO answer_attempts(id,room_id,question_index,player_id,amount,text,correct,created_at)
      SELECT room_id || ':' || question_index || ':' || player_id,room_id,question_index,player_id,amount,text,correct,created_at FROM answers`);
    for (const index of indexes) await migration.execute(index);
    await migration.commit();
  } catch (error) { await migration.rollback().catch(() => {}); client.close(); throw error; }
  finally { migration.close(); }
  return client;
}

export function db(): Promise<Client> {
  if (!globalDb.gameDbPromise) globalDb.gameDbPromise = initialize().catch(error => { globalDb.gameDbPromise = undefined; throw error; });
  return globalDb.gameDbPromise;
}

async function execute(sql: string, args: Args) {
  const connection = transactionContext.getStore() || await db();
  return traceDb(() => connection.execute({ sql, args }));
}

export async function one(sql: string, ...args: Args): Promise<Row | undefined> {
  return (await execute(sql, args)).rows[0] as Row | undefined;
}

export async function all(sql: string, ...args: Args): Promise<Row[]> {
  return (await execute(sql, args)).rows as Row[];
}

export async function run(sql: string, ...args: Args): Promise<void> {
  await execute(sql, args);
}

export async function tx<T>(action: () => Promise<T>, mode: 'read' | 'write' = 'write'): Promise<T> {
  if (transactionContext.getStore()) return action();
  let release: (() => void) | undefined;
  if (mode === 'write') {
    const previous = globalDb.gameWriteTail || Promise.resolve();
    globalDb.gameWriteTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
  }
  try {
    const connection = await db();
    for (let attempt = 0; ; attempt++) {
      let transaction: Transaction | undefined;
      try {
        transaction = await connection.transaction(mode);
        const result = await transactionContext.run(transaction, action);
        await transaction.commit();
        return result;
      } catch (error) {
        if (transaction) await transaction.rollback().catch(() => {});
        // Safe to retry a rolled-back transaction. Other Vercel instances still
        // arbitrate through the database's write lock, never client timestamps.
        if (!/SQLITE_BUSY|database is locked/i.test(String(error)) || attempt >= 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
      } finally { transaction?.close(); }
    }
  } finally { release?.(); }
}

// One database round trip with a consistent read snapshot.
export async function batchRead(statements: InStatement[]): Promise<Row[][]> {
  const transaction = transactionContext.getStore();
  const connection = await db();
  const results = await traceDb(() => transaction ? transaction.batch(statements) : connection.batch(statements, 'read'));
  return results.map(result => result.rows as Row[]);
}

export async function batchWrite(statements: InStatement[]): Promise<void> {
  const transaction=transactionContext.getStore();
  if (!transaction) throw new Error('Write batch requires a transaction.');
  await traceDb(() => transaction.batch(statements));
}

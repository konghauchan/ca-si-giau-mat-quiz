import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client, type Transaction, type Value } from '@libsql/client';

type Args = (string | number | null)[];
type Row = Record<string, Value>;
const transactionContext = new AsyncLocalStorage<Transaction>();
const globalDb = globalThis as typeof globalThis & { gameDbPromise?: Promise<Client> };

async function initialize(): Promise<Client> {
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  const filename = path.resolve(process.env.DATABASE_PATH || './data/game.sqlite');
  if (!remoteUrl) fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (remoteUrl && !process.env.TURSO_AUTH_TOKEN) throw new Error('Thiếu TURSO_AUTH_TOKEN cho database online.');
  const client = createClient({ url: remoteUrl || `file:${filename}`, authToken: remoteUrl ? process.env.TURSO_AUTH_TOKEN : undefined });
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8').replace(/^PRAGMA journal_mode\s*=\s*WAL;\s*/mi, '');
  await client.executeMultiple(schema);

  async function addColumn(table: string, name: string, definition: string) {
    const columns = (await client.execute(`PRAGMA table_info(${table})`)).rows;
    if (!columns.some(column => column.name === name)) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
  await addColumn('quizzes', 'deleted_at', 'INTEGER');
  await addColumn('questions', 'game_round', 'INTEGER NOT NULL DEFAULT 2');
  await addColumn('questions', 'listen_seconds', 'INTEGER NOT NULL DEFAULT 5');
  await addColumn('questions', 'answer_seconds', 'INTEGER NOT NULL DEFAULT 12');
  await addColumn('questions', 'topic_id', 'TEXT REFERENCES topics(id)');
  await addColumn('questions', 'result_start', 'REAL');
  await addColumn('questions', 'result_seconds', 'INTEGER');
  await addColumn('rooms', 'paused_at', 'INTEGER');
  await addColumn('players', 'avatar_id', 'INTEGER NOT NULL DEFAULT 1');
  return client;
}

export function db(): Promise<Client> {
  if (!globalDb.gameDbPromise) globalDb.gameDbPromise = initialize().catch(error => { globalDb.gameDbPromise = undefined; throw error; });
  return globalDb.gameDbPromise;
}

async function execute(sql: string, args: Args) {
  const connection = transactionContext.getStore() || await db();
  return connection.execute({ sql, args });
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

export async function tx<T>(action: () => Promise<T>): Promise<T> {
  if (transactionContext.getStore()) return action();
  const connection = await db();
  const transaction = await connection.transaction('write');
  try {
    const result = await transactionContext.run(transaction, action);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}

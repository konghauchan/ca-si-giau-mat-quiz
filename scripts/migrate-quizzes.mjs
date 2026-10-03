import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) throw new Error('Cần TURSO_DATABASE_URL và TURSO_AUTH_TOKEN để chuyển quiz.');

const sourcePath = path.resolve(process.argv[2] || './data/game.sqlite');
const source = new DatabaseSync(sourcePath, { readOnly: true });
const remote = createClient({ url, authToken });
const schema = fs.readFileSync(path.resolve('schema.sql'), 'utf8').replace(/^PRAGMA journal_mode\s*=\s*WAL;\s*/mi, '');
await remote.executeMultiple(schema);

const quizzes = source.prepare('SELECT * FROM quizzes WHERE deleted_at IS NULL ORDER BY created_at').all()
  .filter(item => !String(item.title).startsWith('Smoke ') && item.title !== 'Đoán bài hát Việt');
const quizIds = new Set(quizzes.map(item => item.id));
const questions = source.prepare('SELECT * FROM questions').all().filter(item => quizIds.has(item.quiz_id));
const questionIds = new Set(questions.map(item => item.id));
const answers = source.prepare('SELECT * FROM accepted_answers').all().filter(item => questionIds.has(item.question_id));

const transaction = await remote.transaction('write');
try {
  for (const [table, rows] of [['quizzes', quizzes], ['questions', questions], ['accepted_answers', answers]]) {
    for (const row of rows) {
      const columns = Object.keys(row);
      const sql = `INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
      await transaction.execute({ sql, args: columns.map(column => row[column]) });
    }
  }
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
} finally {
  transaction.close();
  source.close();
  remote.close();
}

console.log(`Đã chuyển ${quizzes.length} bộ câu hỏi, ${questions.length} bài hát và ${answers.length} đáp án phụ. Phòng chơi cũ không được chuyển.`);

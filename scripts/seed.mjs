import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const path = resolve(process.env.DATABASE_PATH || './data/game.sqlite');
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec(readFileSync(resolve('schema.sql'), 'utf8'));
const questionColumns = db.prepare('PRAGMA table_info(questions)').all();
if (!questionColumns.some(column => column.name === 'game_round')) db.exec('ALTER TABLE questions ADD COLUMN game_round INTEGER NOT NULL DEFAULT 2');
if (!questionColumns.some(column => column.name === 'listen_seconds')) db.exec('ALTER TABLE questions ADD COLUMN listen_seconds INTEGER NOT NULL DEFAULT 5');
if (!questionColumns.some(column => column.name === 'answer_seconds')) db.exec('ALTER TABLE questions ADD COLUMN answer_seconds INTEGER NOT NULL DEFAULT 12');
const exists = db.prepare("SELECT id FROM quizzes WHERE title='Đoán bài hát Việt' LIMIT 1").get();
if (!exists) {
  const quizId = randomUUID(); const ownerToken = randomBytes(24).toString('hex'); const time = Date.now();
  db.prepare('INSERT INTO quizzes(id,owner_token,title,description,visibility,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(quizId, ownerToken, 'Đoán bài hát Việt', 'Bộ câu hỏi mẫu với đường dẫn giữ chỗ. Thay đường dẫn và đáp án bằng bài hát thật trước khi chơi.', 'public', time, time);
  for (let n = 1; n <= 3; n++) db.prepare('INSERT INTO questions(id,quiz_id,order_index,type,prompt,reveal_type,reveal_unit,reveal_min,reveal_max,reveal_step,media_type,media_url,media_start,game_round,listen_seconds,answer_seconds,primary_answer,artist,hint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), quizId, n - 1, 'music', `Đây là bài hát Việt nào? (#${n})`, 'media_time', 'seconds', 1, 10, 1, 'youtube', `https://www.youtube.com/watch?v=REPLACE000${n}`, 30, n < 3 ? 1 : 2, 5, 12, `Bài hát mẫu ${n}`, '', n < 3 ? '' : `Gợi ý mẫu cho câu ${n}; hãy thay bằng gợi ý thật.`);
  console.log(`Seeded quiz id: ${quizId}`);
  console.log(`Owner token (save to edit demo): ${ownerToken}`);
} else console.log('Demo quiz already exists.');
db.close();

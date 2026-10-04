import { writeFileSync } from 'node:fs';
import { clueFixture } from './clue-fixture.mjs';
const base=process.env.SEED_BASE_URL||'http://localhost:3210';
const response=await fetch(base+'/api/quiz',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(clueFixture)});const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));
writeFileSync('data/clue-seed.json',JSON.stringify(result,null,2));
console.log(`Đã tạo 3 câu mẫu: ${base}/quiz/${result.id}`);
console.log('Phiên sửa bộ mẫu đã lưu ở data/clue-seed.json.');

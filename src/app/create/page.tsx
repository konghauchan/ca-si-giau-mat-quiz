'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowUp, Copy, Eye, Plus, Save, Trash2 } from 'lucide-react';
import { ApiError, api, claimLegacyQuizzes } from '@/lib/client';
import { ClipPlayer } from '@/components/ClipPlayer';
import { AudioClipPlayer } from '@/components/AudioClipPlayer';
import { normalizeAnswer, youtubeId } from '@/lib/core';
import { formatStartTime, parseStartTime } from '@/lib/time';
import { QuestionReview } from '@/components/QuestionReview';
import { ClueFields, CluePreview, blankClues, clueDemo } from '@/components/ClueFields';
import type { Clue } from '@/lib/clueRules';
import { prepareCover } from '@/lib/clientCover';
import { quizSchema } from '@/lib/quizSchema';

type IssuePath = Array<string | number>;
class QuizFormError extends Error {
  constructor(public path: IssuePath, message: string) { super(message); }
}
const fieldLabels: Record<string, string> = {
  title: 'Tên bộ câu hỏi', description: 'Mô tả', visibility: 'Hiển thị',
  prompt: 'Nội dung câu hỏi', primaryAnswer: 'Đáp án chính', acceptedAnswers: 'Đáp án chấp nhận thêm',
  artist: 'Nghệ sĩ', hint: 'Gợi ý trước khi đấu giá', bidSeconds: 'Thời gian đọc gợi ý và đấu giá',
  listenSeconds: 'Thời lượng nghe chung', answerSeconds: 'Thời gian trả lời', mediaUrl: 'Đường dẫn YouTube',
  mediaStart: 'Bắt đầu (giây hoặc mm:ss)', resultStart: 'Bắt đầu đoạn kết quả (giây hoặc mm:ss)',
  resultSeconds: 'Phát trong bao lâu (giây)', revealMin: 'Nhỏ nhất', revealMax: 'Lớn nhất', revealStep: 'Bước',
  songCount: 'Số bài cần có'
};
const fieldGuidance: Record<string, string> = {
  title: 'Cần nhập tên dài tối đa 100 ký tự.', description: 'Mô tả tối đa 500 ký tự.',
  prompt: 'Cần nhập nội dung dài tối đa 300 ký tự.', primaryAnswer: 'Cần nhập đáp án dài tối đa 120 ký tự.',
  acceptedAnswers: 'Tối đa 20 đáp án thêm, mỗi đáp án không quá 120 ký tự.',
  artist: 'Tên nghệ sĩ tối đa 120 ký tự.', hint: 'Cần nhập gợi ý dài tối đa 200 ký tự.',
  bidSeconds: 'Nhập số nguyên từ 5 đến 90 giây.', listenSeconds: 'Nhập thời lượng từ 1 đến 10 giây.',
  answerSeconds: 'Chọn thời gian từ 5 đến 60 giây.', mediaUrl: 'Nhập đường dẫn YouTube hợp lệ.',
  mediaStart: 'Nhập số giây từ 0 hoặc định dạng mm:ss.', resultStart: 'Nhập số giây từ 0 hoặc định dạng mm:ss.',
  resultSeconds: 'Nhập số nguyên từ 1 đến 60 giây.', revealMin: 'Nhập số nguyên từ 1 đến 30 giây.',
  revealMax: 'Nhập số nguyên từ 1 đến 30 giây và không nhỏ hơn mức thấp nhất.',
  revealStep: 'Nhập số nguyên từ 1 đến 30 giây.', songCount: 'Nhập số nguyên từ 1 đến 30.'
};

type Topic = { key: string; gameRound: 1 | 2; title: string; songCount: number };
type Question = { clues?: Clue[]; prompt: string; gameRound: 1 | 2; topicKey: string; listenSeconds: number; answerSeconds: number; bidSeconds: number; mediaType: 'youtube' | 'uploaded_audio'; mediaUrl: string; mediaStart: string; resultStart: string | null; resultSeconds: number | null; primaryAnswer: string; acceptedAnswers: string[]; artist: string; hint: string; revealMin: number; revealMax: number; revealStep: number };
const blank = (gameRound: 1 | 2 = 1, topicKey = `round-${gameRound}`): Question => ({ prompt: 'Đây là bài hát nào?', gameRound, topicKey, listenSeconds: 5, answerSeconds: 12, bidSeconds: 30, mediaType: 'youtube', mediaUrl: '', mediaStart: '0', resultStart: null, resultSeconds: null, primaryAnswer: '', acceptedAnswers: [], artist: '', hint: '', revealMin: 1, revealMax: 10, revealStep: 1 });
const initialTopics: Topic[] = [{ key: 'round-1', gameRound: 1, title: 'Chủ đề vòng 1', songCount: 1 }, { key: 'round-2', gameRound: 2, title: 'Chủ đề vòng 2', songCount: 1 }];
const demoTopics: Topic[] = [{ key: 'round-1', gameRound: 1, title: 'Nhạc Việt quen thuộc', songCount: 2 }, { key: 'round-2', gameRound: 2, title: 'Điệp khúc bất ngờ', songCount: 1 }];
const demo: Question[] = [
  { ...blank(1), prompt: 'Đây là bài hát Việt nào? (Mẫu 1)', mediaUrl: 'https://www.youtube.com/watch?v=REPLACE0001', mediaStart: '30', primaryAnswer: 'Bài hát mẫu 1', artist: 'Thay bằng nghệ sĩ thật' },
  { ...blank(1), prompt: 'Bạn nhận ra giai điệu này chứ? (Mẫu 2)', mediaUrl: 'https://www.youtube.com/watch?v=REPLACE0002', mediaStart: '45', primaryAnswer: 'Bài hát mẫu 2' },
  { ...blank(2), prompt: 'Đoán tên bài hát! (Mẫu 3)', mediaUrl: 'https://www.youtube.com/watch?v=REPLACE0003', mediaStart: '01:00', primaryAnswer: 'Bài hát mẫu 3', hint: 'Ca khúc có điệp khúc rất dễ nhận ra.' }
];
type QuizResponse = { gameType: 'MUSIC_BID' | 'SONG_CLUE'; title: string; description: string; visibility: 'private' | 'unlisted' | 'public'; coverUrl: string | null; own: boolean; usedInRoom: boolean; topics: Array<{ id: string; game_round: number; title: string; song_count: number }>; questions: Array<{ clues_json: string; prompt: string; game_round: number; topic_id: string | null; listen_seconds: number; answer_seconds: number; bid_seconds: number; media_type: 'youtube' | 'uploaded_audio'; media_url: string; media_start: number; result_start: number | null; result_seconds: number | null; primary_answer: string; accepted_answers: string[]; artist: string; hint: string; reveal_min: number; reveal_max: number; reveal_step: number }> };
function Creator() {
  const router = useRouter(); const params = useSearchParams(); const editId = params.get('id');
  const [gameType,setGameType] = useState<'MUSIC_BID'|'SONG_CLUE'>('MUSIC_BID');
  const clueMode=gameType==='SONG_CLUE';
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [visibility, setVisibility] = useState<'private' | 'unlisted' | 'public'>('private');
  const [persistedId, setPersistedId] = useState(editId); const [coverUrl, setCoverUrl] = useState<string | null>(null); const [coverFile, setCoverFile] = useState<File | null>(null); const [coverPreview, setCoverPreview] = useState<string | null>(null); const [removeCover, setRemoveCover] = useState(false); const [coverBusy, setCoverBusy] = useState(false);
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [questions, setQuestions] = useState<Question[]>([blank(1), blank(2)]); const [activeRound, setActiveRound] = useState<1 | 2>(1); const [selected, setSelected] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(3); const [reviewOpen, setReviewOpen] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [usedInRoom, setUsedInRoom] = useState(false);
  const [focusIssue, setFocusIssue] = useState<{ path: IssuePath; key: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ user: { id: string } | null }>('/api/auth').then(async result => {
      if (!active) return;
      if (!result.user) { router.replace(`/login?next=${encodeURIComponent(`/create${editId ? `?id=${editId}` : ''}`)}`); return; }
      await claimLegacyQuizzes().catch(() => undefined);
      if (active) setAuthReady(true);
    }).catch(cause => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [router, editId]);
  useEffect(() => {
    if (!editId || !authReady) return;
    api<QuizResponse>(`/api/quiz?id=${encodeURIComponent(editId)}`).then(quiz => {
      if (!quiz.own) throw new Error('Bạn không có quyền sửa bộ câu hỏi này.');
      setGameType(quiz.gameType || 'MUSIC_BID'); setTitle(quiz.title); setDescription(quiz.description); setVisibility(quiz.visibility); setCoverUrl(quiz.coverUrl); setUsedInRoom(quiz.usedInRoom);
      const loadedTopics: Topic[] = quiz.topics.length ? quiz.topics.map(t => ({ key: t.id, gameRound: t.game_round === 1 ? 1 : 2, title: t.title, songCount: t.song_count })) : ([1, 2] as const).map(round => ({ key: `round-${round}`, gameRound: round, title: `Chủ đề vòng ${round}`, songCount: quiz.questions.filter(q => q.game_round === round).length }));
      const loaded = quiz.questions.map(q => ({ clues: JSON.parse(q.clues_json || '[]'), prompt: q.prompt, gameRound: q.game_round === 1 ? 1 as const : 2 as const, topicKey: q.topic_id || `round-${q.game_round}`, listenSeconds: q.listen_seconds || 5, answerSeconds: q.answer_seconds || 12, bidSeconds: q.bid_seconds ?? 30, mediaType: q.media_type, mediaUrl: q.media_url, mediaStart: formatStartTime(q.media_start), resultStart: q.result_start == null ? null : formatStartTime(q.result_start), resultSeconds: q.result_seconds ?? null, primaryAnswer: q.primary_answer, acceptedAnswers: q.accepted_answers, artist: q.artist, hint: q.hint, revealMin: q.reveal_min, revealMax: q.reveal_max, revealStep: q.reveal_step }));
      setTopics(loadedTopics); setQuestions(loaded); setActiveRound(1); setSelected(loaded.findIndex(q => q.gameRound === 1));
    }).catch(e => setError(e.message));
  }, [editId, authReady]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);
  async function chooseCover(file: File | undefined) {
    if (!file) return;
    setCoverBusy(true); setError('');
    try { const prepared = await prepareCover(file); setCoverFile(prepared); setCoverPreview(URL.createObjectURL(prepared)); setRemoveCover(false); }
    catch (error) { setError((error as Error).message); }
    finally { setCoverBusy(false); }
  }
  const roundIndexes = questions.flatMap((item, index) => item.gameRound === activeRound ? [index] : []);
  const roundTopics = topics.filter(topic => topic.gameRound === activeRound);
  const q = selected >= 0 && questions[selected]?.gameRound === activeRound ? questions[selected] : undefined;
  const selectedTopic = roundTopics.find(topic => topic.key === q?.topicKey) || roundTopics[0];
  const topicIndexes = questions.flatMap((item, index) => item.topicKey === selectedTopic?.key ? [index] : []);
  function update(patch: Partial<Question>) { setQuestions(previous => previous.map((item, index) => index === selected ? { ...item, ...patch } : item)); }
  function switchRound(round: 1 | 2) { setActiveRound(round); setSelected(questions.findIndex(item => item.gameRound === round)); }
  function add(topicKey: string) { const indexes = questions.flatMap((item, index) => item.topicKey === topicKey ? [index] : []); const insertAt = indexes.length ? indexes[indexes.length - 1] + 1 : questions.findIndex(item => item.gameRound > activeRound); const position = insertAt < 0 ? questions.length : insertAt; setQuestions(previous => [...previous.slice(0, position), {...blank(activeRound, topicKey),...(clueMode?{clues:blankClues(),listenSeconds:15,answerSeconds:8}:{})}, ...previous.slice(position)]); setSelected(position); }
  function addTopic() { const key = crypto.randomUUID(); setTopics(previous => [...previous, { key, gameRound: activeRound, title: `Chủ đề ${roundTopics.length + 1}`, songCount: 1 }]); add(key); }
  function removeTopic(topicKey: string) { if (roundTopics.length <= 1 || questions.some(item => item.topicKey === topicKey)) return; setTopics(previous => previous.filter(topic => topic.key !== topicKey)); }
  function duplicate() { if (!q || topicIndexes.length >= selectedTopic.songCount) return; setQuestions(previous => [...previous.slice(0, selected + 1), { ...q, mediaUrl: '', primaryAnswer: '', acceptedAnswers: [...q.acceptedAnswers] }, ...previous.slice(selected + 1)]); setSelected(selected + 1); }
  function remove() { if (roundIndexes.length <= 1) return; const remaining = roundIndexes.filter(index => index !== selected); setQuestions(previous => previous.filter((_, index) => index !== selected)); const next = remaining.find(index => index > selected) ?? remaining.at(-1)!; setSelected(next > selected ? next - 1 : next); }
  function move(offset: number) { const position = topicIndexes.indexOf(selected); const target = topicIndexes[position + offset]; if (target === undefined) return; setQuestions(previous => { const next = [...previous]; [next[selected], next[target]] = [next[target], next[selected]]; return next; }); setSelected(target); }
  function showIssue(path: IssuePath, detail?: string) {
    const section = String(path[0] || 'title');
    const index = Number(path[1]);
    const field = section === 'questions' || section === 'topics' ? String(path[2] || section) : section;
    const label = field === 'clues' ? `Nội dung gợi ý ${Number(path[3]) + 1}` : field === 'title' && section === 'topics' ? 'Tên chủ đề' : fieldLabels[field] || 'Trường này';
    let place = '';
    if (section === 'questions' && questions[index]) {
      const item = questions[index]; const topic = topics.find(t => t.key === item.topicKey);
      const number = questions.slice(0, index + 1).filter(candidate => candidate.topicKey === item.topicKey).length;
      place = `Vòng ${item.gameRound} · ${topic?.title || 'Chủ đề'} · Bài ${number}: `;
      setActiveRound(item.gameRound); setSelected(index);
    } else if (section === 'topics' && topics[index]) {
      place = `Vòng ${topics[index].gameRound} · Chủ đề “${topics[index].title}”: `;
      setActiveRound(topics[index].gameRound);
      setSelected(questions.findIndex(item => item.topicKey === topics[index].key));
    }
    const guidance = section === 'topics' && field === 'title' ? 'Nhập tên chủ đề dài tối đa 80 ký tự.' : fieldGuidance[field];
    setError(`${place}${label}: ${detail || guidance || 'Giá trị không hợp lệ.'}`);
    setFocusIssue({ path, key: crypto.randomUUID() });
  }
  useEffect(() => {
    if (!focusIssue) return;
    let focusedControl: HTMLElement | null = null;
    const frame = requestAnimationFrame(() => {
      const [section, rawIndex, rawField, rawClueIndex, rawClueField] = focusIssue.path;
      let root: Element | null = document.querySelector('main.page > section.panel');
      let label = fieldLabels[String(section)] || '';
      if (section === 'questions') {
        root = document.querySelector('.editor > section.panel');
        const field = String(rawField);
        label = field === 'clues' ? rawClueField === 'score' ? 'Điểm' : rawClueField === 'category' ? 'Loại gợi ý' : `Nội dung gợi ý ${Number(rawClueIndex) + 1}` : fieldLabels[field] || '';
        if (field === 'clues') root = root?.querySelectorAll('.clue-editor-card')[Number(rawClueIndex)] || root;
      } else if (section === 'topics') {
        const topic = topics[Number(rawIndex)];
        const position = topics.filter(t => t.gameRound === topic?.gameRound).findIndex(t => t.key === topic?.key);
        root = document.querySelectorAll('.topic-editor')[position] || null;
        label = rawField === 'title' ? 'Tên chủ đề' : fieldLabels[String(rawField)] || '';
      }
      const matchingLabel = [...(root?.querySelectorAll('label') || [])].find(node => node.textContent?.trim().startsWith(label));
      const control = matchingLabel?.closest('.field')?.querySelector('input:not([disabled]),textarea,select') || matchingLabel?.querySelector('input,textarea,select');
      if (control instanceof HTMLElement) { focusedControl = control; control.focus({ preventScroll: true }); control.scrollIntoView({ behavior: 'smooth', block: 'center' }); control.classList.add('validation-focus'); }
    });
    return () => { cancelAnimationFrame(frame); focusedControl?.classList.remove('validation-focus'); };
  }, [focusIssue, topics]);
  async function save(asCopy = false) {
    setError(''); setFocusIssue(null); setBusy(true);
    try {
      if (!title.trim()) throw new QuizFormError(['title'], 'Hãy nhập tên bộ câu hỏi.');
      for (const [topicIndex, topic] of topics.entries()) {
        const count = questions.filter(item => item.topicKey === topic.key).length;
        if (!topic.title.trim()) throw new QuizFormError(['topics', topicIndex, 'title'], 'Hãy nhập tên chủ đề.');
        if (!Number.isInteger(topic.songCount) || topic.songCount < 1 || topic.songCount > 30) throw new QuizFormError(['topics', topicIndex, 'songCount'], 'Số bài phải từ 1 đến 30.');
        if (count !== topic.songCount) throw new QuizFormError(['topics', topicIndex, 'songCount'], `Chủ đề cần ${topic.songCount} bài, hiện có ${count} bài.`);
      }
      const normalizedQuestions = questions.map((item, index) => {
        if (clueMode) return {...item,mediaStart:0,resultStart:null,resultSeconds:null,mediaUrl:'',clues:item.clues||blankClues()};
        const mediaStart = parseStartTime(item.mediaStart);
        if (mediaStart === null) throw new QuizFormError(['questions', index, 'mediaStart'], 'Thời điểm bắt đầu phải từ 0 giây; nhập số giây hoặc mm:ss.');
        const resultStart = item.resultStart === null ? null : parseStartTime(item.resultStart);
        if (item.gameRound === 2 && (!Number.isInteger(item.bidSeconds) || item.bidSeconds < 5 || item.bidSeconds > 90)) throw new QuizFormError(['questions', index, 'bidSeconds'], 'Thời gian đọc gợi ý và đấu giá phải từ 5–90 giây.');
        if (item.resultStart !== null && resultStart === null) throw new QuizFormError(['questions', index, 'resultStart'], 'Mốc phát video công bố đáp án không hợp lệ.');
        if (resultStart !== null && (!Number.isInteger(item.resultSeconds) || item.resultSeconds! < 1 || item.resultSeconds! > 60)) throw new QuizFormError(['questions', index, 'resultSeconds'], 'Đoạn công bố đáp án phải dài 1–60 giây.');
        const musicQuestion = { ...item }; delete musicQuestion.clues;
        return { ...musicQuestion, mediaStart, resultStart };
      });
      const activeId = !asCopy ? persistedId : null;
      const payload = { id: activeId || undefined, coverSourceId: asCopy && persistedId ? persistedId : undefined, title: asCopy ? `${title} (bản mới)` : title, gameType, description, visibility, topics, questions: normalizedQuestions };
      const parsed = quizSchema.safeParse(payload);
      if (!parsed.success) throw new QuizFormError(parsed.error.issues[0].path.map(part => typeof part === 'number' ? part : String(part)), '');
      const songNames = new Set<string>(); const songIds = new Set<string>();
      for (const [index, item] of parsed.data.questions.entries()) {
        if (!item.prompt.trim()) throw new QuizFormError(['questions', index, 'prompt'], 'Hãy nhập nội dung câu hỏi.');
        if (!item.primaryAnswer.trim()) throw new QuizFormError(['questions', index, 'primaryAnswer'], 'Hãy nhập đáp án chính.');
        const songName = normalizeAnswer(item.primaryAnswer);
        if (songNames.has(songName)) throw new QuizFormError(['questions', index, 'primaryAnswer'], 'Tên bài hát này đã có ở câu khác.');
        songNames.add(songName);
        if (clueMode) {
          if (item.clues?.length !== 5) throw new QuizFormError(['questions', index, 'clues', 0, 'text'], 'Bài này cần đủ 5 gợi ý.');
          for (const [clueIndex, clue] of item.clues.entries()) if (!clue.text.trim()) throw new QuizFormError(['questions', index, 'clues', clueIndex, 'text'], 'Hãy nhập nội dung gợi ý.');
          continue;
        }
        if (item.gameRound === 2 && !item.hint.trim()) throw new QuizFormError(['questions', index, 'hint'], 'Hãy nhập gợi ý trước khi đấu giá.');
        if (item.mediaType === 'youtube') {
          const videoId = youtubeId(item.mediaUrl);
          if (!videoId) throw new QuizFormError(['questions', index, 'mediaUrl'], 'Đường dẫn YouTube không hợp lệ.');
          if (songIds.has(videoId)) throw new QuizFormError(['questions', index, 'mediaUrl'], 'Video YouTube này đã có ở câu khác.');
          songIds.add(videoId);
        }
        if (item.revealMax < item.revealMin) throw new QuizFormError(['questions', index, 'revealMax'], 'Mức lớn nhất phải từ mức nhỏ nhất trở lên.');
      }
      const result = await api<{ id: string; replacedId?: string }>('/api/quiz', { method: 'POST', body: parsed.data });
      setPersistedId(result.id);
      if (coverFile || removeCover) {
        const response = await fetch(`/api/quiz/cover?id=${encodeURIComponent(result.id)}`, { method: coverFile ? 'POST' : 'DELETE', body: coverFile ? (() => { const form = new FormData(); form.set('file', coverFile); return form; })() : undefined });
        const imageResult = await response.json();
        if (!response.ok) throw new Error(`Bộ câu hỏi đã được lưu, nhưng ảnh bìa chưa lưu được: ${imageResult.error || 'Lỗi tải ảnh.'} Bấm Lưu lần nữa để thử lại.`);
        setCoverUrl(imageResult.coverUrl); setCoverFile(null); setCoverPreview(null); setRemoveCover(false);
      }
      router.push(`/quizzes?${result.replacedId ? 'updated' : 'created'}=${result.id}`);
    } catch (e) {
      if (e instanceof QuizFormError) showIssue(e.path, e.message || undefined);
      else if (e instanceof ApiError && e.issues?.length) showIssue(e.issues[0].path);
      else setError((e as Error).message);
    } finally { setBusy(false); }
  }
  if (!authReady) return <main className="page narrow"><div className="panel center">{error || 'Đang kiểm tra tài khoản…'}</div></main>;
  return <main className="page"><div className="page-head"><div><span className="kicker">TẠO BỘ CÂU HỎI</span><h1>{editId ? 'Chỉnh sửa bộ câu hỏi' : 'Tạo bộ câu hỏi mới'}</h1><p>{clueMode?'Đoán bài hát bằng 5 gợi ý. Đủ 4 người sẵn sàng là tự chơi.':'Chia bài hát thành vòng 1 nghe chung và vòng 2 đấu giá thời gian.'}</p></div><div className="editor-save-actions">{editId && <button className="button secondary big" onClick={() => save(true)} disabled={busy || coverBusy}>Lưu bản mới</button>}<button className="button primary big" onClick={() => save()} disabled={busy || coverBusy}><Save size={18} /> {busy ? 'Đang lưu…' : 'Lưu bộ câu hỏi'}</button></div></div>
    <div className="field clue-mode-select"><label>Kiểu chơi</label><select value={gameType} disabled={!!editId} onChange={e=>{const mode=e.target.value as typeof gameType;setGameType(mode);setActiveRound(1);setSelected(0);if(mode==='SONG_CLUE'){setTopics([{key:'round-1',gameRound:1,title:'Bài hát bí ẩn',songCount:10}]);setQuestions(Array.from({length:10},()=>({...blank(1),clues:blankClues(),listenSeconds:15,answerSeconds:8})));}else{setTopics(initialTopics);setQuestions([blank(1),blank(2)]);}}}><option value="MUSIC_BID">Nghe nhạc · 2 vòng</option><option value="SONG_CLUE">Đoán bài hát qua gợi ý · 4 người</option></select></div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {editId && usedInRoom && <div className="notice info">Bộ câu hỏi đã được dùng trong phòng chơi. Khi lưu, hệ thống sẽ tạo bản đã sửa để các phòng cũ tiếp tục dùng nội dung trước đó.</div>}
    <section className="panel" style={{ marginBottom: 18 }}><div className="form-row"><div className="field"><label>Tên bộ câu hỏi *</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Đoán bài hát Việt" /></div><div className="field"><label>Hiển thị</label><select value={visibility} onChange={e => setVisibility(e.target.value as 'private' | 'unlisted' | 'public')}><option value="private">Riêng tư</option><option value="unlisted">Ai có liên kết</option><option value="public">Công khai</option></select><small>“Ai có liên kết” cho phép mở quiz từ link, nhưng không hiện trong thư viện công khai.</small></div></div><div className="field"><label>Mô tả</label><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Một câu ngắn giới thiệu bộ câu hỏi" /></div><div className="cover-editor"><div className="cover-editor-preview">{!removeCover && (coverPreview || coverUrl) ? <Image unoptimized width={1200} height={900} src={coverPreview || coverUrl!} alt="Xem trước ảnh bìa quiz" /> : <span>♫</span>}</div><div className="cover-editor-controls"><strong>Ảnh bìa bộ câu hỏi</strong><p>Ảnh sẽ được cắt giữa thành tỉ lệ 4:3, nén WebP tối đa 300 KB rồi lưu ngoài database.</p><label className="button secondary cover-file-button">{coverBusy ? 'Đang nén ảnh…' : 'Chọn ảnh'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={coverBusy || busy} onChange={e => { chooseCover(e.target.files?.[0]); e.target.value = ''; }} /></label>{(coverFile || coverUrl) && !removeCover && <button type="button" className="button ghost" onClick={() => { setCoverFile(null); setCoverPreview(null); setRemoveCover(Boolean(coverUrl)); }}>Bỏ ảnh bìa</button>}</div></div><button className="button ghost" style={{ marginTop: 10, paddingLeft: 0 }} onClick={() => { if(clueMode){setTitle('Bài hát bí ẩn · Bộ mẫu');setDescription('Ba câu mẫu để thử chế độ gợi ý.');setTopics([{key:'round-1',gameRound:1,title:'Nhạc Việt',songCount:3}]);setQuestions(clueDemo.map(d=>({...blank(1),listenSeconds:15,answerSeconds:8,primaryAnswer:d.primaryAnswer,artist:d.artist,acceptedAnswers:d.acceptedAnswers,clues:blankClues().map((c,i)=>({...c,text:d.clues[i]}))})));setSelected(0);return;} setTitle('Đoán bài hát Việt'); setDescription('Bộ câu hỏi mẫu — thay đường dẫn YouTube và đáp án trước khi chơi.'); setTopics(demoTopics); setQuestions(demo); setActiveRound(1); setSelected(0); }}>Dùng ba câu hỏi mẫu</button></section>
    {!clueMode && <div className="round-tabs" role="tablist" aria-label="Vòng chơi">{([1, 2] as const).map(round => <button key={round} type="button" role="tab" id={`round-tab-${round}`} aria-controls="round-panel" aria-selected={activeRound === round} className={`round-tab ${activeRound === round ? 'active' : ''}`} onClick={() => switchRound(round)}><strong>Vòng {round}</strong><span>{round === 1 ? 'Cùng nghe và đoán' : 'Đấu giá thời gian'}</span><small>{questions.filter(item => item.gameRound === round).length} bài hát</small></button>)}</div>}
    <div className="editor" role="tabpanel" id="round-panel" aria-labelledby={`round-tab-${activeRound}`}><aside className="panel editor-side"><h3>{clueMode?'Danh sách bài hát':`Chủ đề vòng ${activeRound}`}</h3><p className="muted">{clueMode ? 'Mặc định 10 bài, mỗi bài 5 gợi ý. Bạn có thể thay đổi số bài.' : activeRound === 1 ? 'Mọi người cùng nghe đoạn nhạc và đoán tên bài hát.' : 'Người chơi xem gợi ý rồi đấu giá số giây muốn nghe.'}</p>{roundTopics.map(topic => { const indexes = questions.flatMap((item, index) => item.topicKey === topic.key ? [index] : []); return <div className="topic-editor" key={topic.key}><div className="field"><label>Tên chủ đề</label><input value={topic.title} maxLength={80} onChange={e => setTopics(previous => previous.map(item => item.key === topic.key ? { ...item, title: e.target.value } : item))} placeholder="Ví dụ: Nhạc phim Việt" /></div><div className="topic-count"><label>Số bài cần có <input type="number" min="1" max="30" value={topic.songCount} onChange={e => setTopics(previous => previous.map(item => item.key === topic.key ? { ...item, songCount: Number(e.target.value) } : item))} /></label><strong className={indexes.length === topic.songCount ? 'complete' : 'incomplete'}>{indexes.length}/{topic.songCount} bài</strong></div><div className="question-list">{indexes.map((index, position) => <button key={index} type="button" className={`question-item ${index === selected ? 'active' : ''}`} onClick={() => setSelected(index)}>Bài {position + 1}<small>{questions[index].primaryAnswer || questions[index].prompt}</small></button>)}</div><button type="button" className="button secondary" disabled={indexes.length >= topic.songCount || questions.length >= 30} onClick={() => add(topic.key)}><Plus size={16} /> Thêm bài hát</button>{roundTopics.length > 1 && <button type="button" className="button ghost topic-remove" disabled={indexes.length > 0} onClick={() => removeTopic(topic.key)}>Xóa chủ đề trống</button>}</div>; })}<button type="button" className="button secondary" disabled={questions.length >= 30 || topics.length >= 30} onClick={addTopic}><Plus size={16} /> Thêm chủ đề</button></aside>
      <section className="panel">{!q ? <div className="round-empty"><h2>Chưa có bài hát cho vòng {activeRound}</h2><p>Thêm bài hát cho chủ đề để lưu bộ câu hỏi.</p><button type="button" className="button primary" disabled={!roundTopics[0] || questions.length >= 30} onClick={() => add(roundTopics[0].key)}><Plus size={16} /> Thêm bài hát vòng {activeRound}</button></div> : <><div className="editor-toolbar"><h2>{clueMode?'Gợi ý':`Vòng ${activeRound}`} · {selectedTopic?.title} · Bài {topicIndexes.indexOf(selected) + 1}</h2><div><button type="button" className="button secondary" onClick={() => setReviewOpen(true)}><Eye size={16} /> Xem như người chơi</button><button title="Lên" aria-label="Đưa bài lên" className="button ghost" onClick={() => move(-1)} disabled={topicIndexes.indexOf(selected) === 0}><ArrowUp size={16} /></button><button title="Xuống" aria-label="Đưa bài xuống" className="button ghost" onClick={() => move(1)} disabled={topicIndexes.indexOf(selected) === topicIndexes.length - 1}><ArrowDown size={16} /></button><button title="Nhân bản" aria-label="Nhân bản bài" className="button ghost" onClick={duplicate} disabled={topicIndexes.length >= selectedTopic.songCount || questions.length >= 30}><Copy size={16} /></button><button title="Xóa" aria-label="Xóa bài" className="button danger" onClick={remove} disabled={roundIndexes.length <= 1}><Trash2 size={16} /></button></div></div>
        <div className="field"><label>Nội dung câu hỏi *</label><input value={q.prompt} onChange={e => update({ prompt: e.target.value })} /></div>
        {clueMode ? <><ClueFields clues={q.clues?.length===5?q.clues:blankClues()} seconds={q.listenSeconds} onSeconds={value=>update({listenSeconds:value})} onChange={clues=>update({clues})}/><div className="field"><label>Thời gian nhập đáp án (giây)</label><input type="number" min={5} max={60} value={q.answerSeconds} onChange={e=>update({answerSeconds:Number(e.target.value)})}/></div></> : <>
        {activeRound === 2 ? <><div className="field"><label>Gợi ý trước khi đấu giá *</label><input value={q.hint} onChange={e => update({ hint: e.target.value })} maxLength={200} placeholder="Ví dụ: Ca khúc nhạc Việt phát hành sau năm 2020" /><small>Tất cả người chơi thấy gợi ý này trước khi chọn số giây.</small></div><div className="field"><label>Thời gian đọc gợi ý và đấu giá</label><input type="number" min={5} max={90} step={1} value={q.bidSeconds} onChange={e => update({ bidSeconds: Number(e.target.value) })} /><small>Từ 5 đến 90 giây; hết giờ hệ thống tự chốt mức nghe dài nhất cho người chưa chọn.</small></div></> : <div className="field"><label>Thời lượng nghe chung</label><select value={q.listenSeconds} onChange={e => update({ listenSeconds: Number(e.target.value) })}>{[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} giây</option>)}</select><small>Tất cả người chơi nghe cùng đoạn rồi nhập tên bài hát.</small></div>}
        <div className="field"><label>Thời gian trả lời</label><select value={q.answerSeconds} onChange={e => update({ answerSeconds: Number(e.target.value) })}>{[5, 8, 10, 12, 15, 20, 30, 45, 60].map(n => <option key={n} value={n}>{n} giây</option>)}</select><small>Đếm ngược bắt đầu sau khi đoạn nhạc kết thúc; áp dụng cho bài này ở vòng {activeRound}.</small></div>
        <div className="form-row"><div className="field"><label>Loại câu hỏi</label><input value="Âm nhạc — đoán bài hát" disabled /></div><div className="field"><label>Nguồn nhạc</label><input value={q.mediaType === 'youtube' ? 'Video YouTube nhúng' : 'Tệp âm thanh từ bộ câu hỏi cũ'} disabled /></div></div>
        {q.mediaType === 'uploaded_audio' ? <div className="field"><div className="notice info">Câu hỏi cũ này đang dùng tệp âm thanh. Các câu hỏi mới chỉ dùng YouTube.</div><button type="button" className="button secondary" onClick={() => update({ mediaType: 'youtube', mediaUrl: '' })}>Chuyển sang YouTube</button></div> : <div className="field"><label>Đường dẫn YouTube *</label><input value={q.mediaUrl} onChange={e => update({ mediaUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." /><small>Hệ thống chỉ lưu đường dẫn và thời điểm bắt đầu. Người tạo có thể xem video gốc; trong phòng chơi, video được che để giữ bí mật đáp án.</small></div>}
        <div className="form-row"><div className="field"><label>Bắt đầu (giây hoặc mm:ss) *</label><input type="text" value={q.mediaStart} onChange={e => update({ mediaStart: e.target.value })} onBlur={() => { const seconds = parseStartTime(q.mediaStart); if (seconds !== null) update({ mediaStart: formatStartTime(seconds) }); }} placeholder="Ví dụ: 0 hoặc 01:15" aria-invalid={parseStartTime(q.mediaStart) === null} /><small>Tối thiểu 0 giây. Từ 60 giây, thời điểm sẽ hiện dạng phút:giây.</small></div><div className="field"><label>Thời lượng nghe thử</label><select value={previewDuration} onChange={e => setPreviewDuration(Number(e.target.value))}>{[1, 3, 5, 10].map(n => <option key={n} value={n}>{n} giây</option>)}</select></div></div>
        {q.mediaType === 'youtube' && youtubeId(q.mediaUrl) && parseStartTime(q.mediaStart) !== null && <ClipPlayer key={`${q.mediaUrl}-${q.mediaStart}-${previewDuration}`} url={q.mediaUrl} start={parseStartTime(q.mediaStart)!} duration={previewDuration} preview />}
        {q.mediaType === 'uploaded_audio' && q.mediaUrl.startsWith('asset:') && parseStartTime(q.mediaStart) !== null && <AudioClipPlayer key={`${q.mediaUrl}-${q.mediaStart}-${previewDuration}`} asset={q.mediaUrl} start={parseStartTime(q.mediaStart)!} duration={previewDuration} preview />}
        </>}
        <div className="divider" /><div className="field"><label>Đáp án chính *</label><input value={q.primaryAnswer} onChange={e => update({ primaryAnswer: e.target.value })} placeholder="Tên bài hát" /></div><div className="field"><label>Đáp án chấp nhận thêm</label><textarea value={q.acceptedAnswers.join('\n')} onChange={e => update({ acceptedAnswers: e.target.value.split('\n') })} placeholder="Mỗi đáp án một dòng" /><small>Tự động bỏ qua chữ hoa, dấu câu và dấu tiếng Việt.</small></div><div className="field"><label>Nghệ sĩ (tuỳ chọn)</label><input value={q.artist} onChange={e => update({ artist: e.target.value })} /></div>
        {!clueMode && q.mediaType === 'youtube' && <div className="result-clip-settings"><label className="result-clip-toggle"><input type="checkbox" checked={q.resultStart !== null} onChange={e => update({ resultStart: e.target.checked ? q.mediaStart : null, resultSeconds: e.target.checked ? 10 : null })} /> Phát đoạn video khi công bố đáp án</label><p className="muted">Sau khi hiện đáp án, cả phòng sẽ thấy và nghe đoạn YouTube bạn chọn trước khi sang bảng điểm.</p>{q.resultStart !== null && <div className="form-row"><div className="field"><label>Bắt đầu đoạn kết quả (giây hoặc mm:ss)</label><input value={q.resultStart} onChange={e => update({ resultStart: e.target.value })} onBlur={() => { const seconds = parseStartTime(q.resultStart ?? ''); if (seconds !== null) update({ resultStart: formatStartTime(seconds) }); }} placeholder="Ví dụ: 0 hoặc 01:15" aria-invalid={parseStartTime(q.resultStart) === null} /></div><div className="field"><label>Phát trong bao lâu (giây)</label><input type="number" min="1" max="60" value={q.resultSeconds ?? ''} onChange={e => update({ resultSeconds: Number(e.target.value) })} /></div></div>}</div>}
        {!clueMode && activeRound === 2 && <><div className="divider" /><h3>Thời gian đấu giá</h3><p className="muted">Số giây người chơi chọn quyết định độ dài đoạn nhạc được nghe.</p><div className="form-row three"><div className="field"><label>Nhỏ nhất</label><input type="number" min="1" value={q.revealMin} onChange={e => update({ revealMin: Number(e.target.value) })} /></div><div className="field"><label>Lớn nhất</label><input type="number" max="30" value={q.revealMax} onChange={e => update({ revealMax: Number(e.target.value) })} /></div><div className="field"><label>Bước</label><input type="number" min="1" value={q.revealStep} onChange={e => update({ revealStep: Number(e.target.value) })} /></div></div></>}
      </>}</section></div>{reviewOpen && q && (clueMode ? <CluePreview clues={q.clues?.length===5?q.clues:blankClues()} title={q.primaryAnswer} artist={q.artist} onClose={()=>setReviewOpen(false)}/> : <QuestionReview key={selected} question={q} topicName={selectedTopic.title} onClose={() => setReviewOpen(false)} />)}</main>;
}
export default function CreatePage() { return <Suspense fallback={<main className="page">Đang tải trang chỉnh sửa…</main>}><Creator /></Suspense>; }

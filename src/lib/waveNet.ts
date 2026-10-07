import { createSign } from 'node:crypto';
import { audioFromWaveNet } from './narrationAudio.ts';

export type NarrationLanguage = 'vi-VN' | 'en-US';
export const waveNetVoice = (language: NarrationLanguage = 'vi-VN') => language === 'en-US' ? 'en-US-Wavenet-F' : process.env.GOOGLE_TTS_VOICE || 'vi-VN-Wavenet-A';
export const waveNetConfigured = () => !!process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON;
let accessToken: { value: string; expires: number; credentials: string } | undefined;
let refreshing: Promise<string> | undefined;

async function googleAccessToken(): Promise<string> {
  const credentials = process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON || '';
  if (accessToken?.credentials === credentials && accessToken.expires > Date.now() + 60_000) return accessToken.value;
  if (refreshing) return refreshing;
  const pending = (async () => {
    let account: { client_email?: string; private_key?: string };
    try { account = JSON.parse(credentials); }
    catch { throw new Error('Thông tin tài khoản dịch vụ Google Cloud không hợp lệ.'); }
    if (!account?.client_email || !account.private_key) throw new Error('Thiếu email hoặc khóa tài khoản dịch vụ Google Cloud.');
    const issued = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: issued, exp: issued + 3600 })}`;
    let signature: string;
    try { signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url'); }
    catch { throw new Error('Khóa tài khoản dịch vụ Google Cloud không hợp lệ.'); }
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error('Không xác thực được Google Cloud. Kiểm tra tài khoản dịch vụ trên máy chủ.');
    const result = await response.json() as { access_token?: string; expires_in?: number };
    if (!result.access_token || !Number.isFinite(result.expires_in) || result.expires_in! <= 0) throw new Error('Google Cloud không trả về phiên xác thực hợp lệ.');
    accessToken = { value: result.access_token, expires: Date.now() + result.expires_in! * 1000, credentials };
    return result.access_token;
  })();
  refreshing = pending;
  try { return await pending; } finally { refreshing = undefined; }
}

export async function generateWaveNetSpeech(text: string, language: NarrationLanguage = 'vi-VN'): Promise<Buffer> {
  const voice = waveNetVoice(language);
  if (!(language === 'en-US' ? voice === 'en-US-Wavenet-F' : /^vi-VN-Wavenet-[A-D]$/.test(voice))) throw new Error('Hãy chọn giọng WaveNet tiếng Việt A, B, C hoặc D.');
  if (!text.trim() || text.length > 1600 || Buffer.byteLength(text, 'utf8') > 5000) throw new Error('Nội dung đọc quá dài hoặc không hợp lệ.');
  const token = await googleAccessToken();
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ input: { text }, voice: { languageCode: language, name: voice }, audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: 1.05 } }),
    signal: AbortSignal.timeout(40_000)
  });
  if (response.status === 401) accessToken = undefined;
  if (!response.ok) throw new Error(response.status === 429 ? 'WaveNet đã đạt hạn mức giọng đọc. Thử lại sau.' : 'Không kết nối được WaveNet. Kiểm tra Cloud Text-to-Speech API, billing và quyền tài khoản dịch vụ.');
  return audioFromWaveNet(await response.json());
}

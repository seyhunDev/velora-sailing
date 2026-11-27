// Sesli anlatım dosyaları: node scripts/tts.mjs  (build.mjs'ten SONRA çalışır, dist/ses/ yazar)
// - Her senaryonun (`narration: false` hariç) her adımı (başlık + metin, SailNarr.speechText) ve ayarlardaki
//   örnek cümle, SailNarr.VOICES içindeki her ses için Google Cloud Text-to-Speech ile MP3'e çevrilir.
// - Anahtar: GOOGLE_TTS_KEY ortam değişkeni (GitHub → Settings → Secrets → Actions). Sesli asistandaki
//   (seyhunDev/sesliasistan, Netlify) anahtarın aynısı. Anahtar istemciye hiç gitmez.
// - Önbellek: .tts-cache/<ses>/<key>.mp3 (GitHub Actions cache). Metin değişmedikçe yeniden üretilmez → ücret yok.
// - Anahtar yoksa ya da bir dosya üretilemezse yayın DURMAZ: o adım cihazın kendi sesiyle okunur.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
require('../src/js/scenarios.js'); require('../src/js/narration.js');
const N = globalThis.SailNarr;

const CACHE = '.tts-cache', OUT = join('dist', 'ses');
const KEY = process.env.GOOGLE_TTS_KEY || '';
// Gemini-TTS kimlik ister (aiplatform.endpoints.predict): servis hesabına bağlı ayrı anahtar GEMINI_TTS_KEY; yoksa KEY denenir
const GKEY = process.env.GEMINI_TTS_KEY || KEY;
const only = process.argv.includes('--cache-only');   // yerelde: yalnız önbellekte olanı kopyala

const texts = new Set([N.SAMPLE]);
for (const s of globalThis.SCENARIOS.filter(x => x.narration !== false))
  for (const st of s.steps) texts.add(N.speechText(st.title, st.text));

// Önce Gemini sesi (anlatıcı yönergesiyle doğal, akıcı okur), sırayla şu yollar denenir:
//  1) Cloud Text-to-Speech + Gemini modeli (düz API anahtarı kimlik taşımadığı için 2026-11-25'te reddedildi)
//  2) Vertex AI generateContent (servis hesabına bağlı GEMINI_TTS_KEY ile), PCM döner → ffmpeg ile MP3
// Bir yol 4xx verirse bir kez uyarı yazar, sıradakine geçer; hepsi kapanırsa Chirp 3 HD.
import { spawnSync } from 'node:child_process';
const GEMINI_MODEL = process.env.TTS_GEMINI_MODEL || 'gemini-2.5-flash-tts';
const PROJECT = process.env.TTS_PROJECT || '828345188662';   // sesli asistanın Google Cloud projesi (numarası gizli değil)
const STYLE = 'Sekiz ile on dört yaş arası yelkenci çocuklara ders anlatan sıcak, sakin ve neşeli bir antrenör gibi oku. ' +
  'Doğal bir hızda, cümleleri birbirine bağlayarak, akıcı bir sohbet tonuyla konuş; robot gibi kesik kesik okuma. ' +
  'Bütün kelimeleri Türkçe okunuşuyla oku, yelken terimlerini yabancı kelime gibi okuma.';
const used = { gemini: 0, chirp: 0 };
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
// Vertex kotası düşük (dakikada birkaç istek): istekler sıraya girer. Bütçe dolunca kalan metinler Chirp ile çıkar,
// sonraki yayında Gemini yeniden denenir (Chirp dosyaları ayrı saklanıyor).
const RPM = +(process.env.TTS_GEMINI_RPM || 8), BUDGET = +(process.env.TTS_GEMINI_MINUTES || 25) * 60000, T0 = Date.now();
let nextAt = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gate() { const now = Date.now(), at = Math.max(now, nextAt); nextAt = at + 60000 / RPM; if (at > now) await sleep(at - now); }
async function post(url, body) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(body) });
    const raw = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 300)}`);
    return JSON.parse(raw);
  } finally { clearTimeout(timer); }
}
async function cloudTts(body, key) {
  const j = await post(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, body);
  if (!j.audioContent) throw new Error('ses verisi yok');
  return Buffer.from(j.audioContent, 'base64');
}
function pcmToMp3(pcm, rate) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', 'pipe:0',
    '-codec:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', 'pipe:1'], { input: pcm, maxBuffer: 64 << 20 });
  if (r.status !== 0 || !r.stdout?.length) throw new Error('ffmpeg: ' + String(r.stderr || r.error || '').slice(0, 200));
  return r.stdout;
}
async function vertex(model, voice, text) {
  if (!HAS_FFMPEG) throw new Error('400 ffmpeg yok');
  await gate();
  const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(GKEY)}`;
  const j = await post(url, {
    contents: [{ role: 'user', parts: [{ text: STYLE + ' Şu metni oku:\n' + text }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
  });
  const part = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
  if (!part) throw new Error('ses verisi yok');
  const rate = +(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000);
  return pcmToMp3(Buffer.from(part.inlineData.data, 'base64'), rate);
}
const ROUTES = [
  { id: 'Cloud TTS ' + GEMINI_MODEL, run: (v, t) => cloudTts({ input: { prompt: STYLE, text: t }, voice: { languageCode: 'tr-TR', name: v, modelName: GEMINI_MODEL }, audioConfig: { audioEncoding: 'MP3' } }, GKEY) },
  { id: 'Vertex ' + GEMINI_MODEL, run: (v, t) => vertex(GEMINI_MODEL, v, t) },
  { id: 'Vertex gemini-2.5-flash-preview-tts', run: (v, t) => vertex('gemini-2.5-flash-preview-tts', v, t) }
];
let route = process.env.TTS_ENGINE === 'chirp' ? ROUTES.length : 0;
let geminiOff = route >= ROUTES.length;
const geminiVia = {};
let budgetMsg = false;
async function synth(voice, text) {
  while (route < ROUTES.length) {
    const r = route, R = ROUTES[r];
    let hard = false;
    for (let tryN = 0; tryN < 4; tryN++) {
      if (Date.now() - T0 > BUDGET) { if (!budgetMsg) { budgetMsg = true; console.log('  ⚠ Gemini süresi doldu, kalan metinler bu yayında Chirp ile'); } break; }
      try {
        const mp3 = await R.run(voice, text);
        used.gemini++; geminiVia[R.id] = (geminiVia[R.id] || 0) + 1; return { mp3, gemini: true };
      } catch (e) {
        const m = String(e.message);
        if (/^(400|401|403|404)/.test(m)) {
          hard = true;
          if (route === r) { route++; console.log(`  ⚠ Gemini yolu olmadı (${R.id}): ${m.slice(0, 260)}`); }
          break;
        }
        if (/^ffmpeg/.test(m)) { console.log('  ⚠ ' + m.slice(0, 160)); break; }   // ses geldi ama çevrilemedi: yeniden isteme
        // 429 kota / 5xx / zaman aşımı: kuyruğu yavaşlat, bekle, yeniden dene; olmazsa bu dosya Chirp ile
        if (/^429/.test(m)) nextAt = Math.max(nextAt, Date.now()) + 20000;
        if (tryN < 3) await sleep(5000 * (tryN + 1));
        else console.log(`  ⚠ Gemini bu metinde olmadı, Chirp: ${m.slice(0, 120)}`);
      }
    }
    if (!hard) break;
  }
  if (route >= ROUTES.length) geminiOff = true;
  const mp3 = await cloudTts({ input: { text }, voice: { languageCode: 'tr-TR', name: `tr-TR-Chirp3-HD-${voice}` }, audioConfig: { audioEncoding: 'MP3' } }, KEY);
  used.chirp++; return { mp3, gemini: false };
}

const index = { voices: {} };
let made = 0, cached = 0, failed = 0, chars = 0, stopped = false;
// Aynı anda 6 istek (700+ dosya sırayla ~30 dk sürerdi); 401/403 gelirse durur
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }
for (const v of N.VOICES) {
  const cdir = join(CACHE, v.id), odir = join(OUT, v.id);
  mkdirSync(cdir, { recursive: true }); mkdirSync(odir, { recursive: true });
  const keys = [];
  await pool([...texts], 4, async text => {
    // Gemini sesi <key>.mp3 olarak saklanır; Gemini olmayınca üretilen Chirp sesi <key>.chirp.mp3 olur ve
    // bir sonraki yayında Gemini yeniden denenir (Gemini kapalıysa Chirp dosyası önbellekten kullanılır).
    const k = N.key(v.id, text), gf = join(cdir, k + '.mp3'), chf = join(cdir, k + '.chirp.mp3');
    let cf = gf;
    if (existsSync(gf)) cached++;
    else if (existsSync(chf) && (!KEY || only || stopped || geminiOff)) { cf = chf; cached++; }
    else {
      if (!KEY || only || stopped) return;
      try {
        const r = await synth(v.id, text);
        cf = r.gemini ? gf : chf; writeFileSync(cf, r.mp3); made++; chars += text.length;
      } catch (e) {
        if (existsSync(chf)) cf = chf;
        else { failed++; console.log(`  ⚠ ${v.id}: ${String(e.message).slice(0, 200)}`); if (/^(401|403)/.test(e.message)) stopped = true; return; }
      }
    }
    copyFileSync(cf, join(odir, k + '.mp3')); keys.push(k);
  });
  if (keys.length) index.voices[v.id] = keys;
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
console.log(`Sesli anlatım: ${texts.size} metin × ${N.VOICES.length} ses · yeni ${made} (${chars} harf), önbellekten ${cached}, hata ${failed} · Gemini ${used.gemini} ${JSON.stringify(geminiVia)}, Chirp ${used.chirp}` +
  (KEY ? '' : ' · GOOGLE_TTS_KEY yok: cihaz sesi kullanılacak'));

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

// Önce Gemini-TTS (Cloud Text-to-Speech, aynı anahtar): anlatıcı yönergesiyle doğal, akıcı okur.
// Model kabul edilmezse (yetki / bölge / API kapalı) bir kez uyarı yazar, gerisi Chirp 3 HD ile üretilir.
const GEMINI_MODEL = process.env.TTS_GEMINI_MODEL || 'gemini-2.5-flash-tts';
const STYLE = 'Sekiz ile on dört yaş arası yelkenci çocuklara ders anlatan sıcak, sakin ve neşeli bir antrenör gibi oku. ' +
  'Doğal bir hızda, cümleleri birbirine bağlayarak, akıcı bir sohbet tonuyla konuş; robot gibi kesik kesik okuma.';
let geminiOff = process.env.TTS_ENGINE === 'chirp';
const used = { gemini: 0, chirp: 0 };
async function call(body, key = KEY) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(body)
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 200)}`);
    const b64 = JSON.parse(raw).audioContent;
    if (!b64) throw new Error('ses verisi yok');
    return Buffer.from(b64, 'base64');
  } finally { clearTimeout(timer); }
}
async function synth(voice, text) {
  if (!geminiOff) {
    for (let tryN = 0; tryN < 4; tryN++) {
      try {
        const mp3 = await call({ input: { prompt: STYLE, text }, voice: { languageCode: 'tr-TR', name: voice, modelName: GEMINI_MODEL }, audioConfig: { audioEncoding: 'MP3' } }, GKEY);
        used.gemini++; return { mp3, gemini: true };
      } catch (e) {
        if (/^(400|401|403|404)/.test(e.message)) { geminiOff = true; console.log(`  ⚠ Gemini-TTS kullanılamadı, Chirp 3 HD'ye geçildi: ${String(e.message).slice(0, 200)}`); break; }
        // 429 / 5xx / zaman aşımı: bekleyip yeniden dene; olmazsa bu dosya Chirp ile
        if (tryN < 3) await new Promise(r => setTimeout(r, 4000 * (tryN + 1)));
        else console.log(`  ⚠ Gemini-TTS bu metinde olmadı, Chirp: ${String(e.message).slice(0, 120)}`);
      }
    }
  }
  const mp3 = await call({ input: { text }, voice: { languageCode: 'tr-TR', name: `tr-TR-Chirp3-HD-${voice}` }, audioConfig: { audioEncoding: 'MP3' } });
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
console.log(`Sesli anlatım: ${texts.size} metin × ${N.VOICES.length} ses · yeni ${made} (${chars} harf), önbellekten ${cached}, hata ${failed} · Gemini ${used.gemini}, Chirp ${used.chirp}` +
  (KEY ? '' : ' · GOOGLE_TTS_KEY yok: cihaz sesi kullanılacak'));

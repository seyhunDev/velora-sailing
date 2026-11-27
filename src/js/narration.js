/* Sesli anlatım (SailNarr): senaryonun bilgi kartı adımlarını sesle okur (kullanıcı 2026-11-23, pilot İA1).
   - Ses dosyaları yayın sırasında üretilir (scripts/tts.mjs, Google Cloud Text-to-Speech, anahtar yalnız
     GitHub Actions'ta: GOOGLE_TTS_KEY). Tarayıcı hazır MP3'ü çalar: anahtar istemciye hiç gelmez.
     Dosya adı = ses + metnin özeti (key), dist/ses/<ses>/<key>.mp3; liste dist/ses/index.json.
   - O adımın dosyası yoksa (anahtar yok / yeni metin) cihazın kendi Türkçe sesiyle okunur (speechSynthesis).
   - Tüm senaryolarda (kullanıcı 2026-11-23 "hepsine ekle"; `narration: false` kapatır) oynat çubuğunda hoparlör düğmesi görünür. Anlatım açıkken animasyon
     normal hızda oynar; bir adımın anlatımı bitmeden sonraki adıma gelinirse animasyon orada bekler (app.js).
   Node'da da yüklenir (scripts/tts.mjs): speechText + key aynı olmalı ki dosya adları tutsun. */
(function (global) {
  // Google Chirp 3 HD Türkçe ses. Kullanıcı 2026-11-23 üç örnekten Aoede'yi (Kadın 1) seçti; diğerleri
  // (Kore, Charon) yayında üretilmesin diye listeden çıktı. Ses eklemek: listeye { id, label } ekle.
  const VOICES = [
    { id: 'Aoede', label: 'Kadın · sıcak' }
  ];
  const DEFAULT_VOICE = 'Aoede';
  // Ses motoru sürümü (dosya adına girer; değişince bütün sesler yeniden üretilir). 'g2': Gemini-TTS, anlatıcı yönergesiyle
  // (kullanıcı 2026-11-24: "hiç akıcı değil"; Vertex AI API 2026-11-25 açıldı), olmazsa Chirp 3 HD (scripts/tts.mjs).
  const ENGINE = 'g2';
  const SAMPLE = 'Merhaba! Bu dersi ben anlatacağım. Rüzgar üç yüz elli dereceden esiyor; pin hafif avantajlı.';

  // Ekranda okunan metni konuşmaya uygun hale getirir (kısaltmalar, simgeler, BÜYÜK harfle vurgu)
  function speechText(title, text) {
    const ORD = ['', 'birincisi', 'ikincisi', 'üçüncüsü', 'dördüncüsü'];
    let s = (title ? title.trim() + (/[.:!?]$/.test(title.trim()) ? ' ' : '. ') : '') + (text || '');
    s = s.replace(/[“”"«»]/g, '').replace(/\s*\(([^)]*)\)/g, ', $1,')   // tırnak yok, parantez → virgül
      .replace(/[≈~]\s*/g, 'yaklaşık ').replace(/%\s*(\d+)/g, 'yüzde $1').replace(/(\d+)\s*%/g, 'yüzde $1')
      .replace(/(\d)\s*×/g, '$1 kat').replace(/\s*\/\s*/g, ' ya da ').replace(/−/g, 'eksi ')
      .replace(/\s*→\s*/g, ', ').replace(/\s*·\s*/g, ', ').replace(/\s\+\s/g, ' ve ')
      .replace(/(\d)\s*°/g, '$1 derece')
      // ondalık sayılar yazıyla (kullanıcı 2026-11-23: "2.5 sn" "iki buçuk saniye" okunmalı): 2.5 → iki buçuk, 1.3 → bir virgül üç
      .replace(/\b(\d{1,3})[.,](\d)\b/g, (m, a, b) => a === '0' && b === '5' ? 'yarım' : numTr(+a) + (b === '5' ? ' buçuk' : ' virgül ' + numTr(+b)))
      .replace(/(\d)\s*-\s*(\d)/g, '$1 $2')               // 3-4 boy → üç dört boy
      .replace(/\bsn\b/g, 'saniye').replace(/\bdk\b/g, 'dakika')
      .replace(/yarım-bir/g, 'yarım ile bir')
      .replace(/\(\s*([1-4])\s*\)/g, (m, d) => ORD[d] + ',')   // (1) → birincisi,
      // kesme işaretli kelimeler (kullanıcı 2026-11-23: "layline'ın" ayrı ayrı okunup anlaşılmıyordu):
      // önce yabancı kelimelerin okunuşu, sonra tek harf / sayı + ek okunuşuyla birleşir, kalan kesmeler silinir
      .replace(/\b(layline|header|zone|px)(?=['’\s.,;:!?)]|$)/gi, w => SAY[w.toLowerCase()] || w)
      // tramola: ses motoru "tramole" gibi okuyordu (kullanıcı 2026-11-27); Türkçe okunuşla yaz (tramolayla, tramolada… ekler korunur)
      .replace(/(^|[^\wÇĞİÖŞÜçğıöşü])([Tt])ramola/g, (m, pre, T) => pre + (T === 'T' ? 'Tıramola' : 'tıramola'))
      .replace(/(^|[^\wÇĞİÖŞÜçğıöşü])([A-ZÇĞİÖŞÜ])['’]([a-zçğıöşü]+)/g, (m, pre, L, ek) => pre + (LETTER[L] || L) + ek)
      .replace(/\b(\d{1,3})['’]([a-zçğıöşü]+)/g, (m, n, ek) => numTr(+n) + ek)
      .replace(/([\wÇĞİÖŞÜçğıöşü])['’](?=[a-zçğıöşü])/g, '$1')
      // tamamı büyük harf vurgu kelimeleri harf harf okunmasın (3+ harf, rakamsız)
      .replace(/[A-ZÇĞİÖŞÜ]{3,}/g, w => w.toLocaleLowerCase('tr'))
      .replace(/\s+([,.;:])/g, '$1').replace(/,([,.;:])/g, '$1').replace(/\s+/g, ' ').trim();
    return s;
  }
  // Okunuşlar: yabancı kelimeler ve harf adları (ekle birleşince doğru okunsun: "Z'nin" → "Zenin")
  const SAY = { layline: 'leylayn', header: 'hedır', zone: 'zon', px: 'piksel' };
  const LETTER = { A: 'A', B: 'Be', C: 'Ce', Ç: 'Çe', D: 'De', E: 'E', F: 'Fe', G: 'Ge', H: 'He', I: 'I', İ: 'İ', J: 'Je', K: 'Ke', L: 'Le',
    M: 'Me', N: 'Ne', O: 'O', Ö: 'Ö', P: 'Pe', R: 'Re', S: 'Se', Ş: 'Şe', T: 'Te', U: 'U', Ü: 'Ü', V: 'Ve', W: 'Dabılyu', X: 'İks', Y: 'Ye', Z: 'Ze' };
  function numTr(n) {
    const B = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'], O = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
    if (n === 0) return 'sıfır';
    const y = Math.floor(n / 100), o = Math.floor(n / 10) % 10, b = n % 10;
    return ((y ? (y > 1 ? B[y] : '') + 'yüz' : '') + O[o] + B[b]);
  }
  // FNV-1a, iki tohum → 16 hane (metin + ses değişince dosya adı değişir)
  function fnv(str, h) { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function key(voice, text) {
    const s = voice + '|' + ENGINE + '|' + text;
    return fnv(s, 2166136261).toString(16).padStart(8, '0') + fnv(s, 0x9747b28c).toString(16).padStart(8, '0');
  }
  const api = { VOICES, DEFAULT_VOICE, SAMPLE, speechText, key };
  global.SailNarr = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // ---------- Tarayıcı: oynatıcı ----------
  const LS = 'velora.narr.v1';
  let prefs = { on: true, voice: DEFAULT_VOICE };
  try { prefs = Object.assign(prefs, JSON.parse(localStorage.getItem(LS)) || {}); } catch (e) { /* yok */ }
  if (!VOICES.some(v => v.id === prefs.voice)) prefs.voice = DEFAULT_VOICE;
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(prefs)); } catch (e) { /* yok */ } };

  let index = null;                       // { voices: { Aoede: ['key', …] } } → Set
  const ready = fetch('ses/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null).then(j => {
    index = {};
    if (j && j.voices) for (const [v, keys] of Object.entries(j.voices)) index[v] = new Set(keys);
  });
  const hasFile = (voice, k) => !!(index && index[voice] && index[voice].has(k));

  const audio = new Audio(); audio.preload = 'auto';
  let token = 0;                          // her yeni konuşma eskisini geçersiz kılar
  let busy = false, paused = false, mode = '';   // mode: 'file' | 'device'
  let onChange = () => {};
  const set = b => { if (!b) clearTimeout(dog); if (busy !== b) { busy = b; onChange(busy); } };
  // Bekçi: ses hiç bitmezse (cihazda Türkçe ses yok, ağ takıldı) animasyon sonsuza dek beklemesin.
  // Süre metin uzunluğundan tahmin edilir (~12 harf/sn, bolca pay); duraklatınca kalan süre saklanır.
  let dog = 0, dogLeft = 0, dogAt = 0;
  function arm(ms, my) { clearTimeout(dog); dogLeft = ms; dogAt = Date.now(); dog = setTimeout(() => { if (my === token) set(false); }, ms); }

  // iOS: ses ancak bir dokunuşun içinde başlatılmış öğeyle çalar. İlk oynatışta sessiz bir ses çalınıp öğe açılır.
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
  let unlocked = false;
  function unlock() {
    if (unlocked) return; unlocked = true;
    try { audio.src = SILENT; const p = audio.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* yok */ }
    try { if (global.speechSynthesis) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) { /* yok */ }
  }

  // Cihaz sesi: uzun metin Chrome'da ~15 sn'de kesilir → cümle cümle sıraya koy
  let trVoice = null;
  function pickDeviceVoice() {
    if (!global.speechSynthesis) return null;
    const vs = speechSynthesis.getVoices().filter(v => /^tr/i.test(v.lang));
    trVoice = vs.find(v => /google|neural|natural|yelda|premium|enhanced/i.test(v.name)) || vs[0] || null;
    return trVoice;
  }
  if (global.speechSynthesis) { pickDeviceVoice(); speechSynthesis.onvoiceschanged = pickDeviceVoice; }
  function speakDevice(text, my) {
    if (!global.speechSynthesis) { set(false); return; }
    speechSynthesis.cancel();
    const parts = text.match(/[^.!?;:]+[.!?;:]*/g) || [text];
    mode = 'device'; set(true);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim()); u.lang = 'tr-TR'; if (trVoice) u.voice = trVoice; u.rate = 1.02;
      if (i === parts.length - 1) u.onend = u.onerror = () => { if (my === token) set(false); };
      try { speechSynthesis.speak(u); } catch (e) { if (my === token) set(false); }
    });
  }
  function speakFile(src, text, my) {
    mode = 'file'; set(true);
    audio.onended = () => { if (my === token) set(false); };
    audio.onerror = () => { if (my === token) speakDevice(text, my); };   // dosya gelmezse cihaz sesi
    audio.src = src; audio.currentTime = 0;
    const p = audio.play(); if (p && p.catch) p.catch(() => { if (my === token && !paused) speakDevice(text, my); });
  }
  function speak(text, voice) {
    const my = ++token; paused = false;
    try { audio.pause(); } catch (e) { /* yok */ }
    if (global.speechSynthesis) speechSynthesis.cancel();
    voice = voice || prefs.voice;
    arm(3000 + text.length / 12 * 1000 * 1.6, my);
    const go = () => {
      if (my !== token) return;
      const k = key(voice, text);
      if (hasFile(voice, k)) speakFile(`ses/${voice}/${k}.mp3`, text, my); else speakDevice(text, my);
    };
    if (index) go(); else { set(true); ready.then(go); }
  }
  function stop() {
    token++; paused = false;
    try { audio.pause(); } catch (e) { /* yok */ }
    if (global.speechSynthesis) speechSynthesis.cancel();
    set(false);
  }
  function pause() {
    if (!busy || paused) return; paused = true;
    if (mode === 'file') audio.pause(); else if (global.speechSynthesis) speechSynthesis.pause();
    clearTimeout(dog); dogLeft = Math.max(1000, dogLeft - (Date.now() - dogAt));
  }
  function resume() {
    if (!paused) return; paused = false;
    arm(dogLeft, token);
    if (mode === 'file') { const p = audio.play(); if (p && p.catch) p.catch(() => {}); } else if (global.speechSynthesis) speechSynthesis.resume();
  }
  // Ses Google dosyasından mı (true) yoksa cihazdan mı çalacak: ayarlarda gösterilir
  const fileVoices = () => ready.then(() => VOICES.filter(v => index[v.id] && index[v.id].size).map(v => v.id));

  // on / voice canlı okunmalı: Object.assign getter'ı bir kez kopyalar, o yüzden defineProperty
  Object.defineProperty(api, 'on', { get: () => prefs.on });
  Object.defineProperty(api, 'voice', { get: () => prefs.voice });
  Object.assign(api, {
    setOn(b) { prefs.on = !!b; save(); if (!b) stop(); },
    setVoice(v) { if (VOICES.some(x => x.id === v)) { prefs.voice = v; save(); } },
    busy: () => busy, paused: () => paused,
    speak, stop, pause, resume, unlock, fileVoices, onBusy(fn) { onChange = fn; }
  });
})(typeof window !== 'undefined' ? window : globalThis);

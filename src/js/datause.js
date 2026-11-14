// Veri kullanımı (VeloraData): uygulamanın bu tarayıcıda ağdan ne kadar veri indirdiğini sayar.
// Kaynak: tarayıcının Resource Timing kayıtları (performance 'navigation' + 'resource').
// transferSize = ağdan gelen bayt (başlıklar dahil); önbellekten gelen dosyada 0 → "önbellekten" sayılır.
// Başka sitelerden gelen ve süre izni (Timing-Allow-Origin) vermeyen dosyalar 0 görünür → "ölçülemeyen"
// olarak ayrıca sayılır; bu yüzden toplam bir TAHMİNDİR (gerçek değer biraz daha yüksek olabilir).
// Yalnız bu tarayıcıda (localStorage 'velora.data.v1') tutulur, hiçbir yere gönderilmez.
// Her sayfada <head> içinde app-shell.js'ten hemen sonra yüklenir. Menüdeki "Veri kullanımı" → VeloraData.open().
(function () {
  const KEY = 'velora.data.v1';
  const KINDS = { page: 'Sayfalar', script: 'Uygulama kodu', style: 'Görünüm (CSS)', image: 'Görseller', font: 'Yazı tipleri', api: 'Hesap ve kayıt bağlantıları', other: 'Diğer' };
  const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const blank = () => ({ since: Date.now(), total: 0, files: 0, cached: 0, unknown: 0, pages: 0, kinds: {}, days: {} });
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && typeof v.total === 'number') return v; } catch (e) { /* bozuk ya da kapalı */ }
    return blank();
  }
  // bu sekmenin henüz diske yazılmamış sayımı; kaydederken diskteki değerin üstüne eklenir (birden çok sekme güvenli)
  const blankPend = () => ({ total: 0, files: 0, cached: 0, unknown: 0, pages: 0, kinds: {}, days: {} });
  let pend = blankPend();
  const session = { total: 0 };
  const seen = new Set();
  let timer = 0;

  function kindOf(e) {
    if (e.entryType === 'navigation') return 'page';
    const t = e.initiatorType, u = e.name.split('?')[0].toLowerCase();
    if (/\.(woff2?|ttf|otf)$/.test(u)) return 'font';
    if (/\.css$/.test(u)) return 'style';
    if (/\.m?js$/.test(u)) return 'script';
    if (/\.(png|jpe?g|svg|webp|gif|ico)$/.test(u) || t === 'img' || t === 'image') return 'image';
    if (/\.html?$/.test(u) || t === 'iframe') return 'page';
    if (t === 'fetch' || t === 'xmlhttprequest' || t === 'beacon') return 'api';
    if (t === 'script') return 'script';
    return 'other';
  }

  function add(e) {
    if (!e || !e.name || e.name.startsWith('data:') || e.name.startsWith('blob:')) return;
    const id = e.entryType + '|' + e.name + '|' + Math.round(e.startTime);
    if (seen.has(id)) return;
    seen.add(id);
    const b = e.transferSize || 0;
    // süre izni yok: tarayıcı boyutu gizler (hepsi 0). Önbellek mi ağ mı bilinemez → ölçülemeyen.
    const hidden = !e.name.startsWith(location.origin) && !b && !e.encodedBodySize && !e.decodedBodySize;
    pend.files++;
    if (hidden) pend.unknown++;
    else if (b === 0) pend.cached++;
    if (e.entryType === 'navigation') pend.pages++;
    if (b > 0) {
      const k = kindOf(e), d = day();
      session.total += b; pend.total += b;
      pend.kinds[k] = (pend.kinds[k] || 0) + b;
      pend.days[d] = (pend.days[d] || 0) + b;
    }
    if (!timer) timer = setTimeout(save, 2000);
  }

  function save() {
    clearTimeout(timer); timer = 0;
    if (!pend.files) return;
    const st = load();
    for (const f of ['total', 'files', 'cached', 'unknown', 'pages']) st[f] += pend[f];
    for (const k in pend.kinds) st.kinds[k] = (st.kinds[k] || 0) + pend.kinds[k];
    for (const d in pend.days) st.days[d] = (st.days[d] || 0) + pend.days[d];
    const keys = Object.keys(st.days).sort();            // 60 günden eskisini at
    while (keys.length > 60) delete st.days[keys.shift()];
    try { localStorage.setItem(KEY, JSON.stringify(st)); pend = blankPend(); } catch (e) { /* dolu ya da kapalı: bellekte kalır */ }
  }

  try {
    const po = new PerformanceObserver(list => list.getEntries().forEach(add));
    po.observe({ type: 'navigation', buffered: true });
    po.observe({ type: 'resource', buffered: true });
  } catch (e) {
    // eski tarayıcı: yüklemede bir kez topla
    addEventListener('load', () => { try { performance.getEntriesByType('navigation').concat(performance.getEntriesByType('resource')).forEach(add); } catch (x) { /* yok */ } });
  }
  try { performance.setResourceTimingBufferSize && performance.setResourceTimingBufferSize(1000); } catch (e) { /* yok */ }
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

  // ---------- gösterim ----------
  function fmt(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toLocaleString('tr-TR', { maximumFractionDigits: b < 10240 ? 1 : 0 })} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: b < 10 * 1024 * 1024 ? 2 : 1 })} MB`;
    return `${(b / 1024 ** 3).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} GB`;
  }
  function stats() {
    save();
    const st = load();
    const today = st.days[day()] || 0;
    let week = 0;
    for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); week += st.days[day(d)] || 0; }
    return { total: st.total, today, week, session: session.total, since: st.since, files: st.files, cached: st.cached, unknown: st.unknown, pages: st.pages, kinds: st.kinds };
  }
  function reset() {
    pend = blankPend();
    try { localStorage.setItem(KEY, JSON.stringify(blank())); } catch (e) { /* yok */ }
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function open() {
    const s = stats();
    const since = new Date(s.since).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    const rows = Object.keys(KINDS).filter(k => s.kinds[k] > 0).sort((a, b) => s.kinds[b] - s.kinds[a])
      .map(k => {
        const p = s.total ? s.kinds[k] / s.total : 0;
        return `<div class="du-row"><span>${KINDS[k]}</span><span class="du-bar"><i style="width:${Math.max(2, Math.round(p * 100))}%"></i></span><b>${fmt(s.kinds[k])}</b></div>`;
      }).join('');
    const hit = s.files ? Math.round(100 * s.cached / s.files) : 0;
    const d = document.createElement('div');
    d.className = 'gate';
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<div class="gate-card du-card">
      <div class="gate-brand"><div><div class="gate-name">Veri kullanımı</div><div class="gate-tag">Bu cihazda, bu tarayıcıda · ${esc(since)} tarihinden beri</div></div>
        <button class="icon gate-x" data-x title="Kapat" aria-label="Kapat"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
      <div class="du-body">
        <div class="du-tiles">
          <div class="du-tile"><small>Bugün</small><b>${fmt(s.today)}</b></div>
          <div class="du-tile"><small>Son 7 gün</small><b>${fmt(s.week)}</b></div>
          <div class="du-tile"><small>Toplam</small><b>${fmt(s.total)}</b></div>
        </div>
        <div class="du-line"><span>Bu sayfa açılalı</span><b>${fmt(s.session)}</b></div>
        <div class="du-line"><span>Açılan sayfa</span><b>${s.pages}</b></div>
        <div class="du-line"><span>Önbellekten gelen dosya</span><b>%${hit}</b></div>
        ${rows ? `<div class="du-h">Neye harcandı</div>${rows}` : ''}
        <div class="du-note">Tarayıcının ağdan indirdiği her dosya sayılır; önbellekten açılanlar veri harcamaz. Uygulamanın tamamı ilk açılışta yaklaşık 0,3 MB iner; sonraki açılışlar çoğunlukla önbellekten gelir. ${s.unknown ? `Başka sitelerden gelen ${s.unknown} dosyanın boyutu tarayıcı tarafından gizlendiği için sayılamadı; bu yüzden değerler tahmindir.` : 'Değerler tarayıcının bildirdiği boyutlardır (tahmin).'} Sayım yalnız bu tarayıcıda tutulur, hiçbir yere gönderilmez.</div>
        <div class="gate-actions"><button class="tb" data-reset>Sayacı sıfırla</button><button class="tb primary" data-x>Tamam</button></div>
      </div></div>`;
    document.body.appendChild(d);
    const close = () => d.remove();
    d.querySelectorAll('[data-x]').forEach(x => x.onclick = close);
    d.addEventListener('click', e => { if (e.target === d) close(); });
    const r = d.querySelector('[data-reset]');
    let armed = 0;
    r.onclick = () => {
      if (Date.now() - armed > 3000) { armed = Date.now(); r.textContent = 'Emin misin? Tekrar dokun'; return; }
      reset(); close(); open();
    };
  }

  window.VeloraData = { stats, open, reset, fmt };
})();

/* Yarış oluştur (havuz.html, kullanıcı 2026-11-14: "yarışı simülatörden değil, ana sayfadan / Yarışlar sayfasından kuralım").
   Antrenör formdan kurar: tekne sayısı, sınıf, geri sayım, bayrak, parkur, rüzgar, sabit sağanak, akıntı + yarış akışı
   (zamanlı rüzgar dönüşleri, şamandıranın arkasından inen sağanaklar) + bilgi notu, deneme hakkı, kim görür, son tarih.
   Kurulum sim-core'la üretilir (simülatörün varsayılan start kalabalığı, teknen ortada) → sailChallenges/{KOD}.
   "Simülatörde dene": taslak localStorage'a (ps.task.preview), sim.html?taslak=1 açılır, gönderilmez; "Forma dön" buraya getirir. */
(function () {
  const S = window.SailSim, D = window.SailTaskData;
  if (!S || !D) return;
  const { esc, store, clock, parseClock, setupChips, planLines, isDenied } = D;
  const $ = id => document.getElementById(id);
  const DRAFT = 'ps.task.form2', PREVIEW = 'ps.task.preview';
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPH[b % ALPH.length]).join('');

  // ---------- Seçenekler ----------
  const CLS = Object.keys(S.CLASSES).map(k => [k, S.CLASSES[k].name]);
  const GROUPS = [
    ['Yarış', [
      ['n', 'Tekne sayısı (sen dahil)', [[1, 'Yalnız sen'], [4, '4'], [6, '6'], [8, '8'], [12, '12'], [16, '16']]],
      ['cls', 'Tekne sınıfı', CLS],
      ['pre', 'Start geri sayımı', [[60, '1 dk'], [120, '2 dk'], [180, '3 dk'], [300, '5 dk']]],
      ['flag', 'Hazırlık bayrağı', [['P', 'P'], ['I', 'I'], ['Z', 'Z'], ['U', 'U'], ['Siyah', 'Siyah']]]
    ]],
    ['Parkur', [
      ['course', 'Parkur', [['trapez', 'Trapez (1-2-kapı-finiş)'], ['orsa', 'Yalnız orsa']]],
      ['line', 'Start hattı boyu', [[400, '8 boy'], [550, '11 boy'], [700, '14 boy']]],
      ['mark', 'Orsa şamandırası uzaklığı', [[650, '13 boy'], [950, '19 boy'], [1200, '24 boy']]]
    ]],
    ['Rüzgar ve deniz', [
      ['windKn', 'Rüzgar hızı', S.WIND_KN.map(v => [v, v + ' kn'])],
      ['bias', 'Start hattına göre rüzgar', [[-15, 'Pin 15°'], [-8, 'Pin 8°'], [0, 'Hatta dik'], [8, 'Hakem botu 8°'], [15, 'Hakem botu 15°']]],
      ['gust', 'Sabit sağanak', [['yok', 'Yok'], ['sol', 'Sol tarafta'], ['sag', 'Sağ tarafta'], ['iki', 'İki yanda']]],
      ['cur', 'Akıntı', [[0, 'Yok'], [1, 'Hafif'], [2, 'Orta'], [3, 'Güçlü']]]
    ]],
    ['Gönderim', [
      ['tries', 'Deneme hakkı', [[1, '1'], [2, '2'], [3, '3']]],
      ['vis', 'Tekrarları kim görür', [['all', 'Herkes'], ['after', 'Gönderen görür'], ['coach', 'Yalnız ben']]],
      ['due', 'Son tarih', [[0, 'Yok'], [1, '1 gün'], [3, '3 gün'], [7, '1 hafta'], [14, '2 hafta']]]
    ]]
  ];
  const STR = new Set(['cls', 'flag', 'course', 'gust', 'vis']);
  const DEG = [5, 10, 15, 20, 25, 30], HOLD = [[20, '20 sn'], [30, '30 sn'], [45, '45 sn'], [60, '1 dk'], [90, '1,5 dk'], [120, '2 dk'], [0, 'kalıcı']];
  const POS = [[-0.8, 'Sol'], [-0.4, 'Orta-sol'], [0, 'Orta'], [0.4, 'Orta-sağ'], [0.8, 'Sağ']];
  const PASS = [[60, 'Hızlı (1 dk)'], [90, 'Orta (1,5 dk)'], [150, 'Yavaş (2,5 dk)']];
  const blank = () => ({ name: `${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} antrenman yarışı`, note: '', hints: true,
    n: 8, cls: 'optimist', pre: 120, flag: 'P', course: 'trapez', line: 550, mark: 950, windKn: 8, bias: 0, gust: 'yok', cur: 0,
    tries: 3, vis: 'all', due: 7, plan: [] });

  // ---------- Kurulum ----------
  function buildSetup(f) {
    const course = { lineLen: f.line, markDist: f.mark, flag: f.flag, type: f.course === 'orsa' ? 'orsa' : 'trapez' };
    S.setCourse(course);
    const fleet = JSON.parse(JSON.stringify(S.defaultFleet(f.n)));
    const gx = d => ({ x: Math.round(S.MARK.x + d * 270), y: Math.round((S.MARK.y + S.LINE.pin.y) / 2), rx: 120, ry: 190 });
    const gusts = f.gust === 'sol' ? [gx(-1)] : f.gust === 'sag' ? [gx(1)] : f.gust === 'iki' ? [gx(-1), gx(1)] : [];
    const su = { fleet, wind: f.bias, gusts, course, sea: { ...S.SEA_DEFAULT, current: f.cur }, boat: { ...S.BOAT_DEFAULT, cls: f.cls, windKn: f.windKn, pre: f.pre, vis: 'normal' } };
    if (f.plan.length) su.plan = S.normPlan(f.plan);
    return su;
  }
  // parkurun küçük çizimi: hat, şamandıralar, finiş, tekneler, sabit sağanaklar, rüzgar oku
  function mapSvg(f, su) {
    const W = S.WORLD, L = S.LINE, w = f.bias, k = Math.max(W.w, W.h) / 600;   // dünya büyük: işaretler ekranda okunur boyda
    const r = v => Math.round(v * k);
    const marks = (S.CRS.marks || [S.MARK]).map(m => `<circle cx="${m.x}" cy="${m.y}" r="${r(9)}" fill="#fb923c" stroke="#fff" stroke-width="${r(2)}"/>`).join('');
    const fin = su.course.type === 'trapez' ? `<line x1="${S.FIN.pin.x}" y1="${S.FIN.pin.y}" x2="${S.FIN.boat.x}" y2="${S.FIN.boat.y}" stroke="#4ade80" stroke-width="${r(3)}" stroke-dasharray="${r(8)} ${r(6)}"/><text x="${(S.FIN.pin.x + S.FIN.boat.x) / 2}" y="${S.FIN.pin.y - r(14)}" class="km-t" font-size="${r(16)}">finiş</text>` : '';
    const gusts = su.gusts.map(g => `<ellipse cx="${g.x}" cy="${g.y}" rx="${g.rx}" ry="${g.ry}" transform="rotate(${w} ${g.x} ${g.y})" fill="rgba(30,64,120,.6)" stroke="rgba(125,211,252,.55)" stroke-width="${r(2)}" stroke-dasharray="${r(7)} ${r(6)}"/>`).join('');
    const boats = su.fleet.map(b => `<circle cx="${b.x}" cy="${b.y}" r="${r(b.mine ? 9 : 6.5)}" fill="${b.mine ? '#fb923c' : '#e2e8f0'}" stroke="${b.mine ? '#fff' : '#0b1724'}" stroke-width="${r(2)}"/>`).join('');
    const ax = W.w - r(50), ay = r(50);
    return `<svg class="km-svg" viewBox="${-r(20)} ${-r(20)} ${W.w + r(40)} ${W.h + r(40)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Parkur çizimi">
      ${gusts}
      <line x1="${L.pin.x}" y1="${L.pin.y}" x2="${L.boat.x}" y2="${L.boat.y}" stroke="#fff" stroke-width="${r(2.5)}" stroke-dasharray="${r(8)} ${r(6)}"/>
      <circle cx="${L.pin.x}" cy="${L.pin.y}" r="${r(8)}" fill="#fbbf24"/><rect x="${L.boat.x - r(6)}" y="${L.boat.y - r(15)}" width="${r(12)}" height="${r(30)}" rx="${r(5)}" fill="#cbd5e1"/>
      <text x="${(L.pin.x + L.boat.x) / 2}" y="${L.pin.y - r(14)}" class="km-t" font-size="${r(16)}">start</text>
      ${fin}${marks}${boats}
      <g transform="translate(${ax} ${ay}) rotate(${w}) scale(${k})"><circle r="34" fill="rgba(2,21,38,.75)" stroke="rgba(125,211,252,.5)" stroke-width="2"/><path d="M0 -22 V18 M-11 7 L0 20 L11 7" fill="none" stroke="#7dd3fc" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>
    </svg>`;
  }

  // ---------- Durum ----------
  const K = { f: null, busy: false, err: '', made: null, host: null, onMade: null, be: null };
  const save = () => store.set(DRAFT, K.f);
  function open(host, be, onMade, onDenied) {
    K.onDenied = onDenied; K.host = host; K.be = be; K.onMade = onMade; K.made = null; K.err = '';
    const d = store.get(DRAFT, null);
    K.f = d && typeof d === 'object' ? { ...blank(), ...d } : blank();
    if (!Array.isArray(K.f.plan)) K.f.plan = [];
    host.classList.remove('hidden'); render();
    host.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function close() { if (K.host) { K.host.classList.add('hidden'); K.host.innerHTML = ''; } }

  function render() {
    const h = K.host; if (!h) return;
    if (K.made) { h.innerHTML = madeHtml(); return; }
    const f = K.f, su = buildSetup(f);
    const opt = (list, v) => list.map(([val, t]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const rows = f.plan.map((e, i) => `<li class="tp-row" data-i="${i}">
        <input class="dlg-in tp-at" data-f="at" value="${esc(clock(e.at).replace('−', '-'))}" title="Start'a göre zaman (dk:sn, eksi = start'tan önce)" inputmode="text">
        ${e.k === 'shift'
          ? `<span class="tp-k wind">Rüzgar</span>
             <select class="dlg-in" data-f="deg">${DEG.map(d => `<option value="${-d}"${e.deg === -d ? ' selected' : ''}>${d}° sola</option>`).reverse().join('')}${DEG.map(d => `<option value="${d}"${e.deg === d ? ' selected' : ''}>${d}° sağa</option>`).join('')}</select>
             <select class="dlg-in" data-f="hold">${opt(HOLD, e.hold)}</select>`
          : `<span class="tp-k gust">Sağanak</span>
             <select class="dlg-in" data-f="pos">${opt(POS, e.pos)}</select>
             <select class="dlg-in" data-f="size">${opt([['S', 'Küçük'], ['M', 'Orta'], ['L', 'Büyük']], e.size)}</select>
             <select class="dlg-in" data-f="pass">${opt(PASS, e.pass)}</select>`}
        <button class="icon sm" data-del="${i}" title="Sil"><svg><use href="#i-close"/></svg></button></li>`).join('');
    const seg = ([k, lbl, list]) => `<div class="net-opt"><span class="net-ol">${lbl}</span><div class="seg" data-k="${k}">${list.map(([v, t]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(f[k]) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div></div>`;
    const hints = f.hints ? planLines(su.plan) : [];
    h.innerHTML = `<div class="km-head"><h2>Yeni yarış</h2><button class="icon" data-k-act="close" title="Kapat"><svg><use href="#i-close"/></svg></button></div>
      <div class="km-grid">
        <div class="km-form">
          <label class="dlg-lbl" for="kfName">Yarışın adı</label>
          <input id="kfName" class="name-in dlg-in" maxlength="40" value="${esc(f.name)}">
          <label class="dlg-lbl" for="kfNote">Sporcuya bilgi (yarış kartında görünür)</label>
          <textarea id="kfNote" class="dlg-in task-note-in" maxlength="600" rows="3" placeholder="Ör. Sağ taraftan sağanaklar iniyor; rüzgar start'tan sonra sağa dönüp geri gelecek. Hattın hangi ucu avantajlı?">${esc(f.note)}</textarea>
          ${GROUPS.slice(0, 3).map(([t, rs]) => `<div class="net-h">${t}</div>${rs.map(seg).join('')}`).join('')}
          <div class="net-h">Yarış akışı <small>zaman: start'a göre dk:sn (−0:30 = start'tan 30 sn önce)</small></div>
          ${f.plan.length ? `<ul class="tp-list">${rows}</ul>` : '<p class="net-empty">Akış yok: rüzgar ve sağanaklar baştaki gibi sabit kalır.</p>'}
          <div class="tp-add">
            <button class="tb" data-k-act="addShift"><svg class="ci"><use href="#i-wind"/></svg>Rüzgar dönüşü</button>
            <button class="tb" data-k-act="addGust"><svg class="ci"><use href="#i-gust"/></svg>Sağanak</button>
            <button class="tb" data-k-act="addOsc" title="Start'tan sonra rüzgar 1 dk aralıkla sağa-sola salınır, bir sağanak iner">Örnek: salınım</button>
          </div>
          <label class="task-check"><input type="checkbox" id="kfHints"${f.hints ? ' checked' : ''}> Akışı sporcuya ipucu olarak göster</label>
          <div class="net-h">Gönderim</div>${GROUPS[3][1].map(seg).join('')}
        </div>
        <aside class="km-side">
          <div class="km-map">${mapSvg(f, su)}</div>
          <div class="rec-sum">${setupChips(su)}</div>
          ${hints.length ? `<div class="net-h">Sporcunun göreceği ipuçları</div><ul class="task-hints">${hints.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          <p class="dlg-note">Turuncu nokta sporcunun teknesi; öbürleri simülatörün tekneleri. Herkes aynı yerden başlar, aynı rüzgarı ve sağanakları yaşar.</p>
        </aside>
      </div>
      <p class="net-err" id="kfErr">${esc(K.err)}</p>
      <div class="km-actions">
        <button class="tb" data-k-act="reset" title="Formu baştan doldur">Sıfırla</button>
        <span class="spacer"></span>
        <button class="tb" data-k-act="preview" title="Yarışı simülatörde kendin dene (gönderilmez)"><svg class="ci"><use href="#i-play"/></svg>Simülatörde dene</button>
        <button class="tb primary" data-k-act="create" ${K.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-check"/></svg>Yarışı oluştur</button>
      </div>`;
  }
  function madeHtml() {
    const t = K.made, link = D.taskLink(t.code);
    return `<div class="km-head"><h2>Yarış hazır</h2><button class="icon" data-k-act="close" title="Kapat"><svg><use href="#i-close"/></svg></button></div>
      <div class="task-made">
        <div class="task-code">${esc(t.code)}</div>
        <p><b>${esc(t.name)}</b> · sporcularına bu bağlantıyı gönder. Açınca yarış kartı çıkar, <b>Yarışa başla</b> ile aynı yarışı koşarlar.</p>
        <div class="task-link"><code>${esc(link)}</code></div>
        <div class="km-actions km-center">
          <button class="tb primary" data-k-act="copy">Bağlantıyı kopyala</button>
          ${navigator.share ? '<button class="tb" data-k-act="share">Paylaş</button>' : ''}
          <a class="tb" href="${esc(link)}">Yarış sayfası</a>
          <button class="tb" data-k-act="again">Yeni yarış</button>
        </div></div>`;
  }

  function read() {
    const f = K.f; if (!f) return;
    if ($('kfName')) f.name = $('kfName').value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if ($('kfNote')) f.note = $('kfNote').value.trim().slice(0, 600);
    if ($('kfHints')) f.hints = $('kfHints').checked;
    save();
  }
  const lastAt = () => K.f.plan.length ? Math.max(...K.f.plan.map(e => e.at)) : 0;
  function addEv(...evs) { read(); K.f.plan.push(...evs); K.f.plan.sort((a, b) => a.at - b.at); save(); render(); }
  const setErr = m => { K.err = m || ''; const x = $('kfErr'); if (x) x.textContent = K.err; };

  async function create() {
    read();
    const f = K.f;
    if (!f.name) { setErr('Yarışa bir ad ver.'); return; }
    const be = K.be; if (!be || !be.uid()) { setErr('Yarış oluşturmak için Velora hesabıyla gir.'); return; }
    const su = buildSetup(f);
    const a = (window.SailAccess && SailAccess.account()) || {};
    const data = { v: 1, name: f.name, note: f.note, hints: !!f.hints, owner: be.uid(), ownerName: (a.name || '').slice(0, 40),
      due: f.due ? Date.now() + f.due * 86400e3 : 0, tries: f.tries, vis: f.vis, state: 'open',
      cls: f.cls, boats: su.fleet.length, windKn: f.windKn, setup: JSON.stringify(su) };
    K.busy = true; setErr(''); render();
    try {
      let code = newCode();
      for (let i = 0; i < 4 && await be.getTask(code).catch(() => null); i++) code = newCode();
      await be.createTask(code, { ...data, code });
      K.made = { ...data, code, id: code, at: Date.now() };
      store.set(DRAFT, null);
      try { if (window.SailTrack) SailTrack.log('task_create', { code, boats: data.boats, plan: (su.plan || []).length }); } catch (e) { /* yok */ }
      K.busy = false; render();
      if (K.onMade) K.onMade(K.made);
    } catch (e) {
      K.busy = false; render();
      setErr(isDenied(e) ? 'Yarış oluşturulamadı: Firestore kuralı yayında değil ya da eski. Sayfanın üstündeki kural kartını izle.' : 'Yarış oluşturulamadı. İnternetini kontrol et.');
      if (isDenied(e) && K.onDenied) K.onDenied();
    }
  }
  function preview() {
    read();
    const su = buildSetup(K.f);
    store.set(PREVIEW, { name: K.f.name, note: K.f.note, hints: K.f.hints, setup: su });
    location.href = 'sim.html?taslak=1' + (D.mode === 'yerel' ? '&net=yerel' : '');
  }
  function copy(text, el) {
    const done = () => { if (el) el.textContent = 'Kopyalandı'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('Kopyala:', text));
    else prompt('Kopyala:', text);
  }

  // ---------- Olaylar ----------
  document.addEventListener('click', e => {
    if (!K.host || !K.host.contains(e.target)) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.del != null) { read(); K.f.plan.splice(+b.dataset.del, 1); save(); render(); return; }
    const sg = b.closest('.seg[data-k]');
    if (sg && b.dataset.v != null) { read(); const k = sg.dataset.k; K.f[k] = STR.has(k) ? b.dataset.v : +b.dataset.v; save(); render(); return; }
    const a = b.dataset.kAct; if (!a) return;
    if (a === 'close') close();
    else if (a === 'addShift') addEv({ k: 'shift', at: K.f.plan.length ? lastAt() + 30 : 30, deg: 10, hold: 30 });
    else if (a === 'addGust') addEv({ k: 'gust', at: K.f.plan.length ? lastAt() + 20 : 0, pos: 0.4, size: 'M', pass: 90 });
    else if (a === 'addOsc') { const s0 = K.f.plan.length ? lastAt() + 30 : 20; addEv(...[10, -10, 10, -10].map((d, i) => ({ k: 'shift', at: s0 + i * 60, deg: d, hold: 30 })), { k: 'gust', at: s0 + 15, pos: -0.4, size: 'M', pass: 90 }); }
    else if (a === 'reset') { K.f = blank(); save(); K.err = ''; render(); }
    else if (a === 'create') create();
    else if (a === 'preview') preview();
    else if (a === 'copy') copy(D.taskLink(K.made.code), b);
    else if (a === 'share') navigator.share({ title: K.made.name, text: `Yarış: ${K.made.name}`, url: D.taskLink(K.made.code) }).catch(() => {});
    else if (a === 'again') { K.made = null; K.f = blank(); save(); render(); }
  });
  document.addEventListener('change', e => {
    if (!K.host || !K.host.contains(e.target)) return;
    if (e.target.id === 'kfHints') { read(); render(); return; }
    const row = e.target.closest('.tp-row'); if (!row) return;
    const ev = K.f.plan[+row.dataset.i], fk = e.target.dataset.f; if (!ev || !fk) return;
    if (fk === 'at') { const v = parseClock(e.target.value); if (v == null) { e.target.value = clock(ev.at).replace('−', '-'); setErr('Zamanı dk:sn yaz (ör. 1:30, −0:20)'); return; } ev.at = Math.max(-600, Math.min(3600, v)); }
    else if (fk === 'size') ev.size = e.target.value;
    else ev[fk] = +e.target.value;
    read(); K.f.plan.sort((a, b) => a.at - b.at); save(); render();
  });
  document.addEventListener('input', e => { if (K.host && K.host.contains(e.target) && (e.target.id === 'kfName' || e.target.id === 'kfNote')) read(); });

  window.SailRaceForm = { open, close, buildSetup, blank };
})();

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
  // parkurun çizimi (kullanıcı 2026-11-16: daha kullanışlı): yalnız parkurun olduğu bölge (büyük ve okunur), şamandıra numaraları,
  // finiş, tekneler, sabit sağanaklar ve akıştaki sağanakların doğacağı yerler (zamanıyla), rüzgar oku
  function mapSvg(f, su) {
    const L = S.LINE, w = f.bias, marks = S.CRS.marks || [S.MARK];
    const tz = su.course.type === 'trapez';
    const pts = [L.pin, L.boat, ...marks, ...su.fleet, ...(tz ? [S.FIN.pin, S.FIN.boat] : [])];
    const half = Math.abs(L.boat.x - L.pin.x) * 0.6, up = { x: Math.sin(w * Math.PI / 180), y: -Math.cos(w * Math.PI / 180) }, rt = { x: -up.y, y: up.x };
    const spawn = f.plan.filter(e => e.k === 'gust').map(e => {
      const g = { S: 0.7, M: 1, L: 1.4 }[e.size] || 1, ry = 190 * g;
      return { e, x: S.MARK.x + up.x * (ry * 0.35) + rt.x * e.pos * half, y: S.MARK.y + up.y * (ry * 0.35) + rt.y * e.pos * half, r: 70 * g };
    });
    for (const g of su.gusts) pts.push({ x: g.x - g.rx, y: g.y - g.ry }, { x: g.x + g.rx, y: g.y + g.ry });
    for (const g of spawn) pts.push({ x: g.x - g.r, y: g.y - g.r }, { x: g.x + g.r, y: g.y + g.r });
    let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
    const pad = 90; x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const k = Math.max(x1 - x0, y1 - y0) / 420, r = v => Math.round(v * k * 10) / 10;   // işaretler ekranda hep aynı boyda
    const gusts = su.gusts.map(g => `<ellipse cx="${g.x}" cy="${g.y}" rx="${g.rx}" ry="${g.ry}" transform="rotate(${w} ${g.x} ${g.y})" fill="rgba(30,64,120,.55)" stroke="rgba(125,211,252,.55)" stroke-width="${r(1.5)}" stroke-dasharray="${r(6)} ${r(5)}"/>`).join('');
    const sp = spawn.map(g => `<g><circle cx="${g.x}" cy="${g.y}" r="${g.r}" fill="rgba(148,163,184,.12)" stroke="rgba(203,213,225,.55)" stroke-width="${r(1.2)}" stroke-dasharray="${r(4)} ${r(4)}"/>
      <text x="${g.x}" y="${g.y + r(5)}" class="km-t" font-size="${r(13)}">${esc(clock(g.e.at))}</text></g>`).join('');
    const mk = marks.map(m => `<circle cx="${m.x}" cy="${m.y}" r="${r(8)}" fill="#fb923c" stroke="#fff" stroke-width="${r(1.6)}"/><text x="${m.x + r(14)}" y="${m.y + r(5)}" class="km-t km-tl" font-size="${r(13)}">${esc(m.no)}</text>`).join('');
    const fin = tz ? `<line x1="${S.FIN.pin.x}" y1="${S.FIN.pin.y}" x2="${S.FIN.boat.x}" y2="${S.FIN.boat.y}" stroke="#4ade80" stroke-width="${r(2.5)}" stroke-dasharray="${r(7)} ${r(5)}"/><text x="${(S.FIN.pin.x + S.FIN.boat.x) / 2}" y="${S.FIN.pin.y - r(10)}" class="km-t" font-size="${r(12)}" fill="#86efac">finiş</text>` : '';
    const boats = su.fleet.map(b => `<circle cx="${b.x}" cy="${b.y}" r="${r(b.mine ? 7 : 5)}" fill="${b.mine ? '#fb923c' : '#e2e8f0'}" stroke="${b.mine ? '#fff' : '#0b1724'}" stroke-width="${r(1.5)}"/>`).join('');
    const ax = x0 + r(34), ay = y0 + r(34);   // sol üst: trapezde 1 numara sağ üstte
    return `<svg class="km-svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Parkur çizimi">
      ${gusts}${sp}
      <line x1="${L.pin.x}" y1="${L.pin.y}" x2="${L.boat.x}" y2="${L.boat.y}" stroke="#fff" stroke-width="${r(2)}" stroke-dasharray="${r(7)} ${r(5)}"/>
      <circle cx="${L.pin.x}" cy="${L.pin.y}" r="${r(7)}" fill="#fbbf24"/><rect x="${L.boat.x - r(5)}" y="${L.boat.y - r(12)}" width="${r(10)}" height="${r(24)}" rx="${r(4)}" fill="#cbd5e1"/>
      <text x="${(L.pin.x + L.boat.x) / 2}" y="${L.pin.y + r(26)}" class="km-t" font-size="${r(12)}">start</text>
      ${fin}${mk}${boats}
      <g transform="translate(${ax} ${ay}) rotate(${w}) scale(${k})"><circle r="24" fill="rgba(2,21,38,.8)" stroke="rgba(125,211,252,.5)" stroke-width="1.5"/><path d="M0 -14 V12 M-8 4 L0 13 L8 4" fill="none" stroke="#7dd3fc" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g>
    </svg>`;
  }
  // Yarış akışı zaman çizelgesi (HTML, her genişlikte okunur): start'a göre dakikalar; rüzgar dönüşü mavi (sağa üstte, sola altta;
  // geri gelene kadar çubuk, kalıcıysa sona kadar soluk), sağanak gri baklava. Dokununca o olayın kartı vurgulanır.
  function timelineHtml(f) {
    const P = f.plan, lo = Math.min(-60, ...P.map(e => e.at)), hi = Math.max(300, ...P.map(e => e.at + (e.k === 'shift' ? 6 + (e.hold || 0) : 0) + 40));
    const X = t => ((t - lo) / (hi - lo) * 100).toFixed(2) + '%';
    const step = hi - lo > 900 ? 120 : 60, ticks = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
    const tk = ticks.map(t => `<span class="tl-tick${t === 0 ? ' st' : ''}" style="left:${X(t)}">${t === 0 ? 'Start' : (t < 0 ? '−' : '') + Math.abs(t / 60) + ' dk'}</span>`).join('');
    const ev = P.map((e, i) => e.k === 'shift'
      ? `<span class="tl-bar ${e.deg > 0 ? 'r' : 'l'}${e.hold ? '' : ' keep'}" style="left:${X(e.at)};width:calc(${e.hold ? X(e.at + 6 + e.hold) : '100%'} - ${X(e.at)})"></span>
         <button type="button" class="tl-ev wind ${e.deg > 0 ? 'r' : 'l'}${K.hi === i ? ' on' : ''}" data-tl="${i}" style="left:${X(e.at)}" title="${esc(clock(e.at))} · rüzgar ${Math.abs(e.deg)}° ${e.deg > 0 ? 'sağa' : 'sola'}">${e.deg > 0 ? '↻' : '↺'}</button>`
      : `<button type="button" class="tl-ev gust${K.hi === i ? ' on' : ''}" data-tl="${i}" style="left:${X(e.at)}" title="${esc(clock(e.at))} · sağanak"></button>`).join('');
    return `<div class="tl" aria-label="Yarış akışı zaman çizelgesi"><div class="tl-track"><span class="tl-now" style="left:${X(0)}"></span>${ev}</div><div class="tl-ticks">${tk}</div></div>`;
  }

  // ---------- Durum ----------
  const K = { f: null, busy: false, err: '', made: null, host: null, onMade: null, be: null, open: null, hi: null };
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

  // Bölümler açılır-kapanır, başlıkta seçilenlerin özeti (kullanıcı 2026-11-16: "o alanın tasarımını daha kullanışlı yap")
  const OPEN = 'ps.task.formOpen';
  const isOpen = id => (K.open || (K.open = new Set(store.get(OPEN, ['wind', 'plan'])))).has(id);
  const lbl = (k, v) => { for (const [, rs] of GROUPS) for (const [kk, , list] of rs) if (kk === k) { const o = list.find(([x]) => String(x) === String(v)); return o ? o[1] : String(v); } return String(v); };
  function summary(id, f) {
    if (id === 'race') return `${f.n === 1 ? 'Yalnız sen' : f.n + ' tekne'} · ${lbl('cls', f.cls)} · ${lbl('pre', f.pre)} · ${f.flag === 'Siyah' ? 'siyah bayrak' : f.flag + ' bayrağı'}`;
    if (id === 'course') return `${f.course === 'orsa' ? 'Yalnız orsa' : 'Trapez'} · hat ${lbl('line', f.line)} · şamandıra ${lbl('mark', f.mark)}`;
    if (id === 'wind') return `${f.windKn} kn · ${f.bias ? lbl('bias', f.bias).replace(/(\d+)°/, '$1° avantajlı') : 'hatta dik'} · ${f.gust === 'yok' ? 'sabit sağanak yok' : 'sağanak ' + lbl('gust', f.gust).toLowerCase()}${f.cur ? ' · akıntı ' + lbl('cur', f.cur).toLowerCase() : ''}`;
    if (id === 'plan') { const nw = f.plan.filter(e => e.k === 'shift').length, ng = f.plan.length - nw; return f.plan.length ? [nw ? nw + ' rüzgar dönüşü' : '', ng ? ng + ' sağanak' : ''].filter(Boolean).join(' · ') : 'Akış yok: rüzgar ve sağanaklar sabit'; }
    if (id === 'send') return `${f.tries} deneme hakkı · tekrarları ${lbl('vis', f.vis).toLowerCase()} · ${f.due ? 'son tarih ' + lbl('due', f.due) : 'son tarih yok'}`;
    return '';
  }
  const PRESETS = [
    ['sabit', 'Sabit', 'Akış yok: rüzgar ve sağanaklar baştaki gibi kalır', () => []],
    ['salinim', 'Salınımlı', 'Start\'tan sonra rüzgar dakikada bir 10° sağa-sola salınır, bir sağanak iner',
      () => [...[10, -10, 10, -10].map((d, i) => ({ k: 'shift', at: 20 + i * 60, deg: d, hold: 30 })), { k: 'gust', at: 35, pos: -0.4, size: 'M', pass: 90 }]],
    ['sag', 'Kalıcı sağa', 'Start\'tan 1 dk sonra rüzgar 15° sağa döner ve kalır', () => [{ k: 'shift', at: 60, deg: 15, hold: 0 }]],
    ['sol', 'Kalıcı sola', 'Start\'tan 1 dk sonra rüzgar 15° sola döner ve kalır', () => [{ k: 'shift', at: 60, deg: -15, hold: 0 }]],
    ['saganak', 'Sağanaklı', 'Dakikada bir, farklı yerlerden sağanak iner', () => [[0, -0.4], [60, 0.4], [120, 0], [180, -0.8], [240, 0.8]].map(([at, pos]) => ({ k: 'gust', at, pos, size: 'M', pass: 90 }))]
  ];
  const planKey = l => JSON.stringify(l.slice().sort((a, b) => a.at - b.at || (a.k > b.k ? 1 : -1)));
  const presetOf = f => (PRESETS.find(([, , , mk]) => planKey(mk()) === planKey(f.plan)) || [''])[0];
  function evCard(e, i) {
    const opt = (list, v) => list.map(([val, t]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const when = `<label class="ev-f"><span>Ne zaman</span><input class="dlg-in tp-at" data-f="at" value="${esc(clock(e.at).replace('−', '-'))}" title="Start'a göre dk:sn (eksi = start'tan önce)" inputmode="text"></label>`;
    const say = D.planLines([e])[0] || '';
    return e.k === 'shift'
      ? `<li class="tp-row ev wind${K.hi === i ? ' hi' : ''}" data-i="${i}">
          <div class="ev-top"><span class="tp-k wind">${e.deg > 0 ? '↻' : '↺'} Rüzgar dönüşü</span><span class="ev-say">${esc(say)}</span><button class="icon sm" data-del="${i}" title="Sil" aria-label="Sil"><svg><use href="#i-close"/></svg></button></div>
          <div class="ev-fields">${when}
            <label class="ev-f"><span>Yön</span><select class="dlg-in" data-f="dir"><option value="-1"${e.deg < 0 ? ' selected' : ''}>Sola</option><option value="1"${e.deg > 0 ? ' selected' : ''}>Sağa</option></select></label>
            <label class="ev-f"><span>Açı</span><select class="dlg-in" data-f="mag">${DEG.map(d => `<option value="${d}"${Math.abs(e.deg) === d ? ' selected' : ''}>${d}°</option>`).join('')}</select></label>
            <label class="ev-f"><span>Ne kadar kalır</span><select class="dlg-in" data-f="hold">${opt(HOLD, e.hold)}</select></label></div></li>`
      : `<li class="tp-row ev gust${K.hi === i ? ' hi' : ''}" data-i="${i}">
          <div class="ev-top"><span class="tp-k gust">Sağanak</span><span class="ev-say">${esc(say)}</span><button class="icon sm" data-del="${i}" title="Sil" aria-label="Sil"><svg><use href="#i-close"/></svg></button></div>
          <div class="ev-fields">${when}
            <label class="ev-f"><span>Nereden</span><select class="dlg-in" data-f="pos">${opt(POS, e.pos)}</select></label>
            <label class="ev-f"><span>Boyut</span><select class="dlg-in" data-f="size">${opt([['S', 'Küçük'], ['M', 'Orta'], ['L', 'Büyük']], e.size)}</select></label>
            <label class="ev-f"><span>İnme hızı</span><select class="dlg-in" data-f="pass">${opt(PASS, e.pass)}</select></label></div></li>`;
  }
  function render() {
    const h = K.host; if (!h) return;
    if (K.made) { h.innerHTML = madeHtml(); return; }
    const f = K.f, su = buildSetup(f);
    const seg = ([k, lbl, list]) => `<div class="net-opt"><span class="net-ol">${lbl}</span><div class="seg" data-k="${k}">${list.map(([v, t]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(f[k]) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div></div>`;
    const hints = f.hints ? planLines(su.plan) : [];
    const sec = (id, no, title, body) => `<section class="km-sec${isOpen(id) ? ' open' : ''}" data-sec="${id}">
        <button type="button" class="km-sh" data-sec-t="${id}" aria-expanded="${isOpen(id)}"><span class="km-no">${no}</span><span class="km-st"><b>${title}</b><small>${esc(summary(id, f))}</small></span><svg class="km-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="km-sb">${body}</div></section>`;
    const pre = presetOf(f);
    const planBody = `<div class="km-presets" role="group" aria-label="Hazır akışlar">${PRESETS.map(([id, t, tip]) => `<button type="button" class="pr${pre === id ? ' on' : ''}" data-preset="${id}" title="${esc(tip)}">${t}</button>`).join('')}</div>
      ${timelineHtml(f)}
      ${f.plan.length ? `<ul class="tp-list">${f.plan.map(evCard).join('')}</ul>` : '<p class="net-empty">Akış yok: rüzgar ve sağanaklar baştaki gibi sabit kalır. Hazır bir akış seç ya da aşağıdan ekle.</p>'}
      <div class="tp-add">
        <button class="tb" data-k-act="addShift"><svg class="ci"><use href="#i-wind"/></svg>Rüzgar dönüşü ekle</button>
        <button class="tb" data-k-act="addGust"><svg class="ci"><use href="#i-gust"/></svg>Sağanak ekle</button>
      </div>
      <p class="dlg-note">Zaman start'a göre: <b>1:30</b> start'tan 1,5 dk sonra, <b>-0:30</b> start'tan 30 sn önce.</p>
      <label class="task-check"><input type="checkbox" id="kfHints"${f.hints ? ' checked' : ''}> Akışı sporcuya ipucu olarak göster</label>`;
    h.innerHTML = `<div class="km-head"><h2>Yeni yarış</h2><button class="icon" data-k-act="close" title="Kapat"><svg><use href="#i-close"/></svg></button></div>
      <div class="km-grid">
        <div class="km-form">
          <div class="km-names">
            <label class="km-fld"><span class="dlg-lbl">Yarışın adı</span><input id="kfName" class="name-in dlg-in" maxlength="40" value="${esc(f.name)}"></label>
            <label class="km-fld"><span class="dlg-lbl">Sporcuya bilgi (yarış kartında görünür)</span>
              <textarea id="kfNote" class="dlg-in task-note-in" maxlength="600" rows="2" placeholder="Ör. Sağ taraftan sağanaklar iniyor; rüzgar start'tan sonra sağa dönüp geri gelecek. Hattın hangi ucu avantajlı?">${esc(f.note)}</textarea></label>
          </div>
          ${sec('race', 1, 'Yarış', GROUPS[0][1].map(seg).join(''))}
          ${sec('course', 2, 'Parkur', GROUPS[1][1].map(seg).join(''))}
          ${sec('wind', 3, 'Rüzgar ve deniz', GROUPS[2][1].map(seg).join(''))}
          ${sec('plan', 4, 'Yarış akışı', planBody)}
          ${sec('send', 5, 'Gönderim', GROUPS[3][1].map(seg).join(''))}
        </div>
        <aside class="km-side">
          <div class="km-map">${mapSvg(f, su)}</div>
          <div class="rec-sum">${setupChips(su)}</div>
          <p class="dlg-note km-legend"><i class="lg me"></i>sporcunun teknesi <i class="lg ai"></i>simülatörün tekneleri <i class="lg gs"></i>akıştaki sağanağın doğduğu yer (zamanı)</p>
          ${hints.length ? `<div class="net-h">Sporcunun göreceği ipuçları</div><ul class="task-hints">${hints.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        </aside>
      </div>
      <div class="km-bar">
        <p class="net-err" id="kfErr">${esc(K.err)}</p>
        <button class="tb" data-k-act="reset" title="Formu baştan doldur">Sıfırla</button>
        <span class="spacer"></span>
        <button class="tb" data-k-act="preview" title="Yarışı simülatörde kendin dene (gönderilmez)"><svg class="ci"><use href="#i-play"/></svg><span>Simülatörde dene</span></button>
        <button class="tb primary" data-k-act="create" ${K.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-check"/></svg><span>Yarışı oluştur</span></button>
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
          <a class="tb" href="${esc(D.taskLink(t.code, '&sporcu=1'))}">Sporcu gibi aç</a>
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
  function addEv(...evs) { read(); K.f.plan.push(...evs); K.f.plan.sort((a, b) => a.at - b.at); K.hi = K.f.plan.indexOf(evs[0]); save(); render(); }
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
    if (b.dataset.secT) { const id = b.dataset.secT; isOpen(id); K.open.has(id) ? K.open.delete(id) : K.open.add(id); store.set(OPEN, [...K.open]); read(); render(); return; }
    if (b.dataset.preset) { read(); const p = PRESETS.find(x => x[0] === b.dataset.preset); K.f.plan = p[3]().sort((a, c) => a.at - c.at); K.hi = null; save(); render(); return; }
    if (b.dataset.tl != null) { K.hi = +b.dataset.tl; render(); const c = K.host.querySelector(`.ev[data-i="${K.hi}"]`); if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    if (b.dataset.del != null) { read(); K.f.plan.splice(+b.dataset.del, 1); K.hi = null; save(); render(); return; }
    const sg = b.closest('.seg[data-k]');
    if (sg && b.dataset.v != null) { read(); const k = sg.dataset.k; K.f[k] = STR.has(k) ? b.dataset.v : +b.dataset.v; save(); render(); return; }
    const a = b.dataset.kAct; if (!a) return;
    if (a === 'close') close();
    else if (a === 'addShift') addEv({ k: 'shift', at: K.f.plan.length ? lastAt() + 30 : 30, deg: 10, hold: 30 });
    else if (a === 'addGust') addEv({ k: 'gust', at: K.f.plan.length ? lastAt() + 20 : 0, pos: 0.4, size: 'M', pass: 90 });
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
    else if (fk === 'dir') ev.deg = Math.abs(ev.deg || 10) * (+e.target.value < 0 ? -1 : 1);
    else if (fk === 'mag') ev.deg = (ev.deg < 0 ? -1 : 1) * +e.target.value;
    else ev[fk] = +e.target.value;
    read(); K.f.plan.sort((a, b) => a.at - b.at); save(); render();
  });
  document.addEventListener('input', e => { if (K.host && K.host.contains(e.target) && (e.target.id === 'kfName' || e.target.id === 'kfNote')) read(); });

  window.SailRaceForm = { open, close, buildSetup, blank };
})();

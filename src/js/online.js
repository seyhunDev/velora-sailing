/* Online yarış: şifreli oda (sim.html, sim.js'ten sonra yüklenir).
   Yetkili hesap (Velora ile giren site sahibi; sailHosts listesindekiler) oda açar: kod + şifre, katılımcı sınırı,
   parkur, rüzgar (hız, start hattına açısı, senaryo: kalıcı dönüş / salınım), sağanak, akıntı, sınıf, geri sayım, bayrak.
   Sporcular kod + şifreyle girer, adlarını yazar. Sahibi Başlat deyince oda kilitlenir; herkes kendi teknesini elle sürer.

   Veri: Firebase Realtime Database (sesliasistan-3e95a, Belçika) → VeloraAuth.rtdb().
   Test: sim.html?net=yerel → aynı tarayıcıdaki sekmeler arası sahte veritabanı (localStorage).
     sailLobby/{KOD}            { name, host, hostName, state, n, max, at }   açık odalar listesi (şifre yok)
     sailRooms/{anahtar}        anahtar = sha256("KOD:şifre"): şifreyi bilmeyen odanın yolunu bulamaz (kök listelenemez)
       meta                     { code, name, host, hostName, max, cfg, state: open|racing|done, go, order:[{pid,name}], at }
       players/{pid}            { name, at, on }
       boats/{pid}              teknenin son durumu (5 Hz)
   Her cihaz kendi teknesini sürer ve yayınlar; öbür tekneler ağdan gelir (sim-core: b.remote = hareket ettirilmez).
   Saat ortak: yarış zamanı = sunucu saati − başlangıç → herkes aynı anda start eder; rüzgar senaryosu herkeste aynı hesaplanır.
   Kurallar: temasta kural ihlali yapan teknenin cezasını kendi cihazı verir (sim-core protest: b.remote atlanır).
*/
(function () {
  const api = window.SimApi; if (!api) return;
  const S = api.S, E = window.SailEngine;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const LEAD = 6000;          // Başlat'tan geri sayımın başlamasına kadar (ms): herkesin ekranı yarışa geçsin
  const PUB_MS = 200;         // kendi teknenin yayın aralığı
  const STALE = 9000;         // bu kadar (gerçek) ms haber gelmeyen tekne "bağlantı koptu"
  const SESS = 'ps.net.sess', NAME = 'ps.net.name', CFGK = 'ps.net.cfg';
  const PROJECT = 'sesliasistan-3e95a';
  const SV = { '.sv': 'timestamp' };
  const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#facc15', '#a78bfa', '#f87171', '#2dd4bf', '#e879f9', '#a3e635', '#fb7185', '#93c5fd', '#c084fc', '#fde68a', '#4ade80', '#f9a8d4', '#67e8f9'];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* yok */ } },
    sget(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    sset(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* yok */ } }
  };
  const acc = () => (window.SailAccess && SailAccess.account()) || null;
  const track = (ev, data) => { try { if (window.SailTrack) SailTrack.log(ev, data); } catch (e) { /* yok */ } };

  // ---------- Veri katmanı ----------
  // İki arka uç aynı küçük arayüzü verir: get / set / update / remove / on(yol, cb) → kapat / leaveSet / now / uid.
  function fireBackend() {
    let m = null, db = null, offset = 0;
    const r = p => m.ref(db, p);
    return {
      kind: 'firebase',
      async init() {
        if (!window.VeloraAuth) await new Promise((ok, no) => {
          const t = setTimeout(() => no(new Error('velora-yok')), 12000);
          document.addEventListener('velora-ready', () => { clearTimeout(t); ok(); }, { once: true });
        });
        ({ m, db } = await VeloraAuth.rtdb());
        m.onValue(r('.info/serverTimeOffset'), s => { offset = s.val() || 0; });
        // veritabanı var mı, kurallar yayında mı: lobi okunabilmeli (8 sn içinde cevap yoksa veritabanı açılmamış)
        await Promise.race([m.get(r('sailLobby')), new Promise((ok, no) => setTimeout(() => no(new Error('zaman-asimi')), 8000))]);
      },
      uid: () => (window.VeloraAuth && VeloraAuth.uid()) || null,
      async get(p) { return (await m.get(r(p))).val(); },
      set: (p, v) => m.set(r(p), v),
      update: (p, v) => m.update(r(p), v),
      remove: p => m.remove(r(p)),
      on(p, cb) { return m.onValue(r(p), s => cb(s.val()), () => cb(null)); },
      leaveSet(p, v) { const d = m.onDisconnect(r(p)); return v == null ? d.remove() : d.set(v); },
      leaveCancel(p) { return m.onDisconnect(r(p)).cancel(); },
      now: () => Date.now() + offset
    };
  }
  // Sahte veritabanı: aynı tarayıcıdaki sekmeler (localStorage + storage olayı). Yalnız deneme ve otomatik test için.
  function localBackend() {
    const KEY = 'ps.netmock.v1', subs = new Set(), leave = new Map();
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const parts = p => p.split('/').filter(Boolean);
    const at = (t, p) => { let o = t; for (const k of parts(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o == null ? null : o; };
    const fix = v => (v == null ? null : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x === 'object' && x['.sv'] === 'timestamp' ? Date.now() : x))));
    const notify = () => { for (const s of [...subs]) s.check(); };
    function put(t, p, v) {
      const ks = parts(p); let o = t;
      for (const k of ks.slice(0, -1)) { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
      const last = ks[ks.length - 1];
      if (v == null) delete o[last]; else o[last] = v;
    }
    const commit = t => { localStorage.setItem(KEY, JSON.stringify(t)); setTimeout(notify, 0); };
    window.addEventListener('storage', e => { if (e.key === KEY) notify(); });
    window.addEventListener('pagehide', () => { const t = read(); for (const [p, v] of leave) put(t, p, v); if (leave.size) localStorage.setItem(KEY, JSON.stringify(t)); });
    return {
      kind: 'yerel',
      async init() { /* hazır */ },
      // sekme başına kimlik (aynı tarayıcıda iki sekme iki ayrı kişi gibi)
      uid: () => { let u = store.sget('ps.netmock.uid'); if (!u) { u = 'yerel-' + rid(); store.sset('ps.netmock.uid', u); } return u; },
      async get(p) { return at(read(), p); },
      async set(p, v) { const t = read(); put(t, p, fix(v)); commit(t); },
      async update(p, obj) { const t = read(); for (const k in obj) put(t, p + '/' + k, fix(obj[k])); commit(t); },
      async remove(p) { const t = read(); put(t, p, null); commit(t); },
      on(p, cb) {
        const s = { last: undefined, check() { const v = at(read(), p), j = JSON.stringify(v); if (j !== s.last) { s.last = j; cb(v == null ? null : JSON.parse(j)); } } };
        subs.add(s); setTimeout(() => s.check(), 0);
        return () => subs.delete(s);
      },
      async leaveSet(p, v) { leave.set(p, fix(v)); },
      async leaveCancel(p) { leave.delete(p); },
      now: () => Date.now()
    };
  }
  const mode = new URLSearchParams(location.search).get('net') === 'yerel' ? 'yerel' : 'firebase';
  let be = null, beState = 'none', beErr = '';     // none | wait | ok | fail
  async function backend() {
    if (beState === 'ok') return be;
    if (beState === 'fail') beState = 'none';           // yeniden dene (kurulum yapılmış olabilir)
    if (beState === 'wait') return new Promise(ok => { const t = setInterval(() => { if (beState !== 'wait') { clearInterval(t); ok(beState === 'ok' ? be : null); } }, 100); });
    beState = 'wait'; be = mode === 'yerel' ? localBackend() : fireBackend();
    try { await be.init(); beState = 'ok'; return be; }
    catch (e) { beState = 'fail'; beErr = String(e && (e.code || e.message) || e); console.warn('[online] veritabanı', e); return null; }
  }

  async function roomKey(code, pass) {
    const data = new TextEncoder().encode(code.toUpperCase() + ':' + pass);
    const h = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(h)].slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const rid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const newCode = () => { const A = 'ABCDEFGHJKLMNPRSTUVYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };

  // ---------- Oda ayarları ----------
  const CFG0 = { max: 8, cls: 'optimist', windKn: 8, pre: 180, flag: 'P', line: 500, mark: 1500, course: 'trapez', bias: 0,
    shiftDir: 0, shiftDeg: 10, shiftAt: 2, shiftRamp: 40, osc: 0, oscPer: 2, gust: 'yok', cur: 0 };
  // seçenekler: [anahtar, başlık, [[değer, yazı], …]]
  const FORM = [
    ['Yarış', [
      ['max', 'Katılımcı sınırı', [2, 4, 6, 8, 10, 12, 16].map(v => [v, String(v)])],
      ['cls', 'Tekne sınıfı', Object.keys(S.CLASSES).map(k => [k, S.CLASSES[k].name])],
      ['pre', 'Start geri sayımı', [[60, '1 dk'], [120, '2 dk'], [180, '3 dk'], [300, '5 dk']]],
      ['flag', 'Hazırlık bayrağı', [['P', 'P'], ['I', 'I'], ['Z', 'Z'], ['U', 'U'], ['Siyah', 'Siyah']]]
    ]],
    ['Parkur', [
      ['course', 'Parkur', [['trapez', 'Trapez (1-2-kapı-finiş)'], ['orsa', 'Yalnız orsa']]],
      ['line', 'Start hattı boyu', [[300, '6 boy'], [400, '8 boy'], [500, '10 boy'], [600, '12 boy']]],
      ['mark', 'Orsa şamandırası uzaklığı', [[700, '14 boy'], [950, '19 boy'], [1200, '24 boy'], [1500, '30 boy'], [1800, '36 boy'], [2000, '40 boy']]]
    ]],
    ['Rüzgar', [
      ['windKn', 'Rüzgar hızı', S.WIND_KN.map(v => [v, v + ' kn'])],
      ['bias', 'Start hattına göre rüzgar', [[-15, 'Pin 15°'], [-8, 'Pin 8°'], [0, 'Hatta dik'], [8, 'Hakem botu 8°'], [15, 'Hakem botu 15°']]],
      ['shiftDir', 'Rüzgar dönüşü', [[0, 'Yok'], [-1, 'Sola döner'], [1, 'Sağa döner']]],
      ['shiftDeg', 'Ne kadar', [[5, '5°'], [10, '10°'], [15, '15°'], [20, '20°'], [30, '30°']], c => c.shiftDir],
      ['shiftAt', 'Ne zaman', [[0, 'Start\'ta'], [1, '1 dk sonra'], [2, '2 dk sonra'], [3, '3 dk sonra'], [5, '5 dk sonra']], c => c.shiftDir],
      ['shiftRamp', 'Dönüş hızı', [[40, 'Birden (40 sn)'], [180, 'Yavaş (3 dk)']], c => c.shiftDir],
      ['osc', 'Salınım (sağa sola)', [[0, 'Yok'], [5, '±5°'], [10, '±10°']]],
      ['oscPer', 'Salınım aralığı', [[1, '1 dk'], [2, '2 dk'], [4, '4 dk']], c => c.osc]
    ]],
    ['Deniz', [
      ['gust', 'Sağanak', [['yok', 'Yok'], ['sol', 'Sol tarafta'], ['sag', 'Sağ tarafta'], ['iki', 'İki yanda']]],
      ['cur', 'Akıntı (rüzgarla aynı yönden)', [[0, 'Yok'], [1, 'Hafif'], [2, 'Orta'], [3, 'Güçlü']]]
    ]]
  ];
  const optTxt = (k, v) => { for (const [, rows] of FORM) for (const r of rows) if (r[0] === k) { const o = r[2].find(x => x[0] === v); return o ? o[1] : String(v); } return String(v); };
  function cfgSummary(c) {
    const out = [`${optTxt('cls', c.cls)}`, `${c.windKn} kn`, optTxt('bias', c.bias), `geri sayım ${optTxt('pre', c.pre)}`, `${c.flag === 'Siyah' ? 'siyah' : c.flag} bayrağı`, `${optTxt('course', c.course || 'trapez').replace(/ \(.*\)/, '').toLowerCase()} parkur`, `hat ${optTxt('line', c.line)}`, `şamandıra ${optTxt('mark', c.mark)}`];
    if (c.shiftDir) out.push(`start'tan ${c.shiftAt ? c.shiftAt + ' dk sonra' : 'hemen sonra'} ${c.shiftDeg}° ${c.shiftDir > 0 ? 'sağa' : 'sola'} döner${c.shiftRamp > 60 ? ' (yavaş)' : ''}`);
    if (c.osc) out.push(`±${c.osc}° salınım (${c.oscPer} dk)`);
    if (c.gust !== 'yok') out.push(`sağanak: ${optTxt('gust', c.gust).toLowerCase()}`);
    if (c.cur) out.push(`akıntı: ${optTxt('cur', c.cur).toLowerCase()}`);
    return out;
  }
  // Rüzgar senaryosu: herkesin cihazında aynı (yarış saatine bağlı). Pozitif = sağa (saat yönü).
  function windAt(c, s) {
    const real = s.t * S.CLOCK_SCALE, after = (s.t - s.startAt) * S.CLOCK_SCALE;
    let w = c.bias;
    if (c.shiftDir) w += c.shiftDir * c.shiftDeg * clamp((after - c.shiftAt * 60) / c.shiftRamp, 0, 1);
    if (c.osc) w += c.osc * Math.sin(2 * Math.PI * real / (c.oscPer * 60));
    return w;
  }
  // Oyuncular → tekneler (herkeste aynı sıra: meta.order). Yerler simülatörün varsayılan start kalabalığı.
  function buildSetup(c, order, myPid) {
    const course = { lineLen: c.line, markDist: c.mark, flag: c.flag, type: c.course === 'orsa' ? 'orsa' : 'trapez' };
    S.setCourse(course);
    const pos = S.defaultFleet(order.length);
    const fleet = order.map((o, i) => {
      const mine = o.pid === myPid;
      const b = S.makeBoat(i, { x: pos[i].x, y: pos[i].y }, { id: String(i + 1), name: o.name, mine, persona: 'manuel', manual: true });
      b.sailor = o.name; b.pid = o.pid;
      if (!mine) { b.remote = true; b.hand = true; b.color = COLORS[i % COLORS.length]; }
      return b;
    });
    const gx = d => ({ x: S.MARK.x + d * 270, y: (S.MARK.y + S.LINE.pin.y) / 2, rx: 120, ry: 190 });
    const gusts = c.gust === 'sol' ? [gx(-1)] : c.gust === 'sag' ? [gx(1)] : c.gust === 'iki' ? [gx(-1), gx(1)] : [];
    return { fleet, wind: c.bias, gusts, course, sea: { current: c.cur || 0, waves: 0 }, boat: { cls: c.cls, windKn: c.windKn, accelAt: 30, pre: c.pre, vis: 'normal' } };
  }

  // ---------- Durum ----------
  const N = { key: null, code: null, pid: null, name: '', meta: null, players: {}, boats: {}, offs: [], s: null, t0: 0, pubAt: 0,
    pubPh: '', shiftSaid: false, view: 'home', tab: 'join', lobby: {}, err: '', busy: false, resOpen: false, resAuto: false, lastUi: 0,
    results: {}, hosts: {}, seenMsg: null, watching: false, ended: false };
  const OWNER_TIP = 'Oda açma yetkisi: Velora hesabıyla girmiş bu kişi sonra kendi odasını açabilir';
  const isOwner = () => { const a = acc(); return !!(a && a.role === 'sahip' && (be && be.kind === 'yerel' || a.via === 'velora')); };
  const isHost = () => !!(N.meta && be && N.meta.host === be.uid());
  const base = () => `sailRooms/${N.key}`;
  let hostOk = null;          // bu hesap oda açabilir mi (null: bilinmiyor)
  async function checkHost() {
    const a = acc();
    if (!be) return false;
    if (be.kind === 'yerel') return (hostOk = !!(a && a.role === 'sahip'));
    const uid = be.uid();
    if (!uid) return (hostOk = false);
    if (a && a.role === 'sahip' && a.via === 'velora') return (hostOk = true);
    try { return (hostOk = (await be.get('sailHosts/' + uid)) === true); } catch (e) { return (hostOk = false); }
  }

  // ---------- Arayüz: üst çubuk düğmesi, yarış çipi, pencere ----------
  const html = s => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };
  const btn = html('<button id="btnNet" class="tool net-tool" title="Online yarış: şifreli odaya katıl ya da oda aç"><svg><use href="#i-fleet"/></svg><span class="lbl">Online</span></button>');
  const grp = document.querySelector('.sim-top .tool-group'); if (grp) grp.insertBefore(btn, grp.firstChild);
  const chip = html(`<div id="netChip" class="net-chip hidden" aria-live="polite">
    <span class="nc-dot"></span><span class="nc-txt" id="ncTxt">Online</span>
    <button class="tb nc-btn" id="ncRes" title="Sıralama ve sonuçlar">Sonuçlar</button>
    <button class="tb nc-btn nc-leave" id="ncLeave" title="Yarıştan ayrıl">Ayrıl</button></div>`);
  // çip ve telefondaki Online düğmesi sahnenin üstünde ortada (telefonda elle sürerken üst çubuk gizli)
  const fab = html('<button id="netFab" class="net-fab" title="Online yarış"><span class="nc-dot"></span>Online</button>');
  const stage = document.querySelector('.stage'); stage.appendChild(chip); stage.appendChild(fab);
  fab.addEventListener('click', () => openDlg());
  const dlg = html(`<div id="netDlg" class="picker dlg hidden net-dlg" role="dialog" aria-modal="true" aria-labelledby="netTitle">
    <div class="picker-panel dlg-panel wide">
      <div class="picker-head"><div><h2 id="netTitle">Online yarış</h2><div class="picker-sub" id="netSub"></div></div>
        <button class="icon" id="netClose" title="Kapat (Esc)"><svg><use href="#i-close"/></svg></button></div>
      <div class="net-body" id="netBody"></div>
    </div></div>`);
  document.querySelector('.stage').appendChild(dlg);
  const body = $('netBody');
  const toast = m => api.toast(m);
  function show(v) { dlg.classList.toggle('hidden', !v); if (v) render(); }
  const dlgOpen = () => !dlg.classList.contains('hidden');

  function render() {
    if (!dlgOpen()) return;
    const v = N.view;
    $('netTitle').textContent = v === 'room' ? `Oda ${N.code}` : v === 'res' ? 'Sonuçlar' : v === 'setup' ? 'Online yarışı aç' : 'Online yarış';
    $('netSub').textContent = v === 'room' ? (N.meta ? N.meta.name : '') : v === 'res' ? (N.meta ? `${N.meta.name} · oda ${N.code}` : '') : v === 'setup' ? 'Firebase Realtime Database · tek seferlik kurulum' : 'Şifreli odada başka cihazlardaki sporcularla yarış';
    body.innerHTML = v === 'room' ? roomHtml() : v === 'res' ? resHtml() : v === 'setup' ? setupHtml() : v === 'wait' ? `<p class="net-wait">${esc(N.err || 'Bağlanıyor…')}</p>` : homeHtml();
    if (v === 'home' && N.tab === 'host') formSync();
  }
  // giriş: katıl / oda aç
  function homeHtml() {
    const rooms = Object.entries(N.lobby || {}).map(([code, r]) => ({ code, ...r }))
      .filter(r => r.state === 'open' && (!r.at || be.now() - r.at < 12 * 3600e3)).sort((a, b) => (b.at || 0) - (a.at || 0));
    const nm = store.get(NAME, '') || ((acc() && acc().name) || '');
    const tabs = `<div class="seg net-tabs"><button data-tab="join" class="${N.tab === 'join' ? 'on' : ''}">Odaya katıl</button><button data-tab="host" class="${N.tab === 'host' ? 'on' : ''}">Oda aç</button></div>`;
    if (N.tab === 'join') return `${tabs}
      <div class="net-cols"><div class="net-col">
        <div class="net-h">Açık odalar</div>
        ${rooms.length ? `<ul class="net-rooms">${rooms.map(r => `<li><button data-room="${esc(r.code)}" class="${N.code === r.code ? 'on' : ''}"><b>${esc(r.code)}</b><span>${esc(r.name || 'Oda')}</span><small>${esc(r.hostName || '')} · ${r.n || 0}/${r.max || '?'} kişi</small></button></li>`).join('')}</ul>`
          : '<p class="net-empty">Şu an açık oda yok. Antrenörün oda açınca burada görünür; kodu ondan da alabilirsin.</p>'}
      </div><div class="net-col">
        <label class="dlg-lbl" for="netCode">Oda kodu</label>
        <input id="netCode" class="name-in dlg-in net-code" maxlength="6" autocomplete="off" spellcheck="false" value="${esc(N.code || '')}" placeholder="K7TR">
        <label class="dlg-lbl" for="netPass">Şifre</label>
        <input id="netPass" class="name-in dlg-in" type="password" maxlength="30" autocomplete="off">
        <label class="dlg-lbl" for="netName">Adın (teknende görünür)</label>
        <input id="netName" class="name-in dlg-in" maxlength="18" autocomplete="off" value="${esc(nm)}">
        <p class="net-err" id="netErr">${esc(N.err)}</p>
        <button class="tb primary net-go" data-act="join" ${N.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-check"/></svg>Odaya gir</button>
      </div></div>`;
    if (!hostOk) return `${tabs}<p class="net-empty">Oda açma yetkisi yalnız site sahibinde (Velora hesabıyla giriş). ${acc() && acc().role === 'sahip' && acc().via !== 'velora' ? 'Sen site sahibisin ama Velora hesabınla girmedin: hesap menüsünden çıkıp <b>Velora hesabıyla gir</b>.' : 'Antrenörünün açtığı odaya <b>Odaya katıl</b>\'dan gir.'}</p>`;
    const c = N.form;
    return `${tabs}
      <div class="net-form">
        <div class="net-row3">
          <div><label class="dlg-lbl" for="nfName">Oda adı</label><input id="nfName" class="name-in dlg-in" maxlength="30" value="${esc(c.name)}"></div>
          <div><label class="dlg-lbl" for="nfCode">Oda kodu</label><input id="nfCode" class="name-in dlg-in net-code" maxlength="6" value="${esc(c.code)}"></div>
          <div><label class="dlg-lbl" for="nfPass">Şifre</label><input id="nfPass" class="name-in dlg-in" maxlength="30" value="${esc(c.pass)}" placeholder="en az 3 harf"></div>
        </div>
        ${FORM.map(([title, rows]) => `<div class="net-h">${title}</div>${rows.map(([k, lbl, opts, dep]) => `<div class="net-opt" data-row="${k}"${dep ? ' data-dep="1"' : ''}><span class="net-ol">${lbl}</span><div class="seg" data-k="${k}">${opts.map(([v, t]) => `<button data-v="${esc(v)}">${esc(t)}</button>`).join('')}</div></div>`).join('')}`).join('')}
        <div class="net-sum" id="nfSum"></div>
        <label class="dlg-lbl" for="netName">Adın (teknende görünür)</label>
        <input id="netName" class="name-in dlg-in" maxlength="18" autocomplete="off" value="${esc(nm)}">
        <p class="net-err" id="netErr">${esc(N.err)}</p>
        <button class="tb primary net-go" data-act="create" ${N.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-check"/></svg>Odayı aç</button>
      </div>`;
  }
  function formSync() {
    const c = N.form;
    body.querySelectorAll('.seg[data-k]').forEach(sg => {
      const k = sg.dataset.k;
      [...sg.children].forEach(b => b.classList.toggle('on', b.dataset.v === String(c[k])));
    });
    FORM.forEach(([, rows]) => rows.forEach(([k, , , dep]) => { const r = body.querySelector(`[data-row="${k}"]`); if (r && dep) r.classList.toggle('hidden', !dep(c)); }));
    const sm = $('nfSum'); if (sm) sm.innerHTML = cfgSummary(c).map(x => `<span class="rc">${esc(x)}</span>`).join('');
  }
  // bekleme odası
  function roomHtml() {
    const m = N.meta || {}, ps = playerList(), host = isHost(), max = m.max || 0;
    const link = `${location.origin}${location.pathname}?oda=${encodeURIComponent(N.code)}${mode === 'yerel' ? '&net=yerel' : ''}`;
    const racing = m.state === 'racing', inRace = racing && (m.order || []).some(o => o.pid === N.pid), me = (N.players || {})[N.pid];
    return `<div class="net-room">
      <div class="rec-sum">${cfgSummary(m.cfg || CFG0).map(x => `<span class="rc">${esc(x)}</span>`).join('')}</div>
      <div class="net-h">Katılımcılar <small>${ps.length}/${max}</small></div>
      <ul class="net-players">${ps.map((p, i) => `<li class="${p.on === false ? 'off' : ''}${p.ready ? ' ready' : ''}"><span class="np-no">${i + 1}</span><b>${esc(p.name)}</b>${p.pid === N.pid ? '<span class="np-me">sen</span>' : ''}${p.host ? '<span class="np-host">oda sahibi</span>' : ''}${p.watch ? '<span class="np-watch">izliyor</span>' : p.ready ? '<span class="np-ready">✓ hazır</span>' : ''}${p.on === false ? '<small>bağlantı yok</small>' : ''}${isOwner() && p.uid && p.uid !== be.uid() ? `<button class="tb np-coach${N.hosts[p.uid] ? ' on' : ''}" data-coach="${esc(p.uid)}" title="${OWNER_TIP}">${N.hosts[p.uid] ? '✓ Antrenör' : 'Antrenör yap'}</button>` : ''}${host && p.pid !== N.pid && m.state === 'open' ? `<button class="icon sm" data-kick="${esc(p.pid)}" title="Odadan çıkar"><svg><use href="#i-close"/></svg></button>` : ''}</li>`).join('')}</ul>
      ${m.state === 'open' ? `<div class="net-me">${me && me.watch ? '<span class="dlg-note">Bu yarışı tekne sürmeden izleyeceksin.</span>' : `<button class="tb net-ready${me && me.ready ? ' on' : ''}" data-act="ready">${me && me.ready ? '✓ Hazırım' : 'Hazırım'}</button>`}${host ? `<button class="tb" data-act="watch" title="Antrenör ekranı: yarışı tekne sürmeden, bütün tekneleri izle">${me && me.watch ? 'Ben de yarışacağım' : 'Ben izleyeceğim'}</button>` : ''}${host && ps.length > 1 ? `<span class="net-rc">${ps.filter(p => p.ready && !p.watch).length}/${ps.filter(p => !p.watch).length} hazır</span>` : ''}</div>` : ''}
      ${chatHtml()}
      ${seriesHtml()}
      ${host ? `<div class="net-share"><span>Sporculara kodu (<b>${esc(N.code)}</b>) ve şifreyi söyle ya da bağlantıyı gönder:</span><button class="tb" data-act="copy" data-link="${esc(link)}">Bağlantıyı kopyala</button></div>` : ''}
      <p class="net-err" id="netErr">${esc(N.err)}</p>
      <p class="dlg-note">${racing ? (inRace ? 'Yarış sürüyor.' : 'Yarış sürüyor, bu yarışta yoksun: tekne sürmeden izleyebilirsin.') : host ? '<b>Başlat</b>\'a basınca oda kilitlenir (yeni kimse giremez), geri sayım herkeste aynı anda başlar. Herkes kendi teknesini elle sürer; yelken boş, start hattının dibinde başlarsın.' : 'Oda sahibinin <b>Başlat</b>\'a basması bekleniyor. Başlayınca teknen start hattının dibinde, yelken boş olur: ← → dümen, Çek ile yelkeni doldur.'}</p>
      </div>
      <div class="dlg-actions">
        ${host ? '<button class="tb" data-act="close">Odayı kapat</button>' : '<button class="tb" data-act="leave">Odadan çık</button>'}
        ${host && !racing ? `<button class="tb primary" data-act="start" ${ps.filter(p => p.on !== false).length ? '' : 'disabled'}><svg class="ci"><use href="#i-play"/></svg>Başlat</button>` : ''}
        ${inRace && !N.s ? '<button class="tb primary" data-act="rejoin">Yarışa dön</button>' : ''}
        ${racing && !inRace && !N.s ? '<button class="tb primary" data-act="watchNow"><svg class="ci"><use href="#i-eye"/></svg>İzle</button>' : ''}
      </div>`;
  }
  function playerList() {
    const host = N.meta && N.meta.host;
    return Object.entries(N.players || {}).map(([pid, p]) => ({ pid, ...p, host: p.uid && p.uid === host })).sort((a, b) => (a.at || 0) - (b.at || 0));
  }
  // sonuçlar: bitirenler süreye göre, sonra yarışanlar sıralamadaki yerine göre
  // kısa mesaj: her oyuncunun son mesajı (players/{pid}/msg); hazır cümleler + serbest yazı
  const QUICK = ['Hazırım', 'Bekleyin', '1 dakika', 'Başlayalım!', 'Bağlantım koptu', 'İyi yarıştı 👍'];
  function msgs() {
    return Object.entries(N.players || {}).filter(([, p]) => p.msg && p.msg.t).map(([pid, p]) => ({ pid, name: p.name, t: p.msg.t, at: p.msg.at || 0 }))
      .sort((a, b) => a.at - b.at).slice(-8);
  }
  function chatHtml() {
    const ms = msgs();
    return `<div class="net-h">Mesajlar</div>
      <div class="net-chat">${ms.length ? ms.map(x => `<div class="${x.pid === N.pid ? 'me' : ''}"><b>${esc(x.name)}</b>${esc(x.t)}</div>`).join('') : '<span class="net-empty">Henüz mesaj yok.</span>'}</div>
      <div class="net-say"><div class="net-quick">${QUICK.map(q => `<button class="tb" data-say="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <div class="net-sayrow"><input id="netMsg" class="name-in" maxlength="60" autocomplete="off" placeholder="Mesaj yaz…"><button class="tb" data-act="say">Gönder</button></div></div>`;
  }
  async function say(t) {
    t = String(t || '').trim().replace(/\s+/g, ' ').slice(0, 60); if (!t || !N.key) return;
    await be.update(`${base()}/players/${N.pid}`, { msg: { t, at: SV } }).catch(() => toast('Mesaj gönderilemedi'));
  }
  function msgToasts() {
    const ms = msgs(), last = ms.length ? ms[ms.length - 1].at : 0;
    if (N.seenMsg == null) { N.seenMsg = last; return; }
    for (const x of ms) if (x.at > N.seenMsg && x.pid !== N.pid && !(dlgOpen() && (N.view === 'room' || N.view === 'res'))) toast(`${x.name}: ${x.t}`);
    N.seenMsg = Math.max(N.seenMsg, last);
  }
  // Art arda yarışlar: sonuçlar odada saklanır (results/{go}); puan = sıra, bitirmeyen / OCS / diskalifiye = başlayan sayısı + 1
  function series() {
    const races = Object.values(N.results || {}).filter(r => r && r.list).sort((a, b) => (a.go || 0) - (b.go || 0));
    const rows = {};
    races.forEach((r, k) => {
      const n = r.list.length;
      for (const e of r.list) {
        const row = rows[e.pid] || (rows[e.pid] = { name: e.name, pts: [], tot: 0 });
        const pt = e.pos || n + 1; row.pts[k] = { pt, code: e.pos ? '' : e.st }; row.tot += pt; row.name = e.name;
      }
    });
    for (const r of Object.values(rows)) for (let k = 0; k < races.length; k++) if (!r.pts[k]) { const n = races[k].list.length; r.pts[k] = { pt: n + 1, code: 'yok' }; r.tot += n + 1; }
    return { races, rows: Object.values(rows).sort((a, b) => a.tot - b.tot) };
  }
  function seriesHtml() {
    const { races, rows } = series(); if (!races.length) return '';
    return `<div class="net-h">Puan tablosu <small>${races.length} yarış · az puan önde</small></div>
      <div class="net-series"><table><thead><tr><th></th><th>Sporcu</th>${races.map((r, k) => `<th>${k + 1}</th>`).join('')}<th>Toplam</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td>${r.pts.map(p => `<td title="${p.code ? esc(p.code.toUpperCase()) : ''}">${p.pt}${p.code ? `<small>${esc(p.code.toUpperCase())}</small>` : ''}</td>`).join('')}<td><b>${r.tot}</b></td></tr>`).join('')}</tbody></table></div>`;
  }
  function results() {
    const s = N.s; if (!s) return [];
    const st = S.standings(s);
    return st.map(({ b, status }) => ({ b, status: b.gone ? 'Bağlantı koptu' : status }));
  }
  function resHtml() {
    const rs = results(), host = isHost(), done = N.meta && N.meta.state === 'done';
    return `${rs.length ? '' : '<p class="net-empty">Bu yarışın canlı sıralaması yok (yarışta değilsin).</p>'}<ol class="net-res">${rs.map(({ b, status }) => `<li class="${b.mine ? 'me' : ''}"><span class="nr-no">${b.finish && !b.dsq ? b.finish : '–'}</span><i style="background:${b.color}"></i><b>${esc(b.sailor || b.name)}</b><span class="nr-st">${esc(status)}</span></li>`).join('')}</ol>
      <p class="dlg-note">${done ? 'Yarış bitti, sonuç odada saklandı.' : 'Yarış sürüyor: sıralama canlı güncellenir.'} Süre start'tan finişe kadar (yalnız orsada şamandırayı dönüşe kadar); cezalar (iki tur) süreye zaten eklenmiş olur.</p>
      ${done ? seriesHtml() : ''}${chatHtml()}
      <div class="dlg-actions">
        ${host && !done ? '<button class="tb" data-act="end">Yarışı bitir</button>' : ''}
        ${host ? '<button class="tb primary" data-act="again">Yeni yarış (aynı oda)</button>' : ''}
        ${!host && done ? '<button class="tb" data-act="leave">Odadan çık</button>' : ''}
        <button class="tb${host ? '' : ' primary'}" data-act="hide">${done ? 'Kapat' : 'Yarışa dön'}</button>
      </div>`;
  }
  // Firebase kurulumu (yalnız oda açabilecek kişiye: kuralların içinde kendi uid'i)
  function rulesText(uid) {
    const H = `(auth.uid === '${uid}' || root.child('sailHosts').child(auth.uid).val() === true)`;
    return JSON.stringify({ rules: {
      sailHosts: { '.read': 'auth != null', $uid: { '.write': `auth != null && auth.uid === '${uid}'` } },
      sailLobby: { '.read': true, $code: { '.write': `auth != null && ${H} && (!data.exists() || data.child('host').val() === auth.uid || data.child('at').val() < now - 43200000)` } },
      sailRooms: { $key: {
        '.read': true,
        '.write': "auth != null && data.child('meta/host').val() === auth.uid",
        meta: { '.write': `auth != null && ${H} && (!data.exists() || data.child('host').val() === auth.uid)` },
        players: { $pid: {
          '.write': "data.exists() ? (!newData.exists() || newData.child('name').val() === data.child('name').val()) : root.child('sailRooms').child($key).child('meta/state').val() === 'open'",   // RTDB kurallarında sayma yok: katılımcı sınırını uygulama denetler
          '.validate': "!newData.exists() || (newData.child('name').isString() && newData.child('name').val().length <= 24)"
        } },
        boats: { $pid: { '.write': "root.child('sailRooms').child($key).child('players').child($pid).exists()" } }
      } }
    } }, null, 2);
  }
  function setupHtml() {
    const uid = be && be.uid && be.uid();
    const url = `https://console.firebase.google.com/project/${PROJECT}/database`;
    if (!uid || !(acc() && acc().role === 'sahip')) return `<p class="net-empty">Online yarış henüz açılmadı (site sahibinin Firebase'de bir kez kurulum yapması gerekiyor).${beErr ? ` <small>(${esc(beErr)})</small>` : ''}</p>`;
    return `<div class="net-setup"><ol>
        <li><a href="${url}" target="_blank" rel="noopener">Firebase konsolunda Realtime Database</a> sayfasını aç → <b>Veritabanı oluştur</b> (Create Database).</li>
        <li>Konum: <b>Belçika (europe-west1)</b>. Güvenlik: <b>Kilitli modda başlat</b> (locked mode).</li>
        <li><b>Kurallar</b> (Rules) sekmesindeki metnin tamamını silip aşağıdakini yapıştır → <b>Yayınla</b> (Publish).</li>
        <li>Bu sayfayı yenile, <b>Online</b>'a yeniden dokun.</li></ol>
      <div class="net-rules-h"><span>Kurallar (senin hesabın: oda açma yetkisi)</span><button class="tb" data-act="copyRules">Kopyala</button></div>
      <pre class="net-rules" id="netRules">${esc(rulesText(uid))}</pre>
      <p class="dlg-note">Şifre kurallarla korunur: odanın yolu kod ve şifreden üretilir, şifreyi bilmeyen odayı bulamaz; Başlat'tan sonra kimse giremez. ${beErr ? `Hata: ${esc(beErr)}` : ''}</p></div>`;
  }

  // ---------- Olaylar ----------
  body.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.tab) { N.tab = t.dataset.tab; N.err = ''; render(); return; }
    if (t.dataset.room) { N.code = t.dataset.room; render(); const p = $('netPass'); if (p) p.focus(); return; }
    if (t.dataset.kick) { kick(t.dataset.kick); return; }
    if (t.dataset.say) { say(t.dataset.say); return; }
    if (t.dataset.coach) { coach(t.dataset.coach); return; }
    const sg = t.closest('.seg[data-k]');
    if (sg) { const k = sg.dataset.k, v = t.dataset.v; N.form[k] = typeof CFG0[k] === 'number' ? +v : v; store.set(CFGK, pick(N.form)); formSync(); return; }
    const a = t.dataset.act; if (!a) return;
    if (a === 'join') doJoin();
    else if (a === 'create') doCreate();
    else if (a === 'start') doStart();
    else if (a === 'leave') leave(true);
    else if (a === 'close') closeRoom();
    else if (a === 'end') endRace();
    else if (a === 'ready') { const me = N.players[N.pid] || {}; be.update(`${base()}/players/${N.pid}`, { ready: !me.ready }).catch(() => {}); }
    else if (a === 'watch') { const me = N.players[N.pid] || {}; be.update(`${base()}/players/${N.pid}`, { watch: !me.watch, ready: false }).catch(() => {}); }
    else if (a === 'watchNow') { show(false); startWatch(); }
    else if (a === 'say') { const x = $('netMsg'); if (x) { say(x.value); x.value = ''; } }
    else if (a === 'again') again();
    else if (a === 'hide') { N.resOpen = false; show(false); if (N.meta && N.meta.state === 'done' && !N.s) { N.view = 'room'; } }
    else if (a === 'rejoin') { show(false); startRace(); }
    else if (a === 'copy') copy(t.dataset.link, 'Bağlantı kopyalandı');
    else if (a === 'copyRules') copy($('netRules').textContent, 'Kurallar kopyalandı: Firebase konsolunda Kurallar sekmesine yapıştır');
  });
  body.addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'netCode' || id === 'nfCode') { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, ''); try { e.target.setSelectionRange(p, p); } catch (x) { /* yok */ } }
    if (N.form && (id === 'nfName' || id === 'nfCode' || id === 'nfPass')) N.form[{ nfName: 'name', nfCode: 'code', nfPass: 'pass' }[id]] = e.target.value;
  });
  body.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.closest('input')) return;
    if (e.target.id === 'netMsg') { say(e.target.value); e.target.value = ''; return; }
    const g = body.querySelector('.net-go'); if (g) g.click();
  });
  const pick = c => { const o = {}; for (const k in CFG0) o[k] = c[k]; return o; };
  function copy(text, msg) {
    const done = () => toast(msg);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('Kopyala:', text));
    else prompt('Kopyala:', text);
  }
  const setErr = m => { N.err = m || ''; const x = $('netErr'); if (x) x.textContent = N.err; };
  const busy = v => { N.busy = v; body.querySelectorAll('.net-go').forEach(b => { b.disabled = v; }); };
  function readName() {
    const n = (($('netName') && $('netName').value) || '').trim().replace(/\s+/g, ' ').slice(0, 18);
    if (n) store.set(NAME, n);
    return n;
  }

  async function openDlg(code) {
    if (window.SailAccess && !SailAccess.guard('sim.drive')) return;
    if (code) { N.code = code.toUpperCase(); N.tab = 'join'; }
    if (N.key) { N.view = N.s && N.meta && N.meta.state !== 'open' ? 'res' : 'room'; show(true); return; }
    N.view = 'wait'; N.err = ''; show(true);
    const b = await backend();
    if (!b) { N.view = 'setup'; render(); return; }
    await checkHost();
    if (!N.form) N.form = { ...CFG0, ...store.get(CFGK, {}), name: `${(acc() && acc().name) || 'Antrenman'} yarışı`, code: newCode(), pass: '' };
    if (!N.lobbyOff) N.lobbyOff = be.on('sailLobby', v => { N.lobby = v || {}; if (N.view === 'home' && N.tab === 'join' && !body.contains(document.activeElement)) render(); });
    N.view = 'home'; render();
  }
  btn.addEventListener('click', () => openDlg());
  $('netClose').addEventListener('click', () => { N.resOpen = false; show(false); });
  $('ncRes').addEventListener('click', () => { N.view = 'res'; N.resOpen = true; show(true); });
  $('ncLeave').addEventListener('click', () => { if (!N.s) { N.view = 'room'; show(true); return; } if (confirmLeave()) leave(true); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlgOpen()) { e.stopImmediatePropagation(); N.resOpen = false; show(false); } }, true);
  let leaveArm = 0;
  function confirmLeave() {
    if (Date.now() - leaveArm < 3000) return true;
    leaveArm = Date.now(); toast(isHost() ? 'Ayrılmak için yeniden dokun (oda açık kalır; kapatmak için Sonuçlar → oda)' : 'Yarıştan ayrılmak için yeniden dokun');
    return false;
  }

  async function doJoin() {
    const code = (($('netCode') && $('netCode').value) || '').trim().toUpperCase(), pass = ($('netPass') && $('netPass').value) || '', name = readName();
    if (!code) return setErr('Oda kodunu yaz.');
    if (!pass) return setErr('Şifreyi yaz.');
    if (!name) return setErr('Adını yaz: teknende görünecek.');
    busy(true); setErr('');
    try {
      const key = await roomKey(code, pass), meta = await be.get(`sailRooms/${key}/meta`);
      if (!meta) { busy(false); return setErr('Kod ya da şifre yanlış.'); }
      const players = (await be.get(`sailRooms/${key}/players`)) || {};
      const old = store.sget(SESS), pid = old && old.key === key && players[old.pid] ? old.pid : rid();
      if (!players[pid]) {
        if (meta.state !== 'open') { busy(false); return setErr('Yarış başladı: odaya giriş kapalı. Oda sahibi yeni yarış açınca gir.'); }
        if (Object.keys(players).length >= (meta.max || 0)) { busy(false); return setErr(`Oda dolu (${meta.max} kişi).`); }
        await be.set(`sailRooms/${key}/players/${pid}`, { name, at: SV, on: true, uid: be.uid() || null });
      } else await be.update(`sailRooms/${key}/players/${pid}`, { on: true });
      track('online_join', { code });
      enterRoom(key, code, pid, name);
    } catch (e) { console.warn('[online] katıl', e); setErr(/permission|PERMISSION/.test(String(e && (e.code || e.message))) ? 'Odaya girilemedi: oda dolu ya da yarış başlamış.' : 'Bağlanılamadı. İnternetini kontrol et.'); }
    busy(false);
  }
  async function doCreate() {
    const c = N.form, name = readName(), code = (c.code || '').trim().toUpperCase(), pass = (c.pass || '').trim();
    if (!/^[A-Z0-9ÇĞİÖŞÜ]{3,6}$/.test(code)) return setErr('Oda kodu 3-6 harf ya da rakam olmalı.');
    if (pass.length < 3) return setErr('Şifre en az 3 karakter olmalı.');
    if (!name) return setErr('Adını yaz: teknende görünecek.');
    busy(true); setErr('');
    try {
      const uid = be.uid(), key = await roomKey(code, pass), lob = await be.get('sailLobby/' + code);
      if (lob && lob.host !== uid && lob.at && be.now() - lob.at < 12 * 3600e3) { busy(false); return setErr('Bu kod şu an başka bir odada. Başka kod seç.'); }
      const old = await be.get(`sailRooms/${key}/meta`);
      if (old && old.host !== uid) { busy(false); return setErr('Bu kod ve şifreyle başka bir oda var. Şifreyi değiştir.'); }
      const cfg = pick(c), hostName = (acc() && acc().name) || name;
      if (old) await be.remove(`sailRooms/${key}`);
      await be.set(`sailRooms/${key}/meta`, { code, name: (c.name || 'Oda').slice(0, 30), host: uid, hostName, max: cfg.max, cfg, state: 'open', at: SV });
      await be.set('sailLobby/' + code, { name: (c.name || 'Oda').slice(0, 30), host: uid, hostName, state: 'open', n: 1, max: cfg.max, at: SV });
      const pid = rid();
      await be.set(`sailRooms/${key}/players/${pid}`, { name, at: SV, on: true, uid });
      store.set(CFGK, cfg);
      track('online_room', { code, max: cfg.max });
      N.form.code = newCode();
      enterRoom(key, code, pid, name);
      toast(`Oda ${code} açıldı · sporculara kodu ve şifreyi söyle`);
    } catch (e) {
      console.warn('[online] oda aç', e);
      setErr(/permission|PERMISSION/.test(String(e && (e.code || e.message))) ? 'Oda açılamadı: yetki yok. Firebase kuralları yayında mı? (Online → kurulum)' : 'Oda açılamadı. İnternetini kontrol et.');
      if (/permission|PERMISSION/.test(String(e && (e.code || e.message)))) { N.view = 'setup'; render(); }
    }
    busy(false);
  }
  function enterRoom(key, code, pid, name) {
    leaveSubs();
    Object.assign(N, { key, code, pid, name, meta: null, players: {}, boats: {}, results: {}, seenMsg: null, view: 'room', err: '' });
    store.sset(SESS, { key, code, pid, name, net: mode });
    be.leaveSet(`${base()}/players/${pid}/on`, false);
    N.offs.push(be.on(base() + '/meta', onMeta));
    N.offs.push(be.on(base() + '/players', v => { N.players = v || {}; msgToasts(); if (isHost()) lobbyCount(); if (N.view === 'room' && !typing()) render(); N.lastUi = 0; chipUpdate(); }));
    N.offs.push(be.on(base() + '/results', v => { N.results = v || {}; if ((N.view === 'room' || N.view === 'res') && !typing()) render(); }));
    if (isOwner()) be.get('sailHosts').then(v => { N.hosts = v || {}; if (N.view === 'room') render(); }).catch(() => {});
    N.offs.push(be.on(base() + '/boats', v => { N.boats = v || {}; }));
    render();
  }
  function leaveSubs() { N.offs.forEach(f => { try { f(); } catch (e) { /* yok */ } }); N.offs = []; }
  let lobbyT = 0;
  function lobbyCount() {
    clearTimeout(lobbyT);
    lobbyT = setTimeout(() => { if (N.meta && isHost()) be.update('sailLobby/' + N.code, { n: Object.keys(N.players || {}).length, state: N.meta.state }).catch(() => {}); }, 400);
  }
  function onMeta(m) {
    const prev = N.meta; N.meta = m;
    if (!m) {                                            // oda kapandı
      if (prev) { toast('Oda kapatıldı'); leave(false); }
      return;
    }
    const fresh = !prev || prev.go !== m.go || prev.state !== 'racing';
    if (m.state === 'racing' && m.go && !N.s && fresh) {
      if ((m.order || []).some(o => o.pid === N.pid)) { show(false); startRace(); }
      else if ((N.players[N.pid] || {}).watch) { show(false); startWatch(); }   // antrenör ekranı: tekne sürmeden izle
    }
    else if (m.state === 'open' && N.s) { stopRace(); N.view = 'room'; show(true); toast('Oda sahibi yeni yarış açtı'); }
    else if (m.state === 'done' && N.s && (!prev || prev.state !== 'done')) { N.view = 'res'; N.resOpen = true; show(true); }
    if (isHost()) lobbyCount();
    if (dlgOpen() && (N.view === 'room' || N.view === 'res') && !typing()) render();
    N.lastUi = 0; chipUpdate();
  }
  async function doStart() {
    const order = playerList().filter(p => p.on !== false && !p.watch).map(p => ({ pid: p.pid, name: p.name }));
    if (!order.length) return;
    await be.remove(base() + '/boats');
    N.ended = false;
    await be.update(base() + '/meta', { state: 'racing', go: SV, order });
    track('online_start', { code: N.code, n: order.length });
  }
  async function again() {
    if (N.meta && N.meta.state === 'racing') await endRace();   // yarış bitmeden yenisi: o ana kadarki sonuç saklanır
    const rd = {}; for (const pid in N.players) rd[pid + '/ready'] = false;
    await be.update(base() + '/players', rd).catch(() => {});
    await be.update(base() + '/meta', { state: 'open', go: null, order: null });
    await be.remove(base() + '/boats');
    N.view = 'room'; render();
  }
  async function kick(pid) { await be.remove(`${base()}/players/${pid}`); }
  async function coach(uid) {
    const on = !N.hosts[uid];
    try { await be.set('sailHosts/' + uid, on ? true : null); N.hosts[uid] = on || undefined; toast(on ? 'Oda açma yetkisi verildi: Velora hesabıyla girince Online → Oda aç' : 'Oda açma yetkisi geri alındı'); }
    catch (e) { toast('Yetki verilemedi (Firebase kuralları güncel mi?)'); }
    render();
  }
  // Yarış sonu (oda sahibi): sonuç odada saklanır, oda "bitti" olur. Herkes bitirince kendiliğinden.
  async function endRace() {
    if (!isHost() || N.ended || !N.meta || N.meta.state !== 'racing') return;
    N.ended = true;
    const s = N.s, go = N.meta.go;
    if (s) {
      const list = S.standings(s).map(({ b }) => {
        const fin = b.finish && !b.dsq && !b.out && b.finishT != null;
        return { pid: b.pid || '', name: b.sailor || b.name, pos: fin ? b.finish : null, t: fin ? Math.round(b.finishT * S.CLOCK_SCALE) : null, pen: b.penalties || 0,
          st: fin ? 'fin' : b.dsq ? String(b.dsq).slice(0, 4).toLowerCase() : b.phase === 'ocs' ? 'ocs' : b.gone ? 'dnc' : 'dnf' };
      });
      await be.set(`${base()}/results/${go}`, { go, at: SV, cfg: N.meta.cfg, list }).catch(() => {});
    }
    await be.update(base() + '/meta', { state: 'done' }).catch(() => {});
  }
  async function closeRoom() {
    const key = N.key, code = N.code;
    stopRace(); leaveSubs();
    await be.remove('sailLobby/' + code).catch(() => {});
    await be.remove('sailRooms/' + key).catch(() => {});
    reset(); toast(`Oda ${code} kapatıldı`);
  }
  async function leave(user) {
    const key = N.key, pid = N.pid, open = N.meta && N.meta.state === 'open';
    stopRace(); leaveSubs();
    if (user && key && pid && be) {
      be.leaveCancel(`sailRooms/${key}/players/${pid}/on`);
      if (open) await be.remove(`sailRooms/${key}/players/${pid}`).catch(() => {});
      else await be.update(`sailRooms/${key}/players/${pid}`, { on: false }).catch(() => {});
    }
    reset();
  }
  function reset() {
    store.sset(SESS, null);
    Object.assign(N, { key: null, pid: null, meta: null, players: {}, boats: {}, results: {}, view: 'home', resOpen: false, watching: false });
    chipUpdate();
    if (dlgOpen()) render();
  }

  // ---------- Yarış ----------
  const simNow = () => (be.now() - N.t0) / 1000 / S.CLOCK_SCALE;
  function startRace() {
    const m = N.meta; if (!m || !m.order) return;
    const setup = buildSetup(m.cfg, m.order, N.pid), mineB = N.boats[N.pid];
    N.t0 = m.go + LEAD; N.shiftSaid = false; N.resAuto = false; N.pubPh = '';
    if (mineB && mineB.t > 0) setup.patch = s => {          // sayfa yenilendi: teknen kaldığı yerden
      const b = s.boats.find(o => o.pid === N.pid); if (!b) return;
      Object.assign(b, { x: mineB.x, y: mineB.y, h: mineB.h, v: mineB.v, tack: mineB.tk ? 'port' : 'starboard', phase: mineB.ph, started: !!mineB.st, penalties: mineB.pn || 0, finishT: mineB.fT, doneAt: mineB.dA, dsq: mineB.dq || undefined, drv: true });
      s.t = mineB.t;
    };
    const s = api.netStart(setup, NET);
    if (!s) { toast('Online yarış için giriş gerekli'); return; }
    N.s = s;
    const m0 = s.boats.find(b => b.mine);
    if (m0 && mineB && mineB.t > 0) m0.sheetOff = mineB.so || 0;                    // yenilenen sayfa: iskota kaldığı gibi
    else if (m0 && m0.phase === 'wait') { m0.sheetOff = S.SHEET_OFF_MAX; m0.v = 0; }   // yelken boş (pırpır), tekne duruyor
    const lead = Math.round((N.t0 - be.now()) / 1000);
    toast(lead > 0 ? `Yarış ${lead} sn sonra başlıyor · geri sayım ${optTxt('pre', m.cfg.pre)} · yelken boş, Çek ile doldur` : 'Yarışa döndün');
    track('online_race', { code: N.code, n: m.order.length });
    chipUpdate();
  }
  function stopRace() {
    if (!N.s) return;
    N.s = null; N.watching = false; api.netStop(); chipUpdate();
  }
  // Antrenör ekranı: teknesi olmadan, bütün tekneler ağdan; saat ve rüzgar herkesle aynı
  function startWatch() {
    const m = N.meta; if (!m || !m.order || !api.netWatch) return;
    const setup = buildSetup(m.cfg, m.order, null);
    N.t0 = m.go + LEAD; N.shiftSaid = false; N.resAuto = true;
    const s = api.netWatch(setup, WATCH); if (!s) return;
    N.s = s; N.watching = true;
    toast('İzliyorsun · bütün tekneler canlı. + − ile yakınlaş, sürükleyerek kaydır');
    chipUpdate();
  }
  const WATCH = {
    tick(w, dt) {
      const s = w.s, target = simNow();
      if (!N.meta || !N.meta.cfg || target <= s.t) { chipUpdate(); return; }
      let n = 0;
      while (s.t + S.DT <= target + 1e-9 && n < 600) {
        applyWind(s); applyRemotes(s);
        w.prev = s.boats.map(b => ({ x: b.x, y: b.y, h: b.h }));
        S.step(s); afterStep(s, null); n++;
      }
      const a = clamp((target - s.t) / S.DT, 0, 1), P = w.prev;
      w.view = P && P.length === s.boats.length ? { ...s, boats: s.boats.map((b, i) => ({ ...b, x: P[i].x + (b.x - P[i].x) * a, y: P[i].y + (b.y - P[i].y) * a, h: E.lerpAngle(P[i].h, b.h, a) })) } : s;
      chipUpdate();
    }
  };
  // öbür tekneler: son gelen durumdan bu ana tahmin (hız × geçen süre), küçük farkı yumuşak kapat
  function applyRemotes(s) {
    const staleT = STALE / 1000 / S.CLOCK_SCALE;
    for (const b of s.boats) {
      if (!b.remote) continue;
      const p = N.boats[b.pid];
      if (!p) { b.gone = s.t > staleT * 1.5 && !N.players[b.pid]; continue; }
      const age = s.t - p.t;
      b.gone = age > staleT && (!N.players[b.pid] || N.players[b.pid].on === false || age > staleT * 3);
      if (b.gone) continue;
      const dt = clamp(age, 0, 1.2), f = E.fwd(p.h), px = p.x + f.x * p.v * dt, py = p.y + f.y * p.v * dt;
      if (Math.hypot(px - b.x, py - b.y) > 60 || !b.netSeen) { b.x = px; b.y = py; b.h = p.h; }
      else { b.x += (px - b.x) * 0.35; b.y += (py - b.y) * 0.35; b.h = E.lerpAngle(b.h, p.h, 0.5); }
      b.netSeen = true; b.v = p.v; b.tack = p.tk ? 'port' : 'starboard'; b.phase = p.ph; b.started = !!p.st; b.penalties = p.pn || 0;
      b.leg = p.lg || 0; b.rMk = p.rm || null;
      b.finishT = p.fT == null ? null : p.fT; b.doneAt = p.dA == null ? null : p.dA; b.dsq = p.dq || undefined;
      b.sheetOff = p.so || 0; b.sheet = p.sh == null ? null : p.sh; b.back = !!p.bk; b.hand = true; b.remote = true;
      if (p.nt) { b.note = p.nt; b.noteKind = p.nk || ''; b.noteUntil = s.t + 0.6; }
    }
  }
  function applyWind(s) {
    const c = N.meta.cfg, w = windAt(c, s);
    if (c.shiftDir && !N.shiftSaid && (s.t - s.startAt) * S.CLOCK_SCALE >= c.shiftAt * 60) {
      N.shiftSaid = true;
      s.events.push({ t: s.t, text: `Rüzgar ${c.shiftDir > 0 ? 'sağa' : 'sola'} dönüyor (${c.shiftDeg}°)`, kind: 'wind' });
      toast(`Rüzgar ${c.shiftDir > 0 ? 'sağa' : 'sola'} dönüyor: ${c.shiftDeg}°`);
    }
    s.wind = w;
  }
  function afterStep(s, m) {
    // ceza turu bitip yarışa dönünce dümen yine sende (şamandıra dönüşü ve ceza turu otomatik)
    if (m && !m.hand && m.phase === 'race' && m.penaltyAt == null) { m.hand = true; m.manual = true; m.sheetOff = 0; }
    // bitiş sırası: herkeste aynı (şamandırayı dönüş süresine göre)
    const fin = s.boats.filter(b => b.finishT != null && !b.dsq).sort((a, b) => a.finishT - b.finishT);
    fin.forEach((b, i) => { b.finish = i + 1; });
    // herkes bitirdi (ya da yarıştan çıktı / bağlantısı koptu): oda sahibi sonucu saklar
    if (isHost() && !N.ended && s.t > s.startAt && s.boats.every(b => b.gone || b.out || b.phase === 'done' || b.finishT != null)) setTimeout(endRace, 1500);
  }
  function publish(s, m, force) {
    const now = performance.now();
    if (!force && now - N.pubAt < PUB_MS && m.phase === N.pubPh) return;
    N.pubAt = now; N.pubPh = m.phase;
    const r = (v, k) => (v == null || !isFinite(v) ? null : +(+v).toFixed(k));
    be.set(`${base()}/boats/${N.pid}`, {
      x: r(m.x, 1), y: r(m.y, 1), h: r(m.h, 1), v: r(m.v, 2), tk: m.tack === 'port' ? 1 : 0, ph: m.phase, st: m.started ? 1 : 0, pn: m.penalties || 0,
      so: r(m.sheetOff || 0, 1), sh: r(m.sheet, 1), bk: m.back ? 1 : 0, fT: r(m.finishT, 2), dA: r(m.doneAt, 2), dq: m.dsq || null, lg: m.leg || 0, rm: m.rMk || null,
      nt: m.note && m.noteUntil > s.t && m.noteKind === 'bad' ? String(m.note).slice(0, 40) : null, nk: m.noteKind || null, t: r(s.t, 3)
    }).catch(() => {});
  }
  // sim.js her ekran karesinde çağırır (driveTick → d.net.tick)
  const NET = {
    tick(d, m, inp, dt, onEv) {
      const s = d.s, target = simNow();
      if (!N.meta || !N.meta.cfg) return;
      if (target <= s.t) { d.acc = 0; publish(s, m); chipUpdate(); return; }   // Başlat'tan sonraki ilk saniyeler: herkes bekler
      if (m.hand) S.steer(s.wind, m, inp, dt * Math.max(1 / S.CLOCK_SCALE, 0.45));
      const sinp = { ...inp, noTurn: true };
      let n = 0;
      while (s.t + S.DT <= target + 1e-9 && n < 600) {
        applyWind(s); applyRemotes(s);
        d.prev = s.boats.map(b => ({ x: b.x, y: b.y, h: b.h }));
        const ph = m.phase;
        if (m.hand) onEv(S.handStep(s, m, sinp, null)); else S.step(s);
        afterStep(s, m); n++;
        if (m.phase !== ph) { publish(s, m, true); phaseNote(m, ph); }
      }
      d.acc = clamp(target - s.t, 0, S.DT);
      publish(s, m);
      chipUpdate();
    }
  };
  function phaseNote(m, was) {
    if (m.phase === 'done' && !N.resAuto) {
      N.resAuto = true;
      setTimeout(() => { if (!N.s) return; N.view = 'res'; N.resOpen = true; show(true); }, 1800);
    }
    // şamandıra dönüşü, ceza turu ve finiş elle (kullanıcı 2026-11-16); bildirimleri sim.js handNotes verir
  }
  function chipUpdate() {
    const on = !!N.key;
    chip.classList.toggle('hidden', !on);
    btn.classList.toggle('on', on); fab.classList.toggle('hidden', on);
    if (!on) return;
    const now = performance.now(); if (now - N.lastUi < 400) return; N.lastUi = now;
    const m = N.meta, n = m && m.order ? m.order.length : Object.keys(N.players || {}).length;
    const txt = !m ? 'Online' : N.watching && m.state === 'racing' ? `Oda ${N.code} · izliyorsun · ${n} tekne` : m.state === 'open' ? `Oda ${N.code} · ${n} kişi · başlatılmayı bekliyor` : m.state === 'done' ? `Oda ${N.code} · yarış bitti` :
      N.s && simNow() < 0 ? `Oda ${N.code} · ${Math.ceil(-simNow() * S.CLOCK_SCALE)} sn sonra geri sayım` : `Oda ${N.code} · ${n} tekne`;
    $('ncTxt').textContent = txt;
    $('ncRes').classList.toggle('hidden', !N.s);
    $('ncLeave').textContent = N.s ? 'Ayrıl' : 'Oda';
    if (N.resOpen && N.view === 'res' && dlgOpen()) render();
  }

  // ---------- Açılış: bağlantıyla gelen oda kodu, yenilenen sayfada odaya dönüş ----------
  const q = new URLSearchParams(location.search), qCode = q.get('oda');
  const sess = store.sget(SESS);
  async function resume() {
    if (!sess || sess.net !== mode) return false;
    const b = await backend(); if (!b) return false;
    const meta = await be.get(`sailRooms/${sess.key}/meta`).catch(() => null), pl = meta && await be.get(`sailRooms/${sess.key}/players/${sess.pid}`).catch(() => null);
    if (!meta || !pl) { store.sset(SESS, null); return false; }
    await checkHost();
    await be.update(`sailRooms/${sess.key}/players/${sess.pid}`, { on: true }).catch(() => {});
    N.boats = (await be.get(`sailRooms/${sess.key}/boats`).catch(() => null)) || {};
    const boats = N.boats;
    enterRoom(sess.key, sess.code, sess.pid, sess.name);
    N.boats = boats;
    if (meta.state === 'open') { N.view = 'room'; show(true); }
    return true;
  }
  const kick0 = () => { if (qCode) openDlg(qCode); else if (q.has('online')) openDlg(); };   // ?online: ana sayfadaki Online yarış kartı
  if (sess) resume().then(ok => { if (!ok) kick0(); }); else if (qCode || q.has('online')) {
    // giriş ekranı (access.js) önce gelsin: hesap hazır olunca aç
    if (window.SailAccess && SailAccess.account()) setTimeout(kick0, 300);
    else document.addEventListener('sail-access', () => setTimeout(kick0, 300), { once: true });
  }
  function typing() { const a = document.activeElement; return !!(a && body.contains(a) && a.tagName === 'INPUT'); }
  window.SailNet = { open: openDlg, state: () => N, windAt, buildSetup, rulesText };
})();

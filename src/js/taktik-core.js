/* Taktik oluştur: kullanıcının kendi sahnesi (taslak) → oynatılabilir senaryo.
   Taslak (doc): { id, title, text, wind, kn, marks:[{x,y,zone}], line:null|{pin:{x,y},boat:{x,y}},
                   boats:[{id, name, color, x, y, route:[{x,y}]}], updated }
   Rota noktaları motorda 'goto' segmentine çevrilir; rüzgara 45°'den yakın bir bacakta tek tramola noktası
   kendiliğinden eklenir (tekne orsada zikzak çizer). Rotası olmayan tekne yerinde bekler.
   Kayıt bu cihazda (localStorage 'ps.taktik.v1'); paylaşım bağlantısı taslağı adreste taşır (?t=...).
   Ana sayfa / oynatıcı: kayıtlı ve paylaşılan taktikler SCENARIOS'a 'Taktiklerim' kategorisiyle eklenir. */
(function (global) {
  const E = global.SailEngine;
  const KEY = 'ps.taktik.v1';
  const CAT = 'Taktiklerim';
  const BASE = 50;                       // taban hız (px/sn), senaryolarla aynı
  const COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#4361ee', '#9b5de5', '#ffd166'];
  const LETTERS = 'ABCDEF';
  const MAX_BOATS = 6, MAX_MARKS = 4, MAX_PTS = 12, MAX_NOTES = 10, MAX_GUSTS = 3;
  const r1 = v => Math.round(v);
  // seyir seçenekleri: rüzgara göre açı (TWA). Rota noktası bu açıyla bir önceki noktaya oturur.
  const SAILS = { orsa: { a: 45, label: 'Orsa' }, apaz: { a: 90, label: 'Apaz' }, genis: { a: 135, label: 'Geniş apaz' }, pupa: { a: 180, label: 'Pupa' } };
  const ROLES = ['hak', 'yol', 'dogru', 'hata'];
  // m seyrindeki bacak: from'dan çıkan, rüzgara göre s yanında (−1 sancak, +1 iskele kontra) rota
  const sailHeading = (w, m, s) => E.norm360(w + (s < 0 ? -1 : 1) * SAILS[m].a);
  // dokunulan noktayı seyre oturt: iki kontradan dokunulan yöne yakın olanı seç, mesafe aynı kalır
  function snap(from, to, w, m) {
    const d = Math.hypot(to.x - from.x, to.y - from.y), b = E.norm360(Math.atan2(to.x - from.x, -(to.y - from.y)) / E.DEG);
    let s = E.norm180(b - w) < 0 ? -1 : 1;
    if (m === 'pupa') s = 1;
    const f = E.fwd(sailHeading(w, m, s));
    return { x: from.x + f.x * d, y: from.y + f.y * d, m, s };
  }
  // rüzgar değişince seyirli noktaları yeniden oturt (mesafe ve kontra korunur, sonraki serbest noktalar yerinde kalır)
  function resnap(b, w) {
    let prev = { x: b.x, y: b.y };
    b.route = b.route.map(p => {
      if (!SAILS[p.m]) { prev = p; return p; }
      const d = Math.hypot(p.x - prev.x, p.y - prev.y), f = E.fwd(sailHeading(w, p.m, p.s));
      const q = { x: Math.round(prev.x + f.x * d), y: Math.round(prev.y + f.y * d), m: p.m, s: p.s };
      prev = q; return q;
    });
  }

  const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
  function blank() {
    return { id: uid(), title: '', text: '', wind: 0, kn: 8, marks: [{ x: 500, y: 150, zone: true }], line: null, boats: [], notes: [], gusts: [], shift: null, ref: true, quiz: false, updated: 0 };
  }

  // ---------- Hazır başlangıç sahneleri ----------
  // R: başlangıçtan bacaklarla rota. bacak: ['orsa'|'apaz'|'genis'|'pupa', s(−1 sancak / +1 iskele), mesafe] ya da [x, y]
  function R(x, y, legs) {
    let cur = { x, y };
    return legs.map(l => {
      if (typeof l[0] === 'number') return (cur = { x: l[0], y: l[1] });
      const f = E.fwd(sailHeading(0, l[0], l[1]));
      return (cur = { x: Math.round(cur.x + f.x * l[2]), y: Math.round(cur.y + f.y * l[2]), m: l[0], s: l[1] });
    });
  }
  const B = (i, x, y, legs, role) => ({ id: LETTERS[i], name: LETTERS[i], color: COLORS[i], x, y, role: role || '', route: R(x, y, legs) });
  const TEMPLATES = [
    { id: 'bos', label: 'Boş sahne', desc: 'Yalnız bir şamandıra.', make: () => ({}) },
    { id: 'kesisme', label: 'Sancak / iskele', desc: 'İki tekne orsada karşılaşır. Kim yol verir?', make: () => ({
      title: 'Sancak / iskele karşılaşması', quiz: true, text: 'A sancak kontrada, B iskele kontrada. İkisi orsada karşılaşıyor. Sence kim yol vermeli?',
      marks: [{ x: 500, y: 110, zone: true }],
      boats: [B(0, 720, 520, [['orsa', -1, 330]]), B(1, 250, 560, [['orsa', 1, 420]])] }) },
    { id: 'samandira', label: 'Şamandıra dönüşü', desc: 'İki tekne sancak layline üstünde şamandırayı döner.', make: () => ({
      title: 'Şamandıra dönüşü', text: 'A ve B sancak layline üstünde. Şamandırayı iskele tarafında bırakıp geniş girer, dar çıkarlar.',
      marks: [{ x: 500, y: 200, zone: true }],
      boats: [B(0, 720, 372, [[548, 200], [505, 148], [450, 190], [420, 330]]), B(1, 860, 512, [[548, 200], [505, 148], [450, 190], [420, 330]])] }) },
    { id: 'start', label: 'Start', desc: 'Start hattı ve hatta bekleyen beş tekne.', make: () => ({
      title: 'Start', text: 'Tekneler hattın altından orsada start eder. Hattın hangi ucu daha iyi?',
      marks: [{ x: 500, y: 110, zone: false }], line: { pin: { x: 260, y: 430 }, boat: { x: 740, y: 430 } },
      boats: [0, 1, 2, 3, 4].map(i => B(i, 330 + i * 85, 480, [['orsa', -1, 240]])) }) },
    { id: 'kapatma', label: 'Kapatma ve açma', desc: 'Rüzgar sola döner. A tramola atar, B devam eder.', make: () => ({
      title: 'Kapatmada tramola', text: 'Rüzgar sola dönünce sancak kontradaki tekneler kapatma yer. A tramola atar ve açmayla yükselir. B devam eder, alçalır.',
      shift: { t: 4, d: -15 }, marks: [{ x: 500, y: 90, zone: false }],
      boats: [B(0, 300, 560, [['orsa', -1, 160], ['orsa', 1, 360]], 'dogru'), B(1, 860, 500, [['orsa', -1, 380]], 'hata')] }) },
    { id: 'saganak', label: 'Sağanak', desc: 'Sağanağa giren tekne hızlanır.', make: () => ({
      title: 'Sağanağa git', text: 'A sağdaki sağanağa gider ve hızlanır. B sola gider, sağanağı kaçırır.',
      gusts: [{ x: 730, y: 320, r: 110 }], marks: [{ x: 500, y: 100, zone: false }],
      boats: [B(0, 560, 560, [['orsa', 1, 360]], 'dogru'), B(1, 440, 560, [['orsa', -1, 360]], 'hata')] }) }
  ];
  function fromTemplate(id) { const t = TEMPLATES.find(x => x.id === id) || TEMPLATES[0]; return Object.assign(blank(), t.make()); }

  // ---------- Kayıt ----------
  function list() {
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(d => d && d.id && Array.isArray(d.boats)) : []; }
    catch (e) { return []; }
  }
  function get(id) { return list().find(d => d.id === id) || null; }
  function save(doc) {
    const a = list().filter(d => d.id !== doc.id);
    doc.updated = Date.now();
    a.unshift(clean(doc));
    try { localStorage.setItem(KEY, JSON.stringify(a)); return true; } catch (e) { return false; }
  }
  function remove(id) {
    try { localStorage.setItem(KEY, JSON.stringify(list().filter(d => d.id !== id))); } catch (e) { /* yok */ }
  }

  // yalnız bilinen alanlar, tam sayıya yuvarlanmış (paylaşım bağlantısı kısa kalsın)
  function clean(d) {
    const pt = p => ({ x: r1(p.x), y: r1(p.y) });
    return {
      id: String(d.id || uid()).slice(0, 16), title: String(d.title || '').slice(0, 60), text: String(d.text || '').slice(0, 600),
      notes: (d.notes || []).filter(n => n && String(n.text || '').trim()).slice(0, MAX_NOTES)
        .map(n => ({ t: Math.max(0, Math.min(120, Math.round((+n.t || 0) * 2) / 2)), text: String(n.text).trim().slice(0, 200) })).sort((a, b) => a.t - b.t),
      ref: d.ref !== false, quiz: !!d.quiz,
      src: /^[A-Z0-9]{6}$/.test(d.src || '') ? d.src : undefined, by: d.by ? String(d.by).slice(0, 40) : undefined,
      shift: d.shift && +d.shift.d ? { t: Math.max(0, Math.min(60, Math.round(+d.shift.t || 0))), d: Math.max(-40, Math.min(40, Math.round(+d.shift.d))) } : null,
      gusts: (d.gusts || []).slice(0, MAX_GUSTS).map(g => ({ ...pt(g), r: Math.max(50, Math.min(180, r1(+g.r || 90))) })),
      wind: r1(E.norm360(+d.wind || 0)), kn: Math.max(4, Math.min(20, r1(+d.kn || 8))),
      marks: (d.marks || []).slice(0, MAX_MARKS).map(m => ({ ...pt(m), zone: m.zone !== false })),
      line: d.line && d.line.pin && d.line.boat ? { pin: pt(d.line.pin), boat: pt(d.line.boat) } : null,
      boats: (d.boats || []).slice(0, MAX_BOATS).map((b, i) => ({
        id: String(b.id || LETTERS[i]).slice(0, 2), name: String(b.name || '').slice(0, 20), color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : COLORS[i % COLORS.length],
        ...pt(b), role: ROLES.includes(b.role) ? b.role : '',
        route: (b.route || []).slice(0, MAX_PTS).map(p => SAILS[p.m] ? { ...pt(p), m: p.m, s: p.s < 0 ? -1 : 1 } : pt(p))
      })),
      updated: d.updated || 0
    };
  }

  // ---------- Paylaşım: taslak adreste (base64url JSON) ----------
  function encode(doc) {
    const c = clean(doc); delete c.updated;
    const s = unescape(encodeURIComponent(JSON.stringify(c)));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(code) {
    try {
      const s = atob(String(code).replace(/-/g, '+').replace(/_/g, '/'));
      return clean(JSON.parse(decodeURIComponent(escape(s))));
    } catch (e) { return null; }
  }
  function shareUrl(doc) {
    const base = location.href.replace(/[^/]*([?#].*)?$/, '');
    return `${base}?t=${encode(doc)}`;
  }

  // ---------- Rota → segment ----------
  const bearing = (a, b) => E.norm360(Math.atan2(b.x - a.x, -(b.y - a.y)) / E.DEG);
  const tackOfH = (h, w) => E.norm180(h - w) < 0 ? 'starboard' : 'port';
  // A'dan h1 rotasıyla giden doğru ile B'ye h2 rotasıyla varan doğrunun kesişimi (tramola noktası)
  function cross(A, h1, B, h2) {
    const f = E.fwd(h1), g = E.fwd(h2);
    const den = f.x * g.y - f.y * g.x;
    if (Math.abs(den) < 1e-6) return null;
    const s = ((B.x - A.x) * g.y - (B.y - A.y) * g.x) / den;
    if (s <= 0) return null;
    return { x: A.x + f.x * s, y: A.y + f.y * s };
  }
  // rotanın gerçekten yelkenle gidilecek noktaları: orsada gidilemeyen bacaklara tramola noktası eklenir
  function legs(b, w) {
    const pts = [], tacks = [];
    let cur = { x: b.x, y: b.y }, h = null;
    for (const p of b.route) {
      if (Math.hypot(p.x - cur.x, p.y - cur.y) < 8) continue;
      // Orsa seçilerek çizilen bacak: tekne o kontrada ORSADA gider (rüzgar dönerse rotası da döner: açma / kapatma)
      if (p.m === 'orsa') {
        const tack = p.s < 0 ? 'starboard' : 'port';
        pts.push({ x: p.x, y: p.y, ch: tack, dist: Math.hypot(p.x - cur.x, p.y - cur.y), turn: h != null && tackOfH(h, w) !== tack ? 1.2 : 0.5 });
        h = E.tackHeading(w, tack); cur = p; continue;
      }
      const brg = bearing(cur, p), off = E.norm180(brg - w);
      if (Math.abs(off) < E.CLOSE_HAULED) {
        // önceki kontrada kal; ilk bacaksa hedefin olduğu yana açılan kontra
        let tack = h != null ? tackOfH(h, w) : (off < 0 ? 'starboard' : 'port');
        const h1 = E.tackHeading(w, tack), h2 = E.tackHeading(w, tack === 'starboard' ? 'port' : 'starboard');
        const P = cross(cur, h1, p, h2);
        if (P && Math.hypot(P.x - cur.x, P.y - cur.y) > 10 && Math.hypot(P.x - p.x, P.y - p.y) > 10) {
          pts.push(P); tacks.push(P); cur = P; h = h2;
        } else h = h1;
      } else h = brg;
      pts.push(p); cur = p;
    }
    return { pts, tacks, h0: !pts.length ? null : pts[0].ch ? E.tackHeading(w, pts[0].ch) : bearing(b, pts[0]) };
  }
  function startHeading(b, w, lg) {
    if (lg.h0 == null) return E.tackHeading(w, 'starboard');
    const off = E.norm180(lg.h0 - w);
    return Math.abs(off) < 42 ? w + (off < 0 ? -42 : 42) : lg.h0;
  }

  // taslak → senaryo (oynatıcı biçimi). opts.code: kartta görünen kod (B1 …)
  function compile(doc, opts) {
    opts = opts || {};
    const d = clean(doc), w = d.wind;
    // rüzgar dönüşü: shift.t saniyesinde başlar, 3 sn'de tamamlanır (motor yumuşak geçirir)
    const wind = d.shift ? [{ t: 0, from: w }, { t: d.shift.t, from: w }, { t: d.shift.t + 3, from: w + d.shift.d }] : w;
    const scn = {
      id: opts.id || 'u-' + d.id, category: CAT, topic: opts.topic || 'Kendi taktiklerim',
      title: `${opts.code || 'B1'} · ${d.title || 'Adsız taktik'}`,
      summary: d.text || 'Kendi kurduğun taktik.',
      duration: 10, baseSpeed: BASE, wind, windKn: d.kn, gusts: d.gusts.map(g => ({ x: g.x, y: g.y, r: g.r })), narration: false, user: true, doc: d,
      marks: d.marks.map((m, i) => ({ x: m.x, y: m.y, zone: m.zone, label: d.marks.length > 1 ? `Şamandıra ${i + 1}` : 'Şamandıra' })),
      boats: [], steps: [{ t: 0, title: d.title || 'Kendi taktiğin', text: d.text || 'Oynat ve teknelerin rotasını izle.' }]
    };
    if (d.line) scn.line = { pin: d.line.pin, boat: d.line.boat };
    const tackPts = [];
    scn.boats = d.boats.map((b, i) => {
      const lg = legs(b, w), h = startHeading(b, w, lg);
      tackPts.push(...lg.tacks.map(p => ({ ...p, color: b.color })));
      const segs = lg.pts.length ? lg.pts.map(p => p.ch ? { mode: 'closehauled', tack: p.ch, dur: Math.round(p.dist / BASE * 100) / 100, turn: p.turn } : { mode: 'goto', x: p.x, y: p.y }) : [{ mode: 'hold', h, dur: 1, speed: 0 }];
      return { id: b.id || LETTERS[i], name: b.name || `Tekne ${b.id || LETTERS[i]}`, color: b.color, role: b.role || undefined, start: { x: b.x, y: b.y, h }, v0: lg.pts.length ? BASE * 0.9 : 0, segs };
    });
    // süre: en son varan tekne + 2 sn; erken varanlar son rotasıyla yavaşça devam eder
    let end = 0;
    const ends = scn.boats.map(b => {
      const tr = E.buildTrack(scn, b.start, b.segs, { v0: b.v0 });
      const last = tr[tr.length - 1];
      end = Math.max(end, last.t);
      return last;
    });
    scn.duration = Math.max(6, Math.min(120, Math.ceil(end + 2)));
    scn.boats.forEach((b, i) => {
      const last = ends[i], rest = scn.duration - last.t;
      if (rest <= 0) return;
      if (b.segs[0].mode === 'hold') b.segs[0].dur = scn.duration;
      else b.segs.push({ mode: 'heading', h: last.h, dur: rest, speed: 0.35, turn: 0 });
    });
    scn.tackPts = tackPts;
    // oynatıcıdaki gibi yollar (pis rüzgar yavaşlaması dahil) → kural hakemi
    let tracks = null;
    try { tracks = global.SailRules ? SailRules.buildScene(scn, []).scripted : null; } catch (e) { tracks = null; }
    if (!tracks) tracks = scn.boats.map(b => E.buildTrack(scn, b.start, b.segs, { v0: b.v0 }));
    const evs = (d.ref || d.quiz) && global.SailRules ? referee(scn, tracks) : [];
    scn.refEvents = evs;
    // soru modu: her kural karşılaşmasından az önce durup "kim yol vermeli?" diye sorar (cevap adımı sonra görünür)
    if (d.quiz) {
      const nm = id => { const b = scn.boats.find(x => x.id === id); return b ? { id, name: b.name, color: b.color } : { id, name: id, color: '#888' }; };
      scn.quiz = evs.filter(e => e.give && e.pair).map(e => ({ t: Math.max(0.3, Math.round((e.t - 0.3) * 10) / 10), give: e.give, rule: e.rule, title: e.title, text: e.text, opts: e.pair.map(nm) }));
    }
    // adımlar: açıklama + zamanlı notlar + hakem; temas yerleri sahnede kırmızı halka
    const steps = [scn.steps[0]];
    for (const n of d.notes) if (n.t <= scn.duration) steps.push({ t: n.t, title: 'Not', text: n.text });
    if (d.shift && d.shift.t <= scn.duration) {
      const a = Math.abs(d.shift.d), right = d.shift.d > 0;
      steps.push({ t: d.shift.t, title: `Rüzgar ${a}° ${right ? 'sağa' : 'sola'} döndü`,
        text: `Rüzgar ${right ? 'sağa' : 'sola'} döndü. ${right ? 'Sancak' : 'İskele'} kontradaki tekneler için bu bir açma: daha yükseğe gidebilirler. ${right ? 'İskele' : 'Sancak'} kontradakiler için kapatma: rotaları düşer. Kapatmada tramola at.` });
    }
    if (d.gusts.length && !d.notes.length) steps.push({ t: 0.5, title: 'Sağanak', text: 'Koyu su sağanak demek. Rüzgar orada daha sert, içine giren tekne hızlanır. Sağanak rüzgarla birlikte aşağı kayar.' });
    for (const ev of scn.refEvents) steps.push({ t: ev.t, title: ev.title, text: ev.text });
    steps.sort((a, b) => a.t - b.t);
    // aynı anda iki adım: sonrakini biraz kaydır (ikisi de görünsün)
    for (let i = 1; i < steps.length; i++) if (steps[i].t < steps[i - 1].t + 0.6) steps[i].t = Math.round((steps[i - 1].t + 0.6) * 10) / 10;
    if (steps.length > 1 && steps[1].t < 0.6) steps[1].t = 0.6;
    scn.steps = steps;
    scn.spots = scn.refEvents.filter(e => e.contact).map(e => ({ x: e.x, y: e.y, r: 30, from: e.t, to: Math.min(scn.duration, e.t + 2.5), color: '#f87171', label: 'Temas!' }));
    scn.tracks = tracks;
    return scn;
  }

  // ---------- Kural hakemi ----------
  // İki tekne yaklaşınca (≈2 boy ve yaklaşıyorlar) kim yol vermeli: rules.js classify (simülatörle aynı kurallar: 10/11/12/13).
  // Gövdeler değerse "Temas". Her karşılaşma bir kez yazılır; tekneler uzaklaşınca (≈3,5 boy) yeni karşılaşma sayılır.
  const HULL = E.hullOf ? E.hullOf('optimist') : { half: 14, r: 11 };
  function hullGap(a, b) {
    // kapsüller: baş-kıç doğrusu üzerinde 5'er nokta (yeterince doğru, hızlı)
    const pts = p => { const f = E.fwd(p.h); return [-1, -0.5, 0, 0.5, 1].map(k => ({ x: p.x + f.x * HULL.half * k, y: p.y + f.y * HULL.half * k })); };
    let m = Infinity;
    for (const u of pts(a)) for (const v of pts(b)) m = Math.min(m, Math.hypot(u.x - v.x, u.y - v.y));
    return m - 2 * HULL.r;
  }
  const RULE_TXT = {
    10: (y, h) => [`Kural 10`, `${y} iskele kontrada, ${h} sancak kontrada. ${y} yol vermeli. Bu Kural 10.`],
    11: (y, h) => [`Kural 11`, `İkisi aynı kontrada ve yan yana. Rüzgarüstündeki ${y}, ${h} için yol vermeli. Bu Kural 11.`],
    12: (y, h) => [`Kural 12`, `İkisi aynı kontrada. Arkadaki ${y}, öndeki ${h} için yol vermeli. Bu Kural 12.`],
    13: (y, h) => [`Kural 13`, `${y} tramola atıyor. Tramola bitene kadar ${h} için yol vermeli. Bu Kural 13.`]
  };
  function referee(scn, tracks) {
    const R = global.SailRules, out = [], boats = scn.boats, n = boats.length;
    if (!R || n < 2) return out;
    const name = i => boats[i].name || `Tekne ${boats[i].id}`;
    const lastTack = boats.map(() => -10), prevTack = boats.map(() => null);
    const open = {};                       // çift → { rule, give, contact }
    for (let t = 0; t <= scn.duration + 1e-6; t += 0.1) {
      const w = E.windAt(scn.wind, t);
      const st = tracks.map((tr, i) => {
        const p = E.sampleTrack(tr, t), tk = R.tackOf(p.h, w);
        if (prevTack[i] && tk !== prevTack[i] && t > 0.2) lastTack[i] = t;
        prevTack[i] = tk;
        return { x: p.x, y: p.y, h: p.h, v: p.v || 0, tack: tk, phase: 'race', lastTack: lastTack[i] };
      });
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = st[i], b = st[j], key = i + '-' + j, d = Math.hypot(a.x - b.x, a.y - b.y);
        if (open[key] && d > 175) delete open[key];
        if (d > 110 && !(open[key] && d < 175)) continue;
        if (!open[key]) {
          const c = R.closest(a, a.h, Math.max(a.v, 20), b, 3);
          if (c.d > 62 && (c.dmin > 40 || c.dmin > c.d - 4)) continue;    // yakından geçmeyecek / uzaklaşıyor (çok yakın paralel giden sayılır)
          const ra = R.classify(a, b, w, t), rb = R.classify(b, a, w, t);
          const give = ra && !rb ? i : rb && !ra ? j : null, rule = give === i ? ra : give === j ? rb : null;
          open[key] = { rule, give, contact: false };
          if (give != null && RULE_TXT[rule]) {
            const [title, text] = RULE_TXT[rule](name(give), name(give === i ? j : i));
            out.push({ t: Math.round(t * 10) / 10, title, text, rule, give: boats[give].id, pair: [boats[i].id, boats[j].id], x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          }
        }
        const o = open[key];
        if (!o.contact && d < 2 * (HULL.half + HULL.r) && hullGap(a, b) <= 0) {
          o.contact = true;
          const y = o.give != null ? name(o.give) : null;
          out.push({ t: Math.round(t * 10) / 10, title: 'Temas!', text: y ? `${y} yol vermedi ve iki tekne birbirine değdi. ${y} rotasını değiştirmeli: bordalamalı ya da daha erken tramola atmalı.` : 'Tekneler birbirine değdi.', contact: true, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }
    return out;
  }

  // önizleme için: her teknenin hesaplanan yolu (taslak ekranında ince çizgi)
  function preview(doc) {
    const scn = compile(doc);
    return { scn, tracks: scn.tracks };
  }

  // ---------- Oynatıcıya ekle: kayıtlılar + adresteki paylaşılan ----------
  function inject(S) {
    const mine = list();
    mine.slice().reverse().forEach((d, i) => S.push(compile(d, { code: `B${i + 1}` })));
    let shared = null;
    try { const q = new URLSearchParams(location.search).get('t'); if (q) shared = decode(q); } catch (e) { /* yok */ }
    if (shared && !mine.some(d => d.id === shared.id)) {
      S.push(compile(shared, { id: 's-' + shared.id, code: 'P1', topic: 'Paylaşılan' }));
      if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#s-' + shared.id);
    } else if (shared && !location.hash) history.replaceState(null, '', location.pathname + location.search + '#u-' + shared.id);
    return S;
  }

  // ---------- Bulutta kodla paylaşım (antrenör → sporcu) ----------
  // Yarışlarla aynı koleksiyon ve kural (sailChallenges/{KOD}, kind: 'taktik'): yeni Firestore kuralı gerekmez.
  // Herkes kodla okur; yalnız antrenör (Velora ile giren sahip) oluşturur / siler. Yarış listelerinde kind 'taktik' gizlenir.
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from(global.crypto.getRandomValues(new Uint8Array(6)), b => ALPH[b % ALPH.length]).join('');
  let be = null;
  async function backend() {
    const D = global.SailTaskData; if (!D) throw new Error('veri-yok');
    if (!be) { be = D.makeBackend(); await be.init(); }
    return be;
  }
  const cloud = {
    async canShare() { try { const b = await backend(); return global.SailTaskData.isCoach(b); } catch (e) { return false; } },
    async share(doc) {
      const b = await backend(), D = global.SailTaskData;
      if (!D.isCoach(b)) throw Object.assign(new Error('antrenor'), { code: 'not-coach' });
      const d = clean(doc), a = D.acc() || {};
      let code = newCode();
      for (let i = 0; i < 4 && await b.getTask(code).catch(() => null); i++) code = newCode();
      await b.createTask(code, { v: 1, kind: 'taktik', code, name: d.title || 'Adsız taktik', owner: b.uid(), ownerName: String(a.name || '').slice(0, 40),
        state: 'open', tries: 0, due: 0, vis: 'me', boats: d.boats.length, setup: JSON.stringify({ ...d, src: undefined }) });
      return code;
    },
    async open(code) {
      code = String(code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) throw Object.assign(new Error('kod'), { code: 'bad-code' });
      const b = await backend();
      const t = await b.getTask(code);
      if (!t) throw Object.assign(new Error('yok'), { code: 'not-found' });
      if (t.kind !== 'taktik') throw Object.assign(new Error('yaris'), { code: 'is-race' });
      const d = clean(JSON.parse(t.setup));
      const old = list().find(x => x.src === code);
      d.id = old ? old.id : uid(); d.src = code;
      if (t.ownerName) d.by = String(t.ownerName).slice(0, 40);
      save(d);
      return d.id;
    },
    async mine() { const b = await backend(); return (await b.listMine(b.uid())).filter(t => t.kind === 'taktik').sort((x, y) => (y.at || 0) - (x.at || 0)); },
    async remove(code) { const b = await backend(); await b.deleteTask(code); },
    link(code) {
      const D = global.SailTaskData;
      return `${location.origin}${location.pathname.replace(/[^/]*$/, '')}taktik.html?kod=${code}${D && D.mode === 'yerel' ? '&net=yerel' : ''}`;
    }
  };

  global.SailTaktik = { cloud,  TEMPLATES, fromTemplate, MAX_GUSTS, referee, MAX_NOTES, SAILS, ROLES, snap, resnap, sailHeading, KEY, CAT, COLORS, LETTERS, MAX_BOATS, MAX_MARKS, MAX_PTS, blank, list, get, save, remove, clean, encode, decode, shareUrl, compile, preview, inject, legs, bearing };
})(typeof window !== 'undefined' ? window : globalThis);

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
  const MAX_BOATS = 6, MAX_MARKS = 4, MAX_PTS = 12;
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
    return { id: uid(), title: '', text: '', wind: 0, kn: 8, marks: [{ x: 500, y: 150, zone: true }], line: null, boats: [], updated: 0 };
  }

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
    return { pts, tacks, h0: pts.length ? bearing(b, pts[0]) : null };
  }
  function startHeading(b, w, lg) {
    if (lg.h0 == null) return E.tackHeading(w, 'starboard');
    const off = E.norm180(lg.h0 - w);
    return Math.abs(off) < 42 ? w + (off < 0 ? -42 : 42) : lg.h0;
  }

  // taslak → senaryo (oynatıcı biçimi). opts.code: kartta görünen kod (T1 …)
  function compile(doc, opts) {
    opts = opts || {};
    const d = clean(doc), w = d.wind;
    const scn = {
      id: opts.id || 'u-' + d.id, category: CAT, topic: opts.topic || 'Kendi taktiklerim',
      title: `${opts.code || 'T1'} · ${d.title || 'Adsız taktik'}`,
      summary: d.text || 'Kendi kurduğun taktik.',
      duration: 10, baseSpeed: BASE, wind: w, windKn: d.kn, narration: false, user: true, doc: d,
      marks: d.marks.map((m, i) => ({ x: m.x, y: m.y, zone: m.zone, label: d.marks.length > 1 ? `Şamandıra ${i + 1}` : 'Şamandıra' })),
      boats: [], steps: [{ t: 0, title: d.title || 'Kendi taktiğin', text: d.text || 'Oynat ve teknelerin rotasını izle.' }]
    };
    if (d.line) scn.line = { pin: d.line.pin, boat: d.line.boat };
    const tackPts = [];
    scn.boats = d.boats.map((b, i) => {
      const lg = legs(b, w), h = startHeading(b, w, lg);
      tackPts.push(...lg.tacks.map(p => ({ ...p, color: b.color })));
      const segs = lg.pts.length ? lg.pts.map(p => ({ mode: 'goto', x: p.x, y: p.y })) : [{ mode: 'hold', h, dur: 1, speed: 0 }];
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
    return scn;
  }

  // önizleme için: her teknenin hesaplanan yolu (taslak ekranında ince çizgi)
  function preview(doc) {
    const scn = compile(doc);
    return { scn, tracks: scn.boats.map(b => E.buildTrack(scn, b.start, b.segs, { v0: b.v0 })) };
  }

  // ---------- Oynatıcıya ekle: kayıtlılar + adresteki paylaşılan ----------
  function inject(S) {
    const mine = list();
    mine.slice().reverse().forEach((d, i) => S.push(compile(d, { code: `T${i + 1}` })));
    let shared = null;
    try { const q = new URLSearchParams(location.search).get('t'); if (q) shared = decode(q); } catch (e) { /* yok */ }
    if (shared && !mine.some(d => d.id === shared.id)) {
      S.push(compile(shared, { id: 's-' + shared.id, code: 'P1', topic: 'Paylaşılan' }));
      if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#s-' + shared.id);
    } else if (shared && !location.hash) history.replaceState(null, '', location.pathname + location.search + '#u-' + shared.id);
    return S;
  }

  global.SailTaktik = { SAILS, ROLES, snap, resnap, sailHeading, KEY, CAT, COLORS, LETTERS, MAX_BOATS, MAX_MARKS, MAX_PTS, blank, list, get, save, remove, clean, encode, decode, shareUrl, compile, preview, inject, legs, bearing };
})(typeof window !== 'undefined' ? window : globalThis);

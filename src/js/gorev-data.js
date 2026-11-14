/* Görevler: ortak veri katmanı ve biçim yardımcıları (SailTaskData). sim.html (js/gorev.js) ve havuz.html (js/havuz.js) kullanır.
   Firestore (sesliasistan-3e95a) → VeloraAuth.firestore(); ?net=yerel → localStorage'da sahte veritabanı.
     sailChallenges/{KOD}              görev: { v, code, name, note, hints, owner, ownerName, at, due, tries, vis, state, cls, boats, windKn, setup (JSON) }
     sailChallenges/{KOD}/runs/{uid_n} gönderilen yarış: { v, uid, n, name, via, at, fin, dsq, boats, time, pen, ocs, startDist, startKn, tacks, rec (JSON {ops}) } */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const jcopy = o => JSON.parse(JSON.stringify(o));
  const acc = () => (window.SailAccess && SailAccess.account()) || null;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* yok */ } }
  };
  const PROJECT = 'sesliasistan-3e95a', COL = 'sailChallenges';
  const mode = new URLSearchParams(location.search).get('net') === 'yerel' ? 'yerel' : 'firebase';
  const CODE_OK = c => /^[A-Z0-9]{6}$/.test(c);

  // ---------- Veri katmanı ----------
  function fireBackend() {
    let F = null, db = null;
    const V = () => window.VeloraAuth;
    const ms = v => (v && v.toMillis ? v.toMillis() : +v || 0);
    const conv = (id, d) => ({ ...d, id, at: ms(d.at) });
    return {
      kind: 'firebase',
      async init() {
        if (!V()) await new Promise((ok, no) => {
          const t = setTimeout(() => no(new Error('velora-yok')), 12000);
          document.addEventListener('velora-ready', () => { clearTimeout(t); ok(); }, { once: true });
        });
        await V().ready().catch(() => {});
        ({ fs: F, db } = V().firestore());
      },
      uid: () => (V() && V().uid()) || null,
      isAnon: () => !!(V() && V().isAnon()),
      anon: () => V().anon(),
      async getTask(code) { const d = await F.getDoc(F.doc(db, COL, code)); return d.exists() ? conv(code, d.data()) : null; },
      createTask: (code, data) => F.setDoc(F.doc(db, COL, code), { ...data, at: F.serverTimestamp() }),
      updateTask: (code, patch) => F.updateDoc(F.doc(db, COL, code), patch),
      async listMine(uid) {
        const q = await F.getDocs(F.query(F.collection(db, COL), F.where('owner', '==', uid), F.limit(200)));
        const out = []; q.forEach(d => out.push(conv(d.id, d.data()))); return out;
      },
      async listRuns(code, onlyUid) {
        const c = F.collection(db, COL, code, 'runs');
        const q = await F.getDocs(onlyUid ? F.query(c, F.where('uid', '==', onlyUid)) : c);
        const out = []; q.forEach(d => out.push(conv(d.id, d.data()))); return out;
      },
      addRun: (code, id, data) => F.setDoc(F.doc(db, COL, code, 'runs', id), { ...data, at: F.serverTimestamp() }),
      deleteRun: (code, id) => F.deleteDoc(F.doc(db, COL, code, 'runs', id)),
      // yarışı sil: önce gönderilen denemeler (kural görev belgesine bakar), sonra yarışın kendisi
      async deleteTask(code) {
        const q = await F.getDocs(F.collection(db, COL, code, 'runs'));
        const ids = []; q.forEach(d => ids.push(d.id));
        await Promise.all(ids.map(id => F.deleteDoc(F.doc(db, COL, code, 'runs', id))));
        await F.deleteDoc(F.doc(db, COL, code));
      },
    };
  }
  // Yerel deneme: aynı tarayıcıda localStorage (sekmeler arası ortak)
  function mockBackend() {
    const K = 'ps.taskmock.v1';
    const load = () => store.get(K, { tasks: {} }), save = d => store.set(K, d);
    const uid = () => { let u = store.get('ps.netmock.uid', null); if (!u) { u = 'yerel-' + Math.random().toString(36).slice(2, 10); store.set('ps.netmock.uid', u); } return u; };
    return {
      kind: 'yerel', async init() {}, uid, isAnon: () => false, anon: async () => uid(),
      async getTask(code) { const t = load().tasks[code]; return t ? { ...jcopy(t), runs: undefined, id: code } : null; },
      async createTask(code, data) { const d = load(); d.tasks[code] = { ...jcopy(data), at: Date.now(), runs: {} }; save(d); },
      async updateTask(code, patch) { const d = load(); Object.assign(d.tasks[code], jcopy(patch)); save(d); },
      async listMine(u) { return Object.entries(load().tasks).filter(([, t]) => t.owner === u).map(([id, t]) => ({ ...t, runs: undefined, id })); },
      async listRuns(code, only) { const t = load().tasks[code]; return t ? Object.entries(t.runs || {}).map(([id, r]) => ({ ...r, id })).filter(r => !only || r.uid === only) : []; },
      async addRun(code, id, data) {
        const d = load(), t = d.tasks[code]; if (!t) throw new Error('yok');
        if (t.runs[id]) throw Object.assign(new Error('var'), { code: 'permission-denied' });
        t.runs[id] = { ...jcopy(data), at: Date.now() }; save(d);
      },
      async deleteRun(code, id) { const d = load(); if (d.tasks[code]) delete d.tasks[code].runs[id]; save(d); },
      async deleteTask(code) { const d = load(); delete d.tasks[code]; save(d); },
    };
  }
  const makeBackend = () => (mode === 'yerel' ? mockBackend() : fireBackend());
  // Antrenör: Velora ile giren site sahibi (yerel denemede sahip rolü yeter)
  const isCoach = be => { const a = acc(); return !!a && a.role === 'sahip' && (mode === 'yerel' || (a.via === 'velora' && !!be && !!be.uid() && !be.isAnon())); };
  const isDenied = e => /permission|insufficient|PERMISSION/i.test(String(e && (e.code || e.message)));

  // ---------- Biçim yardımcıları ----------
  const clock = sec => { if (sec == null || !Number.isFinite(sec)) return '–'; const neg = sec < 0, a = Math.abs(Math.round(sec)); return `${neg ? '−' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`; };
  const parseClock = txt => {
    const t = String(txt || '').trim().replace('−', '-'); if (!t) return 0;
    const m = /^(-)?(\d+)(?::(\d{1,2}))?$/.exec(t); if (!m) return null;
    const v = m[3] != null ? +m[2] * 60 + +m[3] : +m[2]; return m[1] ? -v : v;
  };
  const dateTxt = msv => msv ? new Date(msv).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' ' + new Date(msv).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
  const clsName = c => { const C = window.SailEngine && SailEngine.BOAT_CLASSES; return C && C[c] ? C[c].name : ({ optimist: 'Optimist', ilca4: 'ILCA 4', ilca6: 'ILCA 6', ilca7: 'ILCA 7' }[c] || c || ''); };
  const sideTxt = p => (p <= -0.6 ? 'sol' : p < -0.2 ? 'orta-sol' : p <= 0.2 ? 'orta' : p < 0.6 ? 'orta-sağ' : 'sağ');
  const SIZE_TXT = { S: 'küçük', M: 'orta boy', L: 'büyük' };
  function planLines(plan) {
    return (plan || []).slice().sort((a, b) => a.at - b.at).map(e => {
      const when = e.at < 0 ? `start'tan ${clock(-e.at)} önce` : e.at === 0 ? "start'ta" : `start'tan ${clock(e.at)} sonra`;
      return e.k === 'shift'
        ? `${when} rüzgar ${Math.abs(e.deg)}° ${e.deg > 0 ? 'sağa' : 'sola'} döner${e.hold ? `, ${e.hold} sn sonra eski yönüne gelir` : ' ve öyle kalır'}`
        : `${when} ${sideTxt(e.pos)} taraftan ${SIZE_TXT[e.size] || ''} sağanak iner (${e.pass} sn'de hatta)`;
    });
  }
  function setupChips(su) {
    const b = su.boat || {}, c = su.course || {}, out = [];
    out.push(`${clsName(b.cls)} · ${b.windKn || 8} kn`, `${(su.fleet || []).length} tekne`, `rüzgar ${Math.round(((su.wind || 0) + 360) % 360)}°`);
    out.push(`geri sayım ${Math.round((b.pre || 120) / 60)} dk`);
    if (c.flag && c.flag !== 'P') out.push(`${c.flag === 'S' ? 'siyah' : c.flag} bayrağı`);
    if ((su.gusts || []).length) out.push(`${su.gusts.length} sabit sağanak`);
    const sh = (su.plan || []).filter(e => e.k === 'shift').length, gu = (su.plan || []).filter(e => e.k === 'gust').length;
    if (sh) out.push(`${sh} rüzgar dönüşü`);
    if (gu) out.push(`${gu} inen sağanak`);
    return out.map(x => `<span class="rc">${esc(x)}</span>`).join('');
  }
  const resTxt = r => r.dsq ? r.dsq : r.fin ? `${r.fin}./${r.boats}` : 'bitirmedi';

  const taskSetup = t => { try { return typeof t.setup === 'string' ? JSON.parse(t.setup) : t.setup; } catch (e) { return null; } };
  const closed = t => !!t && (t.state === 'closed' || (t.due && Date.now() > t.due));
  // Sıralama: kişi başı en iyi (bitiren, en kısa süre), sonra bitirmeyenler
  function board(runs) {
    const by = new Map();
    for (const r of runs) { const a = by.get(r.uid) || []; a.push(r); by.set(r.uid, a); }
    const rows = [...by.values()].map(rs => {
      rs.sort((a, b) => a.n - b.n);
      const ok = rs.filter(r => r.time != null && !r.dsq).sort((a, b) => a.time - b.time || (a.fin || 99) - (b.fin || 99));
      return { best: ok[0] || rs[rs.length - 1], runs: rs, done: !!ok.length };
    });
    rows.sort((a, b) => (b.done - a.done) || (a.best.time ?? 1e9) - (b.best.time ?? 1e9) || (a.best.fin || 99) - (b.best.fin || 99));
    return rows;
  }
  const taskLink = (code, extra) => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}sim.html?gorev=${encodeURIComponent(code)}${extra || ''}${mode === 'yerel' ? '&net=yerel' : ''}`;

  window.SailTaskData = { esc, jcopy, acc, store, PROJECT, COL, mode, CODE_OK, makeBackend, isCoach, isDenied, clock, parseClock, dateTxt, clsName,
    planLines, setupChips, resTxt, taskSetup, closed, board, taskLink };
})();

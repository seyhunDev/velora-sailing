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
  // Yarış kuran (antrenör): Velora hesabıyla giren herkes kendi yarışını kurar (kullanıcı 2026-11-27; yerel denemede giriş yeter).
  // Firebase oturumu bu sitedeki hesapla aynı kişi olmalı; kural owner == kendi uid'i ister.
  const isCoach = be => { const a = acc(); return !!a && a.role !== 'misafir' && (mode === 'yerel' || (a.via === 'velora' && !!be && be.uid() === a.uid && !be.isAnon())); };
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
    if (c.flag && c.flag !== 'P') out.push(`${c.flag === 'Siyah' ? 'siyah' : c.flag} bayrağı`);
    if ((su.gusts || []).length) out.push(`${su.gusts.length} sabit sağanak`);
    const sh = (su.plan || []).filter(e => e.k === 'shift').length, gu = (su.plan || []).filter(e => e.k === 'gust').length;
    if (sh) out.push(`${sh} rüzgar dönüşü`);
    if (gu) out.push(`${gu} inen sağanak`);
    return out.map(x => `<span class="rc">${esc(x)}</span>`).join('');
  }
  const resTxt = r => r.dsq ? r.dsq : r.fin ? `${r.fin}./${r.boats}` : 'bitirmedi';

  // deneme hakkı en çok 3 (kullanıcı 2026-11-15); eski 'sınırsız' (0) ve 5 hakkı yarışlar da 3 sayılır
  const MAX_TRIES = 3;
  const triesOf = t => Math.min(MAX_TRIES, (t && +t.tries) || MAX_TRIES);
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

  // Velora Sailing Firestore kuralları (Yarışlar / simülatör kurulum kartı gösterir). Asıl kaynak firebase/firestore-sailing.rules;
  // bu kopya onunla aynı olmalı (npm run check → scripts/check-rules.mjs). Yayında: Velora deposu firestore.rules.
  const RULES = `    // ---- Velora Sailing (seyhunDev/velora-sailing, velora-sailing.netlify.app; aynı Firebase projesi) ----
    // Kaynak: velora-sailing deposu firebase/firestore-sailing.rules. Kurallar (Seyhun 2026-11-27): her kullanıcı yalnız
    // kendi verisini okur ve yazar; site sahibi (admin) yalnız Seyhun'un hesabı, herkesin verisini okur ama başkası adına yazmaz.
    function sailAdmin() {
      return request.auth != null && (request.auth.uid == 'wIfcw0kHBVVu2DVMiyg1fcSA85F3'
        || request.auth.token.get('email', '') == 'seyhunyildiz@gmail.com');
    }
    // Velora hesabıyla giren (anonim değil)
    function sailUser() {
      return request.auth != null && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }

    // Ziyaret kayıtları: bir belge = bir ziyaretçinin en çok 100 olayı. Herkes ekler (alanlar ve boyut sınırlı),
    // okuma ve silme yalnız site sahibi.
    match /sailingEvents/{id} {
      allow create: if request.resource.data.keys().hasOnly(['v', 'vid', 'sid', 'uid', 'role', 'name', 'at', 'events'])
        && request.resource.data.at == request.time
        && request.resource.data.vid is string && request.resource.data.vid.size() <= 64
        && request.resource.data.events is list && request.resource.data.events.size() <= 100
        && (request.resource.data.uid == null || (request.auth != null && request.resource.data.uid == request.auth.uid));
      allow read, delete: if sailAdmin();
    }

    // Yelken ayarı: originals herkes okur, yalnız site sahibi yazar; u_<uid> her kullanıcının kendi ayarı.
    match /sailingTrim/{id} {
      allow read: if id == 'originals' || (request.auth != null && id == 'u_' + request.auth.uid) || sailAdmin();
      allow write: if (id == 'originals' && sailAdmin()) || (request.auth != null && id == 'u_' + request.auth.uid);
    }

    // Kullanıcının kendi verisi: profil + taktikler (sailTactics) + simülatör yarış kayıtları (sailRaces).
    // Yalnız sahibi yazar (silme yok: silinen öğe del:true olur); sahibi ve site sahibi okur.
    // Taktik sınırı (Seyhun 2026-11-27): profildeki tac listesi = kullanıcının duran taktikleri, en çok 10 (site sahibi sınırsız).
    // Taktik yazmak için kimliği aynı yazımla (batch) tac listesinde olmalı; silindi işareti (del) her zaman yazılır.
    match /sailUsers/{uid} {
      allow read: if request.auth != null && (request.auth.uid == uid || sailAdmin());
      allow create, update: if sailUser() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['v', 'name', 'email', 'first', 'last', 'tac'])
        && request.resource.data.get('tac', []) is list && (sailAdmin() || request.resource.data.get('tac', []).size() <= 10)
        && request.resource.data.get('name', '') is string && request.resource.data.get('name', '').size() <= 80
        && request.resource.data.get('email', '') is string && request.resource.data.get('email', '').size() <= 120;
      allow delete: if false;
      match /{kind}/{id} {
        allow read: if request.auth != null && (request.auth.uid == uid || sailAdmin());
        allow create, update: if sailUser() && request.auth.uid == uid && kind in ['sailTactics', 'sailRaces']
          && id.size() <= 64
          && request.resource.data.keys().hasOnly(['v', 't', 'del', 'data'])
          && request.resource.data.t is int && request.resource.data.del is bool
          && request.resource.data.data is string && request.resource.data.data.size() < 900000
          && (kind != 'sailTactics' || request.resource.data.del == true || sailAdmin()
              || id in getAfter(/databases/$(database)/documents/sailUsers/$(uid)).data.get('tac', []));
        allow delete: if false;
      }
    }
    // Site sahibinin "Hesaplar" listesi: bütün kullanıcıların taktik ve kayıtları tek sorguda
    match /{path=**}/sailTactics/{id} { allow read: if sailAdmin(); }
    match /{path=**}/sailRaces/{id} { allow read: if sailAdmin(); }

    // Herkese açık taktikler (Seyhun 2026-11-28): taktiği oluşturan açar, adı görünsün mü kendisi seçer (by = ad ya da null).
    // Giriş yapan herkes okur; yalnız sahibi yazar ve kaldırır, site sahibi de kaldırabilir. Taktik sahibin duran taktiklerinde olmalı.
    match /sailPublic/{pid} {
      allow read: if request.auth != null;
      allow create, update: if sailUser() && request.resource.data.owner == request.auth.uid
        && pid == request.auth.uid + '_' + request.resource.data.tid
        && request.resource.data.keys().hasOnly(['v', 'owner', 'tid', 'by', 't', 'title', 'data'])
        && request.resource.data.tid is string && request.resource.data.tid.size() <= 16
        && (request.resource.data.by == null || (request.resource.data.by is string && request.resource.data.by.size() <= 40))
        && request.resource.data.title is string && request.resource.data.title.size() <= 60
        && request.resource.data.t is int
        && request.resource.data.data is string && request.resource.data.data.size() < 200000
        && (sailAdmin() || request.resource.data.tid in get(/databases/$(database)/documents/sailUsers/$(request.auth.uid)).data.get('tac', []));
      allow delete: if request.auth != null && (resource.data.owner == request.auth.uid || sailAdmin());
    }

    // Antrenör yarışları ve kodla paylaşılan taktikler: her Velora hesabı kendi yarışını kurar (owner = kendi uid).
    // Kodu bilen yarışı açar (get); liste yalnız kendi yarışları (site sahibi hepsi). Sporcular yarışını gönderir (runs).
    match /sailChallenges/{code} {
      function ch() { return get(/databases/$(database)/documents/sailChallenges/$(code)).data; }
      allow get: if true;
      allow list: if request.auth != null && (resource.data.owner == request.auth.uid || sailAdmin());
      allow create: if sailUser() && request.resource.data.owner == request.auth.uid
        && code.matches('[A-Z0-9]{6}') && request.resource.data.setup is string && request.resource.data.setup.size() < 300000;
      allow update: if request.auth != null && resource.data.owner == request.auth.uid
        && request.resource.data.owner == resource.data.owner && request.resource.data.setup == resource.data.setup;
      allow delete: if request.auth != null && resource.data.owner == request.auth.uid;
      match /runs/{rid} {
        allow create: if request.auth != null
          && request.resource.data.uid == request.auth.uid
          && request.resource.data.n is int && request.resource.data.n >= 1
          && rid == request.auth.uid + '_' + string(request.resource.data.n)
          && (ch().tries == 0 || request.resource.data.n <= ch().tries)
          && ch().state == 'open' && (ch().due == 0 || request.time.toMillis() < ch().due)
          && request.resource.data.name is string && request.resource.data.name.size() <= 24
          && request.resource.data.rec is string && request.resource.data.rec.size() < 900000;
        allow read: if request.auth != null && (resource.data.uid == request.auth.uid || ch().owner == request.auth.uid
          || sailAdmin() || ch().vis == 'all'
          || (ch().vis == 'after' && exists(/databases/$(database)/documents/sailChallenges/$(code)/runs/$(request.auth.uid + '_1'))));
        allow delete: if request.auth != null && ch().owner == request.auth.uid;
      }
    }
    // ---- Velora Sailing sonu ----
`;
  const rulesText = () => RULES;
  window.SailTaskData = { sideTxt, rulesText, MAX_TRIES, triesOf, esc, jcopy, acc, store, PROJECT, COL, mode, CODE_OK, makeBackend, isCoach, isDenied, clock, parseClock, dateTxt, clsName,
    planLines, setupChips, resTxt, taskSetup, closed, board, taskLink };
})();

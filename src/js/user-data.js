/* Kullanıcıya ait veri (SailUserData, kullanıcı 2026-11-27): taktikler ve simülatör yarış kayıtları hesap kimliğine (uid) bağlı.
   Herkes yalnız kendi verisini görür ve yazar; Firestore kuralı da bunu zorlar (sailUsers/{uid}/…).
     cihaz önbelleği : localStorage '<anahtar>@<uid>' (dizi) + '<anahtar>@<uid>.q' (buluta gidecekler: {id: {t, del}})
     bulut           : Firestore sailUsers/{uid}/{sailTactics|sailRaces}/{id} = { v:1, t: ms, del: bool, data: JSON metni }
                       sailUsers/{uid} = { v:1, name, email, first, last, tac:[duran taktik kimlikleri] } (Hesaplar listesi; tac kuralda en çok 10)
   Silme yok: kullanıcı bir öğeyi silince bulutta del:true işareti kalır (başka cihazlar da siler). Aynı öğe iki yerde
   değiştiyse son değişiklik (t) kazanır.
   Eski kayıtlar: hesapsız tutulan '<anahtar>' (ps.taktik.v1, ps.sim.races.v1) yalnız site sahibinin hesabı o cihazda
   girince onun hesabına kopyalanır (kullanıcı 2026-11-27: "mevcut verileri Seyhun'un hesabına sahiplendir, hiçbir veriyi
   silme"). Eski anahtar yerinde kalır; başka hesaplara gösterilmez. */
(function (global) {
  const OWNER_UID = 'wIfcw0kHBVVu2DVMiyg1fcSA85F3';         // Seyhun (Velora). access.js ve Firestore kuralı ile aynı
  const KINDS = { tactics: { base: 'ps.taktik.v1', col: 'sailTactics' }, races: { base: 'ps.sim.races.v1', col: 'sailRaces' } };
  const LS = (() => { try { return global.localStorage || null; } catch (e) { return null; } })();
  const jget = (k, d) => { try { const v = LS && LS.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const jset = (k, v) => LS.setItem(k, JSON.stringify(v));      // alan dolarsa hata fırlatır (çağıran yakalar)
  const net = () => (typeof location !== 'undefined' && new URLSearchParams(location.search).get('net') === 'yerel' ? 'yerel' : 'firebase');
  const acc = () => (global.SailAccess && global.SailAccess.account()) || null;
  const uid = () => { const a = acc(); return a && a.uid && a.role !== 'misafir' ? String(a.uid) : null; };
  const stampOf = x => +x._t || +x.updated || Date.parse(x.savedAt || '') || 0;
  const keys = (kind, u) => { const K = KINDS[kind].base + '@' + u; return { K, Q: K + '.q' }; };
  const byNew = (a, b) => stampOf(b) - stampOf(a);
  const emit = kind => { try { global.document.dispatchEvent(new CustomEvent('sail-userdata', { detail: { kind } })); } catch (e) { /* yok */ } };

  // ---------- cihaz (hesaba göre) ----------
  function list(kind) { const u = uid(); if (!u) return []; const a = jget(keys(kind, u).K, []); return Array.isArray(a) ? a : []; }
  function get(kind, id) { return list(kind).find(x => x && x.id === id) || null; }
  function put(kind, item) {
    const u = uid(); if (!u) throw Object.assign(new Error('giriş yok'), { code: 'no-user' });
    const { K, Q } = keys(kind, u);
    item._t = Date.now();
    const a = list(kind).filter(x => x && x.id !== item.id); a.unshift(item);
    jset(K, a);
    const q = jget(Q, {}); q[item.id] = { t: item._t }; try { jset(Q, q); } catch (e) { /* yok */ }
    flushSoon(kind);
  }
  function remove(kind, id) {
    const u = uid(); if (!u) return;
    const { K, Q } = keys(kind, u);
    try { jset(K, list(kind).filter(x => x && x.id !== id)); } catch (e) { /* yok */ }
    const q = jget(Q, {}); q[id] = { t: Date.now(), del: true }; try { jset(Q, q); } catch (e) { /* yok */ }
    flushSoon(kind);
  }

  // site sahibi bu cihazda girince eski (hesapsız) kayıtları kendi hesabına kopyala; eski anahtar silinmez
  function adoptLegacy(u) {
    if (u !== OWNER_UID || !LS) return;
    for (const kind of Object.keys(KINDS)) {
      const base = KINDS[kind].base, flag = base + '.sahibe';
      if (LS.getItem(flag)) continue;
      const old = jget(base, null);
      if (Array.isArray(old) && old.length) {
        const { K, Q } = keys(kind, u), a = jget(K, []), q = jget(Q, {}), have = new Set(a.map(x => x && x.id));
        for (const it of old) if (it && it.id && !have.has(it.id)) { const c = { ...it, _t: stampOf(it) || 1 }; a.push(c); q[c.id] = { t: c._t }; }
        try { jset(K, a.sort(byNew)); jset(Q, q); } catch (e) { continue; }
      }
      try { LS.setItem(flag, u); } catch (e) { /* yok */ }
    }
  }

  // ---------- bulut ----------
  const V = () => global.VeloraAuth;
  // Firebase oturumu bu sitedeki hesapla aynı kişi mi (anonim değil)
  const fire = () => { const v = V(), u = uid(); return net() === 'firebase' && v && v.firestore && u && v.uid() === u && !v.isAnon() ? { ...v.firestore(), u } : null; };
  const state = {};                               // kind → 'yerel' | 'bulut' | 'yaziliyor' | 'hata'
  const timers = {};
  function flushSoon(kind) { clearTimeout(timers[kind]); timers[kind] = setTimeout(() => flush(kind).catch(() => {}), 700); }
  async function flush(kind) {
    const F = fire(); if (!F) return;
    const { fs, db, u } = F, { Q } = keys(kind, u), col = KINDS[kind].col;
    const q = jget(Q, {});
    const ids = Object.keys(q); if (!ids.length) return;
    state[kind] = 'yaziliyor';
    try {
      for (const id of ids) {
        const p = q[id], it = p.del ? null : list(kind).find(x => x && x.id === id);
        if (!p.del && !it) continue;
        const ref = fs.doc(db, 'sailUsers', u, col, String(id)), val = { v: 1, t: p.t, del: !!p.del, data: p.del ? '' : JSON.stringify(it) };
        if (kind === 'tactics') {
          // taktik sınırı kuralda: profildeki tac listesi (duran taktikler) aynı yazımla güncellenir
          const b = fs.writeBatch(db);
          b.set(fs.doc(db, 'sailUsers', u), { v: 1, tac: list('tactics').map(x => String(x.id)) }, { merge: true });
          b.set(ref, val);
          await b.commit();
        } else await fs.setDoc(ref, val);
        const now = jget(Q, {}); if (now[id] && now[id].t === p.t) { delete now[id]; jset(Q, now); }
      }
      state[kind] = 'bulut';
    } catch (e) { state[kind] = 'hata'; throw e; }
  }
  async function pull(kind) {
    const F = fire(); if (!F) return;
    const { fs, db, u } = F, { K, Q } = keys(kind, u);
    const snap = await fs.getDocs(fs.collection(db, 'sailUsers', u, KINDS[kind].col));
    if (uid() !== u) return;                        // bu arada hesap değişti
    const a = jget(K, []), q = jget(Q, {}), m = new Map(a.map(x => [x && x.id, x]));
    let changed = false;
    const cloud = new Set();
    snap.forEach(d => {
      const c = d.data(), id = d.id; cloud.add(id);
      if (q[id] && q[id].t >= (c.t || 0)) return;  // cihazdaki daha yeni, buluta gidecek
      delete q[id];
      const l = m.get(id);
      if (c.del) { if (l) { m.delete(id); changed = true; } return; }
      if (!l || (c.t || 0) > stampOf(l)) { try { const it = JSON.parse(c.data); it._t = c.t; m.set(id, it); changed = true; } catch (e) { /* bozuk */ } }
    });
    for (const [id, l] of m) if (id && !cloud.has(id) && !q[id]) q[id] = { t: stampOf(l) || Date.now() };   // bulutta hiç yok
    try { if (changed) jset(K, [...m.values()].filter(Boolean).sort(byNew)); jset(Q, q); } catch (e) { /* yok */ }
    if (changed) emit(kind);
  }
  async function sync(kind) {
    const kinds = kind ? [kind] : Object.keys(KINDS);
    for (const k of kinds) {
      if (!fire()) { state[k] = 'yerel'; continue; }
      try { await pull(k); await flush(k); state[k] = 'bulut'; } catch (e) { state[k] = 'hata'; }
    }
  }
  let profiled = null;
  async function profile() {
    const F = fire(); if (!F || profiled === F.u) return;
    profiled = F.u;
    const a = acc() || {};
    try {
      const ref = F.fs.doc(F.db, 'sailUsers', F.u);
      const old = await F.fs.getDoc(ref).catch(() => null);
      await F.fs.setDoc(ref, { v: 1, name: String(a.name || '').slice(0, 80), email: String(a.email || '').slice(0, 120),
        first: old && old.exists() && old.data().first ? old.data().first : F.fs.serverTimestamp(), last: F.fs.serverTimestamp() }, { merge: true });
    } catch (e) { profiled = null; }
  }

  // ---------- hesap değişince ----------
  let lastUid = uid();
  if (lastUid) adoptLegacy(lastUid);
  function onAccount() {
    const u = uid();
    if (u !== lastUid) { lastUid = u; if (u) adoptLegacy(u); Object.keys(KINDS).forEach(emit); }
    kick();
  }
  function kick() { if (fire()) { profile(); sync(); } }
  if (global.document) {
    global.document.addEventListener('sail-access', onAccount);
    const hook = () => { const v = V(); if (v && v.onUser) v.onUser(() => kick()); };
    if (V()) hook(); else global.document.addEventListener('velora-ready', hook, { once: true });
    global.addEventListener && global.addEventListener('online', () => kick());
    // başka sekmede değişti
    global.addEventListener && global.addEventListener('storage', e => {
      const u = uid(); if (!u || !e.key) return;
      for (const k of Object.keys(KINDS)) if (e.key === keys(k, u).K) emit(k);
    });
  }

  global.SailUserData = { OWNER_UID, KINDS, list, get, put, remove, sync, flush: k => flush(k), fire, uid, state: k => state[k] || (fire() ? 'bulut' : 'yerel') };
})(typeof window !== 'undefined' ? window : globalThis);

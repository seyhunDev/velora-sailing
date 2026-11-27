// Velora hesabıyla giriş (VeloraAuth). Velora (seyhunDev/sesliasistan) ile aynı Firebase projesi: sesliasistan-3e95a.
//
// 1) Velora'dan gelen: Velora'daki "Velora Sailing" kartı sunucudan 1 saatlik giriş anahtarı (custom token) alır ve bu
//    siteyi …/velora-sailing/#t=ANAHTAR ile açar. track.js anahtarı ilk iş adresten siler (kayıtlara girmez, window.__veloraToken);
//    burada signInWithCustomToken ile oturum açılır. Firebase oturumu bu sitede de saklanır: sonraki ziyaretlerde doğrudan açılır.
// 2) Doğrudan gelen: giriş ekranında "Velora hesabıyla gir" → Velora e-posta ve şifresi (signInWithEmailAndPassword).
// Rol: access.js verir. Yalnız Seyhun'un hesabı 'sahip' (admin), diğer bütün Velora hesapları 'kayitli' (kullanıcı 2026-11-27).
// Velora'daki işletme sahipliği ve anahtardaki `vs` bilgisi rolü etkilemez; buradan yalnız ad okunur.
//
// CONFIG.apiKey boşsa modül hiçbir şey yapmaz (Velora girişi görünmez, site eskisi gibi çalışır).
// Web ayarları gizli değildir (her web sitesinin kaynağında görünür); güvenlik Firebase kurallarındadır.
const CONFIG = {
  apiKey: 'AIzaSyDOiKPuOfTnfYTDNxv6ElknzECRwiQ5qx8',
  authDomain: 'sesliasistan-3e95a.firebaseapp.com',
  projectId: 'sesliasistan-3e95a',
  appId: '1:828345188662:web:b951d19cf1f647c14b3397',
  // Online yarış (js/online.js): Realtime Database, Belçika (europe-west1). Konsolda bu bölgede oluşturulmalı.
  databaseURL: 'https://sesliasistan-3e95a-default-rtdb.europe-west1.firebasedatabase.app',
};
const V = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

const A = () => window.SailAccess;
const pending = window.__veloraToken || null;
window.__veloraToken = null;

async function start() {
  if (!CONFIG.apiKey) { if (pending) A()?.veloraFail('Velora girişi bu sitede henüz açılmadı.'); return; }
  const [{ initializeApp }, au, fs] = await Promise.all([
    import(`${CDN}/firebase-app.js`), import(`${CDN}/firebase-auth.js`), import(`${CDN}/firebase-firestore-lite.js`),
  ]);
  const app = initializeApp(CONFIG, 'velora');
  const auth = au.getAuth(app);
  auth.languageCode = 'tr';
  // Yerel test (yalnız localhost, ?emu=1 bir kez): Firebase emülatörleri (Auth 9099, Firestore 8080). Canlı sitede çalışmaz.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    try { if (new URLSearchParams(location.search).has('emu')) localStorage.setItem('ps.emu', '1'); } catch (e) { /* yok */ }
    let on = false; try { on = localStorage.getItem('ps.emu') === '1'; } catch (e) { /* yok */ }
    if (on) { au.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); fs.connectFirestoreEmulator(fs.getFirestore(app), '127.0.0.1', 8080); }
  }

  async function nameOf(user) {
    try { const t = await user.getIdTokenResult(); if (t.claims.ad) return String(t.claims.ad); } catch (e) { /* yok */ }
    try { const d = (await fs.getDoc(fs.doc(fs.getFirestore(app), 'users', user.uid))).data() || {}; return d.name || ''; }
    catch (e) { return ''; }
  }
  async function adopt(user, how) {
    const name = await nameOf(user);
    const nm = name || user.displayName || (user.email ? user.email.split('@')[0] : 'Velora');
    A()?.veloraLogin({ uid: user.uid, name: nm, email: user.email || '' }, how);
  }

  window.VeloraAuth = {
    async signIn(email, password) {
      try {
        const c = await au.signInWithEmailAndPassword(auth, email.trim(), password);
        await adopt(c.user, 'velora-şifre');
        return null;
      } catch (e) {
        const c = e && e.code || '';
        if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return 'E-posta ya da şifre yanlış.';
        if (/too-many-requests/.test(c)) return 'Çok fazla deneme. Biraz sonra tekrar dene.';
        if (/network/.test(c)) return 'Bağlantı yok. İnternetini kontrol et.';
        return 'Giriş yapılamadı. Tekrar dene.';
      }
    },
    signOut: () => au.signOut(auth).catch(() => {}),
    // Sayfaların kendi verisi için (ör. yelken ayarı: sailingTrim). Kurallar sesliasistan Firestore'unda.
    onUser: cb => au.onAuthStateChanged(auth, cb),
    async getDoc(col, id) { const d = await fs.getDoc(fs.doc(fs.getFirestore(app), col, id)); return d.exists() ? d.data() : null; },
    setDoc: (col, id, data) => fs.setDoc(fs.doc(fs.getFirestore(app), col, id), data),
    // Online yarış: Realtime Database (modül ilk istendiğinde yüklenir). Döner: { db, m } (m: firebase-database modülü)
    uid: () => (auth.currentUser ? auth.currentUser.uid : null),
    async rtdb() {
      if (!rtdbP) rtdbP = import(`${CDN}/firebase-database.js`).then(m => ({ m, db: m.getDatabase(app, CONFIG.databaseURL) }));
      return rtdbP;
    },
  };
  let rtdbP = null;
  // Ziyaret kayıtları → Firestore `sailingEvents` (bir belge = bir ziyaretçinin ≤100 olayı). Ziyaretçi giriş yapmamış
  // olabilir: kural anonim "create"e izin verir (alanlar ve boyut sınırlı), okuma/silme yalnız site sahibinin uid'i.
  const db = fs.getFirestore(app);
  const T = window.SailTrack;
  if (T && T.setSink) {
    auth.authStateReady().catch(() => {}).then(() => T.setSink(async events => {
      const w = T.who, u = auth.currentUser;
      for (let i = 0; i < events.length; i += 100) {
        const ch = events.slice(i, i + 100).map(({ sent, ...e }) => e);
        await fs.addDoc(fs.collection(db, 'sailingEvents'), {
          v: 1, vid: T.vid, sid: T.sid, uid: u ? u.uid : null, role: ch[ch.length - 1].role || w.role || 'yeni',
          name: String(w.name || '').slice(0, 60), at: fs.serverTimestamp(), events: ch,
        });
      }
    }));
  }
  window.VeloraAuth.uid = () => (auth.currentUser ? auth.currentUser.uid : null);
  // Görevler (js/gorev.js): Firestore modülü + veritabanı. Hesabı olmayan sporcu yarışını adıyla gönderir:
  // Firebase anonim girişi (konsolda Authentication → Sign-in method → Anonymous açık olmalı). Anonim oturum siteye "giriş" sayılmaz.
  window.VeloraAuth.firestore = () => ({ fs, db });
  window.VeloraAuth.isAnon = () => !!(auth.currentUser && auth.currentUser.isAnonymous);
  window.VeloraAuth.anon = async () => {
    await auth.authStateReady().catch(() => {});
    if (auth.currentUser) return auth.currentUser.uid;
    return (await au.signInAnonymously(auth)).user.uid;
  };
  window.VeloraAuth.ready = () => auth.authStateReady();
  // Yalnız sahip (kural): son `max` belgeyi okuyup olaylara açar; her olaya belgenin adı ve Velora uid'i eklenir
  window.VeloraAuth.listEvents = async (max = 400) => {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'sailingEvents'), fs.orderBy('at', 'desc'), fs.limit(max)));
    const out = [];
    snap.forEach(d => { const x = d.data(); for (const e of x.events || []) out.push({ ...e, name: x.name || '', fuid: x.uid || null, cloud: true }); });
    return out;
  };
  // Yalnız site sahibi (kural): hesaplar ve her hesabın taktik / yarış kaydı / antrenör yarışı (ziyaret.html → Hesaplar)
  window.VeloraAuth.listAccounts = async () => {
    const m = new Map(), row = id => { if (!m.has(id)) m.set(id, { uid: id, name: '', email: '', first: 0, last: 0, tactics: [], races: [], tasks: [] }); return m.get(id); };
    const ms = v => (v && v.toMillis ? v.toMillis() : +v || 0);
    const [us, ts, rs, cs] = await Promise.all([
      fs.getDocs(fs.collection(db, 'sailUsers')), fs.getDocs(fs.collectionGroup(db, 'sailTactics')),
      fs.getDocs(fs.collectionGroup(db, 'sailRaces')), fs.getDocs(fs.collection(db, 'sailChallenges')),
    ]);
    us.forEach(d => { const x = d.data(), r = row(d.id); r.name = x.name || ''; r.email = x.email || ''; r.first = ms(x.first); r.last = ms(x.last); });
    const title = (d, k) => { try { const o = JSON.parse(d.data || '{}'); return String(o[k] || '').slice(0, 60); } catch (e) { return ''; } };
    ts.forEach(d => { const x = d.data(); if (!x.del) row(d.ref.parent.parent.id).tactics.push({ id: d.id, t: x.t, title: title(x, 'title') || 'Adsız taktik' }); });
    rs.forEach(d => { const x = d.data(); if (!x.del) row(d.ref.parent.parent.id).races.push({ id: d.id, t: x.t, title: title(x, 'name') || 'Yarış' }); });
    cs.forEach(d => { const x = d.data(); if (x.owner) row(x.owner).tasks.push({ id: d.id, t: ms(x.at), title: (x.kind === 'taktik' ? 'Taktik kodu: ' : '') + (x.name || d.id), state: x.state }); });
    return [...m.values()].sort((a, b) => (b.last || 0) - (a.last || 0));
  };
  document.dispatchEvent(new CustomEvent('velora-ready'));
  // Modül yüklenmeden çıkış yapıldıysa Firebase oturumu şimdi kapanır (access.js logout)
  try { if (localStorage.getItem('ps.fbSignOut') === '1') { localStorage.removeItem('ps.fbSignOut'); if (!pending) await au.signOut(auth).catch(() => {}); } } catch (e) { /* yok */ }

  if (pending) {
    try {
      const c = await au.signInWithCustomToken(auth, pending);
      await adopt(c.user, 'velora');
    } catch (e) {
      A()?.veloraFail('Velora girişi tamamlanamadı (anahtarın süresi dolmuş olabilir). Velora e-posta ve şifrenle girebilirsin.');
    }
    return;
  }
  // Daha önce Velora ile girilmişse ve bu cihazdaki hesap başka biriyse (ya da hiç yoksa) Firebase oturumunu benimse
  const un = au.onAuthStateChanged(auth, user => {
    un();
    const acc = A()?.account();
    if (user && !user.isAnonymous && (!acc || (acc.via === 'velora' && acc.uid !== user.uid) || acc.role === 'misafir')) adopt(user, 'velora-oturum');
  });
}

start().catch(() => { if (pending) A()?.veloraFail('Velora girişi yüklenemedi. Bağlantını kontrol et.'); });

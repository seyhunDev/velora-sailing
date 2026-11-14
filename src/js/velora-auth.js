// Velora hesabıyla giriş (VeloraAuth). Velora (seyhunDev/sesliasistan) ile aynı Firebase projesi: sesliasistan-3e95a.
//
// 1) Velora'dan gelen: Velora'daki "Velora Sailing" kartı sunucudan 1 saatlik giriş anahtarı (custom token) alır ve bu
//    siteyi …/velora-sailing/#t=ANAHTAR ile açar. track.js anahtarı ilk iş adresten siler (kayıtlara girmez, window.__veloraToken);
//    burada signInWithCustomToken ile oturum açılır. Firebase oturumu bu sitede de saklanır: sonraki ziyaretlerde doğrudan açılır.
// 2) Doğrudan gelen: giriş ekranında "Velora hesabıyla gir" → Velora e-posta ve şifresi (signInWithEmailAndPassword).
// Rol: Velora'da işletmenin ana hesabı (users/{uid}: role owner, orgId = uid) → 'sahip', diğer Velora hesapları → 'kayitli'.
// Velora anahtarındaki `vs` bilgisi varsa o kullanılır, yoksa profil Firestore'dan okunur (kural: herkes kendi profilini okur).
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

  async function roleOf(user) {
    try {
      const t = await user.getIdTokenResult();
      if (t.claims.vs === 'sahip' || t.claims.vs === 'kayitli') return { role: t.claims.vs, name: t.claims.ad || '' };
    } catch (e) { /* yok */ }
    try {
      const d = (await fs.getDoc(fs.doc(fs.getFirestore(app), 'users', user.uid))).data() || {};
      const owner = (d.role || 'owner') === 'owner' && (d.orgId || user.uid) === user.uid;
      return { role: owner ? 'sahip' : 'kayitli', name: d.name || '' };
    } catch (e) { return { role: 'kayitli', name: '' }; }
  }
  async function adopt(user, how) {
    const { role, name } = await roleOf(user);
    const nm = name || user.displayName || (user.email ? user.email.split('@')[0] : 'Velora');
    A()?.veloraLogin({ uid: user.uid, name: nm, email: user.email || '', role }, how);
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
  window.VeloraAuth.ready = () => auth.authStateReady();
  // Yalnız sahip (kural): son `max` belgeyi okuyup olaylara açar; her olaya belgenin adı ve Velora uid'i eklenir
  window.VeloraAuth.listEvents = async (max = 400) => {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'sailingEvents'), fs.orderBy('at', 'desc'), fs.limit(max)));
    const out = [];
    snap.forEach(d => { const x = d.data(); for (const e of x.events || []) out.push({ ...e, name: x.name || '', fuid: x.uid || null, cloud: true }); });
    return out;
  };
  document.dispatchEvent(new CustomEvent('velora-ready'));

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
    if (user && (!acc || (acc.via === 'velora' && acc.uid !== user.uid) || acc.role === 'misafir')) adopt(user, 'velora-oturum');
  });
}

start().catch(() => { if (pending) A()?.veloraFail('Velora girişi yüklenemedi. Bağlantını kontrol et.'); });

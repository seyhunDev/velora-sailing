// Giriş ara ekranı, roller ve erişim (SailAccess).
//
// ÖNEMLİ: Bu katman tamamen tarayıcıda çalışır, GERÇEK GÜVENLİK DEĞİLDİR. Kodu bilen biri kilitleri
// tarayıcı konsolundan açabilir. Amaç şimdilik ziyaretçiyi yönlendirmek ve kayıt toplamaktır.
// Gerçek kısıtlama Firebase Auth + Firestore güvenlik kurallarıyla gelecek; o zaman `signup`/`ownerLogin`
// Firebase çağrılarına bağlanır, rol sunucudan okunur, FEATURES tablosu aynen kalır.
//
// Roller: 'sahip' (sınırsız) · 'kayitli' (kaydolmuş) · 'misafir'. Hesap localStorage 'ps.account.v1'.
// Sahip girişi: anahtarın kendisi kodda YOK, yalnızca SHA-256 özeti var. Giriş ekranında "Sahip girişi"
// ya da adres çubuğunda ?sahip=ANAHTAR. Anahtar değişecekse OWNER_HASH yeniden hesaplanır:
//   node -e "console.log(require('crypto').createHash('sha256').update('ps-owner-v1:'+process.argv[1]).digest('hex'))" YENI-ANAHTAR
(function () {
  const ACC = 'ps.account.v1';
  const OWNER_HASH = '8be3211987e7c28a67b091e52e657e21ae03992b361fbd159f4e44599a2e1a06';
  const ROLE_NAMES = { sahip: 'Sahip', kayitli: 'Kayıtlı', misafir: 'Misafir' };

  // Hangi rol neye erişir. Değiştirmek için yalnız bu tabloyu düzenle.
  const FEATURES = {
    'scn.ileri':   { roles: ['sahip', 'kayitli'], name: 'İleri Taktik animasyonları' },
    'sim.drive':   { roles: ['sahip', 'kayitli'], name: 'Simülatörde tekneyi elle sürme' },
    'sim.records': { roles: ['sahip', 'kayitli'], name: 'Yarışı kaydetme ve kayıtlı yarışlar' },
    'visits':      { roles: ['sahip'],            name: 'Ziyaret kayıtları' },
  };

  // Giriş: Velora hesabı (seyhunDev/sesliasistan). Kaydol / şifremi unuttum Velora'nın sayfasında yapılır, Velora işi bitince
  // kişiyi /api/sailing-giris anahtarıyla buradaki aynı adrese geri gönderir (Velora: src/lib/sailingReturn.js, 2026-11-24).
  const VELORA = 'https://sesliasistan.netlify.app';
  // Misafir seçeneği (2026-11-24: "kayıtlı değilse önce Velora'ya kaydolsun"). Tek senaryo bağlantısı (?izle) yine girişsiz.
  const GUEST = false;

  const T = window.SailTrack || { log() {}, setWho() {}, consent: () => null, setConsent() {}, context: () => ({}), newSession: false };
  const get = () => { try { return JSON.parse(localStorage.getItem(ACC)) || null; } catch (e) { return null; } };
  const put = a => { try { a ? localStorage.setItem(ACC, JSON.stringify(a)) : localStorage.removeItem(ACC); } catch (e) { /* yok */ } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : 'u' + Math.random().toString(36).slice(2) + Date.now().toString(36));

  let acc = get();
  let veloraWait = false;
  const role = () => (acc && acc.role) || 'misafir';
  const signedIn = () => !!acc && (GUEST || acc.role !== 'misafir');
  // Çıkış: bu sitedeki hesap + Velora (Firebase) oturumu kapanır. Sonraki "Velora'ya kaydol / gir" Velora'ya &cikis=1 ile gider,
  // Velora da tarayıcıdaki oturumunu kapatır; yoksa Velora eski hesabı tanıyıp kişiyi o hesapla geri gönderirdi (kullanıcı 2026-11-24).
  const OUT = 'ps.loggedOut';
  function logout() {
    T.log('logout', {});
    if (window.VeloraAuth) window.VeloraAuth.signOut();
    else try { localStorage.setItem('ps.fbSignOut', '1'); } catch (e) { /* yok */ }   // modül yüklenince kapatır (velora-auth.js)
    try { localStorage.setItem(OUT, '1'); } catch (e) { /* yok */ }
    setAccount(null, 'çıkış'); openGate('home');
  }
  function toVelora(page) {
    const back = location.pathname + location.search + location.hash;
    let out = false; try { out = localStorage.getItem(OUT) === '1'; } catch (e) { /* yok */ }
    T.log('velora', { go: page });
    applyConsent();
    location.assign(`${VELORA}/${page}?sailing=${encodeURIComponent(back)}${out ? '&cikis=1' : ''}`);
  }
  const can = f => { const x = FEATURES[f]; return !x || x.roles.includes(role()); };
  function syncWho() { T.setWho({ role: acc ? acc.role : null, uid: acc && acc.uid, name: (acc && acc.name) || '' }); document.documentElement.dataset.role = role(); }
  syncWho();

  async function sha256(text) {
    if (!(crypto.subtle && crypto.subtle.digest)) return '';
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function isOwnerKey(key) { return !!key && (await sha256('ps-owner-v1:' + key.trim())) === OWNER_HASH; }

  function setAccount(a, how) {
    acc = a; put(a); syncWho(); chipUpdate();
    if (a && a.role !== 'misafir') try { localStorage.removeItem('ps.loggedOut'); } catch (e) { /* yok */ }
    setTimeout(askConsent, 400);
    document.dispatchEvent(new CustomEvent('sail-access', { detail: { role: role(), how } }));
  }

  // ---------- giriş ekranı ----------
  const NOTICE_SHORT = 'Siteyi geliştirmek için ziyaretin kaydedilir: hangi sayfaları ve animasyonları açtığın, ' +
    'hangi düğmelere bastığın, ne zaman ve ne kadar kaldığın, cihaz/tarayıcı türü, dil ve geldiğin site. ' +
    'Kayıtlar site sahibine iletilir; yalnızca site sahibi görebilir.';
  const NOTICE_LONG = `
    <p><b>Veri sorumlusu:</b> Velora Sailing site sahibi.</p>
    <p><b>Toplanan veriler:</b> rastgele bir ziyaretçi kimliği (adın ya da IP adresin değil), açtığın sayfalar ve animasyonlar,
    simülatörde yaptığın işlemler (start, kayıt, elle sürme vb.), ziyaret zamanı ve süresi, cihaz türü, işletim sistemi, tarayıcı,
    dil, saat dilimi, ekran boyutu ve hangi siteden geldiğin. Kaydolursan verdiğin ad, e-posta, kulüp ve rol bilgisi.</p>
    <p><b>Amaç:</b> hangi konuların kullanıldığını görüp siteyi ve animasyonları geliştirmek. Reklam ya da satış için kullanılmaz,
    üçüncü kişilerle paylaşılmaz.</p>
    <p><b>Saklama yeri:</b> önce bu tarayıcı, sonra site sahibinin Firebase (Google Cloud) veritabanı. Kayıtları yalnızca site sahibi
    okuyabilir; diğer kullanıcılar ve ziyaretçiler göremez.</p>
    <p><b>Hakların (KVKK md. 11):</b> verilerini görmek, düzeltmek ve silmek. Sağ üstteki hesap menüsünden
    <b>Gizlilik ve verilerim → Kayıtlarımı sil</b> ile hepsini silebilir, izni kapatabilirsin.</p>`;

  let gate = null, gateMode = 'home', lockedFeature = null;
  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  const LOGO = '<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="23" fill="#0b1a33"/><circle cx="50" cy="52" r="30" fill="#fff"/><path d="M26 19 L35.6 19 C 42 35, 46 47.8, 50 55.8 L59.6 19 L74 19 L56.4 67 L43.6 67 Z" fill="#0b1a33"/></svg>';  // Velora logosu (img/velora-mark.svg)
  const LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  const BACK = '<svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Sade giriş kartı: tek ana düğme (misafir), ikincil "Kaydol", altta tek satır gizlilik.
  function buildGate() {
    gate = el(`<div class="gate hidden" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
      <div class="gate-card">
        <button class="icon gate-x" id="gateClose" title="Kapat" aria-label="Kapat"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        <div class="gate-body" id="gateBody"></div>
        <div class="gate-foot">
          <label class="gate-consent"><input type="checkbox" id="gateConsent" checked>
            <span>Siteyi geliştirmek için kullanımın kaydedilir ve site sahibine iletilir. <button type="button" class="gate-link" id="gateMore">Ayrıntılar</button></span></label>
        </div>
        <div class="gate-notice hidden" id="gateNotice"><p>${esc(NOTICE_SHORT)}</p>${NOTICE_LONG}</div>
      </div></div>`);
    document.body.appendChild(gate);
    gate.querySelector('#gateMore').onclick = e => { e.preventDefault(); gate.querySelector('#gateNotice').classList.toggle('hidden'); };
    gate.querySelector('#gateClose').onclick = () => closeGate('kapat');
    gate.addEventListener('keydown', e => { if (e.key === 'Escape' && (signedIn() || gateMode === 'locked')) closeGate('esc'); });
  }

  function renderGate() {
    const body = gate.querySelector('#gateBody');
    gate.querySelector('#gateClose').style.display = signedIn() || gateMode === 'locked' ? '' : 'none';   // hesabı olmayan önce Velora'ya girer
    const f = lockedFeature && FEATURES[lockedFeature];
    const back = () => { gateMode = lockedFeature ? 'locked' : 'home'; renderGate(); };
    if (gateMode === 'home') {
      body.innerHTML = `
        <div class="gate-hero"><span class="gate-logo">${LOGO}</span>
          <h2 id="gateTitle">Velora <em>Sailing</em></h2>
          <p>Yarış yelkencileri için taktik ve kural animasyonları</p></div>
        <div class="gate-btns">
          <button class="gate-btn primary" id="gateSignup">Velora'ya kaydol <span>ücretsiz</span></button>
          <button class="gate-btn velora" id="gateVelora"><i class="gate-vmark">${LOGO}</i>Velora hesabımla gir</button>
          ${GUEST ? '<button class="gate-btn ghost" id="gateGuest">Misafir olarak devam et</button>' : ''}
        </div>
        <p class="gate-hint">Velora Sailing, Velora hesabınla açılır. Kaydolunca bu sayfaya geri dönersin.</p>`;
      const gg = body.querySelector('#gateGuest');
      if (gg) gg.onclick = () => chooseGuest();
      body.querySelector('#gateSignup').onclick = () => toVelora('register');
      // Velora modülü yüklendiyse giriş burada (e-posta + şifre), yüklenmediyse Velora'nın giriş sayfasına gidilir
      body.querySelector('#gateVelora').onclick = () => { if (window.VeloraAuth) { gateMode = 'velora'; renderGate(); } else toVelora('login'); };
    } else if (gateMode === 'velora') {
      body.innerHTML = `
        <button class="gate-back" id="gvBack">${BACK}Geri</button>
        <h2 id="gateTitle" class="gate-h">Velora hesabıyla gir</h2>
        <p class="gate-sub">Velora'da kullandığın e-posta ve şifre.</p>
        <form class="gate-form" id="gateVForm" novalidate>
          <input id="gvMail" type="email" autocomplete="username" required maxlength="80" placeholder="E-posta" aria-label="E-posta">
          <input id="gvPass" type="password" autocomplete="current-password" required placeholder="Şifre" aria-label="Şifre">
          <div class="gate-err" id="gvErr">${esc(veloraMsg)}</div>
          <button class="gate-btn primary" id="gvGo">Giriş</button>
        </form>
        <p class="gate-alt"><button type="button" class="gate-link" id="gvForgot">Şifremi unuttum</button> · <button type="button" class="gate-link" id="gvNew">Hesabım yok, kaydol</button></p>`;
      veloraMsg = '';
      body.querySelector('#gvBack').onclick = back;
      body.querySelector('#gvForgot').onclick = () => toVelora('login');
      body.querySelector('#gvNew').onclick = () => toVelora('register');
      body.querySelector('#gateVForm').onsubmit = async e => {
        e.preventDefault();
        const err = body.querySelector('#gvErr'), go = body.querySelector('#gvGo');
        const mail = body.querySelector('#gvMail').value, pass = body.querySelector('#gvPass').value;
        if (!mail.trim() || !pass) { err.textContent = 'E-posta ve şifreyi yaz.'; return; }
        if (!window.VeloraAuth) { err.textContent = 'Velora girişi şu an kullanılamıyor.'; return; }
        go.disabled = true; err.textContent = '';
        const msg = await window.VeloraAuth.signIn(mail, pass);
        go.disabled = false;
        if (msg) { err.textContent = msg; T.log('velora', { ok: false }); }
      };
      setTimeout(() => body.querySelector('#gvMail')?.focus(), 30);   // hızlı dokunuşta ekran değişmiş olabilir (rastgele tıklama testi buldu)
    } else if (gateMode === 'locked') {
      body.innerHTML = `
        <div class="gate-hero"><span class="gate-logo lock">${LOCK}</span>
          <h2 id="gateTitle">${esc(f ? f.name : 'Bu bölüm')}</h2>
          <p>Velora hesabı olanlar için. Kaydolmak ücretsiz, bir dakika sürer.</p></div>
        <div class="gate-btns">
          <button class="gate-btn primary" id="gateSignup">Velora'ya kaydol</button>
          <button class="gate-btn velora" id="gateVelora"><i class="gate-vmark">${LOGO}</i>Velora hesabımla gir</button>
          <button class="gate-btn ghost" id="gateBack">Şimdi değil</button>
        </div>`;
      body.querySelector('#gateSignup').onclick = () => toVelora('register');
      body.querySelector('#gateVelora').onclick = () => { if (window.VeloraAuth) { gateMode = 'velora'; renderGate(); } else toVelora('login'); };
      body.querySelector('#gateBack').onclick = () => { T.log('locked', { feature: lockedFeature, answer: 'vazgeç' }); closeGate('vazgeç'); };
    } else if (gateMode === 'owner') {
      body.innerHTML = `
        <button class="gate-back" id="goBack">${BACK}Geri</button>
        <h2 id="gateTitle" class="gate-h">Site sahibi girişi</h2>
        <form class="gate-form" id="gateOwnerForm">
          <input id="goKey" type="password" autocomplete="current-password" required placeholder="Sahip anahtarı" aria-label="Sahip anahtarı">
          <div class="gate-err" id="goErr"></div>
          <button class="gate-btn primary" id="goGo">Giriş</button>
        </form>`;
      body.querySelector('#goBack').onclick = back;
      body.querySelector('#gateOwnerForm').onsubmit = async e => {
        e.preventDefault();
        const ok = await ownerLogin(body.querySelector('#goKey').value);
        if (!ok) { body.querySelector('#goErr').textContent = 'Anahtar doğru değil.'; T.log('owner', { ok: false }); }
      };
      setTimeout(() => body.querySelector('#goKey')?.focus(), 30);   // hızlı dokunuşta ekran değişmiş olabilir (rastgele tıklama testi buldu)
    }
  }

  function applyConsent() {
    const c = gate ? gate.querySelector('#gateConsent').checked : T.consent() !== false;
    if (T.consent() !== c) { T.setConsent(c); T.log('consent', { ok: c }); }
  }
  function openGate(mode, feature) {
    if (!gate) buildGate();
    gateMode = mode || 'home'; lockedFeature = feature || null;
    const c = T.consent(); gate.querySelector('#gateConsent').checked = c !== false;
    renderGate(); gate.classList.remove('hidden'); document.documentElement.classList.add('gate-open');
  }
  function closeGate(how) {
    if (!gate) return;
    applyConsent();
    gate.classList.add('hidden'); document.documentElement.classList.remove('gate-open');
    if (!acc && how) chooseGuest();
  }
  function chooseGuest() {
    applyConsent();
    setAccount({ role: 'misafir', uid: null, since: new Date().toISOString() }, 'misafir');
    T.log('gate', { choice: 'misafir' });
    gate.classList.add('hidden'); document.documentElement.classList.remove('gate-open');
  }
  async function ownerLogin(key) {
    if (!(await isOwnerKey(key))) return false;
    applyConsent();
    const prev = acc || {};
    setAccount({ ...prev, role: 'sahip', uid: prev.uid || rid(), name: prev.name || 'Site sahibi', since: prev.since || new Date().toISOString() }, 'sahip');
    T.log('owner', { ok: true });
    if (gate) { gate.classList.add('hidden'); document.documentElement.classList.remove('gate-open'); }
    toast('Sahip girişi yapıldı: her şey açık.');
    return true;
  }

  // Velora hesabıyla giriş (js/velora-auth.js çağırır): rol Velora'dan gelir, hesap bu cihazda da saklanır
  let veloraMsg = '';
  function veloraLogin(u, how) {
    applyConsent();
    const prev = acc || {};
    const role = u.role === 'sahip' || prev.role === 'sahip' ? 'sahip' : 'kayitli';
    const same = prev.via === 'velora' && prev.uid === u.uid;
    setAccount({ role, uid: u.uid, name: u.name, email: u.email, via: 'velora', since: same && prev.since ? prev.since : new Date().toISOString() }, how);
    T.log('velora', { ok: true, how, role });
    if (gate) { gate.classList.add('hidden'); document.documentElement.classList.remove('gate-open'); }
    if (!same) toast(`Velora hesabınla girdin${u.name ? ': ' + u.name.split(' ')[0] : ''}.`);
  }
  function veloraFail(msg) {
    veloraWait = false;
    T.log('velora', { ok: false, how: 'anahtar' });
    if (acc) { toast(msg); return; }
    veloraMsg = window.VeloraAuth ? msg : '';
    openGate(window.VeloraAuth ? 'velora' : 'home');
    if (!window.VeloraAuth) toast(msg);
  }
  document.addEventListener('velora-ready', () => { if (gate && !gate.classList.contains('hidden') && gateMode === 'home') renderGate(); });

  // ---------- hesap düğmesi ve menü (üst çubuk) ----------
  let chip = null, menu = null, extra = null;
  function buildChip() {
    const bar = document.querySelector('.topbar .tool-group') || document.querySelector('.topbar');
    if (!bar) return;
    // en sağda yuvarlak hesap düğmesi: adın baş harfi (yoksa kişi simgesi), halka rengi rol; menüde hesap + sayfanın ayarları
    chip = el(`<button id="btnAccount" class="acc-chip" title="Hesap ve ayarlar" aria-haspopup="menu">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M4.8 19.5c1.3-3.4 4-5 7.2-5s5.9 1.6 7.2 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
      <span class="acc-ini" id="accLbl"></span></button>`);
    bar.appendChild(chip);
    menu = el('<div class="acc-menu hidden" role="menu"></div>');
    document.body.appendChild(menu);
    chip.onclick = e => { e.stopPropagation(); toggleMenu(); };
    document.addEventListener('click', e => { if (!menu.contains(e.target)) toggleMenu(false); });
    chipUpdate();
  }
  function chipUpdate() {
    if (!chip) return;
    const r = role();
    chip.dataset.role = r;
    const nm = acc && acc.name ? acc.name.trim() : '';
    chip.querySelector('#accLbl').textContent = nm ? nm[0].toLocaleUpperCase('tr') : '';
    chip.classList.toggle('has-ini', !!nm);
    chip.title = (nm || ROLE_NAMES[r]) + ' · hesap ve ayarlar';
  }
  function toggleMenu(force) {
    const open = force != null ? force : menu.classList.contains('hidden');
    if (!open) { menu.classList.add('hidden'); chip.classList.remove('on'); return; }
    const r = role(), c = T.consent();
    const b = chip.getBoundingClientRect();
    menu.style.top = (b.bottom + 6) + 'px';
    menu.style.right = Math.max(8, innerWidth - b.right) + 'px';
    menu.style.maxHeight = `calc(100dvh - ${Math.round(b.bottom + 14)}px)`;
    const who = acc && acc.name ? acc.name : r === 'misafir' ? 'Misafir ziyaretçi' : r === 'sahip' ? 'Site sahibi' : 'Hesabım';
    menu.innerHTML = `
      <div class="acc-head"><span class="acc-av" data-role="${r}">${chip.innerHTML}</span>
        <div class="acc-id"><div class="acc-who">${esc(who)}</div>
        <div class="acc-sub"><span class="acc-role" data-role="${r}">${ROLE_NAMES[r]}</span>${acc && acc.email ? `<span class="acc-mail">${esc(acc.email)}</span>` : ''}</div></div></div>
      ${r === 'misafir' ? '<button class="acc-item" data-a="signup">Velora\'ya kaydol / gir <small>tüm bölümler açılır</small></button>' : ''}
      ${can('visits') ? '<a class="acc-item" href="ziyaret.html" data-a="visits">Ziyaret kayıtları</a>' : ''}
      ${window.VeloraData ? `<button class="acc-item" data-a="data">Veri kullanımı <small>bugün ${VeloraData.fmt(VeloraData.stats().today)}</small></button>` : ''}
      <button class="acc-item" data-a="privacy">Gizlilik ve verilerim <small>${c === false ? 'kayıt kapalı' : 'kayıt açık'}</small></button>
      ${r !== 'misafir' ? '<button class="acc-item" data-a="logout">Çıkış yap</button>' : '<button class="acc-item" data-a="owner">Site sahibi girişi</button>'}`;
    // sayfanın kendi ayarları (ör. ana sayfada görünüm anahtarları, #pageSettings) menünün altına
    extra = extra || document.getElementById('pageSettings');      // ilk açılışta bulunur; sonra menüye taşınmış olarak saklanır
    if (extra) { menu.appendChild(extra); extra.hidden = false; }
    menu.querySelectorAll('[data-a]').forEach(x => x.onclick = () => {
      const a = x.dataset.a; menu.classList.add('hidden');
      if (a === 'signup') openGate('home');
      else if (a === 'owner') openGate('owner');
      else if (a === 'privacy') openPrivacy();
      else if (a === 'data') window.VeloraData.open();
      else if (a === 'logout') logout();
    });
    menu.classList.remove('hidden'); chip.classList.add('on');
  }

  function openPrivacy() {
    const c = T.consent() !== false;
    const n = (window.SailTrack && SailTrack.all ? SailTrack.all().filter(e => e.vid === SailTrack.vid).length : 0);
    const d = el(`<div class="gate" role="dialog" aria-modal="true"><div class="gate-card">
      <div class="gate-brand"><div><div class="gate-name">Gizlilik ve verilerim</div><div class="gate-tag">Bu tarayıcıda senin hakkında ${n} kayıt var</div></div>
        <button class="icon gate-x" data-x title="Kapat" aria-label="Kapat"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
      <div class="gate-body">
        <label class="gate-toggle"><span>Kullanım kaydına izin veriyorum</span><span class="switch"><input type="checkbox" id="pvOn" ${c ? 'checked' : ''}><span class="track"><span class="knob"></span></span></span></label>
        <div class="gate-notice">${NOTICE_LONG}</div>
        <div class="gate-actions"><button class="tb" id="pvDel">Kayıtlarımı sil</button><button class="tb primary" data-x>Tamam</button></div>
      </div></div></div>`);
    document.body.appendChild(d);
    const close = () => d.remove();
    d.querySelectorAll('[data-x]').forEach(x => x.onclick = close);
    d.addEventListener('click', e => { if (e.target === d) close(); });
    d.querySelector('#pvOn').onchange = e => { T.setConsent(e.target.checked); if (consentBar) { consentBar.remove(); consentBar = null; } if (e.target.checked) T.log('consent', { ok: true }); };
    d.querySelector('#pvDel').onclick = () => {
      if (window.SailTrack) SailTrack.clear();
      d.querySelector('.gate-tag').textContent = 'Kayıtların silindi.';
    };
  }

  // Hesabı olan ama kayıt izni sorulmamış ziyaretçi (ör. Velora'dan doğrudan gelen, ya da metin değişti): alttan kısa soru
  let consentBar = null;
  function askConsent() {
    if (!acc || T.consent() != null || consentBar || (gate && !gate.classList.contains('hidden'))) return;
    consentBar = el(`<div class="consent-bar" role="dialog" aria-label="Kayıt izni">
      <span>Siteyi geliştirmek için kullanımın kaydedilir ve site sahibine iletilir. <button type="button" class="gate-link" data-c="more">Ayrıntılar</button></span>
      <div class="consent-btns"><button class="tb" data-c="no">Hayır</button><button class="tb primary" data-c="yes">İzin ver</button></div></div>`);
    document.body.appendChild(consentBar);
    consentBar.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      const c = b.dataset.c;
      if (c === 'more') { openPrivacy(); return; }
      T.setConsent(c === 'yes'); if (c === 'yes') T.log('consent', { ok: true });
      consentBar.remove(); consentBar = null;
    });
  }

  function toast(msg) {
    const t = el(`<div class="acc-toast">${esc(msg)}</div>`);
    document.body.appendChild(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3100);
  }

  // Kilitli özelliği deneyince çağrılır: izin varsa true, yoksa giriş ekranını açar ve false döner.
  function guard(feature) {
    if (can(feature)) return true;
    T.log('locked', { feature });
    openGate('locked', feature);
    return false;
  }

  window.SailAccess = { FEATURES, role, can, guard, account: () => acc, open: openGate, ownerLogin, veloraLogin, veloraFail, ROLE_NAMES, closeMenu: () => menu && toggleMenu(false) };

  // ---------- açılış ----------
  if (T.newSession) T.log('visit', T.context());
  T.log('page', { title: document.title.slice(0, 80) });
  buildChip();
  // ?sahip=ANAHTAR: sahip girişi, sonra adresten temizle
  const q = new URLSearchParams(location.search);
  if (q.has('sahip')) {
    const key = q.get('sahip'); q.delete('sahip');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    ownerLogin(key).then(ok => { if (!ok && !acc) openGate('owner'); });
  } else if (window.__veloraToken) {
    // Velora'dan anahtarla gelindi: giriş ekranı gösterilmeden velora-auth.js oturumu açar; 12 sn'de olmazsa ekran açılır
    veloraWait = true;
    setTimeout(() => { if (veloraWait && !signedIn()) openGate('home'); veloraWait = false; }, 12000);
  } else if (!signedIn() && !document.documentElement.classList.contains('tek')) openGate('home');   // paylaşılan senaryo: girişsiz izlenir
  askConsent();
})();

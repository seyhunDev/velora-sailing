// Uygulama kabuğu: siteyi web sayfası değil uygulama gibi davrandırır. Her sayfada ilk betik.
// - Sayfa yukarı/aşağı esnemez, kaymaz, iki parmakla büyümez (yalnız kendi kaydırma alanları kayar).
// - Telefonda yatay zorunlu yalnız <html data-yatay> olan sayfada (simülatör): dikey tutulunca "telefonu çevir" ekranı.
//   Ana sayfa ve diğer sayfalar telefonda dikey de açılır (kullanıcı 2026-11-22). iPad'de iki yön de serbest.
// - Ana ekrana eklenince (standalone) tarayıcı çubukları olmadan tam ekran açılır.
// Sınıflar (<html>): is-phone · is-tablet · is-touch · is-standalone · is-embedded · is-portrait / is-landscape
(function () {
  const H = document.documentElement;
  const mq = q => window.matchMedia(q).matches;
  const touch = mq('(pointer: coarse)') || navigator.maxTouchPoints > 1;
  // Telefon = dokunmatik ve ekranın kısa kenarı < 600 CSS px (iPad mini 744, en küçük tablet ~600).
  const short = Math.min(screen.width, screen.height);
  const phone = touch && short < 600;
  const tablet = touch && !phone;
  const standalone = mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || navigator.standalone === true;
  H.classList.toggle('is-touch', touch);
  H.classList.toggle('is-phone', phone);
  H.classList.toggle('is-tablet', tablet);
  // Velora uygulamasının içinde (sesliasistan /sailing sayfası, çerçeve): tarayıcı çubuğu yok, tam ekran sorulmaz,
  // üst çubukta "Velora'ya dön" düğmesi çıkar (fullscreen.js). Çerçeve dışında (doğrudan site) hiçbir şey değişmez.
  let embedded = false;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  H.classList.toggle('is-embedded', embedded);
  // Paylaşılan tek senaryo bağlantısı (index.html?izle=ID): yalnız o senaryo + Kapat; giriş ekranı, ana sayfa,
  // önceki/sonraki ve diğer düğmeler yok (app.js, access.js, style.css → html.tek)
  // ?izle=onizle: Taktik oluştur'un içindeki ön izleme oynatıcısı (html.tek.onizle; ziyaret kaydı tutulmaz, track.js)
  try { const iz = new URLSearchParams(location.search).get('izle'); if (iz) H.classList.add('tek'); if (iz === 'onizle') H.classList.add('onizle'); } catch (e) { /* yok */ }
  H.classList.toggle('is-standalone', !!standalone || embedded);
  // Ziyaret kayıtları gibi uzun sayfalar kendi içinde kaysın diye kabuk istisnası: <body data-shell="page">
  const isPage = () => document.body && document.body.dataset.shell === 'page';

  // Yatay telefonda çentik / Dynamic Island hangi yanda? (iOS iki yana da aynı güvenli alan payını verir;
  // yalnız kamera tarafında tam pay, öbür yanda yuvarlak köşe kadar pay bırakırız → ekran soldan sağa dolar)
  function notchSide() {
    let a = typeof window.orientation === 'number' ? window.orientation : (screen.orientation ? screen.orientation.angle : 0);
    a = ((a % 360) + 360) % 360;
    H.classList.toggle('notch-l', a === 90);
    H.classList.toggle('notch-r', a === 270);
  }
  function orient() {
    const portrait = innerHeight > innerWidth;
    notchSide();
    H.classList.toggle('is-portrait', portrait);
    H.classList.toggle('is-landscape', !portrait);
    H.style.setProperty('--app-h', innerHeight + 'px');
  }
  orient();
  addEventListener('resize', orient);
  addEventListener('orientationchange', () => setTimeout(orient, 120));

  // Telefonda dikey (yalnız data-yatay sayfada): tam ekran uyarı (uygulama arkada çalışmaya devam eder, döndürünce kaldığı yerden)
  if (phone && H.hasAttribute("data-yatay")) {
    const build = () => {
      if (document.getElementById('rotateGate')) return;
      const d = document.createElement('div');
      d.id = 'rotateGate'; d.className = 'rotate-gate'; d.setAttribute('role', 'alert');
      d.innerHTML = `<div class="rg-in">
        <svg class="rg-phone" viewBox="0 0 120 120" aria-hidden="true">
          <g class="rg-dev"><rect x="38" y="16" width="44" height="88" rx="9" fill="none" stroke="currentColor" stroke-width="5"/>
          <rect x="54" y="23" width="12" height="3" rx="1.5" fill="currentColor"/></g>
          <path class="rg-arrow" d="M96 40a40 40 0 0 1 4 34" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
          <path class="rg-arrow" d="m92 70 8 6 4-10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <b>Telefonu yan çevir</b>
        <span>Simülatör telefonda yatay ekranda kullanılır. Parkur ve kumanda yan çevrilince tam sığar.</span>
      </div>`;
      document.body.appendChild(d);
    };
    document.body ? build() : document.addEventListener('DOMContentLoaded', build);
    // Android'de tam ekrandayken yönü kilitle (iOS desteklemez; sessizce geç)
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    });
  }

  // iOS Safari: iki parmakla sayfa büyütmesini kapat (sahnenin kendi yakınlaştırması pointer olaylarıyla çalışır)
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));

  // Sayfa esnemesini kapat: dokunuş kaydırılabilir bir alanın içinde başlamadıysa sayfa hiç kaymaz.
  // (overscroll-behavior: none CSS'te de var; eski iOS sürümleri için bu bekçi.)
  const canScroll = (el, dy, dx) => {
    for (; el && el !== document.body && el !== H; el = el.parentElement) {
      if (el.matches && el.matches('input, textarea, select, [contenteditable], [data-touch]')) return true;
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if (dy === 0) return true;
        const top = el.scrollTop <= 0, bot = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((dy > 0 && !top) || (dy < 0 && !bot)) return true;
      }
      if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        if (dx === 0) return true;
        const l = el.scrollLeft <= 0, r = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
        if ((dx > 0 && !l) || (dx < 0 && !r)) return true;
      }
    }
    return false;
  };
  let sx = 0, sy = 0;
  document.addEventListener('touchstart', e => { if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (isPage() || !e.cancelable) return;
    if (e.touches.length > 1) { e.preventDefault(); return; }           // iki parmak: sayfa büyümesin
    const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    // Düğmeye dokunurken parmak birkaç piksel kayar: iOS Safari'de bu küçük kaymayı engellemek dokunuşun
    // "tıklama" olmasını da engeller (ör. oynat düğmesi çalışmaz). Küçük kaymaya dokunma, sayfa zaten sabit.
    if (ax < 12 && ay < 12) return;
    if (!canScroll(e.target, ay >= ax ? dy : 0, ax > ay ? dx : 0)) e.preventDefault();
  }, { passive: false });

  // Uzun basınca çıkan bağlam menüsü / görsel kaydet balonu sahnede ve düğmelerde çıkmasın
  document.addEventListener('contextmenu', e => {
    if (!touch || isPage()) return;
    if (!e.target.closest('input, textarea, [contenteditable]')) e.preventDefault();
  });

  // AÇILIŞ EKRANI (kullanıcı 2026-11-27 "açılırken boş arka plan yerine animasyonlu loading"): Velora'nın açılışıyla aynı dil.
  // Koyu Sahne zemin (#0b0b0c), limon daire gelir, V yukarıdan inip daireyi oyar, altında VELORA SAILING ve dalga.
  // İlk açılışta (oturumda bir kez) en az ~1 sn görünür; sonraki sayfa geçişlerinde 0,35 sn saydam bekler: sayfa o sürede
  // hazırsa hiç görünmez. Sayfa 'load' olunca solar; ne olursa olsun 8 sn'de kalkar. window.VeloraBoot.hide() ile erken kaldırılır.
  (function boot() {
    if (H.classList.contains('no-boot')) return;
    let first = true;
    try { first = !sessionStorage.getItem('velora.boot'); sessionStorage.setItem('velora.boot', '1'); } catch (e) { /* gizli sekme */ }
    const t0 = performance.now(), MIN = first ? 1100 : 0;
    const css = document.createElement('style');
    css.textContent = `
html{background:#0b0b0c}
.vboot{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#0b0b0c;color:#f4f4f5;
  font-family:"Barlow Condensed","Inter",system-ui,-apple-system,sans-serif;transition:opacity .45s cubic-bezier(.4,0,.2,1)}
.vboot.warm{animation:vbwarm .3s ease-out .35s both}
.vboot.out{opacity:0;pointer-events:none}
.vboot.out .vb-mark{transform:scale(1.08);transition:transform .45s cubic-bezier(.4,0,.2,1)}
.vb-mark{display:flex;flex-direction:column;align-items:center;margin-top:-4vh}
.vb-logo{width:min(26vmin,8.5rem);height:auto;overflow:visible}
.vb-disc{transform-origin:50px 52px;transform-box:view-box;animation:vbcore .6s cubic-bezier(.2,.9,.3,1.3) .1s both,vbbreath 2.4s ease-in-out 1.4s infinite}
.vb-v{transform-box:view-box;animation:vbvin .55s cubic-bezier(.2,.9,.3,1) .45s both}
.vb-word{margin:1.1rem 0 0;font-size:clamp(1.6rem,6vmin,2.4rem);font-weight:800;letter-spacing:.04em;text-transform:uppercase;line-height:1;
  animation:vbin .7s cubic-bezier(.2,.9,.3,1) .7s both}
.vb-word em{font-style:normal;color:#d4ff3a}
.vb-wave{display:block;width:min(40vmin,10rem);height:14px;margin-top:.9rem;animation:vbin .7s cubic-bezier(.2,.9,.3,1) .85s both}
.vb-wave path{fill:none;stroke:#d4ff3a;stroke-width:2.2;stroke-linecap:round;stroke-dasharray:14 10;animation:vbflow 1.1s linear infinite}
.vb-sub{margin:.55rem 0 0;font:500 .72rem/1 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#a1a1aa;
  animation:vbin .7s cubic-bezier(.2,.9,.3,1) .95s both,vbpulse 1.8s ease-in-out 1.7s infinite}
@keyframes vbcore{from{transform:scale(0);opacity:0}}
@keyframes vbvin{from{transform:translateY(-46px)}}
@keyframes vbbreath{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes vbin{from{opacity:0;transform:translateY(8px)}}
@keyframes vbpulse{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes vbflow{to{stroke-dashoffset:-24}}
@keyframes vbwarm{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.vboot *{animation:none!important}}`;
    const d = document.createElement('div');
    d.className = 'vboot' + (first ? '' : ' warm');
    d.setAttribute('role', 'status'); d.setAttribute('aria-label', 'Yükleniyor');
    d.innerHTML = `<div class="vb-mark">
      <svg class="vb-logo" viewBox="2 2 96 100" aria-hidden="true"><defs><mask id="vbCut" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="104">
        <rect width="100" height="104" fill="#fff"/><path class="vb-v" d="M26 19 L35.6 19 C 42 35, 46 47.8, 50 55.8 L59.6 19 L74 19 L56.4 67 L43.6 67 Z" fill="#000"/></mask></defs>
        <g mask="url(#vbCut)"><circle class="vb-disc" cx="50" cy="52" r="30" fill="#d4ff3a"/></g></svg>
      <p class="vb-word" lang="en">Velora <em>Sailing</em></p>
      <svg class="vb-wave" viewBox="0 0 160 14" preserveAspectRatio="none" aria-hidden="true"><path d="M2 7 Q 12 1 22 7 T 42 7 T 62 7 T 82 7 T 102 7 T 122 7 T 142 7 T 158 7"/></svg>
      <p class="vb-sub">Hazırlanıyor</p></div>`;
    (document.head || H).appendChild(css);
    H.appendChild(d);
    // gövde gelince açılış ekranını onun içine al (kendi başına <html> altında da çizilir; bu yalnız düzen için)
    document.addEventListener('DOMContentLoaded', () => { if (d.parentNode === H) document.body.appendChild(d); });
    let gone = false;
    const hide = () => {
      if (gone) return; gone = true;
      const wait = Math.max(0, MIN - (performance.now() - t0));
      setTimeout(() => requestAnimationFrame(() => {
        d.classList.add('out');
        setTimeout(() => d.remove(), 500);
      }), wait);
    };
    window.VeloraBoot = { hide };
    if (document.readyState === 'complete') hide(); else addEventListener('load', hide);
    setTimeout(hide, 8000);
    // geri tuşuyla önbellekten dönülünce (bfcache) açılış ekranı kalmasın
    addEventListener('pageshow', e => { if (e.persisted) d.remove(); });
  })();
})();

/* Ana sayfa "Canlı yarış" penceresi (kullanıcı 2026-11-23: "oda açmayı şimdilik ben yapabilirim; diğerleri açık oda varsa görür, katılır").
   - Açık odalar: Realtime Database 'sailLobby' (online.js'in yazdığı lobi), 12 saatten eski ya da kapalı odalar gösterilmez.
     Katıl → sim.html?oda=KOD (simülatörde şifre ve ad sorulur). ?net=yerel ile sahte veritabanı (localStorage) okunur.
   - "+ Oda aç" yalnız site sahibinde (SailAccess rolü 'sahip'); asıl yetki kontrolü online.js'te.
   - Antrenör yarışı: kod → havuz.html?kod=KOD. */
(function () {
  const $ = id => document.getElementById(id);
  const dlg = $('liveDlg'); if (!dlg) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yerel = new URLSearchParams(location.search).get('net') === 'yerel';
  const q = yerel ? '&net=yerel' : '';
  let lobby = null, err = '', started = false;

  const rooms = () => Object.entries(lobby || {}).map(([code, r]) => ({ code, ...r }))
    .filter(r => r && r.state === 'open' && (!r.at || Date.now() - r.at < 12 * 3600e3)).sort((a, b) => (b.at || 0) - (a.at || 0));
  const isOwner = () => { const a = window.SailAccess && SailAccess.account(); return !!(a && a.role === 'sahip'); };

  function render() {
    const list = rooms();
    $('liveSub').textContent = lobby == null ? 'Açık odalar, antrenör yarışı' : list.length ? `${list.length} açık oda` : 'Şu an açık oda yok';
    $('liveN').textContent = lobby == null ? '' : String(list.length);
    $('liveHost').classList.toggle('hidden', !isOwner());
    $('liveHost').href = 'sim.html?online' + q;
    const box = $('liveRooms');
    if (lobby == null) { box.innerHTML = `<p class="live-empty">${err ? 'Odalara ulaşılamadı. İnternetini kontrol et.' : 'Bakılıyor…'}</p>`; return; }
    if (!list.length) { box.innerHTML = '<p class="live-empty">Şu an açık oda yok. Antrenörün oda açınca burada görünür.</p>'; return; }
    box.innerHTML = list.map(r => `<a class="scn-row live-room" href="sim.html?oda=${encodeURIComponent(r.code)}${q}">
      <span class="row-t"><b>${esc(r.name || 'Oda ' + r.code)}</b><small>${esc(r.hostName || '')}${r.hostName ? ' · ' : ''}${r.n || 0}/${r.max || '?'} kişi · kod ${esc(r.code)}</small></span>
      <span class="row-tag live-tag">Açık</span><span class="live-join">Katıl</span></a>`).join('');
  }

  async function start() {
    if (started) return; started = true;
    if (yerel) {
      const read = () => { try { return (JSON.parse(localStorage.getItem('ps.netmock.v1')) || {}).sailLobby || {}; } catch (e) { return {}; } };
      lobby = read(); render();
      window.addEventListener('storage', e => { if (e.key === 'ps.netmock.v1') { lobby = read(); render(); } });
      return;
    }
    try {
      if (!window.VeloraAuth) await new Promise((ok, no) => {
        const t = setTimeout(() => no(new Error('velora-yok')), 12000);
        document.addEventListener('velora-ready', () => { clearTimeout(t); ok(); }, { once: true });
      });
      const { m, db } = await VeloraAuth.rtdb();
      m.onValue(m.ref(db, 'sailLobby'), s => { lobby = s.val() || {}; err = ''; render(); }, e => { err = String(e && e.code || e); lobby = null; render(); });
    } catch (e) { err = String(e && e.message || e); render(); }
  }

  const open = v => { dlg.classList.toggle('hidden', !v); if (v) { start(); render(); } };
  $('btnLive').addEventListener('click', e => { e.stopPropagation(); open(true); });
  $('btnLiveClose').addEventListener('click', () => open(false));
  dlg.addEventListener('click', e => { if (e.target === dlg) open(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlg.classList.contains('hidden')) open(false); });
  $('liveCodeIn').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('liveCode').addEventListener('submit', e => {
    e.preventDefault();
    const k = $('liveCodeIn').value.trim();
    location.href = 'havuz.html' + (k ? '?kod=' + encodeURIComponent(k) + q : (q ? '?' + q.slice(1) : ''));
  });
  document.addEventListener('sail-access', render);
  // açık oda sayısı kokpitte de görünsün: sayfa açıldıktan biraz sonra bağlan (ilk çizimi yavaşlatmasın)
  setTimeout(start, 1500);
})();

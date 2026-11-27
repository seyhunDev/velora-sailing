/* Yarışlar sayfası (havuz.html, kullanıcı 2026-11-14): antrenör yarışı burada oluşturur (js/yaris-kur.js, "Yarış oluştur");
   antrenörün bütün yarışları, katılımcılar, sonuçlar; her yarış İzle,
   2-4 yarış seçip Karşılaştır (simülatörde hayalet olarak üst üste). Sporcu kodla tek görevi açar.
   Veri: js/gorev-data.js (SailTaskData). İzleme simülatörde: sim.html?gorev=KOD&izle=ID · &kars=ID1,ID2 */
(function () {
  const D = window.SailTaskData;
  const { esc, clock, dateTxt, setupChips, resTxt, taskSetup, closed, board, isDenied } = D;
  const $ = id => document.getElementById(id);
  const H = { denied: false, be: null, tasks: [], runs: {}, open: {}, pick: {}, loading: true, err: '' };
  let arm = { key: '', at: 0 };                       // silme: iki dokunuş (3 sn içinde)

  async function backend() {
    if (H.be) return H.be;
    const b = D.makeBackend();
    try { await b.init(); H.be = b; return b; } catch (e) { return null; }
  }
  const coach = () => D.isCoach(H.be);
  if (D.mode === 'yerel') $('hvSim').href = 'sim.html?net=yerel';
  const params = new URLSearchParams(location.search);
  let wantNew = params.has('yeni');
  function openNew() {
    if (!window.SailRaceForm) return;
    SailRaceForm.open($('hvNew'), H.be, t => { H.denied = false; H.tasks = [t, ...H.tasks.filter(x => x.code !== t.code)]; H.runs[t.code] = []; H.err = ''; render(); }, () => { H.denied = true; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  $('hvNewBtn').addEventListener('click', openNew);

  async function load() {
    H.loading = true; render();
    const be = await backend();
    if (!be) { H.loading = false; H.err = 'Bağlantı kurulamadı. İnternetini kontrol et.'; render(); return; }
    if (coach()) {
      try { H.tasks = (await be.listMine(be.uid())).filter(t => t.kind !== 'taktik').sort((a, b) => (b.at || 0) - (a.at || 0)); }
      catch (e) { H.tasks = []; H.denied = isDenied(e); H.err = H.denied ? '' : 'Yarışlar okunamadı. İnternetini kontrol et.'; }
      await Promise.all(H.tasks.map(t => loadRuns(t.code)));
    }
    H.loading = false; render();
    if (wantNew && coach()) { wantNew = false; openNew(); if (params.has('yeni')) { params.delete('yeni'); history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '')); } }
  }
  async function loadRuns(code) {
    try { H.runs[code] = await H.be.listRuns(code); }
    catch (e) { try { H.runs[code] = H.be.uid() ? await H.be.listRuns(code, H.be.uid()) : []; } catch (x) { H.runs[code] = []; } }
  }
  async function openCode() {
    const code = $('hvCode').value.trim().toUpperCase();
    if (!D.CODE_OK(code)) { $('hvErr').textContent = 'Kod 6 harf/rakam olmalı.'; return; }
    $('hvErr').textContent = '';
    const be = await backend(); if (!be) { $('hvErr').textContent = 'Bağlantı kurulamadı.'; return; }
    let t = null; try { t = await be.getTask(code); } catch (e) { t = null; }
    if (t && t.kind === 'taktik') { $('hvErr').textContent = `${code} bir taktik kodu: Taktik oluştur → Taktiklerim → Kodla aç.`; return; }
    if (!t) { $('hvErr').textContent = `${code} kodlu yarış yok.`; return; }
    if (D.mode === 'firebase' && !be.uid()) await be.anon().catch(() => {});
    await loadRuns(code);
    H.tasks = [t, ...H.tasks.filter(x => x.code !== code)]; H.open[code] = true;
    render();
  }

  function taskCard(t) {
    const su = taskSetup(t) || {}, runs = H.runs[t.code] || [], rows = board(runs), open = !!H.open[t.code];
    const pick = H.pick[t.code] || [], best = rows.find(r => r.done);
    const own = H.be && t.owner === H.be.uid();
    const row = (r, i, rs) => `<tr class="${i == null ? 'sub' : ''}">
        <td class="tb-sel"><input type="checkbox" data-pick="${esc(t.code)}|${esc(r.id)}"${pick.includes(r.id) ? ' checked' : ''} title="Karşılaştırmaya ekle"></td>
        <td class="tb-no">${i == null ? '' : i + 1}</td>
        <td class="tb-name">${i == null ? `<small>${r.n}. deneme</small>` : `<b>${esc(r.name)}</b>${r.via === 'velora' ? '<span class="tb-v" title="Velora hesabı">V</span>' : ''}`}</td>
        <td>${clock(r.time)}</td><td>${esc(resTxt(r))}</td>
        <td>${r.startDist != null ? `${r.startDist < 0 ? 'erken ' : ''}${Math.abs(r.startDist).toFixed(1)} boy · ${(+r.startKn || 0).toFixed(1)} kn` : '–'}</td>
        <td>${r.pen || 0}${r.ocs ? ' · OCS' : ''}</td><td>${r.tacks ?? '–'}</td><td>${i == null || !rs ? '' : rs.length}</td><td>${esc(dateTxt(r.at))}</td>
        <td class="tb-acts"><a class="tb tb-watch" href="${esc(D.taskLink(t.code, '&izle=' + encodeURIComponent(r.id)))}"><svg class="ci"><use href="#i-eye"/></svg>İzle</a>${own ? `<button class="tb tb-watch hv-del" data-delrun="${esc(t.code)}|${esc(r.id)}" title="Bu denemeyi sil">Sil</button>` : ''}</td></tr>`;
    const table = rows.length ? `<div class="task-board-wrap"><table class="task-board">
        <thead><tr><th title="Karşılaştır">⇄</th><th>#</th><th>Sporcu</th><th>Süre</th><th>Sıra</th><th>Start</th><th>Ceza</th><th>Tramola</th><th>Deneme</th><th>Tarih</th><th></th></tr></thead>
        <tbody>${rows.map((x, i) => row(x.best, i, x.runs) + x.runs.filter(r => r !== x.best).map(r => row(r, null)).join('')).join('')}</tbody></table></div>`
      : '<p class="net-empty">Henüz gönderilmiş yarış yok.</p>';
    const cmpHref = pick.length >= 2 ? D.taskLink(t.code, '&kars=' + pick.map(encodeURIComponent).join(',')) : '';
    return `<article class="hv-task${open ? ' open' : ''}">
      <button class="hv-head" data-toggle="${esc(t.code)}">
        <span class="hv-codebox">${esc(t.code)}</span>
        <span class="hv-title"><b>${esc(t.name || 'Yarış')}</b><small>${esc(dateTxt(t.at))}${t.ownerName && !own ? ' · ' + esc(t.ownerName) : ''}${closed(t) ? ' · kapalı' : ''}</small></span>
        <span class="hv-stat"><b>${rows.length}</b><small>sporcu</small></span>
        <span class="hv-stat"><b>${runs.length}</b><small>yarış</small></span>
        <span class="hv-stat hv-best"><b>${best ? clock(best.best.time) : '–'}</b><small>${best ? esc(best.best.name) : 'en iyi'}</small></span>
        <span class="hv-chev">${open ? '▾' : '▸'}</span>
      </button>
      ${open ? `<div class="hv-body">
        <div class="rec-sum">${setupChips(su)}<span class="rc">${D.triesOf(t)} deneme hakkı</span><span class="rc">${{ all: 'tekrarları herkes görür', after: 'gönderen görür', coach: 'yalnız antrenör görür' }[t.vis] || ''}</span>${t.due ? `<span class="rc">son: ${esc(dateTxt(t.due))}</span>` : ''}</div>
        ${t.note ? `<p class="task-note">${esc(t.note)}</p>` : ''}
        <div class="hv-actions">
          <a class="tb primary" href="${esc(D.taskLink(t.code))}"><svg class="ci"><use href="#i-play"/></svg>Yarış sayfası</a>
          ${own ? `<a class="tb" href="${esc(D.taskLink(t.code, '&sporcu=1'))}" title="Sporcunun gördüğü kartı ve yarışı aç (sana hak sınırı yok)"><svg class="ci"><use href="#i-eye"/></svg>Sporcu gibi aç</a>` : ''}
          ${own ? `<button class="tb" data-copy="${esc(D.taskLink(t.code))}">Bağlantıyı kopyala</button>` : ''}
          ${runs.length > 1 ? (cmpHref ? `<a class="tb primary" href="${esc(cmpHref)}">Karşılaştır (${pick.length})</a>` : `<span class="tb disabled">Karşılaştır: ⇄ ile 2-4 yarış seç</span>`) : ''}
          <button class="tb" data-reload="${esc(t.code)}">Yenile</button>
          ${own ? `<button class="tb hv-del" data-deltask="${esc(t.code)}" title="Yarışı ve gönderilen bütün denemeleri sil">Yarışı sil</button>` : ''}
        </div>
        ${table}
      </div>` : ''}
    </article>`;
  }
  // Firestore kuralı yayında değil / eski: site sahibine kurulum kartı, diğerlerine kısa not
  function setupCard() {
    if (!(window.SailAccess && SailAccess.role() === 'sahip')) return '<b>Yarışlar şu an açılamıyor.</b> Site sahibinin Firebase kurallarını güncellemesi gerekiyor; biraz sonra tekrar dene.';
    return `<b>Yarışlar için Firestore kuralı gerekli.</b>
      <ol class="hv-steps">
        <li>Kurallar Velora deposunda: <code>firestore.rules</code> (Velora Sailing bölümü). Orada: <code>pbcopy &lt; firestore.rules</code></li>
        <li><a href="https://console.firebase.google.com/project/${D.PROJECT}/firestore/rules" target="_blank" rel="noopener">Firebase konsolunda Firestore → Kurallar</a>: hepsini seç, yapıştır, <b>Yayınla</b>. 1 dakika bekle, bu sayfayı yenile.</li>
      </ol>
      <div class="hv-rules-h"><span>Velora Sailing bölümü (kontrol için)</span><button class="tb" id="hvCopyRules">Kopyala</button></div>
      <pre class="hv-rules" id="hvRules">${esc(D.rulesText())}</pre>`;
  }
  function render() {
    const note = $('hvNote'), list = $('hvList');
    const c = coach();
    $('hvNewBtn').classList.toggle('hidden', !c);
    if (H.denied && c) { note.className = 'hv-note hv-setup'; note.innerHTML = setupCard(); }
    else if (H.err) { note.className = 'hv-note'; note.innerHTML = esc(H.err); }
    else if (!H.loading && !c && !H.tasks.length) { note.className = 'hv-note'; note.innerHTML = window.SailAccess && SailAccess.role() === 'sahip' && D.mode === 'firebase' ? 'Bütün yarışlarını görmek için hesap menüsünden <b>Velora hesabıyla gir</b>.' : 'Antrenörünün gönderdiği bağlantıyı açabilir ya da kodu yukarıya yazabilirsin.'; }
    else note.className = 'hv-note hidden';
    list.innerHTML = H.loading ? '<p class="net-wait">Yükleniyor…</p>'
      : (c ? `<h2 class="hv-h2">Yarışlarım <small>${H.tasks.length}</small></h2>` : '') + (H.tasks.length ? H.tasks.map(taskCard).join('') : c ? '<p class="net-empty">Henüz yarış yok. Sağ üstteki <b>Yarış oluştur</b> ile ilk yarışını kur.</p>' : '');
  }

  $('hvList').addEventListener('click', async e => {
    const tg = e.target.closest('[data-toggle]'); if (tg) { H.open[tg.dataset.toggle] = !H.open[tg.dataset.toggle]; render(); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); cp.textContent = 'Kopyalandı'; } catch (x) { prompt('Kopyala:', cp.dataset.copy); } return; }
    const rl = e.target.closest('[data-reload]'); if (rl) { await loadRuns(rl.dataset.reload); render(); return; }
    const dt = e.target.closest('[data-deltask]'), dr = e.target.closest('[data-delrun]'), el = dt || dr;
    if (!el) return;
    const key = dt ? 'T' + dt.dataset.deltask : 'R' + dr.dataset.delrun;
    if (arm.key !== key || Date.now() - arm.at > 3000) { arm = { key, at: Date.now() }; el.textContent = 'Emin misin?'; el.classList.add('armed'); return; }
    arm = { key: '', at: 0 }; el.disabled = true; el.textContent = 'Siliniyor…';
    try {
      if (dt) { const code = dt.dataset.deltask; await H.be.deleteTask(code); H.tasks = H.tasks.filter(t => t.code !== code); delete H.runs[code]; delete H.pick[code]; }
      else { const [code, id] = dr.dataset.delrun.split('|'); await H.be.deleteRun(code, id); H.runs[code] = (H.runs[code] || []).filter(r => r.id !== id); H.pick[code] = (H.pick[code] || []).filter(x => x !== id); }
    } catch (x) { H.err = isDenied(x) ? 'Silinemedi: yetki yok (Firestore kuralı güncel mi?).' : 'Silinemedi. İnternetini kontrol et.'; }
    render();
  });
  $('hvList').addEventListener('change', e => {
    const v = e.target.dataset.pick; if (!v) return;
    const [code, id] = v.split('|'), a = H.pick[code] || (H.pick[code] = []), i = a.indexOf(id);
    if (e.target.checked && i < 0) { if (a.length >= 4) { e.target.checked = false; return; } a.push(id); }
    if (!e.target.checked && i >= 0) a.splice(i, 1);
    render();
  });
  $('hvOpen').addEventListener('click', openCode);
  $('hvNote').addEventListener('click', async e => {
    if (e.target.id !== 'hvCopyRules') return;
    const t = $('hvRules').textContent;
    try { await navigator.clipboard.writeText(t); e.target.textContent = 'Kopyalandı'; } catch (x) { prompt('Kopyala:', t); }
  });
  $('hvCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('hvCode').addEventListener('keydown', e => { if (e.key === 'Enter') openCode(); });
  document.addEventListener('sail-access', () => { H.be = null; load(); });
  load();
  // ana sayfadaki Canlı yarış penceresinden: havuz.html?kod=K7M2QX → kodu yaz, aç
  const kod0 = (params.get('kod') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (kod0) { $('hvCode').value = kod0; setTimeout(openCode, 300); }
})();

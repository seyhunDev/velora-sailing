/* Görevler: antrenör yarış kurar ve sporculara gönderir; sporcular yarışır, yarışını gönderir; sıralama ve tekrar
   (sim.html, sim.js ve online.js'ten sonra yüklenir; kullanıcı 2026-11-14).

   Akış
   - Antrenör yarışı simülatörde DEĞİL, Yarışlar sayfasında (havuz.html → js/yaris-kur.js) oluşturur (kullanıcı 2026-11-14).
     Yarış 6 harfli kod + bağlantı alır: sim.html?gorev=KOD. "Simülatörde dene" → sim.html?taslak=1 (gönderilmez).
   - Sporcu bağlantıyı açar: yarış kartı (bilgi, ipuçları) → Yarışa başla. Kurulum kilitli, saat gerçek zamanda, teknesini
     elle sürer. Teknesi bitirince sonuç → "Antrenörüme gönder". Velora hesabıyla girdiyse o hesapla, değilse adıyla
     (Firebase anonim giriş) gönderir.
   - Yarış sayfasında sıralama (en iyi süre), her yarış İzle ile tekrar oynar (kurulum görevden, işlemler kayıttan).

   Veri: Firestore (sesliasistan-3e95a) → VeloraAuth.firestore().
     sailChallenges/{KOD}            { v, code, name, note, hints, owner, ownerName, at, due, tries, vis, state, cls, boats, windKn, setup (JSON) }
     sailChallenges/{KOD}/runs/{uid_n} { v, uid, n, name, via, at, fin, dsq, boats, time, pen, ocs, startDist, startKn, tacks, rec (JSON {ops}) }
   Kurallar (deneme sınırı, son tarih, kim okur) Firestore kurallarında: rulesText(). Kurulum kartı Görev → Kurulum.
   Test: sim.html?net=yerel → localStorage'da sahte veritabanı (kurallar yok, sınırları uygulama denetler). */
(function () {
  const api = window.SimApi; if (!api) return;
  const S = api.S;
  const $ = id => document.getElementById(id);
  const D = window.SailTaskData;
  const { esc, acc, store, PROJECT, mode, isDenied, clock, dateTxt, planLines, setupChips, resTxt, taskSetup, closed } = D;
  const html = s => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };
  const toast = m => api.toast(m);
  const track = (ev, data) => { try { if (window.SailTrack) SailTrack.log(ev, data); } catch (e) { /* yok */ } };
  const NAME = 'ps.task.name';
  const params = new URLSearchParams(location.search);
  const CODE_OK = D.CODE_OK;

  let be = null, beErr = '';
  async function backend() {
    if (be) return be;
    const b = D.makeBackend();
    try { await b.init(); be = b; beErr = ''; return be; }
    catch (e) { beErr = (e && (e.code || e.message)) || 'bağlantı yok'; return null; }
  }
  const isCoach = () => D.isCoach(be);
  // ---------- Durum ----------
  const T = { view: 'home', code: '', task: null, runs: [], err: '', busy: false, result: null, sent: false, open: {} };
  const GHOST = ['#fb923c', '#38bdf8', '#a78bfa', '#4ade80'];
  T.pick = [];
  const myRuns = () => (be ? T.runs.filter(r => r.uid === be.uid()) : []);
  const triesLeft = () => !T.task || !T.task.tries ? Infinity : Math.max(0, T.task.tries - myRuns().length);

  // ---------- Arayüz ----------
  const btn = html('<button id="btnTask" class="tool task-tool" title="Antrenör yarışları: oluştur, gönder, sıralama ve tekrarlar"><svg><use href="#i-flag"/></svg><span class="lbl">Yarışlar</span></button>');
  const grp = document.querySelector('.sim-top .tool-group'); if (grp) grp.insertBefore(btn, grp.firstChild);
  const chip = html(`<div id="taskChip" class="task-chip hidden" aria-live="polite">
    <span class="tc-ic"><svg><use href="#i-flag"/></svg></span><span class="tc-txt" id="tcTxt">Yarış</span>
    <button class="tb tc-btn" id="tcOpen">Yarış</button>
    <button class="tb tc-btn tc-leave" id="tcLeave" title="Antrenör yarışından çık, kendi simülatörüne dön">Çık</button></div>`);
  const stage = document.querySelector('.stage'); stage.appendChild(chip);
  const hubUrl = extra => `havuz.html${extra || mode === 'yerel' ? '?' : ''}${[extra, mode === 'yerel' ? 'net=yerel' : ''].filter(Boolean).join('&')}`;
  const dlg = html(`<div id="taskDlg" class="picker dlg hidden net-dlg task-dlg" role="dialog" aria-modal="true" aria-labelledby="taskTitle">
    <div class="picker-panel dlg-panel wide">
      <div class="picker-head"><div><h2 id="taskTitle">Görevler</h2><div class="picker-sub" id="taskSub"></div></div>
        <button class="icon" id="taskClose" title="Kapat (Esc)"><svg><use href="#i-close"/></svg></button></div>
      <div class="net-body" id="taskBody"></div>
    </div></div>`);
  stage.appendChild(dlg);
  const body = $('taskBody');
  const dlgOpen = () => !dlg.classList.contains('hidden');
  function show(v) { dlg.classList.toggle('hidden', !v); if (v) render(); }

  function render() {
    chipUpdate();
    if (!dlgOpen()) return;
    const v = T.view, t = T.task;
    const titles = { home: 'Antrenör yarışları', task: t ? t.name : 'Yarış', end: 'Yarış bitti', setup: 'Antrenör yarışları · kurulum', wait: 'Antrenör yarışları' };
    $('taskTitle').textContent = titles[v] || 'Görevler';
    $('taskSub').textContent = v === 'task' || v === 'end' ? (t ? `Kod ${t.code}${t.ownerName ? ' · antrenör ' + t.ownerName : ''}` : '')
      : 'Antrenörün gönderdiği yarışı koş, yarışını gönder, tekrarları izle';
    body.innerHTML = v === 'wait' ? `<p class="net-wait">${esc(T.err || 'Yükleniyor…')}</p>`
      : v === 'task' ? taskHtml() : v === 'end' ? endHtml() : v === 'setup' ? setupHtml() : homeHtml();
  }
  function chipUpdate() {
    const st = api.st, on = !!st.task;
    chip.classList.toggle('hidden', !on);
    btn.classList.toggle('on', on);
    if (!on) return;
    const w = st.task.watch;
    $('tcTxt').textContent = w === 'Karşılaştırma' ? `Karşılaştırma · ${(st.ghosts || []).length} yarış` : w ? `Tekrar: ${w}` : st.task.preview ? 'Deneme: yarış taslağı' : `${st.task.code} · ${st.task.name || ''}`;
    $('tcOpen').textContent = w ? 'Sıralama' : st.task.preview ? 'Forma dön' : 'Yarış';
    $('tcLeave').classList.toggle('hidden', !!st.task.preview);
  }

  // giriş: görev kodu + (antrenör) görevlerim
  function homeHtml() {
    const coach = isCoach();
    return `<div class="net-cols"><div class="net-col">
        <div class="net-h">Yarış kodu</div>
        <p class="dlg-note">Antrenörünün gönderdiği bağlantıyı aç ya da 6 harfli kodu yaz.</p>
        <input id="taskCode" class="name-in dlg-in net-code" maxlength="6" autocomplete="off" spellcheck="false" value="${esc(T.code || '')}" placeholder="K7M2QX">
        <p class="net-err" id="taskErr">${esc(T.err)}</p>
        <button class="tb primary net-go" data-act="openCode" ${T.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-check"/></svg>Yarışı aç</button>
      </div><div class="net-col">
        <div class="net-h">${coach ? 'Yarışlarım' : 'Antrenör yarışı nedir?'}</div>
        ${coach ? '<p class="dlg-note">Yarış oluşturma, bağlantı gönderme, sonuçlar ve silme <b>Yarışlar</b> sayfasında.</p>'
          : '<p class="dlg-note">Antrenörün bir yarış kurup sana gönderir: aynı filo, aynı rüzgar ve sağanaklar. Sen tekneni elle sürersin, yarışını gönderirsin; yarış sayfasında sıralamayı ve tekrarları görürsün.</p>'}
        <div class="task-links"><a class="tb" href="${hubUrl()}">Yarışlar sayfası</a>${coach ? `<a class="tb primary" href="${hubUrl('yeni=1')}">Yarış oluştur</a><button class="tb task-setup-link" data-act="setup">Firebase kurulumu</button>` : ''}</div>
      </div></div>`;
  }

  const taskLink = code => D.taskLink(code);

  // ---------- Yarış sayfası: kart + sıralama ----------
  function taskHtml() {
    const t = T.task, su = taskSetup(t), own = be && t.owner === be.uid(), left = triesLeft(), shut = closed(t);
    const hints = t.hints !== false ? planLines(su.plan) : [];
    const mine = myRuns(), rows = D.board(T.runs);
    const canSee = own || t.vis === 'all' || (t.vis === 'after' && mine.length);
    const runRow = (r, i, rs) => `<tr class="${be && r.uid === be.uid() ? 'me' : ''}${i == null ? ' sub' : ''}">
        <td class="tb-sel"><label title="Karşılaştırmaya ekle"><input type="checkbox" data-pick="${esc(r.id)}"${T.pick.includes(r.id) ? ' checked' : ''}></label></td>
        <td class="tb-no">${i == null ? '' : i + 1}</td>
        <td class="tb-name">${i == null ? `<small>${r.n}. deneme</small>` : `${rs && rs.length > 1 ? `<button class="tb-exp" data-exp="${esc(r.uid)}" title="Bütün denemeler">${T.open[r.uid] ? '▾' : '▸'}</button>` : ''}<b>${esc(r.name)}</b>${r.via === 'velora' ? '<span class="tb-v" title="Velora hesabı">V</span>' : ''}`}</td>
        <td>${clock(r.time)}</td><td>${esc(resTxt(r))}</td>
        <td title="Start anında hatta uzaklık (boy) ve hız">${r.startDist != null ? `${r.startDist < 0 ? 'erken ' : ''}${Math.abs(r.startDist).toFixed(1)} boy · ${(+r.startKn || 0).toFixed(1)} kn` : '–'}</td>
        <td>${r.pen || 0}${r.ocs ? ' · OCS' : ''}</td><td>${r.tacks ?? '–'}</td>
        <td>${i == null || !rs ? '' : rs.length}</td>
        <td><button class="tb tb-watch" data-watch="${esc(r.id)}"><svg class="ci"><use href="#i-eye"/></svg>İzle</button></td></tr>`;
    const table = rows.length ? `<div class="task-board-wrap"><table class="task-board">
        <thead><tr><th title="Karşılaştır">⇄</th><th>#</th><th>Sporcu</th><th>Süre</th><th>Sıra</th><th>Start</th><th>Ceza</th><th>Tramola</th><th>Deneme</th><th></th></tr></thead>
        <tbody>${rows.map((x, i) => runRow(x.best, i, x.runs) + (T.open[x.best.uid] ? x.runs.filter(r => r !== x.best).map(r => runRow(r, null)).join('') : '')).join('')}</tbody></table></div>`
      : '<p class="net-empty">Henüz gönderilmiş yarış yok.</p>';
    return `<div class="task-card">
        <div class="rec-sum">${setupChips(su)}<span class="rc">${t.tries ? `${t.tries} deneme hakkı` : 'sınırsız deneme'}</span>${t.due ? `<span class="rc">son: ${esc(dateTxt(t.due))}</span>` : ''}${shut ? '<span class="rc bad">kapandı</span>' : ''}</div>
        ${t.note ? `<p class="task-note">${esc(t.note)}</p>` : ''}
        ${hints.length ? `<div class="net-h">İpuçları</div><ul class="task-hints">${hints.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        <div class="dlg-actions task-go">
          ${own ? `<a class="tb" href="${hubUrl()}">Yarışlar</a><button class="tb" data-act="copy">Bağlantıyı kopyala</button><button class="tb" data-act="${t.state === 'closed' ? 'reopen' : 'close'}">${t.state === 'closed' ? 'Yeniden aç' : 'Yarışı kapat'}</button><button class="tb task-del" data-delcode="${esc(t.code)}" title="Yarışı ve gönderilen denemeleri sil">Sil</button>` : ''}
          ${shut ? '' : left > 0 ? `<button class="tb primary net-go" data-act="start"><svg class="ci"><use href="#i-play"/></svg>${mine.length ? 'Yeniden dene' : 'Yarışa başla'}${Number.isFinite(left) ? ` <small>(${left} hak)</small>` : ''}</button>` : '<span class="dlg-note">Deneme hakkın bitti.</span>'}
        </div>
      </div>
      <div class="net-h">Sıralama <small>${T.runs.length ? `${rows.length} sporcu · ${T.runs.length} yarış` : ''}</small> <button class="tb tb-reload" data-act="reload">Yenile</button>
        ${T.runs.length > 1 && canSee ? `<button class="tb tb-reload tb-cmp${T.pick.length >= 2 ? ' primary' : ''}" data-act="compare" ${T.pick.length >= 2 ? '' : 'disabled'} title="Seçili yarışları (2-4) aynı parkurda üst üste izle">Karşılaştır${T.pick.length ? ` (${T.pick.length})` : ''}</button>` : ''}</div>
      ${T.runs.length > 1 && canSee ? '<p class="dlg-note task-cmp-note">⇄ ile 2-4 yarış seç, <b>Karşılaştır</b>: sporcuların tekneleri aynı parkurda ortak saatle üst üste oynar.</p>' : ''}
      ${canSee ? table : `<p class="net-empty">${t.vis === 'after' ? 'Sıralama ve tekrarlar yarışını gönderince açılır.' : 'Sıralamayı yalnız antrenörün görüyor.'}</p>${mine.length ? `<div class="task-board-wrap"><table class="task-board"><tbody>${mine.map(r => runRow(r, null)).join('')}</tbody></table></div>` : ''}`}
      <p class="net-err" id="taskErr">${esc(T.err)}</p>`;
  }

  // ---------- Yarış bitti: gönder ----------
  function endHtml() {
    const r = T.result, t = T.task, preview = api.st.task && api.st.task.preview;
    const a = acc(), velora = mode === 'firebase' && a && a.via === 'velora' && be && be.uid() && !be.isAnon();
    const nm = store.get(NAME, '') || (a && a.name) || '';
    const left = triesLeft();
    const chips = [`Süre ${clock(r.time)}`, r.dsq ? r.dsq : r.fin ? `${r.fin}. / ${r.boats}` : 'bitirmedi',
      `start: ${r.startDist < 0 ? 'erken, hattın ' : 'hatta '}${Math.abs(r.startDist).toFixed(1)} boy${r.startDist < 0 ? ' üstünde' : ''} · ${r.startKn.toFixed(1)} kn`, `${r.tacks} tramola`];
    if (r.pen) chips.push(`${r.pen} ceza`); if (r.ocs) chips.push('OCS');
    return `<div class="task-end">
      <div class="rec-sum">${chips.map(c => `<span class="rc">${esc(c)}</span>`).join('')}</div>
      ${preview ? '<p class="dlg-note">Deneme: bu yarış gönderilmez. Forma dönüp yarışı oluşturabilir ya da yeniden deneyebilirsin.</p>'
        : T.sent ? '<p class="dlg-note"><b>Gönderildi.</b> Yarış sayfasında sıralamayı görebilirsin.</p>'
        : left <= 0 ? '<p class="dlg-note">Deneme hakkın bitti; bu yarış gönderilemez.</p>'
        : closed(t) ? '<p class="dlg-note">Yarış kapandı; bu yarış gönderilemez.</p>'
        : velora ? `<p class="dlg-note">Velora hesabınla gönderilecek: <b>${esc(a.name || '')}</b>${Number.isFinite(left) ? ` · ${left} hakkın var` : ''}.</p>`
        : `<label class="dlg-lbl" for="taskName">Adın (sıralamada görünür)</label><input id="taskName" class="name-in dlg-in" maxlength="24" autocomplete="off" value="${esc(nm)}">${Number.isFinite(left) ? `<p class="dlg-note">${left} hakkın var. Gönderdiğin her yarış saklanır, en iyisi sayılır.</p>` : ''}`}
      <p class="net-err" id="taskErr">${esc(T.err)}</p>
      <div class="dlg-actions">
        ${preview ? '<button class="tb" data-act="previewAgain">Yeniden dene</button><button class="tb primary" data-act="backForm">Forma dön</button>'
          : `<button class="tb" data-act="again">${T.sent ? 'Yeniden dene' : 'Göndermeden yeniden dene'}</button>
             ${T.sent ? '<button class="tb primary" data-act="toTask">Sıralama</button>' : left > 0 && !closed(t) ? `<button class="tb primary net-go" data-act="send" ${T.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-upload"/></svg>Antrenörüme gönder</button>` : '<button class="tb primary" data-act="toTask">Yarış sayfası</button>'}`}
      </div></div>`;
  }

  // ---------- Kurulum (Firestore kuralları + anonim giriş) ----------
  const rulesText = D.rulesText;
  function setupHtml() {
    const uid = be && be.uid();
    if (!uid || !isCoach()) return `<p class="net-empty">Antrenör yarışları henüz açılmadı (site sahibinin Firebase'de bir kez kurulum yapması gerekiyor).${beErr ? ` <small>(${esc(beErr)})</small>` : ''}</p>`;
    return `<div class="net-setup"><ol>
        <li><a href="https://console.firebase.google.com/project/${PROJECT}/firestore/rules" target="_blank" rel="noopener">Firebase konsolunda Firestore kurallarını aç</a>. Mevcut kuralları <b>silme</b>; aşağıdaki bloğu <code>match /databases/{database}/documents {</code> satırının hemen altına yapıştır → <b>Yayınla</b>.</li>
        <li><a href="https://console.firebase.google.com/project/${PROJECT}/authentication/providers" target="_blank" rel="noopener">Authentication → Sign-in method</a> → <b>Anonymous</b> (Anonim) → <b>Etkinleştir</b> → Kaydet. Hesabı olmayan sporcular yarışını adıyla bununla gönderir.</li>
        <li>Bu sayfayı yenile, <b>Yarışlar</b>'a yeniden dokun.</li></ol>
      <div class="net-rules-h"><span>Firestore kuralı (yarış oluşturma yetkisi: senin hesabın)</span><button class="tb" data-act="copyRules">Kopyala</button></div>
      <pre class="net-rules" id="taskRules">${esc(rulesText(uid))}</pre>
      <p class="dlg-note">Başka antrenörlere yetki: Firestore'da <code>sailCoaches/{uid}</code> belgesi oluştur (içi boş olabilir). ${beErr ? `Hata: ${esc(beErr)}` : ''}</p></div>
      <div class="dlg-actions"><button class="tb" data-act="home">Geri</button></div>`;
  }

  // ---------- İşlemler ----------
  const setErr = m => { T.err = m || ''; const x = $('taskErr'); if (x) x.textContent = T.err; };
  const busy = v => { T.busy = v; body.querySelectorAll('.net-go').forEach(b => { b.disabled = v; }); };
  function copy(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(msg), () => prompt('Kopyala:', text));
    else prompt('Kopyala:', text);
  }
  async function openDlg() {
    T.err = '';
    if (api.st.task && api.st.task.preview) { location.href = hubUrl('yeni=1'); return; }
    if (api.st.task && T.task) { T.view = 'task'; show(true); loadRuns(); return; }
    T.view = 'wait'; show(true);
    const b = await backend();
    if (!b) { T.view = 'home'; T.err = 'Bağlantı kurulamadı. İnternetini kontrol et.'; render(); return; }
    T.view = 'home'; render();
  }
  async function openTask(code, quiet) {
    code = String(code || '').toUpperCase().trim();
    if (!CODE_OK(code)) { setErr('Kod 6 harf/rakam olmalı.'); return; }
    T.code = code; T.err = ''; busy(true);
    if (!quiet) { T.view = 'wait'; render(); }
    const b = await backend();
    if (!b) { busy(false); T.view = 'home'; T.err = 'Bağlantı kurulamadı. İnternetini kontrol et.'; render(); return; }
    let t = null;
    try { t = await be.getTask(code); } catch (e) { t = null; T.err = isDenied(e) ? 'Yarış okunamadı: Firebase kuralları yayında mı?' : 'Yarış okunamadı. İnternetini kontrol et.'; }
    busy(false);
    if (!t) { T.view = 'home'; if (!T.err) T.err = `${code} kodlu yarış yok.`; render(); return; }
    if (!taskSetup(t)) { T.view = 'home'; T.err = 'Yarışın kurulumu bozuk.'; render(); return; }
    if (!T.task || T.task.code !== t.code) T.pick = [];
    T.task = t; T.view = 'task'; T.open = {}; render();
    track('task_open', { code });
    // hesabı olmayan sporcu: anonim oturum (deneme hakkı sayılabilsin); açılmazsa gönderirken yeniden denenir
    if (mode === 'firebase' && !be.uid()) await be.anon().catch(() => {});
    await loadRuns();
  }
  async function loadRuns() {
    const t = T.task; if (!t || !be) return;
    const me = be.uid();
    let runs = [];
    try { runs = await be.listRuns(t.code); }
    catch (e) { try { runs = me ? await be.listRuns(t.code, me) : []; } catch (x) { runs = []; } }
    if (T.task !== t) return;
    T.runs = runs;
    if (T.view === 'task' || T.view === 'end') render();
  }
  const sailorName = () => { const a = acc(); return (mode === 'firebase' && a && a.via === 'velora' ? a.name : store.get(NAME, '') || (a && a.name)) || 'Sen'; };
  function startTask() {
    const t = T.task; if (!t) return;
    if (triesLeft() <= 0) { setErr('Deneme hakkın bitti.'); return; }
    T.result = null; T.sent = false;
    const ok = api.taskStart({ code: t.code, name: t.name, setup: taskSetup(t), sailor: sailorName().slice(0, 18), onEnd: onEnd,
      msg: `${t.name} · start'a ${Math.round(((taskSetup(t).boat || {}).pre || 120) / 60)} dk · İskota Çek ile yelkeni doldur` });
    if (!ok) { setErr('Online yarıştayken bu yarış başlatılamaz.'); return; }
    show(false); chipUpdate();
    track('task_start', { code: t.code });
  }
  function onEnd(res) { T.result = res; T.sent = false; T.err = ''; T.view = 'end'; show(true); }
  async function send() {
    const t = T.task, r = T.result; if (!t || !r) return;
    const a = acc(), velora = mode === 'firebase' && a && a.via === 'velora' && be.uid() && !be.isAnon();
    let name = velora ? (a.name || 'Velora') : (($('taskName') && $('taskName').value) || '').replace(/\s+/g, ' ').trim();
    name = name.slice(0, 24);
    if (!name) { setErr('Adını yaz.'); const x = $('taskName'); if (x) x.focus(); return; }
    if (!velora) store.set(NAME, name);
    busy(true); setErr('');
    try {
      const uid = be.uid() || await be.anon();
      const mine = await be.listRuns(t.code, uid).catch(() => myRuns());
      const n = mine.reduce((m, x) => Math.max(m, x.n || 0), 0) + 1;
      if (t.tries && n > t.tries) { busy(false); setErr('Deneme hakkın bitti.'); return; }
      const { ops, ...sum } = r;
      await be.addRun(t.code, `${uid}_${n}`, { v: 1, uid, n, name, via: velora ? 'velora' : 'ad', ...sum, rec: JSON.stringify({ ops }) });
      T.sent = true; busy(false); render();
      toast('Yarışın antrenörüne gönderildi');
      track('task_send', { code: t.code, n, time: r.time, fin: r.fin });
      loadRuns();
    } catch (e) {
      busy(false);
      const c = String(e && (e.code || e.message));
      setErr(/operation-not-allowed|admin-restricted/.test(c) ? 'Gönderilemedi: adla gönderme henüz açık değil (antrenörün Firebase\'de Anonim girişi açmalı). Velora hesabın varsa onunla gir.'
        : isDenied(e) ? 'Gönderilemedi: yarış kapalı, süresi dolmuş ya da hakkın bitmiş olabilir.' : 'Gönderilemedi. İnternetini kontrol edip yeniden dene.');
    }
  }
  // Yarışlar sayfasındaki formdan "Simülatörde dene": taslak localStorage'da (ps.task.preview), gönderilmez
  function preview() {
    const d = store.get('ps.task.preview', null);
    if (!d || !d.setup || !Array.isArray(d.setup.fleet)) { toast('Denenecek yarış taslağı bulunamadı'); return; }
    T.task = { code: 'TASLAK', name: d.name || 'Yarış taslağı', note: d.note, hints: d.hints, setup: d.setup, tries: 0, state: 'open' };
    const ok = api.taskStart({ code: 'TASLAK', name: T.task.name, setup: d.setup, preview: true, sailor: sailorName().slice(0, 18), onEnd: res => { T.result = res; T.view = 'end'; show(true); },
      msg: 'Deneme: yarışı kendin koş · gönderilmez' });
    if (ok) { show(false); chipUpdate(); }
  }
  function compare() {
    const t = T.task, sel = T.pick.map(id => T.runs.find(x => x.id === id)).filter(Boolean).slice(0, 4);
    if (!t || sel.length < 2) { setErr('Karşılaştırmak için 2-4 yarış seç.'); return; }
    const runs = [];
    for (const [i, r] of sel.entries()) {
      let ops = null; try { ops = JSON.parse(r.rec).ops; } catch (e) { ops = null; }
      if (!Array.isArray(ops)) { setErr(`${r.name}: kayıt okunamadı.`); return; }
      runs.push({ ops, label: `${r.name.slice(0, 12)}${sel.filter(x => x.uid === r.uid).length > 1 ? ` ${r.n}` : ''}`, color: GHOST[i] });
    }
    const ok = api.taskCompare({ code: t.code, name: t.name, setup: taskSetup(t) }, runs);
    if (ok) { show(false); chipUpdate(); legendStart(); track('task_compare', { code: t.code, n: runs.length }); }
  }
  // Karşılaştırma göstergesi: renk, ad, son geçtiği şamandıra ve süresi / finiş (sahnenin sol üstü)
  const legend = html('<div id="ghostLegend" class="ghost-legend hidden" aria-live="off"></div>');
  stage.appendChild(legend);
  let legendTimer = 0;
  function legendStart() { clearInterval(legendTimer); legendTimer = setInterval(legendTick, 250); legendTick(); }
  function legendTick() {
    const st = api.st, gs = st.ghosts;
    if (!gs || !st.task) { legend.classList.add('hidden'); clearInterval(legendTimer); return; }
    const t = (st.sim || {}).t || 0;
    const rows = gs.map(g => { const done = g.splits.filter(s => s.t <= t); return { g, last: done[done.length - 1], n: done.length }; });
    // sıra: daha çok şamandıra geçen önde, eşitse daha erken geçen
    rows.sort((a, b) => b.n - a.n || (a.last ? a.last.rt : 1e9) - (b.last ? b.last.rt : 1e9));
    legend.innerHTML = rows.map(({ g, last }, i) => `<div class="gl-row"><span class="gl-no">${i + 1}</span><i style="background:${g.color}"></i><b>${esc(g.label)}</b><span>${last ? (last.mk === 'Finiş' ? `finiş ${clock(last.rt)}${last.dsq ? ' ' + esc(last.dsq) : ''}` : `${esc(last.mk)} · ${clock(last.rt)}`) : 'start öncesi'}</span></div>`).join('');
    legend.classList.remove('hidden');
  }
  function watch(id) {
    const r = T.runs.find(x => x.id === id), t = T.task; if (!r || !t) return;
    let ops = null; try { ops = JSON.parse(r.rec).ops; } catch (e) { ops = null; }
    if (!Array.isArray(ops)) { setErr('Bu yarışın kaydı okunamadı.'); return; }
    const ok = api.taskWatch({ code: t.code, name: t.name, setup: taskSetup(t) }, ops, `${r.name}${r.n > 1 ? ` (${r.n}. deneme)` : ''}`);
    if (ok) { show(false); chipUpdate(); track('task_watch', { code: t.code }); }
  }
  // Yarışı sil (antrenör): iki dokunuş; gönderilen denemeler de silinir
  let delArm = { code: '', at: 0 };
  async function delTask(code, btnEl) {
    if (delArm.code !== code || Date.now() - delArm.at > 3000) { delArm = { code, at: Date.now() }; btnEl.textContent = 'Emin misin?'; btnEl.classList.add('armed'); return; }
    delArm = { code: '', at: 0 }; btnEl.disabled = true; btnEl.textContent = 'Siliniyor…';
    try {
      await be.deleteTask(code);
      if (T.task && T.task.code === code) { T.task = null; T.runs = []; T.pick = []; T.view = 'home'; }
      if (api.st.task && api.st.task.code === code) leave();
      render(); toast(`${code} silindi`);
      track('task_delete', { code });
    } catch (e) { setErr(isDenied(e) ? 'Silinemedi: yetki yok (Firestore kuralı güncel mi?).' : 'Silinemedi. İnternetini kontrol et.'); render(); }
  }
  async function setState(state) {
    try { await be.updateTask(T.task.code, { state }); T.task.state = state; render(); toast(state === 'closed' ? 'Yarış kapandı: yeni yarış gönderilemez' : 'Yarış yeniden açıldı'); }
    catch (e) { setErr('Değiştirilemedi.'); }
  }
  function leave() {
    const prev = api.st.task && api.st.task.preview;
    api.taskStop(); chipUpdate();
    if (params.has('gorev')) { params.delete('gorev'); history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '')); }
    if (prev) location.href = hubUrl('yeni=1');
  }

  // ---------- Olaylar ----------
  body.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.delcode) { delTask(b.dataset.delcode, b); return; }
    if (b.dataset.code) { openTask(b.dataset.code); return; }
    if (b.dataset.watch) { watch(b.dataset.watch); return; }
    if (b.dataset.exp) { T.open[b.dataset.exp] = !T.open[b.dataset.exp]; render(); return; }
    const a = b.dataset.act; if (!a) return;
    if (a === 'openCode') openTask(($('taskCode') && $('taskCode').value) || '');
    else if (a === 'home') { T.view = 'home'; T.err = ''; render(); }
    else if (a === 'setup') { T.view = 'setup'; render(); }
    else if (a === 'copy') copy(taskLink(T.task.code), 'Bağlantı kopyalandı');
    else if (a === 'toTask') { T.view = 'task'; render(); loadRuns(); }
    else if (a === 'start') startTask();
    else if (a === 'again') { show(false); startTask(); }
    else if (a === 'send') send();
    else if (a === 'reload') loadRuns();
    else if (a === 'compare') compare();
    else if (a === 'close') setState('closed');
    else if (a === 'reopen') setState('open');
    else if (a === 'backForm') leave();
    else if (a === 'previewAgain') { show(false); api.taskStop(); preview(); }
    else if (a === 'copyRules') copy($('taskRules').textContent, 'Kural kopyalandı: Firestore kurallarına yapıştır');
  });
  body.addEventListener('change', e => {
    if (e.target.dataset.pick) {
      const id = e.target.dataset.pick, i = T.pick.indexOf(id);
      if (e.target.checked && i < 0) { if (T.pick.length >= 4) { e.target.checked = false; toast('En çok 4 yarış karşılaştırılır'); return; } T.pick.push(id); }
      if (!e.target.checked && i >= 0) T.pick.splice(i, 1);
      render(); return;
    }
  });
  body.addEventListener('input', e => {
    if (e.target.id === 'taskCode') { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); try { e.target.setSelectionRange(p, p); } catch (x) { /* yok */ } }
  });
  body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { const g = body.querySelector('.net-go'); if (g) g.click(); } });
  // üst çubuk "Yarışlar": yarıştayken yarış penceresi, değilken Yarışlar sayfası (oluşturma orada)
  btn.addEventListener('click', () => { if (api.st.task) openDlg(); else location.href = hubUrl(); });
  $('taskClose').addEventListener('click', () => show(false));
  $('tcOpen').addEventListener('click', () => openDlg());
  let leaveArm = 0;
  $('tcLeave').addEventListener('click', () => {
    if (api.st.task && !api.st.task.watch && !api.st.task.preview && !api.st.task.ended && Date.now() - leaveArm > 3000) { leaveArm = Date.now(); toast('Yarıştan çıkmak için yeniden dokun (bu yarış gönderilmez)'); return; }
    leave();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlgOpen()) { e.stopImmediatePropagation(); show(false); } }, true);
  document.addEventListener('sail-access', () => { if (dlgOpen() && T.view === 'home') render(); });

  // Bağlantıyla gelen: ?gorev=KOD → yarış kartı
  const fromLink = (params.get('gorev') || '').toUpperCase();
  if (params.has('taslak')) preview();
  else if (fromLink) {
    T.code = fromLink; show(true);
    // havuz sayfasından: &izle=ID → o yarışı oynat · &kars=ID1,ID2 → üst üste karşılaştır
    const izle = params.get('izle'), kars = (params.get('kars') || '').split(',').filter(Boolean);
    openTask(fromLink).then(() => {
      if (!T.task) return;
      if (kars.length >= 2) { T.pick = kars.filter(id => T.runs.some(r => r.id === id)).slice(0, 4); if (T.pick.length >= 2) compare(); else render(); }
      else if (izle && T.runs.some(r => r.id === izle)) watch(izle);
    });
  }
  window.SailTasks = { open: openDlg, openTask, rulesText };
})();

/* Görevler: antrenör yarış kurar ve sporculara gönderir; sporcular yarışır, yarışını gönderir; sıralama ve tekrar
   (sim.html, sim.js ve online.js'ten sonra yüklenir; kullanıcı 2026-11-14).

   Akış
   - Antrenör (Velora ile giren site sahibi): simülatörde filoyu, parkuru, rüzgarı, sınıfı, geri sayımı kurar → Görev →
     "Bu kurulumdan görev": ad, sporcuya bilgi notu, yarış akışı (zamanlı rüzgar dönüşleri, şamandıranın arkasından inen
     sağanaklar), deneme hakkı, son tarih, tekrarları kim görür. Görev 6 harfli kod + bağlantı alır: sim.html?gorev=KOD.
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
  const { esc, jcopy, acc, store, PROJECT, mode, isDenied, clock, parseClock, dateTxt, planLines, setupChips, resTxt, taskSetup, closed } = D;
  const html = s => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };
  const toast = m => api.toast(m);
  const track = (ev, data) => { try { if (window.SailTrack) SailTrack.log(ev, data); } catch (e) { /* yok */ } };
  const NAME = 'ps.task.name', DRAFT = 'ps.task.draft';
  const params = new URLSearchParams(location.search);
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPH[b % ALPH.length]).join('');
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
  const T = { view: 'home', code: '', task: null, runs: [], mine: [], list: null, err: '', busy: false, result: null, sent: false, open: {}, form: null, draft: false };
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
  // telefonda elle sürerken üst çubuk gizli: Görev düğmesi sahnede (Online düğmesinin yanında)
  const fab = html('<button id="taskFab" class="task-fab" title="Antrenör yarışları"><svg><use href="#i-flag"/></svg>Yarışlar</button>');
  const stage = document.querySelector('.stage'); stage.appendChild(chip); stage.appendChild(fab);
  fab.addEventListener('click', () => openDlg());
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
    const titles = { home: 'Antrenör yarışları', new: 'Yarış oluştur', made: 'Yarış hazır', task: t ? t.name : 'Yarış', end: 'Yarış bitti', setup: 'Antrenör yarışları · kurulum', wait: 'Antrenör yarışları' };
    $('taskTitle').textContent = titles[v] || 'Görevler';
    $('taskSub').textContent = v === 'task' || v === 'end' || v === 'made' ? (t ? `Kod ${t.code}${t.ownerName ? ' · antrenör ' + t.ownerName : ''}` : '')
      : v === 'new' ? 'Simülatördeki kurulum + yarış akışı + bilgi notu' : 'Antrenörün gönderdiği yarışı koş, yarışını gönder, tekrarları izle';
    body.innerHTML = v === 'wait' ? `<p class="net-wait">${esc(T.err || 'Yükleniyor…')}</p>`
      : v === 'new' ? newHtml() : v === 'made' ? madeHtml() : v === 'task' ? taskHtml() : v === 'end' ? endHtml() : v === 'setup' ? setupHtml() : homeHtml();
    if (v === 'new') formSync();
  }
  function chipUpdate() {
    const st = api.st, on = !!st.task;
    chip.classList.toggle('hidden', !on);
    btn.classList.toggle('on', on);
    if (!on) return;
    const w = st.task.watch;
    $('tcTxt').textContent = w === 'Karşılaştırma' ? `Karşılaştırma · ${(st.ghosts || []).length} yarış` : w ? `Tekrar: ${w}` : st.task.preview ? 'Ön izleme: yarış taslağı' : `${st.task.code} · ${st.task.name || ''}`;
    $('tcOpen').textContent = w ? 'Sıralama' : st.task.preview ? 'Forma dön' : 'Yarış';
  }

  // giriş: görev kodu + (antrenör) görevlerim
  function homeHtml() {
    const coach = isCoach();
    const list = T.list || [];
    return `<div class="net-cols"><div class="net-col">
        <div class="net-h">Yarış kodu</div>
        <p class="dlg-note">Antrenörünün gönderdiği bağlantıyı aç ya da 6 harfli kodu yaz.</p>
        <input id="taskCode" class="name-in dlg-in net-code" maxlength="6" autocomplete="off" spellcheck="false" value="${esc(T.code || '')}" placeholder="K7M2QX">
        <p class="net-err" id="taskErr">${esc(T.err)}</p>
        <button class="tb primary net-go" data-act="openCode" ${T.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-check"/></svg>Yarışı aç</button>
      </div><div class="net-col">
        ${coach ? `<div class="net-h">Yarışlarım</div>
          <button class="tb primary" data-act="new"><svg class="ci"><use href="#i-plus"/></svg>Bu kurulumdan yarış oluştur</button>
          ${T.list == null ? '<p class="net-wait">Yükleniyor…</p>' : list.length ? `<ul class="net-rooms task-list">${list.map(t => `<li class="task-li"><button data-code="${esc(t.id)}"><b>${esc(t.id)}</b><span>${esc(t.name || 'Yarış')}</span><small>${esc(dateTxt(t.at))}${closed(t) ? ' · kapalı' : ''}</small></button><button class="tb task-del" data-delcode="${esc(t.id)}" title="Yarışı ve gönderilen denemeleri sil">Sil</button></li>`).join('')}</ul>`
            : '<p class="net-empty">Henüz yarış yok. Simülatörde yarışı kur (filo, parkur, rüzgar), sonra <b>Bu kurulumdan yarış oluştur</b>.</p>'}
          <div class="task-links"><a class="tb" href="havuz.html${mode === 'yerel' ? '?net=yerel' : ''}">Yarış havuzu: bütün yarışlar ve sonuçlar</a>
          <button class="tb task-setup-link" data-act="setup">Firebase kurulumu</button></div>`
        : `<div class="net-h">Antrenör yarışı nedir?</div><p class="dlg-note">Antrenörün bir yarış kurup sana gönderir: aynı filo, aynı rüzgar ve sağanaklar. Sen tekneni elle sürersin, yarışını gönderirsin; yarış sayfasında sıralamayı ve tekrarları görürsün.</p>
          ${acc() && acc().role === 'sahip' && mode !== 'yerel' ? '<p class="dlg-note">Yarış oluşturmak için hesap menüsünden <b>Velora hesabıyla gir</b>.</p>' : ''}`}
      </div></div>`;
  }

  // ---------- Yeni görev formu ----------
  const TRIES = [[1, '1'], [3, '3'], [5, '5'], [0, 'Sınırsız']];
  const VIS = [['all', 'Herkes'], ['after', 'Gönderen görür'], ['coach', 'Yalnız ben']];
  const DUE = [[0, 'Yok'], [1, '1 gün'], [3, '3 gün'], [7, '1 hafta'], [14, '2 hafta']];
  const DEG = [5, 10, 15, 20, 25, 30], HOLD = [[20, '20 sn'], [30, '30 sn'], [45, '45 sn'], [60, '1 dk'], [90, '1,5 dk'], [120, '2 dk'], [0, 'kalıcı']];
  const POS = [[-0.8, 'Sol'], [-0.4, 'Orta-sol'], [0, 'Orta'], [0.4, 'Orta-sağ'], [0.8, 'Sağ']];
  const PASS = [[60, 'Hızlı (1 dk)'], [90, 'Orta (1,5 dk)'], [150, 'Yavaş (2,5 dk)']];
  const blankForm = () => ({ name: `${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} antrenman yarışı`, note: '', hints: true, tries: 3, vis: 'all', due: 7, plan: [] });
  function newHtml() {
    const f = T.form, su = api.currentSetup();
    const opt = (list, v) => list.map(([val, t]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const rows = f.plan.map((e, i) => `<li class="tp-row" data-i="${i}">
        <input class="dlg-in tp-at" data-f="at" value="${esc(clock(e.at).replace('−', '-'))}" title="Start'a göre zaman (dk:sn, eksi = start'tan önce)" inputmode="text">
        ${e.k === 'shift'
          ? `<span class="tp-k wind">Rüzgar</span>
             <select class="dlg-in" data-f="deg">${DEG.map(d => `<option value="${-d}"${e.deg === -d ? ' selected' : ''}>${d}° sola</option>`).reverse().join('')}${DEG.map(d => `<option value="${d}"${e.deg === d ? ' selected' : ''}>${d}° sağa</option>`).join('')}</select>
             <select class="dlg-in" data-f="hold">${opt(HOLD, e.hold)}</select>`
          : `<span class="tp-k gust">Sağanak</span>
             <select class="dlg-in" data-f="pos">${opt(POS, e.pos)}</select>
             <select class="dlg-in" data-f="size">${opt([['S', 'Küçük'], ['M', 'Orta'], ['L', 'Büyük']], e.size)}</select>
             <select class="dlg-in" data-f="pass">${opt(PASS, e.pass)}</select>`}
        <button class="icon sm" data-del="${i}" title="Sil"><svg><use href="#i-close"/></svg></button></li>`).join('');
    return `<div class="net-form task-form">
      <div class="rec-sum">${setupChips({ ...su, plan: f.plan })}</div>
      <p class="dlg-note">Filo, parkur, başlangıç rüzgarı, sınıf ve geri sayım simülatördeki şu anki kurulumdan alınır (teknen dahil: herkes aynı yerden başlar). Değiştirmek için pencereyi kapat, ayarla, yeniden aç.</p>
      <label class="dlg-lbl" for="tfName">Yarışın adı</label>
      <input id="tfName" class="name-in dlg-in" maxlength="40" value="${esc(f.name)}">
      <label class="dlg-lbl" for="tfNote">Sporcuya bilgi (yarış kartında görünür)</label>
      <textarea id="tfNote" class="dlg-in task-note-in" maxlength="600" rows="3" placeholder="Ör. Sağ taraftan sağanaklar iniyor; rüzgar start'tan sonra sağa dönüp geri gelecek. Hattın hangi ucu avantajlı?">${esc(f.note)}</textarea>
      <div class="net-h">Yarış akışı <small>zaman: start'a göre dk:sn (−0:30 = start'tan 30 sn önce)</small></div>
      ${f.plan.length ? `<ul class="tp-list">${rows}</ul>` : '<p class="net-empty">Akış yok: rüzgar ve sağanaklar kurulumdaki gibi sabit kalır.</p>'}
      <div class="tp-add">
        <button class="tb" data-act="addShift"><svg class="ci"><use href="#i-wind"/></svg>Rüzgar dönüşü</button>
        <button class="tb" data-act="addGust"><svg class="ci"><use href="#i-gust"/></svg>Sağanak</button>
        <button class="tb" data-act="addOsc" title="Start'tan sonra rüzgar 30 sn aralıkla sağa-sola salınır">Örnek: salınım</button>
      </div>
      <label class="task-check"><input type="checkbox" id="tfHints"${f.hints ? ' checked' : ''}> Akışı sporcuya ipucu olarak göster</label>
      ${FORM_SEGS.map(([k, lbl, list]) => `<div class="net-opt"><span class="net-ol">${lbl}</span><div class="seg" data-k="${k}">${list.map(([v, t]) => `<button data-v="${esc(v)}">${esc(t)}</button>`).join('')}</div></div>`).join('')}
      <p class="net-err" id="taskErr">${esc(T.err)}</p>
      <div class="dlg-actions">
        <button class="tb" data-act="home">Vazgeç</button>
        <button class="tb" data-act="preview" title="Akışı kendin dene (gönderilmez)"><svg class="ci"><use href="#i-play"/></svg>Kendin dene</button>
        <button class="tb primary net-go" data-act="create" ${T.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-check"/></svg>Yarışı oluştur</button>
      </div></div>`;
  }
  const FORM_SEGS = [['tries', 'Deneme hakkı', TRIES], ['vis', 'Tekrarları kim görür', VIS], ['due', 'Son tarih', DUE]];
  function formSync() {
    const f = T.form;
    body.querySelectorAll('.seg[data-k]').forEach(sg => [...sg.children].forEach(b => b.classList.toggle('on', b.dataset.v === String(f[sg.dataset.k]))));
  }
  function formRead() {
    const f = T.form; if (!f) return;
    if ($('tfName')) f.name = $('tfName').value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if ($('tfNote')) f.note = $('tfNote').value.trim().slice(0, 600);
    if ($('tfHints')) f.hints = $('tfHints').checked;
    store.set(DRAFT, f);
  }
  function addEv(e) { formRead(); T.form.plan.push(e); T.form.plan.sort((a, b) => a.at - b.at); store.set(DRAFT, T.form); render(); }
  const lastAt = () => T.form.plan.length ? Math.max(...T.form.plan.map(e => e.at)) : 0;

  function madeHtml() {
    const t = T.task, link = taskLink(t.code);
    return `<div class="task-made">
      <div class="task-code">${esc(t.code)}</div>
      <p>Sporcularına bu bağlantıyı gönder. Açınca yarış kartı çıkar, <b>Yarışa başla</b> ile aynı yarışı koşarlar.</p>
      <div class="task-link"><code>${esc(link)}</code></div>
      <div class="dlg-actions">
        <button class="tb" data-act="copy">Bağlantıyı kopyala</button>
        ${navigator.share ? '<button class="tb" data-act="share">Paylaş</button>' : ''}
        <button class="tb primary" data-act="toTask">Yarış sayfası</button>
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
          ${own ? `<a class="tb" href="havuz.html${mode === 'yerel' ? '?net=yerel' : ''}">Havuz</a><button class="tb" data-act="copy">Bağlantıyı kopyala</button><button class="tb" data-act="${t.state === 'closed' ? 'reopen' : 'close'}">${t.state === 'closed' ? 'Yeniden aç' : 'Yarışı kapat'}</button><button class="tb task-del" data-delcode="${esc(t.code)}" title="Yarışı ve gönderilen denemeleri sil">Sil</button>` : ''}
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
      ${preview ? '<p class="dlg-note">Ön izleme: bu yarış gönderilmez. Forma dönüp yarışı oluşturabilirsin.</p>'
        : T.sent ? '<p class="dlg-note"><b>Gönderildi.</b> Yarış sayfasında sıralamayı görebilirsin.</p>'
        : left <= 0 ? '<p class="dlg-note">Deneme hakkın bitti; bu yarış gönderilemez.</p>'
        : closed(t) ? '<p class="dlg-note">Yarış kapandı; bu yarış gönderilemez.</p>'
        : velora ? `<p class="dlg-note">Velora hesabınla gönderilecek: <b>${esc(a.name || '')}</b>${Number.isFinite(left) ? ` · ${left} hakkın var` : ''}.</p>`
        : `<label class="dlg-lbl" for="taskName">Adın (sıralamada görünür)</label><input id="taskName" class="name-in dlg-in" maxlength="24" autocomplete="off" value="${esc(nm)}">${Number.isFinite(left) ? `<p class="dlg-note">${left} hakkın var. Gönderdiğin her yarış saklanır, en iyisi sayılır.</p>` : ''}`}
      <p class="net-err" id="taskErr">${esc(T.err)}</p>
      <div class="dlg-actions">
        ${preview ? '<button class="tb primary" data-act="backForm">Forma dön</button>'
          : `<button class="tb" data-act="again">${T.sent ? 'Yeniden dene' : 'Göndermeden yeniden dene'}</button>
             ${T.sent ? '<button class="tb primary" data-act="toTask">Sıralama</button>' : left > 0 && !closed(t) ? `<button class="tb primary net-go" data-act="send" ${T.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-upload"/></svg>Antrenörüme gönder</button>` : '<button class="tb primary" data-act="toTask">Yarış sayfası</button>'}`}
      </div></div>`;
  }

  // ---------- Kurulum (Firestore kuralları + anonim giriş) ----------
  function rulesText(uid) {
    return `    // Velora Sailing görevleri: antrenör görev açar, sporcular yarışını gönderir (js/gorev.js)
    match /sailChallenges/{code} {
      function ch() { return get(/databases/$(database)/documents/sailChallenges/$(code)).data; }
      allow get: if true;
      allow list: if request.auth != null && resource.data.owner == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.owner == request.auth.uid
        && (request.auth.uid == '${uid}' || exists(/databases/$(database)/documents/sailCoaches/$(request.auth.uid)))
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
          || ch().vis == 'all'
          || (ch().vis == 'after' && exists(/databases/$(database)/documents/sailChallenges/$(code)/runs/$(request.auth.uid + '_1'))));
        allow delete: if request.auth != null && ch().owner == request.auth.uid;
      }
    }`;
  }
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
    if (api.st.task && api.st.task.preview) { T.view = 'new'; show(true); return; }
    if (api.st.task && T.task) { T.view = 'task'; show(true); loadRuns(); return; }
    T.view = 'wait'; show(true);
    const b = await backend();
    if (!b) { T.view = 'home'; T.err = 'Bağlantı kurulamadı. İnternetini kontrol et.'; render(); return; }
    T.view = 'home'; render();
    if (isCoach()) loadMine();
  }
  async function loadMine() {
    try { const l = await be.listMine(be.uid()); T.list = l.sort((a, b) => (b.at || 0) - (a.at || 0)); }
    catch (e) { T.list = []; if (isDenied(e)) { T.view = 'setup'; } else setErr('Yarışlar okunamadı.'); }
    if (T.view === 'home' || T.view === 'setup') render();
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
  async function create() {
    formRead();
    const f = T.form;
    if (!f.name) { setErr('Yarışa bir ad ver.'); return; }
    const su = api.currentSetup(); delete su.plan;
    if (!su.fleet.some(b => b.mine)) { setErr('Kurulumda senin teknen yok (Filo → teknem).'); return; }
    if (f.plan.length) su.plan = S.normPlan(f.plan);
    busy(true); setErr('');
    const b = await backend(); if (!b) { busy(false); setErr('Bağlantı kurulamadı.'); return; }
    const a = acc() || {};
    const data = { v: 1, name: f.name, note: f.note, hints: !!f.hints, owner: be.uid(), ownerName: (a.name || '').slice(0, 40),
      due: f.due ? Date.now() + f.due * 86400e3 : 0, tries: f.tries, vis: f.vis, state: 'open',
      cls: (su.boat || {}).cls || '', boats: su.fleet.length, windKn: (su.boat || {}).windKn || 0, setup: JSON.stringify(su) };
    try {
      let code = newCode();
      for (let i = 0; i < 4 && await be.getTask(code).catch(() => null); i++) code = newCode();
      await be.createTask(code, { ...data, code });
      T.task = { ...data, code, id: code, at: Date.now() }; T.runs = []; T.code = code;
      T.form = null; store.set(DRAFT, null);
      busy(false); T.view = 'made'; render(); T.list = null; loadMine();
      track('task_create', { code, boats: data.boats, plan: (su.plan || []).length });
    } catch (e) {
      busy(false);
      if (isDenied(e)) { T.view = 'setup'; render(); } else setErr('Yarış oluşturulamadı. İnternetini kontrol et.');
    }
  }
  function preview() {
    formRead();
    const su = api.currentSetup(); delete su.plan;
    if (T.form.plan.length) su.plan = S.normPlan(T.form.plan);
    const ok = api.taskStart({ code: 'TASLAK', name: T.form.name, setup: su, preview: true, sailor: sailorName().slice(0, 18), onEnd: res => { T.result = res; T.view = 'end'; show(true); },
      msg: 'Ön izleme: akışı dene · gönderilmez' });
    if (ok) show(false);
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
      if (T.list) T.list = T.list.filter(t => t.id !== code);
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
    if (prev) { T.view = 'new'; show(true); }
  }

  // ---------- Olaylar ----------
  body.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.delcode) { delTask(b.dataset.delcode, b); return; }
    if (b.dataset.code) { openTask(b.dataset.code); return; }
    if (b.dataset.watch) { watch(b.dataset.watch); return; }
    if (b.dataset.exp) { T.open[b.dataset.exp] = !T.open[b.dataset.exp]; render(); return; }
    if (b.dataset.del != null) { formRead(); T.form.plan.splice(+b.dataset.del, 1); store.set(DRAFT, T.form); render(); return; }
    const sg = b.closest('.seg[data-k]');
    if (sg && T.form) { const k = sg.dataset.k, v = b.dataset.v; T.form[k] = k === 'vis' ? v : +v; formRead(); formSync(); return; }
    const a = b.dataset.act; if (!a) return;
    if (a === 'openCode') openTask(($('taskCode') && $('taskCode').value) || '');
    else if (a === 'new') { T.form = store.get(DRAFT, null) || blankForm(); if (!Array.isArray(T.form.plan)) T.form.plan = []; T.err = ''; T.view = 'new'; render(); }
    else if (a === 'home') { T.view = 'home'; T.err = ''; render(); if (isCoach() && T.list == null) loadMine(); }
    else if (a === 'setup') { T.view = 'setup'; render(); }
    else if (a === 'addShift') { const at = T.form.plan.length ? lastAt() + 30 : 30; addEv({ k: 'shift', at, deg: 10, hold: 30 }); }
    else if (a === 'addGust') { const at = T.form.plan.length ? lastAt() + 20 : 0; addEv({ k: 'gust', at, pos: 0.4, size: 'M', pass: 90 }); }
    else if (a === 'addOsc') { const s0 = T.form.plan.length ? lastAt() + 30 : 20; [10, -10, 10, -10].forEach((d, i) => T.form.plan.push({ k: 'shift', at: s0 + i * 60, deg: d, hold: 30 })); addEv({ k: 'gust', at: s0 + 15, pos: -0.4, size: 'M', pass: 90 }); }
    else if (a === 'create') create();
    else if (a === 'preview') preview();
    else if (a === 'copy') copy(taskLink(T.task.code), 'Bağlantı kopyalandı');
    else if (a === 'share') navigator.share({ title: T.task.name, text: `Yarış: ${T.task.name}`, url: taskLink(T.task.code) }).catch(() => {});
    else if (a === 'toTask') { T.view = 'task'; render(); loadRuns(); }
    else if (a === 'start') startTask();
    else if (a === 'again') { show(false); startTask(); }
    else if (a === 'send') send();
    else if (a === 'reload') loadRuns();
    else if (a === 'compare') compare();
    else if (a === 'close') setState('closed');
    else if (a === 'reopen') setState('open');
    else if (a === 'backForm') leave();
    else if (a === 'copyRules') copy($('taskRules').textContent, 'Kural kopyalandı: Firestore kurallarına yapıştır');
  });
  body.addEventListener('change', e => {
    if (e.target.dataset.pick) {
      const id = e.target.dataset.pick, i = T.pick.indexOf(id);
      if (e.target.checked && i < 0) { if (T.pick.length >= 4) { e.target.checked = false; toast('En çok 4 yarış karşılaştırılır'); return; } T.pick.push(id); }
      if (!e.target.checked && i >= 0) T.pick.splice(i, 1);
      render(); return;
    }
    const row = e.target.closest('.tp-row'); if (!row || !T.form) return;
    const ev = T.form.plan[+row.dataset.i], f = e.target.dataset.f; if (!ev || !f) return;
    if (f === 'at') { const v = parseClock(e.target.value); if (v == null) { e.target.value = clock(ev.at).replace('−', '-'); toast('Zamanı dk:sn yaz (ör. 1:30, −0:20)'); return; } ev.at = Math.max(-600, Math.min(3600, v)); }
    else if (f === 'size') ev.size = e.target.value;
    else ev[f] = +e.target.value;
    formRead(); T.form.plan.sort((a, b) => a.at - b.at); store.set(DRAFT, T.form); render();
  });
  body.addEventListener('input', e => {
    if (e.target.id === 'taskCode') { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); try { e.target.setSelectionRange(p, p); } catch (x) { /* yok */ } }
  });
  body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { const g = body.querySelector('.net-go'); if (g) g.click(); } });
  btn.addEventListener('click', () => openDlg());
  $('taskClose').addEventListener('click', () => show(false));
  $('tcOpen').addEventListener('click', () => openDlg());
  let leaveArm = 0;
  $('tcLeave').addEventListener('click', () => {
    if (api.st.task && !api.st.task.watch && !api.st.task.preview && !api.st.task.ended && Date.now() - leaveArm > 3000) { leaveArm = Date.now(); toast('Yarıştan çıkmak için yeniden dokun (bu yarış gönderilmez)'); return; }
    leave();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlgOpen()) { e.stopImmediatePropagation(); show(false); } }, true);
  document.addEventListener('sail-access', () => { if (dlgOpen() && T.view === 'home') { render(); if (isCoach() && T.list == null) loadMine(); } });

  // Bağlantıyla gelen: ?gorev=KOD → yarış kartı
  const fromLink = (params.get('gorev') || '').toUpperCase();
  if (fromLink) {
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

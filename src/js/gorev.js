/* Görevler: antrenör yarış kurar ve sporculara gönderir; sporcular yarışır, yarışını gönderir; sıralama ve tekrar
   (sim.html, sim.js ve online.js'ten sonra yüklenir; kullanıcı 2026-11-14).

   Akış
   - Antrenör (Velora ile giren site sahibi): simülatörde filoyu, parkuru, rüzgarı, sınıfı, geri sayımı kurar → Görev →
     "Bu kurulumdan görev": ad, sporcuya bilgi notu, yarış akışı (zamanlı rüzgar dönüşleri, şamandıranın arkasından inen
     sağanaklar), deneme hakkı, son tarih, tekrarları kim görür. Görev 6 harfli kod + bağlantı alır: sim.html?gorev=KOD.
   - Sporcu bağlantıyı açar: görev kartı (bilgi, ipuçları) → Yarışa başla. Kurulum kilitli, saat gerçek zamanda, teknesini
     elle sürer. Teknesi bitirince sonuç → "Antrenörüme gönder". Velora hesabıyla girdiyse o hesapla, değilse adıyla
     (Firebase anonim giriş) gönderir.
   - Görev sayfasında sıralama (en iyi süre), her yarış İzle ile tekrar oynar (kurulum görevden, işlemler kayıttan).

   Veri: Firestore (sesliasistan-3e95a) → VeloraAuth.firestore().
     sailChallenges/{KOD}            { v, code, name, note, hints, owner, ownerName, at, due, tries, vis, state, cls, boats, windKn, setup (JSON) }
     sailChallenges/{KOD}/runs/{uid_n} { v, uid, n, name, via, at, fin, dsq, boats, time, pen, ocs, startDist, startKn, tacks, rec (JSON {ops}) }
   Kurallar (deneme sınırı, son tarih, kim okur) Firestore kurallarında: rulesText(). Kurulum kartı Görev → Kurulum.
   Test: sim.html?net=yerel → localStorage'da sahte veritabanı (kurallar yok, sınırları uygulama denetler). */
(function () {
  const api = window.SimApi; if (!api) return;
  const S = api.S;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = s => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };
  const jcopy = o => JSON.parse(JSON.stringify(o));
  const toast = m => api.toast(m);
  const acc = () => (window.SailAccess && SailAccess.account()) || null;
  const track = (ev, data) => { try { if (window.SailTrack) SailTrack.log(ev, data); } catch (e) { /* yok */ } };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* yok */ } }
  };
  const PROJECT = 'sesliasistan-3e95a', COL = 'sailChallenges', NAME = 'ps.task.name', DRAFT = 'ps.task.draft';
  const params = new URLSearchParams(location.search);
  const mode = params.get('net') === 'yerel' ? 'yerel' : 'firebase';
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPH[b % ALPH.length]).join('');
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
    };
  }
  let be = null, beErr = '';
  async function backend() {
    if (be) return be;
    const b = mode === 'yerel' ? mockBackend() : fireBackend();
    try { await b.init(); be = b; beErr = ''; return be; }
    catch (e) { beErr = (e && (e.code || e.message)) || 'bağlantı yok'; return null; }
  }
  const isCoach = () => { const a = acc(); return !!a && a.role === 'sahip' && (mode === 'yerel' || (a.via === 'velora' && be && be.uid() && !be.isAnon())); };
  const isDenied = e => /permission|insufficient|PERMISSION/i.test(String(e && (e.code || e.message)));

  // ---------- Biçim yardımcıları ----------
  const clock = sec => { if (sec == null || !Number.isFinite(sec)) return '–'; const neg = sec < 0, a = Math.abs(Math.round(sec)); return `${neg ? '−' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`; };
  const parseClock = txt => {
    const t = String(txt || '').trim().replace('−', '-'); if (!t) return 0;
    const m = /^(-)?(\d+)(?::(\d{1,2}))?$/.exec(t); if (!m) return null;
    const v = m[3] != null ? +m[2] * 60 + +m[3] : +m[2]; return m[1] ? -v : v;
  };
  const dateTxt = msv => msv ? new Date(msv).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' ' + new Date(msv).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
  const clsName = c => (S.CLASSES[c] ? S.CLASSES[c].name : c || '');
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
    if (c.flag && c.flag !== 'P') out.push(`${c.flag === 'S' ? 'siyah' : c.flag} bayrağı`);
    if ((su.gusts || []).length) out.push(`${su.gusts.length} sabit sağanak`);
    const sh = (su.plan || []).filter(e => e.k === 'shift').length, gu = (su.plan || []).filter(e => e.k === 'gust').length;
    if (sh) out.push(`${sh} rüzgar dönüşü`);
    if (gu) out.push(`${gu} inen sağanak`);
    return out.map(x => `<span class="rc">${esc(x)}</span>`).join('');
  }
  const resTxt = r => r.dsq ? r.dsq : r.fin ? `${r.fin}./${r.boats}` : 'bitirmedi';

  // ---------- Durum ----------
  const T = { view: 'home', code: '', task: null, runs: [], mine: [], list: null, err: '', busy: false, result: null, sent: false, open: {}, form: null, draft: false };
  const taskSetup = t => { try { return typeof t.setup === 'string' ? JSON.parse(t.setup) : t.setup; } catch (e) { return null; } };
  const myRuns = () => (be ? T.runs.filter(r => r.uid === be.uid()) : []);
  const triesLeft = () => !T.task || !T.task.tries ? Infinity : Math.max(0, T.task.tries - myRuns().length);
  const closed = t => !!t && (t.state === 'closed' || (t.due && Date.now() > t.due));

  // ---------- Arayüz ----------
  const btn = html('<button id="btnTask" class="tool task-tool" title="Görevler: antrenörün gönderdiği yarış · sıralama ve tekrarlar"><svg><use href="#i-flag"/></svg><span class="lbl">Görev</span></button>');
  const grp = document.querySelector('.sim-top .tool-group'); if (grp) grp.insertBefore(btn, grp.firstChild);
  const chip = html(`<div id="taskChip" class="task-chip hidden" aria-live="polite">
    <span class="tc-ic"><svg><use href="#i-flag"/></svg></span><span class="tc-txt" id="tcTxt">Görev</span>
    <button class="tb tc-btn" id="tcOpen">Görev</button>
    <button class="tb tc-btn tc-leave" id="tcLeave" title="Görevden çık, kendi simülatörüne dön">Çık</button></div>`);
  // telefonda elle sürerken üst çubuk gizli: Görev düğmesi sahnede (Online düğmesinin yanında)
  const fab = html('<button id="taskFab" class="task-fab" title="Görevler"><svg><use href="#i-flag"/></svg>Görev</button>');
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
    const titles = { home: 'Görevler', new: 'Yeni görev', made: 'Görev hazır', task: t ? t.name : 'Görev', end: 'Yarış bitti', setup: 'Görevler · kurulum', wait: 'Görevler' };
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
    $('tcTxt').textContent = w ? `Tekrar: ${w}` : st.task.preview ? 'Ön izleme: görev taslağı' : `Görev ${st.task.code} · ${st.task.name || ''}`;
    $('tcOpen').textContent = w ? 'Sıralama' : st.task.preview ? 'Forma dön' : 'Görev';
  }

  // giriş: görev kodu + (antrenör) görevlerim
  function homeHtml() {
    const coach = isCoach();
    const list = T.list || [];
    return `<div class="net-cols"><div class="net-col">
        <div class="net-h">Görev kodu</div>
        <p class="dlg-note">Antrenörünün gönderdiği bağlantıyı aç ya da 6 harfli kodu yaz.</p>
        <input id="taskCode" class="name-in dlg-in net-code" maxlength="6" autocomplete="off" spellcheck="false" value="${esc(T.code || '')}" placeholder="K7M2QX">
        <p class="net-err" id="taskErr">${esc(T.err)}</p>
        <button class="tb primary net-go" data-act="openCode" ${T.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-check"/></svg>Görevi aç</button>
      </div><div class="net-col">
        ${coach ? `<div class="net-h">Görevlerim</div>
          <button class="tb primary" data-act="new"><svg class="ci"><use href="#i-plus"/></svg>Bu kurulumdan yeni görev</button>
          ${T.list == null ? '<p class="net-wait">Yükleniyor…</p>' : list.length ? `<ul class="net-rooms task-list">${list.map(t => `<li><button data-code="${esc(t.id)}"><b>${esc(t.id)}</b><span>${esc(t.name || 'Görev')}</span><small>${esc(dateTxt(t.at))}${closed(t) ? ' · kapalı' : ''}</small></button></li>`).join('')}</ul>`
            : '<p class="net-empty">Henüz görev yok. Simülatörde yarışı kur (filo, parkur, rüzgar), sonra <b>Bu kurulumdan yeni görev</b>.</p>'}
          <button class="tb task-setup-link" data-act="setup">Firebase kurulumu</button>`
        : `<div class="net-h">Görev nedir?</div><p class="dlg-note">Antrenörün bir yarış kurup sana gönderir: aynı filo, aynı rüzgar ve sağanaklar. Sen tekneni elle sürersin, yarışını gönderirsin; görev sayfasında sıralamayı ve tekrarları görürsün.</p>
          ${acc() && acc().role === 'sahip' && mode !== 'yerel' ? '<p class="dlg-note">Görev oluşturmak için hesap menüsünden <b>Velora hesabıyla gir</b>.</p>' : ''}`}
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
      <label class="dlg-lbl" for="tfName">Görevin adı</label>
      <input id="tfName" class="name-in dlg-in" maxlength="40" value="${esc(f.name)}">
      <label class="dlg-lbl" for="tfNote">Sporcuya bilgi (görev kartında görünür)</label>
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
        <button class="tb primary net-go" data-act="create" ${T.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-check"/></svg>Görevi oluştur</button>
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
      <p>Sporcularına bu bağlantıyı gönder. Açınca görev kartı çıkar, <b>Yarışa başla</b> ile aynı yarışı koşarlar.</p>
      <div class="task-link"><code>${esc(link)}</code></div>
      <div class="dlg-actions">
        <button class="tb" data-act="copy">Bağlantıyı kopyala</button>
        ${navigator.share ? '<button class="tb" data-act="share">Paylaş</button>' : ''}
        <button class="tb primary" data-act="toTask">Görev sayfası</button>
      </div></div>`;
  }
  const taskLink = code => `${location.origin}${location.pathname}?gorev=${encodeURIComponent(code)}${mode === 'yerel' ? '&net=yerel' : ''}`;

  // ---------- Görev sayfası: kart + sıralama ----------
  function board() {
    const by = new Map();
    for (const r of T.runs) { const a = by.get(r.uid) || []; a.push(r); by.set(r.uid, a); }
    const rows = [...by.values()].map(rs => {
      rs.sort((a, b) => a.n - b.n);
      const ok = rs.filter(r => r.time != null && !r.dsq).sort((a, b) => a.time - b.time || (a.fin || 99) - (b.fin || 99));
      return { best: ok[0] || rs[rs.length - 1], runs: rs, done: !!ok.length };
    });
    rows.sort((a, b) => (b.done - a.done) || (a.best.time ?? 1e9) - (b.best.time ?? 1e9) || (a.best.fin || 99) - (b.best.fin || 99));
    return rows;
  }
  function taskHtml() {
    const t = T.task, su = taskSetup(t), own = be && t.owner === be.uid(), left = triesLeft(), shut = closed(t);
    const hints = t.hints !== false ? planLines(su.plan) : [];
    const mine = myRuns(), rows = board();
    const canSee = own || t.vis === 'all' || (t.vis === 'after' && mine.length);
    const runRow = (r, i, rs) => `<tr class="${be && r.uid === be.uid() ? 'me' : ''}${i == null ? ' sub' : ''}">
        <td class="tb-no">${i == null ? '' : i + 1}</td>
        <td class="tb-name">${i == null ? `<small>${r.n}. deneme</small>` : `${rs && rs.length > 1 ? `<button class="tb-exp" data-exp="${esc(r.uid)}" title="Bütün denemeler">${T.open[r.uid] ? '▾' : '▸'}</button>` : ''}<b>${esc(r.name)}</b>${r.via === 'velora' ? '<span class="tb-v" title="Velora hesabı">V</span>' : ''}`}</td>
        <td>${clock(r.time)}</td><td>${esc(resTxt(r))}</td>
        <td title="Start anında hatta uzaklık (boy) ve hız">${r.startDist != null ? `${r.startDist < 0 ? 'erken ' : ''}${Math.abs(r.startDist).toFixed(1)} boy · ${(+r.startKn || 0).toFixed(1)} kn` : '–'}</td>
        <td>${r.pen || 0}${r.ocs ? ' · OCS' : ''}</td><td>${r.tacks ?? '–'}</td>
        <td>${i == null || !rs ? '' : rs.length}</td>
        <td><button class="tb tb-watch" data-watch="${esc(r.id)}"><svg class="ci"><use href="#i-eye"/></svg>İzle</button></td></tr>`;
    const table = rows.length ? `<div class="task-board-wrap"><table class="task-board">
        <thead><tr><th>#</th><th>Sporcu</th><th>Süre</th><th>Sıra</th><th>Start</th><th>Ceza</th><th>Tramola</th><th>Deneme</th><th></th></tr></thead>
        <tbody>${rows.map((x, i) => runRow(x.best, i, x.runs) + (T.open[x.best.uid] ? x.runs.filter(r => r !== x.best).map(r => runRow(r, null)).join('') : '')).join('')}</tbody></table></div>`
      : '<p class="net-empty">Henüz gönderilmiş yarış yok.</p>';
    return `<div class="task-card">
        <div class="rec-sum">${setupChips(su)}<span class="rc">${t.tries ? `${t.tries} deneme hakkı` : 'sınırsız deneme'}</span>${t.due ? `<span class="rc">son: ${esc(dateTxt(t.due))}</span>` : ''}${shut ? '<span class="rc bad">kapandı</span>' : ''}</div>
        ${t.note ? `<p class="task-note">${esc(t.note)}</p>` : ''}
        ${hints.length ? `<div class="net-h">İpuçları</div><ul class="task-hints">${hints.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        <div class="dlg-actions task-go">
          ${own ? `<button class="tb" data-act="copy">Bağlantıyı kopyala</button><button class="tb" data-act="${t.state === 'closed' ? 'reopen' : 'close'}">${t.state === 'closed' ? 'Yeniden aç' : 'Görevi kapat'}</button>` : ''}
          ${shut ? '' : left > 0 ? `<button class="tb primary net-go" data-act="start"><svg class="ci"><use href="#i-play"/></svg>${mine.length ? 'Yeniden dene' : 'Yarışa başla'}${Number.isFinite(left) ? ` <small>(${left} hak)</small>` : ''}</button>` : '<span class="dlg-note">Deneme hakkın bitti.</span>'}
        </div>
      </div>
      <div class="net-h">Sıralama <small>${T.runs.length ? `${rows.length} sporcu · ${T.runs.length} yarış` : ''}</small> <button class="tb tb-reload" data-act="reload">Yenile</button></div>
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
      ${preview ? '<p class="dlg-note">Ön izleme: bu yarış gönderilmez. Forma dönüp görevi oluşturabilirsin.</p>'
        : T.sent ? '<p class="dlg-note"><b>Gönderildi.</b> Görev sayfasında sıralamayı görebilirsin.</p>'
        : left <= 0 ? '<p class="dlg-note">Deneme hakkın bitti; bu yarış gönderilemez.</p>'
        : closed(t) ? '<p class="dlg-note">Görev kapandı; bu yarış gönderilemez.</p>'
        : velora ? `<p class="dlg-note">Velora hesabınla gönderilecek: <b>${esc(a.name || '')}</b>${Number.isFinite(left) ? ` · ${left} hakkın var` : ''}.</p>`
        : `<label class="dlg-lbl" for="taskName">Adın (sıralamada görünür)</label><input id="taskName" class="name-in dlg-in" maxlength="24" autocomplete="off" value="${esc(nm)}">${Number.isFinite(left) ? `<p class="dlg-note">${left} hakkın var. Gönderdiğin her yarış saklanır, en iyisi sayılır.</p>` : ''}`}
      <p class="net-err" id="taskErr">${esc(T.err)}</p>
      <div class="dlg-actions">
        ${preview ? '<button class="tb primary" data-act="backForm">Forma dön</button>'
          : `<button class="tb" data-act="again">${T.sent ? 'Yeniden dene' : 'Göndermeden yeniden dene'}</button>
             ${T.sent ? '<button class="tb primary" data-act="toTask">Sıralama</button>' : left > 0 && !closed(t) ? `<button class="tb primary net-go" data-act="send" ${T.busy ? 'disabled' : ''}><svg class="ci"><use href="#i-upload"/></svg>Antrenörüme gönder</button>` : '<button class="tb primary" data-act="toTask">Görev sayfası</button>'}`}
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
    if (!uid || !isCoach()) return `<p class="net-empty">Görevler henüz açılmadı (site sahibinin Firebase'de bir kez kurulum yapması gerekiyor).${beErr ? ` <small>(${esc(beErr)})</small>` : ''}</p>`;
    return `<div class="net-setup"><ol>
        <li><a href="https://console.firebase.google.com/project/${PROJECT}/firestore/rules" target="_blank" rel="noopener">Firebase konsolunda Firestore kurallarını aç</a>. Mevcut kuralları <b>silme</b>; aşağıdaki bloğu <code>match /databases/{database}/documents {</code> satırının hemen altına yapıştır → <b>Yayınla</b>.</li>
        <li><a href="https://console.firebase.google.com/project/${PROJECT}/authentication/providers" target="_blank" rel="noopener">Authentication → Sign-in method</a> → <b>Anonymous</b> (Anonim) → <b>Etkinleştir</b> → Kaydet. Hesabı olmayan sporcular yarışını adıyla bununla gönderir.</li>
        <li>Bu sayfayı yenile, <b>Görev</b>'e yeniden dokun.</li></ol>
      <div class="net-rules-h"><span>Firestore kuralı (görev açma yetkisi: senin hesabın)</span><button class="tb" data-act="copyRules">Kopyala</button></div>
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
    catch (e) { T.list = []; if (isDenied(e)) { T.view = 'setup'; } else setErr('Görevler okunamadı.'); }
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
    try { t = await be.getTask(code); } catch (e) { t = null; T.err = isDenied(e) ? 'Görev okunamadı: Firebase kuralları yayında mı?' : 'Görev okunamadı. İnternetini kontrol et.'; }
    busy(false);
    if (!t) { T.view = 'home'; if (!T.err) T.err = `${code} kodlu görev yok.`; render(); return; }
    if (!taskSetup(t)) { T.view = 'home'; T.err = 'Görevin kurulumu bozuk.'; render(); return; }
    T.task = t; T.view = 'task'; T.open = {}; render();
    track('task_open', { code });
    // hesabı olmayan sporcu: anonim oturum (deneme hakkı sayılabilsin); açılmazsa gönderirken yeniden denenir
    if (mode === 'firebase' && !be.uid()) await be.anon().catch(() => {});
    loadRuns();
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
      msg: `Görev: ${t.name} · start'a ${Math.round(((taskSetup(t).boat || {}).pre || 120) / 60)} dk · İskota Çek ile yelkeni doldur` });
    if (!ok) { setErr('Online yarıştayken görev başlatılamaz.'); return; }
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
        : isDenied(e) ? 'Gönderilemedi: görev kapalı, süresi dolmuş ya da hakkın bitmiş olabilir.' : 'Gönderilemedi. İnternetini kontrol edip yeniden dene.');
    }
  }
  async function create() {
    formRead();
    const f = T.form;
    if (!f.name) { setErr('Göreve bir ad ver.'); return; }
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
      if (isDenied(e)) { T.view = 'setup'; render(); } else setErr('Görev oluşturulamadı. İnternetini kontrol et.');
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
  function watch(id) {
    const r = T.runs.find(x => x.id === id), t = T.task; if (!r || !t) return;
    let ops = null; try { ops = JSON.parse(r.rec).ops; } catch (e) { ops = null; }
    if (!Array.isArray(ops)) { setErr('Bu yarışın kaydı okunamadı.'); return; }
    const ok = api.taskWatch({ code: t.code, name: t.name, setup: taskSetup(t) }, ops, `${r.name}${r.n > 1 ? ` (${r.n}. deneme)` : ''}`);
    if (ok) { show(false); chipUpdate(); track('task_watch', { code: t.code }); }
  }
  async function setState(state) {
    try { await be.updateTask(T.task.code, { state }); T.task.state = state; render(); toast(state === 'closed' ? 'Görev kapandı: yeni yarış gönderilemez' : 'Görev yeniden açıldı'); }
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
    else if (a === 'share') navigator.share({ title: T.task.name, text: `Görev: ${T.task.name}`, url: taskLink(T.task.code) }).catch(() => {});
    else if (a === 'toTask') { T.view = 'task'; render(); loadRuns(); }
    else if (a === 'start') startTask();
    else if (a === 'again') { show(false); startTask(); }
    else if (a === 'send') send();
    else if (a === 'reload') loadRuns();
    else if (a === 'close') setState('closed');
    else if (a === 'reopen') setState('open');
    else if (a === 'backForm') leave();
    else if (a === 'copyRules') copy($('taskRules').textContent, 'Kural kopyalandı: Firestore kurallarına yapıştır');
  });
  body.addEventListener('change', e => {
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
    if (api.st.task && !api.st.task.watch && !api.st.task.preview && !api.st.task.ended && Date.now() - leaveArm > 3000) { leaveArm = Date.now(); toast('Görevden çıkmak için yeniden dokun (bu yarış gönderilmez)'); return; }
    leave();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlgOpen()) { e.stopImmediatePropagation(); show(false); } }, true);
  document.addEventListener('sail-access', () => { if (dlgOpen() && T.view === 'home') { render(); if (isCoach() && T.list == null) loadMine(); } });

  // Bağlantıyla gelen: ?gorev=KOD → görev kartı
  const fromLink = (params.get('gorev') || '').toUpperCase();
  if (fromLink) { T.code = fromLink; show(true); openTask(fromLink); }
  window.SailTasks = { open: openDlg, openTask, rulesText };
})();

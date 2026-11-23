/* Taktik oluştur (taktik.html): sahneye tekne, şamandıra, start hattı koy; rüzgarı döndür;
   tekneyi seçip suya dokunarak rotasını çiz; Oynat → senaryo oynatıcısında (index.html#u-…) kurallar ve pis rüzgarla oynar.
   Taslak her değişiklikte bu cihaza kaydedilir (en az bir tekne varsa). Biçim ve derleme: js/taktik-core.js */
(function () {
  const E = SailEngine, T = SailTaktik, NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const W = 1000, H = 680, PAD = 24;
  const clampX = x => Math.max(PAD, Math.min(W - PAD, x)), clampY = y => Math.max(PAD, Math.min(H - PAD, y));
  const svg = $('tkSvg');

  // ---------- Taslak ----------
  const qs = new URLSearchParams(location.search);
  let doc = null, fresh = false;
  if (qs.get('id')) doc = T.get(qs.get('id'));
  if (!doc && qs.get('t')) { doc = T.decode(qs.get('t')); if (doc) { doc.id = T.blank().id; fresh = true; } }   // paylaşılan: kendi kopyan
  if (!doc) { doc = T.blank(); fresh = true; }
  if (qs.get('id') || qs.get('t')) history.replaceState(null, '', location.pathname + (doc && !fresh ? '?id=' + doc.id : ''));
  let sel = null;          // { kind: 'boat'|'mark'|'pin'|'cb', i }
  // rota çizerken seyir: '' serbest (dokunduğun yer), orsa / apaz / genis / pupa (rüzgara göre açıya oturur)
  const SAIL_KEY = 'ps.taktik.sail';
  let sail = (() => { try { const v = localStorage.getItem(SAIL_KEY); return v === '' || T.SAILS[v] ? v : 'orsa'; } catch (e) { return 'orsa'; } })();
  const undo = [];         // geri al: önceki hâller (JSON)
  let last = JSON.stringify(doc);
  let prev = null;         // önizleme (hesaplanan yollar)

  // ---------- Kayıt (kendiliğinden) ----------
  let saveTimer = 0;
  function changed(opts) {
    const now = JSON.stringify(doc);
    if (now !== last && !(opts && opts.noUndo)) { undo.push(last); if (undo.length > 60) undo.shift(); }
    last = now;
    prev = null; render();
    clearTimeout(saveTimer);
    if (!doc.boats.length) { $('tkSaved').textContent = ''; return; }
    $('tkSaved').textContent = 'Kaydediliyor…';
    saveTimer = setTimeout(persist, opts && opts.now ? 0 : 500);
  }
  function persist() {
    clearTimeout(saveTimer);
    if (!doc.boats.length) return false;
    const ok = T.save(doc);
    $('tkSaved').textContent = ok ? 'Kaydedildi' : 'Kaydedilemedi';
    if (ok && !location.search.includes(doc.id)) history.replaceState(null, '', location.pathname + '?id=' + doc.id);
    return ok;
  }

  // ---------- Ölçek: telefonda dokunma noktaları büyür ----------
  let ui = 1;
  function measure() {
    const r = svg.getBoundingClientRect();
    const k = Math.min(r.width / W, r.height / H) || 1;          // 1 SVG birimi kaç ekran pikseli
    ui = Math.max(1, Math.min(2.4, 0.75 / k));
  }
  function toSvg(e) {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    return { x: q.x, y: q.y };
  }

  // ---------- Çizim ----------
  function drawWind() {
    const g = $('tkWind'); g.innerHTML = '';
    const w = doc.wind, d = E.fwd(w + 180), px = E.fwd(w + 90);
    const R = 700, sp = 95, len = 70;
    for (let i = 0; i * sp < 2 * R; i++) for (let j = 0; j * 160 < 2 * R; j++) {
      const lat = -R + i * sp + (j % 2) * 45, along = -R + j * 160;
      const cx = 500 + px.x * lat + d.x * along, cy = 340 + px.y * lat + d.y * along;
      if (cx < -40 || cx > W + 40 || cy < -40 || cy > H + 40) continue;
      el('line', { x1: cx - d.x * len / 2, y1: cy - d.y * len / 2, x2: cx + d.x * len / 2, y2: cy + d.y * len / 2, stroke: 'rgba(255,255,255,.12)', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
    }
    $('tkWindArrow').setAttribute('transform', `rotate(${w})`);
    $('tkWindDeg').textContent = `${Math.round(E.norm360(w))}°`;
    const sh = doc.shift;
    $('tkShift').innerHTML = sh ? `<b>${sh.d > 0 ? '↻' : '↺'} ${Math.abs(sh.d)}°</b><small>${sh.t}. sn</small>` : '<b>Dönüş</b><small>yok</small>';
    $('tkShift').classList.toggle('on', !!sh);
  }
  function drawCourse() {
    const g = $('tkCourse'); g.innerHTML = '';
    (doc.gusts || []).forEach((gu, i) => {
      const on = sel && sel.kind === 'gust' && sel.i === i;
      const gg = el('g', { 'data-k': 'gust', 'data-i': i, class: 'tk-drag' + (on ? ' on' : '') }, g);
      el('circle', { cx: gu.x, cy: gu.y, r: gu.r, fill: 'transparent' }, gg);
      E.drawGust(el, gg, { x: gu.x, y: gu.y, r: gu.r }, doc.wind, 0);
      if (on) el('circle', { cx: gu.x, cy: gu.y, r: gu.r + 4, fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, gg);
      // rüzgaraltına kayma yönü
      const d = E.fwd(doc.wind + 180), a = { x: gu.x + d.x * (gu.r + 6), y: gu.y + d.y * (gu.r + 6) }, b = { x: a.x + d.x * 34, y: a.y + d.y * 34 };
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: 'rgba(191,219,254,.6)', 'stroke-width': 2, 'stroke-dasharray': '4 4', 'pointer-events': 'none' }, gg);
    });
    if (doc.line) {
      const { pin, boat } = doc.line;
      el('line', { x1: pin.x, y1: pin.y, x2: boat.x, y2: boat.y, stroke: '#ffd166', 'stroke-width': 2, 'stroke-dasharray': '10 8', opacity: .9 }, g);
      const pn = el('g', { 'data-k': 'pin', class: 'tk-drag' + (sel && sel.kind === 'pin' ? ' on' : '') }, g);
      if (doc.line.pinBoat) {
        const c = E.pinBoatCenter(doc.line, doc.wind);
        el('circle', { cx: c.x, cy: c.y, r: 30 * ui, fill: 'transparent' }, pn);
        E.drawCommitteeBoat(el, pn).setAttribute('transform', E.pinBoatTransform(doc.line, doc.wind));
        el('text', { x: pin.x, y: pin.y + 60, 'text-anchor': 'middle', fill: '#ffd166', 'font-size': 12, 'paint-order': 'stroke', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 3 }, pn).textContent = 'Pin teknesi';
      } else {
        el('circle', { cx: pin.x, cy: pin.y, r: 22 * ui, fill: 'transparent' }, pn);
        el('circle', { cx: pin.x, cy: pin.y, r: 7, fill: '#ff8c42', stroke: '#fff', 'stroke-width': 1.5 }, pn);
        el('text', { x: pin.x, y: pin.y + 24, 'text-anchor': 'middle', fill: '#ffd166', 'font-size': 12 }, pn).textContent = 'Pin';
      }
      const cg = el('g', { 'data-k': 'cb', class: 'tk-drag' + (sel && sel.kind === 'cb' ? ' on' : '') }, g);
      el('circle', { cx: boat.x, cy: boat.y, r: 28 * ui, fill: 'transparent' }, cg);
      const cb = E.drawCommitteeBoat(el, cg);
      cb.setAttribute('transform', E.committeeBoatTransform(boat.x, boat.y, doc.wind));
      el('text', { x: boat.x + 14, y: boat.y + 60, 'text-anchor': 'middle', fill: '#ffd166', 'font-size': 12, 'paint-order': 'stroke', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 3 }, cg).textContent = 'Hakem botu';
    }
    doc.marks.forEach((m, i) => {
      const mg = el('g', { 'data-k': 'mark', 'data-i': i, class: 'tk-drag' + (sel && sel.kind === 'mark' && sel.i === i ? ' on' : '') }, g);
      if (m.zone) el('circle', { cx: m.x, cy: m.y, r: 150, fill: 'rgba(255,209,102,0.05)', stroke: '#ffd166', 'stroke-width': 1.5, 'stroke-dasharray': '6 6', 'pointer-events': 'none' }, mg);
      el('circle', { cx: m.x, cy: m.y, r: 24 * ui, fill: 'transparent' }, mg);
      if (sel && sel.kind === 'mark' && sel.i === i) el('circle', { cx: m.x, cy: m.y, r: 16, fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-dasharray': '4 3' }, mg);
      el('circle', { cx: m.x, cy: m.y, r: 8, fill: '#ff8c42', stroke: '#fff', 'stroke-width': 1.5 }, mg);
      el('line', { x1: m.x, y1: m.y - 8, x2: m.x, y2: m.y - 26, stroke: '#fff', 'stroke-width': 1.5 }, mg);
      el('path', { d: `M${m.x},${m.y - 26} l 12,4 l -12,4 z`, fill: '#ff8c42' }, mg);
    });
  }
  function drawRoutes() {
    const g = $('tkRoutes'); g.innerHTML = '';
    const h = $('tkHandles'); h.innerHTML = '';
    if (!prev) prev = T.preview(doc);
    doc.boats.forEach((b, i) => {
      const on = sel && sel.kind === 'boat' && sel.i === i;
      const tr = prev.tracks[i], pts = [];
      // hesaplanan yol (zikzaklar dahil): teknenin gerçekten gideceği yer
      for (let k = 0; k < tr.length; k += 4) pts.push(`${tr[k].x.toFixed(0)},${tr[k].y.toFixed(0)}`);
      if (b.route.length) el('polyline', { points: pts.join(' '), fill: 'none', stroke: b.color, 'stroke-width': on ? 3 : 2, opacity: on ? .95 : .6, 'stroke-linejoin': 'round' }, g);
      // her 2 sn bir küçük iz noktası (hız hissi)
      if (b.route.length) for (let t = 2; t < prev.scn.duration; t += 2) { const p = E.sampleTrack(tr, t); el('circle', { cx: p.x, cy: p.y, r: 2.6, fill: b.color, opacity: on ? .9 : .5 }, g); }
      // çizilen noktalar
      if (on) {
        const line = [b, ...b.route].map(p => `${p.x},${p.y}`).join(' ');
        el('polyline', { points: line, fill: 'none', stroke: '#fff', 'stroke-width': 1.5, 'stroke-dasharray': '5 6', opacity: .55 }, g);
      }
      // seçili teknede seyirli bacakların adı (Orsa, Apaz …) bacağın ortasında
      if (on) b.route.forEach((p, k) => {
        if (!T.SAILS[p.m]) return;
        const a = k ? b.route[k - 1] : b, mx = (a.x + p.x) / 2, my = (a.y + p.y) / 2, lbl = T.SAILS[p.m].label, w = lbl.length * 6.6 + 12;
        el('rect', { x: mx - w / 2, y: my - 9, width: w, height: 18, rx: 9, fill: 'rgba(255,255,255,.92)', 'pointer-events': 'none' }, g);
        el('text', { x: mx, y: my + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#0b1a33' }, g).textContent = lbl;
      });
      b.route.forEach((p, k) => {
        const pg = el('g', { 'data-k': 'pt', 'data-i': i, 'data-j': k, class: 'tk-drag' }, h);
        el('circle', { cx: p.x, cy: p.y, r: 18 * ui, fill: 'transparent' }, pg);
        el('circle', { cx: p.x, cy: p.y, r: (on ? 9 : 6) * Math.min(ui, 1.6), fill: on ? '#fff' : b.color, stroke: on ? b.color : '#fff', 'stroke-width': on ? 3 : 1.5 }, pg);
        if (on) el('text', { x: p.x, y: p.y + 4 * Math.min(ui, 1.6), 'text-anchor': 'middle', 'font-size': 10 * Math.min(ui, 1.6), 'font-weight': 800, fill: '#0b1a33', 'pointer-events': 'none' }, pg).textContent = k + 1;
      });
    });
    // kural hakemi: karşılaşma yerinde kural rozeti, temasta kırmızı halka
    for (const ev of prev.scn.refEvents || []) {
      if (ev.contact) {
        el('circle', { cx: ev.x, cy: ev.y, r: 22, fill: 'rgba(248,113,113,.18)', stroke: '#f87171', 'stroke-width': 2.5 }, g);
        el('text', { x: ev.x, y: ev.y + 5, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 900, fill: '#fecaca' }, g).textContent = '!';
      } else {
        const lbl = 'K' + ev.rule;
        el('rect', { x: ev.x - 16, y: ev.y - 10, width: 32, height: 20, rx: 6, fill: '#fbbf24', opacity: .95 }, g);
        el('text', { x: ev.x, y: ev.y + 4.5, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: '#1d1d1f' }, g).textContent = lbl;
      }
    }
    // kendiliğinden eklenen tramola noktaları
    for (const p of prev.scn.tackPts) {
      el('circle', { cx: p.x, cy: p.y, r: 11, fill: 'rgba(2,21,38,.55)', stroke: p.color, 'stroke-width': 1.5 }, g);
      el('text', { x: p.x, y: p.y + 4, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 800, fill: '#fff' }, g).textContent = 'T';
    }
  }
  function drawBoats() {
    const g = $('tkBoats'); g.innerHTML = '';
    doc.boats.forEach((b, i) => {
      const on = sel && sel.kind === 'boat' && sel.i === i;
      const sb = prev.scn.boats[i], h = sb.start.h;
      const bg = el('g', { 'data-k': 'boat', 'data-i': i, class: 'tk-drag' + (on ? ' on' : '') }, g);
      el('circle', { cx: b.x, cy: b.y, r: 32 * ui, fill: 'transparent' }, bg);
      if (on) el('circle', { cx: b.x, cy: b.y, r: 34, fill: 'rgba(255,255,255,.08)', stroke: '#fff', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, bg);
      const tg = el('g', { transform: `translate(${b.x},${b.y}) rotate(${h.toFixed(1)})` }, bg);
      const pose = E.sailPose(h, doc.wind, { v: sb.v0, base: 50, t: 0, seed: E.seedOf(b.id) });
      BoatDraw.draw(tg, BoatDraw.pref(), { color: b.color, pose, t: 0, seed: E.seedOf(b.id), heading: h, speed: sb.v0 / 50 });
      const lbl = b.name || b.id, lw = Math.max(22, lbl.length * 7.4 + 12);
      el('rect', { x: b.x - lw / 2, y: b.y + 30, width: lw, height: 19, rx: 9.5, fill: 'rgba(2,21,38,.78)', stroke: b.color, 'stroke-width': 1.5 }, bg);
      el('text', { x: b.x, y: b.y + 43.5, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#fff' }, bg).textContent = lbl;
    });
  }
  function render() {
    measure();
    if (!prev) prev = T.preview(doc);
    drawWind(); drawCourse(); drawRoutes(); drawBoats(); drawSel(); drawHint();
    $('tkLine').setAttribute('aria-pressed', !!doc.line); $('tkLine').classList.toggle('on', !!doc.line);
    $('tkAddBoat').disabled = doc.boats.length >= T.MAX_BOATS;
    $('tkAddMark').disabled = doc.marks.length >= T.MAX_MARKS;
    $('tkAddGust').disabled = (doc.gusts || []).length >= T.MAX_GUSTS;
    $('tkUndo').disabled = !undo.length;
    drawRef();
    $('tkPlay').disabled = !doc.boats.some(b => b.route.length);
    if (document.activeElement !== $('tkTitle')) $('tkTitle').value = doc.title;
  }

  // ---------- Seçili nesne kartı ----------
  function drawSel() {
    const c = $('tkSel');
    if (!sel || (sel.kind !== 'boat' && sel.kind !== 'mark' && sel.kind !== 'gust' && sel.kind !== 'pin')) { c.classList.add('hidden'); c.innerHTML = ''; return; }
    c.classList.remove('hidden');
    if (sel.kind === 'boat') {
      const b = doc.boats[sel.i]; if (!b) { sel = null; return drawSel(); }
      const n = b.route.length;
      c.innerHTML = `<div class="tk-sel-h"><span class="tk-dot" style="background:${b.color}"></span>
          <input class="tk-name" id="tkBoatName" maxlength="20" value="${esc(b.name || '')}" placeholder="Tekne ${esc(b.id)}" aria-label="Teknenin adı">
          <button class="tk-ic sm" data-a="close" title="Bitti" aria-label="Bitti"><svg><use href="#i-close"/></svg></button></div>
        <div class="tk-colors">${T.COLORS.map(col => `<button class="tk-col${col === b.color ? ' on' : ''}" data-col="${col}" style="background:${col}" aria-label="Renk"></button>`).join('')}</div>
        <div class="tk-lbl">Seyir</div>
        <div class="tk-seg" role="group" aria-label="Seyir">${[['', 'Serbest'], ...Object.entries(T.SAILS).map(([k, v]) => [k, v.label])].map(([k, l]) => `<button data-sail="${k}" class="${k === sail ? 'on' : ''}">${l}</button>`).join('')}</div>
        <p class="tk-sel-p">${n ? `<b>${n}</b> nokta. ` : ''}<b>Suya dokun:</b> ${sail ? `tekne ${T.SAILS[sail].label.toLocaleLowerCase('tr')} açısıyla gider.` : 'tekne oraya gider.'}${n ? ' İnce ayar için noktayı sürükle.' : ''}</p>
        <div class="tk-lbl">Rolü</div>
        <div class="tk-seg" role="group" aria-label="Rolü">${[['', 'Yok'], ['hak', 'Hak sahibi'], ['yol', 'Yol verir']].map(([k, l]) => `<button data-role="${k}" class="${(b.role || '') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="tk-sel-a">
          <button class="tb" data-a="undo" ${n ? '' : 'disabled'}><svg><use href="#i-undo"/></svg>Son nokta</button>
          <button class="tb" data-a="clear" ${n ? '' : 'disabled'}>Rotayı sil</button>
          <button class="tb danger" data-a="del"><svg><use href="#i-trash"/></svg>Tekne</button>
        </div>`;
      $('tkBoatName').oninput = e => { b.name = e.target.value; changed(); };
    } else if (sel.kind === 'gust') {
      const gu = (doc.gusts || [])[sel.i]; if (!gu) { sel = null; return drawSel(); }
      c.innerHTML = `<div class="tk-sel-h"><span class="tk-dot" style="background:#1e3a5f"></span><b class="tk-sel-t">Sağanak</b>
          <button class="tk-ic sm" data-a="close" title="Bitti" aria-label="Bitti"><svg><use href="#i-close"/></svg></button></div>
        <p class="tk-sel-p">Rüzgar burada daha sert. İçine giren tekne hızlanır. Sağanak rüzgarla birlikte yavaşça aşağı kayar.</p>
        <div class="tk-lbl">Büyüklük</div>
        <div class="tk-seg" role="group" aria-label="Büyüklük">${[[70, 'Küçük'], [100, 'Orta'], [140, 'Büyük']].map(([r, l]) => `<button data-gr="${r}" class="${Math.abs(gu.r - r) < 15 ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="tk-sel-a"><button class="tb danger" data-a="del"><svg><use href="#i-trash"/></svg>Sağanağı sil</button></div>`;
    } else if (sel.kind === 'pin') {
      if (!doc.line) { sel = null; return drawSel(); }
      c.innerHTML = `<div class="tk-sel-h"><span class="tk-dot" style="background:#ff8c42"></span><b class="tk-sel-t">Start hattının pin ucu</b>
          <button class="tk-ic sm" data-a="close" title="Bitti" aria-label="Bitti"><svg><use href="#i-close"/></svg></button></div>
        <div class="tk-seg" role="group" aria-label="Pin ucu">${[['', 'Şamandıra'], ['1', 'Tekne']].map(([k, l]) => `<button data-pinb="${k}" class="${!!doc.line.pinBoat === !!k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <p class="tk-sel-p">Büyük yarışlarda pin ucunda şamandıra yerine bir tekne (pin teknesi) durabilir. Sürükleyerek yerini değiştir.</p>`;
    } else {
      const m = doc.marks[sel.i]; if (!m) { sel = null; return drawSel(); }
      c.innerHTML = `<div class="tk-sel-h"><span class="tk-dot" style="background:#ff8c42"></span><b class="tk-sel-t">Şamandıra</b>
          <button class="tk-ic sm" data-a="close" title="Bitti" aria-label="Bitti"><svg><use href="#i-close"/></svg></button></div>
        <label class="tk-sw"><input type="checkbox" id="tkZone" ${m.zone ? 'checked' : ''}><span>Bölge çemberi (3 tekne boyu)</span></label>
        <div class="tk-sel-a"><button class="tb danger" data-a="del"><svg><use href="#i-trash"/></svg>Şamandırayı sil</button></div>`;
      $('tkZone').onchange = e => { m.zone = e.target.checked; changed(); };
    }
  }
  $('tkSel').addEventListener('click', e => {
    const sb = e.target.closest('[data-sail]');
    if (sb) { sail = sb.dataset.sail; try { localStorage.setItem(SAIL_KEY, sail); } catch (er) { /* yok */ } drawSel(); render(); return; }
    const pb = e.target.closest('[data-pinb]');
    if (pb && doc.line) { if (pb.dataset.pinb) doc.line.pinBoat = true; else delete doc.line.pinBoat; changed(); return; }
    const gr = e.target.closest('[data-gr]');
    if (gr && sel && sel.kind === 'gust') { doc.gusts[sel.i].r = +gr.dataset.gr; changed(); return; }
    const rb = e.target.closest('[data-role]');
    if (rb && sel && sel.kind === 'boat') { doc.boats[sel.i].role = rb.dataset.role; changed(); return; }
    const col = e.target.closest('[data-col]');
    if (col && sel && sel.kind === 'boat') { doc.boats[sel.i].color = col.dataset.col; changed(); return; }
    const a = e.target.closest('[data-a]'); if (!a || !sel) return;
    const act = a.dataset.a;
    if (act === 'close') { sel = null; render(); return; }
    if (sel.kind === 'boat') {
      const b = doc.boats[sel.i];
      if (act === 'undo') b.route.pop();
      else if (act === 'clear') b.route = [];
      else if (act === 'del') { doc.boats.splice(sel.i, 1); sel = null; }
    } else if (act === 'del' && sel.kind === 'gust') { doc.gusts.splice(sel.i, 1); sel = null; }
    else if (act === 'del') { doc.marks.splice(sel.i, 1); sel = null; }
    changed();
  });

  // hakem özeti: kaç karşılaşma, kaç temas; dokununca liste
  function drawRef() {
    const b = $('tkRef'), ev = (prev && prev.scn.refEvents) || [];
    const meet = ev.filter(e => !e.contact).length, hit = ev.filter(e => e.contact).length;
    const show = doc.ref !== false && doc.boats.filter(x => x.route.length).length >= 2;
    b.classList.toggle('hidden', !show);
    if (!show) return;
    b.classList.toggle('bad', hit > 0); b.classList.toggle('good', !hit && meet > 0);
    b.innerHTML = hit ? `<b>!</b> ${hit} temas` : meet ? `<b>✓</b> Temas yok · ${meet} kural` : 'Hakem: karşılaşma yok';
  }
  $('tkRef').onclick = () => {
    const ev = (prev && prev.scn.refEvents) || [];
    openDlg('Kural hakemi', ev.length ? `<div class="tk-rows">${ev.map(e => `<div class="tk-row"><span class="tk-ev ${e.contact ? 'bad' : ''}">${e.contact ? '!' : 'K' + e.rule}</span>
        <span class="tk-row-t"><b>${esc(e.title)} · ${e.t.toFixed(1)} sn</b><small class="wrap">${esc(e.text)}</small></span></div>`).join('')}</div>
        <p class="tk-p small">Hakem, tekneler yaklaşınca kimin yol vermesi gerektiğini yazar. Oynatırken bu yazılar bilgi kartında çıkar.</p>`
      : '<p class="tk-p">Tekneler birbirine yaklaşmıyor. Rotaları kesiştir, hakem kimin yol vermesi gerektiğini söylesin.</p>');
  };

  function drawHint() {
    const h = $('tkHint');
    let t = '';
    if (!doc.boats.length) t = '<b>1.</b> Alttan <b>Tekne</b> ekle. <b>2.</b> Tekneye dokun. <b>3.</b> Suya dokunarak rotasını çiz.';
    else if (!doc.boats.some(b => b.route.length)) t = sel && sel.kind === 'boat' ? 'Suya dokun: teknenin gideceği noktayı koy.' : 'Bir tekneye dokun, sonra suya dokunarak rotasını çiz.';
    h.innerHTML = t; h.classList.toggle('hidden', !t);
  }

  // ---------- Ekleme ----------
  function freeSpot(y0) {
    for (let k = 0; k < 40; k++) {
      const x = 500 + ((k % 2 ? 1 : -1) * Math.ceil(k / 2)) * 90, y = y0 - Math.floor(k / 9) * 80;
      if (x < 60 || x > 940) continue;
      const near = doc.boats.some(b => Math.hypot(b.x - x, b.y - y) < 70) || doc.marks.some(m => Math.hypot(m.x - x, m.y - y) < 70);
      if (!near) return { x, y };
    }
    return { x: 500, y: y0 };
  }
  $('tkAddBoat').onclick = () => {
    if (doc.boats.length >= T.MAX_BOATS) return;
    const used = doc.boats.map(b => b.id), id = [...T.LETTERS].find(l => !used.includes(l));
    const usedCol = doc.boats.map(b => b.color), color = T.COLORS.find(c => !usedCol.includes(c)) || T.COLORS[0];
    const p = freeSpot(doc.line ? Math.min(540, Math.max(doc.line.pin.y, doc.line.boat.y) + 60) : 520);
    doc.boats.push({ id, name: '', color, x: p.x, y: p.y, route: [] });
    sel = { kind: 'boat', i: doc.boats.length - 1 };
    changed();
  };
  $('tkAddGust').onclick = () => {
    doc.gusts = doc.gusts || [];
    if (doc.gusts.length >= T.MAX_GUSTS) return;
    // rüzgarüstünde, sahnenin bir yanında
    const x = doc.gusts.length % 2 ? 260 : 740, y = 300;
    doc.gusts.push({ x, y, r: 100 });
    sel = { kind: 'gust', i: doc.gusts.length - 1 };
    changed();
  };
  $('tkAddMark').onclick = () => {
    if (doc.marks.length >= T.MAX_MARKS) return;
    const p = freeSpot(doc.marks.length ? 300 : 150);
    doc.marks.push({ x: p.x, y: p.y, zone: true });
    sel = { kind: 'mark', i: doc.marks.length - 1 };
    changed();
  };
  $('tkLine').onclick = () => {
    if (doc.line) doc.line = null;
    else {
      // rüzgara dik, sahnenin altında
      // tekneler varsa en öndekinin biraz rüzgarüstüne
      const r = E.fwd(doc.wind + 90), top = doc.boats.length ? Math.min(...doc.boats.map(b => b.y)) - 60 : 460, c = { x: 500, y: Math.max(200, top) };
      doc.line = { pin: { x: clampX(c.x - r.x * 190), y: clampY(c.y - r.y * 190) }, boat: { x: clampX(c.x + r.x * 190), y: clampY(c.y + r.y * 190) } };
    }
    if (sel && (sel.kind === 'pin' || sel.kind === 'cb')) sel = null;
    if (doc.line) sel = { kind: 'pin' };     // pin ucu seçeneği (şamandıra / tekne) hemen görünsün
    changed();
  };
  function setDoc(d) { doc = d; sel = null; undo.length = 0; last = JSON.stringify(doc); }
  $('tkUndo').onclick = () => {
    if (!undo.length) return;
    const d = JSON.parse(undo.pop()); last = JSON.stringify(d);
    doc = d; if (sel && ((sel.kind === 'boat' && !doc.boats[sel.i]) || (sel.kind === 'mark' && !doc.marks[sel.i]) || (sel.kind === 'gust' && !(doc.gusts || [])[sel.i]))) sel = null;
    changed({ noUndo: true });
  };
  // Yeni: hazır başlangıç sahnesi seç (şimdiki taslak zaten kayıtlı, bir şey kaybolmaz)
  $('tkNew').onclick = () => openDlg('Yeni taktik', `<p class="tk-p">Nasıl başlayalım? Sonra her şeyi değiştirebilirsin.</p>
      <div class="tk-tpl">${T.TEMPLATES.map(t => `<button class="tk-tpl-b" data-tpl="${t.id}"><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></button>`).join('')}</div>`, b => {
    b.onclick = e => {
      const tb = e.target.closest('[data-tpl]'); if (!tb) return;
      persist(); setDoc(T.fromTemplate(tb.dataset.tpl)); history.replaceState(null, '', location.pathname); closeDlg(); changed({ now: true });
    };
  });

  const rotWind = d => { doc.wind = E.norm360(doc.wind + d); doc.boats.forEach(b => T.resnap(b, doc.wind)); changed(); };
  $('tkWindL').onclick = () => rotWind(-10);
  $('tkShift').onclick = () => {
    const sh = doc.shift || { t: 5, d: 0 }, dur = (prev && prev.scn.duration) || 10;
    let d = sh.d;
    const opts = [[-20, '20° sola'], [-10, '10° sola'], [0, 'Dönmesin'], [10, '10° sağa'], [20, '20° sağa']];
    openDlg('Rüzgar dönüşü', `<p class="tk-p">Rüzgar oynatırken dönsün mü? Sağa dönüş sancak kontraya açma, iskele kontraya kapatma olur. Sola dönüş tersi.</p>
      <div class="tk-seg tk-seg-big" id="tkShD">${opts.map(([v, l]) => `<button data-d="${v}" class="${v === d ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="tk-sw tk-sw2"><span>Kaçıncı saniyede?</span><span class="tk-sec"><input type="number" id="tkShT" min="0" max="60" step="1" value="${sh.t}"><span>sn</span></span><small class="tk-muted">Taktik ${dur} sn</small></label>
      <div class="tk-dlg-a"><button class="tb primary" id="tkShOk">Tamam</button></div>`, b => {
      b.querySelector('#tkShD').onclick = e => { const x = e.target.closest('[data-d]'); if (!x) return; d = +x.dataset.d; b.querySelectorAll('#tkShD button').forEach(y => y.classList.toggle('on', y === x)); };
      b.querySelector('#tkShOk').onclick = () => { doc.shift = d ? { t: Math.max(0, +b.querySelector('#tkShT').value || 0), d } : null; closeDlg(); changed(); };
    });
  };
  $('tkWindR').onclick = () => rotWind(10);

  // ---------- Sürükle / dokun ----------
  let drag = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const g = e.target.closest('[data-k]'), p = toSvg(e);
    drag = { g, k: g ? g.dataset.k : 'water', i: g ? +g.dataset.i : -1, j: g ? +g.dataset.j : -1, x0: e.clientX, y0: e.clientY, p0: p, moved: false, id: e.pointerId };
    if (drag.k === 'boat') drag.o = { x: doc.boats[drag.i].x, y: doc.boats[drag.i].y };
    else if (drag.k === 'mark') drag.o = { ...doc.marks[drag.i] };
    else if (drag.k === 'gust') drag.o = { ...doc.gusts[drag.i] };
    else if (drag.k === 'pt') drag.o = { ...doc.boats[drag.i].route[drag.j] };
    else if (drag.k === 'pin') drag.o = { ...doc.line.pin };
    else if (drag.k === 'cb') drag.o = { ...doc.line.boat };
    try { svg.setPointerCapture(e.pointerId); } catch (er) { /* yok */ }
    e.preventDefault();
  });
  svg.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    drag.moved = true;
    if (!drag.o) return;
    const p = toSvg(e), x = clampX(drag.o.x + p.x - drag.p0.x), y = clampY(drag.o.y + p.y - drag.p0.y);
    if (drag.k === 'boat') { const b = doc.boats[drag.i]; b.x = x; b.y = y; T.resnap(b, doc.wind); if (!sel || sel.i !== drag.i || sel.kind !== 'boat') sel = { kind: 'boat', i: drag.i }; }
    else if (drag.k === 'mark') { doc.marks[drag.i].x = x; doc.marks[drag.i].y = y; }
    else if (drag.k === 'gust') { doc.gusts[drag.i].x = x; doc.gusts[drag.i].y = y; }
    else if (drag.k === 'pt') { const b = doc.boats[drag.i], q = b.route[drag.j]; q.x = x; q.y = y; delete q.m; delete q.s; T.resnap(b, doc.wind); }
    else if (drag.k === 'pin') doc.line.pin = { x, y };
    else if (drag.k === 'cb') doc.line.boat = { x, y };
    prev = null; render();
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (d.moved) { if (d.o) changed(); return; }
    // dokunma
    if (d.k === 'boat') sel = sel && sel.kind === 'boat' && sel.i === d.i ? null : { kind: 'boat', i: d.i };
    else if (d.k === 'mark') sel = { kind: 'mark', i: d.i };
    else if (d.k === 'gust') { if (sel && sel.kind === 'boat') return addPoint(d.p0); sel = { kind: 'gust', i: d.i }; }
    else if (d.k === 'pt') { if (!(sel && sel.kind === 'boat' && sel.i === d.i)) sel = { kind: 'boat', i: d.i }; else return addPoint(d.p0); }
    else if (d.k === 'pin') sel = sel && sel.kind === 'pin' ? null : { kind: 'pin' };
    else if (d.k === 'cb') sel = null;
    else if (sel && sel.kind === 'boat') return addPoint(d.p0);
    else sel = null;
    render();
  };
  function addPoint(p) {
    const b = doc.boats[sel.i];
    if (b.route.length >= T.MAX_PTS) { toast(`Bir teknede en çok ${T.MAX_PTS} nokta olur.`); return; }
    const from = b.route.length ? b.route[b.route.length - 1] : b;
    let q = { x: p.x, y: p.y };
    if (sail) q = T.snap(from, p, doc.wind, sail);
    q.x = Math.round(clampX(q.x)); q.y = Math.round(clampY(q.y));
    b.route.push(q);
    changed();
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) { drag = null; render(); } });

  // ---------- Üst çubuk ----------
  $('tkTitle').addEventListener('input', e => { doc.title = e.target.value; changed(); });
  $('tkTitle').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $('tkPlay').onclick = () => {
    if (!doc.boats.some(b => b.route.length)) return;
    if (!persist()) { location.href = './?t=' + T.encode(doc); return; }
    location.href = './#u-' + doc.id;
  };
  async function shareLink() {
    const url = T.shareUrl(doc), title = doc.title || 'Taktik';
    if (navigator.share) { try { await navigator.share({ title: `${title} · Velora Sailing`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Bağlantı kopyalandı. Sporcuna gönder.'); closeDlg(); }
    catch (e) { openDlg('Paylaş', `<p class="tk-p">Bu bağlantıyı kopyala ve gönder:</p><textarea class="tk-ta" readonly rows="4">${esc(url)}</textarea>`, b => { const ta = b.querySelector('textarea'); ta.focus(); ta.select(); }); }
  }
  function showCode(code) {
    const url = T.cloud.link(code);
    openDlg('Kod hazır', `<div class="tk-code">${code}</div>
      <p class="tk-p">Sporcun <b>Taktik oluştur → Taktiklerim → Kodla aç</b> ile bu kodu yazar ya da bağlantıyı açar. Taktik onun cihazına kopyalanır, oynatır.</p>
      <div class="tk-dlg-a tk-dlg-a2"><button class="tb" id="tkCodeCopy">Bağlantıyı kopyala</button><button class="tb primary" id="tkCodeSend">Gönder</button></div>`, b => {
      b.querySelector('#tkCodeCopy').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Bağlantı kopyalandı.'); } catch (e) { toast(url); } };
      b.querySelector('#tkCodeSend').onclick = async () => {
        if (navigator.share) { try { await navigator.share({ title: `${doc.title || 'Taktik'} · Velora Sailing`, text: `Taktik kodu: ${code}`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
        try { await navigator.clipboard.writeText(`Taktik kodu: ${code} ${url}`); toast('Kod ve bağlantı kopyalandı.'); } catch (e) { toast(url); }
      };
    });
  }
  $('tkShare').onclick = () => {
    if (!doc.boats.length) { toast('Önce bir tekne ekle.'); return; }
    persist();
    openDlg('Paylaş', `<div class="tk-share">
        <button class="tk-share-b" id="tkShCode"><b>Kodla paylaş</b><small>6 harfli kod oluştur. Sporcuların kodu yazarak açar. Antrenör hesabıyla (Velora girişi).</small></button>
        <button class="tk-share-b" id="tkShLink"><b>Bağlantı gönder</b><small>Taktik bağlantının içinde. Hesap gerekmez.</small></button>
      </div><p class="tk-p small" id="tkShErr"></p>`, b => {
      b.querySelector('#tkShLink').onclick = shareLink;
      const btn = b.querySelector('#tkShCode');
      btn.onclick = async () => {
        if (btn.disabled) return;
        btn.disabled = true; btn.querySelector('small').textContent = 'Kod oluşturuluyor…';
        try { const code = await T.cloud.share(doc); try { if (window.SailTrack) SailTrack.log('taktik_code', { code }); } catch (e) { /* yok */ } showCode(code); }
        catch (e) {
          btn.disabled = false; btn.querySelector('small').textContent = '6 harfli kod oluştur. Sporcuların kodu yazarak açar.';
          b.querySelector('#tkShErr').textContent = e && e.code === 'not-coach' ? 'Kod oluşturmak için antrenör hesabıyla (Velora ile) gir. Bağlantı gönder herkes için çalışır.'
            : (window.SailTaskData && SailTaskData.isDenied(e)) ? 'Kod oluşturulamadı: Firestore kuralı izin vermedi (Yarışlar sayfasındaki kural kartı).' : 'Kod oluşturulamadı. İnternetini kontrol et.';
        }
      };
    });
  };
  $('tkNote').onclick = () => {
    const dur = (prev && prev.scn.duration) || 10;
    let notes = (doc.notes || []).map(n => ({ ...n }));
    const rows = () => notes.map((n, i) => `<div class="tk-note" data-i="${i}">
        <label class="tk-sec"><input type="number" min="0" max="${dur}" step="0.5" value="${n.t}" data-f="t" aria-label="Saniye"><span>sn</span></label>
        <input class="tk-in" maxlength="200" value="${esc(n.text)}" data-f="text" placeholder="Bu anda ne oluyor?">
        <button class="tb danger" data-del="${i}" title="Sil" aria-label="Notu sil"><svg><use href="#i-trash"/></svg></button></div>`).join('');
    openDlg('Notlar', `<p class="tk-p">Bu taktik ne anlatıyor? Oynatırken bilgi kartında görünür.</p>
      <textarea class="tk-ta" id="tkNoteTa" maxlength="600" rows="3" placeholder="Örnek: Sancak kontradaki A hak sahibidir. B kıçından geçer.">${esc(doc.text || '')}</textarea>
      <div class="tk-lbl tk-lbl2">Zamanlı notlar <small>Taktik ${dur} sn sürüyor</small></div>
      <div id="tkNotes" class="tk-notes">${rows()}</div>
      <button class="tb" id="tkNoteAdd"${notes.length >= T.MAX_NOTES ? ' disabled' : ''}><svg><use href="#i-plus"/></svg>Not ekle</button>
      <label class="tk-sw tk-sw2"><input type="checkbox" id="tkRefOn" ${doc.ref !== false ? 'checked' : ''}><span><b>Kural hakemi</b>: tekneler yaklaşınca kimin yol vermesi gerektiğini yazar, temas olursa gösterir.</span></label>
      <label class="tk-sw tk-sw2"><input type="checkbox" id="tkQuizOn" ${doc.quiz ? 'checked' : ''}><span><b>Soru modu</b>: oynatırken tekneler karşılaşınca durur ve "Kim yol vermeli?" diye sorar.</span></label>
      <div class="tk-dlg-a"><button class="tb primary" id="tkNoteOk">Tamam</button></div>`, b => {
      const list = b.querySelector('#tkNotes');
      const sync = () => list.querySelectorAll('.tk-note').forEach(r => { const n = notes[+r.dataset.i]; n.t = +r.querySelector('[data-f=t]').value || 0; n.text = r.querySelector('[data-f=text]').value; });
      b.querySelector('#tkNoteAdd').onclick = () => {
        sync(); const lastT = notes.length ? notes[notes.length - 1].t : 0;
        notes.push({ t: Math.min(dur, Math.round(lastT + Math.max(1, dur / 5))), text: '' }); list.innerHTML = rows();
        list.querySelector('.tk-note:last-child [data-f=text]').focus();
        b.querySelector('#tkNoteAdd').disabled = notes.length >= T.MAX_NOTES;
      };
      list.onclick = e => { const d = e.target.closest('[data-del]'); if (!d) return; sync(); notes.splice(+d.dataset.del, 1); list.innerHTML = rows(); b.querySelector('#tkNoteAdd').disabled = false; };
      b.querySelector('#tkNoteOk').onclick = () => {
        sync();
        doc.text = b.querySelector('#tkNoteTa').value.trim();
        doc.notes = notes.filter(n => n.text.trim()).map(n => ({ t: Math.max(0, n.t), text: n.text.trim() })).sort((x, y) => x.t - y.t);
        doc.ref = b.querySelector('#tkRefOn').checked;
        doc.quiz = b.querySelector('#tkQuizOn').checked;
        closeDlg(); changed();
      };
    });
  };
  $('tkMine').onclick = () => {
    persist();
    const all = T.list();
    const rows = all.length ? all.map(d => `<div class="tk-row${d.id === doc.id ? ' cur' : ''}" data-id="${esc(d.id)}">
        <span class="tk-row-dots">${d.boats.slice(0, 6).map(b => `<i style="background:${b.color}"></i>`).join('')}</span>
        <span class="tk-row-t"><b>${esc(d.title || 'Adsız taktik')}</b><small>${d.boats.length} tekne · ${new Date(d.updated || Date.now()).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}${d.id === doc.id ? ' · açık' : ''}</small></span>
        <button class="tb" data-a="open">Aç</button><button class="tb" data-a="play" title="Oynat" aria-label="Oynat"><svg><use href="#i-play"/></svg></button>
        <button class="tb danger" data-a="del" title="Sil" aria-label="Sil"><svg><use href="#i-trash"/></svg></button></div>`).join('')
      : '<p class="tk-p">Henüz kayıtlı taktiğin yok. Bir tekne ekleyince kendiliğinden kaydedilir.</p>';
    openDlg('Taktiklerim', `<form class="tk-kod" id="tkKodF"><input class="tk-in" id="tkKodIn" maxlength="6" placeholder="Kod (ör. K7M2QP)" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Taktik kodu"><button class="tb primary">Kodla aç</button></form>
      <p class="tk-p small tk-kod-err" id="tkKodErr"></p>
      <div class="tk-rows">${rows}</div><p class="tk-p small">Taktiklerin bu cihazda saklanır. Ana sayfada <b>Taktiklerim</b> sekmesinde de görünür.</p>
      <div id="tkCloud"></div>`, b => {
      b.querySelector('#tkKodF').onsubmit = e => { e.preventDefault(); openCode(b.querySelector('#tkKodIn').value, b.querySelector('#tkKodErr')); };
      cloudList(b.querySelector('#tkCloud'));
      b.onclick = e => {
        const a = e.target.closest('[data-a]'), row = e.target.closest('[data-id]'); if (!a || !row) return;
        const id = row.dataset.id;
        if (a.dataset.a === 'open') { const d = T.get(id); if (d) { setDoc(d); history.replaceState(null, '', location.pathname + '?id=' + id); closeDlg(); changed(); } }
        else if (a.dataset.a === 'play') location.href = './#u-' + id;
        else if (a.dataset.a === 'del') {
          if (a.dataset.sure !== '1') { a.dataset.sure = '1'; a.innerHTML = 'Silinsin mi?'; return; }
          T.remove(id);
          if (id === doc.id) { setDoc(T.blank()); history.replaceState(null, '', location.pathname); changed(); }
          $('tkMine').onclick();
        }
      };
    });
  };

  // ---------- Kodla açma (bulut) ----------
  const CODE_ERR = { 'bad-code': 'Kod 6 harf ya da rakam olmalı.', 'not-found': 'Bu kodla bir taktik yok.', 'is-race': 'Bu bir yarış kodu. Ana sayfada Yarışlar’dan aç.' };
  async function openCode(code, errEl) {
    const say = t => { if (errEl) errEl.textContent = t; else toast(t); };
    say('Taktik açılıyor…');
    try { const id = await T.cloud.open(code); try { if (window.SailTrack) SailTrack.log('taktik_kod_ac', { code: String(code).toUpperCase() }); } catch (e) { /* yok */ } location.replace('./#u-' + id); }
    catch (e) { say(CODE_ERR[e && e.code] || 'Taktik açılamadı. İnternetini kontrol et.'); }
  }
  async function cloudList(box) {
    if (!(await T.cloud.canShare())) return;
    let items = [];
    try { items = await T.cloud.mine(); } catch (e) { return; }
    if (!items.length || !box.isConnected) return;
    box.innerHTML = `<div class="tk-lbl tk-lbl2">Kodla paylaştıklarım</div><div class="tk-rows">${items.map(t => `<div class="tk-row" data-code="${esc(t.code)}">
        <span class="tk-code-s">${esc(t.code)}</span><span class="tk-row-t"><b>${esc(t.name || 'Adsız taktik')}</b><small>${t.boats || 0} tekne${t.at ? ' · ' + new Date(t.at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : ''}</small></span>
        <button class="tb" data-c="copy">Bağlantı</button><button class="tb danger" data-c="del" title="Kodu sil" aria-label="Kodu sil"><svg><use href="#i-trash"/></svg></button></div>`).join('')}</div>
      <p class="tk-p small">Kodu silersen sporcular artık açamaz. Daha önce açanların kopyası kalır.</p>`;
    box.onclick = async e => {
      const a = e.target.closest('[data-c]'), row = e.target.closest('[data-code]'); if (!a || !row) return;
      e.stopPropagation();
      const code = row.dataset.code;
      if (a.dataset.c === 'copy') { try { await navigator.clipboard.writeText(T.cloud.link(code)); toast('Bağlantı kopyalandı.'); } catch (err) { toast(T.cloud.link(code)); } return; }
      if (a.dataset.sure !== '1') { a.dataset.sure = '1'; a.textContent = 'Silinsin mi?'; return; }
      try { await T.cloud.remove(code); row.remove(); toast('Kod silindi.'); } catch (err) { toast('Silinemedi.'); }
    };
  }
  if (qs.get('kod')) { const k = qs.get('kod'); history.replaceState(null, '', location.pathname + (qs.get('net') ? '?net=' + qs.get('net') : '')); setTimeout(() => openCode(k), 0); }

  // ---------- Pencere + bildirim ----------
  function openDlg(title, html, init) {
    $('tkDlgTitle').textContent = title; const b = $('tkDlgBody'); b.onclick = null; b.innerHTML = html;
    $('tkDlg').classList.remove('hidden'); if (init) init(b);
  }
  function closeDlg() { $('tkDlg').classList.add('hidden'); }
  $('tkDlgClose').onclick = closeDlg;
  $('tkDlg').addEventListener('click', e => { if (e.target === $('tkDlg')) closeDlg(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('tkDlg').classList.contains('hidden')) closeDlg(); else if (sel) { sel = null; render(); } }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      if (sel.kind === 'boat') { const b = doc.boats[sel.i]; if (b.route.length) b.route.pop(); else { doc.boats.splice(sel.i, 1); sel = null; } }
      else if (sel.kind === 'mark') { doc.marks.splice(sel.i, 1); sel = null; }
      changed(); e.preventDefault();
    }
  });
  let toastTimer = 0;
  function toast(msg) {
    const t = $('tkToast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  window.addEventListener('resize', () => render());
  if (window.SailReport) SailReport.source('taktik', () => ({ ozet: `taktik ${doc.id} · ${doc.boats.length} tekne · rüzgar ${doc.wind}°`, doc: T.clean(doc) }));
  if (window.SailTrack) SailTrack.log('taktik', { id: doc.id });
  render();
  if (!fresh) $('tkSaved').textContent = 'Kaydedildi';
})();

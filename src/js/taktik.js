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
  let prev = null;         // önizleme (hesaplanan yollar)

  // ---------- Kayıt (kendiliğinden) ----------
  let saveTimer = 0;
  function changed(opts) {
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
  }
  function drawCourse() {
    const g = $('tkCourse'); g.innerHTML = '';
    if (doc.line) {
      const { pin, boat } = doc.line;
      el('line', { x1: pin.x, y1: pin.y, x2: boat.x, y2: boat.y, stroke: '#ffd166', 'stroke-width': 2, 'stroke-dasharray': '10 8', opacity: .9 }, g);
      const pn = el('g', { 'data-k': 'pin', class: 'tk-drag' + (sel && sel.kind === 'pin' ? ' on' : '') }, g);
      el('circle', { cx: pin.x, cy: pin.y, r: 22 * ui, fill: 'transparent' }, pn);
      el('circle', { cx: pin.x, cy: pin.y, r: 7, fill: '#ff8c42', stroke: '#fff', 'stroke-width': 1.5 }, pn);
      el('text', { x: pin.x, y: pin.y + 24, 'text-anchor': 'middle', fill: '#ffd166', 'font-size': 12 }, pn).textContent = 'Pin';
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
      b.route.forEach((p, k) => {
        const pg = el('g', { 'data-k': 'pt', 'data-i': i, 'data-j': k, class: 'tk-drag' }, h);
        el('circle', { cx: p.x, cy: p.y, r: 18 * ui, fill: 'transparent' }, pg);
        el('circle', { cx: p.x, cy: p.y, r: (on ? 9 : 6) * Math.min(ui, 1.6), fill: on ? '#fff' : b.color, stroke: on ? b.color : '#fff', 'stroke-width': on ? 3 : 1.5 }, pg);
        if (on) el('text', { x: p.x, y: p.y + 4 * Math.min(ui, 1.6), 'text-anchor': 'middle', 'font-size': 10 * Math.min(ui, 1.6), 'font-weight': 800, fill: '#0b1a33', 'pointer-events': 'none' }, pg).textContent = k + 1;
      });
    });
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
      BoatDraw.draw(tg, 'optimist', { color: b.color, pose, t: 0, seed: E.seedOf(b.id), heading: h, speed: sb.v0 / 50 });
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
    $('tkPlay').disabled = !doc.boats.some(b => b.route.length);
    if (document.activeElement !== $('tkTitle')) $('tkTitle').value = doc.title;
  }

  // ---------- Seçili nesne kartı ----------
  function drawSel() {
    const c = $('tkSel');
    if (!sel || (sel.kind !== 'boat' && sel.kind !== 'mark')) { c.classList.add('hidden'); c.innerHTML = ''; return; }
    c.classList.remove('hidden');
    if (sel.kind === 'boat') {
      const b = doc.boats[sel.i]; if (!b) { sel = null; return drawSel(); }
      const n = b.route.length;
      c.innerHTML = `<div class="tk-sel-h"><span class="tk-dot" style="background:${b.color}"></span>
          <input class="tk-name" id="tkBoatName" maxlength="20" value="${esc(b.name || '')}" placeholder="Tekne ${esc(b.id)}" aria-label="Teknenin adı">
          <button class="tk-ic sm" data-a="close" title="Bitti" aria-label="Bitti"><svg><use href="#i-close"/></svg></button></div>
        <div class="tk-colors">${T.COLORS.map(col => `<button class="tk-col${col === b.color ? ' on' : ''}" data-col="${col}" style="background:${col}" aria-label="Renk"></button>`).join('')}</div>
        <p class="tk-sel-p">${n ? `Rota: <b>${n}</b> nokta. Suya dokun, yeni nokta ekle. Noktayı sürükle, yerini değiştir.` : '<b>Suya dokun:</b> teknenin gideceği yere nokta koy.'}</p>
        <div class="tk-sel-a">
          <button class="tb" data-a="undo" ${n ? '' : 'disabled'}><svg><use href="#i-undo"/></svg>Son nokta</button>
          <button class="tb" data-a="clear" ${n ? '' : 'disabled'}>Rotayı sil</button>
          <button class="tb danger" data-a="del"><svg><use href="#i-trash"/></svg>Tekne</button>
        </div>`;
      $('tkBoatName').oninput = e => { b.name = e.target.value; changed(); };
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
    } else if (act === 'del') { doc.marks.splice(sel.i, 1); sel = null; }
    changed();
  });

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
    changed();
  };
  $('tkNew').onclick = () => {
    if (doc.boats.length && !confirmNew()) return;
    persist(); doc = T.blank(); sel = null; history.replaceState(null, '', location.pathname); changed();
  };
  function confirmNew() { return true; }   // taslak zaten kayıtlı: yeni sahne açmak bir şey kaybettirmez

  const rotWind = d => { doc.wind = E.norm360(doc.wind + d); changed(); };
  $('tkWindL').onclick = () => rotWind(-10);
  $('tkWindR').onclick = () => rotWind(10);

  // ---------- Sürükle / dokun ----------
  let drag = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const g = e.target.closest('[data-k]'), p = toSvg(e);
    drag = { g, k: g ? g.dataset.k : 'water', i: g ? +g.dataset.i : -1, j: g ? +g.dataset.j : -1, x0: e.clientX, y0: e.clientY, p0: p, moved: false, id: e.pointerId };
    if (drag.k === 'boat') drag.o = { x: doc.boats[drag.i].x, y: doc.boats[drag.i].y };
    else if (drag.k === 'mark') drag.o = { ...doc.marks[drag.i] };
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
    if (drag.k === 'boat') { const b = doc.boats[drag.i]; b.x = x; b.y = y; if (!sel || sel.i !== drag.i || sel.kind !== 'boat') sel = { kind: 'boat', i: drag.i }; }
    else if (drag.k === 'mark') { doc.marks[drag.i].x = x; doc.marks[drag.i].y = y; }
    else if (drag.k === 'pt') { const q = doc.boats[drag.i].route[drag.j]; q.x = x; q.y = y; }
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
    else if (d.k === 'pt') { if (!(sel && sel.kind === 'boat' && sel.i === d.i)) sel = { kind: 'boat', i: d.i }; else return addPoint(d.p0); }
    else if (d.k === 'pin' || d.k === 'cb') sel = null;
    else if (sel && sel.kind === 'boat') return addPoint(d.p0);
    else sel = null;
    render();
  };
  function addPoint(p) {
    const b = doc.boats[sel.i];
    if (b.route.length >= T.MAX_PTS) { toast(`Bir teknede en çok ${T.MAX_PTS} nokta olur.`); return; }
    b.route.push({ x: clampX(p.x), y: clampY(p.y) });
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
  $('tkShare').onclick = async () => {
    if (!doc.boats.length) { toast('Önce bir tekne ekle.'); return; }
    persist();
    const url = T.shareUrl(doc), title = doc.title || 'Taktik';
    if (navigator.share) { try { await navigator.share({ title: `${title} · Velora Sailing`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Bağlantı kopyalandı. Sporcuna gönder.'); }
    catch (e) { openDlg('Paylaş', `<p class="tk-p">Bu bağlantıyı kopyala ve gönder:</p><textarea class="tk-ta" readonly rows="4">${esc(url)}</textarea>`, b => { const ta = b.querySelector('textarea'); ta.focus(); ta.select(); }); }
  };
  $('tkNote').onclick = () => openDlg('Açıklama', `<p class="tk-p">Bu taktik ne anlatıyor? Oynatırken bilgi kartında görünür.</p>
      <textarea class="tk-ta" id="tkNoteTa" maxlength="600" rows="5" placeholder="Örnek: Sancak kontradaki A hak sahibidir. B kıçından geçer.">${esc(doc.text || '')}</textarea>
      <div class="tk-dlg-a"><button class="tb primary" id="tkNoteOk">Tamam</button></div>`, b => {
    const ta = b.querySelector('#tkNoteTa'); ta.focus();
    b.querySelector('#tkNoteOk').onclick = () => { doc.text = ta.value.trim(); closeDlg(); changed(); };
  });
  $('tkMine').onclick = () => {
    persist();
    const all = T.list();
    const rows = all.length ? all.map(d => `<div class="tk-row${d.id === doc.id ? ' cur' : ''}" data-id="${esc(d.id)}">
        <span class="tk-row-dots">${d.boats.slice(0, 6).map(b => `<i style="background:${b.color}"></i>`).join('')}</span>
        <span class="tk-row-t"><b>${esc(d.title || 'Adsız taktik')}</b><small>${d.boats.length} tekne · ${new Date(d.updated || Date.now()).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}${d.id === doc.id ? ' · açık' : ''}</small></span>
        <button class="tb" data-a="open">Aç</button><button class="tb" data-a="play" title="Oynat" aria-label="Oynat"><svg><use href="#i-play"/></svg></button>
        <button class="tb danger" data-a="del" title="Sil" aria-label="Sil"><svg><use href="#i-trash"/></svg></button></div>`).join('')
      : '<p class="tk-p">Henüz kayıtlı taktiğin yok. Bir tekne ekleyince kendiliğinden kaydedilir.</p>';
    openDlg('Taktiklerim', `<div class="tk-rows">${rows}</div><p class="tk-p small">Taktiklerin bu cihazda saklanır. Ana sayfada <b>Taktiklerim</b> sekmesinde de görünür.</p>`, b => {
      b.onclick = e => {
        const a = e.target.closest('[data-a]'), row = e.target.closest('[data-id]'); if (!a || !row) return;
        const id = row.dataset.id;
        if (a.dataset.a === 'open') { const d = T.get(id); if (d) { doc = d; sel = null; history.replaceState(null, '', location.pathname + '?id=' + id); closeDlg(); changed(); } }
        else if (a.dataset.a === 'play') location.href = './#u-' + id;
        else if (a.dataset.a === 'del') {
          if (a.dataset.sure !== '1') { a.dataset.sure = '1'; a.innerHTML = 'Silinsin mi?'; return; }
          T.remove(id);
          if (id === doc.id) { doc = T.blank(); sel = null; history.replaceState(null, '', location.pathname); changed(); }
          $('tkMine').onclick();
        }
      };
    });
  };

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

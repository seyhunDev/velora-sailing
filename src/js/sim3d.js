// Velora Sailing – simülatörde tekne içinden 3D görünüş (three.js + sea3d).
// Simülatör her karede window.SimScene yayınlar (sim.js → publish3d): tekneler, yelken açıları, rüzgar, şamandıralar, start hattı.
// Ölçek: 1 tekne boyu (50 px) = gerçek tekne boyu (Optimist 2,31 m). Ekran x → dünya x, ekran y → dünya z, pusula h → rotation.y = -h.
// Kameralar: "Tekneden" (senin teknende oturan yelkencinin gözü; sürükleyerek etrafa bak), "Arkadan" (takip), "Yukarıdan" (filo).
import * as THREE from 'three';
import { createSea } from 'sea3d';

const DEG = Math.PI / 180;
let ctx = null;

export function toggle(on) {
  const want = on === undefined ? !document.body.classList.contains('view3d') : !!on;
  if (want) { if (!ctx) ctx = init(); if (!ctx) return false; }
  document.body.classList.toggle('view3d', want);
  if (ctx) { ctx.active = want; if (want) ctx.fit(); }
  return want;
}

function init() {
  const stage = document.querySelector('.stage');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); if (!renderer.getContext()) throw 0; }
  catch (e) { return null; }
  const small = Math.min(innerWidth, innerHeight) < 600;
  renderer.setPixelRatio(Math.min(small ? 1.5 : 2, devicePixelRatio || 1));
  const host = document.createElement('div');
  host.className = 'view3d-host';
  host.innerHTML = `<div class="v3-bar" role="group" aria-label="3D kamera">
      <button data-c="fp" class="on">Tekneden</button><button data-c="chase">Arkadan</button><button data-c="top">Yukarıdan</button>
      <button data-c="off" class="v3-off" title="Üstten haritaya dön">2D</button></div>
    <div class="v3-hint">Sürükle: etrafa bak</div>`;
  host.prepend(renderer.domElement);
  stage.appendChild(host);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 1500);
  const sea = createSea(THREE, renderer, scene, { sunDir: new THREE.Vector3(0.45, 0.7, 0.55) });

  const S = window.SailSim, E = window.SailEngine;
  const boatLenM = cls => cls && cls.startsWith('ilca') ? 4.2 : 2.31;
  const st = { cam: 'fp', yaw: 0, pitch: -0.08, cls: null, K: 2.31 / 50 };
  const P = (x, y) => new THREE.Vector3(x * st.K, 0, y * st.K);

  // ---------- tekne modeli (bir kez kurulur, her tekne için kopyalanır) ----------
  function buildBoat(cls, color) {
    const ilca = cls && cls.startsWith('ilca');
    const g = new THREE.Group();
    const L = ilca ? 4.2 : 2.31, B = ilca ? 0.69 : 0.56;            // boy, yarı en (küpeşte)
    // gövde: kesitler (u: 0 kıç → 1 baş); Optimist pram (baş da düz ayna), ILCA sivri baş
    const hw = u => ilca ? B * (u < 0.55 ? 0.82 + 0.18 * Math.sin(u / 0.55 * Math.PI / 2) : Math.cos((u - 0.55) / 0.45 * Math.PI / 2) ** 0.8)
      : (u < 0.42 ? B - 0.135 * ((0.42 - u) / 0.42) ** 2 : B - 0.22 * ((u - 0.42) / 0.58) ** 2);
    const yb = u => ilca ? -0.16 + 0.12 * Math.max(0, u - 0.6) ** 2 * 4 : (u < 0.42 ? -0.12 + 0.07 * ((0.42 - u) / 0.42) ** 2 : -0.12 + 0.33 * ((u - 0.42) / 0.58) ** 2);
    const ys = u => ilca ? 0.2 + 0.05 * u : 0.27 + 0.03 * u + 0.06 * u ** 4;
    const NS = 36, sec = u => { const h = Math.max(0.002, hw(u)), b = yb(u), t = ys(u); return [[-h, t], [-h * 0.97, (b + t) / 2], [-h * 0.8, b + 0.02], [0, b], [h * 0.8, b + 0.02], [h * 0.97, (b + t) / 2], [h, t]]; };
    const pos = [];
    for (let i = 0; i < NS; i++) {
      const u0 = i / NS, u1 = (i + 1) / NS, a = sec(u0), c = sec(u1), z0 = (0.5 - u0) * L, z1 = (0.5 - u1) * L;
      for (let k = 0; k < a.length - 1; k++) {
        const p1 = [a[k][0], a[k][1], z0], p2 = [c[k][0], c[k][1], z1], p3 = [c[k + 1][0], c[k + 1][1], z1], p4 = [a[k + 1][0], a[k + 1][1], z0];
        pos.push(...p1, ...p3, ...p2, ...p1, ...p4, ...p3);
      }
    }
    for (const u of [0, 1]) {                                      // aynalar
      const s = sec(u), z = (0.5 - u) * L, cy = (yb(u) + ys(u)) / 2;
      for (let k = 0; k < s.length - 1; k++) { const A = [0, cy, z], Bp = [s[k][0], s[k][1], z], C = [s[k + 1][0], s[k + 1][1], z]; if (u === 0) pos.push(...A, ...Bp, ...C); else pos.push(...A, ...C, ...Bp); }
      pos.push(0, cy, z, ...(u === 0 ? [s[0][0], s[0][1], z, s[6][0], s[6][1], z] : [s[6][0], s[6][1], z, s[0][0], s[0][1], z]));
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.computeVertexNormals();
    const hullMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
    const hull = new THREE.Mesh(hg, hullMat); g.add(hull);
    // güverte / iç: Optimist açık tekne (koyu kaymaz taban + beyaz oturak), ILCA kapalı güverte + kokpit
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 });
    const grey = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.9 });
    const rimPts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; rimPts.push(new THREE.Vector3(hw(u), ys(u) + 0.012, (0.5 - u) * L)); }
    for (let i = 40; i >= 0; i--) { const u = i / 40; rimPts.push(new THREE.Vector3(-hw(u), ys(u) + 0.012, (0.5 - u) * L)); }
    rimPts.push(rimPts[0].clone());
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 120, ilca ? 0.02 : 0.03, 6, true), white));
    if (ilca) {
      const deck = new THREE.Shape(); for (let i = 0; i <= 30; i++) { const u = i / 30; deck[i ? 'lineTo' : 'moveTo']((0.5 - u) * L, hw(u)); } for (let i = 30; i >= 0; i--) { const u = i / 30; deck.lineTo((0.5 - u) * L, -hw(u)); }
      const dg = new THREE.ShapeGeometry(deck); dg.rotateX(Math.PI / 2); dg.rotateY(Math.PI / 2);
      const dm = new THREE.Mesh(dg, white); dm.position.y = 0.22; g.add(dm);
      const ck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 1.2), grey); ck.position.set(0, 0.2, 1.1); g.add(ck);
    } else {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 1.4), grey); floor.position.set(0, -0.06, 0.25); g.add(floor);
      const thw = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.12), white); thw.position.set(0, 0.16, 0.05); g.add(thw);
      const mt = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.3), white); mt.position.set(0, 0.26, -0.8); g.add(mt);
      for (const sd of [-1, 1]) { const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.55, 6, 12), grey); bag.rotation.x = Math.PI / 2; bag.position.set(sd * 0.38, 0.03, -0.35); g.add(bag); }
    }
    // dümen + salma (su altında, berrak suda hafif görünür)
    const foil = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });
    const db = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.0, 0.28), foil); db.position.set(0, -0.6, ilca ? -0.2 : -0.1); g.add(db);
    const rd = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.8, 0.22), foil); rd.position.set(0, -0.25, L / 2 + 0.08); g.add(rd);
    // teçhizat: direk, bumba, (Optimist) gırcala, yelken
    const metal = new THREE.MeshStandardMaterial({ color: 0xc3c9d0, roughness: 0.25, metalness: 0.8 });
    const mastH = ilca ? 6.2 : 2.35, mastZ = ilca ? -L * 0.22 : -L * 0.36, boomH = ilca ? 0.9 : 0.56, boomL = ilca ? 2.75 : 2.0;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, mastH, 10), metal); mast.position.set(0, mastH / 2, mastZ); g.add(mast);
    const rig = new THREE.Group(); rig.position.set(0, 0, mastZ); g.add(rig);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, boomL, 8), metal); boom.rotation.x = Math.PI / 2; boom.position.set(0, boomH, boomL / 2); rig.add(boom);
    // yelken: dörtgen (Optimist: orsa yakası direkte, tepe gırcalayla arkada yukarıda) / üçgen (ILCA); kambur +x yönünde
    const corners = ilca ? [[0, boomH + 0.02], [0, mastH - 0.05], [0.25, mastH - 0.1], [boomL - 0.05, boomH + 0.02]]
      : [[0.02, 0.6], [0.02, 2.3], [1.3, 2.86], [1.95, 0.6]];       // [z (kıça), y]: karula, tepe (orsa), gırcala tepesi, köşe
    const NU = 14, NV = 12, sp = [], si = [], uv = [];
    const quad = (s, t) => { const [a, b, c, d] = corners; const lz = a[0] + (b[0] - a[0]) * t, ly = a[1] + (b[1] - a[1]) * t, rz = d[0] + (c[0] - d[0]) * t, ry = d[1] + (c[1] - d[1]) * t; return [lz + (rz - lz) * s, ly + (ry - ly) * s]; };
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const s = i / NU, t = j / NV, [z, y] = quad(s, t), chord = Math.hypot(...[0, 1].map(k => quad(1, t)[k] - quad(0, t)[k]));
      const depth = chord * 0.1 * Math.sin(Math.PI * Math.pow(s, 0.8)) * (1 - 0.35 * t);
      sp.push(depth, y, z); uv.push(s, t);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; si.push(a, c, b, b, c, d); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setIndex(si); sg.computeVertexNormals();
    const sail = new THREE.Mesh(sg, sailMat); rig.add(sail);
    if (!ilca) { const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), metal); const a = new THREE.Vector3(0, 0.85, 0.02), b = new THREE.Vector3(0, 2.84, 1.28); sprit.position.copy(a).lerp(b, 0.5); sprit.scale.y = a.distanceTo(b); sprit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); rig.add(sprit); }
    // yelkenci: rüzgarüstü küpeştede oturur (can yeleği rengi teknenin rengi)
    const sailor = new THREE.Group();                                  // model: dışa doğru -x (yatarak dengeler), bacaklar içeride
    const VESTS = [0xdc2626, 0xf97316, 0xfacc15, 0x16a34a, 0x2563eb, 0x7c3aed];
    const vest = new THREE.MeshStandardMaterial({ color: VESTS[Math.abs(Math.round(color.r * 7 + color.g * 13 + color.b * 5)) % VESTS.length], roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0b08a, roughness: 0.8 }), dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const lean = 0.75, dx = -Math.sin(lean), dy = Math.cos(lean);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 4, 10), vest); body.position.set(dx * 0.26, dy * 0.26 + 0.04, 0); body.rotation.z = lean; sailor.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), skin); head.position.set(dx * 0.6, dy * 0.6 + 0.04, 0); sailor.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark); cap.position.copy(head.position); cap.rotation.z = lean; sailor.add(cap);
    for (const z of [-0.09, 0.09]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.42, 4, 8), dark); leg.rotation.z = Math.PI / 2 + 0.15; leg.position.set(0.3, -0.02, z); sailor.add(leg); }
    sailor.scale.setScalar(0.85); sailor.position.set(0, ys(0.3), ilca ? 1.2 : 0.55); g.add(sailor);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { g, rig, sail, sailor, hw: hw(0.4), L, mastH };
  }
  const sailMat = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#f8fafc'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(100,116,139,.35)'; x.lineWidth = 1.5;
    for (let i = 1; i < 7; i++) { const y = i * 256 / 7; x.beginPath(); x.moveTo(0, y + 6); x.lineTo(256, y - 6); x.stroke(); }
    x.fillStyle = '#e2e8f0'; x.fillRect(0, 0, 6, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.85, emissive: 0x8090a0, emissiveIntensity: 0.12 });
  })();

  // ---------- şamandıra, hakem botu ----------
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.45 });
  function buoy(tall) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(tall ? new THREE.CylinderGeometry(0.35, 0.45, 1.4, 20) : new THREE.SphereGeometry(0.45, 20, 14), buoyMat);
    b.position.y = tall ? 0.4 : 0.15; b.castShadow = true; g.add(b);
    if (tall) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.352, 0.38, 0.18, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })); band.position.y = 0.6; g.add(band); }
    return g;
  }
  function committeeBoat() {
    const g = new THREE.Group();
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.3, clearcoat: 1 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 7.5), white); hull.position.y = 0.25; g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 4, 1), white); bow.rotation.set(-Math.PI / 2, Math.PI / 4, 0); bow.scale.set(1, 1, 0.5); bow.position.set(0, 0.35, -4.8); g.add(bow);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 2.6), white); cab.position.set(0, 1.2, -0.6); g.add(cab);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.45, 2.0), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.5 })); glass.position.set(0, 1.45, -0.6); g.add(glass);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 2.8), new THREE.MeshStandardMaterial({ color: 0xa47148, roughness: 0.8 })); deck.position.set(0, 0.72, 2.2); g.add(deck);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0xe5e7eb })); pole.position.set(0.8, 2.3, 2.6); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ color: 0xf97316, side: THREE.DoubleSide })); flag.position.set(0.8, 3.5, 3.05); flag.rotation.y = Math.PI / 2; g.add(flag);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  const cb = committeeBoat(); scene.add(cb);
  const pinB = buoy(false); scene.add(pinB);
  const marks = []; const finB = buoy(false); scene.add(finB);
  // start hattı: suyun üstünde ince sarı kesikli şerit (öğretici; gerçekte görünmez)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.55, depthWrite: false });
  const lineSegs = new THREE.Group(); scene.add(lineSegs);

  // ---------- tekne havuzu ----------
  const boats = new Map();
  function boatFor(b, cls) {
    let o = boats.get(b.id);
    if (!o || o.cls !== cls || o.color !== b.color) {
      if (o) scene.remove(o.m.g);
      o = { m: buildBoat(cls, new THREE.Color(b.color || '#94a3b8')), cls, color: b.color };
      scene.add(o.m.g); boats.set(b.id, o);
    }
    return o;
  }

  // ---------- kamera ve giriş ----------
  const cv = renderer.domElement;
  cv.style.touchAction = 'none';
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    st.yaw -= (e.clientX - drag.x) * 0.006; st.pitch = Math.max(-0.9, Math.min(0.5, st.pitch - (e.clientY - drag.y) * 0.004));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const up = () => { drag = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', () => { st.yaw = 0; st.pitch = -0.08; });
  const bar = host.querySelector('.v3-bar');
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.c === 'off') { toggle(false); window.dispatchEvent(new Event('sim3d-off')); return; }
    st.cam = b.dataset.c; st.yaw = 0; st.pitch = st.cam === 'fp' ? -0.08 : -0.25;
    for (const x of bar.querySelectorAll('button')) x.classList.toggle('on', x === b);
  });

  function fit() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cv.style.width = w + 'px'; cv.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(fit).observe(host);

  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
  let first = true, t0 = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const c = ctxObj;
    if (!c.active || document.hidden) return;
    const time = (now - t0) / 1000;
    const sc = window.SimScene;
    if (!sc) return;
    const cls = sc.cls || 'optimist';
    st.K = boatLenM(cls) / 50;
    const w = sc.wind;
    // çevre
    const LN = sc.line, put = (o, p) => { const v = P(p.x, p.y); o.position.set(v.x, 0, v.z); };
    put(pinB, LN.pin); put(cb, LN.boat); cb.rotation.y = -w * DEG;
    cb.position.y = sea.heightAt(cb.position.x, cb.position.z) * 0.5;
    while (marks.length < sc.marks.length) { const m = buoy(true); scene.add(m); marks.push(m); }
    marks.forEach((m, i) => { const mk = sc.marks[i]; m.visible = !!mk; if (mk) { put(m, mk); m.position.y = sea.heightAt(m.position.x, m.position.z); } });
    finB.visible = !!sc.fin; if (sc.fin) put(finB, sc.fin.boat);
    if (lineSegs.userData.key !== `${LN.pin.x},${LN.pin.y},${LN.boat.x},${st.K}`) {
      lineSegs.userData.key = `${LN.pin.x},${LN.pin.y},${LN.boat.x},${st.K}`; lineSegs.clear();
      const a = P(LN.pin.x, LN.pin.y), b = P(LN.boat.x, LN.boat.y), d = b.clone().sub(a), n = Math.floor(d.length() / 0.8);
      for (let i = 0; i < n; i += 2) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.8 * d.length() / n).rotateX(-Math.PI / 2), lineMat); m.position.copy(a).addScaledVector(d, (i + 0.5) / n); m.position.y = 0.06; m.rotation.y = Math.atan2(d.x, d.z); lineSegs.add(m); }
    }
    // tekneler
    const seen = new Set();
    let mine = null;
    for (const b of sc.boats) {
      if (b.gone) continue;
      seen.add(b.id);
      const o = boatFor(b, cls), m = o.m;
      if (b.mine) mine = { b, o };
      const p = P(b.x, b.y);
      const tack = E.norm180(w - b.h) > 0 ? 1 : -1;                 // +1: rüzgar sancaktan
      const spd = Math.max(0, Math.min(1.3, (b.v || 0) / 55));
      const heel = tack * (4 + 10 * spd) * DEG;
      const hy = sea.heightAt(p.x, p.z);
      m.g.position.set(p.x, hy * 0.85 + 0.02, p.z);
      m.g.rotation.set(Math.sin(time * 1.7 + b.x) * 0.02, -b.h * DEG, heel, 'YXZ');
      const pose = sc.poses && sc.poses[b.id];
      const beta = pose ? pose.beta : -tack * 25;
      m.rig.rotation.y = beta * DEG;
      m.sail.scale.x = beta >= 0 ? 1 : -1;
      if (pose && pose.flutter > 0.15) m.sail.rotation.y = Math.sin(time * 18 + b.x) * 0.06 * pose.flutter; else m.sail.rotation.y = 0;
      m.sailor.position.x = tack * (m.hw - 0.02); m.sailor.rotation.y = tack > 0 ? Math.PI : 0;
      m.g.visible = true;
    }
    for (const [id, o] of boats) if (!seen.has(id)) o.m.g.visible = false;
    // kamera
    const focus = mine ? mine.o.m.g.position : P(LN.pin.x * 0.5 + LN.boat.x * 0.5, LN.pin.y + 60);
    const hd = mine ? mine.b.h * DEG : (w + 180) * DEG;
    const fwd = new THREE.Vector3(Math.sin(hd), 0, -Math.cos(hd));
    const right = new THREE.Vector3(Math.cos(hd), 0, Math.sin(hd));
    let mode = st.cam; if (mode === 'fp' && !mine) mode = 'chase';
    if (mode === 'fp') {
      const g = mine.o.m.g;
      const eye = new THREE.Vector3(mine.o.m.sailor.position.x * 0.85, 1.05, mine.o.m.L * 0.12);      // yelkencinin başı (yerel)
      g.updateMatrixWorld(); camPos.copy(eye).applyMatrix4(g.matrixWorld);
      const yaw = hd + st.yaw, pit = st.pitch;
      camLook.copy(camPos).add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)));
      camera.position.copy(camPos); camera.up.set(0, 1, 0);
      camera.lookAt(camLook); camera.rotateZ(g.rotation.z * 0.7 * Math.cos(st.yaw)); camera.fov = 70;
    } else {
      const dist = mode === 'top' ? 26 : 7.5, hgt = mode === 'top' ? 24 : 2.6;
      const yaw = hd + st.yaw;
      tmp.set(-Math.sin(yaw) * dist, hgt, Math.cos(yaw) * dist).add(focus);
      if (first) camPos.copy(tmp); else camPos.lerp(tmp, 0.12);
      camera.position.copy(camPos); camera.up.set(0, 1, 0);
      camera.lookAt(focus.x + fwd.x * (mode === 'top' ? 3 : 2), 0.8, focus.z + fwd.z * (mode === 'top' ? 3 : 2)); camera.fov = 55;
    }
    first = false;
    camera.updateProjectionMatrix();
    sea.update(time, { amp: 0.02 + 0.03 * (sc.seaK || 0.5), chop: 0.6, focus });
    renderer.render(scene, camera);
  }
  const ctxObj = { active: false, fit };
  requestAnimationFrame(frame);
  return ctxObj;
}

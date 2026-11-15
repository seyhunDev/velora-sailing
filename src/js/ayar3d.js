// Optimist yelken ayarı: 3D görünüş (three.js, src/js/vendor). Ayar modeli ayar.js'te; her karede window.TrimState okunur.
// Eksenler (metre): X baş yönü, Y yukarı, Z rüzgaraltı (yelken bu yana açılır). Su yüzeyi y = 0.
// Ölçüler sınıf kuralına yakın: boy 2,31, en 1,13, direk 2,35, gırcala 2,286; orsa 1,73, tepe 1,24, arka yaka 2,80, alt yaka ≈1,90.
// Direk bağı boşlukları görünsün diye büyütülmüş (1 mm → 12 mm).
import * as THREE from 'three';

const host = document.getElementById('view3d');
const viewBtn3d = document.querySelector('#segView [data-v="3d"]');

function no3d() {
  document.body.dataset.view = '2d';
  document.body.classList.add('no3d');
  if (viewBtn3d) { viewBtn3d.disabled = true; viewBtn3d.title = 'Bu cihazda 3D (WebGL) açılamadı'; }
  window.dispatchEvent(new Event('trim-no3d'));
}

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  if (!renderer.getContext()) throw new Error('webgl yok');
} catch (e) { renderer = null; no3d(); }

if (renderer) start();

function start() {
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Optimist 3D: sürükleyerek döndür');

  const scene = new THREE.Scene();
  const SKY = new THREE.Color(0x0e2a44);
  scene.background = SKY;
  scene.fog = new THREE.Fog(0x0e2a44, 14, 34);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 120);
  scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x0b2a44, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(-4, 7, 5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x93c5fd, 0.5);
  rim.position.set(3, 2, -5);
  scene.add(rim);

  // ---------- su ----------
  const waterGeo = new THREE.PlaneGeometry(44, 44, 70, 70);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
    color: 0x0c4a6e, roughness: 0.62, metalness: 0, transparent: true, opacity: 0.8, depthWrite: false,
  }));
  scene.add(water);
  const wBase = waterGeo.attributes.position.array.slice();

  // ---------- tekne ----------
  const lerp = (p, q, t) => p + (q - p) * t;
  const boat = new THREE.Group();
  scene.add(boat);
  // Optimist (IODA): kutu baş (pram), düz taban + alçak kine, dışa açık bordalar, baş aynası yüksek (rocker).
  const L = 2.31;
  const hs = u => u < 0.42 ? 0.565 - 0.135 * ((0.42 - u) / 0.42) ** 2 : 0.565 - 0.22 * ((u - 0.42) / 0.58) ** 2;   // küpeşte yarı eni (kıç 0,86, baş 0,69 m)
  const hcF = u => hs(u) * (u < 0.42 ? 0.8 : 0.8 - 0.06 * ((u - 0.42) / 0.58));                                    // kine yarı eni
  const yb = u => u < 0.42 ? -0.12 + 0.07 * ((0.42 - u) / 0.42) ** 2 : -0.12 + 0.30 * ((u - 0.42) / 0.58) ** 2.2;  // omurga (rocker)
  const ys = u => 0.27 + 0.03 * u + 0.06 * u ** 4;                                                                 // küpeşte (başa doğru kalkar)
  const xs = u => -L / 2 + u * L;
  const section = u => {
    const h = hs(u), b = yb(u), c = hcF(u), yc = b + 0.04;
    return [[-h, ys(u)], [-c, yc], [0, b], [c, yc], [h, ys(u)]];        // [z, y] iskeleden sancağa
  };
  {
    const N = 40, pos = [];
    const P = (u, k) => { const s = section(u)[k]; return [xs(u), s[1], s[0]]; };
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      for (let k = 0; k < 4; k++) {
        const a = P(u0, k), b = P(u1, k), c = P(u1, k + 1), d = P(u0, k + 1);
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    for (const u of [0, 1]) {                                            // kıç ve baş aynası
      const s = section(u), cy = (ys(u) + yb(u)) / 2, x = xs(u);
      for (let k = 0; k < 4; k++) {
        const a = [x, cy, 0], b = [x, s[k][1], s[k][0]], c = [x, s[k + 1][1], s[k + 1][0]];
        if (u === 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
      }
      pos.push(x, cy, 0, x, s[4][1], s[4][0], x, s[0][1], s[0][0]);
    }
    // her üçgenin yüzü dışa baksın (dış beyaz, iç gri malzeme için)
    for (let i = 0; i < pos.length; i += 9) {
      const a = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]), b = new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]), c = new THREE.Vector3(pos[i + 6], pos[i + 7], pos[i + 8]);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const m = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      const o = m.clone().sub(new THREE.Vector3(Math.max(-0.9, Math.min(0.9, m.x)), 0.1, 0));
      if (n.dot(o) < 0) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    boat.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.02, side: THREE.FrontSide })));
    boat.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.7, side: THREE.BackSide })));
  }
  const tubeAlong = (pts, r, color, parent = boat, rough = 0.6) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, r, 8, false),
      new THREE.MeshStandardMaterial({ color, roughness: rough }));
    parent.add(m); return m;
  };
  // usturmaça: küpeşte boyunca kalın lastik (iki yanda, baş ve kıç aynasında)
  {
    const rim = [];
    for (let i = 0; i <= 24; i++) { const u = i / 24; rim.push(new THREE.Vector3(xs(u), ys(u) + 0.008, -hs(u))); }
    for (let i = 0; i <= 8; i++) { const z = lerp(-hs(1), hs(1), i / 8); rim.push(new THREE.Vector3(xs(1) + 0.005, ys(1) + 0.008, z)); }
    for (let i = 24; i >= 0; i--) { const u = i / 24; rim.push(new THREE.Vector3(xs(u), ys(u) + 0.008, hs(u))); }
    for (let i = 0; i <= 8; i++) { const z = lerp(hs(0), -hs(0), i / 8); rim.push(new THREE.Vector3(xs(0) - 0.005, ys(0) + 0.008, z)); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true, 'catmullrom', 0.1), 240, 0.026, 8, true),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 }));
    boat.add(m);
  }
  // iç küpeşte (ahşap şerit)
  for (const side of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 20; i++) { const u = 0.02 + i / 20 * 0.96; pts.push(new THREE.Vector3(xs(u), ys(u) - 0.035, side * (hs(u) - 0.045))); }
    tubeAlong(pts, 0.012, 0xb45309, boat, 0.7);
  }
  const box = (w, h, d, color, x, y, z, parent = boat, rough = 0.6) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: rough }));
    m.position.set(x, y, z); parent.add(m); return m;
  };
  const uM = 0.79;                                                       // direk yeri (baştan ~0,48 m)
  const MF = new THREE.Vector3(xs(uM), yb(uM) + 0.02, 0);                // direk ayağı
  box(0.16, 0.035, hs(uM) * 2 - 0.06, 0xd6a36a, xs(uM), ys(uM) - 0.05, 0, boat, 0.7);     // direk oturağı (ahşap thwart)
  box(0.07, 0.07, 0.07, 0x1e293b, xs(uM), yb(uM) + 0.05, 0);                            // direk ıskaçası (step)
  // salma kutusu + üst kapak
  box(0.36, 0.34, 0.075, 0xf1f5f9, 0.02, yb(0.5) + 0.17, 0);
  box(0.4, 0.03, 0.1, 0xd6a36a, 0.02, yb(0.5) + 0.355, 0, boat, 0.7);
  // yüzdürme torbaları: iki yanda uzun, başta enine (gri, yuvarlak)
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.55 });
  for (const side of [-1, 1]) {
    const bg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.82, 6, 14), bagMat);
    bg.rotation.z = Math.PI / 2; bg.position.set(-0.1, yb(0.45) + 0.14, side * 0.4); bg.scale.set(1, 1, 1.1); boat.add(bg);
  }
  {
    const bg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.36, 6, 14), bagMat);
    bg.rotation.x = Math.PI / 2; bg.position.set(xs(0.92), yb(0.92) + 0.1, 0); boat.add(bg);
  }
  // ayak kayışları (hiking straps): kıçtan salma kutusuna, lacivert
  for (const side of [-1, 1]) {
    const a = xs(0.06), b2 = -0.17;
    tubeAlong([new THREE.Vector3(a, yb(0.06) + 0.05, side * 0.13), new THREE.Vector3((a + b2) / 2, yb(0.25) + 0.11, side * 0.14), new THREE.Vector3(b2, yb(0.43) + 0.06, side * 0.06)], 0.01, 0x1e3a8a, boat, 0.8);
  }
  // salma (daggerboard): kutudan aşağı, tutamak üstte
  const foilMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
  const dagger = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.18, 0.018), foilMat);
  dagger.position.set(0.02, yb(0.5) - 0.2, 0); boat.add(dagger);
  box(0.12, 0.05, 0.03, 0x1e293b, 0.02, yb(0.5) + 0.41, 0);
  // iskota köprüsü (bridle): kıç aynasında köşeden köşeye halat, ortada makara
  const xT = xs(0);
  const BRIDLE = new THREE.Vector3(xT + 0.02, ys(0) + 0.1, 0);
  tubeAlong([new THREE.Vector3(xT + 0.02, ys(0) + 0.02, -hs(0) + 0.06), BRIDLE, new THREE.Vector3(xT + 0.02, ys(0) + 0.02, hs(0) - 0.06)], 0.005, 0xe2e8f0);
  const bridleBlock = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 }));
  bridleBlock.position.copy(BRIDLE); boat.add(bridleBlock);
  // dümen grubu: iğneli kafa, uzun dar pala, yeke + uzatma (yeke grubun +X yönünde; rotation.y ile döner)
  const rudderG = new THREE.Group(); rudderG.position.set(xT - 0.05, 0, 0); boat.add(rudderG);
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.95, 0.02), foilMat);
  rudder.position.set(-0.1, -0.2, 0); rudderG.add(rudder);
  box(0.12, 0.2, 0.05, 0x334155, -0.03, 0.3, 0, rudderG);
  const rod = (a, b, r, color, parent) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2 }));
    place(m, a, b); parent.add(m); return m;
  };
  function place(m, a, b) {
    const d = new THREE.Vector3().subVectors(b, a), l = d.length() || 1e-6;
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(1, l, 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / l));
  }
  rod(new THREE.Vector3(0, 0.38, 0), new THREE.Vector3(0.68, 0.41, 0), 0.017, 0xa16207, rudderG);         // yeke
  rod(new THREE.Vector3(0.68, 0.41, 0), new THREE.Vector3(1.2, 0.36, -0.12), 0.009, 0x0f172a, rudderG);   // uzatma (rüzgarüstüne)
  // su çıkarma kovası (bailer)
  box(0.12, 0.08, 0.1, 0x38bdf8, -0.55, yb(0.25) + 0.06, 0.24, boat, 0.5);
  // ---------- teçhizat (direk çerçevesi: Y direk boyunca, -X kıça) ----------
  const rig = new THREE.Group();
  rig.position.copy(MF);
  boat.add(rig);
  const metal = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.55 });
  const MAST = 2.35, MR = 0.022;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(MR, MR * 1.05, MAST, 16), metal(0xcbd5e1));
  mast.position.y = MAST / 2; rig.add(mast);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(MR * 1.2, MR * 1.2, 0.04, 12), metal(0x0f172a));
  cap.position.y = MAST; rig.add(cap);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 12), metal(0xcbd5e1)); rig.add(boom);
  const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 10), metal(0xe2e8f0)); rig.add(sprit);
  const lineMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const mkLine = (r, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), lineMat(c)); rig.add(m); return m; };
  const vang = [mkLine(0.005, 0xef4444), mkLine(0.005, 0xef4444), mkLine(0.005, 0xef4444)];
  const vangBlock = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), metal(0x0f172a)); rig.add(vangBlock);
  const cunning = mkLine(0.005, 0xf97316);
  const outhaul = mkLine(0.005, 0xf97316);
  const snotter = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), metal(0x0f172a)); rig.add(snotter);
  // ana iskota: bumba ucundan kıç köprüsündeki makaraya, oradan bumbadaki cırcır makaraya, oradan yelkencinin eline
  const sheetSeg = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 6), lineMat(0xe2e8f0)); boat.add(m); return m; });
  const ratchet = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), metal(0x0f172a)); boat.add(ratchet);
  const ties = Array.from({ length: 8 }, () => {
    const tg = new THREE.TorusGeometry(1, 0.12, 6, 18); tg.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 }));
    rig.add(m); return m;
  });
  // rüzgar gülü (direk tepesinde): ok rüzgarın geldiği yönü gösterir
  const vane = new THREE.Group(); vane.position.y = MAST + 0.03; rig.add(vane);
  {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 6), metal(0x0f172a));
    stick.rotation.z = Math.PI / 2; stick.position.x = 0.04; vane.add(stick);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0xf472b6 }));
    head.rotation.z = -Math.PI / 2; head.position.x = 0.21; vane.add(head);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.004), new THREE.MeshStandardMaterial({ color: 0xf472b6 }));
    fin.position.x = -0.09; vane.add(fin);
  }

  // ---------- yelken (Coons yüzeyi, kambur + twist) ----------
  const NS = 26, NT = 22;
  const sailGeo = new THREE.PlaneGeometry(1, 1, NS, NT);
  const sailTex = makeSailTexture();
  const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ map: sailTex, side: THREE.DoubleSide, roughness: 0.8, transparent: true, opacity: 0.84, emissive: 0x64748b, emissiveIntensity: 0.32 }));
  rig.add(sail);
  const ghostMat = new THREE.LineDashedMaterial({ color: 0xfbbf24, dashSize: 0.06, gapSize: 0.04 });
  const ghostLine = new THREE.Line(new THREE.BufferGeometry(), ghostMat); ghostLine.visible = false; rig.add(ghostLine);
  // arka yaka şeritleri (telltales)
  const tells = [0.3, 0.55, 0.82].map(() => {
    const g = new THREE.PlaneGeometry(0.14, 0.014); g.translate(0.07, 0, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf472b6, side: THREE.DoubleSide }));
    rig.add(m); return m;
  });

  function makeSailTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#f8fafc'; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = 'rgba(100,116,139,.35)'; x.lineWidth = 2;                // panel dikişleri (çapraz kesim)
    for (let i = 1; i < 9; i++) { const y = 512 - i * 512 / 9; x.beginPath(); x.moveTo(0, y + 26); x.lineTo(512, y - 26); x.stroke(); }
    x.fillStyle = 'rgba(148,163,184,.35)';                                   // köşe takviyeleri
    for (const [a, b, cc] of [[[0, 512], [90, 512], [0, 430]], [[512, 512], [420, 512], [512, 430]], [[512, 0], [430, 0], [512, 80]], [[0, 0], [70, 0], [0, 70]]]) {
      x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.lineTo(...cc); x.fill();
    }
    x.fillStyle = '#334155'; x.fillRect(0, 0, 7, 512);                       // orsa yakası şeridi
    x.strokeStyle = '#38bdf8'; x.lineWidth = 4;                              // derinlik şeritleri (draft stripes)
    for (const t of [0.25, 0.5, 0.78]) { const y = 512 - t * 512; x.beginPath(); x.moveTo(14, y); x.lineTo(500, y); x.stroke(); }
    x.strokeStyle = '#475569'; x.lineWidth = 6;                              // balenler
    for (const t of [0.38, 0.66]) { const y = 512 - t * 512; x.beginPath(); x.moveTo(420, y); x.lineTo(508, y); x.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // 2B yelken düzlemi: a = kıça mesafe, h = direk boyunca yükseklik (m)
  const V2 = (a, h) => ({ a, h });
  const mix = (p, q, t) => V2(lerp(p.a, q.a, t), lerp(p.h, q.h, t));
  function circles(A, r1, B, r2) {
    const dx = B.a - A.a, dy = B.h - A.h, d = Math.hypot(dx, dy);
    const k = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - k * k));
    const xm = A.a + k * dx / d, ym = A.h + k * dy / d;
    const p1 = V2(xm + h * dy / d, ym - h * dx / d), p2 = V2(xm - h * dy / d, ym + h * dx / d);
    return p1.h > p2.h ? p1 : p2;
  }
  const TIE_SC = 0.012, G_H = 0.56, TACK_H = 0.59, HEAD_H = TACK_H + 1.73;
  function plan(v, sh) {
    const la = sh.lift * Math.PI / 180;
    const G = V2(0, G_H), bdir = V2(Math.cos(la), Math.sin(la));
    const C = V2(G.a + bdir.a * 1.9, G.h + bdir.h * 1.9);
    const BE = V2(G.a + bdir.a * 2.01, G.h + bdir.h * 2.01);
    const luff = v.ties.map((g, i) => V2(MR + 0.006 + g * TIE_SC, lerp(HEAD_H, TACK_H, i / 7)));
    let Pk = circles(V2(MR, HEAD_H), 1.24, C, 2.8);
    const S = V2(0, Pk.h - Math.sqrt(Math.max(0, 2.286 ** 2 - Pk.a ** 2)));
    const ul = Math.hypot(Pk.a - S.a, Pk.h - S.h), push = (v.sprit - 0.5) * 0.08;
    Pk = V2(Pk.a + (Pk.a - S.a) / ul * push, Pk.h + (Pk.h - S.h) / ul * push);
    return { G, C, BE, luff, Pk, S, T: luff[7], H: luff[0] };
  }
  const bez = (p0, c, p1, t) => V2((1 - t) ** 2 * p0.a + 2 * (1 - t) * t * c.a + t * t * p1.a, (1 - t) ** 2 * p0.h + 2 * (1 - t) * t * c.h + t * t * p1.h);
  function edges(g, sh) {
    const { C, Pk, luff, T, H } = g;
    const dx = Pk.a - C.a, dy = Pk.h - C.h, dl = Math.hypot(dx, dy);
    const L1 = V2((C.a + Pk.a) / 2 + dy / dl * (0.085 - sh.twist * 0.0016), (C.h + Pk.h) / 2 - dx / dl * (0.085 - sh.twist * 0.0016));
    const headC = V2((H.a + Pk.a) / 2 - 0.02, (H.h + Pk.h) / 2 + 0.05);
    const footC = V2((T.a + C.a) / 2, (T.h + C.h) / 2 - 0.03);
    const luffAt = t => {                                                  // t: 0 alt (karula), 1 üst; bağlar arasında öne kavis
      const f = t * 7, i = Math.min(6, Math.floor(f)), r = f - i;
      const lo = luff[7 - i], hi = luff[6 - i];
      return V2(lerp(lo.a, hi.a, r) - Math.sin(Math.PI * r) * 0.01, lerp(lo.h, hi.h, r));
    };
    return {
      foot: s => bez(T, footC, C, s), head: s => bez(H, headC, Pk, s),
      luff: luffAt, leech: t => bez(C, L1, Pk, t),
    };
  }
  const depthAt = (sh, t) => (t < 0.5 ? lerp(sh.depth[0], sh.depth[1], t / 0.5) : lerp(sh.depth[1], sh.depth[2], (t - 0.5) / 0.5)) / 100;
  const camber = (s, p) => s < p ? 1 - ((p - s) / p) ** 2 : 1 - ((s - p) / (1 - p)) ** 2;
  function to3(pt, z, sh, g, out) {                                        // düzlem → direk çerçevesi (iskota + twist ile döndür)
    const tt = Math.max(0, Math.min(1, (pt.h - TACK_H) / (g.Pk.h - TACK_H)));
    const phi = (sh.sheet + sh.twist * tt) * Math.PI / 180;
    const x = -pt.a, c = Math.cos(phi), s = Math.sin(phi);
    return out.set(x * c + z * s, pt.h, -x * s + z * c);
  }
  function surf(e, g, s, t) {
    const c0 = e.foot(s), c1 = e.head(s), d0 = e.luff(t), d1 = e.leech(t);
    const { T, C, H, Pk } = g;
    return V2(
      (1 - t) * c0.a + t * c1.a + (1 - s) * d0.a + s * d1.a - ((1 - s) * (1 - t) * T.a + s * (1 - t) * C.a + (1 - s) * t * H.a + s * t * Pk.a),
      (1 - t) * c0.h + t * c1.h + (1 - s) * d0.h + s * d1.h - ((1 - s) * (1 - t) * T.h + s * (1 - t) * C.h + (1 - s) * t * H.h + s * t * Pk.h));
  }
  const tmp = new THREE.Vector3();
  const fx = { luff: 0, time: 0 };
  function sailPoint(e, g, sh, s, t, out) {
    const p = surf(e, g, s, t);
    const d0 = e.luff(t), d1 = e.leech(t), cl = Math.hypot(d1.a - d0.a, d1.h - d0.h);
    let z = depthAt(sh, t) * cl * camber(s, sh.draftPos);
    if (fx.luff > 0) {                                                     // ön yaka pırpırı: kambur içeri çöker, dalgalanır
      const f = Math.max(0, 1 - s / 0.5) ** 1.5;
      z = z * (1 - fx.luff * f) - fx.luff * f * cl * 0.03 * (0.7 + 0.6 * Math.sin(fx.time * 26 + t * 16 + s * 10));
      z += fx.luff * 0.012 * cl * Math.sin(fx.time * 19 + t * 9) * s;     // arka yaka da hafif titrer
    }
    return to3(p, z, sh, g, out);
  }

  function buildSail(v, sh) {
    const g = plan(v, sh), e = edges(g, sh);
    const pos = sailGeo.attributes.position;
    for (let j = 0; j <= NT; j++) {
      const t = 1 - j / NT;                                                // PlaneGeometry: ilk satır üstte
      for (let i = 0; i <= NS; i++) {
        sailPoint(e, g, sh, i / NS, t, tmp);
        pos.setXYZ(j * (NS + 1) + i, tmp.x, tmp.y, tmp.z);
      }
    }
    pos.needsUpdate = true;
    sailGeo.computeVertexNormals();
    sailGeo.computeBoundingSphere();
    return { g, e };
  }
  function outline(v, sh) {
    const g = plan(v, sh), e = edges(g, sh), pts = [];
    const add = (s, t) => pts.push(sailPoint(e, g, sh, s, t, new THREE.Vector3()));
    for (let i = 0; i <= 20; i++) add(i / 20, 0);
    for (let i = 1; i <= 20; i++) add(1, i / 20);
    for (let i = 19; i >= 0; i--) add(i / 20, 1);
    for (let i = 19; i >= 0; i--) add(0, i / 20);
    for (const t of [0.25, 0.5, 0.78]) { pts.push(pts[pts.length - 1].clone()); for (let i = 0; i <= 20; i++) add(i / 20, t); for (let i = 20; i >= 0; i--) add(i / 20, t); }
    return pts;
  }

  // ---------- kamera: sürükle döndür, tekerlek / iki parmak yakınlaştır ----------
  const PRESET = { '34': [-2.1, 0.3, 1], yan: [-1.57, 0.1, 1], arka: [-2.95, 0.3, 1], ust: [-2.2, 1.4, 0.75] };
  const cam = { th: PRESET['34'][0], ph: PRESET['34'][1], zoom: 1, goal: null };
  const target = new THREE.Vector3(-0.3, 1.3, 0.3);
  const ptrs = new Map();
  let pinch0 = 0, zoom0 = 1;
  const cv = renderer.domElement;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); cam.goal = null; markCam(null);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = cam.zoom; } });
  cv.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1) {
      cam.th -= (e.clientX - p.x) * 0.0085;
      cam.ph = Math.max(0.03, Math.min(1.45, cam.ph + (e.clientY - p.y) * 0.0065));
    }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) cam.zoom = Math.max(0.45, Math.min(2.2, zoom0 * pinch0 / d)); }
  });
  const up = e => { ptrs.delete(e.pointerId); pinch0 = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = Math.max(0.45, Math.min(2.2, cam.zoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  const camBtns = document.getElementById('camBtns');
  function markCam(k) { if (camBtns) for (const b of camBtns.querySelectorAll('button')) b.classList.toggle('on', b.dataset.c === k); }
  if (camBtns) camBtns.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const [th, ph, zoom] = PRESET[b.dataset.c]; cam.goal = { th, ph, zoom }; markCam(b.dataset.c);
  });
  markCam('34');

  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(fit).observe(host);
  fit();

  // ---------- arkadan ders: açan / kapatan rüzgar, sağanak ----------
  // Açılar (derece): 0 = başlangıç rotası, + = rüzgarüstüne (-Z). W: rüzgarın geldiği yön, H: tekne başı, AWA = W - H.
  // Tekne yerinde durur; su, rüzgar çizgileri ve dümen suyu hareketi gösterir. Kamera tekneye arkadan bakar.
  const LS = { id: 'kapatti', t: 0, play: false, gust: 0.65, W: 45, H: 0, G: 0, tl: 0, sheetIn: 0, prevH: 0, done: false };
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const seg = (t, a, b) => ease((t - a) / (b - a));
  const LESSONS = {
    kapatti: {
      name: 'Kapattı', sub: 'pırpır → kafayı aç', end: 10,
      steps: [[0, 'Rüzgar sabit, dümen düz. Yelken dolu, şeritler akıyor.'],
        [2.4, 'Rüzgar kapattı (header): baştan geliyor, yelkenin ön yakası pırpırlıyor.'],
        [4, 'Yekeyi kendine çek: kafayı aç (rüzgaraltına dön).'],
        [6.6, 'Yelken yeniden doldu. Dümen düz, yeni rotada devam.']],
      at: t => ({ W: 45 - 12 * seg(t, 2.4, 3.4), H: -12 * seg(t, 4, 6.6), G: 0, sheetIn: 0 }),
    },
    acti: {
      name: 'Açtı', sub: 'tüyler düştü → orsala', end: 10,
      steps: [[0, 'Rüzgar sabit, dümen düz. Yelken dolu, şeritler akıyor.'],
        [2.4, 'Rüzgar açtı (lift): yandan geliyor, arka yakadaki tüyler düştü, yelken fazla kapalı kaldı.'],
        [4, 'Yekeyi karşıya it: orsala (rüzgarüstüne dön), rüzgar sana çektirdi.'],
        [6.6, 'Şeritler yeniden akıyor. Daha yüksek rotada devam.']],
      at: t => ({ W: 45 + 12 * seg(t, 2.4, 3.4), H: 12 * seg(t, 4, 6.6), G: 0, sheetIn: 0 }),
    },
    saganak: {
      name: 'Sağanak', sub: 'iskotayı gücü kadar çek', end: 11,
      steps: [[0, 'Sağanak geliyor: rüzgarüstünde suyun koyulaştığı yer.'],
        [2.2, 'Sağanak vurdu: rüzgar arttı, tekne yatıyor.'],
        [3.4, 'İskotayı sağanağın gücü kadar çek, yüklen: tekne doğrulup hızlanıyor.'],
        [7.2, 'Sağanak geçti: iskotayı aynı ölçüde geri ver.']],
      at: t => { const g = LS.gust * (seg(t, 2.2, 3.0) - seg(t, 7.2, 8.4)); return { W: 45, H: 0, G: g, sheetIn: LS.gust * (seg(t, 3.4, 4.8) - seg(t, 7.4, 8.8)) }; },
    },
  };
  // su üstünde rüzgar çizgileri (rüzgar yönünde akar) ve sağanak lekesi
  const streakMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.35, depthWrite: false });
  const streaks = Array.from({ length: 70 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.025), streakMat); m.rotation.x = -Math.PI / 2;
    m.position.set((Math.random() - 0.5) * 26, 0.03, (Math.random() - 0.5) * 26); m.visible = false; scene.add(m); return m;
  });
  const gustPatch = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.MeshBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.0, depthWrite: false }));
  gustPatch.renderOrder = 3; gustPatch.rotation.x = -Math.PI / 2; gustPatch.position.y = 0.07; gustPatch.visible = false; scene.add(gustPatch);
  // dümen suyu (köpük): kıçtan geriye iki çizgi
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xf0f9ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const wake = new THREE.Group(); boat.add(wake); wake.visible = false;
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.03), wakeMat); m.rotation.x = -Math.PI / 2;
    m.rotation.z = side * 0.18; m.position.set(xs(0) - 0.8, 0.02, side * 0.36); wake.add(m);
  }
  // yeke hareket oku
  const tArrow = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 12), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
  tArrow.visible = false; boat.add(tArrow);

  const $ = id => document.getElementById(id);
  const lessonEl = $('lessonList'), stepsEl = $('lessonSteps'), gustRow = $('gustRow');
  function drawLessonUi() {
    if (!lessonEl) return;
    lessonEl.innerHTML = Object.entries(LESSONS).map(([k, l]) => `<button data-l="${k}" class="${LS.id === k ? 'on' : ''}"><b>${l.name}</b><small>${l.sub}</small></button>`).join('');
    stepsEl.innerHTML = LESSONS[LS.id].steps.map(([t, x], i) => `<li data-i="${i}"><span>${String(Math.floor(t)).padStart(2, '0')} sn</span>${x}</li>`).join('');
    gustRow.hidden = LS.id !== 'saganak';
    for (const b of $('segGust').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.g) === LS.gust);
    $('btnPlay').textContent = LS.play ? 'Durdur' : LS.done ? 'Yeniden oynat' : 'Oynat';
  }
  function restart() { LS.t = 0; LS.play = true; LS.done = false; LS.prevH = 0; drawLessonUi(); }
  if (lessonEl) {
    lessonEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; LS.id = b.dataset.l; restart(); });
    $('segGust').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; LS.gust = Number(b.dataset.g); restart(); });
    $('btnPlay').addEventListener('click', () => { if (LS.done) restart(); else { LS.play = !LS.play; drawLessonUi(); } });
    $('btnRestart').addEventListener('click', restart);
    drawLessonUi();
  }
  let lessonCam = false;
  function enterLesson(on) {
    if (on === lessonCam) return;
    lessonCam = on;
    if (on) { cam.goal = { th: 3.0, ph: 0.24, zoom: 0.92 }; markCam(null); restart(); }
    else { cam.goal = { th: PRESET['34'][0], ph: PRESET['34'][1], zoom: 1 }; markCam('34'); }
    for (const m of streaks) m.visible = on;
    wake.visible = on; tArrow.visible = on; gustPatch.visible = on;
    boat.rotation.y = 0; rudderG.rotation.y = 0; LS.tl = 0;
  }
  const hud = $('lessonHud');
  function lessonStep(dt) {
    const L = LESSONS[LS.id];
    if (LS.play) { LS.t += dt; if (LS.t >= L.end) { LS.t = L.end; LS.play = false; LS.done = true; drawLessonUi(); } }
    const k = L.at(LS.t);
    const dH = (k.H - LS.prevH) / Math.max(dt, 1e-3); LS.prevH = k.H;
    LS.tl = LS.play ? Math.max(-0.5, Math.min(0.5, LS.tl + (dH * 0.05 - LS.tl) * Math.min(1, dt * 6))) : LS.tl * (1 - Math.min(1, dt * 6));
    Object.assign(LS, k);
    const awa = LS.W - LS.H;
    const sheet = 11 - 4 * LS.sheetIn;                                     // bumbanın tekne eksenine açısı
    const ideal = sheet + 34;
    LS.luff = Math.max(0, Math.min(1, (ideal - 5 - awa) / 5));             // pırpır
    LS.stall = Math.max(0, Math.min(1, (awa - ideal - 5) / 5));            // arka tüyler düşer
    LS.heel = 9 + 22 * LS.G - 16 * LS.sheetIn * (LS.G > 0.05 ? 1 : 0) * 0.7 - 6 * LS.luff;
    LS.speed = 1 + 0.6 * LS.G + 0.25 * LS.sheetIn - 0.5 * LS.luff - 0.35 * LS.stall;
    // arayüz: o anki adım ve okumalar
    let cur = 0; L.steps.forEach(([t], i) => { if (LS.t >= t) cur = i; });
    const nowEl = $('lessonNow'); if (nowEl && nowEl.dataset.k !== LS.id + cur) { nowEl.dataset.k = LS.id + cur; nowEl.textContent = L.steps[cur][1]; }
    if (stepsEl) for (const li of stepsEl.children) { const i = Number(li.dataset.i); li.classList.toggle('on', i === cur); li.classList.toggle('past', i < cur); }
    if (hud) {
      const tillerTxt = Math.abs(LS.tl) < 0.05 ? 'düz' : LS.tl < 0 ? 'kendine çekili (kafa açılıyor)' : 'karşıya itili (orsalıyor)';
      const sailTxt = LS.luff > 0.2 ? 'ön yaka pırpır' : LS.stall > 0.2 ? 'arka tüyler düştü' : 'dolu, şeritler akıyor';
      $('lrWind').textContent = `${Math.round(awa)}°${awa < 40 ? ' (kapattı)' : awa > 50 ? ' (açtı)' : ''}`;
      $('lrTiller').textContent = tillerTxt;
      $('lrSail').textContent = sailTxt;
      $('lrSheet').textContent = LS.sheetIn > 0.05 ? `çekildi (${LS.sheetIn > 0.8 ? 'çok' : LS.sheetIn > 0.45 ? 'orta' : 'az'})` : 'normal';
      $('lrGust').textContent = LS.G > 0.05 ? (LS.G > 0.8 ? 'güçlü' : LS.G > 0.45 ? 'orta' : 'hafif') : 'yok';
      $('lrSail').className = LS.luff > 0.2 || LS.stall > 0.2 ? 'bad' : 'ok';
      hud.querySelector('.hud-wind').setAttribute('transform', `rotate(${(-LS.W).toFixed(1)} 40 40)`);
      hud.querySelector('.hud-boat').setAttribute('transform', `rotate(${(-LS.H).toFixed(1)} 40 40)`);
    }
    return { awa, sheet };
  }
  function lessonWorld(dt) {
    // rüzgar çizgileri: rüzgarın estiği yöne akar (geldiği yönün tersi), tekne ilerledikçe su geriye kayar
    const wr = LS.W * Math.PI / 180, hr = LS.H * Math.PI / 180;
    const wx = -Math.cos(wr), wz = Math.sin(wr), ang = Math.atan2(-wz, wx);
    const sp = 2.2 * (1 + LS.G), bs = 1.1 * LS.speed;
    for (const m of streaks) {
      m.position.x += (wx * sp - Math.cos(hr) * bs) * dt; m.position.z += (wz * sp + Math.sin(hr) * bs) * dt;
      if (m.position.x < -14) m.position.x += 26; if (m.position.x > 12) m.position.x -= 26;
      if (m.position.z < -13) m.position.z += 26; if (m.position.z > 13) m.position.z -= 26;
      m.rotation.z = ang;
    }
    streakMat.opacity = 0.25 + 0.35 * LS.G;
    // sağanak lekesi: rüzgarüstünden gelir
    if (LS.id === 'saganak') {
      const t = LS.t, f = t < 2.2 ? t / 2.2 : t < 7.2 ? 1 + (t - 7.2) * 0 : 1 + (t - 7.2) / 2;
      const d = 9 * (1 - Math.min(f, 2)) ;
      gustPatch.position.set(Math.cos(wr) * d + 1, 0.07, -Math.sin(wr) * d);
      gustPatch.material.opacity = (0.35 + 0.3 * LS.gust) * (t > 7.2 ? Math.max(0, 1 - (t - 7.2) / 2.5) : Math.min(1, t / 0.6));
      gustPatch.scale.setScalar(0.8 + 0.5 * LS.gust);
    } else gustPatch.material.opacity = 0;
    wakeMat.opacity = 0.1 + 0.25 * Math.min(1.5, LS.speed) / 1.5;
    // yeke ve hareket oku
    rudderG.rotation.y = -LS.tl;
    const tip = new THREE.Vector3(0.68, 0.45, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -LS.tl).add(rudderG.position);
    tArrow.position.copy(tip);
    tArrow.visible = Math.abs(LS.tl) > 0.06;
    tArrow.rotation.set(Math.sign(LS.tl) * Math.PI / 2, 0, 0);
  }

  // ---------- döngü ----------
  const HL = 0xfde047;
  const setCol = (m, on, c) => m.material.color.setHex(on ? HL : c);
  let lastKey = '', time = 0, last = performance.now();
  const P3 = (p, sh, g) => to3(p, 0, sh, g, new THREE.Vector3());
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    const S = window.TrimState;
    const view = document.body.dataset.view;
    if (!S || (view !== '3d' && view !== 'ders') || document.hidden) return;
    const ders = view === 'ders';
    enterLesson(ders);
    const { v, wave } = S;
    let { sh, res } = S;
    let L = null;
    if (ders) {
      L = lessonStep(dt);
      sh = { ...sh, sheet: L.sheet, twist: sh.twist + 3 * LS.G - 2 * LS.sheetIn, lift: Math.max(0, sh.lift - 2 * LS.sheetIn) };
      res = { ...res, heelDeg: LS.heel };
      lessonWorld(dt);
    }
    fx.luff = ders ? LS.luff : 0; fx.time = time;

    // kamera
    if (cam.goal) {
      const k = Math.min(1, dt * 4);
      let dth = cam.goal.th - cam.th; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
      cam.th += dth * k; cam.ph += (cam.goal.ph - cam.ph) * k; cam.zoom += (cam.goal.zoom - cam.zoom) * k;
      if (Math.abs(dth) + Math.abs(cam.goal.ph - cam.ph) < 0.002) cam.goal = null;
    }
    const tf = Math.tan(camera.fov * Math.PI / 360);
    const R = Math.max(2.05 / tf, 1.8 / (tf * camera.aspect)) * cam.zoom;
    camera.position.set(target.x + R * Math.cos(cam.ph) * Math.cos(cam.th), target.y + R * Math.sin(cam.ph), target.z - R * Math.cos(cam.ph) * Math.sin(cam.th));
    camera.lookAt(target);

    // su
    const wp = waterGeo.attributes.position, amp = 0.012 + wave * 0.05;
    for (let i = 0; i < wp.count; i++) {
      const x = wBase[i * 3], z = wBase[i * 3 + 2];
      wp.array[i * 3 + 1] = amp * (Math.sin(x * 1.6 + time * 1.9) + 0.6 * Math.sin(z * 2.3 - time * 1.4 + x * 0.7));
    }
    wp.needsUpdate = true; waterGeo.computeVertexNormals();

    // tekne hareketi: yatma (rüzgaraltına), baş-kıç
    boat.rotation.set(res.heelDeg * Math.PI / 180, ders ? LS.H * Math.PI / 180 : 0, S.pitch * Math.PI / 180 * 1.2, 'YXZ');
    boat.position.y = S.bob * 0.008;
    rig.rotation.z = S.rakeDeg * Math.PI / 180;

    const key = ders ? 'ders' + time : JSON.stringify(v) + JSON.stringify(sh) + S.active + S.focusTie + (S.ghost ? 1 : 0);
    if (key !== lastKey) {
      lastKey = key;
      const { g } = buildSail(v, sh);
      const G3 = P3(g.G, sh, g), BE3 = P3(g.BE, sh, g), C3 = P3(g.C, sh, g), Pk3 = P3(g.Pk, sh, g), S3 = P3(g.S, sh, g), T3 = P3(g.T, sh, g);
      place(boom, G3, BE3);
      place(sprit, S3, Pk3);
      snotter.position.copy(S3);
      // palanga: bumbadan direk dibine 3 kat
      const vb = P3(V2(0.32 * Math.cos(sh.lift * Math.PI / 180), G_H + 0.32 * Math.sin(sh.lift * Math.PI / 180)), sh, g);
      const vm = new THREE.Vector3(-0.03, 0.2, 0);
      vangBlock.position.copy(vm);
      vang.forEach((m, i) => { const o = (i - 1) * 0.012; place(m, vb.clone().add(new THREE.Vector3(0, 0, o)), vm.clone().add(new THREE.Vector3(0, 0, o * 0.5))); setCol(m, S.active === 'vang', 0xef4444); });
      place(cunning, T3, new THREE.Vector3(-0.02, 0.42, 0)); setCol(cunning, S.active === 'luff', 0xf97316);
      place(outhaul, C3, BE3); setCol(outhaul, S.active === 'out', 0xf97316);
      setCol(sprit, S.active === 'sprit', 0xe2e8f0);
      setCol(mast, S.active === 'rake', 0xcbd5e1);
      // direk bağları: direk ile kuşgözü arasında halka
      g.luff.forEach((p, i) => {
        const e3 = P3(p, sh, g), m3 = new THREE.Vector3(0, p.h, 0);
        const d = e3.clone().sub(m3), dl = d.length();
        const m = ties[i];
        m.position.copy(m3).addScaledVector(d, 0.5);
        const r = dl / 2 + 0.006;
        m.scale.set(r, 0.05, r * 0.6);
        m.rotation.set(0, Math.atan2(-d.z, d.x), 0);
        m.material.color.setHex(S.active === 'ties' && S.focusTie === i ? HL : S.active === 'ties' ? 0xfbbf24 : 0xf59e0b);
      });
      // iskota: bumbadan teknenin ortasına
      rig.updateMatrix();
      const onBoom = a => P3(V2(a * Math.cos(sh.lift * Math.PI / 180), G_H + a * Math.sin(sh.lift * Math.PI / 180)), sh, g).applyMatrix4(rig.matrix);
      const mEnd = onBoom(1.75), mRat = onBoom(1.0);
      ratchet.position.copy(mRat);
      place(sheetSeg[0], mEnd, BRIDLE); place(sheetSeg[1], BRIDLE, mRat); place(sheetSeg[2], mRat, new THREE.Vector3(-0.35, 0.32, -0.22));
      // orijinal (kılavuz) ayarın hayaleti
      if (S.ghost && !ders) {
        const pts = outline(S.ghost.v, S.ghost.sh);
        ghostLine.geometry.dispose();
        ghostLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        ghostLine.computeLineDistances();
        ghostLine.visible = true;
      } else ghostLine.visible = false;
      tells.forEach((m, k) => { m.userData.base = sailPointLeech(v, sh, [0.3, 0.55, 0.82][k]); });
    }
    // rüzgar gülü (rüzgarüstü, baştan ~35°) ve arka yaka şeritleri
    vane.rotation.y = (ders ? L.awa * Math.PI / 180 : 0.62) + Math.sin(time * 3.1) * 0.05;
    tells.forEach((m, k) => {
      const b = m.userData.base; if (!b) return;
      m.position.copy(b.p);
      let yaw = b.yaw, droop = 0;
      const top = k === 2;
      const stall = ders ? LS.stall > 0.3 && (k > 0 || LS.stall > 0.6) : res.dt < -2.5 && (top || res.dt < -5);
      const fast = ders ? LS.luff > 0.3 : res.dt > 4;
      if (stall) { yaw += -1.5 + Math.sin(time * 2 + k) * 0.25; droop = -0.9; }
      else if (fast) { yaw += Math.sin(time * 22 + k * 2) * 0.35; }
      else yaw += Math.sin(time * 6 + k * 1.7) * 0.08;
      m.rotation.set(0, yaw, droop); m.scale.setScalar(ders ? 1.7 : 1);
    });
    renderer.render(scene, camera);
  }
  function sailPointLeech(v, sh, t) {
    const g = plan(v, sh), e = edges(g, sh);
    const p = sailPoint(e, g, sh, 1, t, new THREE.Vector3());
    const q = sailPoint(e, g, sh, 0.96, t, new THREE.Vector3());
    const d = p.clone().sub(q);
    return { p, yaw: Math.atan2(-d.z, d.x) };
  }
  requestAnimationFrame(frame);
  window.dispatchEvent(new Event('trim-3d-ready'));
}

// Optimist yelken ayarı: 3D görünüş (three.js, src/js/vendor). Ayar modeli ayar.js'te; her karede window.TrimState okunur.
// Eksenler (metre): X baş yönü, Y yukarı, Z rüzgaraltı (yelken bu yana açılır). Su yüzeyi y = 0.
// Ölçüler sınıf kuralına yakın: boy 2,31, en 1,13, direk 2,35, gırcala 2,286; orsa 1,73, tepe 1,24, arka yaka 2,80, alt yaka ≈1,90.
// Direk bağı boşlukları görünsün diye büyütülmüş (1 mm → 12 mm).
import * as THREE from 'three';
import { createSea } from 'sea3d';

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
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 1200);
  // gökyüzü, güneş + gölge, yansıma ortamı, dalgalı su: ortak modül (js/sea3d.js)
  const sea = createSea(THREE, renderer, scene, { sunDir: new THREE.Vector3(0.4, 0.8, 0.55) });
  const rim = new THREE.DirectionalLight(0xbfdbfe, 0.35);
  rim.position.set(3, 2, -5);
  scene.add(rim);

  // ---------- tekne ----------
  const lerp = (p, q, t) => p + (q - p) * t;
  const boat = new THREE.Group();
  let foamRing = null;
  scene.add(boat);
  // Optimist (IODA): kutu baş (pram), düz taban + alçak kine, dışa açık bordalar, baş aynası yüksek (rocker).
  const L = 2.31;
  const hs = u => u < 0.42 ? 0.565 - 0.135 * ((0.42 - u) / 0.42) ** 2 : 0.565 - 0.22 * ((u - 0.42) / 0.58) ** 2;   // küpeşte yarı eni (kıç 0,86, baş 0,69 m)
  const hcF = u => hs(u) * (u < 0.42 ? 0.8 : 0.8 - 0.06 * ((u - 0.42) / 0.58));                                    // kine yarı eni
  const yb = u => u < 0.42 ? -0.12 + 0.07 * ((0.42 - u) / 0.42) ** 2 : -0.12 + 0.33 * ((u - 0.42) / 0.58) ** 2.0;  // omurga (rocker)
  const ys = u => 0.27 + 0.03 * u + 0.06 * u ** 4;                                                                 // küpeşte (başa doğru kalkar)
  const xs = u => -L / 2 + u * L;
  // aynalar eğik: baş aynası öne yatık (alt kenar geride), kıç aynası hafif geriye yatık; küpeşte hizası değişmez
  const rakeK = u => u > 0.8 ? 0.62 * ((u - 0.8) / 0.2) ** 2 : u < 0.1 ? -0.16 * ((0.1 - u) / 0.1) ** 2 : 0;
  const X = (u, y) => xs(u) - rakeK(u) * (ys(u) - y);
  // kesit: düz, dışa açık borda → yuvarlatılmış kine (r ≈ 5 cm) → hafif bombeli düz taban (gerçek Optimist gibi)
  const section = u => {
    const h = hs(u), b = yb(u), c = hcF(u), top = ys(u), r = Math.min(0.055, (top - b) * 0.3);
    const sd = Math.hypot(h - c, top - b), P1 = [c + (h - c) * r / sd, b + (top - b) * r / sd], P2 = [c - r, b];
    const half = [];
    for (let i = 0; i < 4; i++) { const t = i / 4; half.push([h + (P1[0] - h) * t, top + (P1[1] - top) * t]); }
    for (let i = 0; i <= 6; i++) { const t = i / 6, a = (1 - t) ** 2, m = 2 * (1 - t) * t, q = t * t; half.push([a * P1[0] + m * c + q * P2[0], a * P1[1] + m * b + q * P2[1]]); }
    for (let i = 1; i < 4; i++) { const z = P2[0] * (1 - i / 4); half.push([z, b - 0.008 * (1 - (z / c) ** 2)]); }
    return [...half.map(([z, y]) => [-z, y]), [0, b - 0.008], ...half.reverse().map(([z, y]) => [z, y])];   // [z, y] iskeleden sancağa
  };
  // Köşe açısına göre yumuşatma: aynı noktadaki yüz normalleri, aralarındaki açı sınırın altındaysa ortalanır
  function smoothNormals(g, creaseDeg) {
    const p = g.attributes.position.array, n = p.length / 9, fn = [], map = new Map(), cosT = Math.cos(creaseDeg * Math.PI / 180);
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    for (let t = 0; t < n; t++) {
      A.fromArray(p, t * 9); B.fromArray(p, t * 9 + 3); C.fromArray(p, t * 9 + 6);
      const f = new THREE.Vector3().subVectors(B, A).cross(C.clone().sub(A)); const ar = f.length(); fn.push(ar > 1e-12 ? f.divideScalar(ar) : f);
      for (let k = 0; k < 3; k++) { const i = t * 3 + k, key = `${p[i * 3].toFixed(4)},${p[i * 3 + 1].toFixed(4)},${p[i * 3 + 2].toFixed(4)}`; (map.get(key) || map.set(key, []).get(key)).push(i); }
    }
    const out = new Float32Array(p.length);
    for (const ids of map.values()) for (const i of ids) {
      const me = fn[Math.floor(i / 3)], acc = new THREE.Vector3();
      for (const j of ids) { const o = fn[Math.floor(j / 3)]; if (me.dot(o) >= cosT) acc.add(o); }
      acc.normalize(); out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  }
  {
    const N = 64, pos = [], NSEC = section(0.5).length;
    const P = (u, k) => { const s = section(u)[k]; return [X(u, s[1]), s[1], s[0]]; };
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      for (let k = 0; k < NSEC - 1; k++) {
        const a = P(u0, k), b = P(u1, k), c = P(u1, k + 1), d = P(u0, k + 1);
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    for (const u of [0, 1]) {                                            // kıç ve baş aynası
      const s = section(u), cy = (ys(u) + yb(u)) / 2, x = y => X(u, y);
      for (let k = 0; k < NSEC - 1; k++) {
        const a = [x(cy), cy, 0], b = [x(s[k][1]), s[k][1], s[k][0]], c = [x(s[k + 1][1]), s[k + 1][1], s[k + 1][0]];
        if (u === 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
      }
      pos.push(x(cy), cy, 0, x(s[NSEC - 1][1]), s[NSEC - 1][1], s[NSEC - 1][0], x(s[0][1]), s[0][1], s[0][0]);
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
    smoothNormals(g, 40);                                               // gövde yumuşak, ayna kenarları keskin
    boat.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.02, side: THREE.FrontSide })));
    boat.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.85, side: THREE.BackSide })));
    // su maskesi: teknenin içinde su görünmesin (yalnız derinlik yazar, renk yazmaz; opak çizimden sonra, sudan önce)
    const sh = new THREE.Shape();
    const ym = 0.1, wAt = u => { const h = hs(u), c = hcF(u), t = Math.max(0, Math.min(1, (ym - yb(u) - 0.04) / (ys(u) - yb(u) - 0.04))); return c + (h - c) * t - 0.015; };
    for (let i = 0; i <= 30; i++) { const u = 0.01 + i / 30 * 0.98; const p = [X(u, ym), -wAt(u)]; i ? sh.lineTo(...p) : sh.moveTo(...p); }
    for (let i = 30; i >= 0; i--) { const u = 0.01 + i / 30 * 0.98; sh.lineTo(X(u, ym), wAt(u)); }
    const mg = new THREE.ShapeGeometry(sh); mg.rotateX(Math.PI / 2);
    const mask = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    mask.position.y = ym; mask.renderOrder = 10; boat.add(mask);
    // gövdenin suya değdiği yerde köpük halkası (başta ve kıçta daha geniş); teknenin yatmasından bağımsız, yalnız yönünü izler
    {
      const wl = u => { const h = hs(u), c = hcF(u), t = Math.max(0, Math.min(1, (0 - yb(u) - 0.04) / (ys(u) - yb(u) - 0.04))); return c + (h - c) * t; };
      const ring = [];
      for (let i = 0; i <= 40; i++) { const u = 0.02 + i / 40 * 0.96; ring.push([X(u, 0), wl(u), u]); }
      const pts = [...ring.map(([x, z, u]) => [x, z, u, 1]), ...ring.slice().reverse().map(([x, z, u]) => [x, -z, u, -1])];
      const pos = [], col = [], idx = [];
      const cx = 0;
      pts.forEach(([x, z, u], i) => {
        const nx = x - cx, nz = z, l = Math.hypot(nx * 0.5, nz) || 1;
        const w = 0.05 + 0.16 * Math.max(0, (u - 0.75) / 0.25) ** 2 + 0.22 * Math.max(0, (0.12 - u) / 0.12);
        pos.push(x, 0, z, x + nx * 0.5 / l * w, 0, z + nz / l * w);
        col.push(1, 1, 1, 0.55, 1, 1, 1, 0);
        const a = i * 2, b = ((i + 1) % pts.length) * 2;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      });
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
      fg.setIndex(idx);
      foamRing = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      foamRing.position.y = 0.035; foamRing.renderOrder = 23; scene.add(foamRing);
    }
  }
  const tubeAlong = (pts, r, color, parent = boat, rough = 0.6) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, r, 8, false),
      new THREE.MeshStandardMaterial({ color, roughness: rough }));
    parent.add(m); return m;
  };
  // küpeşte: beyaz, dışa kıvrık kalın kenar (GRP gövde) + içte ince dudak
  const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.32 });
  // Kenar profili küpeşte çevresi boyunca süpürülür: dışta yuvarlak kıvrım, içte düz pervaz. Köşeler yuvarlatılır.
  {
    const RC = 0.07, per = [];                                            // [x, y, z, nx, nz]
    const add = (x, y, z, a) => per.push([x, y, z, Math.cos(a), -Math.sin(a)]);
    const side = (sgn, u0, u1, n) => { for (let i = 0; i <= n; i++) { const u = lerp(u0, u1, i / n); add(xs(u), ys(u), sgn * (hs(u) - 0.004), sgn > 0 ? -Math.PI / 2 : Math.PI / 2); } };
    const corner = (cx, cy, cz, a0, a1) => { for (let i = 1; i < 8; i++) { const a = lerp(a0, a1, i / 8); add(cx + RC * Math.cos(a), cy, cz - RC * Math.sin(a), a); } };
    const du0 = RC / L, du1 = RC / L;
    side(1, du0, 1 - du1, 26);                                            // sancak: kıçtan başa
    corner(xs(1) - RC, ys(1), hs(1) - RC, -Math.PI / 2, 0);
    for (let i = 0; i <= 6; i++) add(xs(1), ys(1), lerp(hs(1) - RC, -hs(1) + RC, i / 6), 0);
    corner(xs(1) - RC, ys(1), -hs(1) + RC, 0, Math.PI / 2);
    side(-1, 1 - du1, du0, 26);                                           // iskele: baştan kıça
    corner(xs(0) + RC, ys(0), -hs(0) + RC, Math.PI / 2, Math.PI);
    for (let i = 0; i <= 6; i++) add(xs(0), ys(0), lerp(-hs(0) + RC, hs(0) - RC, i / 6), Math.PI);
    corner(xs(0) + RC, ys(0), hs(0) - RC, Math.PI, 1.5 * Math.PI);
    const PROF = [[0.012, -0.05], [0.03, -0.03], [0.036, -0.004], [0.028, 0.016], [0.006, 0.026], [-0.03, 0.024], [-0.07, 0.016], [-0.078, 0.0], [-0.074, -0.014]];
    const pos = [], n = per.length, m = PROF.length;
    const V = (i, k) => { const [x, y, z, nx, nz] = per[i % n], [o, h] = PROF[k]; return [x + nx * o, y + h, z + nz * o]; };
    for (let i = 0; i < n; i++) for (let k = 0; k < m - 1; k++) {
      const a = V(i, k), b = V(i + 1, k), c = V(i + 1, k + 1), d = V(i, k + 1);
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    boat.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, side: THREE.DoubleSide })));
  }
  const box = (w, h, d, color, x, y, z, parent = boat, rough = 0.6) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: rough }));
    m.position.set(x, y, z); parent.add(m); return m;
  };
  // ---------- iç düzen (Winner Optimist fotoğraflarına göre) ----------
  // baştan kıça: küçük baş boşluğu → geniş direk oturağı (direk deliği) → iki yanda torba bölmeleri, ortada omurga + salma kutusu
  // → enine orta oturak → kaymaz gri tabanlı kokpit, V ayak kayışları → kıçta enine torba
  const uM = 0.86;                                                       // direk yeri (baştan ~0,32 m)
  const MF = new THREE.Vector3(xs(uM), yb(uM) + 0.02, 0);                // direk ayağı
  const halfW = (u, y) => {                                              // u kesitinde y yüksekliğinde iç yüzeyin z'si
    const h = hs(u), b = yb(u), c = hcF(u), yc = b + 0.04, top = ys(u);
    const pts = [[h, top], [c + (h - c) * 0.45, yc + (top - yc) * 0.45], [c + (h - c) * 0.08, yc + 0.03], [c * 0.93, b + 0.016], [c * 0.6, b + 0.004], [0, b]];
    if (y >= top) return h;
    for (let i = 0; i < pts.length - 1; i++) { const [z0, y0] = pts[i], [z1, y1] = pts[i + 1]; if (y <= y0 && y >= y1) return lerp(z0, z1, (y0 - y) / ((y0 - y1) || 1)); }
    return 0;
  };
  const uOf = x => (x + L / 2) / L;
  const floorY = x => yb(uOf(x));
  const molded = (shape, depth, mat, bev = 0.012) => new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 8 }), mat);
  const whiteMold = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.34 });
  const rrect = (w, h, r) => { const S = new THREE.Shape(), x0 = -w / 2, y0 = -h / 2; S.moveTo(x0 + r, y0); S.lineTo(x0 + w - r, y0); S.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); S.lineTo(x0 + w, y0 + h - r); S.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h); S.lineTo(x0 + r, y0 + h); S.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); S.lineTo(x0, y0 + r); S.quadraticCurveTo(x0, y0, x0 + r, y0); return S; };
  // yatay kalıp levha: x merkezli, dx boyunda, bordadan bordaya (y üst yüzey)
  const plank = (x, dx, yTop, thick, inset = 0.012) => {
    const zH = Math.min(halfW(uOf(x - dx / 2), yTop - thick), halfW(uOf(x + dx / 2), yTop - thick)) - inset;
    const m = molded(rrect(dx, zH * 2, 0.025), thick - 0.016, whiteMold, 0.008);
    m.rotation.x = -Math.PI / 2; m.position.set(x, yTop - thick + 0.008, 0); boat.add(m); return zH;
  };
  // tabana oturan kalıp blok (alt yüz tabanı izler)
  const block = (x0, x1, zH, yTop, mat = whiteMold) => {
    const N = 10, pos = [], P = [];
    for (let i = 0; i <= N; i++) { const x = lerp(x0, x1, i / N), yB = floorY(x) - 0.01; P.push([[x, yB, -zH], [x, yTop, -zH], [x, yTop, zH], [x, yB, zH]]); }
    const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < N; i++) { const A = P[i], B = P[i + 1]; quad(A[0], B[0], B[1], A[1]); quad(A[1], B[1], B[2], A[2]); quad(A[2], B[2], B[3], A[3]); }
    quad(P[0][0], P[0][1], P[0][2], P[0][3]); quad(P[N][3], P[N][2], P[N][1], P[N][0]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: mat.color, roughness: 0.34, side: THREE.DoubleSide })); boat.add(m); return m;
  };
  // taban paneli (kaymaz yüzey): tabanın kavisini izleyen ızgara
  const floorPanel = (x0, x1, z0, z1, color, lift = 0.004) => {
    const N = 12, pos = [];
    for (let i = 0; i < N; i++) {
      const xa = lerp(x0, x1, i / N), xb = lerp(x0, x1, (i + 1) / N), ya = floorY(xa) + lift, yb2 = floorY(xb) + lift;
      pos.push(xa, ya, z0, xa, ya, z1, xb, yb2, z1, xa, ya, z0, xb, yb2, z1, xb, yb2, z0);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    boat.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide })));
  };
  const xMT = xs(uM), xCT = -0.07, xCaseF = 0.36;                       // direk oturağı, orta oturak, salma kutusu ön ucu
  // direk oturağı: geniş beyaz levha, ortasında direk deliği (koyu halka); arka yüzü torba bölmelerine iner
  const yMT = ys(uM) - 0.035;
  const zMT = plank(xMT, 0.3, yMT, 0.04, 0.02);
  { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.009, 8, 24), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.4 })); ring.rotation.x = Math.PI / 2; ring.position.set(xMT, yMT + 0.002, 0); boat.add(ring); }
  box(0.012, 0.09, zMT * 2 - 0.04, 0xeef2f6, xMT - 0.15, yMT - 0.08, 0, boat, 0.4);           // arka dudak
  box(0.07, 0.05, 0.07, 0x334155, xMT, floorY(xMT) + 0.03, 0, boat, 0.5);                     // direk ıskaçası (step)
  // orta oturak: enine beyaz levha + altında alçak bölme
  const yCT = ys(uOf(xCT)) - 0.13;
  const zCT = plank(xCT, 0.1, yCT, 0.035);
  box(0.016, yCT - 0.035 - floorY(xCT) - 0.1, zCT * 1.7, 0xeef2f6, xCT, floorY(xCT) + (yCT - 0.035 - floorY(xCT) + 0.1) / 2 - 0.0, 0, boat, 0.4);
  // salma kutusu: orta oturaktan öne, üstü oturaktan yüksek; önünde direğe uzanan alçak omurga
  const yCase = yCT + 0.04;
  block(xCT + 0.04, xCaseF, 0.05, yCase);
  { const cap = molded(rrect(xCaseF - xCT - 0.02, 0.12, 0.03), 0.012, whiteMold, 0.006); cap.rotation.x = -Math.PI / 2; cap.position.set((xCT + xCaseF) / 2 + 0.01, yCase, 0); boat.add(cap); }
  box(0.32, 0.006, 0.022, 0x0f172a, (xCT + xCaseF) / 2 + 0.03, yCase + 0.02, 0);                 // salma yuvası
  block(xCaseF - 0.01, xMT - 0.15, 0.06, floorY(xCaseF) + 0.11);                                   // omurga
  const xC = (xCT + xCaseF) / 2 + 0.03, yF = floorY(xC);
  // kaymaz gri taban: kokpitte iki yanda beyaz şeritli büyük panel, torba bölmelerinde de gri
  const grey = 0xa3aab5;
  floorPanel(-0.98, xCT - 0.07, -0.3, 0.3, grey);
  for (const sd of [-1, 1]) floorPanel(-0.98, xCT - 0.07, sd * 0.3, sd * 0.36, 0xf1f5f9, 0.006);
  for (const sd of [-1, 1]) floorPanel(xCT + 0.07, xMT - 0.17, sd * 0.08, sd * 0.3, grey);
  // yüzdürme torbaları (3 adet): iki yanda torba bölmelerinde borda boyunca, biri kıçta enine. Gri, açık renk kayışlı, ucunda kırmızı tutamak.
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x8f969f, roughness: 0.75 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.7 });
  const tabMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
  const bag = (r, A, B, squash = 0.85) => {
    const g2 = new THREE.Group(), d = new THREE.Vector3().subVectors(B, A), len = d.length();
    g2.position.copy(A).addScaledVector(d, 0.5); g2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); boat.add(g2);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 10, 22), bagMat); body.scale.set(1, 1, squash); g2.add(body);
    const n = Math.max(2, Math.round(len / 0.24));
    for (let i = 0; i < n; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(r * 0.995, 0.009, 4, 28), strapMat); t.rotation.x = Math.PI / 2; t.scale.set(1, squash, 1); t.position.y = ((i + 0.5) / n - 0.5) * (len - 2 * r); g2.add(t); }
    const tab = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14), tabMat); tab.position.y = -len / 2 + 0.01; g2.add(tab);
  };
  {
    const r = 0.115, xa = xCT + 0.09, xb = xMT - 0.19;
    const at = (x, sd) => { const y = floorY(x) + r * 0.85 + 0.02; return new THREE.Vector3(x, y, sd * (halfW(uOf(x), y) - r * 0.95)); };
    for (const sd of [-1, 1]) bag(r, at(xa, sd), at(xb, sd));
    const u = 0.075, r2 = 0.115, y = yb(u) + r2 * 0.85 + 0.02, z = halfW(u, y + 0.05) - 0.03, x = X(u, y) + 0.02;
    bag(r2, new THREE.Vector3(x, y, z), new THREE.Vector3(x, y, -z));
  }
  // ayak kayışları: orta oturağın altından kıça doğru V şeklinde birleşir (koyu, ucu kırmızı etiketli), lastikle hafif kalkık
  const ribbon = (pts, w, mat) => {
    const c = new THREE.CatmullRomCurve3(pts), N = 30, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const p = c.getPoint(i / N), t = c.getTangent(i / N), sx = -t.z, sz = t.x, k = Math.hypot(sx, sz) || 1;
      pos.push(p.x - sx / k * w / 2, p.y, p.z - sz / k * w / 2, p.x + sx / k * w / 2, p.y, p.z + sz / k * w / 2);
      if (i < N) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); boat.add(m); return m;
  };
  const strapFlat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85, side: THREE.DoubleSide });
  const xV = -0.78;
  for (const sd of [-1, 1]) {
    const A = new THREE.Vector3(xCT - 0.06, yCT - 0.07, sd * 0.2), B = new THREE.Vector3(xV, floorY(xV) + 0.035, sd * 0.03);
    ribbon([A, new THREE.Vector3(lerp(A.x, B.x, 0.3), floorY(lerp(A.x, B.x, 0.3)) + 0.14, sd * lerp(0.2, 0.03, 0.3)), new THREE.Vector3(lerp(A.x, B.x, 0.7), floorY(lerp(A.x, B.x, 0.7)) + 0.1, sd * lerp(0.2, 0.03, 0.7)), B], 0.06, strapFlat);
    box(0.05, 0.004, 0.04, 0xdc2626, A.x - 0.06, floorY(A.x - 0.06) + 0.135, sd * 0.19, boat, 0.5);   // etiket
  }
  box(0.05, 0.03, 0.06, 0x64748b, xV - 0.01, floorY(xV) + 0.015, 0, boat, 0.3);                    // kayış bağlantısı
  // salma: kutudan aşağı, tutamak üstte
  const foilMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
  const dagger = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 0.018), foilMat);
  dagger.position.set(xC, yCase - 0.62, 0); boat.add(dagger);
  box(0.13, 0.04, 0.03, 0x1e293b, xC, yCase + 0.06, 0);
  const xT = xs(0);
  // iskota: orta oturağın arkasında tabandaki gözde cırcır makara
  const BRIDLE = new THREE.Vector3(xCT - 0.2, floorY(xCT - 0.2) + 0.09, 0);
  tubeAlong([new THREE.Vector3(BRIDLE.x - 0.02, floorY(BRIDLE.x) + 0.01, -0.06), BRIDLE, new THREE.Vector3(BRIDLE.x - 0.02, floorY(BRIDLE.x) + 0.01, 0.06)], 0.005, 0xe2e8f0);
  const bridleBlock = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 }));
  bridleBlock.position.copy(BRIDLE); boat.add(bridleBlock);
  // dümen grubu: iğneli kafa, uzun dar pala, yeke + uzatma (yeke grubun +X yönünde; rotation.y ile döner)
  const rudderG = new THREE.Group(); rudderG.position.set(xT - 0.05, 0, 0); boat.add(rudderG);
  // Optimist dümeni: dar uzun pala (ön kenar düz, alt ucu yuvarlak, arka kenar aşağı doğru daralır), alüminyum dümen kafası
  // (iki yanak + iğneler aynadaki yuvalara), kafanın üstünden öne uzanan yeke
  {
    const S = new THREE.Shape();                                         // (x: öne +, y: yukarı); ön kenar x = 0
    S.moveTo(0, 0.36); S.lineTo(0, -0.42);
    S.bezierCurveTo(0, -0.56, -0.05, -0.62, -0.11, -0.62);
    S.bezierCurveTo(-0.17, -0.62, -0.2, -0.56, -0.205, -0.46);
    S.lineTo(-0.235, 0.06); S.quadraticCurveTo(-0.24, 0.14, -0.2, 0.2); S.lineTo(-0.14, 0.36); S.lineTo(0, 0.36);
    const bg = new THREE.ExtrudeGeometry(S, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.006, bevelSegments: 3, curveSegments: 14 });
    bg.translate(0, 0, -0.006);
    const blade = new THREE.Mesh(bg, foilMat); blade.position.set(-0.035, 0, 0); rudderG.add(blade);
    const alu = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3, metalness: 0.85 });
    for (const sd of [-1, 1]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.006), alu); ch.position.set(-0.09, 0.3, sd * 0.016); rudderG.add(ch); }   // yanaklar
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.038), alu); back.position.set(-0.012, 0.3, 0); rudderG.add(back);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.6, roughness: 0.3 }));
    bolt.rotation.x = Math.PI / 2; bolt.position.set(-0.13, 0.33, 0); rudderG.add(bolt);
    for (const y of [0.08, 0.27]) {                                      // iğne (dümende) + yuva (aynada)
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 8), alu); pin.position.set(0.012, y, 0); rudderG.add(pin);
      box(0.03, 0.025, 0.06, 0x4b5563, 0.03, y, 0, rudderG, 0.3);
    }
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.025), new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 })); clip.position.set(0.0, 0.31, 0.03); rudderG.add(clip);
  }
  const rod = (a, b, r, color, parent) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 }));
    place(m, a, b); parent.add(m); return m;
  };
  function place(m, a, b) {
    const d = new THREE.Vector3().subVectors(b, a), l = d.length() || 1e-6;
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(1, l, 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / l));
  }
  rod(new THREE.Vector3(-0.1, 0.39, 0), new THREE.Vector3(0.74, 0.43, 0), 0.014, 0x1f2937, rudderG);          // yeke (siyah alüminyum)
  rod(new THREE.Vector3(0.72, 0.43, 0), new THREE.Vector3(1.25, 0.36, -0.12), 0.009, 0x111827, rudderG);  // uzatma (rüzgarüstüne)
  // ---------- teçhizat (direk çerçevesi: Y direk boyunca, -X kıça) ----------
  const rig = new THREE.Group();
  rig.position.copy(MF);
  boat.add(rig);
  const metal = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.55 });
  const MAST = 2.35, MR = 0.022;
  const SILVER = 0xc3c9d0;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(MR, MR * 1.05, MAST, 16), metal(SILVER));
  mast.position.y = MAST / 2; rig.add(mast);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(MR * 1.2, MR * 1.2, 0.04, 12), metal(0x0f172a));
  cap.position.y = MAST; rig.add(cap);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 12), metal(0xb4bbc3)); rig.add(boom);
  // bumba ucu: renkli bant (sarı-yeşil-kırmızı) ve tıpa
  const boomEnd = (() => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 64; const x = c.getContext('2d');
    [['#111827', 0, 10], ['#dc2626', 10, 24], ['#16a34a', 24, 40], ['#facc15', 40, 56], ['#b4bbc3', 56, 64]].forEach(([col, a, b]) => { x.fillStyle = col; x.fillRect(0, a, 8, b - a); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 12), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 })); rig.add(m); return m;
  })();
  const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1, 10), metal(SILVER)); rig.add(sprit);
  const halyard = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.8 })); rig.add(halyard);
  place(halyard, new THREE.Vector3(0.03, MAST - 0.06, 0), new THREE.Vector3(0.03, 0.3, 0.01));
  const lineMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const mkLine = (r, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), lineMat(c)); rig.add(m); return m; };
  const vang = [mkLine(0.005, 0xeab308), mkLine(0.005, 0xeab308), mkLine(0.005, 0xeab308)];
  const vangBlock = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), metal(0x0f172a)); rig.add(vangBlock);
  const cunning = mkLine(0.005, 0xf97316);
  const outhaul = mkLine(0.005, 0xf97316);
  const snotter = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), metal(0x0f172a)); rig.add(snotter);
  // ana iskota: bumba ucundan kıç köprüsündeki makaraya, oradan bumbadaki cırcır makaraya, oradan yelkencinin eline
  const sheetSeg = [0, 1, 2, 3, 4].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 1, 6), lineMat(0xe2e8f0)); boat.add(m); return m; });
  const ratchet = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), metal(0x0f172a)); boat.add(ratchet);
  // kıç köprüsü (bridle): kıç aynasının iki köşesinden tabana gergin ip, üstünde kayan makara
  const xBr = xs(0) + 0.12, yBr = floorY(xs(0) + 0.12) + 0.13, zBr = 0.36;
  tubeAlong([new THREE.Vector3(xBr - 0.04, yBr + 0.06, -zBr), new THREE.Vector3(xBr, yBr, 0), new THREE.Vector3(xBr - 0.04, yBr + 0.06, zBr)], 0.004, 0xe2e8f0);
  const sternBlock = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), metal(0x0f172a)); boat.add(sternBlock);
  const boomBlockAft = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), metal(0x0f172a)); boat.add(boomBlockAft);
  // alt yaka bağları: yelkenin alt yakası bumbaya halkalarla bağlı (sarı-yeşil ip)
  const footTies = Array.from({ length: 8 }, () => { const tg = new THREE.TorusGeometry(0.028, 0.0035, 5, 14); const m = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0xa3c615, roughness: 0.6 })); rig.add(m); return m; });
  // gırcala ipi (snotter): gırcalanın alt ucundan direğe, oradan aşağı kamaya
  const snotLine = [mkLine(0.004, 0x111827), mkLine(0.004, 0x111827)];
  const snotCleat = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), metal(0x111827)); snotCleat.position.set(0.03, 0.62, 0); rig.add(snotCleat);
  const TIE_COL = 0xa3c615;                                            // direk bağları: sarı-yeşil ip (fotoğraftaki gibi)
  const ties = Array.from({ length: 8 }, () => {
    const tg = new THREE.TorusGeometry(1, 0.12, 6, 18); tg.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: TIE_COL, roughness: 0.6 }));
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
    // direk tepesinde Türk bayrağı (rüzgar gülü çubuğunda)
    const fc = document.createElement('canvas'); fc.width = 96; fc.height = 64; const f = fc.getContext('2d');
    f.fillStyle = '#e30a17'; f.fillRect(0, 0, 96, 64);
    f.fillStyle = '#fff'; f.beginPath(); f.arc(36, 32, 16, 0, Math.PI * 2); f.fill();
    f.fillStyle = '#e30a17'; f.beginPath(); f.arc(40, 32, 12.8, 0, Math.PI * 2); f.fill();
    f.fillStyle = '#fff'; f.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.6 : 6.6; f.lineTo(56 + r * Math.cos(a), 32 + r * Math.sin(a)); } f.fill();
    const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.066), new THREE.MeshBasicMaterial({ map: ft, side: THREE.DoubleSide }));
    flag.position.set(-0.03, -0.045, 0); vane.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 6), metal(0x0f172a)); pole.position.set(0.02, -0.04, 0); vane.add(pole);
  }

  // ---------- yelken (Coons yüzeyi, kambur + twist) ----------
  const NS = 26, NT = 22;
  const sailGeo = new THREE.PlaneGeometry(1, 1, NS, NT);
  // iki yüz ayrı doku: numara her iki yandan da okunur (sınıf kuralındaki gibi yanlarda farklı yükseklikte)
  const sailTex = makeSailTexture(true, false), sailTexPlain = makeSailTexture(false, false);
  const sailTexB = makeSailTexture(true, true), sailTexPlainB = makeSailTexture(false, true);
  const sailMat = side => new THREE.MeshStandardMaterial({ map: side === THREE.FrontSide ? sailTex : sailTexB, side, roughness: 0.9, transparent: true, opacity: 0.86, emissive: 0x94a3b8, emissiveIntensity: 0.24 });
  const sail = new THREE.Mesh(sailGeo, sailMat(THREE.FrontSide));
  const sailBack = new THREE.Mesh(sailGeo, sailMat(THREE.BackSide)); sail.add(sailBack);
  rig.add(sail);
  const ghostMat = new THREE.LineDashedMaterial({ color: 0xfbbf24, dashSize: 0.06, gapSize: 0.04 });
  const ghostLine = new THREE.Line(new THREE.BufferGeometry(), ghostMat); ghostLine.visible = false; rig.add(ghostLine);
  // arka yaka şeritleri (telltales)
  const tells = [0.3, 0.55, 0.82].map(() => {
    const g = new THREE.PlaneGeometry(0.14, 0.014); g.translate(0.07, 0, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf472b6, side: THREE.DoubleSide }));
    rig.add(m); return m;
  });

  function makeSailTexture(stripes = true, back = false) {
    // doku: x 0 = orsa yakası (direk), x 1024 = arka yaka; y 0 = tepe yakası (gırcala), y 1024 = alt yaka (bumba)
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d'), K = 2;
    x.scale(K, K);
    x.fillStyle = '#fbfcfd'; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = 'rgba(100,116,139,.28)'; x.lineWidth = 1.5;               // panel dikişleri (yatay kesim, arka yakaya dik)
    for (let i = 1; i < 8; i++) { const y = 512 - i * 512 / 8; x.beginPath(); x.moveTo(0, y + 14); x.lineTo(512, y - 14); x.stroke(); }
    x.fillStyle = 'rgba(203,213,225,.55)';                                   // köşe takviyeleri (çok katlı)
    for (const [a, b, cc] of [[[0, 512], [80, 512], [0, 440]], [[512, 512], [430, 512], [512, 440]], [[512, 0], [440, 0], [512, 70]], [[0, 0], [70, 0], [0, 70]]]) {
      x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.lineTo(...cc); x.fill();
    }
    x.fillStyle = '#e5e9ee'; x.fillRect(0, 0, 8, 512); x.fillRect(0, 504, 512, 8); x.fillRect(0, 0, 512, 6);   // yaka bantları
    x.strokeStyle = 'rgba(100,116,139,.45)'; x.lineWidth = 1.5; x.strokeRect(9, 7, 499, 496);
    // sınıf logosu (kırmızı halka + dikey çizgi), tepe köşesine yakın
    x.strokeStyle = '#d61f2c'; x.lineWidth = 7;
    x.beginPath(); x.ellipse(408, 64, 26, 30, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(406, 44); x.lineTo(410, 118); x.stroke();
    // yelken numarası: TUR / 1923 (kırmızı)
    x.save(); if (back) { x.translate(512, 0); x.scale(-1, 1); }            // arka yüz: yazı ayna, böylece o yandan düz okunur
    const nx = back ? 512 - 300 : 300, ny = back ? 250 : 160;
    x.fillStyle = '#d61f2c'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 68px Arial, Helvetica, sans-serif'; x.fillText('TUR', nx, ny);
    x.font = 'bold 60px Arial, Helvetica, sans-serif'; x.fillText('1923', nx + (back ? -18 : 18), ny + 72);
    x.restore();
    // tüyler (luff telltales): orsa yakasına yakın kırmızı nokta + ip
    for (const [px, py] of [[118, 300], [104, 400]]) {
      x.fillStyle = '#c81e2a'; x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(127,29,29,.8)'; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 22, py + 3, px + 46, py - 1); x.stroke();
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 20, py + 7, px + 40, py + 8); x.stroke();
    }
    // pencere: alt yakaya yakın, yatay
    x.fillStyle = 'rgba(176,190,205,.8)'; x.fillRect(205, 452, 150, 20);
    x.strokeStyle = 'rgba(100,116,139,.7)'; x.lineWidth = 1.5; x.strokeRect(205, 452, 150, 20);
    // yelkenci logosu (karula yakınında küçük kırmızı)
    x.fillStyle = '#d61f2c'; x.beginPath(); x.moveTo(52, 482); x.lineTo(76, 438); x.lineTo(84, 446); x.lineTo(66, 482); x.closePath(); x.fill();
    // alt yaka bumbaya bağlı: sarı-yeşil bağlar; orsa yakası kuşgözleri
    x.strokeStyle = '#9bbd12'; x.lineWidth = 3;
    for (let i = 1; i < 9; i++) { const px = i * 512 / 9; x.beginPath(); x.moveTo(px - 5, 512); x.lineTo(px, 498); x.lineTo(px + 5, 512); x.stroke(); }
    x.fillStyle = '#94a3b8';
    for (let i = 1; i < 8; i++) { const py = 20 + i * 470 / 8; x.beginPath(); x.arc(12, py, 3.2, 0, Math.PI * 2); x.fill(); }
    x.strokeStyle = '#38bdf8'; x.lineWidth = 4;                              // derinlik şeritleri (draft stripes, ayar görünümünde)
    if (stripes) for (const t of [0.25, 0.5, 0.78]) { const y = 512 - t * 512; x.beginPath(); x.moveTo(14, y); x.lineTo(500, y); x.stroke(); }
    // çıtalar (battens): arka yakada 2 kısa çıta, iç ucunda yuvarlak takviye
    for (const t of [0.33, 0.72]) {
      const y = 512 - t * 512;
      x.fillStyle = 'rgba(203,213,225,.9)'; x.beginPath(); x.arc(432, y + 5, 15, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#7b8794'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(436, y + 5); x.lineTo(506, y - 8); x.stroke(); x.lineCap = 'butt';
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
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
  const TIE_SC = 0.001, G_H = 0.56, TACK_H = 0.59, HEAD_H = TACK_H + 1.73;
  function plan(v, sh) {
    const la = sh.lift * Math.PI / 180;
    const G = V2(0, G_H), bdir = V2(Math.cos(la), Math.sin(la));
    const C = V2(G.a + bdir.a * 1.9, G.h + bdir.h * 1.9);
    const BE = V2(G.a + bdir.a * 2.01, G.h + bdir.h * 2.01);
    const luff = v.ties.map((g, i) => V2(MR + 0.012 + g * TIE_SC, lerp(HEAD_H, TACK_H, i / 7)));
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
  if (/[?&]dbg\b/.test(location.search)) window.__t3 = { cam, target, boat, sail, rig };
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

  // ---------- arkadan ders: açan (header) / çeken (lift) rüzgar, sağanak (terimler: kullanıcı 2026-11-27) ----------
  // Açılar (derece): 0 = başlangıç rotası, + = rüzgarüstüne (-Z). W: rüzgarın geldiği yön, H: tekne başı, AWA = W - H.
  // Tekne yerinde durur; su, rüzgar çizgileri ve dümen suyu hareketi gösterir. Kamera tekneye arkadan bakar.
  const LS = { id: 'kapatti', t: 0, play: false, gust: 0.65, W: 45, H: 0, G: 0, tl: 0, sheetIn: 0, prevH: 0, done: false };
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const seg = (t, a, b) => ease((t - a) / (b - a));
  const LESSONS = {
    kapatti: {
      name: 'Açtı', sub: 'pırpır → kafayı aç', end: 10,
      steps: [[0, 'Rüzgar sabit, dümen düz. Yelken dolu, şeritler akıyor.'],
        [2.4, 'Rüzgar açtı (header): baştan geliyor, yelkenin ön yakası pırpırlıyor.'],
        [4, 'Yekeyi kendine çek: kafayı aç (rüzgaraltına dön).'],
        [6.6, 'Yelken yeniden doldu. Dümen düz, yeni rotada devam.']],
      at: t => ({ W: 45 - 12 * seg(t, 2.4, 3.4), H: -12 * seg(t, 4, 6.6), G: 0, sheetIn: 0 }),
    },
    acti: {
      name: 'Çekti', sub: 'tüyler düştü → orsala', end: 10,
      steps: [[0, 'Rüzgar sabit, dümen düz. Yelken dolu, şeritler akıyor.'],
        [2.4, 'Rüzgar çekti (lift): yandan geliyor, arka yakadaki tüyler düştü, yelken fazla kapalı kaldı.'],
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
    m.position.set((Math.random() - 0.5) * 26, 0.09, (Math.random() - 0.5) * 26); m.visible = false; scene.add(m); return m;
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
      $('lrWind').textContent = `${Math.round(awa)}°${awa < 40 ? ' (açtı)' : awa > 50 ? ' (çekti)' : ''}`;
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
  const FOCUS = new THREE.Vector3(0, 0, 0.4);
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
    const wantMap = ders ? sailTexPlain : sailTex;
    if (sail.material.map !== wantMap) { sail.material.map = wantMap; sail.material.needsUpdate = true; sailBack.material.map = ders ? sailTexPlainB : sailTexB; sailBack.material.needsUpdate = true; }

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

    // su (dalgalar gölgelendiricide): hafif havada küçük kırışık, dalgalıda uzun dalga
    sea.update(time, { amp: 0.018 + wave * 0.06, chop: 0.3 + wave * 0.7, focus: FOCUS });

    // tekne hareketi: yatma (rüzgaraltına), baş-kıç
    boat.rotation.set(res.heelDeg * Math.PI / 180, ders ? LS.H * Math.PI / 180 : 0, S.pitch * Math.PI / 180 * 1.2, 'YXZ');
    boat.position.y = S.bob * 0.008;
    foamRing.rotation.y = boat.rotation.y;
    foamRing.material.opacity = 0.75 + 0.25 * Math.sin(time * 2.3);
    rig.rotation.z = S.rakeDeg * Math.PI / 180;

    const key = ders ? 'ders' + time : JSON.stringify(v) + JSON.stringify(sh) + S.active + S.focusTie + (S.ghost ? 1 : 0);
    if (key !== lastKey) {
      lastKey = key;
      const { g } = buildSail(v, sh);
      const G3 = P3(g.G, sh, g), BE3 = P3(g.BE, sh, g), C3 = P3(g.C, sh, g), Pk3 = P3(g.Pk, sh, g), S3 = P3(g.S, sh, g), T3 = P3(g.T, sh, g);
      place(boom, G3, BE3);
      place(boomEnd, BE3.clone().lerp(G3, 0.07), BE3.clone().lerp(G3, -0.012));
      place(sprit, S3, Pk3);
      snotter.position.copy(S3);
      // palanga: bumbadan direk dibine 3 kat
      const vb = P3(V2(0.32 * Math.cos(sh.lift * Math.PI / 180), G_H + 0.32 * Math.sin(sh.lift * Math.PI / 180)), sh, g);
      const vm = new THREE.Vector3(-0.03, 0.2, 0);
      vangBlock.position.copy(vm);
      vang.forEach((m, i) => { const o = (i - 1) * 0.012; place(m, vb.clone().add(new THREE.Vector3(0, 0, o)), vm.clone().add(new THREE.Vector3(0, 0, o * 0.5))); setCol(m, S.active === 'vang', 0xeab308); });
      place(cunning, T3, new THREE.Vector3(-0.02, 0.42, 0)); setCol(cunning, S.active === 'luff', 0xf97316);
      place(outhaul, C3, BE3); setCol(outhaul, S.active === 'out', 0xf97316);
      setCol(sprit, S.active === 'sprit', SILVER);
      setCol(mast, S.active === 'rake', SILVER);
      // direk bağları: direk ile kuşgözü arasında halka
      g.luff.forEach((p, i) => {
        const e3 = P3(p, sh, g), m3 = new THREE.Vector3(0, p.h, 0);
        const d = e3.clone().sub(m3), dl = d.length();
        const m = ties[i];
        m.position.copy(m3).addScaledVector(d, 0.5);
        const r = dl / 2 + 0.006;
        m.scale.set(r, 0.05, r * 0.6);
        m.rotation.set(0, Math.atan2(-d.z, d.x), 0);
        m.material.color.setHex(S.active === 'ties' && S.focusTie === i ? HL : S.active === 'ties' ? 0xfbbf24 : TIE_COL);
      });
      // iskota: bumbadan teknenin ortasına
      rig.updateMatrix();
      const onBoom = a => P3(V2(a * Math.cos(sh.lift * Math.PI / 180), G_H + a * Math.sin(sh.lift * Math.PI / 180)), sh, g).applyMatrix4(rig.matrix);
      const mA = onBoom(1.0), mB = onBoom(1.08);
      // ana iskota: kıç köprüsündeki makara → bumbanın arka makarası → bumba boyunca ortadaki cırcır makara → tabandaki makara → el
      const aft = onBoom(1.78), mid = onBoom(1.0);
      const sb = new THREE.Vector3(xBr - 0.005, yBr + 0.012, Math.max(-zBr * 0.7, Math.min(zBr * 0.7, aft.z * 0.6)));
      sternBlock.position.copy(sb); boomBlockAft.position.copy(aft).add(new THREE.Vector3(0, -0.03, 0)); ratchet.position.copy(mid).add(new THREE.Vector3(0, -0.035, 0));
      place(sheetSeg[0], sb, boomBlockAft.position); place(sheetSeg[1], boomBlockAft.position, ratchet.position);
      place(sheetSeg[2], ratchet.position, BRIDLE); place(sheetSeg[3], BRIDLE, new THREE.Vector3(-0.15, 0.3, -0.25)); sheetSeg[4].visible = false;
      void mA; void mB;
      // alt yaka bağları bumba boyunca
      footTies.forEach((m, i) => { const t = 0.08 + i * 0.12; const p = G3.clone().lerp(BE3, t); m.position.copy(p).add(new THREE.Vector3(0, 0.012, 0)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), BE3.clone().sub(G3).normalize()); });
      // gırcala ipi
      place(snotLine[0], S3, new THREE.Vector3(0.025, S3.y - 0.02, 0)); place(snotLine[1], new THREE.Vector3(0.025, S3.y - 0.02, 0), snotCleat.position);
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
  sea.finishObject(boat);
  sail.castShadow = true; sailBack.castShadow = true; sail.receiveShadow = true; sailBack.receiveShadow = true;
  requestAnimationFrame(frame);
  window.dispatchEvent(new Event('trim-3d-ready'));
}

// Velora Sailing – simülatör için gerçekçi 3D Optimist (IODA sınıf ölçüleri; Ayarlar sayfasındaki modelle aynı ölçüler).
// Gövde (kutu baş, rocker, dışa açık borda, yuvarlatılmış kine), iç düzen (direk oturağı, orta oturak, salma kutusu, 3 yüzdürme
// torbası, ayak kayışları), salma + tutamak, Optimist dümeni (pala, alüminyum kafa, yeke, uzatma), direk, bumba, gırcala,
// gırcala yelkeni (orsa yakası direğe bağlı, alt yakası bumbaya bağlı), palanga, gırcala ipi, ana iskota (kıç köprüsü → bumba
// arka makara → orta makara → taban makarası → yelkencinin eli). Hepsi tekneye bağlı; bumba açısıyla birlikte hareket eder.
// İç eksenler (Ayarlar modeliyle aynı): +x baş, +y yukarı, +z sancak. Dış grup simülatör eksenine döndürür (-z baş, +x sancak).
// Aynı geometri/malzeme tüm teknelerde paylaşılır; tekneye özgü yalnız gövde rengi, can yeleği rengi ve hareketli ipler.
// Kullanım: const F = optimistFactory(THREE); const m = F.make(0xff7a1a);  m.pose({ beta, tack, flutter, time, tiller }); scene.add(m.g)
export function optimistFactory(T) {
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const lerp = (a, b, t) => a + (b - a) * t;
  const L = 2.31;
  // ---------- gövde ölçüleri (u: 0 kıç → 1 baş) ----------
  const hs = u => u < 0.42 ? 0.565 - 0.135 * ((0.42 - u) / 0.42) ** 2 : 0.565 - 0.22 * ((u - 0.42) / 0.58) ** 2;   // küpeşte yarı eni
  const hcF = u => hs(u) * (u < 0.42 ? 0.8 : 0.8 - 0.06 * ((u - 0.42) / 0.58));                                    // kine yarı eni
  const yb = u => u < 0.42 ? -0.12 + 0.07 * ((0.42 - u) / 0.42) ** 2 : -0.12 + 0.33 * ((u - 0.42) / 0.58) ** 2;    // omurga (rocker)
  const ys = u => 0.27 + 0.03 * u + 0.06 * u ** 4;                                                                 // küpeşte
  const xs = u => -L / 2 + u * L;
  const rakeK = u => u > 0.8 ? 0.62 * ((u - 0.8) / 0.2) ** 2 : u < 0.1 ? -0.16 * ((0.1 - u) / 0.1) ** 2 : 0;       // aynalar eğik
  const X = (u, y) => xs(u) - rakeK(u) * (ys(u) - y);
  const uOf = x => (x + L / 2) / L;
  const floorY = x => yb(Math.max(0, Math.min(1, uOf(x))));
  const section = u => {
    const h = hs(u), b = yb(u), c = hcF(u), top = ys(u), r = Math.min(0.055, (top - b) * 0.3);
    const sd = Math.hypot(h - c, top - b), P1 = [c + (h - c) * r / sd, b + (top - b) * r / sd], P2 = [c - r, b];
    const half = [];
    for (let i = 0; i < 3; i++) { const t = i / 3; half.push([h + (P1[0] - h) * t, top + (P1[1] - top) * t]); }
    for (let i = 0; i <= 4; i++) { const t = i / 4, a = (1 - t) ** 2, m = 2 * (1 - t) * t, q = t * t; half.push([a * P1[0] + m * c + q * P2[0], a * P1[1] + m * b + q * P2[1]]); }
    for (let i = 1; i < 3; i++) { const z = P2[0] * (1 - i / 3); half.push([z, b - 0.008 * (1 - (z / c) ** 2)]); }
    return [...half.map(([z, y]) => [-z, y]), [0, b - 0.008], ...half.reverse().map(([z, y]) => [z, y])];
  };
  function smoothNormals(g, creaseDeg) {
    const p = g.attributes.position.array, n = p.length / 9, fn = [], map = new Map(), cosT = Math.cos(creaseDeg * Math.PI / 180);
    const A = V(), B = V(), C = V();
    for (let t = 0; t < n; t++) {
      A.fromArray(p, t * 9); B.fromArray(p, t * 9 + 3); C.fromArray(p, t * 9 + 6);
      const f = V().subVectors(B, A).cross(C.clone().sub(A)); const ar = f.length(); fn.push(ar > 1e-12 ? f.divideScalar(ar) : f);
      for (let k = 0; k < 3; k++) { const i = t * 3 + k, key = `${p[i * 3].toFixed(4)},${p[i * 3 + 1].toFixed(4)},${p[i * 3 + 2].toFixed(4)}`; (map.get(key) || map.set(key, []).get(key)).push(i); }
    }
    const out = new Float32Array(p.length);
    for (const ids of map.values()) for (const i of ids) {
      const me = fn[Math.floor(i / 3)], acc = V();
      for (const j of ids) { const o = fn[Math.floor(j / 3)]; if (me.dot(o) >= cosT) acc.add(o); }
      acc.normalize(); out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
    }
    g.setAttribute('normal', new T.BufferAttribute(out, 3));
  }
  const hullGeo = (() => {
    const N = 40, pos = [], NS = section(0.5).length;
    const P = (u, k) => { const s = section(u)[k]; return [X(u, s[1]), s[1], s[0]]; };
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      for (let k = 0; k < NS - 1; k++) { const a = P(u0, k), b = P(u1, k), c = P(u1, k + 1), d = P(u0, k + 1); pos.push(...a, ...b, ...c, ...a, ...c, ...d); }
    }
    for (const u of [0, 1]) {
      const s = section(u), cy = (ys(u) + yb(u)) / 2, x = y => X(u, y);
      for (let k = 0; k < NS - 1; k++) pos.push(x(cy), cy, 0, x(s[k][1]), s[k][1], s[k][0], x(s[k + 1][1]), s[k + 1][1], s[k + 1][0]);
      pos.push(x(cy), cy, 0, x(s[NS - 1][1]), s[NS - 1][1], s[NS - 1][0], x(s[0][1]), s[0][1], s[0][0]);
    }
    for (let i = 0; i < pos.length; i += 9) {                          // yüzler dışa baksın
      const a = V(pos[i], pos[i + 1], pos[i + 2]), b = V(pos[i + 3], pos[i + 4], pos[i + 5]), c = V(pos[i + 6], pos[i + 7], pos[i + 8]);
      const n = V().subVectors(b, a).cross(V().subVectors(c, a)), m = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      if (n.dot(m.clone().sub(V(Math.max(-0.9, Math.min(0.9, m.x)), 0.1, 0))) < 0) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); smoothNormals(g, 40);
    return g;
  })();
  // küpeşte: dışa kıvrık kalın kenar
  const rimGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 30; i++) { const u = 0.015 + i / 30 * 0.97; pts.push(V(xs(u), ys(u) + 0.008, hs(u) + 0.008)); }
    for (let i = 30; i >= 0; i--) { const u = 0.015 + i / 30 * 0.97; pts.push(V(xs(u), ys(u) + 0.008, -hs(u) - 0.008)); }
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts, true, 'catmullrom', 0.2), 140, 0.026, 7, true);
  })();

  // ---------- malzemeler ----------
  const white = new T.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const inner = new T.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.6, side: T.BackSide });
  const grey = new T.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.9 });
  const bagMat = new T.MeshStandardMaterial({ color: 0x8f969f, roughness: 0.75 });
  const strapMat = new T.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.7 });
  const red = new T.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
  const dark = new T.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
  const alu = new T.MeshStandardMaterial({ color: 0xc3c9d0, roughness: 0.25, metalness: 0.85 });
  const block = new T.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.5 });
  const foil = new T.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.3, clearcoat: 0.6 });
  const rope = c => new T.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const ropeW = rope(0xe2e8f0), ropeY = rope(0xeab308), ropeO = rope(0xf97316), ropeG = rope(0xa3c615), ropeK = rope(0x111827);
  const skin = new T.MeshStandardMaterial({ color: 0xe0b08a, roughness: 0.8 });
  const sailTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    x.fillStyle = '#fbfcfd'; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = 'rgba(100,116,139,.3)'; x.lineWidth = 2;                // yatay paneller
    for (let i = 1; i < 8; i++) { const y = 512 - i * 64; x.beginPath(); x.moveTo(0, y + 12); x.lineTo(512, y - 12); x.stroke(); }
    x.fillStyle = '#e5e9ee'; x.fillRect(0, 0, 10, 512); x.fillRect(0, 502, 512, 10); x.fillRect(0, 0, 512, 8);
    x.strokeStyle = '#d61f2c'; x.lineWidth = 9;                              // sınıf logosu
    x.beginPath(); x.ellipse(400, 70, 26, 30, 0, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.moveTo(398, 50); x.lineTo(402, 124); x.stroke();
    for (const t of [0.33, 0.72]) { const y = 512 - t * 512; x.fillStyle = 'rgba(203,213,225,.9)'; x.beginPath(); x.arc(432, y + 5, 14, 0, 7); x.fill(); x.strokeStyle = '#7b8794'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(436, y + 5); x.lineTo(504, y - 8); x.stroke(); }
    for (const [px, py] of [[110, 300], [100, 400]]) { x.fillStyle = '#c81e2a'; x.beginPath(); x.arc(px, py, 6, 0, 7); x.fill(); }
    x.fillStyle = 'rgba(176,190,205,.8)'; x.fillRect(205, 450, 150, 18);     // pencere
    x.strokeStyle = '#9bbd12'; x.lineWidth = 3;                              // alt yaka bağları
    for (let i = 1; i < 9; i++) { const px = i * 512 / 9; x.beginPath(); x.moveTo(px - 5, 512); x.lineTo(px, 498); x.lineTo(px + 5, 512); x.stroke(); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const sailMat = new T.MeshStandardMaterial({ map: sailTex, side: T.DoubleSide, roughness: 0.85, transparent: true, opacity: 0.92, emissive: 0x8a96a6, emissiveIntensity: 0.16 });
  const VESTS = [0xdc2626, 0xf97316, 0xfacc15, 0x16a34a, 0x2563eb, 0x7c3aed];

  // ---------- teçhizat geometrisi (yelken düzlemi: a = direkten kıça, h = direk ayağından yukarı, metre) ----------
  const uM = 0.86, xMT = xs(uM), MFy = yb(uM) + 0.02, MAST = 2.35, MR = 0.022, G_H = 0.56, TACK_H = 0.59, HEAD_H = 2.32;
  const C2 = { a: 1.9, h: G_H }, BE2 = { a: 2.01, h: G_H }, H2 = { a: MR + 0.012, h: HEAD_H }, T2 = { a: MR + 0.012, h: TACK_H };
  const Pk2 = (() => {
    const A = H2, B = C2, r1 = 1.24, r2 = 2.8, dx = B.a - A.a, dy = B.h - A.h, d = Math.hypot(dx, dy);
    const k = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - k * k));
    const xm = A.a + k * dx / d, ym = A.h + k * dy / d, p1 = { a: xm + h * dy / d, h: ym - h * dx / d }, p2 = { a: xm - h * dy / d, h: ym + h * dx / d };
    return p1.h > p2.h ? p1 : p2;
  })();
  const S2 = { a: 0, h: Pk2.h - Math.sqrt(Math.max(0, 2.286 ** 2 - Pk2.a ** 2)) };
  const R3 = (p, z = 0) => V(-p.a, p.h, z);                               // rig yerel 3D (−x kıça)
  // yelken yüzeyi: orsa yakası T→H, tepe yakası H→Pk, arka yaka C→Pk (hafif roach), alt yaka T→C; kambur +z yönünde
  const sailGeo = (() => {
    const NU = 16, NV = 14, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const s = i / NU, t = j / NV;
      const la = lerp(T2.a, H2.a, t), lh = lerp(T2.h, H2.h, t), ra = lerp(C2.a, Pk2.a, t), rh = lerp(C2.h, Pk2.h, t);
      let a = lerp(la, ra, s), h = lerp(lh, rh, s);
      const roach = 0.07 * Math.sin(Math.PI * t) * s ** 3; a += roach * 0.7; h -= roach * 0.3;
      const chord = Math.hypot(ra - la, rh - lh), depth = chord * (0.095 - 0.025 * t) * Math.sin(Math.PI * Math.pow(s, 0.78)) * (t < 0.05 ? t / 0.05 * 0.6 + 0.4 : 1);
      pos.push(-a, h, depth); uv.push(s, t);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  })();
  const cyl = (r, mat) => new T.Mesh(new T.CylinderGeometry(r, r, 1, 7), mat);
  const UP = V(0, 1, 0);
  function place(m, a, b) {
    const d = V().subVectors(b, a), l = d.length() || 1e-6;
    m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, l, 1); m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l));
  }
  const capsule = (r, A, B, mat, parent) => {
    const d = V().subVectors(B, A), len = d.length(), m = new T.Mesh(new T.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 14), mat);
    m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); parent.add(m); return m;
  };
  const boxAt = (w, h, d, mat, x, y, z, parent) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const xCT = -0.07, xCaseF = 0.36, xC = (xCT + xCaseF) / 2 + 0.03, yCT = ys(uOf(xCT)) - 0.13, yCase = yCT + 0.04, yMT = ys(uM) - 0.035;
  const xT = xs(0);
  const BRIDLE = V(xCT - 0.2, floorY(xCT - 0.2) + 0.09, 0);           // taban makarası
  const xBr = xs(0) + 0.12, yBr = floorY(xs(0) + 0.12) + 0.13, zBr = 0.36;   // kıç köprüsü

  // Sabit parçalar bir kez kurulur (paylaşılan şablon), her tekne bunu kopyalar
  const tpl = new T.Group();
  {
    const hullOut = new T.Mesh(hullGeo, white); hullOut.name = 'hull'; tpl.add(hullOut);
    tpl.add(new T.Mesh(hullGeo, inner));
    tpl.add(new T.Mesh(rimGeo, white));
    // iç düzen
    const zMT = hs(uM) - 0.06; boxAt(0.3, 0.04, zMT * 2, white, xMT, yMT - 0.02, 0, tpl);                     // direk oturağı
    const ring = new T.Mesh(new T.TorusGeometry(0.034, 0.009, 8, 20), block); ring.rotation.x = Math.PI / 2; ring.position.set(xMT, yMT + 0.002, 0); tpl.add(ring);
    const zCT = hs(uOf(xCT)) - 0.06; boxAt(0.1, 0.035, zCT * 2, white, xCT, yCT - 0.017, 0, tpl);             // orta oturak
    boxAt(xCaseF - xCT - 0.04, yCase - floorY(xC) + 0.02, 0.1, white, (xCT + xCaseF) / 2 + 0.01, (yCase + floorY(xC)) / 2 - 0.01, 0, tpl);   // salma kutusu
    boxAt(0.3, 0.006, 0.022, block, xC, yCase + 0.003, 0, tpl);                                                // salma yuvası
    boxAt(xMT - 0.15 - xCaseF, 0.1, 0.12, white, (xCaseF + xMT - 0.15) / 2, floorY(xCaseF) + 0.05, 0, tpl);     // omurga
    const fl = new T.Mesh(new T.BoxGeometry(0.85, 0.01, 0.6), grey); fl.position.set(-0.55, floorY(-0.55) + 0.008, 0); tpl.add(fl);   // kaymaz taban
    // yüzdürme torbaları: iki yanda borda boyunca + kıçta enine (gri, açık kayışlı, kırmızı tutamak)
    const bagR = 0.11;
    for (const sd of [-1, 1]) {
      const xa = xCT + 0.09, xb = xMT - 0.19, y = x => floorY(x) + bagR * 0.9 + 0.02;
      const A = V(xa, y(xa), sd * (hs(uOf(xa)) - 0.17)), B = V(xb, y(xb), sd * (hs(uOf(xb)) - 0.17));
      const m = capsule(bagR, A, B, bagMat, tpl); m.scale.z = 1;
      for (let i = 0; i < 3; i++) { const t = new T.Mesh(new T.TorusGeometry(bagR * 1.0, 0.008, 4, 20), strapMat); t.position.copy(A).lerp(B, (i + 0.5) / 3); t.rotation.y = Math.PI / 2; tpl.add(t); }
      const tab = new T.Mesh(new T.TorusGeometry(0.026, 0.006, 6, 12), red); tab.position.copy(A).add(V(-0.1, 0, 0)); tpl.add(tab);
    }
    { const u = 0.075, y = yb(u) + bagR * 0.9 + 0.02, z = hs(u) - 0.16, x = X(u, y) + 0.04; capsule(bagR, V(x, y, z), V(x, y, -z), bagMat, tpl);
      for (const f of [-0.5, 0, 0.5]) { const t = new T.Mesh(new T.TorusGeometry(bagR, 0.008, 4, 20), strapMat); t.position.set(x, y, f * z); tpl.add(t); } }
    // ayak kayışları: orta oturağın altından kıça V
    for (const sd of [-1, 1]) {
      const A = V(xCT - 0.06, yCT - 0.07, sd * 0.2), B = V(-0.78, floorY(-0.78) + 0.035, sd * 0.03);
      const st = new T.Mesh(new T.BoxGeometry(0.06, 1, 0.006), dark); place(st, A, B); tpl.add(st);
    }
    // salma: kutudan aşağı (alt ucu yuvarlak) + üstte koyu tutamak
    const DS = new T.Shape(); DS.moveTo(-0.15, 0.05); DS.lineTo(0.15, 0.05); DS.lineTo(0.15, -0.92); DS.quadraticCurveTo(0.15, -1.04, 0.03, -1.05); DS.lineTo(-0.03, -1.05); DS.quadraticCurveTo(-0.15, -1.04, -0.15, -0.92); DS.lineTo(-0.15, 0.05);
    const dg = new T.ExtrudeGeometry(DS, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 8 }); dg.translate(0, 0, -0.006);
    const dag = new T.Mesh(dg, foil); dag.position.set(xC, yCase + 0.02, 0); tpl.add(dag);
    boxAt(0.14, 0.045, 0.034, dark, xC, yCase + 0.08, 0, tpl);
    // direk ve tepe
    const mast = new T.Mesh(new T.CylinderGeometry(MR, MR * 1.05, MAST, 12), alu); mast.name = 'mast'; tpl.add(mast);
  }

  function make(color) {
    const g = new T.Group(), b = new T.Group();                         // g: simülatör eksenleri, b: iç (Ayarlar) eksenleri
    b.rotation.y = Math.PI / 2; g.add(b);
    const body = tpl.clone(true); b.add(body);
    const hullMat = white.clone(); hullMat.color = new T.Color(color);
    body.getObjectByName('hull').material = hullMat;
    const mast = body.getObjectByName('mast');
    // teçhizat grubu: direk ayağında; y direk boyunca, −x kıça; rotation.y = bumba açısı (+ sancağa)
    const rig = new T.Group(); rig.position.set(xMT, MFy, 0); b.add(rig);
    rig.rotation.order = 'YXZ';
    body.remove(mast); mast.position.set(0, MAST / 2, 0); rig.add(mast);
    const rake = 0.035; rig.rotation.z = rake;                          // direk biraz kıça yatık
    const boom = cyl(0.02, alu); place(boom, R3({ a: -0.03, h: G_H }), R3(BE2)); rig.add(boom);
    const band = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.08, 10), red); place(band, R3({ a: BE2.a - 0.1, h: G_H }), R3(BE2)); rig.add(band);
    const sprit = cyl(0.013, alu); place(sprit, R3(S2, 0.03), R3(Pk2, 0.03)); rig.add(sprit);
    const snot = new T.Mesh(new T.BoxGeometry(0.05, 0.06, 0.05), block); snot.position.copy(R3(S2, 0.02)); rig.add(snot);
    const sail = new T.Mesh(sailGeo, sailMat); rig.add(sail);
    // direk bağları (orsa yakası) ve alt yaka bağları (bumba): sarı-yeşil ip halkaları
    for (let i = 0; i < 8; i++) { const h = lerp(HEAD_H, TACK_H, i / 7), r = new T.Mesh(new T.TorusGeometry(0.03, 0.004, 5, 12), ropeG); r.rotation.x = Math.PI / 2; r.position.set(-0.012, h, 0); r.scale.set(1.3, 1, 1); rig.add(r); }
    for (let i = 0; i < 8; i++) { const a = 0.15 + i * 0.23, r = new T.Mesh(new T.TorusGeometry(0.028, 0.0035, 5, 12), ropeG); r.rotation.y = Math.PI / 2; r.position.set(-a, G_H + 0.012, 0); rig.add(r); }
    // sabit ipler (rig içinde): mandar (halyard), köşe gergisi, gırcala ipi, palanga
    const hal = cyl(0.004, rope(0x22c55e)); place(hal, V(0.03, MAST - 0.05, 0), V(0.03, 0.35, 0.01)); rig.add(hal);
    const out = cyl(0.004, ropeO); place(out, R3(C2, 0.01), R3(BE2, 0.01)); rig.add(out);
    const sn1 = cyl(0.004, ropeK); place(sn1, R3(S2, 0.02), V(0.025, S2.h - 0.05, 0)); rig.add(sn1);
    const sn2 = cyl(0.004, ropeK); place(sn2, V(0.025, S2.h - 0.05, 0), V(0.03, 0.62, 0)); rig.add(sn2);
    boxAt(0.03, 0.05, 0.03, block, 0.03, 0.62, 0, rig);
    const vb = R3({ a: 0.34, h: G_H }), vm = V(-0.03, 0.2, 0);
    for (const o of [-0.012, 0, 0.012]) { const m = cyl(0.0045, ropeY); place(m, vb.clone().add(V(0, 0, o)), vm.clone().add(V(0, 0, o * 0.5))); rig.add(m); }
    const vbl = new T.Mesh(new T.SphereGeometry(0.022, 8, 6), block); vbl.position.copy(vm); rig.add(vbl);
    // dümen grubu: kıç aynasında; yeke + uzatma (rotation.y = yeke açısı)
    const rud = new T.Group(); rud.position.set(xT - 0.05, 0, 0); b.add(rud);
    {
      const S = new T.Shape(); S.moveTo(0, 0.36); S.lineTo(0, -0.42); S.bezierCurveTo(0, -0.56, -0.05, -0.62, -0.11, -0.62); S.bezierCurveTo(-0.17, -0.62, -0.2, -0.56, -0.205, -0.46);
      S.lineTo(-0.235, 0.06); S.quadraticCurveTo(-0.24, 0.14, -0.2, 0.2); S.lineTo(-0.14, 0.36); S.lineTo(0, 0.36);
      const bg = new T.ExtrudeGeometry(S, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.005, bevelSegments: 2, curveSegments: 10 }); bg.translate(0, 0, -0.006);
      const blade = new T.Mesh(bg, foil); blade.position.x = -0.035; rud.add(blade);
      for (const sd of [-1, 1]) boxAt(0.16, 0.2, 0.006, alu, -0.09, 0.3, sd * 0.016, rud);
      boxAt(0.03, 0.2, 0.038, alu, -0.012, 0.3, 0, rud);
      for (const y of [0.08, 0.27]) boxAt(0.03, 0.025, 0.06, block, 0.03, y, 0, rud);
      const til = cyl(0.014, dark); place(til, V(-0.1, 0.39, 0), V(0.74, 0.43, 0)); rud.add(til);
    }
    const ext = cyl(0.008, block); b.add(ext);                           // yeke uzatması: yeke ucundan yelkencinin eline
    // hareketli ipler (tekne içinde): ana iskota 5 parça, kıç köprüsü
    const bridle = [cyl(0.004, ropeW), cyl(0.004, ropeW)]; bridle.forEach(m => b.add(m));
    place(bridle[0], V(xBr - 0.05, yBr + 0.08, -zBr), V(xBr, yBr, 0)); place(bridle[1], V(xBr, yBr, 0), V(xBr - 0.05, yBr + 0.08, zBr));
    const sheet = [0, 1, 2, 3].map(() => { const m = cyl(0.0055, ropeW); b.add(m); return m; });
    const blocks = [0, 1, 2].map(() => { const m = new T.Mesh(new T.SphereGeometry(0.022, 8, 6), block); b.add(m); return m; });
    const fb = new T.Mesh(new T.SphereGeometry(0.026, 8, 6), block); fb.position.copy(BRIDLE); b.add(fb);
    // yelkenci: rüzgarüstü küpeştede, yatarak dengeler; bir eli iskotada, öbürü yeke uzatmasında
    const sailor = new T.Group(); b.add(sailor);
    const vest = new T.MeshStandardMaterial({ color: VESTS[Math.abs(Math.round((color >> 16) * 3 + ((color >> 8) & 255) * 5 + (color & 255) * 7)) % VESTS.length], roughness: 0.7 });
    {
      const lean = 0.5, dz = Math.sin(lean), dy = Math.cos(lean);                       // +z: dışarı (rüzgarüstü)
      const torso = new T.Mesh(new T.CapsuleGeometry(0.12, 0.26, 4, 10), vest); torso.position.set(0, dy * 0.24 + 0.04, dz * 0.24); torso.rotation.x = lean; sailor.add(torso);
      const head = new T.Mesh(new T.SphereGeometry(0.085, 12, 10), skin); head.position.set(0, dy * 0.55 + 0.04, dz * 0.55); sailor.add(head);
      const cap = new T.Mesh(new T.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark); cap.position.copy(head.position); cap.rotation.x = lean; sailor.add(cap);
      for (const x of [-0.08, 0.08]) { const leg = new T.Mesh(new T.CapsuleGeometry(0.055, 0.42, 4, 8), dark); const th = Math.atan2(-0.8, -0.6); leg.rotation.x = th; leg.position.set(x, Math.cos(th) * 0.27, Math.sin(th) * 0.27); sailor.add(leg); }
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    sail.castShadow = true;

    const tmp = V(), mat = new T.Matrix4();
    const boomPt = a => { rig.updateMatrix(); return R3({ a, h: G_H - 0.03 }).applyMatrix4(rig.matrix); };
    const state = { eye: V(), hand: V() };
    function pose(o) {
      const beta = Math.max(-70, Math.min(70, o.beta || 0)), tack = o.tack || 1;   // tack +1: rüzgar sancaktan → yelkenci sancakta (+z)
      const fl = o.flutter > 0.15 ? Math.sin(o.time * 17 + color % 7) * 3 * o.flutter : 0;
      rig.rotation.y = (beta + fl) * Math.PI / 180;                      // iç eksende +z sancak; bumba −x'ten +z'ye döner
      sail.scale.z = beta >= 0 ? 1 : -1;
      // yelkenci
      const zs = tack * (hs(0.3) - 0.03), xsl = -0.38;
      sailor.position.set(xsl, ys(0.3) - 0.02, zs); sailor.rotation.y = tack > 0 ? 0 : Math.PI;
      const hand = V(xsl + 0.18, ys(0.3) + 0.2, zs - tack * 0.12), tillHand = V(xsl + 0.05, ys(0.3) + 0.15, zs - tack * 0.05);
      // yeke: yelkencinin elinden uzatmayla
      rud.rotation.y = (o.tiller || 0) * 0.35;
      rud.updateMatrix(); const tipT = V(0.74, 0.43, 0).applyMatrix4(rud.matrix);
      place(ext, tipT, tillHand);
      // ana iskota
      const aft = boomPt(1.78), mid = boomPt(1.0);
      const sb = V(xBr - 0.005, yBr + 0.012, Math.max(-zBr * 0.7, Math.min(zBr * 0.7, aft.z * 0.6)));
      blocks[0].position.copy(sb); blocks[1].position.copy(aft); blocks[2].position.copy(mid);
      place(sheet[0], sb, aft); place(sheet[1], aft, mid); place(sheet[2], mid, BRIDLE); place(sheet[3], BRIDLE, hand);
      // kamera için göz (dış grup yerel eksenlerinde)
      b.updateMatrix(); state.eye.set(xsl + 0.02, ys(0.3) + 0.62, zs * 1.15).applyMatrix4(b.matrix);
      void tmp; void mat;
    }
    pose({ beta: 20, tack: 1, time: 0 });
    return { g, rig, sail, pose, state, L, hw: hs(0.4), mastH: MAST };
  }
  return { make };
}

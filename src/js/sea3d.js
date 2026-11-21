// Velora Sailing – gerçekçi 3D deniz ortamı (three.js). Ayar sayfası ve ileride tekne içinden görünüş ortak kullanır.
// Gökyüzü (gradyan + güneş + bulut), gökyüzünden yansıma haritası (PMREM), dalgalı su (Fresnel yansıma, güneş parıltısı,
// köpük), güneş gölgesi, sinema renk ayarı (ACES tone mapping) ve jelkot (clearcoat) malzemesi.
// Su yüzeyi y = 0. Eksenler: Y yukarı. Kullanım:
//   const sea = createSea(THREE, renderer, scene, { sunDir, quality });
//   sea.update(time, { amp, cameraPos })   // her kare, render'dan önce
//   sea.finishObject(group)                // gölge aç, beyaz plastikleri jelkot yap
import * as THREE from 'three';

const SKY_GLSL = /* glsl */`
  uniform vec3 uSunDir;
  uniform float uCloud;
  uniform vec3 uHorizon;
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  vec3 skyCol(vec3 d, bool clouds){
    float y = d.y;
    vec3 zen = vec3(0.045, 0.16, 0.48), hor = uHorizon;
    vec3 c = mix(hor, zen, pow(clamp(y, 0.0, 1.0), 0.5));
    float s = max(dot(d, uSunDir), 0.0);
    c += vec3(1.0, 0.85, 0.62) * (pow(s, 6.0) * 0.22 + pow(s, 48.0) * 0.35);
    if (clouds && y > 0.0) {
      vec2 uv = d.xz / (y + 0.12) * 1.4;
      float n = fbm(uv + vec2(0.0, 3.0));
      float cl = smoothstep(0.52 - 0.12 * uCloud, 0.78, n) * smoothstep(0.0, 0.18, y);
      vec3 cc = mix(vec3(0.62, 0.68, 0.76), vec3(1.0, 0.98, 0.95), clamp(n * 1.4 - 0.3 + pow(s, 4.0) * 0.4, 0.0, 1.0));
      c = mix(c, cc, cl * 0.9);
    }
    if (y < 0.0) c = mix(hor, vec3(0.16, 0.30, 0.40), clamp(-y * 3.0, 0.0, 1.0));
    return c;
  }`;

export function createSea(T, renderer, scene, opts = {}) {
  const small = Math.min(window.innerWidth, window.innerHeight) < 600 || /iPhone|Android.+Mobile/.test(navigator.userAgent);
  const quality = opts.quality || (small ? 'low' : 'high');
  const sunDir = (opts.sunDir || new T.Vector3(0.5, 0.62, 0.6)).clone().normalize();

  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure || 0.88;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const uniforms = {
    uSunDir: { value: sunDir }, uCloud: { value: 0.5 }, uTime: { value: 0 }, uAmp: { value: 0.03 },
    uChop: { value: 0.5 }, uHorizon: { value: new T.Color(0.40, 0.58, 0.80) },
  };

  // ---------- gökyüzü kubbesi ----------
  const skyMat = new T.ShaderMaterial({
    uniforms, side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
      vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 0.0)).xyz + cameraPosition, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: SKY_GLSL + `varying vec3 vDir; void main(){ vec3 d = normalize(vDir); vec3 c = skyCol(d, true);
      float s = max(dot(d, uSunDir), 0.0); c += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 12.0;
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(10, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // yansıma ortamı: gökyüzünü bir kez PMREM'e çiz (bulutsuz, yumuşak)
  {
    const pm = new T.PMREMGenerator(renderer);
    const envScene = new T.Scene();
    const envMat = new T.ShaderMaterial({
      uniforms, side: T.BackSide,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: SKY_GLSL + `varying vec3 vDir; void main(){ vec3 d = normalize(vDir); vec3 c = skyCol(d, true);
        float s = max(dot(d, uSunDir), 0.0); c += vec3(1.0, 0.95, 0.85) * pow(s, 300.0) * 30.0; gl_FragColor = vec4(c, 1.0); }`,
    });
    envScene.add(new T.Mesh(new T.SphereGeometry(5, 48, 24), envMat));
    const rt = pm.fromScene(envScene, 0.02);
    scene.environment = rt.texture;
    pm.dispose();
  }

  // ---------- güneş ve gölge ----------
  const sun = new T.DirectionalLight(0xfff4e0, 2.6);
  sun.position.copy(sunDir).multiplyScalar(12);
  sun.castShadow = true;
  const SM = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(SM, SM);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight(0xcfe6ff, 0x16384c, 0.35);
  scene.add(hemi);
  scene.fog = new T.Fog(uniforms.uHorizon.value.clone(), 80, 520);

  // ---------- su ----------
  // ızgara merkezde sık, ufka doğru seyrek (tek ağ, ufka kadar)
  const N = quality === 'low' ? 150 : 220, R = 600;
  const pos = new Float32Array((N + 1) * (N + 1) * 3), idx = [];
  const warp = u => Math.sign(u) * Math.pow(Math.abs(u), 2.6) * R;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = (j * (N + 1) + i) * 3;
    pos[k] = warp(i / N * 2 - 1); pos[k + 1] = 0; pos[k + 2] = warp(j / N * 2 - 1);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const wg = new T.BufferGeometry();
  wg.setAttribute('position', new T.BufferAttribute(pos, 3));
  wg.setIndex(idx);
  const WAVES = /* glsl */`
    uniform float uTime, uAmp, uChop;
    // yönlü dalgalar: (yön x, yön z, dalga sayısı k, genlik oranı, hız)
    const int NW = 5;
    vec4 W[5]; float S[5];
    void initW(){
      W[0] = vec4(0.94, 0.34, 1.35, 1.00); S[0] = 1.25;
      W[1] = vec4(0.62, -0.78, 2.10, 0.55); S[1] = 1.70;
      W[2] = vec4(0.20, 0.98, 3.10, 0.32); S[2] = 2.05;
      W[3] = vec4(-0.55, 0.83, 4.70, 0.18); S[3] = 2.60;
      W[4] = vec4(0.99, -0.12, 6.60, 0.10); S[4] = 3.10;
    }
    // yükseklik ve eğim (dh/dx, dh/dz)
    vec3 waveH(vec2 p, float fade){
      float h = 0.0; vec2 g = vec2(0.0);
      for (int i = 0; i < NW; i++){
        vec2 d = normalize(W[i].xy); float k = W[i].z, a = W[i].w * uAmp * fade;
        float ph = dot(d, p) * k - uTime * S[i];
        h += a * sin(ph); g += a * k * cos(ph) * d;
      }
      return vec3(h, g);
    }`;
  const waterMat = new T.ShaderMaterial({
    uniforms, transparent: true, depthWrite: true, fog: false,
    vertexShader: WAVES + `
      varying vec3 vW; varying float vH;
      void main(){ initW(); vec4 w = modelMatrix * vec4(position, 1.0);
        float fade = 1.0 - smoothstep(25.0, 90.0, length(w.xz));
        vec3 hw = waveH(w.xz, fade); w.y += hw.x; vW = w.xyz; vH = hw.x;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: SKY_GLSL + WAVES + `
      varying vec3 vW; varying float vH;
      // ince kırışıklık (ripple): ekran yakınında yüksek frekanslı küçük dalgalar
      vec2 ripple(vec2 p, float t){
        vec2 g = vec2(0.0);
        g += 0.050 * cos(dot(p, vec2(9.1, 3.7)) - t * 4.1) * vec2(9.1, 3.7);
        g += 0.040 * cos(dot(p, vec2(-6.3, 10.2)) - t * 4.8) * vec2(-6.3, 10.2);
        g += 0.026 * cos(dot(p, vec2(15.7, -7.9)) - t * 6.0) * vec2(15.7, -7.9);
        g += 0.018 * cos(dot(p, vec2(-19.0, -12.5)) - t * 6.9) * vec2(-19.0, -12.5);
        g += 0.012 * cos(dot(p, vec2(27.0, 21.0)) - t * 8.3) * vec2(27.0, 21.0);
        return g * 0.02;
      }
      void main(){
        initW();
        float dist = length(vW - cameraPosition);
        float fade = 1.0 - smoothstep(25.0, 90.0, length(vW.xz));
        vec3 hw = waveH(vW.xz, fade);
        float rf = (1.0 - smoothstep(6.0, 40.0, dist)) * (0.6 + uChop);
        vec2 g = hw.yz + ripple(vW.xz, uTime) * rf;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        vec3 refl = skyCol(R, false);
        vec3 deep = vec3(0.004, 0.035, 0.065), shallow = vec3(0.02, 0.16, 0.20);
        float sss = clamp(vH / max(uAmp, 0.001) * 0.5 + 0.5, 0.0, 1.0) * max(dot(V, -uSunDir) * 0.5 + 0.5, 0.0);
        vec3 body = mix(deep, shallow, 0.25 + 0.55 * sss);
        body *= 0.6 + 0.4 * max(dot(N, uSunDir), 0.0);
        vec3 col = mix(body, refl, fres);
        float sp = max(dot(R, uSunDir), 0.0);
        col += vec3(1.0, 0.93, 0.8) * (pow(sp, 900.0) * 14.0 + pow(sp, 120.0) * 0.6);
        float fn = fbm(vW.xz * 4.0 + vec2(uTime * 0.25, 0.0)) * fbm(vW.xz * 11.0 - vec2(0.0, uTime * 0.4)) * 2.2;
        float crest = vH / (2.15 * max(uAmp, 0.001));
        float foam = smoothstep(0.78, 1.0, crest * 0.6 + fn * 0.55) * smoothstep(0.035, 0.07, uAmp) * (1.0 - smoothstep(10.0, 45.0, dist)) * 0.5;
        col = mix(col, vec3(0.85, 0.9, 0.93), foam);
        float fogK = smoothstep(60.0, 520.0, dist);
        col = mix(col, uHorizon, fogK);
        gl_FragColor = vec4(col, mix(0.9, 1.0, max(fres, fogK)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  waterMat.uniforms.uHorizon = uniforms.uHorizon;
  const water = new T.Mesh(wg, waterMat);
  water.renderOrder = 20; water.frustumCulled = false;
  scene.add(water);
  // suya düşen gölge: suyun üstünde yalnız gölge çizen ince düzlem
  const shadowCatcher = new T.Mesh(new T.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), new T.ShadowMaterial({ opacity: 0.26, depthWrite: false }));
  shadowCatcher.position.y = 0.01; shadowCatcher.receiveShadow = true; shadowCatcher.renderOrder = 21;
  scene.add(shadowCatcher);

  // ---------- malzemeler ----------
  function gelcoat(m) {
    return new T.MeshPhysicalMaterial({
      color: m.color, roughness: Math.min(0.4, m.roughness), metalness: 0, side: m.side,
      clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.0,
    });
  }
  // gövde, oturak gibi beyaz/açık plastik parçalar jelkot olur; metaller yansımayla parlar; hepsi gölge alır/verir
  function finishObject(root, o = {}) {
    const seen = new Map();
    root.traverse(obj => {
      if (!obj.isMesh) return;
      const m = obj.material;
      if (!m || !m.colorWrite || m.isShadowMaterial) return;
      if (!m.transparent || o.shadowTransparent) { obj.castShadow = true; obj.receiveShadow = true; }
      if (m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && !m.map) {
        const c = m.color, lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        if (lum > 0.8 && m.metalness < 0.2 && m.roughness < 0.5) {
          if (!seen.has(m)) seen.set(m, gelcoat(m));
          obj.material = seen.get(m);
        } else if (m.metalness > 0.2) { m.envMapIntensity = 1.3; m.roughness = Math.min(m.roughness, 0.3); }
      }
    });
  }

  function update(time, o = {}) {
    uniforms.uTime.value = time;
    if (o.amp !== undefined) uniforms.uAmp.value = o.amp;
    if (o.chop !== undefined) uniforms.uChop.value = o.chop;
    if (o.focus) {                                   // gölge kamerası odağı izler
      sun.target.position.copy(o.focus);
      sun.position.copy(o.focus).addScaledVector(sunDir, 12);
      shadowCatcher.position.x = o.focus.x; shadowCatcher.position.z = o.focus.z;
    }
  }
  // CPU'da aynı dalga yüksekliği (tekneyi dalgaya oturtmak için)
  const WJ = [[0.94, 0.34, 1.35, 1.0, 1.25], [0.62, -0.78, 2.1, 0.55, 1.7], [0.2, 0.98, 3.1, 0.32, 2.05], [-0.55, 0.83, 4.7, 0.18, 2.6], [0.99, -0.12, 6.6, 0.1, 3.1]]
    .map(([x, z, k, a, s]) => { const l = Math.hypot(x, z); return [x / l, z / l, k, a, s]; });
  function heightAt(x, z) {
    const t = uniforms.uTime.value, A = uniforms.uAmp.value;
    let h = 0;
    for (const [dx, dz, k, a, s] of WJ) h += a * A * Math.sin((dx * x + dz * z) * k - t * s);
    return h;
  }

  return { sun, hemi, sky, water, uniforms, update, finishObject, heightAt, quality, sunDir };
}

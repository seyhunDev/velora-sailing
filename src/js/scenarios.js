/* Senaryo tanımları. Her senaryo:
   id, kategori, başlık, özet, süre, rüzgar, start çizgisi / şamandıralar,
   scripted tekneler (segment listesi), adımlar (zamanlı açıklama), tekne ekleme noktaları.
   Koordinat alanı: 1000 x 680.
*/
(function (global) {
  const S = [];
  /* Gri filo dizisi (kullanıcı 2026-11-22, gerçekçi kalabalık): bir ders teknesinin rotasını zamanda kaydırıp
     arkasına (k > 0) ya da önüne (k < 0) aynı yoldan giden tekneler üretir. İlk segment (orsa) k·gap sn uzar/kısalır,
     başlangıç noktası o kadar geriye/ileriye taşınır. Kurallara göre değil, ders teknesi gibi rotalı; listede tek satır. */
  const DEG = Math.PI / 180;
  // Gri filo: ders teknesinin rotasını yana/öne kaydırılmış başlangıçtan aynen giden kopyalar (offs: [{dx, dy}])
  function fleetCopies(base, offs, from) {
    return offs.map((o, i) => ({ id: String(from + i), name: 'Filo', crowd: true, color: '#b8c7d6', v0: base.v0,
      start: { ...base.start, x: base.start.x + o.dx, y: base.start.y + o.dy }, segs: base.segs.map(sg => ({ ...sg, note: undefined })) }));
  }
  function fleetTrain(base, ks, gap, speed, from) {
    return ks.map((k, i) => {
      const d = k * gap * speed, s0 = base.start;
      const last = base.segs.length - 1;   // öndekiler son ayakta o kadar uzun gider (sahnede durmasınlar)
      const segs = base.segs.map((sg, j) => ({ ...sg, note: undefined, dur: sg.dur + (j === 0 ? k * gap : 0) + (j === last ? Math.max(0, -k * gap) + 2 : 0) }));
      return { id: String(from + i), name: 'Filo', crowd: true, color: '#b8c7d6', v0: base.v0,
        start: { x: s0.x - Math.sin(s0.h * DEG) * d, y: s0.y + Math.cos(s0.h * DEG) * d, h: s0.h }, segs };
    });
  }

  // ---------- A1: Start çizgisi avantajı ----------
  S.push({
    id: 'a1-line-bias',
    category: 'Taktik', topic: 'Start',
    title: 'A1 · Start çizgisi avantajı (line bias)',
    summary: 'Çizgi rüzgara tam dik değilse bir uç diğerinden daha "rüzgarüstünde"dir. O uçtan start alan tekne, aynı kontrada aynı hızla gitse bile öndedir.',
    duration: 13,
    baseSpeed: 48,
    wind: 15,                                     // rüzgar KKD'den → hakem botu (sağ) ucu avantajlı
    line: { pin: { x: 300, y: 600 }, boat: { x: 700, y: 600 } },
    startAt: 0,
    rungs: { boat: 'B', from: 1.5 },
    boats: [
      { id: 'A', name: 'Pin ucu', color: '#e4572e',
        start: { x: 336, y: 614, h: 330 },
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 5, turn: 0 },
          { mode: 'closehauled', tack: 'port', dur: 8, turn: 1.5 }
        ], v0: 48 },
      { id: 'B', name: 'Hakem botu ucu', role: 'dogru', color: '#1f77b4',
        start: { x: 644, y: 614, h: 330 },
        segs: [{ mode: 'closehauled', tack: 'starboard', dur: 13, turn: 0 }], v0: 48 }
    ],
    steps: [
      { t: 0, title: 'Aynı anda start', text: 'A ve B aynı anda, aynı hızla start alıyor. İkisi de sancak kontrada, orsa gidiyor. Rüzgar biraz sağdan, hakem botu tarafından esiyor. Bu yüzden hakem botu ucu rüzgara daha yakın.' },
      { t: 1.5, title: 'Merdiven basamağı', text: 'Kesikli çizgi rüzgara dik duran bir merdiven basamağı. Rüzgara karşı kim önde, bu çizgi gösterir. B\'nin basamağı A\'nınkinden önde. A da düz gidiyor ama B\'nin gerisinde kalıyor.' },
      { t: 5, title: 'A tramola atıyor', text: 'A tramola atıp iskele kontraya geçiyor ve B\'ye doğru gidiyor. İskele kontradaki tekne, sancak kontradakine yol verir. Bu Kural 10. A zaten B\'nin arkasından geçecek.' },
      { t: 10, title: 'Sonuç', text: 'A, B\'nin arkasından geçiyor. Farkın tek sebebi start çizgisinin avantajlı ucu. Start\'tan önce bunu mutlaka ölç. Kolay yol şu: çizgi boyunca iki uca da seyret. Hangi uca giderken daha orsa gidiyorsan, o uç avantajlıdır.' }
    ],
    addBoat: { pin: { x: 400, y: 612 }, middle: { x: 500, y: 612 }, committee: { x: 620, y: 612 } },
    // filo ön sırada, B'ye 1 boy aralıkla (merkezler ~50 px). 2. sıra yok: A'nın iskele rotası onların önünü keserdi
    // (iskele kontra, sancak kontraya yol vermeli; K10). A hepsinin kıçından geçer.
    crowd: [{ pos: { x: 500, y: 614 }, tack: 'starboard', v0: 48 }, { pos: { x: 550, y: 614 }, tack: 'starboard', v0: 48 }, { pos: { x: 600, y: 614 }, tack: 'starboard', v0: 48 }]
  });

  // ---------- A1b: Hat avantajını ölçme yöntemleri ----------
  S.push({
    id: 'a1b-measure',
    category: 'Taktik', topic: 'Start',
    title: 'A1b · Hat avantajını ölçmenin 3 yolu',
    summary: 'Start öncesi mutlaka ölçün: (1) hat ortasında rüzgara karşı durup burnun gösterdiği yöne göre hangi ucun önde kaldığına bakın, (2) hat boyunca iki yöne seyredip hangi yönde daha orsa gittiğinizi görün, (3) pusulayla hat yönünü rüzgar yönüyle karşılaştırın.',
    duration: 24,
    baseSpeed: 48,
    wind: 15,
    line: { pin: { x: 300, y: 400 }, boat: { x: 700, y: 400 } },
    rungs: { boat: 'M', from: 1.5, to: 7.5 },
    readouts: [{ boat: 'M', from: 7.5, to: 19 }],
    boats: [
      { id: 'M', name: 'Ölçüm yapan', color: '#2a9d8f',
        start: { x: 500, y: 440, h: 15 }, v0: 2,
        segs: [
          { mode: 'hold', h: 15, dur: 7.5, speed: 0.02, turn: 0, note: 'Rüzgara karşı duruyor' },
          { mode: 'heading', h: 270, dur: 3.2, turn: 1.2, note: 'Pin\'e doğru' },
          { mode: 'heading', h: 90, dur: 6.3, turn: 1.4, note: 'Hakem botuna doğru' },
          { mode: 'hold', h: 15, dur: 7.0, speed: 0.02, turn: 1.2 }
        ] }
    ],
    steps: [
      { t: 0, title: 'Yöntem 1: rüzgara karşı dur', text: 'Hattın ortasında burnunu tam rüzgara çevir ve dur. Sağ üstteki ok rüzgarı gösteriyor. Rüzgar biraz sağdan geliyor.' },
      { t: 1.5, title: 'Basamağı oku', text: 'Kesikli çizgi senin omuz hizan. Bu çizginin önünde kalan uç avantajlıdır. Burada hakem botu çizginin önünde, pin ise geride kaldı. Yani hakem botu ucu avantajlı.' },
      { t: 7.5, title: 'Yöntem 2: iki uca seyret', text: 'Hattın hemen gerisinde önce bir uca, sonra öbür uca seyret. Her seferinde yelkenin ne kadar açık, ona bak.' },
      { t: 9, title: 'Pin\'e doğru: yelken açık', text: 'Pin\'e giderken yelken iyice açık. Apaz gidiyorsun. Bu yön rüzgardan uzaklaşıyor.' },
      { t: 12.5, title: 'Hakem botuna doğru: yelken kapalı', text: 'Hakem botuna giderken yelken daha kapalı. Daha orsa gidiyorsun. Hangi uca giderken daha orsa gidiyorsan, o uç avantajlıdır. Fark büyükse avantaj da büyüktür.' },
      { t: 18, title: 'Yöntem 3: pusula', text: 'Pusulayla hattın yönünü ve rüzgarın yönünü ölç. Rüzgar hatta tam dik değilse, rüzgarın döndüğü uç avantajlıdır. Burada fark 15 derece. Bu, yaklaşık 2 tekne boyu kazanç demek.' },
      { t: 21, title: 'Pratik', text: 'Üç yöntemi birlikte kullan. Rüzgar dönüyorsa son 3 dakikada yeniden ölç. Sonra planını yap: hangi uç, hangi boşluk? Bunları A3 ve A4 derslerinde göreceksin.' }
    ],
    addBoat: { pin: { x: 380, y: 520 }, middle: { x: 520, y: 560 }, committee: { x: 660, y: 520 } }
  });

  // ---------- A2: Zamanlama ve hızlanma ----------
  S.push({
    id: 'a2-timing',
    category: 'Taktik', topic: 'Start',
    title: 'A2 · Zamanlama: hattın dibinde bekle, 10-12 sn kala doldur',
    summary: 'Optimist ve ILCA gibi küçük tekneler start hattının hemen gerisinde (1-1.5 tekne boyu) rüzgara baş verip beklerler; aralarında boşluk bırakırlar. İyi start = sinyalden 10-12 saniye önce yelkeni doldurup (Optimist tam hıza bu sürede çıkar) sinyal anında hattı tam hızla geçmek.',
    duration: 28,
    baseSpeed: 40,
    goBefore: 2.5,       // bu derste filo da 10 gerçek sn kala doldurur (diğer start senaryolarında 6 sn, hattın daha dibinde)
    clockScale: 4,       // 1 animasyon saniyesi = 4 gerçek saniye; ivme simülatördeki Optimist tablosundan (engine.accelTau)
    wind: 0,
    line: { pin: { x: 250, y: 420 }, boat: { x: 750, y: 420 } },
    startAt: 20,
    committeeLabel: 'upright',
    boats: [
      { id: 'D', name: 'Doğru zamanlama', role: 'dogru', color: '#2a9d8f',
        start: { x: 700, y: 540, h: 290 }, v0: 25,
        segs: [
          { mode: 'heading', h: 290, dur: 4, speed: 0.5, turn: 0 },         // hattın dibine yarım hızla gel
          { mode: 'hold', h: 340, dur: 12.9, speed: 0.05, turn: 1.0 },      // rüzgara baş ver, bekle
          { mode: 'closehauled', tack: 'starboard', dur: 11.1, turn: 0.8 }  // 3 s kala doldur, hızlan
        ] },
      { id: 'E', name: 'Erken (fodepar)', role: 'hata', color: '#e76f51',
        start: { x: 455, y: 492, h: 340 }, v0: 2,
        segs: [
          { mode: 'hold', h: 340, dur: 17.2, speed: 0.05, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 3.3, turn: 0.8 },   // 2.8 s kala doldurdu: yarım boy erken → burnu çizgiyi geçer
          { mode: 'hold', h: 0, dur: 1.5, speed: 0.05, turn: 0.8, note: 'Fodepar!' },        // durdu
          { mode: 'heading', h: 180, dur: 2.4, turn: 1.2, note: 'Geri dön' },                  // çizginin altına in
          { mode: 'closehauled', tack: 'starboard', dur: 3.6, turn: 1.2 }
        ] },
      { id: 'G', name: 'Geç kalan', role: 'hata', color: '#8d99ae',
        start: { x: 335, y: 495, h: 340 }, v0: 2,
        segs: [
          { mode: 'hold', h: 340, dur: 19.5, speed: 0.05, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 8.5, turn: 0.8 }
        ] }
    ],
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.215, drift: 0.5 }, { slot: 0.455, back: 6 }, { slot: 0.70, back: -4 }, { slot: 0.79, back: 6 },
      { slot: 0.17, row: 1, drift: 0 }, { slot: 0.44, row: 1 },
      // hakem botunun dibi baştan boş: iki tekne dışarıda bekler, filo kaydıkça açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 828, y: 442, h: 0, until: 10, speed: 0.45 } },
      { slot: 0.86, row: 1, wait: { x: 862, y: 485, h: 355, until: 11, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 1 dakika 20 saniye', text: 'Gri tekneler hattın 1 boy kadar gerisinde bekliyor. Burunları rüzgara yakın, yelkenleri boş. Aralarında boşluklar var. Boşluk, hızlanacağın yerdir. Yeşil tekne yavaşça yerine geliyor.' },
      { t: 4, title: 'Yerini al, rüzgara baş ver', text: 'Yeşil tekne de hattın dibinde durdu. Yelkeni boş, sallanıyor. Optimist hattan uzakta değil, hemen gerisinde bekler. Rüzgaraltındaki boşluğu koru. Biri sokulursa orsa et ve kapat. Bu Kural 11.' },
      { t: 17.2, title: 'Turuncu bir saniye erken doldurdu', text: 'Turuncu yelkenini 11 saniye kala doldurdu. Yeşil 12 saniye kala doldurdu ama bir boy daha gerideydi. Bir iki saniye bile yarım boy eder.' },
      { t: 19.6, title: 'Burun çizgiyi geçti: erken start', text: 'Start anında teknenin bir parçası, mesela burnu, çizginin önündeyse erken start yaptın. Buna fodepar denir. Çoğu fodepar böyle yarım boyla olur. Hangi bayrak varsa ona göre geri dönersin. A12 dersinde bayrakları göreceksin.' },
      { t: 16.5, title: '14 saniye kala: hazırlan', text: 'Yeşil tekne yelkenini dolduruyor. Filo 10 saniye kala dolduracak. Optimist yelkeni doldurunca tam hıza 10 12 saniyede çıkar. Bu yüzden hattın dibinde bekle, son 10 12 saniyede hızlan.' },
      { t: 20, title: 'START', text: 'Yeşil tekne tam start anında, tam hızla çizgide. Filo da onunla çıkıyor. Turuncu geri dönmek zorunda, çok zaman kaybedecek. Gri tekne geç doldurdu, çizgiyi yavaş ve geç geçecek.' },
      { t: 25, title: 'Sonuç', text: 'Formül şu: hattın bir boy gerisinde rüzgara baş ver, bekle. Rüzgaraltında boşluk tut. Start\'tan 10 12 saniye önce yelkeni doldur. Antrenmanda bir boyu kaç saniyede gittiğini tekrar tekrar ölç.' }
    ],
    addBoat: { pin: { x: 290, y: 560 }, middle: { x: 390, y: 640 }, committee: { x: 720, y: 560 } },
    expectEarly: ['E'],
    startSlots: { pin: [0.28], middle: [0.54], committee: [0.86] }
  });

  // ---------- A3: Pin ucu avantajlı ----------
  S.push({
    id: 'a3-pin-favored',
    category: 'Taktik', topic: 'Start',
    title: 'A3 · Pin ucu avantajlıysa: pin\'e yetiş, hemen tramola, pin\'e sıkışma',
    summary: 'Pin ucu avantajlıysa en iyi start pin\'in hemen yanından, sancak kontra, tam zamanında; sonra hemen iskele kontraya tramola atıp filoyu ÖNDEN kesmek. Tek şart: pin\'e giden layline\'ın ÜSTÜNDE olmak. Layline\'ın altında kalan tekne pin\'i dönemez; dışarıdan geçer ve geri dönmek zorunda kalır.',
    duration: 16.5,
    baseSpeed: 48,
    clockScale: 4,            // sayaç gerçek saniye (1 animasyon sn = 4 sn); ivme Optimist tablosundan
    wind: 335,
    line: { pin: { x: 200, y: 480 }, boat: { x: 800, y: 480 } },
    startAt: 6,
    rungs: { boat: 'P1', from: 8 },
    laylines: [{ x: 200, y: 480, tack: 'starboard', len: 400, from: 2, label: 'Pin layline\'ı (sancak)' }],
    boats: [
      { id: 'P1', name: 'Pin\'de tam zamanında', role: 'dogru', color: '#2a9d8f',
        start: { x: 324, y: 507, h: 310 }, v0: 2,
        segs: [
          { mode: 'hold', h: 310, dur: 3.8, speed: 0.05, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 3.2, turn: 0.8 },
          { mode: 'closehauled', tack: 'port', dur: 9.5, turn: 1.4, note: 'Tramola → filoyu önden kes' }
        ] },
      { id: 'P2', name: 'Layline altında, sıkışan', role: 'hata', color: '#e76f51',
        start: { x: 290, y: 546, h: 310 }, v0: 2,
        segs: [
          { mode: 'hold', h: 310, dur: 3.8, speed: 0.05, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 2, turn: 0.8 },
          { mode: 'closehauled', tack: 'starboard', dur: 2.5, turn: 0, note: 'Pin\'e yetişemiyor!' },
          { mode: 'heading', h: 118, dur: 4.6, turn: 1.4, note: 'Çizgi dışı → geri dönüyor' },
          { mode: 'closehauled', tack: 'starboard', dur: 3.6, turn: 1.4 }
        ] },
      { id: 'P3', name: 'Ortadan güvenli', role: 'dogru', color: '#1f77b4',
        start: { x: 684, y: 507, h: 310 }, v0: 2,
        segs: [
          { mode: 'hold', h: 310, dur: 3.8, speed: 0.05, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 12.7, turn: 0.8 }
        ] }
    ],
    steps: [
      { t: 0, title: 'Pin ucu avantajlı', text: 'Rüzgar sol taraftan, pin tarafından geliyor. Pin ucu hakem botundan yaklaşık 5 tekne boyu önde. Herkes pin tarafına toplanmış, hakem botu tarafı boş. Start\'a 24 saniye var.' },
      { t: 2, title: 'Pin layline\'ı', text: 'Mavi kesikli çizgi pin\'in layline\'ı. Bu çizginin üstündeki tekne pin\'e yetişir. Altında kalan yetişemez. Yeşil P1 tam çizginin üstünde, turuncu P2 altında.' },
      { t: 4, title: 'P2 pin\'e yetişemiyor', text: 'P2 orsa gidiyor ama burnu pin\'in soluna düşüyor. İki seçeneği var. Tramola atıp filoya girmek tehlikeli, çünkü iskele kontrada yol vermek zorunda. Pin\'in dışından geçip geri dönmek de zaman kaybettirir.' },
      { t: 6, title: 'START: P1 pin\'de', text: 'P1 start anında pin\'in hemen yanında, tam hızda. Avantajlı uçta, temiz havada. Rüzgaraltında kimse yok.' },
      { t: 7.0, title: 'P1 hemen tramola', text: 'Pin\'den çıkan tekne sancakta uzun gitmez. Pin\'i geçer geçmez tramola atar. Neden? Çünkü filonun önünde. İskele kontrada herkesin önünden geçip istediği tarafa gidebilir.' },
      { t: 8.6, title: 'P2 çizgi dışından geçti', text: 'P2 pin\'in dışından geçti. Bu start sayılmaz. Geri dönüp hattı iki ucun arasından yeniden geçmesi gerekiyor.' },
      { t: 11, title: 'P1, P3\'ün önünden geçiyor', text: 'İskele kontradaki P1, sancak kontradaki P3\'ün önünden rahatça geçiyor. Normalde iskele kontra yol verir ama P1 yeterince önde. Fark yaklaşık bir buçuk boy.' },
      { t: 12.5, title: 'P2 geri dönüyor', text: 'P2 hattın altına inip yeniden start alıyor. Yarım dakika kaybediyor ve filonun arkasında pis havada kalıyor. Pin\'e sıkışmanın bedeli bu.' },
      { t: 15, title: 'Sonuç', text: 'Pin avantajlıysa layline\'ı son 30 saniyede kontrol et. Layline\'ın biraz üstünden gel. Son 10 saniyede hızlan. Pin\'i geçince tramola at. Emin değilsen pin\'den 2 3 boy sağda start al. Az kaybedersin ama risk yok.' }
    ],
    addBoat: { pin: { x: 400, y: 650 }, middle: { x: 560, y: 660 }, committee: { x: 660, y: 650 } },
    startSlots: { pin: [0.2], middle: [0.4], committee: [0.6] },
    expectOutside: ['P2'],
    // filo P1'in tramola rotasının sağında: P1 iskele kontrada hepsinin önünden temiz geçer (simülatörde K14/protesto yok)
    crowdLife: { gap: 38 },
    crowd: [{ slot: 0.36 }, { slot: 0.47 }, { slot: 0.58 }]
  });

  // ---------- A4: Hakem botu ucu avantajlı ----------
  S.push({
    id: 'a4-committee-favored',
    category: 'Taktik', topic: 'Start',
    title: 'A4 · Hakem botu ucu avantajlıysa: layline, barging ve güvenli yer',
    summary: 'Hakem botu ucu avantajlıysa herkes oraya ister. Oraya ancak hakem botunun layline\'ında, rüzgaraltından gelerek hak kazanılır. Rüzgarüstünden sokulmak (barging) hak vermez: rüzgaraltındaki tekne orsa edip kapıyı kapatabilir.',
    duration: 18,
    baseSpeed: 40,
    clockScale: 4,            // sayaç gerçek saniye (1 animasyon sn = 4 sn); ivme Optimist tablosundan
    wind: 15,
    line: { pin: { x: 240, y: 400 }, boat: { x: 640, y: 400 } },
    startAt: 7.5,
    rungs: { boat: 'L', from: 9 },
    laylines: [{ x: 612, y: 400, tack: 'starboard', len: 330, from: 1, label: 'Hakem botu layline\'ı' }],
    boats: [
      { id: 'L', name: 'Rüzgaraltı · layline\'da', role: 'hak', color: '#2a9d8f',
        start: { x: 706, y: 612, h: 330 }, v0: 40,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 2.5, turn: 0 },
          { mode: 'hold', h: 355, dur: 1.3, speed: 0.15, turn: 0.8, note: 'Orsa ediyor: "Yer yok!"' },
          { mode: 'closehauled', tack: 'starboard', dur: 14.2, turn: 1.0 }
        ] },
      { id: 'W', name: 'Rüzgarüstü · barging', role: 'hata', color: '#e76f51',
        start: { x: 841, y: 545, h: 285 }, v0: 46,
        segs: [
          { mode: 'heading', h: 285, dur: 2.5, turn: 0, note: 'Barging' },
          { mode: 'heading', h: 240, dur: 2.2, turn: 1.0, note: 'Yol veriyor · K11' },
          { mode: 'closehauled', tack: 'starboard', dur: 13.3, turn: 1.2 }
        ] },
      { id: 'C', name: '4 boy aşağıda, güvenli', role: 'dogru', color: '#1f77b4',
        start: { x: 455, y: 462, h: 340 }, v0: 2,
        segs: [
          { mode: 'hold', h: 340, dur: 5, speed: 0.05, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 13, turn: 0.8 }
        ] }
    ],
    steps: [
      { t: 0, title: 'Hakem botu ucu avantajlı', text: 'Rüzgar hakem botu tarafından geliyor. Herkes hakem botunun hemen yanından çıkmak ister. Ama orada sadece tek kişilik yer var.' },
      { t: 1, title: 'Layline ve güvenli yer', text: 'Mavi çizgi hakem botuna giden layline. Yeşil L tam bu çizgide, aşağıdan geliyor. O yer onun. Mavi C ise 4 boy aşağıda. Kalabalıktan uzak, temiz havada.' },
      { t: 2.2, title: 'W araya sokulmaya çalışıyor', text: 'Turuncu W yukarıdan, hızla geliyor. L ile hakem botu arasına girmek istiyor. Buna barging denir ve kurallara aykırıdır. İki tekne aynı kontrada ve yan yanaysa, yukarıdaki tekne aşağıdakine yol verir. Bu Kural 11.' },
      { t: 2.6, title: 'L kapıyı kapatıyor', text: 'L orsa ediyor ve yer yok diye bağırıyor. W\'nin girecek yeri kalmadı. Hakem botuna çarparsa yine ceza alır.' },
      { t: 3.9, title: 'W arkadan geçmek zorunda', text: 'W\'nin tek çaresi var: sert bordalayıp L\'nin arkasından geçmek. Çok daha aşağıdan start alacak. 2 3 boy kaybediyor, üstelik pis havada kalıyor.' },
      { t: 7.5, title: 'START', text: 'L hakem botunun hemen yanında, tam hızda, avantajlı uçta. C 4 boy aşağıda ama temiz havada. W geride.' },
      { t: 10, title: 'Kim önde?', text: 'L önde. C biraz kaybetti ama kavga etmeden temiz çıktı. W hem geride hem de L\'nin rüzgar gölgesinde. En kötüsü W.' },
      { t: 14, title: 'Sonuç', text: 'Hakem botu ucunu istiyorsan layline\'a erken gel ve rüzgaraltını koru. Ya da 3 5 boy aşağıda güvenli bir yer seç. Asla yukarıdan araya sokulma. Kapı kapanır, çarparsan ceza senin olur.' }
    ],
    addBoat: { pin: { x: 300, y: 600 }, middle: { x: 420, y: 660 }, committee: { x: 760, y: 640 } },
    startSlots: { pin: [0.12], middle: [0.3], committee: [0.62] },
    crowdLife: { gap: 38 },
    crowd: [{ slot: 0.08 }, { slot: 0.2 }, { slot: 0.32 }, { slot: 0.58 }, { slot: 0.14, row: 1 }, { slot: 0.5, row: 1 }]
  });

  // ---------- A12: Start bayrakları ve fodepar ----------
  S.push({
    id: 'a12-flags',
    category: 'Taktik', topic: 'Start',
    title: 'A12 · Start bayrakları: P, I, U, siyah — son 1 dakikada burun',
    summary: 'Hazırlık bayrağı hangi fodepar (OCS) kuralının geçerli olduğunu söyler. P: geri dön, yeniden geç. I: uçlardan dolaş. U: son 1 dakikada hattın üstündeysen yarıştan çıkarsın (genel geri çağırma olursa affedilir). Siyah: çıkarsın ve tekrar startta da yarışamazsın.',
    duration: 36,
    baseSpeed: 40,
    clockScale: 4,            // 1 animasyon saniyesi = 4 gerçek saniye (son 2 dakika); ivme Optimist tablosundan
    prepFlag: 'U',
    flagDownAt: 15,           // 1 dk kala bayrak iner (t=15 → 60 s)
    wind: 0,
    line: { pin: { x: 250, y: 440 }, boat: { x: 750, y: 440 } },
    startAt: 30,
    committeeLabel: 'right',
    boats: [
      { id: 'F', name: 'Burnu çizgide', role: 'hata', color: '#e76f51',
        start: { x: 520, y: 520, h: 340 }, v0: 2,
        segs: [
          { mode: 'hold', h: 340, dur: 12, speed: 0.05, turn: 0 },
          { mode: 'hold', h: 350, dur: 6, speed: 0.12, turn: 0.8 },                       // hattın dibine fazla sokuldu
          { mode: 'hold', h: 350, dur: 2, speed: 0.1, turn: 0, note: 'Burun çizgide!' },
          { mode: 'heading', h: 170, dur: 3, turn: 1.2, speed: 0.6, note: 'Geri çekiliyor' }, // geri in
          { mode: 'hold', h: 340, dur: 4.5, speed: 0.05, turn: 1.0 },
          { mode: 'closehauled', tack: 'starboard', dur: 8.5, turn: 0.8 }
        ] },
      { id: 'T', name: 'Hattın dibinde, altında', role: 'dogru', color: '#2a9d8f',
        start: { x: 440, y: 524, h: 340 }, v0: 2,
        segs: [
          { mode: 'hold', h: 340, dur: 27.5, speed: 0.05, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 8.5, turn: 0.8 }
        ] }
    ],
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [{ slot: 0.1, drift: 0.3 }, { slot: 0.68, back: 6 }, { slot: 0.8, back: -4 }, { slot: 0.1, row: 1, drift: 0.3 }, { slot: 0.68, row: 1 },
      // hakem botunun dibi baştan boş: iki tekne dışarıda bekler, açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 828, y: 462, h: 0, until: 19, speed: 0.45 } },
      { slot: 0.86, row: 1, wait: { x: 862, y: 505, h: 355, until: 20, speed: 0.5 } }],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: U bayrağı', text: 'Hakem botunda hazırlık bayrağı var: U bayrağı. Bu bayrak, erken start yaparsan ne olacağını söyler. Sağ üstteki saat gerçek zamanı gösteriyor. Animasyon dört kat hızlı.' },
      { t: 6, title: 'Bayrak türleri', text: 'P bayrağı mavi beyazdır. Erken çıkarsan geri dön, hattı yeniden geç, ceza yok. I bayrağı sarı siyahtır. Son dakikada hattın önündeysen uçlardan dolaşarak dönersin. U bayrağı kırmızı beyaz karedir. Son dakikada hattın önündeysen yarıştan çıkarsın. Siyah bayrak da aynısı, ama start tekrarlansa bile o yarışa giremezsin.' },
      { t: 12, title: 'Turuncu hatta fazla yaklaştı', text: 'Turuncu hattın tam dibinde bekliyor. Rüzgar ve dalga tekneyi öne iter. Optimist yarım boyu iki üç saniyede gider.' },
      { t: 15, title: '1 dakika: bayrak indi', text: 'Hazırlık bayrağı indi. U bayrağı kuralı şimdi başladı. Bu andan start\'a kadar burnun çizgiyi geçerse yarıştan çıkarsın. Yani dikkat sadece son saniyede değil, son dakikanın tamamında.' },
      { t: 18, title: 'Burun çizgide', text: 'Turuncunun burnu çizginin önünde. U bayrağında bu tekne yarıştan çıktı. Hakem not aldı. Geri çekilmesi kurtarmaz. Sadece start tekrarlanırsa kurtulur. P bayrağı olsaydı geri dönmesi yeterdi.' },
      { t: 20, title: 'Geri çekiliyor', text: 'Turuncu yelkeni ters basıp geri gidiyor. Geri giden tekne herkese yol verir. P bayrağında bu doğru bir hamle. U ve siyah bayrakta artık çok geç.' },
      { t: 24, title: 'Yeşil: dipte ama geride', text: 'Yeşil de hattın dibinde bekliyor. Ama burnu çizginin yarım boy gerisinde. Hattı görmek için pin ile hakem botunu bir hizaya getir. Emin değilsen yarım boy geride dur. U ve siyah bayrakta hep geride kalma tarafında hata yap.' },
      { t: 30, title: 'START', text: 'Filo çıkıyor. Turuncu da çıkıyor ama yarıştan çıkarılmış sayılacak. Özet: bayrağa bak, kuralı bil. U ve siyah bayrakta son dakikada burnunu çizgiden uzak tut.' }
    ],
    addBoat: { pin: { x: 290, y: 560 }, middle: { x: 500, y: 560 }, committee: { x: 720, y: 560 } },
    startSlots: { pin: [0.4], middle: [0.5], committee: [0.9] },
    expectEarly: ['F']
  });

  // ---------- A9: start sonrası ilk 2 dakika — pis havadan tramolayla çık ----------
  S.push({
    id: 'a9-clear-air-tack',
    category: 'Taktik', topic: 'Start sonrası',
    title: 'A9 · Start sonrası pis havadasın: omzuna bak, tramolayla temiz havaya çık',
    summary: 'Start sonrası ikinci sırada, öndeki teknenin hemen rüzgaraltında-arkasında kaldıysan onun pis rüzgarındasın: hızın %20-30 düşer ve her saniye geri kalırsın. Yeşil X ilk saniyelerde bunu fark eder, omzunun üstünden bakar, sağ tarafı boşken tramola atar, sancak teknelerin kıçından geçer (Kural 10) ve sağdaki temiz havada filonun önüne geçer. Turuncu Y aynı durumda inatla devam eder ve gölgede kalır.',
    duration: 36,
    baseSpeed: 16,
    wind: 0,
    line: { pin: { x: 300, y: 480 }, boat: { x: 900, y: 480 } },
    startAt: 6,
    goBefore: 4,
    committeeLabel: 'upright',
    shadowLen: 150,   // kalabalık filonun bozduğu hava ~3 boy uzanır (varsayılan koni 1,5 boy)
    rungs: { boat: 'X', from: 14 },
    boats: [
      { id: 'X', name: 'Tramola: temiz hava', role: 'dogru', color: '#2a9d8f',
        start: { x: 790, y: 545, h: 340 }, v0: 0,
        segs: [
          { mode: 'hold', h: 340, dur: 2, speed: 0.015, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 6.5, turn: 1.0, note: 'İkinci sırada: pis rüzgar' },
          { mode: 'closehauled', tack: 'port', dur: 7.5, turn: 1.2, note: 'Sağ boş: tramola, kıçlardan geç' },
          { mode: 'closehauled', tack: 'starboard', dur: 20, turn: 1.2, note: 'Temiz havada' }
        ] },
      { id: 'Y', name: 'Pis havada devam', role: 'hata', color: '#e76f51',
        start: { x: 574, y: 545, h: 340 }, v0: 0,
        segs: [
          { mode: 'hold', h: 340, dur: 2, speed: 0.015, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 34, turn: 1.0, note: 'HATA: gölgede devam' }
        ] }
    ],
    crowdLife: { gap: 38 },
    crowd: [
      { slot: 0.07, back: 6, drift: 0 }, { slot: 0.16 }, { slot: 0.25 }, { slot: 0.34, back: 5 }, { slot: 0.43, drift: 0 },
      { slot: 0.52 }, { slot: 0.61 }, { slot: 0.70, back: 4 }, { slot: 0.79, drift: 0 }, { slot: 0.88 },
      { slot: 0.16, row: 1 }, { slot: 0.61, row: 1 }
    ],
    steps: [
      { t: 0, title: 'Start\'a 6 saniye', text: 'Filo yelkenini doldurup hızlanıyor. Yeşil X ve turuncu Y ikinci sırada. İkisi de öndeki teknenin hemen arkasında ve altında.' },
      { t: 6, title: 'START: ikinci sıradasın', text: 'Herkes sancak kontrada orsa çıkıyor. Öndeki yelkenler arkaya bozuk hava bırakır. Buna pis hava denir. Koyu gölgeler bunu gösteriyor. X ve Y bu gölgenin içinde, yavaşlıyorlar.' },
      { t: 7, title: 'X omzunun üstünden bakıyor', text: 'X hemen karar verir: sağında, yukarıda tekne var mı? Sağ taraf boş. Tramola atabilir. İskele kontraya geçince sancak teknelere yol verecek, arkalarından geçecek. Bu Kural 10.' },
      { t: 9, title: 'Tramola: arkalardan geç', text: 'X tramola attı. Sağdaki teknelerin arkasından geçiyor. Kimseyi rahatsız etmiyor. Gölgeden çıkınca hemen hızlanıyor.' },
      { t: 14, title: 'Kim önde?', text: 'Kesikli çizgi merdiven basamağı. X temiz havada, tam hızda. Y hâlâ gölgede. X tramolada kaybettiğini birkaç saniyede geri aldı. Fark her saniye büyüyor.' },
      { t: 17, title: 'X sancağa dönüyor', text: 'X filonun yukarısında, kendi temiz yolunda tekrar sancağa döndü. Artık kimse onun havasını kesmiyor.' },
      { t: 30, title: 'Özet', text: 'Start\'tan sonra ilk iş hızına bakmak. Yanındakilerden yavaşsan pis havadasın. Önce omzuna bak. Yer varsa tramola at, arkalardan geç. Yarım dakikada X, Y\'nin bir boy önüne geçti. Gölgede kalmak çok kaybettirir.' }
    ],
    addBoat: { pin: { x: 380, y: 600 }, middle: { x: 640, y: 600 }, committee: { x: 860, y: 600 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.8] }
  });

  // ---------- A9b: tramola yolu kapalıysa bordala, hızlan; sıkıştırma ----------
  S.push({
    id: 'a9b-foot-out',
    category: 'Taktik', topic: 'Start sonrası',
    title: 'A9b · Tramola yolun kapalı: bordala, hızlan, rüzgaraltındaki boşluğa çık',
    summary: 'Pis havadasın ama rüzgarüstünde, hemen yanında bir tekne var: tramola atarsan ona çarparsın. Çıkış rüzgaraltında: burnu 20-25° düşür, yelkeni biraz kaçır, hızlan ve öndeki iki tekne arasındaki boşluğa kay; boşlukta orsaya dön. Yeşil S bunu yapar. Turuncu H gölgeden orsalayarak (sıkıştırarak, pinch) kurtulmaya çalışır: tekne yavaşlar, gölgede daha uzun kalır ve iyice geride kalır.',
    duration: 36,
    baseSpeed: 16,
    wind: 0,
    line: { pin: { x: 300, y: 480 }, boat: { x: 900, y: 480 } },
    startAt: 6,
    goBefore: 4,
    committeeLabel: 'upright',
    rungs: { boat: 'S', from: 16 },
    gaps: { from: 0, to: 6.5, items: [
      { a: 3, b: 4, label: 'Boşluk', color: '#34d399' },
      { a: 5, b: 6, label: 'Boşluk', color: '#34d399' }
    ] },
    boats: [
      { id: 'S', name: 'Bordala, boşluğa kay', role: 'dogru', color: '#2a9d8f',
        start: { x: 609, y: 547, h: 340 }, v0: 0,
        segs: [
          { mode: 'hold', h: 340, dur: 2, speed: 0.015, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 5, turn: 1.0, note: 'Pis hava; sağında tekne: tramola yok' },
          { mode: 'heading', h: 290, dur: 5, turn: 1.2, speed: 1.2, note: 'Bordala, hızlan: boşluğa' },
          { mode: 'closehauled', tack: 'starboard', dur: 24, turn: 1.4, note: 'Boşlukta, temiz havada' }
        ] },
      { id: 'H', name: 'Sıkıştırıyor (pinch)', role: 'hata', color: '#e76f51',
        start: { x: 790, y: 545, h: 340 }, v0: 0,
        segs: [
          { mode: 'hold', h: 340, dur: 2, speed: 0.015, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 5, turn: 1.0 },
          { mode: 'closehauled', tack: 'starboard', angle: 36, dur: 14, turn: 1.0, note: 'HATA: orsalıyor, hız yok' },
          { mode: 'closehauled', tack: 'starboard', dur: 15, turn: 1.0, note: 'Geride kaldı' }
        ] },
      // rüzgarüstündeki komşular (gri filo): tramola yolunu kapatırlar
      { id: '1', name: 'Filo', crowd: true, color: '#b8c7d6', start: { x: 658, y: 553, h: 340 }, v0: 0,
        segs: [{ mode: 'hold', h: 340, dur: 2, speed: 0.015, turn: 0 }, { mode: 'closehauled', tack: 'starboard', dur: 34, turn: 1.0 }] },
      { id: '2', name: 'Filo', crowd: true, color: '#b8c7d6', start: { x: 882, y: 563, h: 340 }, v0: 0,
        segs: [{ mode: 'hold', h: 340, dur: 2, speed: 0.015, turn: 0 }, { mode: 'closehauled', tack: 'starboard', dur: 34, turn: 1.0 }] }
    ],
    crowdLife: { gap: 38 },
    crowd: [
      { slot: 0.07, back: 6, drift: 0 }, { slot: 0.16 }, { slot: 0.25, back: 4 }, { slot: 0.34, drift: 0 },
      { slot: 0.52, drift: 0 }, { slot: 0.61, drift: 0 }, { slot: 0.79, drift: 0 }, { slot: 0.88, drift: 0 },
      { slot: 0.16, row: 1 }
    ],
    steps: [
      { t: 0, title: 'Start\'a 6 saniye', text: 'Yeşil S ve turuncu H ikinci sırada, öndeki teknenin hemen arkasında. İkisinin de sağında, yukarısında bir tekne var. Ön sırada iki boşluk var. Yeşil işaretler onları gösteriyor.' },
      { t: 6, title: 'START: gölgedesin', text: 'Filo sancak kontrada çıkıyor. S ve H öndeki teknenin pis havasında. Bu yüzden yavaşlar. Pis hava öndeki teknenin bir iki boy arkasına kadar uzanır.' },
      { t: 6.8, title: 'Tramola yolu kapalı', text: 'Tramola atsalar sağdaki tekneye çarparlar. Tramola atan tekne herkese yol verir. Bu Kural 13. O zaman çıkış yolu aşağıda, rüzgaraltında.' },
      { t: 8, title: 'S bordalıyor', text: 'S burnunu biraz düşürüyor. Yelkeni biraz kaçırıp hızlanıyor ve aşağıdaki boşluğa kayıyor. Soldaki tekneden uzak duruyor, çünkü yukarıdaki tekne o. Bu Kural 11.' },
      { t: 10, title: 'H sıkıştırıyor', text: 'H gölgeden yukarı doğru, orsalayarak çıkmaya çalışıyor. Yelken boşalıyor, tekne yavaşlıyor. Öndeki tekne uzaklaşmadığı için gölgeden de çıkamıyor.' },
      { t: 13, title: 'S boşlukta orsaya döndü', text: 'S boşluğa yerleşti. Önü ve yukarısı açık. Temiz havada, tam hızda. Aşağı inerken kaybettiğini birkaç saniyede geri alıyor.' },
      { t: 18, title: 'Kim önde?', text: 'Kesikli çizgi merdiven basamağı. S temiz havada, filoyla aynı hızda gidiyor. H hem sıkıştırdığı hem de gölgede kaldığı için geride.' },
      { t: 30, title: 'Özet', text: 'Pis havadaysan ve tramola atamıyorsan aşağıya bak. Boşluk varsa bordala, hızlan, boşlukta orsaya dön. Gölgeden orsalayarak çıkmaya çalışma. Sıkıştıran tekne yavaşlar ve gölgede kalır. Yarım dakikada S, H\'nin bir boy önüne geçti.' }
    ],
    addBoat: { pin: { x: 380, y: 600 }, middle: { x: 560, y: 620 }, committee: { x: 860, y: 620 } },
    startSlots: { pin: [0.1], middle: [0.4], committee: [0.67] }
  });

  // ---------- İA1: Pin'in dışında bekleyip apaz gel, grubun altına tramola ----------
  S.push({
    id: 'ia1-port-approach-pin',
    category: 'İleri Taktik', topic: 'Start · Pin',
    title: 'İA1 · Pin\'in dışında bekle, apaz gel, grubun en altına tramola',
    summary: 'Pin avantajlıysa pin grubu erken oluşur. İleri taktik: pin\'in SOLUNDA, kavganın dışında bekle; son 45 sn\'de apaz ile hattın altından gel, rüzgara baş vermiş grubun en alttaki teknesinin rüzgaraltındaki boşluğa tramola at. Tek şart: tramola noktası pin layline\'ının ÜSTÜNDE olmalı; boşluk kapalıysa ya da pin\'i kurtarmıyorsan girmenin anlamı yok.',
    duration: 36.5,
    baseSpeed: 40, tau: 1.0,
    clockScale: 3,
    wind: 350,
    line: { pin: { x: 250, y: 440 }, boat: { x: 750, y: 440 } },
    startAt: 24,
    rungs: { boat: 'X', from: 25.5 },
    committeeLabel: 'upright',
    laylines: [{ x: 250, y: 440, tack: 'starboard', len: 330, from: 0, label: 'Pin layline\'ı — tramola bu çizginin ÜSTÜNDE' }],
    boats: [
      { id: 'X', name: 'Apaz gel, layline üstünde tramola', role: 'dogru', color: '#2a9d8f',
        start: { x: 172, y: 530, h: 15 }, v0: 2,
        segs: [
          { mode: 'hold', h: 15, dur: 9, speed: 0.05, turn: 0, note: 'Pin\'in solunda bekliyor' },
          { mode: 'heading', h: 92, dur: 5.2, turn: 1.0, note: 'Apaz: hattın altından grubun dibine' },
          { mode: 'hold', h: 325, dur: 7.4, speed: 0.03, turn: 1.3, note: 'Tramola → layline üstü, boşluk benim' },
          { mode: 'closehauled', tack: 'starboard', dur: 14.9, turn: 0.8 }
        ] },
      { id: 'Z', name: 'Layline altında tramola', role: 'hata', color: '#e76f51',
        start: { x: 118, y: 585, h: 15 }, v0: 2,
        segs: [
          { mode: 'hold', h: 15, dur: 9.6, speed: 0.05, turn: 0 },
          { mode: 'heading', h: 92, dur: 4.6, turn: 1.0, note: 'Apaz ile geliyor' },
          { mode: 'hold', h: 325, dur: 7.3, speed: 0.05, turn: 1.3, note: 'HATA: layline\'ın altında tramola' },
          { mode: 'closehauled', tack: 'starboard', dur: 1.8, turn: 0.8, note: 'HATA: pin\'i kurtarmıyor!' },
          { mode: 'heading', h: 120, dur: 2.2, turn: 1.5, note: 'Bordala → herkesin arkasından' },
          { mode: 'heading', h: 95, dur: 2.4, turn: 1.0, note: 'Bordala → herkesin arkasından' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.5, turn: 1.2 }
        ] },
      { id: 'Y', name: 'Geç geldi, boşluk kapandı', role: 'hata', color: '#c77dff',
        start: { x: 70, y: 600, h: 15 }, v0: 2,
        segs: [
          { mode: 'hold', h: 15, dur: 14.5, speed: 0.05, turn: 0 },
          { mode: 'heading', h: 93, dur: 5.0, turn: 1.0, note: 'Geç: 25 sn kala geliyor' },
          { mode: 'heading', h: 81, dur: 6.4, turn: 0.8, note: 'HATA: boşluk yok → herkesin altından' },
          { mode: 'closehauled', tack: 'starboard', dur: 12.1, turn: 1.2 }
        ] }
    ],
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.6, ang: 75 },
    crowd: [
      { slot: 0.27, drift: 0.5 }, { slot: 0.378, back: 6 }, { slot: 0.485, back: -4 }, { slot: 0.597, back: 8 }, { slot: 0.70, back: 2 },
      { slot: 0.23, row: 1, back: 4 }, { slot: 0.33, row: 1 }, { slot: 0.44, row: 1, back: 8 }, { slot: 0.565, row: 1 },
      // hakem botu ucu baştan boş: üç tekne botun sancağında / kıçında bekler, filo pin'e kaydıkça açılan boşluğa süzülür
      { slot: 0.865, wait: { x: 845, y: 442, h: 5, until: 15.4, speed: 0.45 } },
      { slot: 0.785, wait: { x: 818, y: 505, h: 350, until: 14.2, speed: 0.45 } },
      { slot: 0.74, row: 1, wait: { x: 885, y: 492, h: 0, until: 16.6, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 72 saniye: pin grubu', text: 'Pin ucu biraz avantajlı. Gri tekneler pin\'e yakın yerleri almış. Yan yana, iki sıra halinde, hattın dibinde bekliyorlar. Hakem botunun dibi ise boş. Üç tekne botun yanında, dışarıda bekliyor. Mavi kesikli çizgi pin\'in layline\'ı. Yeşil X kalabalığın dışında, pin\'in solunda bekliyor.' },
      { t: 4, title: 'Neden dışarıda bekliyor?', text: 'Kalabalığın içinde 70 saniye yer tutmak zordur. Yelken boşken tekne aşağı, pin\'e doğru kayar. Biri yukarıdan sokulur, boşluğun kapanır. Pin\'in solunda beklersen hattı, layline\'ı ve boşlukları yandan görürsün. Sonra hızlı ve kontrollü girersin.' },
      { t: 9, title: 'Son 45 saniye: apaz gel', text: 'X yelkenini doldurdu. Apaz gidiyor, hattın ve pin\'in hemen altından gruba doğru. İskele kontrada olduğu için herkese yol verir. Bu Kural 10. Teknelerin önünü kesmez, altlarından geçer.' },
      { t: 12.5, title: 'Karar anı', text: 'İki soru sor. Bir: en alttaki teknenin altında bir boy boşluk var mı? İki: tramola atacağın yer layline\'ın üstünde mi? İkisi de evetse gir. Biri hayırsa girme. Pin\'i kurtaramazsın.' },
      { t: 14.5, title: 'X tramola atıyor', text: 'X layline\'ın üstünde. En alttaki teknenin hemen altına tramola atıyor. Tramola atarken herkese yol verir. Bu Kural 13. Sancağa geçince hak onundur. Ama yukarıdaki tekneye kaçacak yer bırakmalı. Bu da Kural 15. O yüzden biraz aşağıya, yarım boy açığa tramola atıyor.' },
      { t: 16.5, title: 'Z\'nin hatası: layline\'ın altında', text: 'Turuncu Z aynı şeyi layline\'ın altında yaptı. Orsa gitse de pin\'e yetişemez, burnu pin\'in soluna düşer. Boşluk bulsan bile layline\'ın altındaysan girmenin anlamı yok.' },
      { t: 19.5, title: 'Y\'nin hatası: geç geldi', text: 'Mor Y çok geç geldi, 25 saniye kala. X boşluğu almış, grup sıkışmış. Y\'ye yer yok. Herkesin altından, pis havada, 3 4 boy geriden başlayacak. Hafif havada 50 saniye, sert havada 40 saniye kala gel.' },
      { t: 21.5, title: '2.5 saniye kala doldur', text: 'X yerini korudu. Layline\'ın üstünde ve boşluğu var. Bordalayıp hızlanıyor. Öbür uçta filo pin\'e kaydı, hakem botunun dibi açıldı. Dışarıda bekleyen üç tekne oraya girdi.' },
      { t: 24, title: 'START', text: 'X pin\'in hemen yanında, tam hızda, temiz havada. Z pin\'e yetişemiyor. Y hâlâ herkesin altında, sağa doğru gidiyor.' },
      { t: 25.5, title: 'Z dışarıdan çıkamaz', text: 'Pin\'in dışından geçmek start sayılmaz. Z ya tramola atıp geri dönecek ya da bordalayıp herkesin arkasından hattı geçecek. Z bordalıyor. Bu ona 8 10 saniye ve pis hava kaybettiriyor.' },
      { t: 32, title: 'Y ve Z çok geride', text: 'Y boşluk bulamadı, Z pin\'e yetişemedi. İkisi de en sonda, pis havada start alıyor. Geç gelmenin ve layline\'ın altında tramola atmanın bedeli bu.' },
      { t: 34.5, title: 'Özet', text: 'Dışarıda bekle. Apaz gel. Boşluğa ve layline\'a bak. En alttaki teknenin altına tramola at. Yerini koru. Erken gelirsen sürüklenirsin, geç gelirsen yer kalmaz. Layline\'ın altında tramola atarsan pin\'i kaçırırsın.' }
    ],
    addBoat: { pin: { x: 290, y: 560 }, middle: { x: 500, y: 560 }, committee: { x: 720, y: 560 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- İA2: Hat yayı (line sag): pin tarafından bak, ortada yukarıdan çık ----------
  S.push({
    id: 'ia2-line-sag',
    category: 'İleri Taktik', topic: 'Start · Orta',
    title: 'İA2 · Hat yayı: pin tarafından hattı gör, ortada herkesten yukarı dur',
    summary: 'Uzun hatlarda filo ortaya doğru hattan uzaklaşır: hat yayı (line sag). Kimse hattı göremez, herkes komşusuna göre durur. Pin tarafından hakem botuna bakan tekne yayı görür; vakti varsa hattın altından ortaya gelir, bir boşluğa komşularından YUKARI (hatta yakın) yerleşir ve sinyalde 1-2 boy önde çıkar. Yay yoksa: herhangi bir boşluğa, herkesle aynı hizada.',
    duration: 32,
    baseSpeed: 40, tau: 1.0,
    clockScale: 3,
    wind: 0,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 24,
    committeeLabel: 'upright',
    rungs: { boat: 'S', from: 24.5 },
    sightline: { from: 0, to: 6, label: 'Transit: pin\'den hakem botuna bak — hat burada' },
    sag: { from: 0, to: 21.5 },
    boats: [
      { id: 'S', name: 'Yayı gören, ortada yukarı', role: 'dogru', color: '#2a9d8f',
        start: { x: 88, y: 452, h: 90 }, v0: 2,
        segs: [
          { mode: 'hold', h: 90, dur: 4, speed: 0.04, turn: 0 },
          { mode: 'heading', h: 160, dur: 3.2, turn: 0.8, note: 'Hattın altına iniyor' },
          { mode: 'heading', h: 90, dur: 6.2, turn: 1.0, note: 'Apaz: hattın altından ortaya' },
          { mode: 'heading', h: 35, dur: 2.3, turn: 1.0, speed: 1, note: 'Boşluğa gir, komşulardan YUKARI' },
          { mode: 'hold', h: 340, dur: 6.8, speed: 0.04, turn: 1.0, note: 'Hattı biliyorum: 1 boy geride' },
          { mode: 'closehauled', tack: 'starboard', dur: 9.5, turn: 0.8 }
        ] }
    ],
    // yay: uçlar hatta yakın, orta 2.5-3 boy geride
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.2, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.10, back: 0 }, { slot: 0.15, back: 12 }, { slot: 0.20, back: 30 }, { slot: 0.30, back: 118 }, { slot: 0.40, back: 140 },
      { slot: 0.50, back: 145 }, { slot: 0.60, back: 135 }, { slot: 0.69, back: 95 }, { slot: 0.76, back: 50 },
      // hakem botu ucu baştan boş: üç tekne dışarıda bekler, filo kaydıkça açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 878, y: 460, h: 0, until: 13.2, speed: 0.45 } },
      { slot: 0.83, back: 8, wait: { x: 858, y: 505, h: 345, until: 12.2, speed: 0.45 } },
      { slot: 0.80, row: 1, wait: { x: 912, y: 498, h: 355, until: 14.4, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 72 saniye: hatta bak', text: 'Yeşil S pin\'in dışında, tam hattın uzantısında. Hakem botuna bakıyor. Pin ile hakem botu bir hizaya gelince hat tam görünür. S şunu görüyor: uçtaki tekneler hatta yakın, ortadakiler 2 3 boy geride. Buna hat yayı denir.' },
      { t: 2, title: 'Yay neden oluşur?', text: 'Uzun hatta ortadaki tekne hattı göremez. Herkes yanındakine göre durur. Her tekne biraz geride kalır ve orta geriye kayar. Yayı sadece hattı gören bilir. Yani uçtan bakan tekne.' },
      { t: 4, title: 'Vakit var: ortaya git', text: 'S önce hattın altına iniyor. Sonra yelkenini doldurup uçtaki teknelerin altından ortaya gidiyor. İskele kontrada, herkese yol verir. Filonun gölgesinde yavaşlar. Bunu zamanına ekle.' },
      { t: 12, title: 'Hangi boşluk, ne zaman?', text: 'Hedefin yayın en derin yerindeki bir boşluk. 45 50 saniye kala orada ol. Erken gelirsen sürüklenirsin. Geç gelirsen boşluk kapanır. Planını kalabalığın içinde değil, uzaktan yap.' },
      { t: 14, title: 'Boşluğa gir ama yukarıda dur', text: 'S boşluğa giriyor. Ama komşuları gibi 3 boy geride değil, hattın bir boy gerisinde duruyor. Komşulara göre önde görünür. Aslında doğru yerde. Bunun için hattı gerçekten bilmen gerekir.' },
      { t: 17.5, title: 'Yerini koru, hattı kontrol et', text: 'S rüzgara baş vermiş bekliyor. Altında boşluğu var. Son 30 saniyede hattı bir kez daha kontrol et. Pin ile hakem botu hizası nerede, senin burnun nerede?' },
      { t: 21.5, title: '2.5 saniye kala doldur', text: 'Komşular 3 boy geriden hızlanacak, S ise bir boydan. Start anında S hatta olacak, onlar değil.' },
      { t: 24, title: 'START: 2 boy önde', text: 'S tam hatta, tam hızda. Ortadaki tekneler 2 3 saniye sonra geçecek. Merdiven çizgisi farkı gösteriyor. Üstelik S\'nin yukarısında kimse yok. Havası temiz.' },
      { t: 28, title: 'Yay yoksa?', text: 'Hatta baktın ve yay yoksa, herkes hattın dibindedir. O zaman herhangi bir boşluğa, herkesle aynı hizada dur. Zamanlamaya ve altındaki boşluğa odaklan. Her durumda kalabalıktan uzak dur, uzaktan bak, planla, son dakikada gir. Bunu İA2b dersinde görebilirsin.' }
    ],
    addBoat: { pin: { x: 290, y: 560 }, middle: { x: 500, y: 560 }, committee: { x: 720, y: 560 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- İA2b: yay yok ----------
  S.push({
    id: 'ia2b-no-sag',
    category: 'İleri Taktik', topic: 'Start · Orta',
    title: 'İA2b · Yay yok: hattı gör, boşluğa herkesle aynı hizada gir',
    summary: 'S3\'ün eşi: bu kez filo hattın dibinde, yay yok. Pin tarafından transitle bakan tekne bunu görür; ortaya gelir, bir boşluğa komşularıyla AYNI hizada yerleşir. Avantaj yukarı durmaktan değil, zamanlamadan ve rüzgaraltındaki boşluktan gelir. Yay yokken yukarı durmaya çalışan, erken çıkar (OCS).',
    duration: 32,
    baseSpeed: 40, tau: 1.0,
    clockScale: 3,
    wind: 0,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 24,
    committeeLabel: 'upright',
    rungs: { boat: 'S', from: 24.5 },
    sightline: { from: 0, to: 6, label: 'Transit: pin\'den hakem botuna bak — hat burada' },
    sag: { from: 0, to: 21.5, label: 'Yay yok: filo hattın dibinde (en fazla {d} boy)' },
    boats: [
      { id: 'S', name: 'Hattı gören, boşlukta aynı hizada', role: 'dogru', color: '#2a9d8f',
        start: { x: 88, y: 452, h: 90 }, v0: 2,
        segs: [
          { mode: 'hold', h: 90, dur: 4, speed: 0.04, turn: 0 },
          { mode: 'heading', h: 160, dur: 3.2, turn: 0.8, note: 'Hattın altına iniyor' },
          { mode: 'heading', h: 90, dur: 7.5, turn: 1.0, note: 'Apaz: hattın altından 4 numaraya' },
          { mode: 'heading', h: 35, dur: 1.6, turn: 1.0, speed: 1, note: '4\'ün rüzgaraltına sokul' },
          { mode: 'hold', h: 340, dur: 5.2, speed: 0.04, turn: 1.0, note: '4\'ün rüzgaraltında, aynı hiza' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.5, turn: 0.8 }
        ] }
    ],
    // yay yok: herkes hattın dibinde; S için 0.28-0.50 arasında boşluk. S, 4'ün (0.50) hemen rüzgaraltına
    // sokulur (merkezler ~44 px, aynı hiza) ve 4 ile paralel çıkar; 3 ile arasında rüzgaraltı boşluğu kalır.
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.2, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.12, back: 0 }, { slot: 0.20, back: 5 }, { slot: 0.28, back: 0 }, { slot: 0.535, back: 5 },
      { slot: 0.605, back: 0 }, { slot: 0.675, back: 5 }, { slot: 0.745, back: 0 },
      { slot: 0.57, row: 1 }, { slot: 0.71, row: 1, back: 6 },
      // hakem botu ucu baştan boş: üç tekne dışarıda bekler, filo kaydıkça açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 878, y: 460, h: 0, until: 13.2, speed: 0.45 } },
      { slot: 0.83, back: 8, wait: { x: 858, y: 505, h: 345, until: 12.2, speed: 0.45 } },
      { slot: 0.80, row: 1, wait: { x: 912, y: 498, h: 355, until: 14.4, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 72 saniye: yine hatta bak', text: 'S yine pin\'in dışında, hattın uzantısında. Pin ile hakem botunu bir hizaya getirip hatta bakıyor. Bu kez durum farklı. Filo hattın dibinde dizilmiş. Yay yok.' },
      { t: 4, title: 'Yay yoksa plan değişir', text: 'Şimdi herkesten önde durmanın faydası yok. Önde duran erken çıkar. Avantaj iki şeyden gelir: doğru zamanda doğru boşluk ve altında boş su. S yine hattın altından, apaz ile ortaya gidiyor.' },
      { t: 8, title: 'Rüzgar gölgesi', text: 'Filonun altından geçerken her teknenin arkasında pis hava var. S bunların içinden geçerken yavaşlar. Etiketteki sayı ne kadar yavaşladığını gösterir. Bu yüzden yola erken çık.' },
      { t: 13.5, title: 'Boşluğa gir, herkesle aynı hizada', text: 'S, 3 ile 4 arasındaki boşluğa giriyor. Ama ortasına değil, 4\'ün hemen altına, ona yakın. Böylece 4 yukarıda kalıyor ve S\'ye yol vermek zorunda. Bu Kural 11. S\'nin altında da 3\'e kadar boş su oluyor. Start\'ta oraya doğru hızlanacak.' },
      { t: 21.5, title: '2.5 saniye kala doldur', text: 'Herkes aynı yerden hızlanıyor. Fark zamanlamada. Geç kalan ya da boşluğu kapanan geride kalır. S altındaki boşluk sayesinde rahat hızlanıyor.' },
      { t: 24, title: 'START: aynı hizada, temiz', text: 'S komşularıyla aynı anda hatta. İA2\'deki gibi önde değil ama temiz havada ve tam hızda. Yay yoksa amaç öne geçmek değil, kötü start yapmamaktır.' }
    ],
    addBoat: { pin: { x: 290, y: 560 }, middle: { x: 500, y: 560 }, committee: { x: 720, y: 560 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- İA2c: yay yok, hangi boşluk? ----------
  S.push({
    id: 'ia2c-pick-gap',
    category: 'İleri Taktik', topic: 'Start · Orta',
    title: 'İA2c · Yay yok: dar mı, geniş mi? 2 dk önceden boşluk seç',
    summary: 'S4\'ün devamı: filo yine hattın dibinde ama sırada üç boşluk var: pin yanında DAR bir boşluk, ortada ve hakem botu tarafında iki GENİŞ boşluk. Rüzgar 5° sağda, hakem botu ucu biraz avantajlı. S hatta 2 dakika kala bakar; süresi olduğu için avantajlı uzaktaki geniş boşluğa gider ve rüzgarüstü komşusunun hemen rüzgaraltına sokulur. D 1 dakika kala bakar, süresi yetmez, dezavantajlı uçtaki dar boşluğa sıkışır.',
    duration: 36,
    baseSpeed: 40, tau: 1.0,
    clockScale: 4,
    wind: 5,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 30,
    committeeLabel: 'upright',
    rungs: { boat: 'S', from: 30.5 },
    sightline: { from: 0, to: 5, label: 'Transit: 2 dk kala hatta bak' },
    gaps: { from: 2, to: 27.5, items: [
      { a: 1, b: 2, label: 'Dar', color: '#f87171' },
      { a: 3, b: 4, label: 'Geniş · orta', color: '#fbbf24' },
      { a: 5, b: 6, label: 'Geniş · avantajlı', color: '#34d399' }
    ] },
    boats: [
      { id: 'S', name: '2 dk önce bakan, avantajlıya', role: 'dogru', color: '#2a9d8f',
        start: { x: 88, y: 452, h: 90 }, v0: 2,
        segs: [
          { mode: 'hold', h: 90, dur: 4, speed: 0.04, turn: 0 },
          { mode: 'heading', h: 160, dur: 3.4, turn: 0.8, note: 'Hattın altına iniyor' },
          { mode: 'heading', h: 90, dur: 12.0, turn: 1.0, note: 'Apaz: filonun altından avantajlı boşluğa' },
          { mode: 'heading', h: 40, dur: 1.6, turn: 1.0, speed: 1, note: '7\'nin rüzgaraltına sokul' },
          { mode: 'hold', h: 345, dur: 6.2, speed: 0.04, turn: 1.0, note: '7\'nin rüzgaraltında, aynı hiza' },
          { mode: 'closehauled', tack: 'starboard', dur: 10, turn: 0.8 }
        ] },
      { id: 'D', name: '1 dk önce bakan, dar boşlukta', role: 'hata', color: '#e76f51',
        start: { x: 78, y: 548, h: 90 }, v0: 2,
        segs: [
          { mode: 'hold', h: 90, dur: 15, speed: 0.04, turn: 0, note: 'Hâlâ hatta bakmadı' },
          { mode: 'heading', h: 110, dur: 2.5, turn: 0.8, note: '1 dk kala: vakit az, en yakın boşluk' },
          { mode: 'heading', h: 80, dur: 3.5, turn: 1.0 },
          { mode: 'heading', h: 20, dur: 1.0, turn: 1.0, speed: 1, note: 'Dar boşluğa sıkıştı' },
          { mode: 'hold', h: 345, dur: 5.6, speed: 0.04, turn: 1.0 },
          { mode: 'closehauled', tack: 'starboard', dur: 9, turn: 0.8, note: 'Dar boşluk: hata payı yok' }
        ] }
    ],
    // 7 tekne: 0.12-0.26 DAR (D buraya), 0.34-0.55 GENİŞ orta, 0.64-0.87 GENİŞ avantajlı (S 7'nin rüzgaraltına)
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.06, back: 0, drift: 0.2 }, { slot: 0.13, back: 4, drift: 0.5 }, { slot: 0.26, back: 0 }, { slot: 0.34, back: 5 },
      { slot: 0.55, back: 0 }, { slot: 0.64, back: 4 }, { slot: 0.87, back: 0, drift: 0.3 },
      // hakem botunun dibi baştan boş: iki tekne dışarıda bekler, son 15 sn'de süzülür (biri dipte, biri ikinci sırada)
      { slot: 0.92, wait: { x: 880, y: 462, h: 5, until: 18, speed: 0.45 } },
      { slot: 0.86, row: 1, wait: { x: 905, y: 505, h: 0, until: 19, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: hatta bak', text: 'S pin\'in dışında, hattın uzantısında. Pin ile hakem botunu bir hizaya getirip hatta bakıyor. İki dakika kala bakmak sana daha çok seçenek verir. Uzaktaki bir boşluğa gitmeye hâlâ vaktin vardır.' },
      { t: 3, title: 'Üç boşluk, iki soru', text: 'Yay yok, filo hattın dibinde. Üç boşluk var. Pin yanındaki dar, tek tekne zor sığar. Ortadaki ve hakem botu tarafındaki geniş. Rüzgar biraz sağa dönmüş, hakem botu ucu biraz avantajlı. Kendine iki soru sor. Hangisine zamanında yetişirim? Hangisi daha avantajlı?' },
      { t: 6, title: 'Vakit var: avantajlıya git', text: 'S\'nin bir dakikadan fazla vakti var. Filonun altından, apaz ile hakem botu tarafındaki geniş boşluğa gidiyor. Pis havada yavaşlayacağını bildiği için erken yola çıkıyor. Dar boşluk en yakını ama riskli. Kolayca kapanır.' },
      { t: 15, title: 'D bir dakika kala bakıyor', text: 'D hatta ancak şimdi bakıyor. Avantajlı boşluğa gidecek vakti yok. En yakın boşluk kalıyor: pin yanındaki dar boşluk. D oraya sıkışıyor. Komşularıyla arasında neredeyse hiç yer yok.' },
      { t: 21, title: 'Geniş boşlukta doğru yer', text: 'S boşluğun ortasına değil, yukarıdaki komşusu 7\'nin hemen altına giriyor, aynı hizada. 7 yukarıda olduğu için S\'ye yol verir. Bu Kural 11. S\'nin altında 6\'ya kadar boş su var. Start\'ta oraya doğru hızlanacak.' },
      { t: 30, title: 'START: avantajlı uçta, temiz', text: 'S avantajlı tarafta, temiz havada ve tam hızda çıkıyor. D dar boşlukta. Komşuları ona yer açmak zorunda kalıyor. Her an çarpışma riski var. Üstelik D kötü uçta. Kural şu: hatta erken bak. Vaktin varsa avantajlı geniş boşluğa git. Yoksa yakındaki geniş boşluğa git. Dar boşluk en son çaren olsun.' }
    ],
    addBoat: { pin: { x: 290, y: 580 }, middle: { x: 500, y: 580 }, committee: { x: 720, y: 580 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- İA4: rüzgarüstü teknenin altına yanaş ----------
  S.push({
    id: 'ia4-leeward-of-windward',
    category: 'İleri Taktik', topic: 'Start · Yer tutma',
    title: 'İA4 · Sıkıştıysan çık: boş yerde rüzgarüstü teknenin altına yanaş',
    summary: 'S pin tarafındaki kalabalıkta ikinci sırada sıkışmış: önü kapalı, havası kirli. Geri çekilip filonun altından daha boş bir yere gider ve bir teknenin hemen RÜZGARALTINA, ona yakın yanaşır; rüzgaraltında açık su kalır, sinyalde oraya doldurup temiz çıkar. Aynı animasyonda hata: H de kalabalıktan çıkar ama bir teknenin RÜZGARÜSTÜNE, ona çok yakın yanaşır; startta rüzgaraltındaki L orsalar, daha hızlıdır ve H\'yi geride bırakır.',
    duration: 36,
    baseSpeed: 40, tau: 1.0,
    clockScale: 3,
    wind: 0,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 27,
    committeeLabel: 'upright',
    rungs: { boat: 'S', from: 27.5 },
    boats: [
      { id: 'S', name: 'Rüzgarüstündekinin altına', role: 'dogru', color: '#2a9d8f',
        start: { x: 377, y: 560, h: 340 }, v0: 0,
        segs: [
          { mode: 'hold', h: 340, dur: 3, speed: 0.04, turn: 0, note: 'Sıkıştı: önü kapalı, hava kirli' },
          { mode: 'heading', h: 210, dur: 1.5, turn: 0.9, note: 'Geri çekil, kalabalıktan çık' },
          { mode: 'heading', h: 88, dur: 3.75, turn: 1.0, note: 'Filonun altından boş yere' },
          { mode: 'heading', h: 40, dur: 2.4, turn: 1.0, speed: 1, note: 'W\'nin rüzgaraltına yanaş' },
          { mode: 'hold', h: 340, dur: 13.85, speed: 0.04, turn: 1.0, note: 'W\'ye yakın, altı boş' },
          { mode: 'heading', h: 290, dur: 1.4, turn: 0.8, note: 'Boşluğa doldur, hızlan' },
          { mode: 'closehauled', tack: 'starboard', dur: 10, turn: 0.8 }
        ] },
      { id: 'L', name: 'Rüzgaraltı · hızlı çıkan', role: 'hak', color: '#1f77b4',
        start: { x: 700, y: 505, h: 340 }, v0: 0,
        segs: [
          { mode: 'hold', h: 340, dur: 24.5, speed: 0.04, turn: 0 },
          { mode: 'heading', h: 290, dur: 1.4, turn: 0.8, note: 'Altı boş: doldur, hızlan' },
          { mode: 'closehauled', tack: 'starboard', dur: 1.6, turn: 0.8 },
          { mode: 'heading', h: 330, dur: 1.2, turn: 0.8, note: 'K11: orsalar, H yol verir' },
          { mode: 'closehauled', tack: 'starboard', dur: 10, turn: 0.8 }
        ] },
      { id: 'H', name: 'Rüzgaraltındakinin üstüne', role: 'hata', color: '#e76f51',
        start: { x: 431, y: 587, h: 340 }, v0: 0,
        segs: [
          { mode: 'hold', h: 340, dur: 2, speed: 0.04, turn: 0, note: 'Sıkıştı' },
          { mode: 'heading', h: 210, dur: 1.0, turn: 0.9, note: 'O da kalabalıktan çıkıyor' },
          { mode: 'heading', h: 90, dur: 5.5, turn: 1.0 },
          { mode: 'heading', h: 40, dur: 3.0, turn: 1.0, speed: 1, note: 'L\'nin rüzgarüstüne yanaştı' },
          { mode: 'hold', h: 345, dur: 13.0, speed: 0.04, turn: 1.0, note: 'L\'ye çok yakın, üstünde' },
          { mode: 'closehauled', tack: 'starboard', dur: 2.9, turn: 0.8, speed: 0.75, note: 'Altı dolu: düşüp hızlanamıyor' },
          { mode: 'heading', h: 355, dur: 1.6, speed: 0.6, turn: 1.0, note: 'L orsaladı: yol ver' },
          { mode: 'closehauled', tack: 'starboard', dur: 10, turn: 0.8, speed: 0.85, note: 'Geride, L\'nin ters rüzgarında' }
        ] }
    ],
    // pin tarafında kalabalık (0.06-0.27); 0.36 ile W (0.56) arası boş: S W'nin hemen rüzgaraltına (~44 px)
    // yanaşır. Sağda L (scripted, 0.75) ve onun hemen rüzgarüstüne yanaşan H.
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.05, back: 0, drift: 0.2 }, { slot: 0.13, back: 5, drift: 0.5 }, { slot: 0.21, back: 0 }, { slot: 0.30, back: 5 }, { slot: 0.38, back: 0 }, { slot: 0.08, row: 1 },
      { slot: 0.615, back: 0, drift: 0, id: 'W', name: 'Rüzgarüstü komşu' },
      // hakem botunun dibi baştan boş: iki tekne dışarıda bekler, son 10 sn'de süzülür
      { slot: 0.925, wait: { x: 880, y: 462, h: 0, until: 15.5, speed: 0.45 } },
      { slot: 0.86, row: 1, wait: { x: 905, y: 508, h: 355, until: 16.5, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 81 saniye: S sıkışmış', text: 'Pin tarafı kalabalık. S ikinci sırada kalmış. Önünde tekneler var, havası pis, hızlanacak yeri yok. Burada beklerse start\'ta geride kalır.' },
      { t: 3, title: 'Geri çekil, kalabalıktan çık', text: 'S aşağı dönüp kalabalığın arkasından çıkıyor. Kavança atıp filonun altından, apaz ile hattın ortasına gidiyor. Sıkıştığın yerde inat etme. Vakit varken boş bir yere geç.' },
      { t: 12, title: 'Yukarıdakinin altına yanaş', text: 'Ortada boşluk var. S boşluğun ortasına değil, yukarıdaki komşusu W\'nin hemen altına yanaşıyor, yaklaşık bir boy yakına. W yukarıda olduğu için S\'ye yol verir. Bu Kural 11. S\'nin altında ise boş su kalıyor. Start\'ta orada hızlanacak.' },
      { t: 15.5, title: 'Hata: aşağıdakinin üstüne yanaşmak', text: 'H de kalabalıktan çıktı ama yanlış tarafa yanaştı. L\'nin hemen üstüne, çok yakınına. Şimdi hak L\'nin. L orsa ederse H yol vermek zorunda. H\'nin altında boş su yok.' },
      { t: 24.5, title: '2.5 saniye kala doldur', text: 'S ve L altlarındaki boşluğa doğru biraz düşüp yelkenlerini dolduruyor. H\'nin düşecek yeri yok. Hemen altında L var.' },
      { t: 27, title: 'START: altı boş olan kazanır', text: 'S temiz havada, tam hızda çıkıyor. Sağda L biraz orsa ediyor. H yol vermek için yavaşlıyor, L\'nin pis havasında kalıyor ve geride düşüyor. Kural şu: hep yukarıdaki teknenin altına, ona yakın yanaş. Altındaki boşluk senindir.' }
    ],
    addBoat: { pin: { x: 290, y: 600 }, middle: { x: 500, y: 600 }, committee: { x: 720, y: 600 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- B1: Kural 10 ----------
  S.push({
    id: 'b1-rule10',
    category: 'Kurallar', topic: 'Temel hak kuralları',
    title: 'B1 · Kural 10: İskele kontra, sancak kontraya yol verir',
    summary: 'Zıt kontralardaki iki tekne kesişirken rüzgarı iskeleden alan (bumbası sancakta olan) tekne yol vermek zorundadır. Yol vermenin iki yolu vardır: arkasından geç (duck) ya da tramola at.',
    duration: 14,
    baseSpeed: 55,
    wind: 0,
    marks: [{ x: 500, y: 90, label: 'Orsa şamandırası', zone: false }],
    boats: [
      { id: 'S', name: 'Sancak kontra', role: 'hak', color: '#2a9d8f',
        start: { x: 760, y: 620, h: 315 }, v0: 55,
        segs: [{ mode: 'closehauled', tack: 'starboard', dur: 14, turn: 0 }] },
      { id: 'P', name: 'İskele kontra', role: 'yol', color: '#e76f51',
        start: { x: 240, y: 620, h: 45 }, v0: 55,
        segs: [
          { mode: 'closehauled', tack: 'port', dur: 3.6, turn: 0 },
          { mode: 'heading', h: 100, dur: 2.6, turn: 1.0 },           // bordala, arkasından geç
          { mode: 'closehauled', tack: 'port', dur: 7.6, turn: 1.2 }
        ] }
    ],
    steps: [
      { t: 0, title: 'İki tekne kesişiyor', text: 'Yeşil tekne rüzgarı sağ tarafından alıyor. Bumbası solda. Yani sancak kontra. Turuncu rüzgarı sol tarafından alıyor. Yani iskele kontra. Kural 10 der ki: iskele kontradaki tekne yol verir.' },
      { t: 3, title: 'Karar anı', text: 'Turuncu çarpışma yolunda olduğunu erken görmeli. Üç seçeneği var. Birincisi, bordalayıp yeşilin arkasından geçmek. İkincisi, yeşilin altına tramola atmak. Üçüncüsü, erkenden tramola atıp uzaklaşmak.' },
      { t: 3.8, title: 'Bordalama', text: 'Turuncu bordalıyor ve yeşilin arkasından geçiyor. Gitmek istediğin taraf sağsa bu en ucuz yoldur. Sadece bir iki boy kaybedersin.' },
      { t: 7, title: 'Tekrar orsaya dön', text: 'Yeşilin arkasından geçince hemen orsaya dön. Ama yeşilin kıçına çok yaklaşma. Kural 14 der ki: iki tekne de çarpışmamaya çalışmalı.' },
      { t: 10, title: 'Unutma', text: 'Sancak kontradaki tekne sancak diye bağırır. Ama bağırmasa da hak onundur. Sancak kontradaki tekne de rotasını aniden değiştirip öbürünün kaçmasını engelleyemez. Bu Kural 16.' }
    ],
    addBoat: { pin: { x: 130, y: 600 }, middle: { x: 430, y: 660 }, committee: { x: 880, y: 600 } }
  });

  // ---------- C1: Header'da tramola ----------
  S.push({
    id: 'c1-header-tack',
    category: 'Taktik', topic: 'Rüzgar ve orsa',
    title: 'C1 · Salınımlı rüzgar: kapatmada (header) tramola at',
    summary: 'Rüzgar birkaç dakikada bir sağa-sola salınıyorsa, sizi orsadan "kapatan" dönüşte tramola atıp "açan" (lift) kontrada kalmak, hiç tramola atmayan tekneye kıyasla ciddi kazanç sağlar.',
    duration: 38,
    baseSpeed: 20,
    wind: [
      { t: 0, from: 0 }, { t: 6, from: 0 }, { t: 10, from: -15 }, { t: 18, from: -15 },
      { t: 22, from: 15 }, { t: 30, from: 15 }, { t: 34, from: 0 }, { t: 40, from: 0 }
    ],
    rungs: { boat: 'T', from: 12 },
    showWindTrace: true,
    // filo: bir kısmı yeşil gibi header'da tramola atar, bir kısmı turuncu gibi kontrada devam eder
    boats: (() => {
      const T =
      { id: 'T', name: 'Kapatmada tramola atan', role: 'dogru', color: '#2a9d8f',
          start: { x: 680, y: 650, h: 315 }, v0: 20,
          segs: [
            { mode: 'closehauled', tack: 'starboard', dur: 10, turn: 0 },
            { mode: 'closehauled', tack: 'port', dur: 12, turn: 1.5 },
            { mode: 'closehauled', tack: 'starboard', dur: 16, turn: 1.5 }
          ] };
      const K =
      { id: 'K', name: 'Kontrada devam eden', color: '#e76f51',
          start: { x: 560, y: 650, h: 315 }, v0: 20,
          segs: [{ mode: 'closehauled', tack: 'starboard', dur: 38, turn: 0 }] };
      return [T, K, ...fleetCopies(T, [{ dx: 75, dy: -30 }, { dx: 150, dy: 5 }], 1), ...fleetCopies(K, [{ dx: 45, dy: -65 }, { dx: 35, dy: 42 }, { dx: 105, dy: -110 }], 3)];
    })(),
    steps: [
      { t: 0, title: 'Rüzgar tam kuzeyden', text: 'İki tekne de sancak kontrada orsa gidiyor. Gri filonun bazısı yeşil gibi, bazısı turuncu gibi davranacak. Sağ üstteki ok rüzgarın geldiği yönü gösterir. Pusulada orsa rotanı aklında tut.' },
      { t: 7, title: 'Rüzgar sola döndü: kapatma', text: 'Rüzgar sola dönünce sancak kontradaki tekne daha aşağı gitmek zorunda kalır. Burnu şamandıradan uzaklaşır. Buna kapatma denir. İngilizcesi header. Pusuladaki rakam düşer.' },
      { t: 10, title: 'Yeşil tramola atıyor', text: 'Kural basit: kapatmada tramola at. Yeşil iskele kontraya geçti. Şimdi rüzgar onu şamandıraya doğru götürüyor. Buna açma denir. Turuncu ise kapalı kontrada devam ediyor.' },
      { t: 14, title: 'Merdiven basamağı', text: 'Kesikli çizgi kimin gerçekten önde olduğunu gösterir. Yeşil, turuncunun önüne geçti. Unutma, yukarı demek rüzgarın geldiği yön demektir, ekranın üstü değil.' },
      { t: 20, title: 'Rüzgar sağa döndü', text: 'Şimdi rüzgar sağa döndü. Bu kez iskele kontradaki yeşil kapanıyor. Turuncu ise sancak kontrada açılıyor.' },
      { t: 22, title: 'Yeşil yine tramola atıyor', text: 'Yeşil kapanınca yine tramola atıp açılan kontraya geçiyor. İki tekne de şimdi aynı kontrada. Aradaki fark büyüyor.' },
      { t: 32, title: 'Sonuç', text: 'Yeşil hep açılan kontrada kaldı. Bu yüzden şamandıraya daha kısa yoldan gitti. Ortalama rotanı bil. Rotan ortalamanın altına düşerse tramola at. Üstündeysen devam et. Her küçük dalgalanmada değil, dönüş yerleşince tramola at.' }
    ],
    addBoat: { pin: { x: 440, y: 650 }, middle: { x: 620, y: 650 }, committee: { x: 760, y: 650 } }
  });

  // ---------- C3: layline — erken tramola, tam layline, fazla gitme (overstand) ----------
  S.push({
    id: 'c3-layline',
    category: 'Taktik', topic: 'Rüzgar ve orsa',
    title: 'C3 · Layline: tam zamanında tramola at, fazla gitme',
    summary: 'Layline, orsa şamandırasına tek kontrada gidebileceğin çizgidir. Üç tekne aynı hizadan iskele kontrada çıkıyor. Yeşil D tam layline\'da tramola atar ve şamandıraya dümdüz gider. Turuncu F layline\'ı geçer, fazla gider. Sonra apaza bırakıp boşuna yol yapar. Mor E çok erken tramola atar, iki tramola fazla yapar ve layline\'daki filonun arkasına sıkışır.',
    duration: 38,
    baseSpeed: 26,
    wind: 0,
    rungs: { boat: 'D', from: 6 },
    marks: [{ x: 430, y: 190, label: 'Orsa şamandırası', zone: true }],
    boats: (() => {
      const round = [
        { mode: 'goto', x: 408, y: 164, dur: 4, rate: 150 },
        { mode: 'heading', h: 195, dur: 20, turn: 1.2 }
      ];
      const D =
      { id: 'D', name: 'Tam layline\'da tramola', role: 'dogru', color: '#2a9d8f', noShadow: true,
        start: { x: 300, y: 670, h: 45 }, v0: 26,
        segs: [
          { mode: 'goto', x: 452, y: 170, dur: 40, rate: 90, note: 'Layline\'a gelince tramola' },
          ...round
        ] };
      const F =
      { id: 'F', name: 'Fazla gidiyor', role: 'hata', color: '#e76f51',
        start: { x: 390, y: 670, h: 45 }, v0: 26,
        segs: [
          { mode: 'closehauled', tack: 'port', dur: 16, turn: 0 },
          { mode: 'closehauled', tack: 'port', dur: 5, turn: 0, note: 'Layline\'ı geçti, devam ediyor' },
          { mode: 'goto', x: 452, y: 170, dur: 40, rate: 90, note: 'HATA: fazla gitti, apazla dönüyor' },
          ...round
        ] };
      const E =
      { id: 'E', name: 'Çok erken tramola', role: 'hata', color: '#8e6bbf',
        start: { x: 250, y: 670, h: 45 }, v0: 26,
        segs: [
          { mode: 'closehauled', tack: 'port', dur: 8, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 3, turn: 1.4, note: 'Erken tramola, şamandırayı tutmuyor' },
          { mode: 'closehauled', tack: 'port', dur: 11, turn: 1.4, note: 'Bir tramola daha' },
          { mode: 'goto', x: 452, y: 170, dur: 40, rate: 90, note: 'Üçüncü tramola' },
          ...round
        ] };
      return [D, F, E, ...fleetCopies(D, [{ dx: 60, dy: -100 }, { dx: 80, dy: -180 }], 1)];
    })(),
    steps: [
      { t: 0, title: 'Üç tekne aynı hizada', text: 'Üçü de iskele kontrada orsa gidiyor. Kesikli çizgiye göre hepsi aynı basamakta. Şamandıraya kim önce varacak?' },
      { t: 9, title: 'E erken tramola atıyor', text: 'Mor E çok erken tramola attı. Bu kontrada şamandırayı tutmuyor. Hemen bir tramola daha atmak zorunda kaldı.' },
      { t: 17, title: 'Layline nedir?', text: 'Layline, şamandıraya tek kontrada gidebileceğin çizgidir. Yeşil D tam bu çizgiye geldi ve tramola atıyor. Gri filo da aynı çizgide sıra oldu.' },
      { t: 20, title: 'F fazla gidiyor', text: 'Turuncu F layline\'ı geçti ama hâlâ iskele kontrada. Buna fazla gitmek denir. İngilizcesi overstand.' },
      { t: 23, title: 'E pis havada', text: 'E üçüncü tramolasını attı ve layline\'a D\'nin hemen altından girdi. D\'nin pis havasında kaldı. Fazla tramola hem yavaşlattı hem de onu sıranın arkasına itti.' },
      { t: 26, title: 'Boşa giden yol', text: 'F tramola attı ama şamandıranın çok üstünü tutuyor. Apaza bırakıp şamandıraya iniyor. Rüzgarüstüne gittiği yol boşa gitti.' },
      { t: 30, title: 'Kim önde?', text: 'D şamandırayı ilk döndü. E fazla tramolalar yüzünden geride. F boşa yol yaptığı için en geride.' },
      { t: 35, title: 'Özet', text: 'Layline\'a gelmeden tramola atma, geçme de. Şamandırayı yandan, omzunun biraz arkasında görünce tramola at. Kalabalıkta bir iki boy yukarıdan gir, öndekilerin pis havası seni aşağı itmesin.' }
    ],
    addBoat: { pin: { x: 160, y: 670 }, middle: { x: 260, y: 670 }, committee: { x: 460, y: 670 } }
  });

  // ---------- C4: lee-bow — geçemeyeceğin sancak teknenin önüne, rüzgaraltına tramola ----------
  S.push({
    id: 'c4-lee-bow',
    category: 'Taktik', topic: 'Rüzgar ve orsa',
    title: 'C4 · Lee-bow: geçemiyorsan önüne, rüzgaraltına tramola at',
    summary: 'İskele kontradaki tekne sancak tekneyi geçemiyorsa iki yolu vardır: arkasından dolanmak ya da önüne, rüzgaraltına tramola atmak. Buna lee-bow denir. Yeşil D tramolayı bir boy önde ve yeterince uzakta atar. Yelkeninden kıvrılan rüzgar sancak teknenin yelkenini bozar, o yavaşlar ve tramola atıp gider. Turuncu Y tramolayı çok yakında atar. Sancak tekne kaçmak zorunda kalır, Y protesto edilir ve iki tur ceza döner.',
    duration: 22,
    baseSpeed: 20,
    wind: 0,
    boats: (() => {
      const D =
      { id: 'D', name: 'Doğru lee-bow', role: 'dogru', color: '#2a9d8f',
        start: { x: 220, y: 470, h: 45 }, v0: 20,
        segs: [
          { mode: 'closehauled', tack: 'port', dur: 4.6, turn: 0, note: 'Sancak tekneyi geçemiyorum' },
          { mode: 'closehauled', tack: 'starboard', dur: 21.4, turn: 1.4, note: 'Önüne, rüzgaraltına tramola' }
        ] };
      const S1 =
      { id: '1', name: 'Sancak tekne', color: '#b8c7d6', crowd: true,
        start: { x: 440, y: 490, h: 315 }, v0: 20,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 7.5, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 4.5, turn: 0, speed: 0.7, note: 'Ters rüzgar, yelkenim bozuldu' },
          { mode: 'closehauled', tack: 'port', dur: 13, turn: 1.4, note: 'Tramola atıp kaçıyor' }
        ] };
      const Y =
      { id: 'Y', name: 'Çok yakın tramola', role: 'hata', color: '#e76f51',
        start: { x: 660, y: 470, h: 45 }, v0: 20,
        segs: [
          { mode: 'closehauled', tack: 'port', dur: 6.2, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 2, turn: 1.4, note: 'HATA: burnunun dibine tramola' },
          { mode: 'closehauled', tack: 'starboard', dur: 1.5, turn: 0, note: 'Protesto! Kural 15' },
          { mode: 'heading', h: 250, dur: 1.4, turn: 0.8, speed: 0.8, note: 'İki tur ceza' },
          { mode: 'heading', h: 160, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: 70, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: -20, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: -110, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: -200, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: -290, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'closehauled', tack: 'starboard', dur: 8, turn: 1.0, note: 'Geride kaldı' }
        ] };
      const S2 =
      { id: '2', name: 'Sancak tekne', color: '#b8c7d6', crowd: true,
        start: { x: 880, y: 490, h: 315 }, v0: 20,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 7.0, turn: 0 },
          { mode: 'hold', h: 350, dur: 1.4, speed: 0.25, turn: 0.4, note: 'Kaçmak zorunda! Protesto!' },
          { mode: 'closehauled', tack: 'starboard', dur: 15, turn: 1.2 }
        ] };
      return [D, S1, Y, S2];
    })(),
    steps: [
      { t: 0, title: 'İki ayrı karşılaşma', text: 'Solda yeşil D, sağda turuncu Y iskele kontrada. İkisinin de önüne sancak kontrada gri bir tekne çıkıyor. Sancak tekne yol hakkına sahip.' },
      { t: 4, title: 'Geçebilir miyim?', text: 'D ve Y sancak teknenin önünden geçemiyor. İki yol var. Arkasından dolanmak ya da önüne, rüzgaraltına tramola atmak.' },
      { t: 4.6, title: 'D lee-bow yapıyor', text: 'D, sancak teknenin bir boy önünde ve rüzgaraltında tramola atıyor. Buna lee-bow denir. Gri teknenin rotasını değiştirmesi gerekmiyor.' },
      { t: 6.8, title: 'Y çok yakın', text: 'Y tramolayı sancak teknenin burnunun dibinde attı. Gri tekne çarpmamak için orsalamak zorunda kaldı. Tramola atıp yol hakkı kazanan tekne, öbürüne kaçacak yer bırakmalı. Bu Kural 15.' },
      { t: 8.5, title: 'Ters rüzgar', text: 'Solda, D\'nin yelkeninden kıvrılan rüzgar arkadaki gri teknenin yelkenine çarpıyor. Gri tekne yavaşladı.' },
      { t: 10, title: 'Y ceza dönüyor', text: 'Sağdaki gri tekne protesto diye seslendi. Y iki tur ceza dönüyor ve geride kalıyor.' },
      { t: 13, title: 'Lee-bow işe yaradı', text: 'Soldaki gri tekne yavaş kalmamak için tramola atıp gitti. D tek başına, temiz havada devam ediyor.' },
      { t: 18, title: 'Özet', text: 'Lee-bow için tramolayı sancak teknenin önünde ve rüzgaraltında at. Arada bir boy kadar boşluk bırak. Çok yakında atarsan ceza alırsın. Çok geride atarsan onun pis havasında kalırsın.' }
    ],
    addBoat: { pin: { x: 300, y: 640 }, middle: { x: 560, y: 640 }, committee: { x: 880, y: 640 } }
  });

  // ---------- C4b: kapama (cover) — öndeki, arkadakinin tam rüzgarüstünde kalır ----------
  S.push({
    id: 'c4b-tight-cover',
    category: 'Taktik', topic: 'Rüzgar ve orsa',
    title: 'C4b · Kapama: rakibin her tramolasına tramolayla cevap ver',
    summary: 'Öndeysen ve arkandaki tek rakibin seni geçmesin istiyorsan onun tam rüzgarüstünde kal. Yeşil Ö böyle yapar. Mor A pis havadan kaçmak için tramola atar, Ö de hemen tramola atıp yine onun rüzgarüstüne geçer. A her seferinde Ö\'nün pis havasında kalır ve yaklaşamaz.',
    duration: 26,
    baseSpeed: 20,
    wind: 0,
    shadowLen: 110,
    rungs: { boat: 'Ö', from: 2 },
    boats: (() => {
      const O =
      { id: 'Ö', name: 'Kapatan', role: 'dogru', color: '#2a9d8f',
        start: { x: 560, y: 470, h: 315 }, v0: 20,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 3.8, turn: 0, note: 'A\'nın rüzgarüstündeyim' },
          { mode: 'closehauled', tack: 'port', dur: 7.6, turn: 1.4, note: 'Tramolasına tramolayla cevap' },
          { mode: 'closehauled', tack: 'starboard', dur: 14, turn: 1.4, note: 'Yine tam rüzgarüstünde' }
        ] };
      const A =
      { id: 'A', name: 'Kaçmaya çalışan', color: '#8e6bbf',
        start: { x: 572, y: 545, h: 315 }, v0: 20,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 3, turn: 0, note: 'Pis havadayım' },
          { mode: 'closehauled', tack: 'port', dur: 7.2, turn: 1.4, note: 'Temiz havaya kaçıyorum' },
          { mode: 'closehauled', tack: 'starboard', dur: 7.8, turn: 1.4, note: 'Yine pis havada' },
          { mode: 'closehauled', tack: 'starboard', dur: 8, turn: 0, note: 'Çok geride kaldı' }
        ] };
      return [O, A, ...fleetCopies(O, [{ dx: 260, dy: -60 }, { dx: 330, dy: 80 }, { dx: 250, dy: 190 }], 1).map(b => ({ ...b, segs: [{ mode: 'closehauled', tack: 'starboard', dur: 26, turn: 0 }] }))];
    })(),
    steps: [
      { t: 0, title: 'Ö önde', text: 'Yeşil Ö önde. Mor A hemen arkasında ve Ö\'nün tam rüzgaraltında. A, Ö\'nün pis havasında, yavaş gidiyor.' },
      { t: 3, title: 'A kaçıyor', text: 'A temiz havaya çıkmak için tramola atıyor.' },
      { t: 3.8, title: 'Ö kapatıyor', text: 'Ö hemen tramola atıyor ve yine A\'nın tam rüzgarüstüne geçiyor. Buna kapama denir. İngilizcesi cover.' },
      { t: 8, title: 'A yine pis havada', text: 'Ö\'nün gölgesi yine A\'nın yelkeninde. A kaçamadı.' },
      { t: 10.2, title: 'İkinci deneme', text: 'A yeniden tramola atıyor. Ö de hemen ardından tramola atıp yine üstüne geçiyor.' },
      { t: 16, title: 'Fark büyüyor', text: 'Kesikli çizgiye bak. A her tramolada biraz daha geride kaldı. Ö önde kalıyor.' },
      { t: 22, title: 'Özet', text: 'Öndeysen rakibinle şamandıra arasında kal. Yakındaysa tam rüzgarüstüne geç, buna sıkı kapama denir. Çok öndeysen aynı kontrada kalman yeter, buna gevşek kapama denir. Filonun geri kalanını da unutma.' }
    ],
    addBoat: { pin: { x: 300, y: 620 }, middle: { x: 640, y: 640 }, committee: { x: 840, y: 620 } }
  });

  // ---------- D3: pupada arkadan gölgeyle saldırı ----------
  S.push({
    id: 'd3-shadow-attack',
    category: 'Taktik', topic: 'Pupa',
    title: 'D3 · Pupada saldır: gölgeni öndeki teknenin yelkenine düşür',
    summary: 'Pupada rüzgar arkadan gelir. Arkadaki tekne öndekinin rüzgarını keser. Yeşil A, öndeki teknenin tam rüzgarüstüne geçer. Gölgesi öndekinin yelkenine düşer ve öndeki yavaşlar. A bir boydan fazla yaklaşır.',
    duration: 30,
    baseSpeed: 20,
    wind: 0,
    shadowLen: 110,   // pupada yelkenin gölgesi rüzgaraltına 3 boy kadar uzanır
    rungs: { boat: 'A', from: 4, down: true },
    marks: [{ x: 330, y: 640, label: 'Pupa şamandırası' }],
    boats: (() => {
      const O =
      { id: 'Ö', name: 'Öndeki: savunmuyor', role: 'hata', color: '#e76f51',
        start: { x: 640, y: 150, h: 210 }, v0: 20,
        segs: [{ mode: 'run', tack: 'starboard', dur: 30, turn: 0, note: '' }] };
      const A =
      { id: 'A', name: 'Gölgeyle saldırıyor', role: 'dogru', color: '#2a9d8f',
        start: { x: 690, y: 60, h: 210 }, v0: 20,
        segs: [
          { mode: 'run', tack: 'starboard', dur: 1, turn: 0 },
          { mode: 'heading', h: 245, dur: 4.6, turn: 0.8, note: 'Öndekinin rüzgarüstüne geç' },
          { mode: 'run', tack: 'starboard', angle: 156, dur: 24.4, turn: 0.8, note: 'Gölgem onun yelkeninde' }
        ] };
      return [A, O, ...fleetCopies(O, [{ dx: -150, dy: 10 }, { dx: -260, dy: -90 }, { dx: 140, dy: -150 }, { dx: -90, dy: -170 }], 1)];
    })(),
    steps: [
      { t: 0, title: 'Pupada rüzgar arkadan', text: 'Herkes pupada, şamandıraya iniyor. Rüzgar arkadan esiyor. Her yelken arkasında, rüzgaraltında bir gölge bırakır. Pupada bu gölge öne, aşağıya düşer.' },
      { t: 2, title: 'A hedefini seçiyor', text: 'Yeşil A, öndeki turuncu Ö\'ye bakıyor. Ö\'nün tam rüzgarüstüne, yani arkasına geçmek için biraz daha pupaya dönüyor.' },
      { t: 6, title: 'Gölge yelkende', text: 'A tam rüzgarüstünde. A\'nın gölgesi Ö\'nün yelkenine düşüyor. Ö\'nün rüzgarı azaldı, yavaşlıyor. A ise temiz havada, tam hızda.' },
      { t: 12, title: 'Fark kapanıyor', text: 'Kesikli çizgi kimin önde olduğunu gösterir. A her saniye biraz yaklaşıyor. Ö hiçbir şey yapmıyor, gölgede kalıyor.' },
      { t: 20, title: 'A yaklaştı', text: 'A bir boydan fazla yaklaştı. Ö hâlâ gölgede. Arkadaki tekne öndekine çarpmamalı. Bu Kural 12. Şamandıraya kadar yan yana gelirse içte olan yer kazanır.' },
      { t: 26, title: 'Özet', text: 'Pupada arkadaysan bu senin silahın. Öndekinin tam rüzgarüstüne geç, gölgeni yelkenine düşür. Öndeysen arkana bak. Bir sonraki derste nasıl kaçacağını göreceksin.' }
    ],
    addBoat: { pin: { x: 560, y: 60 }, middle: { x: 660, y: 40 }, committee: { x: 800, y: 80 } },
    addBoatLabels: { pin: 'Önde', middle: 'Ortada', committee: 'Arkada' }
  });

  // ---------- D3b: pupada gölgeden kavançayla kaç ----------
  S.push({
    id: 'd3b-gybe-escape',
    category: 'Taktik', topic: 'Pupa',
    title: 'D3b · Pupada gölge üstündeyse: kavança at, temiz havaya kaç',
    summary: 'Pupada arkandaki tekne gölgesini senin yelkenine düşürürse yavaşlarsın. Çözüm kavança. Yeşil K kavança atar, gölgeden çıkar ve temiz havada tam hızla gider. Turuncu O aynı durumda devam eder, gölgede kalır ve geride kalır.',
    duration: 28,
    baseSpeed: 20,
    wind: 0,
    shadowLen: 140,   // pupada yelkenin gölgesi rüzgaraltına 3 boy kadar uzanır
    rungs: { boat: 'K', from: 8, down: true },
    marks: [{ x: 420, y: 660, label: 'Pupa şamandırası' }],
    boats: [
      { id: 'K', name: 'Kavançayla kaçıyor', role: 'dogru', color: '#2a9d8f',
        start: { x: 430, y: 175, h: 210 }, v0: 20,
        segs: [
          { mode: 'run', tack: 'starboard', dur: 4, turn: 0, note: 'Gölge üstümde' },
          { mode: 'run', tack: 'port', dur: 9, turn: 1.4, note: 'Kavança: gölgeden çık' },
          { mode: 'run', tack: 'starboard', dur: 15, turn: 1.4, note: 'Temiz havada' }
        ] },
      { id: 'O', name: 'Gölgede devam', role: 'hata', color: '#e76f51',
        start: { x: 760, y: 175, h: 210 }, v0: 20,
        segs: [{ mode: 'run', tack: 'starboard', dur: 28, turn: 0, note: 'HATA: gölgede devam' }] },
      // saldıranlar (gri filo): tam rüzgarüstünden gölgelerini düşürürler
      { id: '1', name: 'Filo', crowd: true, color: '#b8c7d6', start: { x: 434, y: 66, h: 206 }, v0: 20,
        segs: [{ mode: 'run', tack: 'starboard', angle: 154, dur: 28, turn: 0 }] },
      { id: '2', name: 'Filo', crowd: true, color: '#b8c7d6', start: { x: 764, y: 66, h: 206 }, v0: 20,
        segs: [{ mode: 'run', tack: 'starboard', angle: 154, dur: 18, turn: 0 }, { mode: 'heading', h: 235, dur: 4.5, turn: 1 },
          { mode: 'run', tack: 'starboard', dur: 5.5, turn: 1 }] },
      { id: '3', name: 'Filo', crowd: true, color: '#b8c7d6', start: { x: 320, y: 10, h: 210 }, v0: 20,
        segs: [{ mode: 'run', tack: 'starboard', dur: 28, turn: 0 }] },
      { id: '4', name: 'Filo', crowd: true, color: '#b8c7d6', start: { x: 920, y: 30, h: 210 }, v0: 20,
        segs: [{ mode: 'run', tack: 'starboard', dur: 28, turn: 0 }] }
    ],
    steps: [
      { t: 0, title: 'Arkanda biri var', text: 'Yeşil K ve turuncu O pupada iniyor. İkisinin de tam arkasında, rüzgarüstünde bir tekne var. O teknelerin gölgesi K ve O\'nun yelkenine düşüyor. İkisi de yavaşlıyor.' },
      { t: 3, title: 'Arkana bak', text: 'Pupada sık sık arkana bak. Arkadaki tekne seninle rüzgar arasına girdiyse rüzgarını kesiyor demektir.' },
      { t: 4.5, title: 'K kavança atıyor', text: 'K kavança atıp öbür kontraya geçiyor. Bumba karşı tarafa geçer, dikkatli ol. Bir iki saniyede gölgeden çıkıyor.' },
      { t: 9, title: 'K temiz havada', text: 'K artık temiz havada, tam hızda. O hâlâ gölgede. Arkadaki tekne O\'ya yaklaşıyor.' },
      { t: 13.5, title: 'K tekrar kavança', text: 'K şamandıraya dönmek için yine kavança atıyor. Pupada kavança ucuzdur, az hız kaybettirir.' },
      { t: 20, title: 'Kim önde?', text: 'Kesikli çizgi kimin önde olduğunu gösterir. K, O\'nun önüne geçti. O hiçbir şey yapmadığı için geride kaldı.' },
      { t: 25, title: 'Özet', text: 'Pupada gölge üstündeyse bekleme. Kavança at ve temiz havaya kaç. Kavança atarken başka bir teknenin önünü kesme. İskele kontradaki tekne yol verir. Bu Kural 10.' }
    ],
    addBoat: { pin: { x: 560, y: 60 }, middle: { x: 660, y: 40 }, committee: { x: 840, y: 80 } },
    addBoatLabels: { pin: 'Önde', middle: 'Ortada', committee: 'Arkada' }
  });

  // ---------- D4: pupa kapısı — kalabalık ucu değil, boş ucu seç ----------
  S.push({
    id: 'd4-gate-choice',
    category: 'Taktik', topic: 'Pupa',
    title: 'D4 · Pupa kapısı: kalabalık şamandırayı değil, boş olanı seç',
    summary: 'Pupa kapısında iki şamandıra vardır, istediğini dönersin. Filo hep aynı şamandıraya yığılırsa orada sıra olur. İçteki tekneler yer alır, dıştakiler bekler ve geniş döner. Yeşil D kavança atıp boş şamandırayı döner ve temiz havada orsaya çıkar. Turuncu Y kalabalığa gider, sıranın sonunda dışarıdan döner.',
    duration: 34,
    baseSpeed: 20,
    wind: 0,
    shadowLen: 110,
    rungs: { boat: 'D', from: 27 },
    marks: [{ x: 330, y: 480, label: 'Kapı · sol', zone: true }, { x: 600, y: 480, label: 'Kapı · sağ' }],
    boats: (() => {
      // sol şamandırayı sağa (saat yönünde) dönen sıra: doğudan gel, altından geç, batıdan orsaya çık
      const tight = { start: { x: 560, y: 80, h: 210 }, v0: 20, segs: [
        { mode: 'goto', x: 360, y: 460, dur: 40, rate: 60 },
        { mode: 'goto', x: 338, y: 508, dur: 6, rate: 120 },
        { mode: 'goto', x: 300, y: 492, dur: 6, rate: 120 },
        { mode: 'closehauled', tack: 'starboard', dur: 14, turn: 0.8 }
      ] };
      const Y =
      { id: 'Y', name: 'Kalabalığa gidiyor', role: 'hata', color: '#e76f51',
        start: { x: 560, y: 80, h: 210 }, v0: 20,
        segs: [
          { mode: 'goto', x: 432, y: 370, dur: 40, rate: 60 },
          { mode: 'goto', x: 394, y: 460, dur: 10, rate: 60, speed: 0.65, note: 'Sıra var, yavaşlıyor' },
          { mode: 'goto', x: 352, y: 530, dur: 6, rate: 120, note: 'Sıranın sonunda, dışarıdan' },
          { mode: 'goto', x: 300, y: 520, dur: 6, rate: 120, note: 'Geniş döndü' },
          { mode: 'closehauled', tack: 'starboard', dur: 14, turn: 0.8, note: 'HATA: sıranın arkasında' }
        ] };
      const D =
      { id: 'D', name: 'Boş şamandırayı seçti', role: 'dogru', color: '#2a9d8f',
        start: { x: 640, y: 70, h: 210 }, v0: 20,
        segs: [
          { mode: 'run', tack: 'starboard', dur: 3, turn: 0 },
          { mode: 'run', tack: 'port', dur: 5, turn: 1.4, note: 'Kavança: boş şamandıraya' },
          { mode: 'goto', x: 578, y: 465, dur: 30, rate: 60, note: 'Sağ şamandıra boş' },
          { mode: 'goto', x: 604, y: 508, dur: 6, rate: 120, note: 'Yakından dön' },
          { mode: 'goto', x: 640, y: 490, dur: 6, rate: 120 },
          { mode: 'closehauled', tack: 'port', dur: 14, turn: 0.8, note: 'Temiz havada orsa' }
        ] };
      return [D, Y, ...fleetTrain(tight, [-4, -3, -2, -1], 3.2, 20, 1).map(b => ({ ...b, noShadow: true }))];   // sıra bozulmasın
    })(),
    steps: [
      { t: 0, title: 'Kapıya iniyorsun', text: 'Pupa kapısında iki şamandıra var. İstediğini dönebilirsin. Önündeki tekneler hep soldakine gidiyor.' },
      { t: 4, title: 'D kavança atıyor', text: 'Yeşil D sıranın oluşacağını görüyor. Kavança atıp sağdaki boş şamandıraya yöneliyor. Turuncu Y kalabalığın peşinden gidiyor.' },
      { t: 12, title: 'Soldaki şamandırada sıra', text: 'Soldaki şamandırada tekneler arka arkaya dönüyor. Bölgeye yan yana girersen içteki tekne yer alır. Bu Kural 18. Sonradan gelen dışarıda kalır.' },
      { t: 22, title: 'D yakından dönüyor', text: 'D sağdaki şamandırayı tek başına, yakından dönüyor. Önü açık, temiz havada orsaya çıkıyor.' },
      { t: 25, title: 'Y dışarıdan dönüyor', text: 'Y sıranın sonunda. Sıra beklerken yavaşladı. İçerisi dolu, geniş dönmek zorunda. Orsaya çıkınca öndeki teknelerin arkasında kalıyor.' },
      { t: 30, title: 'Kim önde?', text: 'Kesikli çizgi kimin daha yukarıda olduğunu gösterir. D daha önde. Üstelik temiz havada ve kendi tarafında.' },
      { t: 32, title: 'Özet', text: 'Kapıya inerken iki şamandıraya da bak. Kalabalık olanda sıra beklersin. Boş olanı seç ve yakından dön. Hangi şamandıra rüzgara daha yakınsa o da avantajlıdır.' }
    ],
    addBoat: { pin: { x: 520, y: 40 }, middle: { x: 660, y: 30 }, committee: { x: 840, y: 60 } },
    addBoatLabels: { pin: 'Önde', middle: 'Ortada', committee: 'Arkada' }
  });

  // ---------- B8: Kural 18 ----------
  S.push({
    id: 'b8-rule18',
    category: 'Kurallar', topic: 'Şamandıra',
    title: 'B8 · Kural 18: Şamandıra yeri (zone ve bindirme)',
    summary: 'Şamandıranın 3 tekne boyu çevresi "zone"dur. İlk tekne zone\'a girdiği anda içte bindirmesi olan tekne "şamandıra yeri" (mark-room) kazanır; dıştaki tekne ona dönüş için yer vermek zorundadır.',
    duration: 17.5,
    baseSpeed: 40,
    wind: 0,
    marks: [{ x: 450, y: 168, label: 'Orsa şamandırası (iskelede bırak)', zone: true }],
    // Optimist kalabalığı: I'nın önünde ve arkasında aynı layline'dan gelen dizi, O'nun arkasında dıştan gelenler
    boats: (() => {
      const I =
      { id: 'I', name: 'İçteki · yer hakkı', role: 'hak', color: '#2a9d8f',
          start: { x: 830, y: 460, h: 315 }, v0: 40,
          segs: [
            { mode: 'closehauled', tack: 'starboard', dur: 9.3, turn: 0 },
            { mode: 'heading', h: 250, dur: 1.4, turn: 1.4 },
            { mode: 'run', tack: 'starboard', dur: 6.8, turn: 1.8 }
          ] };
      const O =
      { id: 'O', name: 'Dıştaki · yer verir', role: 'yol', color: '#e76f51',
          start: { x: 876, y: 420, h: 315 }, v0: 40,
          segs: [
            { mode: 'closehauled', tack: 'starboard', dur: 12.2, turn: 0 },
            { mode: 'heading', h: 250, dur: 1.6, turn: 1.4 },
            { mode: 'run', tack: 'starboard', dur: 3.7, turn: 1.8 }
          ] };
      return [I, O, ...fleetTrain(I, [-3.4, -1.8, 1.5, 3, 4.5], 1, 40, 1), ...fleetTrain(O, [1.5, 3], 1, 40, 6)];
    })(),
    steps: [
      { t: 0, title: 'İki tekne layline\'da', text: 'İki tekne de sancak kontrada, yan yana şamandıraya geliyor. Yeşil aşağıda ve şamandıraya daha yakın. Yani içteki tekne o. Kesikli daire 3 tekne boyu büyüklüğünde. Buna bölge denir. Gri filo da sıra halinde şamandıraya geliyor.' },
      { t: 7.6, title: 'Bölgeye giriş', text: 'İlk tekne bölgeye girdiği an bakılır: yan yanalar mı? Evet, yeşil içte. Artık turuncu, yeşile şamandırayı dönmesi için yer vermek zorunda. Bu Kural 18. Sonra yan yanalık bozulsa bile bu hak devam eder.' },
      { t: 9.6, title: 'Dönüş', text: 'Yeşil şamandırayı yakından dönüyor. Turuncu dışarıdan, daha geniş dönüyor. Turuncu yeşili sıkıştıramaz. Sıkıştırırsa ceza alır.' },
      { t: 12.5, title: 'Şamandıradan sonra', text: 'Dönüş bitince Kural 18 de biter. Artık normal kurallar geçerli. Pupaya geçildi. Şimdi kim yukarıda, kim aşağıda, ona bakılır.' },
      { t: 14.5, title: 'Yeni kurallardan not', text: 'İlk tekne bölgeye girdiği an hak sahibi belli olur. Bölgenin içinde tramola atan tekne şamandıra yeri isteyemez. Bölgeye arkadan giren tekne de yer isteyemez. İçeriye burnunu sokma!' }
    ],
    addBoat: { pin: { x: 760, y: 530 }, middle: { x: 900, y: 530 }, committee: { x: 940, y: 400 } },
    addBoatLabels: { pin: 'Önde (iç)', middle: 'Arkada', committee: 'Dışta' }
  });

  // ---------- E1: geniş gir, dar çık ----------
  S.push({
    id: 'e1-wide-in-tight-out',
    category: 'Taktik', topic: 'Şamandıra',
    title: 'E1 · Pupa şamandırası: geniş gir, dar çık',
    summary: 'Pupa şamandırasını dönerken önce biraz dışarı açıl, sonra yumuşak bir yayla dön ve şamandırayı orsaya dönmüş hâlde, dibinden sıyırarak çık. Yeşil D böyle döner ve yukarıda çıkar. Turuncu Y şamandıraya dümdüz gelir, dibinde sert döner ve dışarı savrulur. Aşağıda kalır, arkasındaki tekne içeriden geçer.',
    duration: 34,
    baseSpeed: 20,
    wind: 0,
    rungs: { boat: 'D', from: 26 },
    marks: [{ x: 330, y: 450, label: 'Şamandıra · D', zone: true }, { x: 680, y: 450, label: 'Şamandıra · Y', zone: true }],
    boats: (() => {
      // şamandıra sancakta bırakılır (saat yönünde): doğudan gelinir, altından geçilir, batıdan orsaya çıkılır
      const wide = (mx, my) => [
        { mode: 'run', tack: 'starboard', dur: 11, turn: 0 },
        { mode: 'goto', x: mx + 85, y: my - 30, dur: 8, rate: 60, note: 'Önce dışarı açıl' },
        { mode: 'goto', x: mx + 45, y: my + 34, dur: 6, rate: 70, note: 'Yumuşak yay' },
        { mode: 'goto', x: mx - 4, y: my + 22, dur: 6, rate: 70, note: 'Dibinden sıyır, orsada çık' },
        { mode: 'goto', x: mx - 30, y: my - 4, dur: 4, rate: 60 },
        { mode: 'closehauled', tack: 'starboard', dur: 12, turn: 0.6 }
      ];
      const D =
      { id: 'D', name: 'Geniş gir, dar çık', role: 'dogru', color: '#2a9d8f',
        start: { x: 520, y: 120, h: 210 }, v0: 20, segs: wide(330, 450) };
      const Y =
      { id: 'Y', name: 'Dar gir, geniş çık', role: 'hata', color: '#e76f51',
        start: { x: 870, y: 120, h: 210 }, v0: 20,
        segs: [
          { mode: 'run', tack: 'starboard', dur: 12, turn: 0 },
          { mode: 'goto', x: 702, y: 430, dur: 10, rate: 60, note: 'Şamandıraya dümdüz' },
          { mode: 'goto', x: 684, y: 478, dur: 4, rate: 160, speed: 0.7, note: 'Dibinde sert dönüş' },
          { mode: 'goto', x: 636, y: 526, dur: 4, rate: 100, speed: 0.7, note: 'HATA: dışarı savruldu' },
          { mode: 'closehauled', tack: 'starboard', dur: 12, turn: 0.8, note: 'Aşağıda kaldı' }
        ] };
      // Y'nin arkasındaki gri tekne: geniş girip Y'nin içinden, rüzgarüstünden çıkar
      const G = { id: '1', name: 'Filo', crowd: true, color: '#b8c7d6', start: { x: 930, y: 92, h: 210 }, v0: 20, segs: wide(680, 450).map(sg => ({ ...sg, note: undefined })) };
      const G2 = { id: '2', name: 'Filo', crowd: true, color: '#b8c7d6', start: { x: 470, y: 30, h: 210 }, v0: 20, segs: wide(330, 450).map(sg => ({ ...sg, note: undefined, dur: sg.dur })) };
      return [D, Y, G, G2];
    })(),
    steps: [
      { t: 0, title: 'İki ayrı şamandıra', text: 'Burada aynı dönüşü yan yana görüyorsun. Solda yeşil D, sağda turuncu Y dönecek. İkisi de pupada iniyor, şamandırayı sağında bırakacak.' },
      { t: 11, title: 'D dışarı açılıyor', text: 'D şamandıraya iki boy kala biraz dışarı açılıyor. Böylece dönüşe geniş ve yumuşak bir yayla girecek.' },
      { t: 14, title: 'Y dümdüz geliyor', text: 'Y şamandıraya dümdüz gidiyor. Dibine gelince sert dönmek zorunda kalacak.' },
      { t: 22, title: 'D dar çıkıyor', text: 'D dönüşün sonunda şamandıranın dibinden geçiyor. Çıkarken burnu zaten orsada. Hızını kaybetmedi.' },
      { t: 23.5, title: 'Y savruluyor', text: 'Y dibinde sert döndü. Tekne yavaşladı ve dışarı savruldu. Şamandıradan uzakta, aşağıda orsaya başlıyor.' },
      { t: 26, title: 'Arkadaki içeriden geçiyor', text: 'Y\'nin arkasındaki gri tekne geniş girip dar çıktı. Y\'nin içinden, rüzgarüstünden geçti. Şimdi Y onun pis havasında.' },
      { t: 29, title: 'Kim yukarıda?', text: 'Kesikli çizgi kimin daha yukarıda olduğunu gösterir. D daha yukarıda. Geniş girip dar çıkan tekne orsaya önde başlar.' },
      { t: 31, title: 'Özet', text: 'Pupa şamandırasında geniş gir, dar çık. Dönüşe şamandıradan biraz uzakta başla. Şamandırayı, orsaya dönmüşken dibinden sıyır.' }
    ],
    addBoat: { pin: { x: 560, y: 60 }, middle: { x: 660, y: 40 }, committee: { x: 840, y: 60 } },
    addBoatLabels: { pin: 'Önde', middle: 'Ortada', committee: 'Arkada' }
  });

  // ---------- E2: orsa şamandırası kalabalığı — sancak layline sırası, bölgede tramola ----------
  S.push({
    id: 'e2-windward-queue',
    category: 'Taktik', topic: 'Şamandıra',
    title: 'E2 · Orsa şamandırası kalabalık: sancak layline\'a erken gir, bölgede tramola atma',
    summary: 'Kalabalık filoda orsa şamandırasına sancak kontrada, layline üzerinde sıra hâlinde gelinir. Yeşil D layline\'a bölgenin dışında, erkenden girer ve sıraya katılır. Turuncu P iskele kontrada gelir ve bölgenin içinde, sıradaki teknelerin hemen önüne tramola atar. Bölgede tramola atan şamandıra yeri isteyemez. P, D\'yi kaçmak zorunda bırakır, protesto edilir ve iki tur ceza döner.',
    duration: 30,
    baseSpeed: 20,
    wind: 0,
    marks: [{ x: 480, y: 260, label: 'Orsa şamandırası', zone: true }],
    boats: (() => {
      // sancak layline: şamandıra iskelede bırakılır; tekne şamandıranın 20 px sağından geçer, sonra apaza bırakır
      const lane = { start: { x: 791, y: 543, h: 315 }, v0: 20, segs: [
        { mode: 'closehauled', tack: 'starboard', dur: 20.6, turn: 0 },
        { mode: 'goto', x: 476, y: 228, dur: 4, rate: 140 },
        { mode: 'goto', x: 448, y: 250, dur: 4, rate: 140 },
        { mode: 'run', tack: 'starboard', dur: 10, turn: 1.0 }
      ] };
      const D =
      { id: 'D', name: 'Layline\'da sırada', role: 'dogru', color: '#2a9d8f',
        start: { x: 791, y: 543, h: 315 }, v0: 20,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 15.0, turn: 0, note: 'Bölgenin dışında layline\'a girdi' },
          { mode: 'closehauled', tack: 'starboard', angle: 30, speed: 0.45, dur: 1.6, turn: 0.4, note: 'P önüme tramola attı! Protesto!' },
          { mode: 'goto', x: 476, y: 228, dur: 10, rate: 140, note: 'Şamandıra yeri benim' },
          { mode: 'goto', x: 448, y: 250, dur: 4, rate: 140 },
          { mode: 'run', tack: 'starboard', dur: 10, turn: 1.0 }
        ] };
      const P =
      { id: 'P', name: 'Bölgede tramola', role: 'hata', color: '#e76f51',
        start: { x: 330, y: 538, h: 45 }, v0: 20,
        segs: [
          { mode: 'closehauled', tack: 'port', dur: 14.0, turn: 0, note: 'İskele kontrada, sıranın altına' },
          { mode: 'closehauled', tack: 'starboard', dur: 1.8, turn: 1.2, note: 'HATA: bölgede, D\'nin önüne tramola' },
          { mode: 'hold', h: 320, dur: 0.8, speed: 0.2, turn: 0.4, note: 'Protesto! Şamandıra yeri yok' },
          { mode: 'heading', h: 240, dur: 1.6, turn: 0.8, speed: 0.8, note: 'Sıradan çıkıyor' },
          { mode: 'heading', h: 225, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: 135, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: 45, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: -45, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: -135, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: -225, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: -315, dur: 0.9, turn: 0.9, speed: 0.5, note: 'İki tur ceza' },
          { mode: 'heading', h: 150, dur: 3.5, turn: 1.2, note: 'Sıranın en sonuna' }
        ] };
      return [D, P, ...fleetTrain(lane, [-4, -3, -2, -1, 1.3, 2.3], 3, 20, 1)];
    })(),
    steps: [
      { t: 0, title: 'Herkes şamandıraya', text: 'Orsa şamandırası kalabalık. Tekneler sancak kontrada, layline üzerinde arka arkaya geliyor. Kesikli daire bölge. Üç tekne boyudur.' },
      { t: 3, title: 'D sırada', text: 'Yeşil D layline\'a bölgenin çok dışında, erkenden girdi. Sıraya katıldı. Sancak kontrada olduğu için iskele teknelere karşı hakkı var.' },
      { t: 8, title: 'P iskele kontrada geliyor', text: 'Turuncu P iskele kontrada, sıranın altından geliyor. Sıranın içinde bir boşluk arıyor.' },
      { t: 14.1, title: 'P bölgede tramola atıyor', text: 'P, bölgenin içinde, D\'nin hemen önüne tramola atıyor. Bölgede tramola atan tekne şamandıra yeri isteyemez. Bu Kural 18.3. Sancağa geçince de D\'ye kaçacak yer bırakmalıydı. Bu da Kural 15.' },
      { t: 15.2, title: 'D kaçmak zorunda', text: 'D çarpmamak için orsalayıp yavaşlıyor ve protesto diye sesleniyor.' },
      { t: 17, title: 'P ceza turu atıyor', text: 'P sıranın dışına çıkıp iki tur ceza atıyor. Sonra sıranın en sonuna gitmek zorunda.' },
      { t: 22, title: 'D şamandırayı dönüyor', text: 'D sırasıyla şamandırayı yakından dönüyor ve pupaya bırakıyor.' },
      { t: 26, title: 'Özet', text: 'Kalabalık orsa şamandırasına sancak kontrada, layline\'dan gel. Layline\'a bölgenin dışında gir ve sıraya katıl. Bölgenin içinde, birinin önüne tramola atma. Ceza alırsın ve en sona düşersin.' }
    ],
    addBoat: { pin: { x: 760, y: 520 }, middle: { x: 860, y: 560 }, committee: { x: 300, y: 500 } },
    addBoatLabels: { pin: 'Layline\'da', middle: 'Arkada', committee: 'İskele kontra' }
  });

  // ---------- İA3: Hakem botu ucunda yer tut ----------
  S.push({
    id: 'ia3-committee-hold',
    category: 'İleri Taktik', topic: 'Start · Hakem botu',
    title: 'İA3 · Hakem botu ucunda yer tut: bayrağın dibinde bekle, kapıyı kapalı tut',
    summary: 'Hakem botu ucu avantajlıysa oradaki tek yer erken gelenindir. Yeşil H 2 dk kala layline\'dan, rüzgaraltından gelir ve hakem botunun turuncu bayrağının hemen yanında, hattın yarım boy altında rüzgara baş verip bekler. Hakem botuna yakın durduğu için rüzgarüstünde kimseye yer kalmaz; rüzgaraltında ise hızlanmak için boşluğu korur. Geç gelip araya sokulmak isteyen (barging) B yer bulamaz, arkadan dolaşıp H\'nin pis rüzgarında çıkar.',
    duration: 38,
    baseSpeed: 40, tau: 1.0,
    clockScale: 4,
    wind: 5,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 30,
    rungs: { boat: 'H', from: 30.5 },
    committeeLabel: 'right',
    laylines: [{ x: 770, y: 452, tack: 'starboard', len: 260, from: 0, to: 9, label: 'Hakem botu layline\'ı' }],
    boats: [
      { id: 'H', name: 'Bayrağın dibinde yer tutan', role: 'dogru', color: '#2a9d8f',
        start: { x: 893, y: 660, h: 320 }, v0: 30,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 4.9, turn: 0, note: 'Erken: layline\'dan, rüzgaraltından' },
          { mode: 'hold', h: 5, dur: 22.5, speed: 0.008, turn: 1.4, note: 'Bayrağın dibinde: yer benim' },
          { mode: 'closehauled', tack: 'starboard', dur: 11.1, turn: 0.8 }
        ] },
      { id: 'B', name: 'Geç gelip sokulan (barging)', role: 'hata', color: '#e76f51',
        start: { x: 975, y: 470, h: 358 }, v0: 2,
        segs: [
          { mode: 'hold', h: 358, dur: 14, speed: 0.03, turn: 0 },
          { mode: 'heading', h: 250, dur: 3.7, turn: 1.0, note: 'Barging: H ile hakem botu arasına' },
          { mode: 'heading', h: 200, dur: 1.6, turn: 0.8, note: 'Yer yok! Bordala' },
          { mode: 'heading', h: 270, dur: 1.6, turn: 1.0, note: 'H\'nin kıçından dolaşıyor' },
          { mode: 'hold', h: 358, dur: 6.9, speed: 0.04, turn: 1.4, note: '2. sırada, H\'nin arkasında' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.5, turn: 0.8, note: 'H\'nin pis rüzgarında' }
        ] }
    ],
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.08, drift: 0.2 }, { slot: 0.14, back: 6, drift: 0.5 }, { slot: 0.20, back: -4 }, { slot: 0.275, back: 8 }, { slot: 0.35 }, { slot: 0.425, back: 6 }, { slot: 0.50, back: -4 }, { slot: 0.575, back: 8 }, { slot: 0.65 }, { slot: 0.72, back: 4 },
      { slot: 0.17, row: 1, back: 10 }, { slot: 0.39, row: 1, back: 6 }, { slot: 0.54, row: 1 }, { slot: 0.66, row: 1, back: 10 }
    ],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: hakem botu ucu avantajlı', text: 'Rüzgar biraz sağa dönmüş. Hakem botu ucu biraz avantajlı. Herkes oradan çıkmak ister. Ama orada tek kişilik yer var: turuncu bayrağın hemen yanı. O yer erken ve doğru yerden gelenindir.' },
      { t: 1.5, title: 'Erken gel, aşağıdan gel', text: 'Yeşil H, 2 dakika kala layline\'dan, aşağıdan geliyor. Aşağıdan gelen teknenin hakkı vardır. Kimse onun üstüne sokulamaz. Bu Kural 11. Yukarıdan araya sokulmak hak vermez.' },
      { t: 5, title: 'Bayrağın dibinde dur', text: 'H turuncu bayrağın hemen yanında, hattın yarım boy gerisinde duruyor. Rüzgara baş vermiş. Hakem botuyla arasına tekne sığmaz. Yani yukarıdaki kapı kapalı. Ama hakem botuna değmiyor. Değerse ceza turu atar.' },
      { t: 9, title: 'Yerini tut, kayma', text: 'Yelken boş, tekne neredeyse duruyor. Burnunu rüzgarda tut. Burun düşerse yelken dolar, hatta doğru gidersin. Çok geri kayarsan yukarıda boşluk açılır. Gerekirse yelkeni bir an doldur, sonra burnu yine rüzgara ver. Yer tutmak, sürekli küçük düzeltmedir.' },
      { t: 12, title: 'Altındaki boşluğu koru', text: 'H\'nin altında, en yakın tekneye kadar 2 boy boş su var. Start\'ta oraya doğru hızlanacak. Biri gelip buraya sokulursa H yavaş kalır. Altındaki boşluk, yukarıdaki kapı kadar önemlidir.' },
      { t: 14, title: 'B geç geliyor ve sokulmak istiyor', text: 'Turuncu B son dakikada yukarıdan, hızla geliyor. H ile hakem botu arasına girmek istiyor. Ama orada yer yok. B yukarıda olduğu için H\'ye yol vermek zorunda. Hakem botuna çarparsa da ceza alır.' },
      { t: 17, title: 'B arkadan dolaşıyor', text: 'B\'nin tek çaresi sert bordalayıp H\'nin arkasından geçmek. Hız ve yer kaybediyor, ikinci sıraya düşüyor.' },
      { t: 27.4, title: '10 saniye kala doldur', text: 'H burnunu altındaki boşluğa düşürüyor ve yelkeni dolduruyor. Hızlanırken hakem botundan uzaklaşıyor. Kimseye çarpmıyor.' },
      { t: 30, title: 'START: avantajlı uçta, temiz', text: 'H hakem botunun hemen yanından, tam hızla ve temiz havada çıkıyor. B hem geride hem de H\'nin pis havasında.' },
      { t: 34, title: 'Özet', text: 'Hakem botu ucunda erken gel. Layline\'dan, aşağıdan gel. Bayrağın dibinde dur, yukarıda boşluk bırakma. Altındaki boşluğu koru. 2 3 saniye kala doldur. Geç kaldıysan yukarıdan sokulma. 3 4 boy aşağıda temiz bir yer seç.' }
    ],
    addBoat: { pin: { x: 290, y: 580 }, middle: { x: 500, y: 580 }, committee: { x: 720, y: 580 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.8] }
  });

  // ---------- İA5: hakem botu ucu kalabalık: erken gir, yerini tut ----------
  S.push({
    id: 'ia5-committee-crowd',
    category: 'İleri Taktik', topic: 'Start · Hakem botu',
    title: 'İA5 · Hakem botu kalabalık: erken gir, yerini tut',
    summary: 'Hakem botu ucu avantajlı ve herkes oraya yığılıyor. Yeşil D erken gelir, kalabalığın içine girip turuncu bayrağın dibinde yerini alır ve start\'a kadar orada bekler. Turuncu Y ise kalabalığın dışında, açıkta bekler: "son dakika girerim" der. 1 dk kala geldiğinde ön sıra dolmuştur; giremez, D\'nin altında (arkasında) ikinci sırada kalır ve start\'ı D\'nin pis rüzgarında alır.',
    duration: 38,
    baseSpeed: 40,
    clockScale: 4,
    wind: 5,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 30,
    rungs: { boat: 'D', from: 30.5 },
    committeeLabel: 'right',
    laylines: [{ x: 770, y: 452, tack: 'starboard', len: 260, from: 0, to: 8, label: 'Hakem botu layline\'ı' }],
    boats: [
      { id: 'D', name: 'Erken girip yer tutan', role: 'dogru', color: '#2a9d8f',
        start: { x: 893, y: 660, h: 320 }, v0: 30,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 4.9, turn: 0, note: 'Erken: layline\'dan kalabalığa gir' },
          { mode: 'hold', h: 5, dur: 22.5, speed: 0.008, turn: 1.4, note: 'Bayrağın dibinde: yer benim' },
          { mode: 'closehauled', tack: 'starboard', dur: 11.1, turn: 0.8 }
        ] },
      { id: 'Y', name: 'Dışarıda bekleyip giremeyen', role: 'hata', color: '#e76f51',
        start: { x: 950, y: 610, h: 0 }, v0: 0,
        segs: [
          { mode: 'hold', h: 0, dur: 14, speed: 0.03, turn: 0, note: 'Dışarıda: "son dakika girerim"' },
          { mode: 'heading', h: 277, dur: 5.05, turn: 1.0, note: 'Geç: hakem botuna doğru' },
          { mode: 'hold', h: 359, dur: 8.35, speed: 0.015, turn: 1.4, note: 'Yer yok! D\'nin altında kaldı' },
          { mode: 'closehauled', tack: 'starboard', dur: 4, turn: 0.8, speed: 0.8 },
          { mode: 'closehauled', tack: 'starboard', dur: 6.6, turn: 0.8, speed: 0.9, note: 'Pis rüzgarda, 2. sırada' }
        ] }
    ],
    crowdLife: { gap: 36 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.14, drift: 0.3 }, { slot: 0.27, back: 6 }, { slot: 0.335, back: -4 }, { slot: 0.40, back: 8 }, { slot: 0.465 }, { slot: 0.53, back: 6 }, { slot: 0.595, back: -4 }, { slot: 0.66, back: 8 }, { slot: 0.725 }, { slot: 0.79, back: 4 },
      { slot: 0.43, row: 1 }, { slot: 0.56, row: 1, back: 8 }, { slot: 0.69, row: 1 },
      // Y gibi dışarıda bekleyen iki tekne daha: geç gelir, ön sıra dolu, ikinci-üçüncü sırada kalır
      { slot: 0.91, row: 1, back: 6, wait: { x: 905, y: 560, h: 0, until: 15, speed: 0.5 } },
      { slot: 0.82, row: 2, wait: { x: 990, y: 525, h: 355, until: 16, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: hakem botu kalabalık', text: 'Hakem botu ucu avantajlı. Filonun yarısı oraya toplanmış. En değerli yer turuncu bayrağın hemen yanı. Orada tek kişilik yer var. Önce gelen alır.' },
      { t: 1.5, title: 'D erken geliyor', text: 'Yeşil D, 2 dakika kala layline\'dan, aşağıdan gelip kalabalığa giriyor. Aşağıdan gelen teknenin hakkı vardır. Bekleyenler ona yer açar. Kimse onun üstüne sokulamaz. Bu Kural 11.' },
      { t: 5.5, title: 'Bayrağın dibinde yerini al', text: 'D bayrağın hemen yanında, hattın yarım boy gerisinde duruyor. Hakem botuyla arasına tekne sığmaz. Altında bir boy hızlanma yeri var. Bu yer artık D\'nin. Bir buçuk dakika burnunu rüzgarda tutup orada bekleyecek.' },
      { t: 9, title: 'Y dışarıda bekliyor', text: 'Turuncu Y kalabalığa girmemiş. Hakem botunun sağında, açıkta rahatça bekliyor. Son dakika gelir, araya girerim diye düşünüyor. Açıkta beklemek kolaydır ama yer tutmaz. Kalabalık uçta yer, erken girip orada durarak alınır.' },
      { t: 14, title: '1 dakika kala: Y geç geliyor', text: 'Y şimdi hakem botuna geliyor. Ama ön sıra dolu. Bayrağın dibinde D var, altında filo var. Aralarda boşluk yok. Yukarıdan D ile hakem botu arasına girmek kurala aykırı. Hakem botuna değerse de ceza alır.' },
      { t: 20.5, title: 'Yer yok: Y arkada kaldı', text: 'Y giremedi. D\'nin arkasında, ikinci sırada duruyor. Arkadaki tekne öndekine yol verir. Bu Kural 12. Y\'nin önünde D, altında başka tekne var. Hızlanacak yeri yok. Dışarıda bekleyen iki tekne daha aynı planla geldi. Onlar da arkada, pis havada kaldı.' },
      { t: 27.4, title: '10 saniye kala doldur', text: 'D burnunu altındaki boşluğa düşürüp yelkeni dolduruyor ve hızlanıyor. Y ancak D gittikten sonra hareket edebiliyor. Üstelik D\'nin pis havasında hızlanıyor.' },
      { t: 30, title: 'START: erken giren önde', text: 'D avantajlı uçtan, hakem botunun yanından, temiz havada ve tam hızda çıkıyor. Y ikinci sırada, D\'nin arkasında. Havası pis, yavaş ve her saniye biraz daha geride.' },
      { t: 34, title: 'Özet', text: 'Hakem botu ucu kalabalıksa erken gel. Layline\'dan, aşağıdan gir. Bayrağın dibinde yerini al ve start\'a kadar orada kal. Son dakika girmeyi planlarsan ön sıra dolar, arkada kalırsın. Geç kaldıysan inat etme. 3 4 boy aşağıda boş bir yer seç.' }
    ],
    addBoat: { pin: { x: 290, y: 580 }, middle: { x: 500, y: 580 }, committee: { x: 720, y: 600 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.8] }
  });

  // ---------- İA6: kuvvetli rüzgar, hakem botu ucunda açılan boşluk ----------
  S.push({
    id: 'ia6-committee-gap',
    category: 'İleri Taktik', topic: 'Start · Hakem botu',
    title: 'İA6 · Kuvvetli rüzgar: hakem botunda açılan boşluğa gir',
    summary: 'Kuvvetli rüzgarda (18 knot) hakem botunun yanı yine kalabalık ama orada durmak zordur: yelkeni boş bekleyen tekneler rüzgaraltına, aşağı kayar ve son 30-40 saniyede botun dibinde boşluk açılır. Turuncu Y erkenden bayrağın dibine park eder, yerini tutamaz, kayar. Yeşil D hakem botunun sancak tarafında, start hattı hizasında bekler; boşluğun açılacağını bildiği için yavaş yavaş botun kıçından dolaşıp açılan boşluğa girer ve hakem botu ucundan, temiz havada start eder.',
    duration: 40,
    baseSpeed: 40,
    clockScale: 4,
    windKn: 18,
    wind: 5,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 32,
    rungs: { boat: 'D', from: 32.5 },
    committeeLabel: 'upright',
    leeway: { from: 18, ramp: 3, rate: 4 },   // kuvvetli rüzgar: bekleyen filo son 1 dk rüzgaraltına kayar (rules.simulate)
    laylines: [{ x: 770, y: 452, tack: 'starboard', len: 260, from: 0, to: 6, label: 'Hakem botu layline\'ı' }],
    boats: [
      { id: 'D', name: 'Dışarıda bekleyip boşluğa giren', role: 'dogru', color: '#2a9d8f',
        start: { x: 905, y: 455, h: 5 }, v0: 0,
        segs: [
          { mode: 'hold', h: 5, dur: 21.6, speed: 0.008, turn: 0, drift: 0.4, note: 'Hat hizasında, botun sancağında' },
          { mode: 'heading', h: 212, dur: 3.4, turn: 1.4, speed: 0.5, note: 'Boşluk açılacak: yavaşça botun kıçına' },
          { mode: 'heading', h: 285, dur: 2.7, turn: 1.0, speed: 0.55, note: 'Açılan boşluğa giriyor' },
          { mode: 'heading', h: 335, dur: 1.1, turn: 0.8, speed: 0.4, note: 'Açılan boşluğa giriyor' },
          { mode: 'hold', h: 325, dur: 1.5, speed: 0.01, turn: 0.8, note: 'Botun dibinde: yer benim' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.5, turn: 0.8 }
        ] },
      { id: 'Y', name: 'Erken park edip kayan', role: 'hata', color: '#e76f51',
        start: { x: 893, y: 660, h: 320 }, v0: 30,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 4.6, turn: 0, note: 'Erken: bayrağın dibine' },
          { mode: 'hold', h: 5, dur: 13.4, speed: 0.008, turn: 1.4, drift: 0.6, note: 'Bayrağın dibinde, zorlukla' },
          { mode: 'hold', h: 348, dur: 11.5, speed: 0.008, turn: 2.5, drift: 5.5, note: 'Tutamıyor: aşağı kayıyor' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.5, turn: 1.0 }
        ] }
    ],
    crowdLife: { gap: 36 },
    crowd: [
      { slot: 0.14, back: -12, drift: 0.4 }, { slot: 0.26, back: -6 }, { slot: 0.325, back: -14 }, { slot: 0.39, back: -4 }, { slot: 0.455, back: -12 }, { slot: 0.52, back: -6 }, { slot: 0.585, back: -14 }, { slot: 0.65, back: -4 }, { slot: 0.715, back: -12 },
      { slot: 0.42, row: 1, back: -12 }, { slot: 0.55, row: 1, back: -6 }, { slot: 0.75, row: 1, back: -12 },
      // D gibi dışarıda bekleyen iki tekne daha: biri açılan boşluğa D'den önce, alttan girer; geç kalan ikinci sırada
      { slot: 0.80, back: -12, wait: { x: 870, y: 575, h: 355, until: 21.5, speed: 0.55 } },
      { slot: 0.86, row: 1, back: -12, wait: { x: 965, y: 520, h: 0, until: 24, speed: 0.5 } }
    ],
    spots: [{ x: 772, y: 482, r: 27, from: 23.5, to: 30, label: 'Boşluk', dx: -48, dy: 4 }],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: sert rüzgar', text: 'Rüzgar sert, 18 knot. Sol üstte görüyorsun. Hakem botu ucu avantajlı. Filo oraya toplanıyor. Ama sert rüzgarda yelkeni boş bir Optimist yerinde duramaz.' },
      { t: 1.5, title: 'Y bayrağın dibine park ediyor', text: 'Turuncu Y erken gelip bayrağın hemen yanına yerleşiyor. Orta ve hafif havada bu doğru plan. Ama sert rüzgarda orada 2 dakika beklemek çok zor.' },
      { t: 6, title: 'D dışarıda bekliyor', text: 'Yeşil D kalabalığa girmiyor. Hakem botunun dışında, hattın uzantısında, hatla aynı hizada bekliyor. Buradan kalabalığı görüyor. Kimse onu sıkıştıramıyor ve hattan da geride değil.' },
      { t: 11, title: 'Sert rüzgarda durmak zor', text: 'Yelken boşken rüzgar teknenin gövdesini ve direğini iter. Tekne yana ve geriye kayar. Y sık sık yelkeni doldurup burnunu rüzgara veriyor. Ama her seferinde biraz daha aşağı iniyor. Filo da aynı sorunu yaşıyor.' },
      { t: 18, title: 'Son dakika: tekneler kayıyor', text: 'Bekleme uzadıkça kayma artıyor. Y ve yanındakiler aşağıya, pin tarafına kayıyor. Hakem botunun dibi yavaş yavaş boşalıyor. Sert rüzgarda bu hemen her start\'ta olur.' },
      { t: 21.6, title: 'D yavaşça geliyor', text: 'D boşluğun açılacağını biliyor. Açılmasını beklemeden yola çıkıyor. Yelkeni yarım doldurup yavaşça hakem botunun arkasına geliyor. Hızlı gelirse erken varır, beklemek zorunda kalır. Yavaş gelirse boşluk açılınca tam oradadır. Hakem botuna değmemeli.' },
      { t: 24.5, title: 'Boşluk açıldı: D giriyor', text: 'Y ve filo bir buçuk boy aşağı kaydı. Hakem botunun dibinde bir tekne sığacak boşluk var. Sarı halka onu gösteriyor. D botun arkasından dolaşıp oraya giriyor. Yukarıda olduğu için Y\'den uzak durur. Boşluğu ilk gören ve hızı olan alır.' },
      { t: 28.5, title: 'Hızı var, yeri var', text: 'D boşluğa yavaşça ama hareket halinde girdi. Bekleyen tekneler sıfırdan hızlanacak. D\'nin ise zaten biraz hızı var. Kayan Y kendi yerinden bir buçuk boy geride ve sıkışık.' },
      { t: 30.2, title: '7 saniye kala doldur', text: 'D yelkeni dolduruyor ve orsaya dönüyor. Sert rüzgarda Optimist çabuk hızlanır. Geç doldurursan geride kalırsın. Y de dolduruyor ama hattın çok gerisinden başlıyor.' },
      { t: 32, title: 'START: hakem botu ucundan', text: 'D hakem botunun yanından, avantajlı uçtan, temiz havada ve hızla çıkıyor. Erken park eden Y ise kaydığı için hattın bir buçuk boy gerisinde.' },
      { t: 36, title: 'Özet', text: 'Sert rüzgarda bayrağın dibine erken park etme. Orada duramazsın, kayarsın. Hakem botunun dışında, hat hizasında bekle. Son 30 40 saniyede açılan boşluğu önceden gör. Yavaşça gel ve boşluğa hızlı tekne olarak gir. Boşluk açılmazsa zorlama. 2 3 boy aşağıda temiz bir yer seç.' }
    ],
    addBoat: { pin: { x: 290, y: 580 }, middle: { x: 500, y: 580 }, committee: { x: 720, y: 610 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.8] }
  });

  // ---------- İA7: hatta yer tut, kayınca yüksel ----------
  S.push({
    id: 'ia7-hold-climb',
    category: 'İleri Taktik', topic: 'Start · Yer tutma',
    title: 'İA7 · Kaydıkça yüksel: iskota, ikili tramola, yerinde tramola',
    summary: 'Start\'ı beklerken rüzgar ve akıntı tekneyi aşağı ve rüzgaraltına kaydırır. Yeşil S iki grup teknenin arasında bekliyor ve rüzgaraltındaki gruba doğru kayıyor; oysa yeri rüzgarüstü grubun en alttaki teknesinin hemen rüzgaraltı. S kaybettiği yüksekliği dört yolla geri alır: iskotayı bir an çekip orsalamak, ikili tramola (tramola + tramola + hemen dur), durduğu yerde tramola ve burnu açıp doldurup orsalamak. Hepsinde ölçü aynı: hareket çabuk biter, tekne kendini öne atmaz. Turuncu H aynı hamleyi fazla hızla yapar, hattın üstüne fırlar.',
    duration: 40,
    baseSpeed: 40,
    clockScale: 4,
    windKn: 12,
    wind: 0,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 32,
    committeeLabel: 'upright',
    rungs: { boat: 'S', from: 32.5 },
    leeway: { from: 0, ramp: 2, rate: 0.5 },
    boats: [
      { id: 'S', name: 'Kaydıkça yükselen', role: 'dogru', color: '#2a9d8f',
        start: { x: 565, y: 482, h: 345 }, v0: 0,
        segs: [
          { mode: 'hold', h: 345, dur: 5.5, speed: 0.004, turn: 0, drift: 6, driftH: 235, note: 'Rüzgar ve akıntı aşağı kaydırıyor' },
          { mode: 'heading', h: 330, dur: 1.3, speed: 0.55, turn: 0.4, note: '1) İskotayı çek: bir an doldur' },
          { mode: 'hold', h: 355, dur: 5.2, speed: 0.004, turn: 0.7, drift: 6, driftH: 235, note: 'Orsala, dur: biraz yükseldi' },
          { mode: 'heading', h: 62, dur: 3.0, speed: 0.55, turn: 0.7, note: '2) Tramola: rüzgarüstüne, W\'ye doğru' },
          { mode: 'heading', h: 345, dur: 1.3, speed: 0.12, turn: 0.7, note: 'İkinci tramola, hemen dur' },
          { mode: 'hold', h: 345, dur: 3.3, speed: 0.004, turn: 0.4, drift: 3, note: 'W\'nin altında bekliyor' },
          { mode: 'heading', h: 25, dur: 1.4, speed: 0.12, turn: 0.9, note: '3) Durduğu yerde tramola' },
          { mode: 'hold', h: 345, dur: 3.6, speed: 0.004, turn: 1.1, drift: 3, note: 'Yerinde tramola: öne atılmadan' },
          { mode: 'heading', h: 330, dur: 1.0, speed: 0.6, turn: 0.4, note: '4) Burnu aç, doldur' },
          { mode: 'hold', h: 358, dur: 4.3, speed: 0.004, turn: 0.6, drift: 3, note: 'Orsala: hız tekneyi yukarı taşır' },
          { mode: 'closehauled', tack: 'starboard', dur: 10, turn: 0.8 }
        ] },
      { id: 'H', name: 'Fazla hızla, öne fırlayan', role: 'hata', color: '#e76f51',
        start: { x: 440, y: 480, h: 345 }, v0: 0,
        segs: [
          { mode: 'hold', h: 345, dur: 10.5, speed: 0.004, turn: 0, drift: 3, note: 'O da kayıyor' },
          { mode: 'heading', h: 45, dur: 2.0, speed: 1, turn: 0.6, note: 'Tramola: yelken tam dolu' },
          { mode: 'heading', h: 340, dur: 1.6, speed: 0.9, turn: 0.6, note: 'Çok hızlı: kendini öne attı!' },
          { mode: 'hold', h: 350, dur: 2.0, speed: 0.01, turn: 0.6, note: 'Burnu hatta: rüzgarüstü kapandı' },
          { mode: 'hold', h: 345, dur: 15.5, speed: 0.004, turn: 0.8, drift: 3, note: 'Önde, korumasız bekliyor' },
          { mode: 'closehauled', tack: 'starboard', dur: 8.4, turn: 0.8 }
        ] }
    ],
    // iki grup: rüzgaraltı (pin tarafı) ve rüzgarüstü (hakem botu tarafı); aradaki boşlukta S ve H
    crowdLife: { gap: 38 },
    crowd: [
      { slot: 0.10, drift: 0.3 }, { slot: 0.175, back: 6 }, { slot: 0.25, back: -4 }, { slot: 0.18, row: 1 },
      { slot: 0.62, id: 'W', name: 'Rüzgarüstü grubun en alttakisi' }, { slot: 0.695, back: 6 }, { slot: 0.77 }, { slot: 0.72, row: 1 },
      // hakem botunun dibi baştan boş: tekneler dışarıda bekler, filo kaydıkça açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 878, y: 462, h: 0, until: 21, speed: 0.45 } }, { slot: 0.835, back: 6, wait: { x: 858, y: 512, h: 345, until: 20, speed: 0.45 } }, { slot: 0.80, row: 1, wait: { x: 912, y: 505, h: 355, until: 22, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: iki grubun arasında', text: 'Rüzgar 12 knot. Akıntı da tekneleri aşağı itiyor. Yeşil S iki grubun arasında bekliyor. Gitmek istediği yer belli: sağdaki grubun en alttaki teknesi W\'nin hemen altı. Orada W\'nin altındaki boşluk S\'nin hızlanma yolu olur.' },
      { t: 2.5, title: 'Beklerken kayıyorsun', text: 'Yelken boşken rüzgar ve akıntı tekneyi aşağı ve pin tarafına iter. S yavaş yavaş soldaki gruba yaklaşıyor ve hattan uzaklaşıyor. Hiçbir şey yapmazsan 2 dakikada 2 3 boy kaybedersin.' },
      { t: 5.5, title: 'Birinci yol: iskotayı bir an çek', text: 'En küçük düzeltme şu: burnu biraz aç, iskotayı bir an çek. Tekne biraz ileri ve yukarı gider. Hemen orsala, yelkeni boşalt. Yükseldin ama hızlanmadın. Çok çekersen hızlanır ve hatta fırlarsın.' },
      { t: 8, title: 'Ama yine kayıyor', text: 'Bu düzeltme seni sadece yukarı taşır, yana taşımaz. S hâlâ soldaki gruba yakın. İstediği yer sağda, W\'nin altında. Yana gitmek için tramola gerekir.' },
      { t: 12, title: 'İkinci yol: iki tramola ve dur', text: 'S tramola atıp yukarı ve W\'ye doğru gidiyor. Hemen ikinci tramolayı atıp sancağa dönüyor, yelkeni boşaltıp duruyor. Hem yükseldi hem W\'ye yaklaştı. İskele kontradayken herkese yol verir. Bu yüzden hamle kısa olmalı ve kimsenin önünü kesmemeli.' },
      { t: 12.6, title: 'H: aynı hamle, fazla hız', text: 'Turuncu H de iki tramola atıyor ama yelkeni tam dolduruyor. Tekne hızlanıyor, duramıyor ve öne fırlıyor. Burnu hattın önüne çıkıyor. Son dakikada bu erken start riski demek.' },
      { t: 15.5, title: 'W\'nin altında yer', text: 'S artık W\'nin hemen altında, ona yakın. Altında soldaki gruba kadar boş su var. Ama rüzgar ve akıntı kaydırmaya devam ediyor. Yerini tutmak sürekli küçük düzeltme ister.' },
      { t: 20, title: 'Üçüncü yol: durduğun yerde tramola', text: 'Neredeyse duran tekne de tramola atabilir. Dümeni bas, burnu rüzgardan geçir. Yelken öbür tarafa geçince yine dur. Burun rüzgara girerken tekne biraz yukarı çıkar. Hareket çabuk bitsin ama tekne öne fırlamasın.' },
      { t: 25.2, title: 'Dördüncü yol: aç, doldur, orsala', text: 'Burnu biraz aç ve yelkeni doldur. Tekne biraz hız alsın. Sonra orsala ve burnu rüzgara ver. Hız tekneyi yukarı taşır ve tekne W\'nin hizasında yeniden durur. Kaydıysan ya da sıkıştıysan en çabuk yükselme yolu bu.' },
      { t: 29.9, title: '8 saniye kala doldur', text: 'S, W\'nin hemen altında, hat hizasında. Altındaki boşluğa biraz düşüp dolduruyor ve hızlanıyor.' },
      { t: 32, title: 'START', text: 'S, W ile yan yana, temiz havada ve tam hızda çıkıyor. H öne fırladığı için uzun süre korumasız kaldı. Komşuları onun yukarısında, hızlanma yolu kısa.' },
      { t: 36, title: 'Özet', text: 'Beklerken kayarsın. Dört çaren var. İskotayı bir an çek. İki tramola at. Durduğun yerde tramola at. Ya da burnu açıp doldur ve orsala. Her birinde hareket çabuk bitsin, tekne öne fırlamasın. Senin yerin yukarıdaki teknenin hemen altı.' }
    ],
    expectFaults: [],
    addBoat: { pin: { x: 290, y: 600 }, middle: { x: 500, y: 600 }, committee: { x: 720, y: 600 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- İA8: pin avantajlı, pin'de karmaşa ----------
  S.push({
    id: 'ia8-pin-chaos',
    category: 'İleri Taktik', topic: 'Start · Pin',
    title: 'İA8 · Pin\'de karmaşa: layline\'ın üstünde kal, altında kalırsan çık',
    summary: 'Rüzgar 15° sola dönmüş, pin çok avantajlı ve filonun yarısı pin\'e yığılıyor. Yeşil P erken gelir, pin layline\'ının ÜSTÜNDE, pin\'in yarım boy içinde yerini alır ve pin\'den çıkar. Turuncu L kalabalıkta aşağı itilir, layline\'ın ALTINDA kalır: sinyalde pin\'i dönemez, tramola atıp herkese yol vermek zorunda kalır (Kural 13, 10). Mor Y geç gelir, ön sıra dolmuştur: ikinci sırada, pis rüzgarda çıkar.',
    duration: 38,
    baseSpeed: 40,
    clockScale: 4,
    wind: 345,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 30,
    committeeLabel: 'upright',
    rungs: { boat: 'P', from: 30.5 },
    laylines: [{ x: 200, y: 440, tack: 'starboard', len: 330, from: 0, to: 31, label: 'Pin layline\'ı: bunun ALTINDA pin dönülmez' }],
    boats: [
      { id: 'P', name: 'Layline üstünde, pin\'den', role: 'dogru', color: '#2a9d8f',
        start: { x: 410, y: 572, h: 300 }, v0: 25,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 5.4, turn: 0, speed: 0.75, note: 'Erken: layline üstünden pin\'e' },
          { mode: 'hold', h: 335, dur: 23.2, speed: 0.006, turn: 1.2, note: 'Pin\'in yarım boy içinde: yer benim' },
          { mode: 'closehauled', tack: 'starboard', dur: 9.4, turn: 0.8 }
        ] },
      { id: 'L', name: 'Layline altında kalan', role: 'hata', color: '#e76f51',
        start: { x: 268, y: 522, h: 335 }, v0: 0,
        segs: [
          { mode: 'hold', h: 335, dur: 14, speed: 0.006, turn: 0, drift: 1, note: 'Kalabalıkta aşağı itildi' },
          { mode: 'hold', h: 335, dur: 12, speed: 0.006, turn: 0, drift: 1, note: 'Layline\'ın ALTINDA' },
          { mode: 'closehauled', tack: 'starboard', dur: 1.8, turn: 0.8, note: 'Pin\'i dönemiyor!' },
          { mode: 'heading', h: 40, dur: 1.3, turn: 0.8, speed: 0.6, note: 'Tramola: herkese yol ver (K13)' },
          { mode: 'heading', h: 105, dur: 3.6, turn: 1.0, speed: 0.8, note: 'İskele kontra: herkesin arkasından (K10)' },
          { mode: 'closehauled', tack: 'port', dur: 4.3, turn: 1.0 }
        ] },
      { id: 'Y', name: 'Geç gelen, ikinci sırada', role: 'hata', color: '#c77dff',
        start: { x: 700, y: 610, h: 270 }, v0: 10,
        segs: [
          { mode: 'hold', h: 270, dur: 13, speed: 0.05, turn: 0, note: '"Pin\'e son dakika girerim"' },
          { mode: 'heading', h: 290, dur: 6.5, turn: 1.0, speed: 0.75, note: 'Geç: pin\'e doğru' },
          { mode: 'hold', h: 335, dur: 9, speed: 0.01, turn: 1.0, note: 'Ön sıra dolu: ikinci sırada' },
          { mode: 'closehauled', tack: 'starboard', dur: 9.5, turn: 0.8, note: 'Pis rüzgarda' }
        ] }
    ],
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.19, drift: 0.3 }, { slot: 0.28, back: 6 }, { slot: 0.37, back: -4 }, { slot: 0.46, back: 8 }, { slot: 0.55 }, { slot: 0.24, row: 1 }, { slot: 0.42, row: 1 },
      { slot: 0.68, back: 4 },
      // hakem botunun dibi baştan boş: tekneler dışarıda bekler, filo kaydıkça açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 878, y: 462, h: 0, until: 21, speed: 0.45 } }, { slot: 0.835, back: 6, wait: { x: 858, y: 512, h: 345, until: 20, speed: 0.45 } }, { slot: 0.80, row: 1, wait: { x: 912, y: 505, h: 355, until: 22, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: pin çok avantajlı', text: 'Rüzgar sola dönmüş. Pin ucu neredeyse 3 boy önde. Herkes pin\'den çıkmak istiyor. Filonun yarısı pin\'e toplanıyor. Mavi kesikli çizgi pin\'in layline\'ı. Bu çizginin üstündeysen pin\'e yetişirsin.' },
      { t: 2, title: 'P erken ve layline\'ın üstünden geliyor', text: 'Yeşil P 2 dakika kala sancak kontrada, layline\'ın üstünden pin\'e geliyor. Aşağıdan gelen teknenin hakkı vardır. Bekleyenler ona yer açar. Bu Kural 11.' },
      { t: 6, title: 'Pin\'e yakın dur ama değme', text: 'P pin\'e değmeden, pin\'in yarım boy içinde ve layline\'ın üstünde duruyor. Pin\'e değersen bir tur ceza atarsın. Pin\'in dışında da bekleyebilirsin ama start\'ta içeri girmek zorundasın.' },
      { t: 10, title: 'L kalabalıkta aşağı itildi', text: 'Turuncu L, P\'nin hemen arkasında bekliyor. Önünde P, yukarısında filo var. Yer açılmadıkça kayıyor. Şimdi layline\'ın altında kaldı.' },
      { t: 13, title: 'Y geç geliyor', text: 'Mor Y son dakika girerim diye dışarıda bekledi. Şimdi geliyor ama ön sıra dolu.' },
      { t: 16, title: 'Layline\'ın altındaysan', text: 'Layline\'ın altındaki tekne orsa gitse de pin\'e yetişemez. Burnu pin\'in soluna düşer. Ya erken tramola atıp çıkar ya da start\'ta herkesin arkasından dolaşır. Son anda orsalayıp pin\'i dönmeye çalışırsan pin\'e çarpabilirsin.' },
      { t: 21, title: 'Y ikinci sırada', text: 'Y ön sıradakilerin hemen arkasında kaldı. Pis havada ve hızlanacak yeri yok. Arkadaki tekne öndekine yol verir. Bu Kural 12.' },
      { t: 26, title: 'L yetişemeyecek', text: 'L yelkenini doldurup pin\'e gidiyor. Ama layline\'ın altında, pin\'in soluna düşecek. Pin\'in dışından geçmek start sayılmaz.' },
      { t: 27.8, title: 'L tramola atıyor', text: 'L tramola atıyor. Tramola atarken ve iskele kontradayken herkese yol verir. Herkesin arkasından dolaşacak. 30 40 saniye kaybedecek.' },
      { t: 28.6, title: '6 saniye kala doldur', text: 'P burnunu düşürüp yelkeni dolduruyor. Layline\'ın üstünde olduğu için pin\'i rahat geçecek.' },
      { t: 30, title: 'START: P pin\'den çıkıyor', text: 'P pin\'in hemen yanından, avantajlı uçtan, temiz havada çıkıyor. Y ikinci sırada, pis havada. L herkesin arkasında.' },
      { t: 35, title: 'Özet', text: 'Pin avantajlıysa erken gel. Layline\'ın üstünde kal. Pin\'in yarım boy içinde dur, pin\'e değme. Layline\'ın altına düştüysen erken çık, inat etme. Geç kalırsan ön sıra dolar.' }
    ],
    addBoat: { pin: { x: 290, y: 600 }, middle: { x: 500, y: 600 }, committee: { x: 720, y: 600 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- İA9: bekleme teknikleri: orsala, yelkeni ters bas, geri git ----------
  S.push({
    id: 'ia9-brake-back',
    category: 'İleri Taktik', topic: 'Start · Yer tutma',
    title: 'İA9 · Fren yap: orsala, yelkeni ters bas, geri git',
    summary: 'Seçtiğin boşluğa hızla geldin ve hat çok yakın: nasıl durursun? Yeşil B önce orsalayıp hızını keser, yetmeyince bumbayı rüzgara doğru itip yelkeni ters basar (backing) ve tekneyi bir boy geri götürür; sonra yelken boş, burun rüzgarda bekler. Geri giden tekne herkese yol verir (Kural 22.3): arkasına bakarak, kısa ve kontrollü. Turuncu E aynı hızla gelir ama yalnızca orsalar: tekne süzülür, hattın üstüne çıkar ve geri dönmek için dolaşırken yerini kaybeder.',
    duration: 40,
    baseSpeed: 40,
    clockScale: 4,
    wind: 0,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 32,
    committeeLabel: 'upright',
    rungs: { boat: 'B', from: 32.5 },
    expectEarly: ['E'],
    boats: [
      { id: 'B', name: 'Orsala, ters bas, geri git', role: 'dogru', color: '#2a9d8f',
        start: { x: 735, y: 650, h: 315 }, v0: 34,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 5.6, turn: 0, note: 'Boşluğa hızla geliyor' },
          { mode: 'hold', h: 0, dur: 2.0, speed: 0.004, turn: 0.6, note: '1) Orsala: hızını kes' },
          { mode: 'back', h: 0, dur: 1.9, speed: 0.35, turn: 0, note: '2) Yelkeni ters bas: geri git (K22.3)' },
          { mode: 'hold', h: 352, dur: 4.7, speed: 0.004, turn: 0.6, note: '3) Yelken boş, burun rüzgarda' },
          { mode: 'back', h: 352, dur: 0.8, speed: 0.15, turn: 0, note: 'Kısa ters basış: yerini koru' },
          { mode: 'hold', h: 345, dur: 13.8, speed: 0.004, turn: 0.6, note: 'Hat yarım boy önde, altı boş' },
          { mode: 'closehauled', tack: 'starboard', dur: 11.0, turn: 0.8 }
        ] },
      { id: 'E', name: 'Fren yok: hattı geçen', role: 'hata', color: '#e76f51',
        start: { x: 575, y: 640, h: 315 }, v0: 34,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 5.8, turn: 0, note: 'O da hızla geliyor' },
          { mode: 'hold', h: 0, dur: 3.4, speed: 0.004, turn: 0.6, note: 'Yalnızca orsaladı: süzülüyor' },
          { mode: 'hold', h: 0, dur: 1.2, speed: 0.004, turn: 0, note: 'Hattın üstüne çıktı!' },
          { mode: 'heading', h: 250, dur: 1.4, turn: 0.8, speed: 0.6, note: 'Geri dönmek için dolaşıyor' },
          { mode: 'heading', h: 175, dur: 3.2, turn: 0.9, speed: 0.6, note: 'Geri dönmek için dolaşıyor' },
          { mode: 'heading', h: 60, dur: 1.0, turn: 1.0, speed: 0.6, note: 'Tramola, yeniden geliyor' },
          { mode: 'hold', h: 345, dur: 14.2, speed: 0.01, turn: 1.0, note: 'Yerini kaybetti: geride' },
          { mode: 'closehauled', tack: 'starboard', dur: 9.8, turn: 0.8, note: 'Kirli havada' }
        ] }
    ],
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.06, drift: 0 }, { slot: 0.145, drift: 0.1 }, { slot: 0.21, back: -4 }, { slot: 0.39, back: 6 }, { slot: 0.465 }, { slot: 0.69, back: 6 }, { slot: 0.765, back: -4 },
      { slot: 0.10, row: 1, drift: 0.2 },
      // hakem botunun dibi baştan boş: tekneler dışarıda bekler, filo kaydıkça açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 878, y: 462, h: 0, until: 21, speed: 0.45 } }, { slot: 0.835, back: 6, wait: { x: 858, y: 512, h: 345, until: 20, speed: 0.45 } }, { slot: 0.80, row: 1, wait: { x: 912, y: 505, h: 355, until: 22, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: hızlı geliyorsun', text: 'Yeşil B hattın ortasındaki boşluğu seçmiş, tam hızla geliyor. Hat çok yakın. Bir şey yapmazsa hattın önüne çıkar. Turuncu E de aynı durumda.' },
      { t: 5.6, title: 'Birinci adım: orsala', text: 'B burnunu rüzgara veriyor. Yelken boşalıyor, tekne yavaşlıyor. Ama Optimist hemen durmaz, bir süre daha kayar. Sadece orsalamak çoğu zaman yetmez.' },
      { t: 7.6, title: 'İkinci adım: yelkeni ters bas', text: 'B bumbayı rüzgara doğru itiyor. Yelken ters taraftan dolar ve tekneyi geri iter. Geri giderken dümen ters çalışır. B bir boy geri gidiyor.' },
      { t: 8.5, title: 'Geri giden tekne yol verir', text: 'Yelkenini ters basıp geri giden tekne herkese yol verir. Bu Kural 22. B geri gitmeden önce arkasına bakıyor. Arkası boş. Arkanda biri varsa az git. Ona çarparsan suç senin.' },
      { t: 9.2, title: 'E sadece orsaladı', text: 'Turuncu E de orsaladı ama yelkeni ters basmadı. Tekne kaymaya devam ediyor ve burnu hattın önüne çıkıyor. Henüz son dakika değil, ceza yok. Ama geri dönmek için dolaşması gerekiyor.' },
      { t: 9.5, title: 'Üçüncü adım: yelken boş bekle', text: 'B duruyor. Yelken boş, burun rüzgarda, hat yarım boy önde. Gerekirse yelkeni bir an ters basıp yerinde kalıyor. İskotayı çekmek yükseltir, ters basmak geri götürür. İkisiyle tekneyi istediğin yerde tutarsın.' },
      { t: 11.2, title: 'E dolaşırken yerini kaybediyor', text: 'Hattın önündeki tekne geri dönmek için dolaşmak zorunda. Bu 20 25 saniye sürer. E yerine döndüğünde komşularından geride kalıyor.' },
      { t: 28.8, title: '13 saniye kala doldur', text: 'B burnunu düşürüp yelkeni dolduruyor. Hat yarım boy önde ve altı boş. Hızlanıp hattı tam hızla geçecek.' },
      { t: 32, title: 'START', text: 'B boşluğundan hızla ve temiz havada çıkıyor. E komşularının gerisinden, onların pis havasında çıkıyor.' },
      { t: 36, title: 'Özet', text: 'Fren yapmak için orsala, yelkeni ters bas, sonra yelken boş bekle. Geri giderken arkana bak. Geri giden tekne yol verir. Sadece orsalamak yetmez. Tekne kayar ve hattın önüne çıkarsın.' }
    ],
    addBoat: { pin: { x: 290, y: 600 }, middle: { x: 500, y: 600 }, committee: { x: 720, y: 600 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- İA10: boşluğunu savun ----------
  S.push({
    id: 'ia10-defend-gap',
    category: 'İleri Taktik', topic: 'Start · Yer tutma',
    title: 'İA10 · Boşluğunu savun: rüzgaraltını kapat, kimse sokulmasın',
    summary: 'Yer tutmanın ikinci yarısı: hızlanma boşluğunu korumak. Yeşil S, rüzgarüstü komşusu W\'nin hemen altına yerleşmiştir; rüzgaraltında bir tekne sığacak boşluk var. Geç gelen G bu boşluğa sokulmak ister; S burnunu hafif düşürüp yelken boş yanlamasına rüzgaraltına kayar ve boşluğu kapatır: G yer bulamaz, arkadan dolaşır. Turuncu H ise boşluğunun ortasında bekler; geç gelen K onun rüzgaraltına sokulur ve H iki teknenin arasında, hızlanacak yeri olmadan kalır.',
    duration: 40,
    baseSpeed: 40,
    clockScale: 4,
    wind: 0,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 32,
    committeeLabel: 'upright',
    rungs: { boat: 'S', from: 32.5 },
    boats: [
      { id: 'S', name: 'Boşluğunu savunan', role: 'dogru', color: '#2a9d8f',
        start: { x: 590, y: 480, h: 345 }, v0: 0,
        segs: [
          { mode: 'hold', h: 345, dur: 17, speed: 0.004, turn: 0, note: 'W\'nin altında, rüzgaraltı boş' },
          { mode: 'hold', h: 325, dur: 3.2, speed: 0.004, turn: 0.8, drift: 7, driftH: 265, note: 'Burnu düşür, yanlamasına kay' },
          { mode: 'hold', h: 345, dur: 9.4, speed: 0.004, turn: 0.8, note: 'Boşluk benim: kimse sığmaz' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.4, turn: 0.8 }
        ] },
      { id: 'G', name: 'Sokulmak isteyen, yer bulamayan', role: 'hata', color: '#c77dff',
        start: { x: 650, y: 628, h: 315 }, v0: 0,
        segs: [
          { mode: 'hold', h: 330, dur: 14, speed: 0.02, turn: 0, note: '"Son dakika sokulurum"' },
          { mode: 'closehauled', tack: 'starboard', dur: 5.2, turn: 0.8, speed: 0.7, note: 'S\'nin rüzgaraltına sokulmak istiyor' },
          { mode: 'hold', h: 330, dur: 2.0, speed: 0.02, turn: 0.8, note: 'Yer yok!' },
          { mode: 'heading', h: 215, dur: 1.8, turn: 1.0, speed: 0.4, note: 'Arkadan dolaşıyor' },
          { mode: 'hold', h: 345, dur: 7.8, speed: 0.01, turn: 1.0, note: 'İkinci sırada' },
          { mode: 'closehauled', tack: 'starboard', dur: 9.2, turn: 0.8, note: 'Kirli havada' }
        ] },
      { id: 'H', name: 'Boşluğun ortasında bekleyen', role: 'hata', color: '#e76f51',
        start: { x: 422, y: 478, h: 345 }, v0: 0,
        segs: [
          { mode: 'hold', h: 345, dur: 29.6, speed: 0.004, turn: 0, note: 'Boşluğun ortasında' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.4, turn: 0.8, speed: 0.85, note: 'Altı dolu: hızlanamıyor' }
        ] },
      { id: 'K', name: 'Geç gelip sokulan', color: '#8d99ae',
        start: { x: 485, y: 592, h: 315 }, v0: 0,
        segs: [
          { mode: 'hold', h: 330, dur: 14.5, speed: 0.02, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 5.4, turn: 0.8, speed: 0.7, note: 'H\'nin rüzgaraltına sokuluyor' },
          { mode: 'hold', h: 345, dur: 9.7, speed: 0.004, turn: 0.9, note: 'H\'nin altında' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.4, turn: 0.8 }
        ] }
    ],
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.05, drift: 0 }, { slot: 0.115, drift: 0.2 }, { slot: 0.175, drift: 0.3 }, { slot: 0.43, drift: 0 }, { slot: 0.495 },
      { slot: 0.67, drift: 0, id: 'W', name: 'S\'nin rüzgarüstü komşusu' }, { slot: 0.745, back: 6 },
      { slot: 0.12, row: 1, drift: 0.2 },
      // hakem botunun dibi baştan boş: tekneler dışarıda bekler, filo kaydıkça açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 878, y: 462, h: 0, until: 21, speed: 0.45 } }, { slot: 0.835, back: 6, wait: { x: 858, y: 512, h: 345, until: 20, speed: 0.45 } }, { slot: 0.80, row: 1, wait: { x: 912, y: 505, h: 355, until: 22, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: yerini koru', text: 'Yeşil S erken geldi ve yukarıdaki komşusu W\'nin hemen altına yerleşti. Altında bir tekne sığacak boş su var. Bu S\'nin hızlanma yolu. Turuncu H de yerini almış ama boşluğunun tam ortasında duruyor.' },
      { t: 6, title: 'Boşluğu herkes görüyor', text: 'Son dakikaya doğru geç kalan tekneler boşluk arar. Altında boş su gören oraya sokulur. Sokulan tekne aşağıda olduğu için hakkı olur. Yani boşluğu kaptırırsan geri alamazsın.' },
      { t: 14, title: 'G ve K geliyor', text: 'Geç kalan iki tekne geliyor: mor G ve gri K. G, S\'nin altındaki boşluğa bakıyor. K ise H\'nin altındaki boşluğa. Arkadan gelen tekne, yan yana gelene kadar öndekine yol verir. Bu Kural 12.' },
      { t: 17, title: 'S boşluğu kapatıyor', text: 'S burnunu biraz düşürüyor, yelkeni boş bırakıyor. Tekne yana doğru, aşağı kayıyor. Hızlanmıyor, öne gitmiyor. Sadece boşluğu kapatıyor. Artık G\'ye yer yok.' },
      { t: 20.2, title: 'G yer bulamadı', text: 'G boşluğa geldiğinde yer yok. Zorlarsa birine çarpar. Arkadan gelen olarak yol vermek onun işi. G bordalayıp arkadan dolaşıyor. İkinci sırada kalacak.' },
      { t: 21, title: 'K, H\'nin altına girdi', text: 'H boşluğun ortasındaydı. İki yanında da boş yer vardı. K alttaki yere girdi. Şimdi H iki teknenin arasında sıkıştı. Start\'ta hızlanacak yeri yok.' },
      { t: 29.6, title: '10 saniye kala doldur', text: 'S altındaki boşluğu korudu. Şimdi oraya düşüp dolduruyor ve hızlanıyor.' },
      { t: 32, title: 'START', text: 'S temiz havada, tam hızda. H, K\'nin üstünde ve yavaş. K hızlanınca H\'nin önü kapanıyor. G ikinci sırada.' },
      { t: 36, title: 'Özet', text: 'Yerini aldıktan sonra altındaki boşluğa sahip çık. Biri bakıyorsa burnunu biraz düşür, yelken boş yana kay, boşluğu daralt. Boşluğun ortasında beklersen yarısını kaptırırsın. Üstündeki boşluğu kapatmak için de yukarıdaki komşuna yakın dur.' }
    ],
    addBoat: { pin: { x: 290, y: 600 }, middle: { x: 500, y: 600 }, committee: { x: 720, y: 600 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- İA11: B planı: seçtiğin boşluk dolarsa ----------
  S.push({
    id: 'ia11-plan-b',
    category: 'İleri Taktik', topic: 'Start · Orta',
    title: 'İA11 · B planı: seçtiğin boşluk dolarsa yoldaki ikinci boşluğa gir',
    summary: 'S12\'nin devamı: S 2 dk kala hatta bakar, avantajlı hakem botu tarafındaki geniş boşluğu (A planı) seçer ve yoldaki orta boşluğu da aklına yazar (B planı). Filonun altından giderken gri F hakem botu tarafından gelip A boşluğunu doldurur. S bunu görünce hemen yanındaki B boşluğuna girer ve rahat start eder. Turuncu D aynı A planındadır ama B planı yoktur: dolan boşluğa gitmeye devam eder, F\'nin arkasında, ikinci sırada kalır.',
    duration: 40,
    baseSpeed: 40,
    clockScale: 4,
    wind: 5,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 32,
    committeeLabel: 'upright',
    rungs: { boat: 'S', from: 32.5 },
    sightline: { from: 0, to: 5, label: 'Transit: 2 dk kala hatta bak, iki boşluk seç' },
    gaps: { from: 2, to: 29, items: [
      { a: 4, b: 5, label: 'B planı', color: '#fbbf24' },
      { a: 6, b: 7, label: 'A planı · avantajlı', color: '#34d399' }
    ] },
    boats: [
      { id: 'S', name: 'A planı + B planı', role: 'dogru', color: '#2a9d8f',
        start: { x: 88, y: 452, h: 90 }, v0: 2,
        segs: [
          { mode: 'hold', h: 90, dur: 4, speed: 0.04, turn: 0, note: 'İki boşluk seçti: A ve B' },
          { mode: 'heading', h: 160, dur: 3.2, turn: 0.8, note: 'Hattın altına iniyor' },
          { mode: 'heading', h: 90, dur: 7.2, turn: 1.0, note: 'Apaz: A planına doğru' },
          { mode: 'heading', h: 40, dur: 2.0, turn: 0.8, speed: 1, note: 'A doldu! B planına gir' },
          { mode: 'hold', h: 350, dur: 13.4, speed: 0.004, turn: 1.0, note: 'B boşluğunda, komşunun altında' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.2, turn: 0.8 }
        ] },
      { id: 'D', name: 'Yalnızca A planı', role: 'hata', color: '#e76f51',
        start: { x: 70, y: 585, h: 90 }, v0: 2,
        segs: [
          { mode: 'hold', h: 90, dur: 6, speed: 0.04, turn: 0 },
          { mode: 'heading', h: 92, dur: 12.4, turn: 1.0, note: 'Apaz: yalnızca A planı' },
          { mode: 'heading', h: 40, dur: 1.4, turn: 0.8, speed: 0.7, note: 'A dolu! B planı yok' },
          { mode: 'hold', h: 350, dur: 10.8, speed: 0.01, turn: 1.0, note: 'F\'nin arkasında, ikinci sırada' },
          { mode: 'closehauled', tack: 'starboard', dur: 9.4, turn: 0.8, note: 'Kirli havada' }
        ] },
      { id: 'F', name: 'A boşluğunu dolduran', color: '#8d99ae',
        start: { x: 735, y: 612, h: 320 }, v0: 0,
        segs: [
          { mode: 'hold', h: 330, dur: 9, speed: 0.02, turn: 0 },
          { mode: 'closehauled', tack: 'starboard', dur: 5.0, turn: 0.8, speed: 0.8, note: 'A boşluğuna giriyor' },
          { mode: 'hold', h: 350, dur: 15.6, speed: 0.004, turn: 1.0 },
          { mode: 'closehauled', tack: 'starboard', dur: 10.4, turn: 0.8 }
        ] }
    ],
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.06, drift: 0.2 }, { slot: 0.13, back: 6, drift: 0.5 }, { slot: 0.20, back: -4 }, { slot: 0.27, back: 6 }, { slot: 0.34 },
      { slot: 0.52, drift: 0 }, { slot: 0.59, drift: 0 }, { slot: 0.80 },
      // hakem botunun dibi baştan boş: tekne dışarıda bekler, açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 878, y: 462, h: 5, until: 21, speed: 0.45 } },
      { slot: 0.16, row: 1, drift: 0.3 }, { slot: 0.86, row: 1, wait: { x: 912, y: 505, h: 0, until: 22, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: iki boşluk seç', text: 'Hakem botu ucu biraz avantajlı. S hattın uzantısından bakıyor ve iki boşluk seçiyor. Biri avantajlı taraftaki geniş boşluk. Bu A planı, yeşil. Öbürü yolda kalan orta boşluk. Bu B planı, sarı.' },
      { t: 4, title: 'Filonun altından A planına', text: 'S hattın altına inip apaz ile A planına gidiyor. Yolda B boşluğunun altından geçecek. Gözü hem A\'da hem B\'de.' },
      { t: 9, title: 'F geliyor', text: 'Gri F hakem botu tarafından A boşluğuna doğru geliyor. A boşluğu ona daha yakın. F oraya S\'den önce varacak.' },
      { t: 14.5, title: 'A doldu: B planı', text: 'S, F\'nin A boşluğuna girdiğini görüyor. Tam B\'nin altında. Hemen orsalayıp B\'ye giriyor ve yukarıdaki komşusunun altına yerleşiyor. Hızlı karar vermek önemli. Biraz daha gitseydi B\'yi de kaçırırdı.' },
      { t: 17.5, title: 'D\'nin B planı yok', text: 'Turuncu D de A planına gidiyordu. Ama yedek planı yok. A\'nın dolduğunu görse de oraya gitmeye devam ediyor.' },
      { t: 22, title: 'D ikinci sırada', text: 'D A boşluğuna vardığında F yerleşmiş. Girecek yer yok. F\'nin hemen arkasında, ikinci sırada kalıyor. Arkadaki tekne öndekine yol verir. Bu Kural 12.' },
      { t: 29.8, title: '9 saniye kala doldur', text: 'S, B boşluğunda. Altındaki boş suya biraz düşüp dolduruyor ve hızlanıyor.' },
      { t: 32, title: 'START', text: 'S hattın ortasından, temiz havada ve tam hızda çıkıyor. A ucu biraz avantajlıydı. Ama temiz bir start, ikinci sırada pis havada olmaktan çok daha iyidir. D, F\'nin pis havasında.' },
      { t: 36, title: 'Özet', text: 'Her zaman iki boşluk seç. En iyisi A, yolda kalanı B. A dolarsa ya da rüzgar dönerse hemen B\'ye geç. Yedek planı olmayan, dolu boşluğa inatla gider ve arkada kalır.' }
    ],
    addBoat: { pin: { x: 290, y: 600 }, middle: { x: 500, y: 600 }, committee: { x: 720, y: 600 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- İA12: son saniyede iskele kontradan boşluğa tramola ----------
  S.push({
    id: 'ia12-late-port-tack',
    category: 'İleri Taktik', topic: 'Start · Orta',
    title: 'İA12 · Son saniyede iskele kontradan tramola: boşluk yeterli mi?',
    summary: 'Son 30-40 saniyede filonun altından iskele kontrada gelip bir boşluğa tramola atmak hızlı ve etkili bir start olabilir; ama boşluk tramolayı bitirip hızlanacak kadar geniş olmalı. Yeşil X geniş boşluğu seçer, tramolasını komşularından 1,5 boy uzakta bitirir ve hızlanarak çıkar. Turuncu P dar boşluğa, bir sancak teknenin dibine tramola atar: tramola atarken yol vermesi gerekir (Kural 13), sancağa geçince de karşı tarafa kaçınma yeri vermelidir (Kural 15). Sancak tekne kaçmak zorunda kalır, P protesto edilir ve iki tur ceza döner.',
    duration: 42,
    baseSpeed: 40,
    clockScale: 4,
    wind: 0,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 32,
    committeeLabel: 'upright',
    rungs: { boat: 'X', from: 32.5 },
    gaps: { from: 14, to: 29.5, items: [
      { a: 3, b: 4, label: 'Geniş: tramola + hızlanma yeri', color: '#34d399' },
      { a: 6, b: 7, label: 'Dar', color: '#f87171' }
    ] },
    boats: [
      { id: 'X', name: 'Geniş boşluğa tramola', role: 'dogru', color: '#2a9d8f',
        start: { x: 100, y: 545, h: 90 }, v0: 2,
        segs: [
          { mode: 'hold', h: 90, dur: 14.6, speed: 0.03, turn: 0, note: 'İskele kontrada, filonun altında' },
          { mode: 'heading', h: 92, dur: 8.6, turn: 1.0, speed: 0.8, note: 'Son 70 sn: filonun altından' },
          { mode: 'heading', h: 40, dur: 2.2, turn: 0.8, speed: 0.8, note: 'Geniş boşluğa yöneliyor' },
          { mode: 'heading', h: 340, dur: 2.0, turn: 1.0, speed: 0.25, note: 'Tramola: komşulardan 1,5 boy uzakta' },
          { mode: 'hold', h: 345, dur: 2.4, speed: 0.01, turn: 0.6, note: 'Tramola bitti, yer benim' },
          { mode: 'closehauled', tack: 'starboard', dur: 14.2, turn: 0.8 }
        ] },
      { id: 'P', name: 'Dar boşluğa, dibine tramola', role: 'hata', color: '#e76f51',
        start: { x: 222, y: 580, h: 90 }, v0: 2,
        segs: [
          { mode: 'hold', h: 90, dur: 17, speed: 0.03, turn: 0 },
          { mode: 'heading', h: 90, dur: 8.2, turn: 1.0, speed: 0.85, note: 'Son 60 sn: filonun altından' },
          { mode: 'heading', h: 50, dur: 3.3, turn: 0.8, speed: 0.85, note: 'Dar boşluğa' },
          { mode: 'heading', h: 330, dur: 1.4, turn: 0.8, speed: 0.5, note: 'HATA: sancak teknenin dibine tramola (K13, K15)' },
          { mode: 'hold', h: 335, dur: 1.6, turn: 0.6, speed: 0.04, note: 'Protesto!' },
          { mode: 'heading', h: 90, dur: 0.9, turn: 0.9, speed: 0.4, note: 'İki tur ceza (720°)' },
          { mode: 'heading', h: 180, dur: 0.9, turn: 0.9, speed: 0.4, note: 'İki tur ceza (720°)' },
          { mode: 'heading', h: 270, dur: 0.9, turn: 0.9, speed: 0.4, note: 'İki tur ceza (720°)' },
          { mode: 'heading', h: 360, dur: 0.9, turn: 0.9, speed: 0.4, note: 'İki tur ceza (720°)' },
          { mode: 'heading', h: 450, dur: 0.9, turn: 0.9, speed: 0.4, note: 'İki tur ceza (720°)' },
          { mode: 'heading', h: 540, dur: 0.9, turn: 0.9, speed: 0.4, note: 'İki tur ceza (720°)' },
          { mode: 'heading', h: 630, dur: 0.9, turn: 0.9, speed: 0.4, note: 'İki tur ceza (720°)' },
          { mode: 'closehauled', tack: 'starboard', dur: 3.0, turn: 0.9, note: 'Herkesin arkasında' }
        ] }
    ],
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.06, drift: 0.2 }, { slot: 0.13, back: 6, drift: 0.5 }, { slot: 0.20, back: -4 }, { slot: 0.27, back: 6 }, { slot: 0.48 }, { slot: 0.55, back: 6 }, { slot: 0.62, drift: 0 },
      { slot: 0.725, drift: 0 }, { slot: 0.785, back: -4 },
      // hakem botunun dibi baştan boş: tekneler dışarıda bekler, filo kaydıkça açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 878, y: 462, h: 0, until: 21, speed: 0.45 } }, { slot: 0.86, row: 1, wait: { x: 912, y: 505, h: 355, until: 22, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Start\'a 2 dakika: filo hattın dibinde', text: 'Filo hattın dibinde bekliyor. İki boşluk var. Ortada geniş bir boşluk, yeşil. Hakem botu tarafında dar bir boşluk, kırmızı. Yeşil X ve turuncu P kalabalığın dışında, iskele kontrada bekliyor.' },
      { t: 6, title: 'Neden iskele kontradan gelinir?', text: 'İskele kontrada filonun altından gelen tekne bütün boşlukları görür ve en iyisini seçer. Boşluğun altında tramola atar ve hemen hızlanır. Ama iskele kontrada herkese yol verir. Tramola atarken de herkese yol verir.' },
      { t: 14.6, title: 'Son 70 saniye: X geliyor', text: 'X filonun altından apaz ile geliyor. Hedefi geniş boşluk. Komşularıyla arasında 2 boydan fazla boş su var.' },
      { t: 23.1, title: 'Boşluk yeterli mi?', text: 'Kural şu: boşluk en az 3 boy olmalı. Bir boy tramola için. Bir boy yukarıdaki komşudan uzak durmak için. Bir boy da altında hızlanmak için.' },
      { t: 25.2, title: 'P dar boşluğa gidiyor', text: 'Turuncu P daha geç geldi ve dar boşluğa yöneldi. Boşluk bir tekneden biraz geniş.' },
      { t: 25.4, title: 'X tramola atıyor', text: 'X boşluğun ortasında, komşularından uzakta tramola atıyor ve sancağa geçiyor. Kimse kaçmak zorunda kalmıyor. Bir an bekleyip sonra hızlanacak.' },
      { t: 28.5, title: 'P çok yakına tramola atıyor', text: 'P tramolayı yukarıdaki teknenin hemen altında atıyor. Tramola atarken herkese yol vermeliydi. Sancağa geçince de karşısındakine kaçacak yer bırakmalıydı. Yanındaki tekneler hızlanamıyor. P\'ye çarpmamak için beklemek zorunda kalıyorlar. Bu kural ihlali.' },
      { t: 29.9, title: 'Protesto ve iki tur ceza', text: 'Sancak tekne protesto diye bağırıyor. P iki tur ceza atmalı. Yani iki tramola ve iki kavança. P ceza turunu atıyor. Start\'ta herkesin arkasında kalacak.' },
      { t: 32, title: 'START', text: 'X geniş boşluktan, hızla ve temiz havada çıkıyor. P ceza turlarını atıyor.' },
      { t: 38, title: 'Özet', text: 'Son saniyede iskele kontradan gelip tramola atacaksan boşluk en az 3 boy olsun. Tramolayı komşularından uzakta bitir. Kimseyi kaçmaya zorlama. Dar boşluğa, birinin dibine atılan tramola ceza turuyla biter.' }
    ],
    addBoat: { pin: { x: 290, y: 600 }, middle: { x: 500, y: 600 }, committee: { x: 720, y: 600 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // ---------- İA13: genel geri çağırmadan sonra siyah bayrak ----------
  S.push({
    id: 'ia13-black-flag',
    category: 'İleri Taktik', topic: 'Start',
    title: 'İA13 · Genel geri çağırma, sonra siyah bayrak: son dakikada burun hatta değmesin',
    summary: 'İlk start\'ta filonun çoğu erken çıktı ve hakem genel geri çağırma yaptı (Birinci Tekrar bayrağı, iki ses). Yeniden start siyah bayrakla: son 1 dakikada gövdesinin bir parçası hat üçgenindeki tekne diskalifiye olur (BFD), yelken numarası hakem botunda gösterilir ve start yeniden yapılsa da yarışamaz. Filo temkinli, hattın gerisinde bekliyor ve ortada yay oluşuyor. Yeşil S transitle hattın yerini bilir, hattın yarım boy altında bekler ve tam hızla çıkar. Turuncu B son dakikada burnunu hatta sokar: BFD. Mor C hattın üstüne son dakikadan ÖNCE çıkar: ceza yok, geri çekilir.',
    duration: 40,
    baseSpeed: 40,
    clockScale: 4,
    prepFlag: 'Siyah',
    flagDownAt: 17,
    wind: 0,
    line: { pin: { x: 200, y: 440 }, boat: { x: 800, y: 440 } },
    startAt: 32,
    committeeLabel: 'right',
    rungs: { boat: 'S', from: 32.5 },
    sightline: { from: 0, to: 6, label: 'Transit: pin\'den hakem botuna bak — hat burada' },
    sag: { from: 2, to: 30 },
    expectEarly: ['B'],
    boats: [
      { id: 'S', name: 'Transitle, yarım boy altta', role: 'dogru', color: '#2a9d8f',
        start: { x: 528, y: 476, h: 345 }, v0: 0,
        segs: [
          { mode: 'hold', h: 345, dur: 29.4, speed: 0.004, turn: 0, note: 'Hat yarım boy önde: transit' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.6, turn: 0.8 }
        ] },
      { id: 'B', name: 'Son dakikada burnu hatta: BFD', role: 'hata', color: '#e76f51',
        start: { x: 392, y: 484, h: 345 }, v0: 0,
        segs: [
          { mode: 'hold', h: 345, dur: 18, speed: 0.004, turn: 0, note: 'Hattın dibinde' },
          { mode: 'hold', h: 350, dur: 3.2, speed: 0.18, turn: 0.6, note: 'Sürünüyor…' },
          { mode: 'hold', h: 350, dur: 2.2, speed: 0.004, turn: 0, note: 'Burnu hatta: BFD!' },
          { mode: 'back', h: 350, dur: 2.0, speed: 0.25, turn: 0, note: 'Geri çekilmek kurtarmaz' },
          { mode: 'hold', h: 345, dur: 4.6, speed: 0.004, turn: 0.6, note: 'Numarası hakem botunda: BFD' },
          { mode: 'heading', h: 160, dur: 3.0, turn: 1.0, speed: 0.5, note: 'Yarıştan çıktı' },
          { mode: 'heading', h: 180, dur: 7.0, turn: 1.0, speed: 0.5, note: 'Yarıştan çıktı' }
        ] },
      { id: 'C', name: 'Son dakikadan önce üstte: ceza yok', role: 'hak', color: '#c77dff',
        start: { x: 652, y: 482, h: 345 }, v0: 0,
        segs: [
          { mode: 'hold', h: 350, dur: 5.5, speed: 0.1, turn: 0, note: 'Sürünüyor' },
          { mode: 'hold', h: 350, dur: 2.0, speed: 0.004, turn: 0, note: 'Hattın üstünde: henüz son dakika değil' },
          { mode: 'back', h: 350, dur: 2.6, speed: 0.3, turn: 0, note: 'Geri çekiliyor: ceza yok' },
          { mode: 'hold', h: 345, dur: 19.6, speed: 0.004, turn: 0.6, note: 'Yarım boy altta' },
          { mode: 'closehauled', tack: 'starboard', dur: 10.3, turn: 0.8 }
        ] }
    ],
    // temkinli filo: uçlar hatta yakın, orta 1-1,5 boy geride (siyah bayrak yayı)
    crowdLife: { gap: 38 },
    leeway: { from: 0, rate: 1.0, ang: 75 },   // gerçekçi
    crowd: [
      { slot: 0.06, back: 0, drift: 0.2 }, { slot: 0.13, back: 10, drift: 0.5 }, { slot: 0.33, back: 45, drift: 0 },
      { slot: 0.40, back: 55, drift: 0 }, { slot: 0.60, back: 55 }, { slot: 0.73, back: 40 },
      { slot: 0.80, back: 32 },
      // hakem botunun dibi baştan boş: tekneler dışarıda bekler, filo kaydıkça açılan boşluğa süzülür
      { slot: 0.905, wait: { x: 878, y: 462, h: 0, until: 21, speed: 0.45 } }, { slot: 0.86, row: 1, wait: { x: 912, y: 505, h: 355, until: 22, speed: 0.5 } }
    ],
    steps: [
      { t: 0, title: 'Az önce: start tekrarlandı', text: 'İlk start\'ta filonun çoğu hattın önündeydi. Hakem erken çıkanları tek tek ayıramadı ve start\'ı tekrarladı. Buna genel geri çağırma denir. Herkes geri döndü. Bu kez hazırlık bayrağı siyah.' },
      { t: 3, title: 'Siyah bayrak ne demek?', text: 'Son dakikada teknenin bir parçası hattın önündeki alana girerse diskalifiye olursun. Yelken numaran hakem botunda yazılır. Start yine tekrarlanırsa bir sonrakine de giremezsin. Geri dönmek kurtarmaz.' },
      { t: 6, title: 'Filo temkinli: yay oluşuyor', text: 'Siyah bayrakta herkes hattan uzak durur. Ortadaki tekneler uçları göremez, daha da geride bekler. Ortada bir yay oluşur. Hattın yerini bilen için büyük fırsat.' },
      { t: 7.5, title: 'C hattın önünde ama', text: 'Mor C hattın önüne çıktı. Ama henüz son dakika değil, bayrak hâlâ yukarıda. Siyah bayrak kuralı son dakikada başlar. C yelkenini ters basıp geri çekiliyor. Ceza yok.' },
      { t: 12, title: 'S hattı biliyor', text: 'Yeşil S, pin ile hakem botunu bir hizaya getirerek hattın yerini biliyor. Hattın yarım boy gerisinde bekliyor. Komşuları bir boy geride. Yarım boy siyah bayrakta bile güvenlidir.' },
      { t: 17, title: '1 dakika: bayrak indi', text: 'Hazırlık bayrağı indi ve uzun bir ses geldi. Siyah bayrak kuralı şimdi başladı. Start\'a kadar hattın önüne geçen diskalifiye olur.' },
      { t: 18, title: 'B kayıyor', text: 'Turuncu B yelkeni yarım dolu tutuyor ve yavaşça ilerliyor. Komşularından öne geçti ama hattın nerede olduğunu bilmiyor.' },
      { t: 21.2, title: 'B\'nin burnu hatta', text: 'B\'nin burnu hattın önüne geçti. Siyah bayrakta bu kadar yeter. Hakem numarasını yazdı. B geri çekilse de diskalifiye. P bayrağında düzeltebilirdi. Siyah bayrakta düzeltme yok.' },
      { t: 28, title: 'Numaralar hakem botunda', text: 'Hakem diskalifiye olan teknelerin numaralarını hakem botunda gösterir. B yarıştan çıkıyor.' },
      { t: 29.4, title: '10 saniye kala doldur', text: 'S yarım boy geride. Yelkeni dolduruyor ve hızlanıyor. Komşuları bir boy geriden, yavaş başlıyor.' },
      { t: 32, title: 'START', text: 'S yayın ortasından, komşularından bir boy önde ve tam hızda çıkıyor. Siyah bayrakta en büyük kazanç hattın yerini bilmek ve yarım boy geride korkmadan beklemektir.' },
      { t: 36, title: 'Özet', text: 'Start tekrarlanınca çoğu zaman U ya da siyah bayrak gelir. Siyah bayrakta son dakikada hattın önüne geçme. Geri dönmek kurtarmaz. Son dakikadan önce hattın önünde olmak ceza değildir. Herkes temkinliyken hattı bilen kazanır.' }
    ],
    addBoat: { pin: { x: 290, y: 600 }, middle: { x: 500, y: 600 }, committee: { x: 720, y: 600 } },
    startSlots: { pin: [0.1], middle: [0.5], committee: [0.9] }
  });

  // =====================================================================
  // İLERİ TEKNİK: donanım ve tekne kullanımı. Sahnede üstten görünüş + "Yandan görünüş" paneli (js/rigview.js, scn.rig).
  // =====================================================================

  // Rüzgarüstü şamandıra: aynı rota iki senaryoda, rüzgar şiddeti ve palanga miktarı farklı
  const VANG_MARK = { x: 640, y: 130, label: 'Orsa şamandırası (iskelede bırak)', zone: true };
  const VANG_STEPS = ['İskotayı sonuna kadar al', 'Bumbayı bastır', 'Palangayı al', 'İskotayı kaçır, kafa aç'];
  // board: true → İT1 (orta-sert): önce salma biraz kaldırılır (adım şeridinde ilk adım), sonra aynı sıra
  const vangKeys = (up, set, board) => {
    const B = board ? 0.35 : 0, o = board ? 1 : 0;
    const k = [
      { t: 0, sheet: 0.85, vang: up, push: 0, board: 0, p: -1 },
      { t: 4, sheet: 0.85, vang: up, push: 0, board: B, hand: 'sheet', p: o },
      { t: 5.2, sheet: 1, vang: up, push: 0, board: B, hand: 'sheet', p: o },
      { t: 5.6, sheet: 1, vang: up, push: 0, board: B, hand: 'boom', p: o + 1 },
      { t: 6.4, sheet: 1, vang: up, push: 1, board: B, hand: 'boom', p: o + 1 },
      { t: 7, sheet: 1, vang: up, push: 1, board: B, hand: 'vang', p: o + 2 },
      { t: 8.8, sheet: 1, vang: set, push: 1, board: B, hand: 'vang', p: o + 2 },
      { t: 9.2, sheet: 1, vang: set, push: 1, board: B, p: o + 2 },
      { t: 9.8, sheet: 1, vang: set, push: 0, board: B, p: o + 2 },
      { t: 11, sheet: 1, vang: set, push: 0, board: B, hand: 'release', p: o + 3 },
      { t: 13.6, sheet: 0.1, vang: set, push: 0, board: B, hand: 'tiller', p: o + 3 },
      { t: 15, sheet: 0.1, vang: set, push: 0, board: B, p: o + 4 }
    ];
    if (board) k.splice(1, 0, { t: 2.8, sheet: 0.85, vang: up, push: 0, board: 0, hand: 'board', p: 0 }, { t: 3.6, sheet: 0.85, vang: up, push: 0, board: B, hand: 'board', p: 0 });
    return k;
  };
  const vangGhost = up => [
    { t: 0, sheet: 0.85, vang: up }, { t: 11, sheet: 1, vang: up }, { t: 13.6, sheet: 0.1, vang: up }
  ];
  // slip: salma kalkıkken rüzgaraltına kayma (px/sn). İT1'de A bunu hesaba katıp layline'ın biraz üstünden gelir.
  const vangBoatA = (name, slip) => ({ id: 'A', name, role: 'dogru', color: '#2a9d8f',
    start: slip ? { x: 913, y: 328, h: 315 } : { x: 894, y: 362, h: 315 }, v0: 28,
    segs: slip ? [
      { mode: 'closehauled', tack: 'starboard', dur: 2.8, turn: 0, note: 'Layline\'ın biraz üstünde' },
      { mode: 'closehauled', tack: 'starboard', dur: 1.2, turn: 0, slip: slip, note: 'Salma biraz kalktı' },
      { mode: 'closehauled', tack: 'starboard', dur: 5, turn: 0, slip: slip, note: 'Kayıyor · iskota · bumba · palanga' },
      { mode: 'closehauled', tack: 'starboard', dur: 2.2, turn: 0, slip: slip },
      { mode: 'heading', h: 250, dur: 1.4, turn: 1.2 },
      { mode: 'run', tack: 'starboard', angle: 178, dur: 9.4, turn: 1.6 }
    ] : [
      { mode: 'closehauled', tack: 'starboard', dur: 4, turn: 0 },
      { mode: 'closehauled', tack: 'starboard', dur: 5, turn: 0, note: 'İskota · bumba · palanga' },
      { mode: 'closehauled', tack: 'starboard', dur: 2.2, turn: 0 },
      { mode: 'heading', h: 250, dur: 1.4, turn: 1.2 },
      { mode: 'run', tack: 'starboard', angle: 178, dur: 9.4, turn: 1.6 }
    ] });

  // ---------- İT1: orta-sert havada palangayı al, sonra pupaya dön ----------
  S.push({
    id: 'it1-vang-strong',
    category: 'İleri Teknik', topic: 'Şamandıra · Palanga',
    title: 'İT1 · Pupaya dönmeden palangayı al (orta-sert hava)',
    summary: 'Optimist\'te orsada bumbayı aşağıda tutan iskotadır. Rüzgarüstü şamandırada iskotayı kaçırınca bumbayı tutan tek şey palanga (boom vang) kalır. Bu yüzden şamandıradan önce sırayla: (kuvvetli havada gerekiyorsa) salmayı biraz kaldır, iskotayı sonuna kadar al, bumbayı aşağı bastır, palangayı elle al, sonra iskotayı kaçırıp kafa aç. Orta-sert havada palanga belirgin sıkı olur. Salma kalkınca tekne rüzgaraltına kayar: layline\'ın biraz üstünden gelin ve işi hızlı yapın. Sol alttaki "Yandan görünüş" panelinde her adımı izleyin; kesikli kırmızı çizgi palangayı almayan B\'nin yelkenidir.',
    duration: 22,
    baseSpeed: 28,
    wind: 0,
    windKn: 14,
    marks: [VANG_MARK],
    laylines: [{ x: 652, y: 140, tack: 'starboard', len: 440, from: 0, to: 11.5, label: 'Layline', color: '#4cc9f0' }],
    rig: { kn: 14, label: 'ORTA-SERT', board: true, steps: ['Salmayı biraz kaldır', ...VANG_STEPS], mark: 0.9, keys: vangKeys(0.3, 0.9, true),
      ghost: { label: 'Kesikli kırmızı: palangayı almayan B', short: 'B', from: 11, keys: vangGhost(0.3) } },
    boats: [
      vangBoatA('Palangayı alan', 5),
      { id: 'B', name: 'Palangayı almayan', role: 'hata', color: '#e76f51',
        noShadow: true,                               // B'nin yavaşlaması palangadan; A'nın gölgesi karışmasın
        start: { x: 824, y: 292, h: 315 }, v0: 28,
        segs: [
          { mode: 'closehauled', tack: 'starboard', dur: 7.7, turn: 0 },
          { mode: 'heading', h: 250, dur: 1.4, turn: 1.2 },
          { mode: 'run', tack: 'starboard', angle: 170, dur: 1.2, turn: 1.4, speed: 0.9 },
          { mode: 'heading', h: 215, dur: 0.9, turn: 0.7, speed: 0.85, note: 'Bumba kalktı · tekne yuvarlanıyor' },
          { mode: 'heading', h: 190, dur: 0.9, turn: 0.7, speed: 0.85, note: 'Bumba kalktı · tekne yuvarlanıyor' },
          { mode: 'heading', h: 215, dur: 0.9, turn: 0.7, speed: 0.85, note: 'Bumba kalktı · tekne yuvarlanıyor' },
          { mode: 'heading', h: 190, dur: 0.9, turn: 0.7, speed: 0.85 },
          { mode: 'heading', h: 215, dur: 0.9, turn: 0.7, speed: 0.85, note: 'Bumba kalktı · tekne yuvarlanıyor' },
          { mode: 'heading', h: 190, dur: 0.9, turn: 0.7, speed: 0.85 },
          { mode: 'heading', h: 215, dur: 0.9, turn: 0.7, speed: 0.85 },
          { mode: 'heading', h: 190, dur: 0.9, turn: 0.7, speed: 0.85 },
          { mode: 'heading', h: 210, dur: 4.5, turn: 1.2, speed: 0.85 }
        ] }
    ],
    steps: [
      { t: 0, title: 'Layline\'ın biraz üstünde, orsa', text: 'Yeşil A 14 knot rüzgarda orsa gidiyor. Optimist\'te orsada bumbayı aşağıda tutan şey iskotadır. Palanga gevşektir. Şamandırada iskotayı kaçıracağız. O an bumbayı tutacak tek şey palanga olacak. A layline\'ın biraz üstünden geliyor. Birazdan salmayı kaldıracak ve biraz kayacak.' },
      { t: 2.8, title: 'Birinci adım: salmayı biraz kaldır', text: 'Sert havada iskotayı çekip öne, palangaya uzanınca tekne yatmak ister. Bunu önlemek için salmayı biraz kaldır. Tekne dik kalır. Ama salma kalkınca tekne aşağı kayar.' },
      { t: 4, title: 'İkinci adım: iskotayı sonuna kadar çek', text: 'İskotayı sonuna kadar çek. Bumba en alçak yerine iner ve palanga halatı gevşer. Palanga yüklüyken elle çekilemez. Bu yüzden önce bumbayı iskotayla indiriyoruz.' },
      { t: 5.6, title: 'Üçüncü adım: bumbayı aşağı bastır', text: 'İskota elindeyken bumbayı direğe yakın yerinden aşağı bastır. Bumba biraz daha iner ve palangada boşluk açılır.' },
      { t: 7, title: 'Dördüncü adım: palangayı al', text: 'Açılan boşluğu elle al ve kurtağzına sıkıştır. Sert havada palanga belirgin sıkı olmalı. Paneldeki sarı çizgiye kadar. Halata bir işaret koyarsan her seferinde aynı ayarı yaparsın.' },
      { t: 9.4, title: 'Kaymayı hesapla, hızlı yap', text: 'Salma kalkıkken A biraz kaydı ama şamandırayı tam tutturdu. Çünkü kaymayı baştan hesaba katıp biraz yukarıdan geldi. İşi hızlı yap. Salma ne kadar uzun kalkık kalırsa o kadar kayarsın. Tekne yatmadan palangayı alabiliyorsan salmayı hiç kaldırma.' },
      { t: 11, title: 'Beşinci adım: iskotayı kaçır, kafa aç', text: 'Şamandırada iskotayı kaçır. Ağırlığını dışarıda tut ve dümenle kafa aç, pupaya dön. Bumba dışarı açılıyor ama yukarı kalkmıyor. Çünkü palanga tutuyor. Panelde kırmızı, gergin halat bunu gösteriyor.' },
      { t: 14, title: 'Neden? Yelkenin tepesi', text: 'Bumba kalkmayınca yelkenin tepesi fazla açılmaz. Yelken gücünü korur. Tekne sağa sola yuvarlanmaz, dümen hafif kalır. Paneldeki üstten görünüş, bumba ile yelken tepesi arasındaki açıyı gösterir.' },
      { t: 16.8, title: 'B palangayı almadı', text: 'B iskotayı kaçırınca bumbası kalktı. Yelkenin tepesi açıldı ve güç kaybetti. Tekne sağa sola yuvarlanıyor. Sporcu dümenle düzeltmeye uğraşıyor ve yavaşlıyor. Sert havada bu yuvarlanma devrilmeye kadar gidebilir.' },
      { t: 19.5, title: 'Fazlası da zarar', text: 'Çok sıkı palanga da iyi değil. Apazda sert bir rüzgarda bumbanın ucu suya değer ve tekne kendi kendine orsalar. Öyle bir anda palangayı ya da iskotayı biraz kaçır. Doğru ayar senin kilona ve dalgaya göre değişir. Antrenmanda dene ve halata işaret koy.' }
    ],
    addBoat: { pin: { x: 710, y: 560 }, middle: { x: 830, y: 620 }, committee: { x: 650, y: 620 } },
    addBoatLabels: { pin: 'Arkada', middle: 'Daha arkada', committee: 'Rüzgaraltında' }
  });

  // ---------- İT1b: hafif havada yalnız boşluğu al ----------
  S.push({
    id: 'it1b-vang-light',
    category: 'İleri Teknik', topic: 'Şamandıra · Palanga',
    title: 'İT1b · Hafif havada palanga: yalnız boşluğu al',
    summary: 'Hafif havada sıra aynı (iskotayı al, bumbayı bastır, palangayı al, iskotayı kaçır), ama palanga sıkılmaz: yalnızca boş kalmayacak kadar alınır. Bumba zıplamaz, yelken şeklini korur; yelkenin tepesi de hafif havada gerektiği gibi biraz açık kalır.',
    duration: 20,
    baseSpeed: 28,
    wind: 0,
    windKn: 6,
    marks: [VANG_MARK],
    rig: { kn: 6, label: 'HAFİF', steps: VANG_STEPS, mark: 0.55, keys: vangKeys(0.05, 0.55),
      ghost: { label: 'Kesikli kırmızı: palanga hiç alınmasaydı', short: 'palangasız', from: 11, keys: vangGhost(0.05) } },
    boats: [vangBoatA('Boşluğu alan')],
    steps: [
      { t: 0, title: 'Hafif hava, orsa', text: '6 knot rüzgarda orsa gidiyoruz. Palanga tamamen gevşek. Orsada bumbayı iskota tutuyor. Hafif havada da şamandıradan önce palangaya bakılır. Ama amaç sıkmak değil, sadece boşluğu almaktır.' },
      { t: 4, title: 'Birinci adım: iskotayı çek', text: 'İskotayı sonuna kadar çek, bumba en alçak yerine insin. Hafif havada tekneyi yatırma, ağırlığını ortada tut.' },
      { t: 5.6, title: 'İkinci adım: bumbayı bastır', text: 'Bumbayı hafifçe aşağı bastır. Hafif havada çok güç gerekmez. Amaç palanga halatının boşluğunu görmek.' },
      { t: 7, title: 'Üçüncü adım: sadece boşluğu al', text: 'Palangayı boş kalmayacak kadar al. Halat gergin ama sıkı değil. Paneldeki sarı çizgi kadar. Sıkarsan yelkenin arka kenarı kapanır.' },
      { t: 11, title: 'Dördüncü adım: iskotayı kaçır, kafa aç', text: 'İskotayı kaçır ve kafa aç. Bumba biraz kalkıyor ve palangaya yaslanıyor. Yelkenin tepesi biraz açık. Hafif havada istenen bu. Yelken nefes alır.' },
      { t: 14, title: 'Neden boş bırakmıyoruz?', text: 'Palanga hiç alınmasaydı bumba çok kalkardı. Yelkenin tepesi fazla açılır ve güç kaybedilirdi. Dalgada bumba aşağı yukarı oynar, yelken şeklini kaybeder.' },
      { t: 17, title: 'Neden sıkmıyoruz?', text: 'Hafif havada sıkı palanga yelkenin arka kenarını kapatır. Yelken tepeden boğulur ve tekne yavaşlar. Kural şu: hafif havada sadece boşluğu al, sert havada belirgin sık. Sert havayı İT1 dersinde gördün.' }
    ],
    addBoat: { pin: { x: 710, y: 560 }, middle: { x: 830, y: 620 }, committee: { x: 650, y: 620 } },
    addBoatLabels: { pin: 'Arkada', middle: 'Daha arkada', committee: 'Rüzgaraltında' }
  });

  /* ---------- KATALOG (kullanıcı 2026-11-23: önce "isim, numara, açıklama karma karışık", sonra "start, şamandıra, parkur diye
     grupla; start içinde pin, hakem botu…; taktik / ileri taktik yerine daha mantıklı") ----------
     Tek yer: grup (ana sayfa sekmesi) · alt grup (listede başlık) · kısa ad · listede görünen tek cümle (short).
     Kod OTOMATİK: grup harfi + gruptaki sıra (S Start, P Parkur, Ş Şamandıra, K Kurallar, T Teknik; kendi taktiklerin B1…).
     Zorluk: eski kategorisi "İleri …" olan senaryoda x.ileri = true → listede "İleri" rozeti; alt grupta temellerin arkasına yazılır.
     Kayıt kilidi (eski İleri Taktik) x.lock ile korunur. id'ler DEĞİŞMEZ: paylaşım bağlantıları (?izle=<id>, #<id>) ve kayıtlar id ile çalışır.
     Yeni senaryo: S.push({...}) + aşağıda doğru alt gruba bir satır. Satırı yoksa eski kategorisi/konusuna göre bir gruba, sona düşer. */
  const KATALOG = [
    // Start
    ['a1-line-bias', 'Start', 'Hattı oku', 'Start hattının avantajlı ucu', 'Hat rüzgara dik değilse bir uç öndedir; oradan çıkan önde başlar.'],
    ['a1b-measure', 'Start', 'Hattı oku', 'Avantajlı ucu bulmanın 3 yolu', 'Starttan önce ölç: rüzgara dön, hat boyunca seyret, pusulaya bak.'],
    ['ia2-line-sag', 'Start', 'Hattı oku', 'Hat yayı: ortada önde dur', 'Ortadaki filo hattan geride kalır; hattı gören biraz önde durur.'],
    ['ia2b-no-sag', 'Start', 'Hattı oku', 'Yay yok: herkesle aynı hizada dur', 'Filo hattın dibindeyse önde durma, erken çıkarsın.'],
    ['a3-pin-favored', 'Start', 'Pin ucu', 'Pin avantajlı: pin\'den çık, tramola at', 'Pin\'in yanından çık, hemen tramolayla filonun önünden geç.'],
    ['ia1-port-approach-pin', 'Start', 'Pin ucu', 'Dışarıda bekle, alttan tramola', 'Kavganın dışında bekle, apaz gel, grubun altına tramola at.'],
    ['ia8-pin-chaos', 'Start', 'Pin ucu', 'Pin kalabalık: layline\'ın üstünde kal', 'Pin layline\'ının üstünde yer tut; altında kalırsan pin\'i dönemezsin.'],
    ['a4-committee-favored', 'Start', 'Hakem botu ucu', 'Hakem botu avantajlı: alttan gel', 'Oraya rüzgaraltından gelerek girersin; üstten sokulmak hak vermez.'],
    ['ia3-committee-hold', 'Start', 'Hakem botu ucu', 'Hakem botunda yer tut', 'Erken gel, bayrağın dibinde bekle, altındaki boşluğu koru.'],
    ['ia5-committee-crowd', 'Start', 'Hakem botu ucu', 'Hakem botu kalabalık: erken gir', 'Son dakikada gelen yer bulamaz; erken gir, yerini tut.'],
    ['ia6-committee-gap', 'Start', 'Hakem botu ucu', 'Kuvvetli rüzgar: açılan boşluğa gir', 'Bekleyenler aşağı kayar; botun dibinde açılan boşluğa gir.'],
    ['ia2c-pick-gap', 'Start', 'Boşluk seçme', 'Boşluk seç: dar mı, geniş mi?', '2 dakika kala bak, geniş ve avantajlı boşluğu seç.'],
    ['ia11-plan-b', 'Start', 'Boşluk seçme', 'B planı: ikinci boşluğu aklında tut', 'Seçtiğin boşluk dolarsa yoldaki ikinci boşluğa gir.'],
    ['ia12-late-port-tack', 'Start', 'Boşluk seçme', 'Son saniyede tramola: boşluk yeter mi?', 'İskele kontradan geliyorsan yalnız geniş boşluğa tramola at.'],
    ['a2-timing', 'Start', 'Yer tutma ve zamanlama', 'Zamanlama: bekle, 10-12 sn kala doldur', 'Hattın hemen gerisinde bekle, sinyalden 10-12 sn önce yelkeni doldur.'],
    ['ia4-leeward-of-windward', 'Start', 'Yer tutma ve zamanlama', 'Sıkıştıysan boş yere geç', 'Kalabalıktan çık, bir teknenin hemen rüzgaraltına yanaş.'],
    ['ia7-hold-climb', 'Start', 'Yer tutma ve zamanlama', 'Kaydıkça yüksel', 'Kaybettiğin yüksekliği kısa iskota ve tramola hamleleriyle geri al.'],
    ['ia9-brake-back', 'Start', 'Yer tutma ve zamanlama', 'Fren yap, geri git', 'Orsala; yetmezse yelkeni ters bas ve kontrollü geri git.'],
    ['ia10-defend-gap', 'Start', 'Yer tutma ve zamanlama', 'Boşluğunu savun', 'Rüzgaraltındaki boşluğu kapat, kimse araya girmesin.'],
    ['a12-flags', 'Start', 'Bayraklar', 'Start bayrakları: P, I, U, siyah', 'Hazırlık bayrağı, erken çıkarsan ne olacağını söyler.'],
    ['ia13-black-flag', 'Start', 'Bayraklar', 'Siyah bayrak: son dakikada hatta değme', 'Son 1 dakikada hattı geçen diskalifiye olur; yarım boy geride bekle.'],
    ['a9-clear-air-tack', 'Start', 'Start sonrası', 'Pis havadan tramolayla çık', 'Öndekinin pis rüzgarındaysan omzuna bak, yol boşsa tramola at.'],
    ['a9b-foot-out', 'Start', 'Start sonrası', 'Tramola yolu kapalı: bordala, hızlan', 'Burnu biraz düşür, hızlan, rüzgaraltındaki boşluğa kay.'],
    // Parkur
    ['c1-header-tack', 'Parkur', 'Orsa ayağı', 'Rüzgar kapatınca tramola at', 'Rüzgar salınıyorsa kapatmada tramola at, açan kontrada kal.'],
    ['c3-layline', 'Parkur', 'Orsa ayağı', 'Layline: tam zamanında tramola at', 'Şamandıraya tek kontrada gidebileceğin yerde tramola at; fazla gitme.'],
    ['c4-lee-bow', 'Parkur', 'Orsa ayağı', 'Geçemiyorsan önüne tramola at', 'Sancak tekneyi geçemiyorsan bir boy önüne, rüzgaraltına tramola at.'],
    ['c4b-tight-cover', 'Parkur', 'Orsa ayağı', 'Kapama: rakibinin üstünde kal', 'Arkandaki rakip her tramola attığında sen de at, onun rüzgarüstünde kal.'],
    ['d3-shadow-attack', 'Parkur', 'Pupa ayağı', 'Pupada gölgeyle saldır', 'Gölgeni öndeki teknenin yelkenine düşür, onu yavaşlat.'],
    ['d3b-gybe-escape', 'Parkur', 'Pupa ayağı', 'Gölgeden kavançayla kaç', 'Arkandaki seni gölgelerse kavança at, temiz havaya çık.'],
    // Şamandıra
    ['e2-windward-queue', 'Şamandıra', 'Orsa şamandırası', 'Orsa şamandırası: sıraya erken gir', 'Sancak layline\'ına bölgeden önce gir; bölgede tramola atma.'],
    ['e1-wide-in-tight-out', 'Şamandıra', 'Pupa şamandırası ve kapı', 'Pupa şamandırası: geniş gir, dar çık', 'Biraz dışarıdan gir, şamandırayı dibinden sıyırarak çık.'],
    ['d4-gate-choice', 'Şamandıra', 'Pupa şamandırası ve kapı', 'Pupa kapısı: boş şamandırayı seç', 'Herkes bir şamandıraya yığılırsa sen boş olanı dön.'],
    // Kurallar
    ['b1-rule10', 'Kurallar', 'Yol hakkı', 'Kural 10: iskele kontra yol verir', 'Kesişirken iskele kontradaki tekne yol verir: arkadan geç ya da tramola at.'],
    ['b8-rule18', 'Kurallar', 'Şamandıra', 'Kural 18: şamandıra yeri', 'Bölgeye girerken içte bindirmesi olan tekne dönüş yeri kazanır.'],
    // Teknik
    ['it1-vang-strong', 'Teknik', 'Palanga', 'Pupaya dönmeden palangayı al', 'Şamandıradan önce: iskotayı al, bumbayı bastır, palangayı al.'],
    ['it1b-vang-light', 'Teknik', 'Palanga', 'Hafif havada palanga', 'Hafif havada palangayı yalnız boşluğu alacak kadar çek.'],
  ];
  const GROUPS = { 'Start': 'S', 'Parkur': 'P', 'Şamandıra': 'Ş', 'Kurallar': 'K', 'Teknik': 'T' };
  const ORDER = Object.keys(GROUPS);
  const rank = new Map(KATALOG.map((k, i) => [k[0], i]));
  const guessGroup = x => /Kural/.test(x.category) ? 'Kurallar' : /Teknik/.test(x.category) ? 'Teknik'
    : /Start/.test(x.topic || '') ? 'Start' : /Şamandıra/.test(x.topic || '') ? 'Şamandıra' : 'Parkur';
  for (const x of S) {
    const k = KATALOG.find(r => r[0] === x.id);
    x.ileri = /^İleri/.test(x.category); x.lock = x.category === 'İleri Taktik';
    if (k) { x.category = k[1]; x.topic = k[2]; x.name = k[3]; x.short = k[4]; }
    else { x.category = guessGroup(x); x.name = String(x.title || '').replace(/^\S+\s*·\s*/, ''); }
  }
  const ord = S.map((s, i) => [s, i]);
  ord.sort((a, b) => ORDER.indexOf(a[0].category) - ORDER.indexOf(b[0].category)
    || (rank.has(a[0].id) ? rank.get(a[0].id) : 1e3 + a[1]) - (rank.has(b[0].id) ? rank.get(b[0].id) : 1e3 + b[1]));
  S.splice(0, S.length, ...ord.map(o => o[0]));
  const nth = {};
  for (const x of S) { const L = GROUPS[x.category]; nth[L] = (nth[L] || 0) + 1; x.code = L + nth[L]; x.title = x.code + ' · ' + x.name; }

  global.SCENARIOS = S;
})(typeof window !== 'undefined' ? window : globalThis);

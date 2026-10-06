---
name: uygulamayi-calistir
description: DizaynDekor'u gerçek Chrome'da başlatır ve sürer — canlı izleme (HMR ile anlık) ya da headless ekran görüntüsü. Bir değişikliğin gerçek uygulamada ne yaptığını görmek, kesim ekranını sürmek, arayüzün donup donmadığını ölçmek, ekran görüntüsü almak için kullanın. Tetikleyiciler "uygulamayı çalıştır/aç", "canlı gör", "tarayıcıda dene", "ekran görüntüsü al", "arayüz donuyor mu".
---

# DizaynDekor'u çalıştır

Vite + React (Capacitor ile Android'e paketleniyor). "Çalıştırmak" = dev sunucusunu
başlatıp gerçek Chrome'u ona sürmek. Testler bunun yerine geçmez: bu projede
**ana iş parçacığını kilitleyen bir hata birim testlerden geçip tarayıcıda ortaya
çıktı** (aşağıda "Donma testi").

## 0. Kurulum (yalnız ilk sefer)

```bash
[ -d .claude/skills/uygulamayi-calistir/node_modules ] || \
  npm i --prefix .claude/skills/uygulamayi-calistir playwright-core
```

`playwright-core` tarayıcı İNDİRMEZ; sistemdeki Chrome'u (yoksa Edge) kullanır.
Proje `package.json`'ı bilerek ellenmez.

## 1. Dev sunucusunu başlat

```bash
npm run dev            # arka planda çalıştır
timeout 60 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'
```

Durdurmak (Windows):

```bash
netstat -ano | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u \
  | while read pid; do taskkill //PID $pid //F; done
```

`pkill -f` KULLANMAYIN — oturumun kendi komut satırını eşleyip kendini öldürebilir.

## 2. Sür

Komutlar `driver.mjs`'ye stdin'den satır satır verilir.

```bash
node .claude/skills/uygulamayi-calistir/driver.mjs <<'EOF'
tab Kesim
click HESAPLA VE YERLEŞTİR
wait-text DURDUR
shot arama-suruyor
freeze-check 3000
wait-text HESAPLA VE YERLEŞTİR
shot-full sonuc
text
EOF
```

Ekran görüntüleri `.claude/skills/uygulamayi-calistir/shots/` altına düşer.
**Aldığın görüntüye Read ile gerçekten BAK** — boş kare, açılmamış uygulama demektir.

### Komutlar

| Komut | Ne yapar |
|---|---|
| `goto <yol>` | Adrese git (betik başında otomatik `goto /`) |
| `tab <Liste\|Raf\|Kesim\|Ayarlar>` | Sol/alt menüden sekme değiştirir |
| `click <metin>` | Düğmeye görünen adıyla tıklar (büyük/küçük harf duyarsız) |
| `fill <seçici> <değer>` | Input doldurur |
| `wait-text <metin>` / `wait-gone <metin>` | Metin görünene/kaybolana kadar bekler |
| `shot <ad>` / `shot-full <ad>` | Ekran görüntüsü |
| `text [seçici]` | innerText döker |
| `eval <js>` | Sayfada JS çalıştırır |
| `freeze-check <ms>` | **Ana iş parçacığı ölçümü** — aşağıya bakın |
| `errors` | Konsol/sayfa hatalarını basar |
| `sleep <ms>` | Bekler |

### Seçenekler

| Bayrak | Etki |
|---|---|
| `--headed` | Gerçek Chrome penceresi açar (kullanıcı izlesin diye) |
| `--keep` | Komutlar bitince tarayıcıyı AÇIK bırakır |
| `--seed kesim92\|gardirop\|bos` | Hazır iş yükler (varsayılan `kesim92`) |
| `--fresh` | Tarayıcıdaki eski uygulama verisini siler, tohumu yeniden yazar |
| `--out <klasör>` | Görüntü klasörü |
| `--profile <yol>` | Kalıcı profil yolu (yalnız `--keep` ile anlamlı) |

## 3. Canlı izleme (kullanıcı ekranda görsün)

Pencere açık kalır; sen kaynak dosyaları değiştirdikçe Vite HMR ekranı **anında**
günceller — yeniden başlatmak gerekmez.

```bash
node .claude/skills/uygulamayi-calistir/driver.mjs --headed --keep --seed kesim92 <<'EOF'
tab Kesim
EOF
```

Bunu **arka plan görevi olarak** başlat, yoksa oturum bloklanır. Tohum yalnız
uygulama verisi yokken yazılır; HMR'ın tam sayfa yenilemesi kullanıcının elle
girdiği değerleri silmez (silmesini istersen `--fresh`).

**Canlı pencere açıkken doğrulama koşusu yapabilirsin** — asıl kullanım budur:
kullanıcı izler, sen headless koşuyla ölçer/görüntü alırsın. Bunun çalışması için
kalıcı profil YALNIZCA `--keep` modunda kullanılır; `--keep` olmayan koşular kendi
geçici bağlamlarını açar. Chrome bir kullanıcı-veri klasörünü aynı anda tek süreçte
açtığı için ikisi de kalıcı profil kullansaydı headless koşu anında patlardı
(ölçüldü). İki `--keep` penceresi aynı anda açılamaz; açılırsa sürücü uzun
Playwright dökümü yerine tek satır açıklama basar.

HMR gerçekten çalışıyor mu diye doğrulanmıştır: canlı pencere açıkken kaynak
dosyadaki düğme etiketi değiştirildi, headless gözlemci aynı sayfada yeniden
yükleme OLMADAN yeni etiketi gördü.

## Donma testi — bu projede ZORUNLU adım

Kesim optimizasyonu 8–13 saniye sürer ve **asenkron** koşar. `freeze-check`,
arama sürerken ana iş parçacığının gerçekten serbest olup olmadığını ölçer:

```
click HESAPLA VE YERLEŞTİR
wait-text DURDUR
freeze-check 3000
```

Çıktı: `... → 180 kare (~60 fps), 92 tik, en uzun blok 37 ms → akıcı`

**`tik = 0` ise arayüz KİLİTLİ.** requestAnimationFrame tek başına aldatıcıdır:
`scheduler.yield()` kullanıldığında rAF çalışmaya devam ediyordu ama setTimeout
ve MessageChannel görevleri hiç sıraya gelmiyordu — React'in zamanlayıcısı da
MessageChannel kullandığı için durum güncellemeleri işlenmiyor, "DURDUR" düğmesi
ekrana hiç gelmiyordu. Ölçüm (92 parça, 6.7 sn):

| | scheduler.yield | MessageChannel |
|---|---|---|
| rAF karesi | 65 | 401 |
| setTimeout tiki | **0** | 200 |

Bu yüzden `domain/nesting/packer.ts` içindeki `yieldToHost()` **MessageChannel
kullanır, `scheduler.yield()` kullanmaz**. Oraya dokunursan bu testi tekrar koş.

## Bu projeye özgü tuzaklar

- **Keep-alive router.** `App.tsx` dört modülü de mount eder, yalnız gizler
  (`hidden` sınıfı). Aynı metin birden çok gizli modülde bulunabilir — bu yüzden
  `click` ilk eşleşmeyi alır ve `tab` ile önce doğru sekmeye geçmek gerekir.
- **Kesim ekranını elle doldurma.** 7 satır × 4 hücre yerine `--seed` kullan;
  veri `localStorage`'a yazılır, uygulama açılışta okur (`seeds.mjs`).
- **React kontrollü input.** `eval el.value = '…'` onChange tetiklemez; `fill` kullan.
- **Vite ilk derleme.** İlk `goto` 10 sn'yi bulabilir; `wait-text` bunu karşılar,
  `sleep` karşılamaz.
- **404 konsol gürültüsü** dev sunucusunda olağandır, sürücü onu eler.
- **Sonuç önbelleği.** Sonuç `um_cutting_result` altında saklanır ve girdi imzası
  değişince "bayat" şeridi çıkar. Temiz koşu için `--fresh`.
- **Uzun sonuç sayfası.** `shot-full` çok büyük dosya üretir; ilgilendiğin plakaya
  `wait-text "Malzeme Levhası 1"` ile kaydırıp normal `shot` almak daha okunur.

## Ölçüt (kesim motoru için)

Arayüz değil, yerleştirme kalitesi değiştiyse tarayıcı yerine ölçütü koş:

```bash
npx vite-node __tests__/bench.packer.ts
```

21 iş üzerinde v2↔v3 plaka sayısı, fire, kerf/giyotin denetimi basar.

/**
 * DizaynDekor'u gerçek Chrome'da açan ve süren sürücü.
 *
 *   node driver.mjs [seçenekler] < komutlar
 *   node driver.mjs [seçenekler] -c "tab Kesim" -c "shot kesim"
 *
 * Seçenekler:
 *   --headed          Gerçek Chrome penceresi aç (varsayılan: headless)
 *   --keep            Komutlar bittikten sonra tarayıcıyı AÇIK bırak (canlı izleme)
 *   --seed <ad>       Başlangıç verisi: kesim92 | gardirop | bos   (varsayılan kesim92)
 *   --fresh           Tarayıcıdaki eski uygulama verisini sil, tohumu yeniden yaz
 *   --url <adres>     Varsayılan http://localhost:3000
 *   --out <klasör>    Ekran görüntüsü klasörü (varsayılan: <beceri>/shots)
 *   --profile <yol>   Kalıcı Chrome profili (varsayılan: <beceri>/shots/profile)
 *
 * Komutlar (satır satır, `#` yorum):
 *   goto <yol>              /  ya da  /#foo
 *   tab <Liste|Raf|Kesim|Ayarlar>
 *   click <görünen metin>   düğmeye adıyla tıklar
 *   fill <seçici> <değer>   React kontrollü input'lar için (doğrudan value ataması ÇALIŞMAZ)
 *   wait-text <metin>       metin görünene kadar bekler
 *   wait-gone <metin>       metin kaybolana kadar bekler
 *   sleep <ms>
 *   shot <ad>               görünen alanın ekran görüntüsü
 *   shot-full <ad>          tüm sayfa
 *   text [seçici]           innerText döker (varsayılan body, ilk 1500 karakter)
 *   eval <js>               sayfada çalıştırır, sonucu basar
 *   freeze-check <ms>       ANA İŞ PARÇACIĞI ölçümü: kaç kare + kaç setTimeout tiki
 *   errors                  o ana kadarki konsol/sayfa hatalarını basar
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEEDS } from './seeds.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- seçenekler ---------------- */
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const inlineCmds = argv.reduce((a, v, i) => (v === '-c' && argv[i + 1] ? [...a, argv[i + 1]] : a), []);

const OPT = {
  headed: flag('--headed'),
  keep: flag('--keep'),
  fresh: flag('--fresh'),
  seed: val('--seed', 'kesim92'),
  url: val('--url', 'http://localhost:3000'),
  out: val('--out', path.join(HERE, 'shots')),
  profile: val('--profile', path.join(HERE, 'shots', 'profile')),
};
fs.mkdirSync(OPT.out, { recursive: true });

/* ---------------- Chrome'u bul ---------------- */
const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const CHROME = CANDIDATES.find(p => p && fs.existsSync(p));
if (!CHROME) {
  console.error('Chrome/Edge bulunamadı. --url ile birlikte tarayıcı yolunu koda ekleyin.');
  process.exit(1);
}

/* ---------------- sunucu ayakta mı ---------------- */
try {
  const r = await fetch(OPT.url, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
} catch {
  console.error(`Sunucu yok: ${OPT.url}\n  Önce başlatın:  npm run dev`);
  process.exit(1);
}

/* ---------------- tarayıcı ---------------- */
const seed = SEEDS[OPT.seed];
if (!seed) {
  console.error(`Bilinmeyen tohum "${OPT.seed}". Seçenekler: ${Object.keys(SEEDS).join(', ')}`);
  process.exit(1);
}

/**
 * Profil kilidi: Chrome bir kullanici-veri klasorunu AYNI ANDA tek surecte acar.
 * Canli pencere (--keep) acikken headless bir dogrulama kosusu ayni profili
 * kullanmaya kalkarsa aninda patlar — oysa asil istenen tam bu ikili: kullanici
 * izlerken ajan dogrular. Bu yuzden yalnizca --keep kalici profil kullanir
 * (durum yeniden baslatmalarda korunsun); geri kalan kosular gecici, kilitsiz
 * baglamda calisir.
 */
const LAUNCH = {
  executablePath: CHROME,
  headless: !OPT.headed,
  args: ['--disable-features=Translate', '--no-first-run'],
};
const VIEWPORT = { width: 1080, height: 1200 };

let ctx, browser = null;
try {
  if (OPT.keep) {
    fs.mkdirSync(OPT.profile, { recursive: true });
    ctx = await chromium.launchPersistentContext(OPT.profile, { ...LAUNCH, viewport: VIEWPORT });
  } else {
    browser = await chromium.launch(LAUNCH);
    ctx = await browser.newContext({ viewport: VIEWPORT });
  }
} catch (e) {
  if (/ProcessSingleton|user data directory|has been closed/i.test(e.message)) {
    console.error('Chrome profili kilitli — buyuk ihtimalle acik bir canli pencere var.');
    console.error('Ya o pencereyi kapatin ya da bu kosuyu --keep OLMADAN calistirin.');
  } else {
    console.error('Chrome baslatilamadi:', e.message.split('\n')[0]);
  }
  process.exit(1);
}

// Tohum: uygulama verisi YOKSA ya da --fresh verildiyse yazılır. Böylece HMR'ın
// tam sayfa yenilemesi kullanıcının elle girdiği değerleri silmez.
await ctx.addInitScript(([data, force]) => {
  try {
    if (force) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('um_') || k.startsWith('dd_'))) localStorage.removeItem(k);
      }
    }
    if (force || localStorage.getItem('um_cutting_parts') === null) {
      for (const [k, v] of Object.entries(data)) {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, JSON.stringify(v));
      }
    }
  } catch { /* yoksay */ }
}, [seed.storage, OPT.fresh]);

const page = ctx.pages()[0] || await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

const log = (...a) => console.log('·', ...a);
/** Vite dev sunucusunun 404 gürültüsü gerçek hata değildir */
const realErrors = () => errors.filter(e => !/404 \(Not Found\)/.test(e));
const shotPath = n => path.join(OPT.out, `${String(n).replace(/[^\w.-]+/g, '_')}.png`);

/* ---------------- komutlar ---------------- */
async function run(line) {
  const s = line.trim();
  if (!s || s.startsWith('#')) return;
  const sp = s.indexOf(' ');
  const cmd = (sp < 0 ? s : s.slice(0, sp)).toLowerCase();
  const arg = sp < 0 ? '' : s.slice(sp + 1).trim();

  switch (cmd) {
    case 'goto': {
      const t0 = Date.now();
      await page.goto(new URL(arg || '/', OPT.url).href, { waitUntil: 'domcontentloaded' });
      log(`goto ${arg || '/'} (${Date.now() - t0} ms)`);
      break;
    }
    case 'tab':
      await page.getByRole('button', { name: arg, exact: true }).first().click();
      await page.waitForTimeout(120);
      log(`sekme: ${arg}`);
      break;
    case 'click': {
      const t0 = Date.now();
      await page.getByRole('button', { name: new RegExp(arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
        .first().click({ timeout: 15000 });
      log(`tık: ${arg} (${Date.now() - t0} ms)`);
      break;
    }
    case 'fill': {
      const i = arg.indexOf(' ');
      const sel = arg.slice(0, i), v = arg.slice(i + 1);
      await page.locator(sel).first().fill(v);   // React onChange için fill şart
      log(`doldur ${sel} = ${v}`);
      break;
    }
    case 'wait-text': {
      const t0 = Date.now();
      await page.getByText(arg, { exact: false }).first().waitFor({ timeout: 40000 });
      log(`görüldü: "${arg}" (${Date.now() - t0} ms)`);
      break;
    }
    case 'wait-gone': {
      const t0 = Date.now();
      await page.getByText(arg, { exact: false }).first().waitFor({ state: 'hidden', timeout: 40000 });
      log(`kayboldu: "${arg}" (${Date.now() - t0} ms)`);
      break;
    }
    case 'sleep':
      await page.waitForTimeout(Number(arg) || 0);
      break;
    case 'shot':
      await page.screenshot({ path: shotPath(arg || 'shot') });
      log(`görüntü: ${shotPath(arg || 'shot')}`);
      break;
    case 'shot-full':
      await page.screenshot({ path: shotPath(arg || 'full'), fullPage: true });
      log(`görüntü (tam): ${shotPath(arg || 'full')}`);
      break;
    case 'text': {
      const t = arg
        ? await page.locator(arg).first().innerText()
        : await page.evaluate(() => document.body.innerText);
      console.log(t.replace(/\n{2,}/g, '\n').slice(0, 1500));
      break;
    }
    case 'eval':
      console.log(JSON.stringify(await page.evaluate(arg), null, 2));
      break;
    case 'freeze-check': {
      // Uzun hesap sürerken arayüz GERÇEKTEN yaşıyor mu? rAF tek başına yeterli
      // değil: React'in zamanlayıcısı MessageChannel/timer görevlerine bakar.
      const ms = Number(arg) || 2000;
      const r = await page.evaluate(async d => {
        let frames = 0, ticks = 0, maxGap = 0, last = performance.now(), run = true;
        const raf = () => { if (run) { frames++; requestAnimationFrame(raf); } };
        requestAnimationFrame(raf);
        const tick = () => {
          if (!run) return;
          const t = performance.now();
          maxGap = Math.max(maxGap, t - last); last = t; ticks++;
          setTimeout(tick, 16);
        };
        setTimeout(tick, 16);
        await new Promise(res => setTimeout(res, d));
        run = false;
        return { frames, ticks, maxGap: Math.round(maxGap) };
      }, ms);
      const fps = (r.frames / (ms / 1000)).toFixed(0);
      const verdict = r.ticks === 0 ? 'ANA İŞ PARÇACIĞI KİLİTLİ' : r.maxGap > 250 ? 'takılıyor' : 'akıcı';
      log(`donma testi ${ms}ms → ${r.frames} kare (~${fps} fps), ${r.ticks} tik, en uzun blok ${r.maxGap} ms → ${verdict}`);
      break;
    }
    case 'errors': {
      const r = realErrors();
      console.log(r.length ? r.join('\n') : '(hata yok)');
      break;
    }
    default:
      console.error(`bilinmeyen komut: ${cmd}`);
  }
}

/* ---------------- akış ---------------- */
let script = inlineCmds;
if (!script.length && !process.stdin.isTTY) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  script = Buffer.concat(chunks).toString('utf8').split('\n');
}
if (!script.length) script = ['goto /', 'tab Kesim', 'shot acilis'];

// Her betik açılışla başlar (goto verilmediyse)
if (!script.some(l => l.trim().toLowerCase().startsWith('goto'))) script.unshift('goto /');

let failed = false;
try {
  for (const line of script) await run(line);
} catch (e) {
  failed = true;
  console.error('\nKOMUT HATASI:', e.message.split('\n')[0]);
  await page.screenshot({ path: shotPath('HATA') }).catch(() => {});
  console.error('son durum görüntüsü:', shotPath('HATA'));
}

const leftover = realErrors();
if (leftover.length) {
  console.log('\n--- SAYFA HATALARI ---');
  console.log(leftover.join('\n'));
}

if (OPT.keep) {
  console.log('\nTarayıcı açık bırakıldı. Kaynak dosyaları değiştirdikçe Vite HMR ile');
  console.log('ekran anında güncellenir. Kapatmak için pencereyi kapatın ya da Ctrl-C.');
  await new Promise(res => ctx.on('close', res));
} else {
  await ctx.close();
  if (browser) await browser.close();
}
process.exit(failed ? 1 : 0);

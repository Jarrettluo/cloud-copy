/* 四项改造 UI 验证 v3：①浅色默认+切换 ②2G 上限 ③柜子分享链接 ④文件下载链接 + 80MB 分片直传 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://127.0.0.1';
const OUT = path.resolve(__dirname, '..', 'screenshots');
let fail = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  | ' + extra : ''));
  if (!cond) fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 160)));

  // ===== ① 默认浅色主题 =====
  await page.goto(BASE + '/cloud-copy/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join('')), {timeout: 15000});
  const themeInfo = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
  }));
  ok('默认浅色主题（无 data-theme 属性）', themeInfo.attr === null, JSON.stringify(themeInfo));
  const lightBgIsLight = await page.evaluate(() => {
    const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return (rgb[0]+rgb[1]+rgb[2])/3 > 180;
  });
  ok('浅色背景亮度正确', lightBgIsLight);
  await page.screenshot({ path: path.join(OUT, '11-light-main.png'), fullPage: true });

  // 切换深色 → 刷新保持 → 切回浅色
  await page.evaluate(() => document.querySelector('#themeToggle').click());
  await sleep(350);
  ok('切换深色生效', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  await page.screenshot({ path: path.join(OUT, '12-dark-main.png'), fullPage: true });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join('')), {timeout: 15000});
  ok('深色选择刷新后保持', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  await page.evaluate(() => document.querySelector('#themeToggle').click());
  await sleep(300);
  ok('切回浅色', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === null);

  // ===== ② 2G 上限展示 + 负例 =====
  const maxLabel = await page.evaluate(() => document.querySelector('#maxMb').textContent);
  ok('上传上限显示 2GB', /2(\.0)?GB/.test(maxLabel), maxLabel);
  const overLimit = await fetch(BASE + '/cloud-copy/api/upload_init', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'AAAAAA', filename: 'x.bin', size: 3 * 1024 * 1024 * 1024 }),
  });
  ok('超 2G 文件 → 413 拒绝', overLimit.status === 413, 'HTTP ' + overLimit.status);

  // ===== 小文件上传（服务器中转路径）=====
  const myCode = await page.evaluate(() => [...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join(''));
  fs.writeFileSync('/tmp/ui2-note.txt', 'UI v2 测试文本\n第二行内容');
  await (await page.$('#fileInput')).uploadFile('/tmp/ui2-note.txt');
  await page.waitForFunction(() => [...document.querySelectorAll('.frow .nm')].some(n=>n.textContent==='ui2-note.txt'), {timeout: 20000}).catch(()=>{});
  ok('小文件上传（中转路径）', (await page.evaluate(() => [...document.querySelectorAll('.frow .nm')].map(n=>n.textContent))).includes('ui2-note.txt'));

  // ===== ④ 文件分享链接 =====
  await page.evaluate(() => {
    [...document.querySelectorAll('.frow')].find(r=>r.querySelector('.nm').textContent==='ui2-note.txt').querySelector('.act-share').click();
  });
  await sleep(500);
  const shareLink = await page.evaluate(() => document.querySelector('#shareInput').value);
  ok('文件分享弹窗显示链接', /\/cloud-copy\/api\/d\/.+/.test(shareLink), shareLink.slice(0, 80));
  await page.evaluate(() => document.querySelector('#shareCopyBtn').click());
  await sleep(300);
  ok('复制按钮工作（toast 出现）', await page.evaluate(() => !!document.querySelector('.toast.ok')));
  await page.evaluate(() => document.querySelector('#shareClose').click());
  await sleep(300);
  const dl = await fetch(shareLink);
  ok('分享链接打开即下载（内容一致）', dl.status === 200 && (await dl.text()).includes('UI v2 测试文本'));

  // ===== 80MB 分片直传（浏览器内，>64MB 走 multipart 直传路径）=====
  const bigBuf = crypto.randomBytes(80 * 1024 * 1024);
  fs.writeFileSync('/tmp/ui2-big.bin', bigBuf);
  const bigMd5 = crypto.createHash('md5').update(bigBuf).digest('hex');
  const t0 = Date.now();
  await (await page.$('#fileInput')).uploadFile('/tmp/ui2-big.bin');
  await page.waitForFunction(() => [...document.querySelectorAll('.frow .nm')].some(n=>n.textContent==='ui2-big.bin'), {timeout: 240000}).catch(()=>{});
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const bigRowSeen = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.frow')].find(x=>x.querySelector('.nm').textContent==='ui2-big.bin');
    return r ? r.querySelector('.fmeta').textContent : '';
  });
  ok('80MB 分片直传完成并入库', /80/.test(bigRowSeen), `${dt}s | ${bigRowSeen}`);

  // 校验 80MB 内容 md5（Node 侧全链路下载验证）
  const dUrl2 = await page.evaluate(async (code) => {
    const r = await fetch('api/list/' + code);
    const d = await r.json();
    const it = d.items.find(x=>x.name==='ui2-big.bin');
    return '/cloud-copy/api/d/' + encodeURIComponent(it.id);
  }, myCode);
  const bigDl = await fetch(BASE + dUrl2);
  const bigHash = crypto.createHash('md5').update(Buffer.from(await bigDl.arrayBuffer())).digest('hex');
  ok('80MB 下载内容 md5 一致', bigHash === bigMd5, bigHash.slice(0,12) + ' vs ' + bigMd5.slice(0,12));

  await page.screenshot({ path: path.join(OUT, '13-light-with-big.png'), fullPage: true });

  // ===== ③ 柜子分享链接 + 朋友模拟（隐身上下文=干净 localStorage）=====
  await page.evaluate(() => document.querySelector('#shareLocker').click());
  await sleep(500);
  const lockerLink = await page.evaluate(() => document.querySelector('#shareInput').value);
  ok('柜子分享链接含 ?code=', /\?code=[A-Z]{6}$/.test(lockerLink), lockerLink);
  await page.evaluate(() => document.querySelector('#shareClose').click());
  await sleep(250);

  const ctx = typeof browser.createBrowserContext === 'function'
    ? await browser.createBrowserContext()
    : await browser.createIncognitoBrowserContext();
  const page2 = await ctx.newPage();
  await page2.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  const errs2 = [];
  page2.on('pageerror', (e) => errs2.push(e.message.slice(0,160)));
  await page2.goto(lockerLink, { waitUntil: 'networkidle2' });
  await page2.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join('')), {timeout: 15000});
  const friendView = await page2.evaluate(() => ({
    code: [...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join(''),
    foreign: !document.querySelector('#foreignBanner').hidden,
    files: [...document.querySelectorAll('.frow .nm')].map(n=>n.textContent),
  }));
  ok('朋友打开分享链接直达柜子', friendView.code === myCode, friendView.code + ' vs ' + myCode);
  ok('朋友页面显示"正在查看"提示条', friendView.foreign === true);
  ok('朋友可见文件列表（含大文件）', friendView.files.includes('ui2-note.txt') && friendView.files.includes('ui2-big.bin'), friendView.files.join(','));
  // 朋友从列表下载小文件
  const fdl = await page2.evaluate(async (code) => {
    const r = await fetch('api/list/' + code);
    const d = await r.json();
    const it = d.items.find(x=>x.name==='ui2-note.txt');
    return 'api/d/' + encodeURIComponent(it.id);
  }, myCode);
  const fdlRes = await fetch(BASE + '/cloud-copy/' + fdl);
  ok('朋友通过文件链接下载成功', fdlRes.status === 200 && (await fdlRes.text()).includes('UI v2 测试文本'));
  await page2.screenshot({ path: path.join(OUT, '14-friend-locker.png'), fullPage: true });

  ok('全程无 console 报错', errors.length === 0 && errs2.length === 0, (errors.concat(errs2)).slice(0,2).join(' | '));

  console.log('  · 测试码（待清理）:', myCode);
  fs.writeFileSync(path.join(OUT, 'ui2-codes.txt'), myCode);
  await browser.close();
  console.log('\\nFAILS:', fail ? fail : 'none — UI v3 ALL PASS ✓');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
/* 图标合规验证 v2.1：全站无 emoji、关键位置均为 Lucide 内联 SVG、截图。
 * 用法: node tests/icons-check.js （须先部署前端）
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://127.0.0.1';
const OUT = path.resolve(__dirname, '..', 'screenshots');
let fail = 0;
const ok = (n, c, ex = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (ex ? '  | ' + ex : '')); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMOJI_RE = '[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 140)));

  await page.goto(BASE + '/cloud-copy/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c => c.textContent).join('')), { timeout: 15000 });
  const myCode = await page.evaluate(() => [...document.querySelectorAll('#codeDisplay .cell')].map(c => c.textContent).join(''));
  fs.writeFileSync('/tmp/icons-check-code.txt', myCode);

  // 1. 全页文本节点 + 属性无 emoji
  const emojiHits = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc, 'u');
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) { const t = n.textContent; if (re.test(t)) hits.push(t.trim().slice(0, 50)); }
    document.querySelectorAll('[title],[aria-label],[placeholder]').forEach((el) => {
      for (const a of ['title', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(a); if (v && re.test(v)) hits.push(a + '=' + v.slice(0, 50));
      }
    });
    return hits;
  }, EMOJI_RE);
  ok('页面无 emoji（文本/属性）', emojiHits.length === 0, emojiHits.slice(0, 5).join(' | '));

  // 2. 关键位置 SVG
  const s = await page.evaluate(() => ({
    theme: !!document.querySelector('#themeToggle svg'),
    back: !!document.querySelector('.top-link svg'),
    shareLocker: !!document.querySelector('#shareLocker svg'),
    modalClose: !!document.querySelector('#modalClose svg'),
    shareClose: !!document.querySelector('#shareClose svg'),
    dzScope: !!document.querySelector('#dzScope svg'),
    dotText: document.querySelector('#cloudStatus').textContent.includes('●'),
  }));
  ok('主题切换按钮为 SVG', s.theme);
  ok('返回主页箭头为 SVG', s.back);
  ok('分享柜子链接按钮为 SVG', s.shareLocker);
  ok('预览弹窗关闭为 SVG', s.modalClose);
  ok('分享弹窗关闭为 SVG', s.shareClose);
  ok('拖拽区箭头为 SVG', s.dzScope);
  ok('云端状态点为 CSS 圆点（无 ● 字符）', !s.dotText);

  // 3. 上传文本 → 行图标/托盘/成功 toast 校验
  fs.writeFileSync('/tmp/icons-check-note.txt', '图标检查专用文件');
  await (await page.$('#fileInput')).uploadFile('/tmp/icons-check-note.txt');
  await page.waitForFunction(() => [...document.querySelectorAll('.frow .nm')].some(n => n.textContent === 'icons-check-note.txt'), { timeout: 20000 }).catch(() => {});
  const rowInfo = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.frow')].find(x => x.querySelector('.nm').textContent === 'icons-check-note.txt');
    return row ? { svg: !!row.querySelector('.ficon svg'), text: row.querySelector('.ficon').textContent.trim() } : null;
  });
  ok('文件行图标为 SVG（无字符残留）', rowInfo && rowInfo.svg && rowInfo.text === '', JSON.stringify(rowInfo));
  await sleep(1200);
  const trayInfo = await page.evaluate(() => {
    const t = document.querySelector('.tray-item.done .tstat');
    return t ? { svg: !!t.querySelector('svg'), text: t.textContent.trim() } : null;
  });
  ok('上传托盘完成态为 SVG 勾 + 已存入', trayInfo && trayInfo.svg && trayInfo.text.includes('已存入'), JSON.stringify(trayInfo));

  // 4. 分享弹窗打开 → 提示 & toast
  await page.evaluate(() => document.querySelector('#shareLocker').click());
  await sleep(400);
  ok('分享弹窗仍为 SVG 关闭按钮', await page.evaluate(() => !!document.querySelector('#shareClose svg')));
  await page.evaluate(() => document.querySelector('#shareCopyBtn').click());
  await sleep(400);
  const toastOk = await page.evaluate(() => {
    const t = document.querySelector('.toast.ok');
    return t ? !!t.querySelector('.tic svg') : false;
  });
  ok('成功 toast 带 SVG 图标', toastOk);
  await page.evaluate(() => document.querySelector('#shareClose').click());
  await sleep(200);

  // 5. 空状态图标（查看无文件的外码）
  const alt = myCode === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
  await page.evaluate((c) => {
    const inp = document.querySelector('#switchInput');
    inp.value = c; inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#switchBtn').click();
  }, alt);
  await sleep(1200);
  const emptyInfo = await page.evaluate(() => {
    const e = document.querySelector('#emptyState');
    return e ? { svg: !!e.querySelector('svg'), text: e.textContent.slice(0, 30) } : null;
  });
  ok('空状态为 SVG 图标（search-x）', emptyInfo && emptyInfo.svg, JSON.stringify(emptyInfo));

  // 6. 截图：浅色主界面（含文件行图标）
  await page.evaluate((c) => {
    const inp = document.querySelector('#switchInput');
    inp.value = c; inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#switchBtn').click();
  }, myCode);
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'L1-light-icons.png'), fullPage: true });

  // 深色
  await page.evaluate(() => document.querySelector('#themeToggle').click());
  await sleep(400);
  ok('深色模式主题按钮仍为 SVG', await page.evaluate(() => !!document.querySelector('#themeToggle svg')));
  await page.screenshot({ path: path.join(OUT, 'L2-dark-icons.png'), fullPage: true });
  await page.evaluate(() => document.querySelector('#themeToggle').click());
  await sleep(200);

  // 桌面宽度
  await page.setViewport({ width: 1180, height: 780, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c => c.textContent).join('')), { timeout: 15000 });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'L3-desktop-icons.png'), fullPage: true });

  ok('全程无 console 报错', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('  · 测试码:', myCode);
  await browser.close();
  console.log('\nFAILS:', fail ? fail : 'none — ICONS ALL PASS ✓');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
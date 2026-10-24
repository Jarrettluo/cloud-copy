/* 校验：①上传图标水平居中（手机+桌面）②三主卡片/按钮扁平化（无阴影）。
 * 用法: node tests/measure-dz.js
 */
const puppeteer = require('puppeteer-core');
const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, ex = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (ex ? '  | ' + ex : '')); if (!c) fail++; };

async function iconCenter(page) {
  return page.evaluate(() => {
    const dz = document.querySelector('#dropZone').getBoundingClientRect();
    const ic = document.querySelector('.dz-icon').getBoundingClientRect();
    return {
      offsetFromCenter: +(((ic.left + ic.right) / 2) - ((dz.left + dz.right) / 2)).toFixed(1),
      leftGap: +(ic.left - dz.left).toFixed(1),
      rightGap: +(dz.right - ic.right).toFixed(1),
    };
  });
}
async function flatness(page) {
  return page.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    return {
      panels: [...document.querySelectorAll('.panel')].map((p) => getComputedStyle(p).boxShadow),
      btn: cs('#copyCode').boxShadow,
      modal: cs('.modal-panel').boxShadow.slice(0, 30),
    };
  });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1/cloud-copy/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c => c.textContent).join('')), { timeout: 15000 });
  await sleep(800);

  // ① 手机端居中
  const m1 = await iconCenter(page);
  ok('手机端上传图标居中（偏移≈0）', Math.abs(m1.offsetFromCenter) <= 1, JSON.stringify(m1));
  const dz = await page.$('#dropZone');
  await dz.screenshot({ path: '/tmp/dz-after.png' });

  // ② 扁平化：卡片/主按钮无阴影
  const f1 = await flatness(page);
  ok('三个主卡片无阴影', f1.panels.length === 3 && f1.panels.every(s => s === 'none'), f1.panels.join(' | '));
  ok('主按钮无阴影', f1.btn === 'none', f1.btn);
  console.log('  · 弹窗保留浮层阴影（预期）:', f1.modal !== 'none');

  // 深色下同样检查
  await page.evaluate(() => document.querySelector('#themeToggle').click());
  await sleep(400);
  const f2 = await flatness(page);
  ok('深色模式卡片无阴影', f2.panels.every(s => s === 'none'));
  await page.evaluate(() => document.querySelector('#themeToggle').click());
  await sleep(300);

  // ③ 桌面端居中
  await page.setViewport({ width: 1180, height: 780, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c => c.textContent).join('')), { timeout: 15000 });
  await sleep(600);
  const m2 = await iconCenter(page);
  ok('桌面端上传图标居中（偏移≈0）', Math.abs(m2.offsetFromCenter) <= 1, JSON.stringify(m2));

  await browser.close();
  console.log('\nFAILS:', fail ? fail : 'none — FLAT+CENTER ALL PASS ✓');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
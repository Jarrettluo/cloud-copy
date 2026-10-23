const puppeteer = require('puppeteer-core');
const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1/cloud-copy/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join('')), {timeout: 15000});
  const myCode = await page.evaluate(() => [...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join(''));
  // 1. 我的柜子：banner 应不可见
  const bannerVisible = await page.evaluate(() => {
    const b = document.querySelector('#foreignBanner');
    return getComputedStyle(b).display !== 'none';
  });
  console.log('my code:', myCode, '| banner visible (expect false):', bannerVisible);
  // 2. 输入别码：banner 应可见
  await page.evaluate((c) => {
    const other = c === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    const inp = document.querySelector('#switchInput');
    inp.value = other; inp.dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector('#switchBtn').click();
  }, myCode);
  await new Promise(r=>setTimeout(r,900));
  const bannerVisible2 = await page.evaluate(() => {
    const b = document.querySelector('#foreignBanner');
    return getComputedStyle(b).display !== 'none' && !b.hidden;
  });
  console.log('foreign code | banner visible (expect true):', bannerVisible2);
  await page.screenshot({ path: '../screenshots/07-banner-check.png', fullPage: true });
  await browser.close();
  const pass = !bannerVisible && bannerVisible2;
  console.log(pass ? 'BANNER CHECK PASS ✓' : 'BANNER CHECK FAIL ✗');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });

const puppeteer = require('puppeteer-core');
const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 780, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1/cloud-copy/', { waitUntil: 'networkidle2' });
  await sleep(1200);
  const m = await page.evaluate(() => {
    const ps = [...document.querySelectorAll('.grid-top > .panel')];
    const a = ps[0].getBoundingClientRect(), b = ps[1].getBoundingClientRect();
    const cs = getComputedStyle(ps[1]);
    return { top1: +a.top.toFixed(1), top2: +b.top.toFixed(1), diff: +(b.top - a.top).toFixed(1), mt2: cs.marginTop };
  });
  console.log(JSON.stringify(m));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

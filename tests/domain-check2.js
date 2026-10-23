const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE_URL = process.env.CC_BASE_URL || 'http://127.0.0.1/cloud-copy/';
const OUT = __dirname + '/../screenshots';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const cases = [
    ['plain', BASE_URL, null],
    ['wechat-ua', BASE_URL, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44 NetType/WIFI Language/zh_CN'],
  ];
  for (const [name, url, ua] of cases) {
    const p = await browser.newPage();
    if (ua) await p.setUserAgent(ua);
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    try {
      await p.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 800));
      const info = await p.evaluate(() => ({
        title: document.title,
        items: [...document.querySelectorAll('.list-item .item-title')].map(e => e.textContent.trim()),
        hasCloudCopy: document.body.innerHTML.includes('/cloud-copy/'),
      }));
      console.log(name, JSON.stringify(info));
      await p.screenshot({ path: OUT + '/domain-home-' + name + '.png', fullPage: true });
    } catch (e) { console.log(name, 'ERROR', e.message.slice(0,120)); }
    await p.close();
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

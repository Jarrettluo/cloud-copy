const puppeteer = require('puppeteer-core');
const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1/cloud-copy/', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join('')), {timeout: 15000});
  // 上传两个文件
  const fs = require('fs');
  fs.writeFileSync('/tmp/产品设计稿-v2.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
  fs.writeFileSync('/tmp/会议纪要.md', '# 周会纪要\n\n1. 完成取件码功能\n2. 下周上线\n');
  const inp = await p.$('#fileInput');
  await inp.uploadFile('/tmp/产品设计稿-v2.png', '/tmp/会议纪要.md');
  await new Promise(r=>setTimeout(r,3000));
  const code = await p.evaluate(() => [...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join(''));
  await p.screenshot({ path: '../screenshots/10-mobile-final.png', fullPage: true });
  console.log('MOBILE SHOT OK, code:', code);
  await browser.close();
})().catch(e=>{console.error(e); process.exit(1)});

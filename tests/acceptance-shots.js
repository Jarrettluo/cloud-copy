// 最终验收截图（全新）：浅色主视图 + 分享弹窗 + 深色主视图
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1/cloud-copy/', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join('')), {timeout: 15000});
  // 存入两个 demo 文件
  fs.writeFileSync('/tmp/交接资料.md', '# 项目交接\n\n- 云复制 2.0 已上线\n- 支持 2GB / 分享链接\n');
  const b64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  fs.writeFileSync('/tmp/设计草图.png', Buffer.from(b64,'base64'));
  await (await p.$('#fileInput')).uploadFile('/tmp/交接资料.md','/tmp/设计草图.png');
  await new Promise(r=>setTimeout(r,2000));
  // 浅色主视图
  await p.screenshot({ path: '../screenshots/A1-light.png', fullPage: true });
  // 分享弹窗（文件链接）
  await p.evaluate(() => { [...document.querySelectorAll('.frow')].find(r=>r.querySelector('.nm').textContent==='交接资料.md').querySelector('.act-share').click(); });
  await new Promise(r=>setTimeout(r,600));
  await p.screenshot({ path: '../screenshots/A2-file-share.png' });
  await p.evaluate(() => document.querySelector('#shareClose').click());
  await new Promise(r=>setTimeout(r,300));
  // 柜子分享弹窗
  await p.evaluate(() => document.querySelector('#shareAll').click());
  await new Promise(r=>setTimeout(r,600));
  await p.screenshot({ path: '../screenshots/A3-locker-share.png' });
  await p.evaluate(() => document.querySelector('#shareClose').click());
  await new Promise(r=>setTimeout(r,300));
  // 深色
  await p.evaluate(() => document.querySelector('#themeToggle').click());
  await new Promise(r=>setTimeout(r,500));
  await p.screenshot({ path: '../screenshots/A4-dark.png', fullPage: true });
  const code = await p.evaluate(() => [...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join(''));
  console.log('ACCEPTANCE SHOTS OK, demo code:', code);
  fs.writeFileSync('../screenshots/acceptance-code.txt', code);
  await browser.close();
})().catch(e=>{console.error(e); process.exit(1)});

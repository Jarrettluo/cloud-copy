// 验收截图：浅色主题全景 + 分享弹窗 + 深色对比
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1/cloud-copy/', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join('')), {timeout: 15000});
  fs.writeFileSync('/tmp/产品说明书.md', '# 产品说明书 v2\n\n- 云复制：取件码文件柜\n- 支持 2GB 大文件\n- 分享链接直达\n');
  await (await p.$('#fileInput')).uploadFile('/tmp/产品说明书.md');
  await new Promise(r=>setTimeout(r,2200));
  await p.evaluate(() => { document.querySelector('#textName').value='使用备注'; });
  await p.type('#textInput', '给团队的话：\n新产品资料已放入柜子，取件码见下。\n\n—— 佳瑞', {delay:2});
  await p.evaluate(() => document.querySelector('#saveText').click());
  await new Promise(r=>setTimeout(r,2200));
  await p.screenshot({ path: '../screenshots/20-final-light.png', fullPage: true });
  // 分享弹窗
  await p.evaluate(() => document.querySelector('#shareLocker').click());
  await new Promise(r=>setTimeout(r,600));
  await p.screenshot({ path: '../screenshots/21-share-modal.png' });
  await p.evaluate(() => document.querySelector('#shareClose').click());
  // 深色
  await p.evaluate(() => document.querySelector('#themeToggle').click());
  await new Promise(r=>setTimeout(r,500));
  await p.screenshot({ path: '../screenshots/22-final-dark.png', fullPage: true });
  const code = await p.evaluate(() => [...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join(''));
  console.log('SHOTS OK, code:', code);
  fs.writeFileSync('../screenshots/final-shots-code.txt', code);
  await browser.close();
})().catch(e=>{console.error(e); process.exit(1)});

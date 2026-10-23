// 最终展示截图：带真实内容的完整页面（桌面 + 移动）
const puppeteer = require('puppeteer-core');
const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  // 桌面视图
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1.5 });
  await p.goto('http://127.0.0.1/cloud-copy/', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /^[A-Z]{6}$/.test([...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join('')), {timeout: 15000});
  const code = await p.evaluate(() => [...document.querySelectorAll('#codeDisplay .cell')].map(c=>c.textContent).join(''));
  // 上传示例文件
  const fs = require('fs');
  fs.writeFileSync('/tmp/demo-report.md', '# 季度总结\n\n- 完成 A 项目\n- 推进 B 方案\n\n> 通过云复制共享');
  const inp = await p.$('#fileInput');
  await inp.uploadFile('/tmp/demo-report.md');
  await new Promise(r=>setTimeout(r,2500));
  // 写入一段文字
  await p.evaluate(() => { document.querySelector('#textName').value = '给朋友的便签'; });
  await p.type('#textInput', '周五下午三点，老地方见。\n地址：南京东路 128 号 3F。\n\n—— 记得带上那份合同。', {delay:3});
  await p.evaluate(() => document.querySelector('#saveText').click());
  await new Promise(r=>setTimeout(r,2500));
  await p.screenshot({ path: '../screenshots/08-desktop-final.png', fullPage: true });
  // 预览弹窗截图
  await p.evaluate(() => {
    const rows=[...document.querySelectorAll('.frow')];
    rows.find(r=>r.querySelector('.nm').textContent==='给朋友的便签.txt').querySelector('.act-preview').click();
  });
  await new Promise(r=>setTimeout(r,1200));
  await p.screenshot({ path: '../screenshots/09-desktop-preview.png' });
  console.log('SHOTS OK, test code:', code);
  await browser.close();
})().catch(e=>{console.error(e); process.exit(1)});

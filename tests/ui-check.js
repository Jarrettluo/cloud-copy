/* cloud-copy UI 全流程验证（chrome-headless-shell）
 * 1) 首页入口 → 2) /cloud-copy/ 取件码出现 → 3) UI 拖拽上传（真实 File）
 * 4) 文字存入 → 5) 列表渲染 → 6) 预览弹窗（文本+图片）→ 7) 换码/输入查看 → 8) 下载链接
 * 输出截图到 ../screenshots/
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://127.0.0.1';
const OUT = path.resolve(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  | ' + extra : ''));
  if (!cond) fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // ---------- 1. 首页入口 ----------
  const p1 = await browser.newPage();
  await p1.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  await p1.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 });
  const hasEntry = await p1.evaluate(() => !!document.querySelector('a[href="/cloud-copy/"]'));
  ok('首页有云复制入口', hasEntry);
  await p1.screenshot({ path: path.join(OUT, '01-home.png') });
  await p1.close();

  // ---------- 2. 主页面 ----------
  const page = await browser.newPage();
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));

  await page.goto(BASE + '/cloud-copy/', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(() => {
    const cells = [...document.querySelectorAll('#codeDisplay .cell')];
    return cells.length === 6 && cells.map((c) => c.textContent).join('').match(/^[A-Z]{6}$/);
  }, { timeout: 15000 }).catch(() => {});
  const code1 = await page.evaluate(() => [...document.querySelectorAll('#codeDisplay .cell')].map((c) => c.textContent).join(''));
  ok('取件码自动生成且为6位大写', /^[A-Z]{6}$/.test(code1), code1);
  const status = await page.evaluate(() => document.querySelector('#cloudStatus').textContent.trim());
  ok('云端状态已连接', /已连接/.test(status), status);

  // ---------- 3. 拖拽上传（DataTransfer + File 模拟真实拖拽） ----------
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], '拖拽测试图.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    window.dispatchEvent(ev);
  }, pngB64);
  await page.waitForFunction(() => {
    const t = document.querySelector('#uploadTray .tray-item.done');
    return t && /已存入/.test(t.textContent);
  }, { timeout: 20000 }).catch(() => {});
  const trayDone = await page.evaluate(() => {
    const t = document.querySelector('#uploadTray .tray-item');
    return t ? t.textContent : '';
  });
  ok('拖拽上传完成（tray 显示已存入）', /已存入/.test(trayDone), trayDone.slice(0, 80));

  // ---------- 4. 文字存入 ----------
  await page.evaluate(() => { document.querySelector('#textName').value = '备忘录'; });
  await page.type('#textInput', '第一行：这是通过 UI 存入的文字。\n    第二行：保留缩进格式。\n\t第三行：Tab 缩进。\n\n结尾。', { delay: 5 });
  await page.evaluate(() => document.querySelector('#saveText').click());
  await page.waitForFunction(() => {
    return [...document.querySelectorAll('.frow .nm')].some((n) => n.textContent === '备忘录.txt');
  }, { timeout: 20000 }).catch(() => {});
  const names1 = await page.evaluate(() => [...document.querySelectorAll('.frow .nm')].map((n) => n.textContent));
  ok('列表出现两个文件（文字+图片）', names1.length >= 2 && names1.includes('备忘录.txt') && names1.includes('拖拽测试图.png'), names1.join(','));
  const tsShown = await page.evaluate(() => {
    const m = document.querySelector('.frow .fmeta .t');
    return m ? m.textContent : '';
  });
  ok('列表显示时间', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(tsShown), tsShown);

  await page.screenshot({ path: path.join(OUT, '02-main-filled.png'), fullPage: true });

  // ---------- 5. 预览：文本 ----------
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.frow')];
    const row = rows.find((r) => r.querySelector('.nm').textContent === '备忘录.txt');
    row.querySelector('.act-preview').click();
  });
  await page.waitForFunction(() => {
    const pre = document.querySelector('#modalBody pre');
    return pre && pre.textContent.includes('第二行');
  }, { timeout: 10000 }).catch(() => {});
  const previewText = await page.evaluate(() => {
    const pre = document.querySelector('#modalBody pre');
    return pre ? pre.textContent : '';
  });
  ok('文本预览：内容+缩进保留', previewText.includes('    第二行') && previewText.includes('\t第三行'), JSON.stringify(previewText.slice(0, 60)));
  await page.screenshot({ path: path.join(OUT, '03-preview-text.png') });
  await page.evaluate(() => document.querySelector('#modalClose').click());
  await sleep(300);

  // ---------- 6. 预览：图片 ----------
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.frow')];
    const row = rows.find((r) => r.querySelector('.nm').textContent === '拖拽测试图.png');
    row.querySelector('.act-preview').click();
  });
  await sleep(1500);
  const imgOk = await page.evaluate(() => {
    const img = document.querySelector('#modalBody img');
    return img ? (img.complete && img.naturalWidth >= 1) : false;
  });
  ok('图片预览加载成功', imgOk);
  await page.screenshot({ path: path.join(OUT, '04-preview-image.png') });
  await page.evaluate(() => document.querySelector('#modalClose').click());
  await sleep(250);

  // ---------- 7. 下载接口校验（manual redirect，避免 CORS） ----------
  const dlCheck = await page.evaluate(async () => {
    const code = [...document.querySelectorAll('#codeDisplay .cell')].map((c) => c.textContent).join('');
    const r = await fetch('api/list/' + code);
    const d = await r.json();
    const it = d.items.find((x) => x.name === '备忘录.txt');
    // 同源 302：manual 模式得到 opaqueredirect
    const rr = await fetch('api/file/' + code + '/' + encodeURIComponent(it.id) + '?disposition=attachment', { redirect: 'manual' });
    // inline 文本同源直达（服务端代理，200）
    const ri = await fetch('api/file/' + code + '/' + encodeURIComponent(it.id) + '?disposition=inline');
    const txt = (await ri.text()).slice(0, 40);
    return { attType: rr.type, attStatus: rr.status, inline: txt };
  });
  ok('下载接口 302 跳转（opaqueredirect）', dlCheck.attType === 'opaqueredirect', JSON.stringify(dlCheck.attType));
  ok('下载内容正确（经服务端同源校验）', dlCheck.inline.includes('第一行'), JSON.stringify(dlCheck.inline));

  // Node 侧用 302 跟随验证真实下载字节
  {
    const codeNow = code1;
    const listRes = await fetch(`http://127.0.0.1/cloud-copy/api/list/${codeNow}`);
    const listData = await listRes.json();
    const it = listData.items.find((x) => x.name === '备忘录.txt');
    const r = await fetch(`http://127.0.0.1/cloud-copy/api/file/${codeNow}/${encodeURIComponent(it.id)}?disposition=attachment`, { redirect: 'follow' });
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(path.join(OUT, 'dl-verify.txt'), buf.toString('utf8'));
    ok('Node 跟随 302 下载字节正确', r.status === 200 && buf.toString('utf8').includes('第一行'), r.status + ' len=' + buf.length);
  }

  // ---------- 8. 换码 + 手动查看别码 ----------
  page.on('dialog', async (d) => await d.accept());
  await page.evaluate(() => document.querySelector('#regenCode').click());
  await sleep(1600);
  const code2 = await page.evaluate(() => [...document.querySelectorAll('#codeDisplay .cell')].map((c) => c.textContent).join(''));
  ok('换码后为新6位码且≠旧码', /^[A-Z]{6}$/.test(code2) && code2 !== code1, code1 + ' -> ' + code2);
  const recentHas1 = await page.evaluate(() => [...document.querySelectorAll('#recentCodes .chip')].map((c) => c.textContent).includes(document.querySelector('#recentCodes .chip')?.textContent || ''));
  // 切回旧码查看文件仍在
  await page.evaluate((oldCode) => {
    const inp = document.querySelector('#switchInput');
    inp.value = oldCode;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#switchBtn').click();
  }, code1);
  await page.waitForFunction((oldCode) => {
    const banner = document.querySelector('#foreignBanner');
    return !banner.hidden && document.querySelector('#foreignCode').textContent === oldCode;
  }, { timeout: 10000 }, code1).catch(() => {});
  await page.waitForFunction(() => {
    return [...document.querySelectorAll('.frow .nm')].some((n) => n.textContent === '备忘录.txt');
  }, { timeout: 15000 }).catch(() => {});
  const backNames = await page.evaluate(() => [...document.querySelectorAll('.frow .nm')].map((n) => n.textContent));
  ok('输入旧码可查看其文件', backNames.includes('备忘录.txt'), backNames.join(','));
  await page.screenshot({ path: path.join(OUT, '05-foreign-code.png'), fullPage: true });

  // 回到我的柜子
  await page.evaluate(() => document.querySelector('#backHome').click());
  await sleep(800);
  const newCodeEmpty = await page.evaluate(() => document.querySelector('#emptyState')?.classList.contains('show'));
  ok('新码柜子为空（文件未迁移）', !!newCodeEmpty);

  // 空柜子截图
  await page.screenshot({ path: path.join(OUT, '06-new-code-empty.png'), fullPage: true });

  ok('无 console 报错', errors.length === 0, errors.slice(0, 3).join(' | '));

  // ---------- 清理：删除两个测试码下的对象 ----------
  console.log('  · 测试码（待清理）:', code1, code2);

  await browser.close();
  console.log('\\nFAILS:', fail ? fail : 'none — UI ALL PASS ✓');
  fs.writeFileSync(path.join(OUT, 'ui-last-codes.txt'), code1 + '\\n' + code2 + '\\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
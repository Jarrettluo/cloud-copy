/* 预览增强验证 v2：PDF（iframe + 新窗口按钮 + URL 级校验）与 MP4（video 播放器、元数据可加载） */
const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = '/opt/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://127.0.0.1';
const OUT = path.resolve(__dirname, '..', 'screenshots');
let fail = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  | ' + extra : ''));
  if (!cond) fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));

  await page.goto(BASE + '/cloud-copy/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => /^[A-Z]{6}$/.test(
    [...document.querySelectorAll('#codeDisplay .cell')].map(c => c.textContent).join('')),
    { timeout: 15000 });

  const input = await page.$('#fileInput');
  await input.uploadFile('/tmp/test-preview.pdf', '/tmp/test-preview.mp4');
  await sleep(3500);
  const names = await page.evaluate(() => [...document.querySelectorAll('.fname .nm')].map(n => n.textContent));
  ok('上传后列表含 pdf 与 mp4', names.includes('test-preview.pdf') && names.includes('test-preview.mp4'), names.join(','));

  // ===== PDF =====
  const pdfIdx = await page.evaluate(() => [...document.querySelectorAll('.frow')].findIndex(r => r.querySelector('.nm').textContent.includes('.pdf')));
  await page.evaluate((i) => document.querySelectorAll('.frow')[i].querySelector('.act-preview').click(), pdfIdx);
  await sleep(1200);
  const pdfState = await page.evaluate(() => {
    const frame = document.querySelector('#modalBody iframe');
    return {
      iframe: !!frame,
      rawSrc: frame ? frame.getAttribute('src') : '',
      openBtn: !!document.querySelector('#modalBody .pdf-open'),
      modalOpen: document.querySelector('#previewModal').classList.contains('open'),
    };
  });
  ok('PDF 预览弹窗打开', pdfState.modalOpen);
  ok('PDF 用 iframe 内嵌（disposition=inline）', pdfState.iframe && pdfState.rawSrc.includes('disposition=inline'), pdfState.rawSrc.slice(0, 100));
  ok('PDF 新窗口打开按钮存在', pdfState.openBtn);

  // URL 级校验：签名直读返回真实 PDF 内容
  const pdfUrl = 'http://127.0.0.1/cloud-copy/' + pdfState.rawSrc;
  const pr = await fetch(pdfUrl, { redirect: 'follow' });
  const pbuf = Buffer.from(await pr.arrayBuffer());
  ok('PDF 直读 200 + %PDF 内容头', pr.status === 200 && pbuf.slice(0, 5).toString() === '%PDF-',
     `status=${pr.status} ct=${(pr.headers.get('content-type') || '').split(';')[0]} len=${pbuf.length}`);

  await page.screenshot({ path: path.join(OUT, '21-pdf-preview.png') });
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, '21b-pdf-preview-desktop.png') });
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  await page.evaluate(() => document.querySelector('#modalClose').click());
  await sleep(400);

  // ===== MP4 =====
  const mp4Idx = await page.evaluate(() => [...document.querySelectorAll('.frow')].findIndex(r => r.querySelector('.nm').textContent.includes('.mp4')));
  await page.evaluate((i) => document.querySelectorAll('.frow')[i].querySelector('.act-preview').click(), mp4Idx);
  await sleep(800);
  const videoMeta = await page.waitForFunction(() => {
    const v = document.querySelector('#modalBody video');
    return v && v.readyState >= 1 && v.duration > 0;
  }, { timeout: 8000 }).then(() => true).catch(() => false);
  const mp4State = await page.evaluate(() => {
    const v = document.querySelector('#modalBody video');
    return { video: !!v, controls: v ? v.controls : false, duration: v ? v.duration : 0, src: v ? v.getAttribute('src') : '' };
  });
  ok('MP4 预览弹窗打开 + video 播放器 + controls', mp4State.video && mp4State.controls);
  ok('视频元数据可加载（duration>0）', videoMeta && mp4State.duration > 0, `duration=${mp4State.duration}`);

  // URL 级校验：mp4 签名直读
  if (mp4State.src) {
    const mr = await fetch('http://127.0.0.1/cloud-copy/' + mp4State.src, { redirect: 'follow' });
    const mbuf = Buffer.from(await mr.arrayBuffer());
    ok('MP4 直读 200 + ftyp 内容头', mr.status === 200 && mbuf.slice(4, 8).toString() === 'ftyp',
       `status=${mr.status} ct=${(mr.headers.get('content-type') || '').split(';')[0]} len=${mbuf.length}`);
  }
  await page.screenshot({ path: path.join(OUT, '22-mp4-preview.png') });
  await page.evaluate(() => document.querySelector('#modalClose').click());
  await sleep(400);

  const status = await page.evaluate(() => document.querySelector('#cloudStatus').textContent.trim());
  ok('云端状态显示存储后端', /华为云 OBS|OBS|MinIO/.test(status), status);

  await sleep(500);
  ok('无 console 错误', errors.length === 0, errors.join(' ; ').slice(0, 200));
  await browser.close();
  console.log(fail ? `\nFAILS: ${fail}` : '\nALL PASS ✓');
  process.exit(fail ? 1 : 0);
})();
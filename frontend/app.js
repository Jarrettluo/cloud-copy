/* ===== 云复制 CloudCopy · app.js v2 ===== */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const API = 'api'; // 相对路径：/cloud-copy/api/...
  const LS_CODE = 'cc_my_code';
  const LS_RECENT = 'cc_recent_codes';
  const LS_THEME = 'cc_theme';
  const CODE_RE = /^[A-Z]{6}$/;

  /* ---------- 图标（Lucide 内联 SVG；全站禁用 emoji） ---------- */
  const LI = (inner) => '<svg class="li" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  const ICONS = {
    sun: LI('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
    moon: LI('<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>'),
    arrowRight: LI('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
    link: LI('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
    check: LI('<path d="M20 6 9 17l-5-5"/>'),
    circleCheck: LI('<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>'),
    circleX: LI('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
    fileText: LI('<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
    fileImage: LI('<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><circle cx="10" cy="12" r="2"/><path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"/>'),
    fileAudio: LI('<path d="M4 6.835V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-.343"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M2 19a2 2 0 0 1 4 0v1a2 2 0 0 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 0 1-4 0v-1a2 2 0 0 1 4 0"/>'),
    fileVideo: LI('<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M15.033 13.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56v-4.704a.645.645 0 0 1 .967-.56z"/>'),
    bookText: LI('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="M8 11h8"/><path d="M8 7h6"/>'),
    file: LI('<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>'),
    fileQuestion: LI('<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M12 17h.01"/><path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/>'),
    inbox: LI('<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'),
    searchX: LI('<path d="m13.5 8.5-5 5"/><path d="m8.5 8.5 5 5"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  };

  const state = {
    myCode: '',
    activeCode: '',
    items: [],
    limits: { maxFileMb: 2048, maxTextKb: 512 },
    seq: 0,
    busy: false,
  };

  /* ---------- 小工具 ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (Math.round(n * 10) / 10) + ' ' + u[i];
  }

  function lsGet(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function recentList() {
    try { return JSON.parse(lsGet(LS_RECENT, '[]')) || []; } catch (e) { return []; }
  }
  function pushRecent(code) {
    if (!CODE_RE.test(code)) return;
    let list = recentList().filter((x) => x.code !== code);
    list.unshift({ code, ts: Date.now() });
    list = list.slice(0, 8);
    lsSet(LS_RECENT, JSON.stringify(list));
    renderRecent();
  }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      const msg = (data && data.detail) ? data.detail : ('请求失败 (HTTP ' + res.status + ')');
      throw new Error(msg);
    }
    return data;
  }

  /* ---------- 主题 ---------- */
  function applyTheme(t, persist) {
    const dark = t === 'dark';
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', dark ? '#0a0e14' : '#f2f5f8');
    const btn = $('#themeToggle');
    if (btn) btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
    if (persist) lsSet(LS_THEME, t);
  }
  function toggleTheme() {
    const dark = document.documentElement.hasAttribute('data-theme');
    applyTheme(dark ? 'light' : 'dark', true);
  }

  /* ---------- toast ---------- */
  function toast(msg, type = '') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const tic = type === 'ok' ? ICONS.circleCheck : type === 'err' ? ICONS.circleX : '';
    el.innerHTML = (tic ? '<span class="tic">' + tic + '</span>' : '') + '<span class="tmsg">' + esc(msg) + '</span>';
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 3200);
  }

  /* ---------- 复制（http 环境无 clipboard API 时降级） ---------- */
  function copyText(text) {
    return new Promise((resolve, reject) => {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(resolve, () => fallback());
      } else fallback();
      function fallback() {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
          document.body.appendChild(ta);
          ta.focus(); ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          ok ? resolve() : reject(new Error('copy failed'));
        } catch (e) { reject(e); }
      }
    });
  }

  /* ---------- 取件码展示 ---------- */
  function renderCode(code, foreign) {
    const box = $('#codeDisplay');
    box.classList.toggle('foreign', !!foreign);
    box.innerHTML = '';
    const chars = (code || '······').padEnd(6, '·').slice(0, 6).split('');
    chars.forEach((ch, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell flip';
      cell.style.animationDelay = (i * 45) + 'ms';
      cell.textContent = ch;
      box.appendChild(cell);
    });
    $('#codeLabel').textContent = foreign ? '正在查看的取件码 · Viewing' : '我的取件码 · My Code';
    const scope = code ? code : '······';
    $('#dzScope').innerHTML = ICONS.arrowRight + ' 存入取件码 ' + scope;
    $('#textScope').textContent = '取件码 ' + scope;
  }

  function renderRecent() {
    const box = $('#recentCodes');
    const list = recentList().filter((x) => x.code !== state.activeCode);
    box.innerHTML = '';
    list.forEach((x) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = x.code;
      chip.title = '切换到 ' + x.code;
      chip.addEventListener('click', () => setActive(x.code));
      box.appendChild(chip);
    });
  }

  /* ---------- 激活某个取件码 ---------- */
  function setActive(code, opts = {}) {
    state.activeCode = code;
    const foreign = code !== state.myCode;
    renderCode(code, foreign);
    $('#foreignCode').textContent = code;
    $('#foreignBanner').hidden = !foreign;
    pushRecent(code);
    renderRecent();
    if (!opts.silent) loadList();
    $('#switchInput').value = '';
    if (!opts.noScroll && window.scrollY > 300) {
      $('#fileList').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ---------- 列表 ---------- */
  async function loadList() {
    const mySeq = ++state.seq;
    const code = state.activeCode;
    $('#fileCount').textContent = '';
    try {
      const data = await api('/list/' + code);
      if (mySeq !== state.seq) return;
      state.items = data.items || [];
      renderList();
    } catch (e) {
      if (mySeq !== state.seq) return;
      toast(e.message || '列表加载失败', 'err');
      state.items = [];
      renderList();
    }
  }

  const KIND_META = {
    text: { icon: ICONS.fileText, label: 'TEXT' },
    image: { icon: ICONS.fileImage, label: 'IMG' },
    audio: { icon: ICONS.fileAudio, label: 'AUD' },
    video: { icon: ICONS.fileVideo, label: 'VID' },
    pdf: { icon: ICONS.bookText, label: 'PDF' },
    other: { icon: ICONS.file, label: 'FILE' },
  };

  function renderList() {
    const box = $('#fileList');
    const empty = $('#emptyState');
    box.innerHTML = '';
    const n = state.items.length;
    $('#fileCount').textContent = n ? ('共 ' + n + ' 个') : '';
    if (!n) {
      empty.classList.add('show');
      empty.innerHTML = state.activeCode === state.myCode
        ? '<span class="big">' + ICONS.inbox + '</span>柜子还是空的<br>把文件拖进上方区域，或写一段文字存入'
        : '<span class="big">' + ICONS.searchX + '</span>这个取件码下还没有文件';
      return;
    }
    empty.classList.remove('show');
    state.items.forEach((it) => {
      const meta = KIND_META[it.kind] || KIND_META.other;
      const row = document.createElement('div');
      row.className = 'frow';
      row.innerHTML =
        '<div class="ficon">' + meta.icon + '</div>' +
        '<div class="fmain">' +
          '<div class="fname"><span class="nm" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' +
          '<span class="tag">' + meta.label + '</span></div>' +
          '<div class="fmeta"><span class="t">' + esc(it.time) + '</span><span>·</span><span>' + fmtSize(it.size) + '</span></div>' +
        '</div>' +
        '<div class="facts">' +
          '<button class="btn ghost sm act-preview">预览</button>' +
          '<button class="btn ghost sm act-share">链接</button>' +
          '<button class="btn sm act-download">下载</button>' +
        '</div>';
      $('.act-preview', row).addEventListener('click', () => openPreview(it));
      $('.act-share', row).addEventListener('click', () => shareFile(it));
      $('.act-download', row).addEventListener('click', () => downloadItem(it));
      box.appendChild(row);
    });
  }

  /* ---------- 链接 ---------- */
  function baseUrl() {
    return location.origin + location.pathname.replace(/\/+$/, '') + '/';
  }
  // 柜子分享链接：?code=XXXXXX
  function lockerLink(code) { return baseUrl() + '?code=' + code; }
  // 文件分享链接：自包含 fid，打开即下载（≤900s 有效期的 OBS 签名在中转，链接本身永久可用）
  function fileLink(it) { return baseUrl() + 'api/d/' + encodeURIComponent(it.id); }

  /* ---------- 下载 / 预览 ---------- */
  function fileUrl(it, disposition) {
    return API + '/file/' + state.activeCode + '/' + encodeURIComponent(it.id) +
      '?disposition=' + disposition;
  }
  function downloadItem(it) {
    const a = document.createElement('a');
    a.href = fileUrl(it, 'attachment');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  let currentPreview = null;
  function openPreview(it) {
    currentPreview = it;
    const meta = KIND_META[it.kind] || KIND_META.other;
    $('#modalName').textContent = it.name;
    $('#modalMeta').textContent = meta.label + ' · ' + fmtSize(it.size) + ' · ' + it.time;
    const body = $('#modalBody');
    body.innerHTML = '<div class="mloading">加载中…</div>';
    $('#modalDownload').onclick = () => downloadItem(it);
    $('#modalCopyLink').onclick = () => copyLink(fileLink(it), '文件下载链接已复制，可直接发给朋友');
    $('#previewModal').hidden = false;
    $('#previewModal').classList.add('open');
    document.body.style.overflow = 'hidden';

    if (it.kind === 'text') {
      fetch(fileUrl(it, 'inline')).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then((text) => {
        if (currentPreview !== it) return;
        body.innerHTML = '';
        const pre = document.createElement('pre');
        pre.textContent = text;
        body.appendChild(pre);
      }).catch((e) => {
        if (currentPreview !== it) return;
        body.innerHTML = '<div class="mnote">预览失败：' + esc(e.message) + '<br>可尝试下载后查看</div>';
      });
    } else if (it.kind === 'image') {
      body.innerHTML = '';
      const img = document.createElement('img');
      img.src = fileUrl(it, 'inline');
      img.alt = it.name;
      img.addEventListener('error', () => {
        if (currentPreview !== it) return;
        body.innerHTML = '<div class="mnote">加载失败，可尝试下载后查看</div>';
      });
      body.appendChild(img);
    } else if (it.kind === 'pdf') {
      // PDF：优先浏览器原生查看器（iframe），失败时回退到新建标签页打开
      body.innerHTML = '';
      const frame = document.createElement('iframe');
      frame.src = fileUrl(it, 'inline');
      frame.title = it.name;
      frame.addEventListener('error', () => {
        if (currentPreview !== it) return;
        body.innerHTML = '<div class="mnote">PDF 预览失败，可点击右下角「下载文件」查看</div>';
      });
      body.appendChild(frame);
      // 移动端部分浏览器不支持内嵌 PDF，提供「新窗口打开」入口
      const openBtn = document.createElement('button');
      openBtn.className = 'btn ghost sm pdf-open';
      openBtn.innerHTML = ICONS.arrowRight + ' 新窗口打开';
      openBtn.addEventListener('click', () => window.open(fileUrl(it, 'inline'), '_blank'));
      body.appendChild(openBtn);
    } else if (it.kind === 'audio' || it.kind === 'video') {
      body.innerHTML = '';
      const el = document.createElement(it.kind);
      el.src = fileUrl(it, 'inline');
      el.controls = true;
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      if (it.kind === 'audio') el.style.marginTop = '20px';
      el.preload = 'metadata';
      el.addEventListener('error', () => {
        if (currentPreview !== it) return;
        body.innerHTML = '<div class="mnote">加载失败，可尝试下载后查看</div>';
      });
      body.appendChild(el);
    } else {
      body.innerHTML = '<div class="mnote">' + ICONS.fileQuestion + ' 这类文件暂不支持在线预览<br>点击右下角「下载文件」查看</div>';
    }
  }

  function closePreview() {
    currentPreview = null;
    const m = $('#previewModal');
    m.classList.remove('open');
    m.hidden = true;
    $('#modalBody').innerHTML = '';
    document.body.style.overflow = '';
  }

  /* ---------- 分享弹窗 ---------- */
  let shareContext = null;
  function openShare(title, sub, link, tip) {
    shareContext = link;
    $('#shareTitle').textContent = title;
    $('#shareSub').textContent = sub;
    $('#shareInput').value = link;
    $('#shareTip').textContent = tip;
    $('#shareModal').hidden = false;
    $('#shareModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { $('#shareInput').select(); }, 60);
  }
  function closeShare() {
    $('#shareModal').hidden = true;
    $('#shareModal').classList.remove('open');
    document.body.style.overflow = '';
  }
  function copyLink(link, okMsg) {
    copyText(link).then(
      () => toast(okMsg || '链接已复制', 'ok'),
      () => toast('复制失败，请手动复制', 'err'));
  }
  function shareLocker() {
    const code = state.activeCode;
    const mine = code === state.myCode;
    openShare(
      mine ? '分享我的柜子' : '分享取件码 ' + code,
      '取件码 ' + code + ' · ' + state.items.length + ' 个文件',
      lockerLink(code),
      mine
        ? '朋友打开此链接将直接进入你的柜子（' + code + '），可查看和下载全部文件。链接长期有效。'
        : '朋友打开此链接将直接进入取件码 ' + code + ' 的柜子。'
    );
  }
  function shareFile(it) {
    openShare(
      '分享文件下载链接',
      it.name + ' · ' + fmtSize(it.size),
      fileLink(it),
      '朋友打开链接即可直接下载该文件（链接长期有效）。也可在预览弹窗中点「复制下载链接」。'
    );
  }

  /* ---------- 上传 ---------- */
  function trayAdd(file) {
    const tray = $('#uploadTray');
    const el = document.createElement('div');
    el.className = 'tray-item';
    el.innerHTML =
      '<span class="tname" title="' + esc(file.name) + '">' + esc(file.name) + '</span>' +
      '<span class="bar"><i></i></span>' +
      '<span class="tstat">等待中</span>';
    tray.appendChild(el);
    return el;
  }

  // 小文件：经服务器中转（简单可靠，≤64MB）
  function uploadViaServer(file, el) {
    const code = state.activeCode;
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', API + '/upload_file');
      const fd = new FormData();
      fd.append('code', code);
      fd.append('file', file, file.name);
      const bar = $('.bar i', el);
      const stat = $('.tstat', el);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + '%';
      };
      xhr.onload = () => {
        let res = null;
        try { res = JSON.parse(xhr.responseText); } catch (e2) { /* ignore */ }
        if (xhr.status === 200 && res && res.ok) {
          bar.style.width = '100%';
          stat.innerHTML = ICONS.check + '已存入';
          el.classList.add('done');
          resolve(res.item);
        } else {
          stat.textContent = '失败';
          el.classList.add('err');
          reject(new Error((res && res.detail) || ('HTTP ' + xhr.status)));
        }
      };
      xhr.onerror = () => { stat.textContent = '网络错误'; el.classList.add('err'); reject(new Error('网络错误')); };
      xhr.send(fd);
    });
  }

  // 大文件：先向服务器申请直传签名 → 浏览器直接上传到 OBS（不经服务器带宽）
  async function uploadViaObs(file, el) {
    const code = state.activeCode;
    const bar = $('.bar i', el);
    const stat = $('.tstat', el);
    const init = await api('/upload_init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, filename: file.name, size: file.size }),
    });
    if (init.mode === 'single') {
      stat.textContent = '上传中 0%';
      await directPut(init.url, file, init.ctype || '', (pct) => {
        bar.style.width = pct + '%';
        stat.textContent = '上传中 ' + pct + '%';
      });
      const done = await api('/upload_complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, key: init.key, size: file.size }),
      });
      bar.style.width = '100%'; stat.innerHTML = ICONS.check + '已存入'; el.classList.add('done');
      return done.item;
    }
    // multipart
    stat.textContent = '分片准备…';
    const parts = [];
    const total = init.count;
    let finishedBytes = 0;
    for (let i = 0; i < total; i++) {
      const start = i * init.partSize;
      const end = Math.min(file.size, start + init.partSize);
      const blob = file.slice(start, end);
      let lastPct = 0;
      const etag = await directPut(init.parts[i], blob, init.ctype || 'application/octet-stream', (pct) => {
        lastPct = pct;
        const overall = Math.min(100, Math.round(((finishedBytes + (end - start) * pct / 100) / file.size) * 100));
        bar.style.width = overall + '%';
        stat.textContent = '上传中 ' + overall + '%（分片 ' + (i + 1) + '/' + total + '）';
      });
      if (!etag) throw new Error('分片 ' + (i + 1) + ' 上传失败');
      parts.push({ partNum: i + 1, etag });
      finishedBytes += (end - start);
    }
    stat.textContent = '合并中…';
    const done = await api('/upload_complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, key: init.key, size: file.size, uploadId: init.uploadId, parts }),
    });
    bar.style.width = '100%'; stat.innerHTML = ICONS.check + '已存入'; el.classList.add('done');
    return done.item;
  }

  // 直传单个 PUT（XMLHttpRequest 以便进度回显）；返回 ETag（multipart 需要）
  function directPut(url, blob, ctype, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      if (ctype) xhr.setRequestHeader('Content-Type', ctype);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.getResponseHeader('ETag') || '');
        } else {
          let msg = 'HTTP ' + xhr.status;
          try {
            const m = xhr.responseText.match(/<Message>([^<]+)<\/Message>/);
            if (m) msg = m[1];
          } catch (e) { /* ignore */ }
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error('网络错误（直传）'));
      xhr.send(blob);
    });
  }

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length || state.busy) return;
    if (!state.activeCode) { toast('取件码还没准备好，稍等一下', 'err'); return; }
    state.busy = true;
    let ok = 0, fail = 0, tooBig = 0;
    const SINGLE_LIMIT = 64 * 1024 * 1024; // 与后端 SINGLE_PUT_LIMIT_MB 对齐
    for (const f of files) {
      const el = trayAdd(f);
      if (f.size > state.limits.maxFileMb * 1024 * 1024) {
        $('.tstat', el).textContent = '超过上限';
        el.classList.add('err');
        tooBig++; fail++;
        continue;
      }
      try {
        if (f.size <= SINGLE_LIMIT) {
          await uploadViaServer(f, el);
        } else {
          try {
            await uploadViaObs(f, el);
          } catch (e) {
            // 直传失败（例如个别浏览器 CORS 限制）→ 回退服务器中转（仅限能承受的大小内）
            if (f.size <= 200 * 1024 * 1024) {
              toast('「' + f.name.slice(0, 20) + '」直传失败，改用服务器中转…');
              $('.tstat', el).textContent = '重试中…';
              await uploadViaServer(f, el);
            } else {
              throw e;
            }
          }
        }
        ok++;
      } catch (e) {
        $('.tstat', el).textContent = '失败';
        el.classList.add('err');
        fail++;
        toast('「' + f.name.slice(0, 20) + '」上传失败：' + e.message, 'err');
      }
    }
    state.busy = false;
    if (ok) toast('成功存入 ' + ok + ' 个文件', 'ok');
    if (tooBig) toast(tooBig + ' 个文件超过 ' + state.limits.maxFileMb + 'MB，未上传', 'err');
    loadList();
    setTimeout(() => { const tray = $('#uploadTray'); if (tray && !tray.querySelector('.tray-item:not(.done):not(.err)')) tray.innerHTML = ''; }, 4200);
  }

  /* ---------- 文字保存 ---------- */
  async function saveText() {
    const ta = $('#textInput');
    const content = ta.value;
    if (!content.trim()) { toast('先写点内容再存～', 'err'); return; }
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > state.limits.maxTextKb * 1024) {
      toast('文字超过 ' + state.limits.maxTextKb + 'KB 上限', 'err');
      return;
    }
    const btn = $('#saveText');
    btn.disabled = true;
    try {
      await api('/upload_text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: state.activeCode, filename: $('#textName').value.trim(), content }),
      });
      toast('文字已存入 ' + state.activeCode, 'ok');
      ta.value = '';
      $('#textName').value = '';
      updateCount();
      loadList();
    } catch (e) {
      toast(e.message || '保存失败', 'err');
    } finally {
      updateCount();
    }
  }

  function updateCount() {
    const ta = $('#textInput');
    const bytes = new TextEncoder().encode(ta.value).length;
    $('#textCount').textContent = ta.value.length + ' 字 · ' + fmtSize(bytes);
    $('#saveText').disabled = !ta.value.trim();
  }

  /* ---------- 顶部：我的取件码 ---------- */
  async function ensureMyCode() {
    let code = lsGet(LS_CODE, '');
    if (!CODE_RE.test(code)) {
      try {
        const data = await api('/new_code');
        code = data.code;
        lsSet(LS_CODE, code);
      } catch (e) {
        toast('取件码获取失败：' + (e.message || '网络问题'), 'err');
        renderCode('', false);
        return;
      }
    }
    state.myCode = code;

    // URL ?code=XXXXXX —— 朋友打开的分享链接：直接进入该柜子
    let urlCode = '';
    try { urlCode = (new URLSearchParams(location.search).get('code') || '').toUpperCase(); } catch (e) { /* ignore */ }
    if (CODE_RE.test(urlCode)) {
      setActive(urlCode, { noScroll: true });
      if (urlCode !== code) {
        setTimeout(() => toast('已打开分享的柜子：' + urlCode, 'ok'), 400);
      }
    } else {
      setActive(code, { noScroll: true });
    }
    renderRecent();
  }

  function regenCode() {
    if (!confirm('生成一个新取件码？\n\n新存入的文件会放在新码下；旧码下的文件依然有效，可随时切回。')) return;
    if (state.myCode) pushRecent(state.myCode);
    api('/new_code').then((data) => {
      state.myCode = data.code;
      lsSet(LS_CODE, data.code);
      setActive(data.code, { silent: true });
      loadList();
      toast('已换新码：' + data.code, 'ok');
    }).catch((e) => toast('换码失败：' + (e.message || ''), 'err'));
  }

  /* ---------- 切换取件码 ---------- */
  function switchTo(input) {
    const code = (input.value || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
    input.value = code;
    if (!CODE_RE.test(code)) { toast('取件码是 6 位大写字母', 'err'); return; }
    if (code === state.activeCode) { toast('已经在看这个码啦'); return; }
    setActive(code);
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    // 主题
    $('#themeToggle').addEventListener('click', toggleTheme);
    applyTheme(lsGet(LS_THEME, '') === 'dark' ? 'dark' : 'light', false);

    // 顶部按钮
    $('#copyCode').addEventListener('click', () => {
      if (!state.activeCode) return;
      copyText(state.activeCode).then(
        () => toast('取件码已复制：' + state.activeCode, 'ok'),
        () => toast('复制失败，请手动输入', 'err'));
    });
    $('#shareLocker').addEventListener('click', shareLocker);
    $('#shareAll').addEventListener('click', shareLocker);
    $('#regenCode').addEventListener('click', regenCode);
    $('#switchBtn').addEventListener('click', () => switchTo($('#switchInput')));
    $('#switchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') switchTo(e.currentTarget); });
    $('#switchInput').addEventListener('input', (e) => {
      e.currentTarget.value = e.currentTarget.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
    });
    $('#backHome').addEventListener('click', () => setActive(state.myCode));
    $('#refreshBtn').addEventListener('click', loadList);

    // 拖拽
    const dz = $('#dropZone');
    const fi = $('#fileInput');
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    fi.addEventListener('change', () => { handleFiles(fi.files); fi.value = ''; });

    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => {
      if (![...(e.dataTransfer.types || [])].includes('Files')) return;
      dragDepth++; document.body.classList.add('dragging');
    });
    window.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) document.body.classList.remove('dragging');
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      dragDepth = 0; document.body.classList.remove('dragging');
      const t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });

    // 文字
    $('#textInput').addEventListener('input', updateCount);
    $('#textInput').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveText(); }
    });
    $('#saveText').addEventListener('click', saveText);

    // 弹窗：预览
    $('#modalClose').addEventListener('click', closePreview);
    $('#modalBackdrop').addEventListener('click', closePreview);
    // 弹窗：分享
    $('#shareClose').addEventListener('click', closeShare);
    $('#shareBackdrop').addEventListener('click', closeShare);
    $('#shareCopyBtn').addEventListener('click', () => {
      if (shareContext) copyLink(shareContext, '已复制');
    });
    $('#shareOpenBtn').addEventListener('click', () => { if (shareContext) window.open(shareContext, '_blank'); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closePreview(); closeShare(); }
    });
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    bind();
    updateCount();
    try {
      const h = await api('/health');
      state.limits.maxFileMb = h.max_file_mb || 2048;
      state.limits.maxTextKb = h.max_text_kb || 512;
      const mb = state.limits.maxFileMb;
      $('#maxMb').textContent = mb >= 1024 ? (Math.round(mb / 1024 * 10) / 10) + 'GB' : mb + 'MB';
      // 存储后端名由后端上报（OBS / MinIO 私有部署），避免前端写死
      let label = h.storage_label || '对象存储';
      if (!h.storage_label && h.storage === 's3') label = 'MinIO / S3';
      $('#cloudStatus').innerHTML = '<span class="dot"></span> 云端已连接 · ' + esc(label);
    } catch (e) {
      $('#cloudStatus').innerHTML = '<span class="dot off"></span> 云端离线';
    }
    ensureMyCode();
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
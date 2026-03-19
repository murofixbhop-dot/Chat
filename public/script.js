// ═══════════════════════════════════════════════════
// AURA MESSENGER — script.js
// Principal Engineer / UI Lead  2026
// ← КРАСОТА: код как архитектура
// ═══════════════════════════════════════════════════

'use strict';

// ── Socket (must be first) ──────────────────────────
const socket = io({ reconnectionAttempts: 5, timeout: 10000 });

// ══════════════════════════════════════════════
// SPLASH / LOADING  ← КРАСОТА
// ══════════════════════════════════════════════
const splash     = document.getElementById('loadingScreen');
const splashText = document.getElementById('loadingText');
const splashFill = document.getElementById('splashFill');

let splashProgress = 0;
const splashInterval = setInterval(() => {
  splashProgress = Math.min(splashProgress + Math.random() * 18, 85);
  if (splashFill) splashFill.style.width = splashProgress + '%';
}, 200);

function hideSplash() {
  if (!splash || !splash.classList.contains('active')) return;
  clearInterval(splashInterval);
  if (splashFill) splashFill.style.width = '100%';
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => splash.classList.remove('active'), 420);
  }, 250);
}

socket.on('connect', () => {
  if (splashText) splashText.textContent = 'Подключено ✓';
  if (currentUser) {
    socket.emit('identify', currentUser);
    loadUserData();
    // Re-broadcast our peerId after reconnect
    if (myPeerId) socket.emit('peer-id', { username: currentUser, peerId: myPeerId });
  }
});
socket.on('connect_error', () => {
  if (splashText) splashText.textContent = 'Ошибка соединения…';
  setTimeout(hideSplash, 1200);
});
socket.on('reconnect_failed', () => hideSplash());

// Hide splash after max 700ms regardless
setTimeout(hideSplash, 700);

// ══════════════════════════════════════════════
// PALETTE / THEME BOOTSTRAP  ← КРАСОТА
// ══════════════════════════════════════════════
(function bootstrap() {
  const theme  = localStorage.getItem('aura_theme')  || 'dark';
  const accent = localStorage.getItem('aura_accent') || '#6366f1';
  const pal    = localStorage.getItem('aura_pal')    || 'violet';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-pal', pal);
  document.documentElement.style.setProperty('--accent', accent);
  const secondMap = { '#6366f1':'#8b5cf6','#06b6d4':'#0891b2','#f43f5e':'#e11d48','#10b981':'#059669','#f59e0b':'#d97706','#ec4899':'#db2777' };
  document.documentElement.style.setProperty('--accent2', secondMap[accent] || '#8b5cf6');
  const glow = accent + '59'; // ~35% opacity
  document.documentElement.style.setProperty('--accent-glow', glow);
  // Sync palette buttons once DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.pal').forEach(b => {
      b.classList.toggle('active', b.dataset.pal === pal);
    });
  });
})();

// ══════════════════════════════════════════════
// STATE  ← single source of truth
// ══════════════════════════════════════════════
let currentUser    = null;
let userData       = { nickname:'', avatar:null, theme:'dark' };
let currentRoom    = 'general';
let friends        = [];
let groups         = [];
let friendRequests = [];
let userAvatars    = {};
let selectedFiles  = [];

// Recording state
let mediaRecorder  = null;
let audioChunks    = [];
let recStream      = null;
let recTimer       = null;
let recSeconds     = 0;
let isRecording    = false;

// Circle state
let circleRec      = null;
let circleChunks   = [];
let circleStream   = null;
let circleTimerID  = null;
let circleSecs     = 0;

// Peer / call
let peer           = null;
let currentCall    = null;
let localStream    = null;

// ══════════════════════════════════════════════
// DOM REFS  ← keep it clean
// ══════════════════════════════════════════════
const $ = id => document.getElementById(id);

const msgInput      = $('msgInput');
const sendBtn       = $('sendBtn');
const sendIco       = $('sendIco');
const messagesDiv   = $('messages');
const msgsEmpty     = $('msgsEmpty');
const attachBtn     = $('attachBtn');
const attachMenu    = $('attachMenu');
const fpBar         = $('fpBar');
const recBar        = $('recBar');
const recTimer_el   = $('recTimer');
const recType_el    = $('recType');
const onlineCount   = $('onlineCount');
const onlinePill    = $('onlinePill');
const roomName      = $('roomName');
const roomSub       = $('roomSub');
const roomAvatar    = $('roomAvatar');
const hdrRight      = $('hdrRight');
const friendsList   = $('friendsList');
const groupsList    = $('groupsList');
const requestsList  = $('requestsList');
const reqBadge      = $('reqBadge');
const profileAvatar = $('profileAvatar');
const profileNick   = $('profileNickname');
const profileUser   = $('profileUsername');
const sidebar       = $('sidebar');
const searchBox     = $('searchBox');
const app           = $('app');
const loginScreen   = $('loginScreen');

// ══════════════════════════════════════════════
// TOAST  ← УДОБСТВО
// ══════════════════════════════════════════════
function toast(msg, type = 'info', dur = 3500) {
  const icons = { info:'ti-info-circle', success:'ti-circle-check', error:'ti-circle-x', warning:'ti-alert-triangle' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="ti ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  $('toastContainer').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, dur);
}

// ══════════════════════════════════════════════
// DIALOG  ← УДОБСТВО: кастомные окна (no alert!)
// ══════════════════════════════════════════════
function dialog({ icon = 'ti-info-circle', iconType = 'info', title, msg, input = false, placeholder = '', ok = 'OK', cancel = null, danger = false }) {
  return new Promise(resolve => {
    const overlay = $('dialogOverlay');
    const box     = $('dialogBox');
    box.innerHTML = `
      <div class="dlg-ico ${iconType}"><i class="ti ${icon}"></i></div>
      <h3>${title}</h3>
      ${msg ? `<p>${msg}</p>` : ''}
      ${input ? `<input type="text" id="dlgIn" class="field" placeholder="${placeholder}" autocomplete="off" style="margin-bottom:16px"/>` : ''}
      <div class="dlg-btns">
        ${cancel ? `<button class="btn-secondary" id="dlgNo">${cancel}</button>` : ''}
        <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="dlgOk">${ok}</button>
      </div>`;
    overlay.classList.add('open');
    if (input) setTimeout(() => $('dlgIn')?.focus(), 60);
    $('dlgIn')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('dlgOk').click(); });
    const close = v => { overlay.classList.remove('open'); resolve(v); };
    $('dlgOk').onclick  = () => close(input ? $('dlgIn')?.value?.trim() || null : true);
    if (cancel) $('dlgNo').onclick = () => close(null);
    overlay.onclick = e => { if (e.target === overlay) close(null); };
  });
}

// ══════════════════════════════════════════════
// PALETTE / ACCENT  ← КРАСОТА
// ══════════════════════════════════════════════
const accentSecond = { '#6366f1':'#8b5cf6','#06b6d4':'#0891b2','#f43f5e':'#e11d48','#10b981':'#059669','#f59e0b':'#d97706','#ec4899':'#db2777' };
const palMap       = { violet:'#6366f1', cyan:'#06b6d4', rose:'#f43f5e' };

function applyAccent(hex) {
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent2', accentSecond[hex] || '#8b5cf6');
  // Update glow and dim so logo, buttons and orbs all update instantly
  document.documentElement.style.setProperty('--accent-glow', hex + '59');
  document.documentElement.style.setProperty('--accent-dim',  hex + '2e');
}

function applyPalette(name) {
  const hex = palMap[name] || '#6366f1';
  document.documentElement.setAttribute('data-pal', name);
  applyAccent(hex);
  localStorage.setItem('aura_pal', name);
  localStorage.setItem('aura_accent', hex);
  document.querySelectorAll('.pal').forEach(b => b.classList.toggle('active', b.dataset.pal === name));
}

// ══════════════════════════════════════════════
// LOGIN  ← УДОБСТВО
// ══════════════════════════════════════════════
function showLogin() {
  loginScreen.style.display = 'flex';
  loginScreen.classList.add('open');
  setTimeout(() => $('loginInput')?.focus(), 100);
}

async function doLogin() {
  const username = $('loginInput').value.trim();
  const password = $('loginPassInput')?.value?.trim() || '';
  const errEl    = $('loginErr');
  errEl.textContent = '';

  if (!username) {
    errEl.textContent = 'Введите имя пользователя';
    $('loginInput').focus();
    return;
  }
  if (password.length < 4) {
    errEl.textContent = 'Пароль должен быть не менее 4 символов';
    $('loginPassInput').focus();
    return;
  }

  const btn = $('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>';

  try {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const d = await r.json();
    if (d.success) {
      localStorage.setItem('aura_user', d.user.username);
      localStorage.setItem('aura_pass', password); // for auto-restore
      // Show welcome message for new registrations
      if (d.isNew) toast(`Добро пожаловать, ${d.user.username}!`, 'success');
      startSession(d.user);
    } else {
      errEl.textContent = d.error || 'Ошибка входа';
      $('loginPassInput').focus();
      $('loginPassInput').select();
    }
  } catch {
    errEl.textContent = 'Нет соединения с сервером';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Войти <i class="ti ti-arrow-right"></i>';
  }
}

function togglePassVisibility() {
  const input = $('loginPassInput');
  const icon  = $('passEyeIcon');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  icon.className = input.type === 'password' ? 'ti ti-eye' : 'ti ti-eye-off';
}

function startSession(user) {
  currentUser = user.username;
  userData    = user;
  loginScreen.classList.remove('open');
  loginScreen.style.display = 'none';
  app.classList.remove('hidden');
  app.style.display = 'flex';
  updateProfileUI();
  socket.emit('identify', currentUser);
  loadUserData();
  enableInput();
  initCallDOM();
  // initPeer() removed — using Socket.IO signaling instead
  gotoRoom('general');
  setupDragDrop();
  setupKeyboardShortcuts(); // ← УДОБСТВО
}

// Auto-restore session
const savedUser = localStorage.getItem('aura_user');
const savedPass = localStorage.getItem('aura_pass');
if (savedUser && savedPass) {
  fetch('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: savedUser, password: savedPass })
  })
  .then(r => r.json())
  .then(d => {
    if (d.success) { startSession(d.user); }
    else {
      // Password changed or account deleted — show login
      localStorage.removeItem('aura_user');
      localStorage.removeItem('aura_pass');
      showLogin();
    }
  })
  .catch(() => showLogin());
} else {
  showLogin();
}

// ══════════════════════════════════════════════
// USER DATA  ← УДОБСТВО
// ══════════════════════════════════════════════
async function loadUserData() {
  const r = await fetch('/api/get-user-data', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser })
  });
  const d = await r.json();
  friends        = d.friends        || [];
  friendRequests = d.friendRequests || [];
  groups         = d.groups         || [];
  renderFriends();
  renderGroups();
  renderRequests();
  updateReqBadge();
}

function updateProfileUI() {
  profileNick.textContent = userData.nickname || currentUser;
  profileUser.textContent = '@' + currentUser;
  setAvatar(profileAvatar, currentUser, userData.avatar);
}

function setAvatar(el, name, url) {
  if (url) {
    el.style.backgroundImage = `url(${url})`;
    el.style.backgroundSize  = 'cover';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.style.background      = `linear-gradient(135deg, var(--accent), var(--accent2))`;
    el.textContent = (name || '?').charAt(0).toUpperCase();
  }
}

// ══════════════════════════════════════════════
// RENDER LISTS  ← УДОБСТВО
// ══════════════════════════════════════════════
function renderFriends(filter = '') {
  const ul = friendsList;
  ul.innerHTML = '';
  const list = filter
    ? friends.filter(f => f.toLowerCase().includes(filter.toLowerCase()))
    : friends;
  if (!list.length) {
    ul.innerHTML = `<li class="msgs-empty" style="padding:24px;font-size:13px;">
      <i class="ti ti-user-off"></i><p>${filter ? 'Не найдено' : 'Нет друзей'}</p></li>`;
    return;
  }
  list.forEach(f => {
    const room = getRoomId(f);
    const li = document.createElement('li');
    li.className = 'chat-item' + (currentRoom === room ? ' active' : '');
    const avaEl = document.createElement('div');
    avaEl.className = 'ci-ava';
    setAvatar(avaEl, f, userAvatars[f]);
    li.innerHTML = `
      <div class="ci-body">
        <span class="ci-name">${f}</span>
        <span class="ci-sub">Личный чат</span>
      </div>`;
    li.prepend(avaEl);
    li.onclick = () => { gotoPrivate(f); closeSidebarMobile(); };
    li.addEventListener('contextmenu', e => showCtxFriend(e, f));
    ul.appendChild(li);
  });
}

function renderGroups() {
  const ul = groupsList;
  // Keep general item
  const general = $('generalItem');
  ul.innerHTML = '';
  if (general) ul.appendChild(general);
  if (general) general.onclick = () => { gotoRoom('general'); closeSidebarMobile(); };
  groups.forEach(g => {
    const li = document.createElement('li');
    li.className = 'chat-item' + (currentRoom === `group:${g.id}` ? ' active' : '');
    li.innerHTML = `
      <div class="ci-ava" style="border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2))">
        <i class="ti ti-users"></i>
      </div>
      <div class="ci-body">
        <span class="ci-name">${g.name}</span>
        <span class="ci-sub">${(g.members||[]).length} участников</span>
      </div>`;
    li.onclick = () => { gotoRoom(`group:${g.id}`); closeSidebarMobile(); };
    ul.appendChild(li);
  });
}

function renderRequests() {
  const ul = requestsList;
  ul.innerHTML = '';
  if (!friendRequests.length) {
    ul.innerHTML = `<li class="msgs-empty" style="padding:24px;font-size:13px;">
      <i class="ti ti-bell-off"></i><p>Нет заявок</p></li>`;
    updateReqBadge();
    return;
  }
  friendRequests.forEach(req => {
    const li = document.createElement('li');
    li.className = 'req-item';
    const ava = document.createElement('div');
    ava.className = 'ci-ava';
    setAvatar(ava, req, userAvatars[req]);
    li.appendChild(ava);
    li.innerHTML += `
      <div class="ci-body"><span class="ci-name">${req}</span><span class="ci-sub">Хочет добавить вас</span></div>
      <div class="req-btns">
        <button class="req-acc" onclick="acceptReq('${req}')"><i class="ti ti-check"></i></button>
        <button class="req-rej" onclick="rejectReq('${req}')"><i class="ti ti-x"></i></button>
      </div>`;
    ul.appendChild(li);
  });
  updateReqBadge();
}

function updateReqBadge() {
  if (!reqBadge) return;
  if (friendRequests.length) {
    reqBadge.textContent = friendRequests.length > 9 ? '9+' : friendRequests.length;
    reqBadge.style.display = 'flex';
  } else {
    reqBadge.style.display = 'none';
  }
}

// ← УДОБСТВО: live search
function filterChats(q) {
  renderFriends(q);
}

// ══════════════════════════════════════════════
// SIDEBAR TABS  ← УДОБСТВО
// ══════════════════════════════════════════════
const tabMap = {
  friends:  { tab: 'stFriends', pane: 'pFriends'  },
  groups:   { tab: 'stGroups',  pane: 'pGroups'   },
  requests: { tab: 'stReqs',    pane: 'pReqs'     },
};

function switchTab(name) {
  Object.keys(tabMap).forEach(k => {
    const { tab, pane } = tabMap[k];
    const active = k === name;
    $(tab)?.classList.toggle('active', active);
    const p = $(pane);
    if (p) p.classList.toggle('hidden', !active);
  });
  // Clear badge when requests tab opened
  if (name === 'requests' && reqBadge) reqBadge.style.display = 'none';
}

// ══════════════════════════════════════════════
// ROOMS  ← УДОБСТВО
// ══════════════════════════════════════════════
function getRoomId(friend) {
  return 'private:' + [currentUser, friend].sort().join(':');
}

function gotoPrivate(friend) {
  gotoRoom(getRoomId(friend));
}

function gotoRoom(room) {
  if (currentRoom === room) return;
  currentRoom = room;

  const callBtnsHtml = `
    <button class="icon-btn" title="Аудиозвонок" onclick="startCall(false)"><i class="ti ti-phone"></i></button>
    <button class="icon-btn" title="Видеозвонок" onclick="startCall(true)"><i class="ti ti-video"></i></button>`;

  if (room === 'general') {
    roomName.textContent = 'Общий чат';
    roomSub.textContent  = 'Публичный чат';
    setAvatar(roomAvatar, '#', null);
    roomAvatar.innerHTML = '<i class="ti ti-hash" style="font-size:15px"></i>';
    onlinePill && (onlinePill.style.display = 'flex');
    hdrRight.innerHTML = '';
    hdrRight.appendChild(onlinePill);
  } else if (room.startsWith('private:')) {
    const parts = room.split(':');
    const other = parts.slice(1).find(p => p !== currentUser) || parts[1];
    roomName.textContent = other || '?';
    roomSub.textContent  = 'Личные сообщения';
    setAvatar(roomAvatar, other, userAvatars[other]);
    if (onlinePill) onlinePill.style.display = 'none';
    hdrRight.innerHTML = callBtnsHtml;
  } else if (room.startsWith('group:')) {
    const g = groups.find(g => g.id === room.replace('group:', ''));
    roomName.textContent = g?.name || 'Группа';
    roomSub.textContent  = g ? `${(g.members||[]).length} участников` : 'Группа';
    roomAvatar.innerHTML = '<i class="ti ti-users" style="font-size:14px"></i>';
    roomAvatar.style.borderRadius = '12px';
    if (onlinePill) onlinePill.style.display = 'none';
    hdrRight.innerHTML = '';
  }

  socket.emit('join-room', room);
  renderFriends();
}

// ══════════════════════════════════════════════
// MESSAGES  ← КРАСОТА + УДОБСТВО
// ══════════════════════════════════════════════
socket.on('online-count', n => { if (onlineCount) onlineCount.textContent = n; });

socket.on('history', msgs => {
  messagesDiv.innerHTML = '';
  if (msgsEmpty) msgsEmpty.style.display = msgs.length ? 'none' : 'flex';
  msgs.forEach(addMessage);
});

socket.on('message', addMessage);
socket.on('system', addSystem);

function addMessage(msg) {
  if (msgsEmpty) msgsEmpty.style.display = 'none';
  const own = msg.user === currentUser;
  const row = document.createElement('div');
  row.className = `msg-row${own ? ' own' : ''}`;
  row.dataset.id = msg.id;

  // Avatar
  const ava = document.createElement('div');
  ava.className = 'avatar sm msg-ava';
  setAvatar(ava, msg.user, userAvatars[msg.user]);

  // Bubble
  const bub = document.createElement('div');
  bub.className = 'msg-bubble';

  let inner = own ? '' : `<div class="msg-sender">${msg.user}</div>`;

  if (msg.type === 'image') {
    inner += `<img class="msg-img" src="${msg.url}" loading="lazy" onclick="viewMedia('${msg.url}','image')" alt="фото">`;
    if (msg.text) inner += `<div class="msg-text">${esc(msg.text)}</div>`;
  } else if (msg.type === 'video') {
    inner += `<video class="msg-video" controls preload="auto" playsinline src="${msg.url}"></video>`;
    if (msg.text) inner += `<div class="msg-text">${esc(msg.text)}</div>`;
  } else if (msg.type === 'video_circle') {
    inner += `<video class="msg-circle" loop autoplay muted playsinline src="${msg.url}" onclick="viewMedia('${msg.url}','video')"></video>`;
    if (msg.text) inner += `<div class="msg-text" style="font-size:11px;opacity:.6">${esc(msg.text)}</div>`;
  } else if (msg.type === 'audio') {
    inner += `<audio class="msg-audio" controls preload="auto" src="${msg.url}"></audio>`;
    if (msg.text) inner += `<div class="msg-text">${esc(msg.text)}</div>`;
    // apply saved volume + speaker
    setTimeout(() => {
      const a = row.querySelector('audio');
      if (!a) return;
      a.volume = (parseInt(localStorage.getItem('aura_vol') || '100')) / 100;
      const spk = localStorage.getItem('aura_spk');
      if (spk && spk !== 'default' && a.setSinkId) a.setSinkId(spk).catch(() => {});
    }, 50);
  } else if (msg.type === 'file') {
    inner += `<div class="msg-file"><i class="ti ti-file"></i><a href="${msg.url}" target="_blank">${esc(msg.fileName || 'Файл')}</a></div>`;
    if (msg.text) inner += `<div class="msg-text">${esc(msg.text)}</div>`;
  } else {
    inner += `<div class="msg-text">${esc(msg.text)}</div>`;
  }

  inner += `<div class="msg-meta"><span class="msg-time">${msg.time}</span></div>`;
  bub.innerHTML = inner;

  // ← УДОБСТВО: right-click context menu
  bub.addEventListener('contextmenu', e => showCtxMsg(e, msg));

  row.appendChild(ava);
  row.appendChild(bub);
  messagesDiv.appendChild(row);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystem(text) {
  const d = document.createElement('div');
  d.className = 'msg-system';
  d.textContent = text;
  messagesDiv.appendChild(d);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// ══════════════════════════════════════════════
// SENDING  ← УДОБСТВО
// ══════════════════════════════════════════════
function enableInput() {
  msgInput.disabled = false;
  attachBtn.disabled = false;
  refreshSendBtn();
}

function refreshSendBtn() {
  const hasText  = msgInput.value.trim().length > 0;
  const hasFiles = selectedFiles.length > 0;
  const canSend  = hasText || hasFiles;
  sendBtn.disabled = false; // always enabled — mic when empty
  if (canSend) {
    sendIco.className = 'ti ti-send';
    sendBtn.classList.remove('mic-mode');
  } else {
    sendIco.className = 'ti ti-microphone';
    sendBtn.classList.add('mic-mode');
  }
}

function handleSend() {
  const text = msgInput.value.trim();
  if (text) {
    socket.emit('message', { text, room: currentRoom });
    msgInput.value = '';
    autoGrow(msgInput);
  }
  if (selectedFiles.length) sendFiles();
  refreshSendBtn();
}

// ← УДОБСТВО: Cmd+Enter sends, Enter adds newline only if Shift
function onMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = msgInput.value.trim();
    const hasFiles = selectedFiles.length > 0;
    if (text || hasFiles) handleSend();
  }
}

// ← КРАСОТА: auto-growing textarea
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

// ══════════════════════════════════════════════
// FILE HANDLING  ← УДОБСТВО
// ══════════════════════════════════════════════
// Attach menu ← КРАСОТА
attachMenu.innerHTML = `
  <div class="att-item" onmousedown="event.preventDefault()" onclick="pickFiles('image/*')"><i class="ti ti-photo"></i> Фото</div>
  <div class="att-item" onmousedown="event.preventDefault()" onclick="pickFiles('video/*')"><i class="ti ti-video"></i> Видео</div>
  <div class="att-item" onmousedown="event.preventDefault()" onclick="pickFiles('audio/*')"><i class="ti ti-music"></i> Аудио</div>
  <div class="att-item" onmousedown="event.preventDefault()" onclick="pickFiles('*/*')"><i class="ti ti-file"></i> Файл</div>
  <div class="att-item" onmousedown="event.preventDefault()" onclick="startCircleRecord()"><i class="ti ti-circle"></i> Кружок</div>`;

attachBtn.addEventListener('mousedown', e => e.preventDefault()); // prevent text selection popup
attachBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = attachMenu.classList.contains('open');
  attachMenu.classList.toggle('open', !open);
  if (!open) positionMenu(attachMenu, attachBtn);
});

document.addEventListener('click', e => {
  if (!attachBtn.contains(e.target) && !attachMenu.contains(e.target))
    attachMenu.classList.remove('open');
  $('emojiPicker')?.classList.remove('open');
});

function positionMenu(menu, anchor) {
  // Make visible off-screen to measure
  menu.style.visibility = 'hidden';
  menu.style.display = 'block';
  const mh = menu.offsetHeight, mw = menu.offsetWidth;
  menu.style.display = '';
  menu.style.visibility = '';

  const r = anchor.getBoundingClientRect();
  let left = r.left;
  if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  if (left < 8) left = 8;
  const top = r.top - mh - 8 >= 10 ? r.top - mh - 8 : r.bottom + 8;
  menu.style.left = left + 'px';
  menu.style.top  = top  + 'px';
}

function pickFiles(accept) {
  attachMenu.classList.remove('open');
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.multiple = true; inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', e => {
    [...e.target.files].forEach(addFile);
    inp.remove();
  });
  inp.click();
}

function addFile(file) {
  if (file.size > 50 * 1024 * 1024) { toast(`Файл слишком большой: ${file.name}`, 'warning'); return; }
  let type = 'file';
  if (file.type.startsWith('image/'))  type = 'image';
  if (file.type.startsWith('video/'))  type = 'video';
  if (file.type.startsWith('audio/'))  type = 'audio';
  const reader = new FileReader();
  reader.onload = ev => {
    selectedFiles.push({ file, type, dataUrl: ev.target.result, name: file.name });
    renderFilePreviews();
    refreshSendBtn();
  };
  reader.readAsDataURL(file);
}

function renderFilePreviews() {
  fpBar.classList.toggle('hidden', selectedFiles.length === 0);
  fpBar.innerHTML = '';
  selectedFiles.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'fp-item';
    let thumb = `<i class="ti ti-file" style="font-size:24px;color:var(--accent)"></i>`;
    if (f.type === 'image') thumb = `<img src="${f.dataUrl}" alt="">`;
    item.innerHTML = `${thumb}<span class="fp-item-name">${f.name}</span><button class="fp-remove" onclick="removeFile(${i})" title="Удалить"><i class="ti ti-x"></i></button>`;
    fpBar.appendChild(item);
  });
}

function removeFile(i) {
  selectedFiles.splice(i, 1);
  renderFilePreviews();
  refreshSendBtn();
}

async function sendFiles() {
  for (const f of selectedFiles) {
    const fd = new FormData();
    fd.append('file', f.file);
    try {
      const r = await fetch('/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.success) {
        socket.emit('media-message', {
          mediaData: { type: d.type, url: d.url, fileName: d.name, text: '' },
          room: currentRoom
        });
      } else toast(`Ошибка загрузки: ${f.name}`, 'error');
    } catch { toast(`Ошибка загрузки: ${f.name}`, 'error'); }
  }
  selectedFiles = [];
  renderFilePreviews();
  refreshSendBtn();
}

// ← УДОБСТВО: Drag & Drop
function setupDragDrop() {
  const zone = $('dropZone');
  const main = document.querySelector('.main');
  if (!main || !zone) return;
  let dragCnt = 0;
  main.addEventListener('dragenter', e => { e.preventDefault(); dragCnt++; zone.classList.add('active'); });
  main.addEventListener('dragleave', () => { dragCnt--; if (dragCnt <= 0) { dragCnt = 0; zone.classList.remove('active'); } });
  main.addEventListener('dragover', e => e.preventDefault());
  main.addEventListener('drop', e => {
    e.preventDefault(); dragCnt = 0; zone.classList.remove('active');
    [...e.dataTransfer.files].forEach(addFile);
  });
}

// ══════════════════════════════════════════════
// RECORDING (Voice + Circle)  ← УДОБСТВО
// ══════════════════════════════════════════════
const isMobile = 'ontouchstart' in window;

// Helper: get audio constraints using saved mic
function audioConstraints() {
  const mic = localStorage.getItem('aura_mic');
  const c = { echoCancellation:true, noiseSuppression:true, autoGainControl:true, sampleRate:48000 };
  if (mic && mic !== 'default') c.deviceId = { exact: mic };
  return c;
}

// ── Desktop: hold to record, right-click for circle ──
if (!isMobile) {
  let holdT = null, didRecord = false;

  sendBtn.addEventListener('mousedown', e => {
    if (msgInput.value.trim() || selectedFiles.length) return;
    didRecord = false;
    holdT = setTimeout(() => {
      didRecord = true;
      startVoice();
    }, 300);
  });
  sendBtn.addEventListener('mouseup', () => {
    clearTimeout(holdT);
    if (didRecord && isRecording) stopVoice();
    didRecord = false;
  });
  sendBtn.addEventListener('contextmenu', e => {
    if (!msgInput.value.trim() && !selectedFiles.length) {
      e.preventDefault();
      if (isRecording) cancelRecording();
      startCircleRecord();
    }
  });
}

// ── Mobile: hold = voice, swipe up = circle ──
if (isMobile) {
  let ty0 = 0, holdT = null, mode = null;
  sendBtn.addEventListener('touchstart', e => {
    if (msgInput.value.trim() || selectedFiles.length) return;
    ty0 = e.touches[0].clientY; mode = null;
    holdT = setTimeout(() => { mode = 'voice'; startVoice(); }, 300);
  }, { passive: true });
  sendBtn.addEventListener('touchmove', e => {
    const dy = ty0 - e.touches[0].clientY;
    if (!mode && dy > 45) {
      clearTimeout(holdT); mode = 'circle'; startCircleRecord();
    }
    if (mode === 'voice' && dy > 70) {
      cancelRecording(); mode = 'circle'; startCircleRecord();
    }
  }, { passive: true });
  sendBtn.addEventListener('touchend', () => {
    clearTimeout(holdT);
    if (mode === 'voice' && isRecording) stopVoice();
  });
  sendBtn.addEventListener('touchcancel', () => {
    clearTimeout(holdT);
    if (isRecording) cancelRecording();
  });
}

async function startVoice() {
  if (isRecording) return;
  isRecording = true;
  sendBtn.style.background = 'linear-gradient(135deg,var(--danger),#c53030)';
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
    const mimes = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm'];
    const mime  = mimes.find(m => MediaRecorder.isTypeSupported(m)) || 'audio/webm';
    mediaRecorder = new MediaRecorder(recStream, { mimeType: mime, audioBitsPerSecond: 128000 });
    audioChunks = [];
    mediaRecorder.ondataavailable = e => e.data.size && audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      recStream?.getTracks().forEach(t => t.stop());
      if (audioChunks.length) {
        const blob = new Blob(audioChunks, { type: mime });
        await uploadVoice(blob, mime.includes('ogg') ? 'ogg' : 'webm');
      }
      stopRecUI();
    };
    mediaRecorder.start(250);
    recBar.classList.remove('hidden');
    recType_el.textContent = 'Голосовое';
    recSeconds = 0;
    recTimer_el.textContent = '0:00';
    recTimer = setInterval(() => {
      recSeconds++;
      const m = Math.floor(recSeconds/60), s = recSeconds % 60;
      recTimer_el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
    }, 1000);
  } catch {
    toast('Нет доступа к микрофону', 'error');
    isRecording = false;
    resetSendBtn();
  }
}

function stopVoice() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') { stopRecUI(); return; }
  // requestData flushes the current chunk BEFORE stop fires onstop
  try { mediaRecorder.requestData(); } catch {}
  // Small delay so the final chunk arrives before stop
  setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    else stopRecUI();
  }, 80);
}

function cancelRecording() {
  recStream?.getTracks().forEach(t => t.stop());
  if (mediaRecorder?.state !== 'inactive') {
    mediaRecorder.ondataavailable = null;
    mediaRecorder.onstop = null;
    mediaRecorder.stop();
  }
  audioChunks = [];
  stopRecUI();
}

function stopRecUI() {
  clearInterval(recTimer);
  recSeconds = 0;
  isRecording = false;
  recBar.classList.add('hidden');
  resetSendBtn();
}

function resetSendBtn() {
  sendBtn.style.background = '';
  refreshSendBtn();
}

async function uploadVoice(blob, ext) {
  const fd = new FormData();
  fd.append('file', blob, `voice.${ext}`);
  try {
    const r = await fetch('/upload', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.success) {
      socket.emit('media-message', {
        mediaData: { type: 'audio', url: d.url, fileName: d.name, text: '' },
        room: currentRoom
      });
    } else toast('Ошибка загрузки голосового', 'error');
  } catch { toast('Ошибка загрузки голосового', 'error'); }
}

// ── Circle  ← КРАСОТА
const circleOverlay = $('circleOverlay');
const circlePreview = $('circlePreview');
const circleFg      = $('cFg');
const circleTimeEl  = $('circleTimer');
const MAX_CIRCLE    = 60;

async function startCircleRecord() {
  try {
    circleStream = await navigator.mediaDevices.getUserMedia({
      video: { width:400, height:400, facingMode:'user' },
      audio: audioConstraints()
    });
    circlePreview.srcObject = circleStream;
    circleOverlay.classList.add('open');

    const mimes = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
    const mime  = mimes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    circleRec = new MediaRecorder(circleStream, { mimeType: mime, videoBitsPerSecond: 800000 });
    circleChunks = [];
    circleRec.ondataavailable = e => e.data.size && circleChunks.push(e.data);
    circleRec.start(200);
    circleSecs = 0;
    circleFg.style.strokeDashoffset = '628.3';
    circleTimerID = setInterval(() => {
      circleSecs++;
      const m = Math.floor(circleSecs/60), s = circleSecs % 60;
      circleTimeEl.textContent = `${m}:${s.toString().padStart(2,'0')}`;
      circleFg.style.strokeDashoffset = 628.3 * (1 - circleSecs / MAX_CIRCLE);
      if (circleSecs >= MAX_CIRCLE) sendCircleRecord();
    }, 1000);
  } catch { toast('Нет доступа к камере', 'error'); }
}

function cancelCircleRecord() {
  clearInterval(circleTimerID);
  circleRec?.stop();
  circleStream?.getTracks().forEach(t => t.stop());
  circleChunks = [];
  circleOverlay.classList.remove('open');
}

async function sendCircleRecord() {
  clearInterval(circleTimerID);
  if (circleRec?.state !== 'inactive') circleRec.stop();
  circleStream?.getTracks().forEach(t => t.stop());
  circleOverlay.classList.remove('open');
  await new Promise(r => setTimeout(r, 300));
  if (!circleChunks.length) return;
  const mime = circleRec?.mimeType || 'video/webm';
  const blob = new Blob(circleChunks, { type: mime });
  const ext  = mime.includes('mp4') ? 'mp4' : 'webm';
  const fd   = new FormData();
  fd.append('file', blob, `circle.${ext}`);
  toast('Отправка кружка…', 'info', 2000);
  try {
    const r = await fetch('/upload', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.success) {
      socket.emit('media-message', {
        mediaData: { type: 'video_circle', url: d.url, fileName: d.name, text: '' },
        room: currentRoom
      });
    } else toast('Ошибка отправки кружка', 'error');
  } catch { toast('Ошибка отправки кружка', 'error'); }
  circleChunks = [];
}

// ══════════════════════════════════════════════
// EMOJI  ← УДОБСТВО
// ══════════════════════════════════════════════
const EMOJIS = ['😀','😂','😍','🥰','😎','🤔','😅','🥲','😭','😤','🤯','🥳','😴','🙄','😏','🫡',
  '👍','👎','❤️','🔥','💯','✅','🎉','🎊','💪','🙏','👀','💀','🤝','✌️','🫶','💫',
  '😸','🐶','🌟','⚡','🌈','🎵','🎮','🏆','🚀','💻','📱','🎯','💡','🌙','☀️','🌊'];

const emojiPicker = $('emojiPicker');
emojiPicker.innerHTML = `<div class="emoji-grid">${EMOJIS.map(e =>
  `<button class="ep-btn" onclick="insertEmoji('${e}')">${e}</button>`).join('')}</div>`;

function toggleEmoji(e) {
  e?.stopPropagation();
  const open = emojiPicker.classList.contains('open');
  emojiPicker.classList.toggle('open', !open);
  if (!open) {
    const btn = $('emojiBtn');
    positionMenu(emojiPicker, btn);
  }
}

function insertEmoji(em) {
  const pos = msgInput.selectionStart;
  msgInput.value = msgInput.value.slice(0, pos) + em + msgInput.value.slice(pos);
  msgInput.focus();
  msgInput.selectionStart = msgInput.selectionEnd = pos + em.length;
  autoGrow(msgInput);
  refreshSendBtn();
}

// ══════════════════════════════════════════════
// CONTEXT MENUS  ← УДОБСТВО: Telegram Desktop feel
// ══════════════════════════════════════════════
const ctxMenu = $('ctxMenu');

function showCtxMsg(e, msg) {
  e.preventDefault();
  const own = msg.user === currentUser;
  ctxMenu.innerHTML = `
    <div class="ctx-item" onclick="copyMsgText('${msg.id}')"><i class="ti ti-copy"></i> Копировать текст</div>
    ${own ? `
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" onclick="deleteMsg('${msg.id}')"><i class="ti ti-trash"></i> Удалить сообщение</div>
    ` : ''}`;
  showCtx(e);
}

async function deleteMsg(id) {
  closeCtx();
  const ok = await dialog({
    icon: 'ti-trash', iconType: 'error',
    title: 'Удалить сообщение?',
    msg: 'Сообщение будет удалено у всех участников чата.',
    ok: 'Удалить', cancel: 'Отмена', danger: true
  });
  if (!ok) return;

  try {
    const r = await fetch('/api/delete-message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: id, username: currentUser })
    });
    const d = await r.json();
    if (!d.success) toast(d.error || 'Ошибка удаления', 'error');
    // UI update handled by socket event 'message-deleted'
  } catch {
    toast('Ошибка соединения', 'error');
  }
}

// Real-time deletion from server
socket.on('message-deleted', ({ messageId }) => {
  const row = document.querySelector(`[data-id="${messageId}"]`);
  if (row) {
    // Animate out
    row.style.transition = 'opacity .2s, transform .2s';
    row.style.opacity = '0';
    row.style.transform = 'scale(.95)';
    setTimeout(() => row.remove(), 200);
  }
});

function showCtxFriend(e, friend) {
  e.preventDefault();
  ctxMenu.innerHTML = `
    <div class="ctx-item" onclick="gotoPrivate('${friend}');closeCtx()"><i class="ti ti-message-circle"></i> Написать</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" onclick="removeFriend('${friend}')"><i class="ti ti-user-minus"></i> Удалить из друзей</div>`;
  showCtx(e);
}

function showCtx(e) {
  const x = Math.min(e.clientX, window.innerWidth  - ctxMenu.offsetWidth  - 8);
  const y = Math.min(e.clientY, window.innerHeight - ctxMenu.offsetHeight - 8);
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  ctxMenu.classList.add('open');
}

function closeCtx() { ctxMenu.classList.remove('open'); }
document.addEventListener('click', closeCtx);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCtx(); $('emojiPicker').classList.remove('open'); } });

function copyMsgText(id) {
  const row = document.querySelector(`[data-id="${id}"]`);
  const text = row?.querySelector('.msg-text')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => toast('Скопировано', 'success', 1500));
  closeCtx();
}

async function removeFriend(friend) {
  closeCtx();
  const ok = await dialog({ icon:'ti-user-minus', iconType:'warning', title:'Удалить друга?', msg:`Удалить ${friend} из друзей?`, ok:'Удалить', cancel:'Отмена', danger:true });
  if (!ok) return;
  // No API endpoint for this in original — just remove locally
  friends = friends.filter(f => f !== friend);
  renderFriends();
  toast(`${friend} удалён из друзей`, 'info');
}

// ══════════════════════════════════════════════
// MEDIA VIEWER  ← УДОБСТВО + КРАСОТА
// ══════════════════════════════════════════════
function viewMedia(url, type) {
  const viewer = document.createElement('div');
  viewer.className = 'media-viewer open';
  viewer.innerHTML = `
    <button class="mv-close" onclick="this.closest('.media-viewer').remove()"><i class="ti ti-x"></i></button>
    ${type === 'image'
      ? `<img src="${url}" style="max-width:92vw;max-height:92vh;border-radius:12px;object-fit:contain;">`
      : `<video src="${url}" controls autoplay playsinline style="max-width:92vw;max-height:92vh;border-radius:12px;"></video>`}`;
  viewer.onclick = e => { if (e.target === viewer) viewer.remove(); };
  document.body.appendChild(viewer);
}

// ══════════════════════════════════════════════
// FRIENDS / REQUESTS  ← УДОБСТВО
// ══════════════════════════════════════════════
async function openAddFriend() {
  const name = await dialog({ icon:'ti-user-plus', iconType:'info', title:'Добавить друга', msg:'Введите имя пользователя', input:true, placeholder:'Имя…', ok:'Отправить', cancel:'Отмена' });
  if (!name) return;
  const r = await fetch('/api/send-friend-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: currentUser, to: name })
  });
  const d = await r.json();
  if (d.success) toast('Заявка отправлена!', 'success');
  else toast(d.message || d.error || 'Ошибка', 'error');
}

async function acceptReq(req) {
  const r = await fetch('/api/accept-friend-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser, requester: req })
  });
  const d = await r.json();
  if (d.success) {
    friendRequests = friendRequests.filter(x => x !== req);
    friends = d.friends;
    renderFriends(); renderRequests(); updateReqBadge();
    toast(`${req} теперь ваш друг!`, 'success');
  } else toast('Ошибка', 'error');
}

async function rejectReq(req) {
  const r = await fetch('/api/reject-friend-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser, requester: req })
  });
  const d = await r.json();
  if (d.success) {
    friendRequests = friendRequests.filter(x => x !== req);
    renderRequests(); updateReqBadge();
  }
}

// Real-time friend events
socket.on('friend-request', ({ from }) => {
  if (!currentUser) return; // not logged in yet — will re-identify after login
  if (!friendRequests.includes(from)) {
    friendRequests.push(from);
    renderRequests();
    updateReqBadge();
    showFriendRequestPopup(from);
  }
});

socket.on('friends-updated', ({ friends: nf }) => {
  if (!currentUser) return;
  friends = nf || [];
  renderFriends();
  toast('Список друзей обновлён', 'success', 2000);
});

socket.on('avatar-updated', ({ username, avatar }) => {
  userAvatars[username] = avatar;
  // update any visible avatar
  document.querySelectorAll('.ci-ava, .msg-ava').forEach(el => {
    if (el.dataset.user === username) setAvatar(el, username, avatar);
  });
  if (currentRoom.includes(username)) setAvatar(roomAvatar, username, avatar);
});

function showFriendRequestPopup(from) {
  document.querySelectorAll('.frq-popup').forEach(p => p.remove());
  const pop = document.createElement('div');
  pop.className = 'frq-popup';
  pop.innerHTML = `
    <div class="frq-ava">${from.charAt(0).toUpperCase()}</div>
    <div class="frq-txt"><div class="frq-name">${from}</div><div class="frq-sub">хочет добавить вас</div></div>
    <div class="frq-btns">
      <button class="frq-y" onclick="acceptReqPop('${from}',this)"><i class="ti ti-check"></i></button>
      <button class="frq-n" onclick="this.closest('.frq-popup').remove()"><i class="ti ti-x"></i></button>
    </div>`;
  document.body.appendChild(pop);
  setTimeout(() => { pop.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => pop.remove(), 300); }, 8000);
}

async function acceptReqPop(req, btn) {
  btn.closest('.frq-popup').remove();
  await acceptReq(req);
}

// ══════════════════════════════════════════════
// GROUPS  ← УДОБСТВО
// ══════════════════════════════════════════════
function openGroupModal() {
  const modal = $('groupModal');
  modal.classList.add('open');
  const list = $('grpMembers');
  list.innerHTML = friends.map(f => `
    <label class="member-check">
      <input type="checkbox" value="${f}"> ${f}
    </label>`).join('');
}

function closeGroupModal() { $('groupModal').classList.remove('open'); }

async function createGroup() {
  const name = $('grpName').value.trim();
  if (!name) { toast('Введите название', 'warning'); return; }
  const members = [...document.querySelectorAll('#grpMembers input:checked')].map(i => i.value);
  const r = await fetch('/api/create-group', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator: currentUser, name, members })
  });
  const d = await r.json();
  if (d.success) {
    toast(`Группа «${name}» создана!`, 'success');
    closeGroupModal();
    loadUserData();
  } else toast('Ошибка создания группы', 'error');
}

// ══════════════════════════════════════════════
// SETTINGS  ← УДОБСТВО
// ══════════════════════════════════════════════
let _pendingTheme  = localStorage.getItem('aura_theme')  || 'dark';
let _pendingAccent = localStorage.getItem('aura_accent') || '#6366f1';

function openSettings() {
  const modal = $('settingsModal');
  modal.classList.add('open');
  // Populate
  $('stNickname').value = userData.nickname || '';
  $('acLoginName').textContent = currentUser;
  const sa = $('settingsAvatar');
  setAvatar(sa, currentUser, userData.avatar);
  // Restore theme state
  $('thDark')?.classList.toggle('active', _pendingTheme === 'dark');
  $('thLight')?.classList.toggle('active', _pendingTheme === 'light');
  // Accent — restore active state and checkmark
  const acc = _pendingAccent || localStorage.getItem('aura_accent') || '#6366f1';
  document.querySelectorAll('.clr').forEach(b => {
    const active = b.dataset.accent === acc;
    b.classList.toggle('active', active);
    b.innerHTML = active ? '<i class="ti ti-check"></i>' : '';
  });
  // Volume
  const vol = localStorage.getItem('aura_vol') || '100';
  $('volRange').value = vol;
  $('volLabel').textContent = vol + '%';
  loadAudioDevices();
}

function closeSettings() { $('settingsModal').classList.remove('open'); }

function openStab(name) {
  document.querySelectorAll('.mtab').forEach((b,i) => {
    const tabs = ['profile','sound','theme','account'];
    b.classList.toggle('active', tabs[i] === name);
  });
  ['profile','sound','theme','account'].forEach(n => {
    const el = $(`st_${n}`);
    if (el) el.classList.toggle('hidden', n !== name);
  });
}

async function saveProfile() {
  const nick = $('stNickname').value.trim();
  if (!nick) return;
  const r = await fetch('/api/update-profile', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser, nickname: nick, avatar: userData.avatar, theme: userData.theme })
  });
  const d = await r.json();
  if (d.success) {
    userData.nickname = nick;
    updateProfileUI();
    closeSettings();
    toast('Профиль обновлён', 'success');
  }
}

$('avaInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch('/upload', { method: 'POST', body: fd });
  const d = await r.json();
  if (d.success) {
    userData.avatar = d.url;
    setAvatar($('settingsAvatar'), currentUser, d.url);
    updateProfileUI();
    socket.emit('avatar-updated', { username: currentUser, avatar: d.url });
    toast('Аватар обновлён', 'success');
  }
});

// Sound
async function loadAudioDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio:true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
    const devs = await navigator.mediaDevices.enumerateDevices();
    const mics = devs.filter(d => d.kind === 'audioinput');
    const spks = devs.filter(d => d.kind === 'audiooutput');
    const savMic = localStorage.getItem('aura_mic') || 'default';
    const savSpk = localStorage.getItem('aura_spk') || 'default';
    const ms = $('micSel'), ss = $('spkSel');
    ms.innerHTML = '<option value="default">По умолчанию</option>';
    mics.forEach(d => { const o = new Option(d.label || `Микрофон`, d.deviceId); if (d.deviceId === savMic) o.selected = true; ms.appendChild(o); });
    if (typeof HTMLMediaElement.prototype.setSinkId === 'function' && spks.length) {
      ss.innerHTML = '<option value="default">По умолчанию</option>';
      spks.forEach(d => { const o = new Option(d.label || `Динамик`, d.deviceId); if (d.deviceId === savSpk) o.selected = true; ss.appendChild(o); });
      $('spkHint').classList.add('hidden');
    } else {
      ss.disabled = true; $('spkHint').classList.remove('hidden');
    }
  } catch {}
}

function saveSoundSettings() {
  localStorage.setItem('aura_mic', $('micSel').value);
  localStorage.setItem('aura_spk', $('spkSel').value);
}

function setVolume(v) {
  $('volLabel').textContent = v + '%';
  localStorage.setItem('aura_vol', v);
  document.querySelectorAll('audio, video').forEach(el => { el.volume = v / 100; });
}

async function testMic() {
  const out = $('micTestOut');
  out.classList.remove('hidden');
  out.textContent = '🎙️ Говорите (2 сек)…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
    const ctx  = new AudioContext();
    const src  = ctx.createMediaStreamSource(stream);
    const ana  = ctx.createAnalyser();
    src.connect(ana); ana.fftSize = 256;
    const buf = new Uint8Array(ana.frequencyBinCount);
    let max = 0;
    const iv = setInterval(() => { ana.getByteFrequencyData(buf); const avg = buf.reduce((a,b)=>a+b)/buf.length; if (avg > max) max = avg; }, 100);
    setTimeout(() => {
      clearInterval(iv); stream.getTracks().forEach(t=>t.stop()); ctx.close();
      out.textContent = max > 5 ? `✅ Уровень: ${Math.round(max)} / 255` : '⚠️ Звук не обнаружен';
      out.style.color = max > 5 ? 'var(--success)' : 'var(--warn)';
    }, 2000);
  } catch (e) { out.textContent = '❌ ' + e.message; out.style.color = 'var(--danger)'; }
}

// Theme
function setAccent(hex, btn) {
  document.querySelectorAll('.clr').forEach(b => {
    b.classList.remove('active');
    b.innerHTML = '';
  });
  btn.classList.add('active');
  btn.innerHTML = '<i class="ti ti-check"></i>';
  _pendingAccent = hex;
  applyAccent(hex);
}

function selectTheme(t) {
  _pendingTheme = t;
  $('thDark')?.classList.toggle('active', t === 'dark');
  $('thLight')?.classList.toggle('active', t === 'light');
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', _pendingTheme);
  applyAccent(_pendingAccent);
  localStorage.setItem('aura_theme', _pendingTheme);
  localStorage.setItem('aura_accent', _pendingAccent);
  userData.theme = _pendingTheme;
  fetch('/api/update-profile', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser, theme: _pendingTheme })
  });
  closeSettings();
  toast('Тема сохранена', 'success');
}

// Account
async function deleteAccount() {
  const ok = await dialog({ icon:'ti-trash', iconType:'error', title:'Удалить аккаунт?', msg:'Все данные будут удалены без восстановления.', ok:'Удалить', cancel:'Отмена', danger:true });
  if (!ok) return;
  await fetch('/api/delete-account', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser })
  });
  localStorage.clear();
  location.reload();
}

// ══════════════════════════════════════════════════════════
//  CALLS — чистый WebRTC + Socket.IO сигналинг (без PeerJS)
//  Работает надёжно: сигналы идут через Socket.IO,
//  медиа — напрямую peer-to-peer через ICE/STUN
// ══════════════════════════════════════════════════════════

// --- STATE ---
let rtcPeer      = null;   // RTCPeerConnection
let _callTarget  = null;   // username собеседника
let _callIsVid   = false;
let _isCaller    = false;
let _callActive  = false;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
];

// --- DOM REFS (set after DOM ready) ---
let callModal, callAva, callNm, callSt, callAct;
function initCallDOM() {
  callModal = $('callModal');
  callAva   = $('callAvatar');
  callNm    = $('callName');
  callSt    = $('callStatus');
  callAct   = $('callActions');
}

// ── OUTGOING CALL ────────────────────────────────────────
function startCall(isVid) {
  const target = callTarget();
  if (!target) { toast('Открой личный чат для звонка', 'warning'); return; }
  if (_callActive) { toast('Звонок уже идёт', 'warning'); return; }
  _callTarget = target;
  _callIsVid  = isVid;
  _isCaller   = true;

  console.log('[Call] Calling', target, 'video:', isVid);

  navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: isVid })
    .then(stream => {
      localStream = stream;
      _setupRTC();
      // Notify callee via socket BEFORE offer
      socket.emit('call-invite', {
        to: target, from: currentUser, isVid
      });
      // Show outgoing UI
      setAvatar(callAva, target, userAvatars[target]);
      callNm.textContent = target;
      callSt.textContent = isVid ? 'Видеозвонок…' : 'Звоним…';
      callAct.innerHTML = `
        <button class="call-btn call-mute" id="callMuteBtn" onclick="toggleMute()">
          <i class="ti ti-microphone"></i>
        </button>
        <button class="call-btn call-end" onclick="endCall()">
          <i class="ti ti-phone-off"></i>
        </button>`;
      callModal.classList.add('open');
    })
    .catch(err => {
      console.error('[Call] getUserMedia:', err);
      toast('Нет доступа к ' + (isVid ? 'камере/микрофону' : 'микрофону'), 'error');
    });
}

// ── INCOMING CALL (socket event) ─────────────────────────
socket.on('call-invite', ({ from, isVid }) => {
  if (_callActive) {
    socket.emit('call-busy', { to: from, from: currentUser });
    return;
  }
  console.log('[Call] Incoming from', from, 'video:', isVid);
  _callTarget = from;
  _callIsVid  = isVid;
  _isCaller   = false;

  setAvatar(callAva, from, userAvatars[from]);
  callNm.textContent = from;
  callSt.textContent = isVid ? 'Видеозвонок…' : 'Входящий звонок…';
  callAct.innerHTML = `
    <button class="call-btn call-ans" onclick="answerCall()">
      <i class="ti ti-phone"></i>
    </button>
    <button class="call-btn call-end" onclick="declineCall()">
      <i class="ti ti-phone-off"></i>
    </button>`;
  callModal.classList.add('open');
  ringBeep();
});

socket.on('call-busy', ({ from }) => {
  toast(from + ' сейчас занят', 'warning');
  endCall();
});

// ── ANSWER ───────────────────────────────────────────────
function answerCall() {
  stopRing();
  navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: _callIsVid })
    .then(stream => {
      localStream = stream;
      _setupRTC();
      // Tell caller we answered — they create and send the offer
      socket.emit('call-answer-ready', { to: _callTarget, from: currentUser });
      callModal.classList.remove('open');
    })
    .catch(err => {
      console.error('[Call] answer getUserMedia:', err);
      toast('Нет доступа к медиа', 'error');
      declineCall();
    });
}

function declineCall() {
  stopRing();
  socket.emit('call-decline', { to: _callTarget, from: currentUser });
  _cleanupCall();
  callModal.classList.remove('open');
}

socket.on('call-decline', ({ from }) => {
  toast(from + ' отклонил звонок', 'info', 2500);
  endCall();
});

// ── SIGNALING EXCHANGE ────────────────────────────────────
// Callee is ready → caller creates offer
socket.on('call-answer-ready', async ({ from }) => {
  if (!_isCaller || !rtcPeer) return;
  console.log('[SDP] Creating offer for', from);
  callSt.textContent = 'Соединение…';
  try {
    const offer = await rtcPeer.createOffer();
    await rtcPeer.setLocalDescription(offer);
    socket.emit('call-offer', { to: from, from: currentUser, sdp: offer });
  } catch (e) { console.error('[SDP] offer error:', e); endCall(); }
});

// Callee receives offer → creates answer
socket.on('call-offer', async ({ from, sdp }) => {
  if (_isCaller || !rtcPeer) return;
  console.log('[SDP] Got offer from', from);
  try {
    await rtcPeer.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await rtcPeer.createAnswer();
    await rtcPeer.setLocalDescription(answer);
    socket.emit('call-answer', { to: from, from: currentUser, sdp: answer });
  } catch (e) { console.error('[SDP] answer error:', e); endCall(); }
});

// Caller receives answer
socket.on('call-answer', async ({ from, sdp }) => {
  if (!_isCaller || !rtcPeer) return;
  console.log('[SDP] Got answer from', from);
  try {
    await rtcPeer.setRemoteDescription(new RTCSessionDescription(sdp));
  } catch (e) { console.error('[SDP] set answer error:', e); }
});

// ICE candidates exchange
socket.on('call-ice', async ({ from, candidate }) => {
  if (!rtcPeer) return;
  try {
    await rtcPeer.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) { /* ignore stale candidates */ }
});

// ── RTC SETUP ─────────────────────────────────────────────
function _setupRTC() {
  rtcPeer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  _callActive = true;

  // Add local tracks
  localStream.getTracks().forEach(t => rtcPeer.addTrack(t, localStream));

  // ICE candidate → send to peer
  rtcPeer.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('call-ice', { to: _callTarget, from: currentUser, candidate });
    }
  };

  // Remote stream arrived → show call window
  rtcPeer.ontrack = (event) => {
    console.log('[RTC] Remote track received:', event.track.kind);
    const remoteStream = event.streams[0] || new MediaStream([event.track]);
    showCallWindow(_callTarget, remoteStream, _callIsVid);
  };

  rtcPeer.oniceconnectionstatechange = () => {
    const state = rtcPeer?.iceConnectionState;
    console.log('[RTC] ICE state:', state);
    if (state === 'connected' || state === 'completed') {
      if (callSt) callSt.textContent = 'Разговор';
    } else if (state === 'failed' || state === 'closed') {
      endCall();
    }
  };

  rtcPeer.onconnectionstatechange = () => {
    console.log('[RTC] Connection state:', rtcPeer?.connectionState);
  };
}

// ── END CALL ──────────────────────────────────────────────
function endCall() {
  stopRing();
  if (_callTarget && _callActive) {
    socket.emit('call-end', { to: _callTarget, from: currentUser });
  }
  _cleanupCall();
}

socket.on('call-end', ({ from }) => {
  console.log('[Call] Ended by', from);
  _cleanupCall();
});

function _cleanupCall() {
  stopRing();
  _callActive = false;
  _screenSharing = false;
  _muted = false;
  rtcPeer?.close(); rtcPeer = null;
  localStream?.getTracks().forEach(t => t.stop()); localStream = null;
  screenStream?.getTracks().forEach(t => t.stop()); screenStream = null;
  // Remove call windows
  document.querySelectorAll('.call-win').forEach(w => w.remove());
  if (callModal) callModal.classList.remove('open');
  if (callAct)  callAct.innerHTML = '';
  if (callNm)   callNm.textContent = '';
  if (callSt)   callSt.textContent = '';
  _callTarget = null;
}

// ── MUTE ─────────────────────────────────────────────────
function toggleMute() {
  _muted = !_muted;
  localStream?.getAudioTracks().forEach(t => t.enabled = !_muted);
  const btn = $('callMuteBtn');
  if (btn) {
    btn.querySelector('i').className = _muted ? 'ti ti-microphone-off' : 'ti ti-microphone';
    btn.style.background = _muted ? 'var(--danger)' : '';
  }
}
function toggleMuteWin(btn) {
  _muted = !_muted;
  localStream?.getAudioTracks().forEach(t => t.enabled = !_muted);
  btn.querySelector('i').className = _muted ? 'ti ti-microphone-off' : 'ti ti-microphone';
  btn.style.background = _muted ? 'var(--danger)' : '';
}

// ── SCREEN SHARE (mid-call) ───────────────────────────────
async function switchToScreenShare() {
  if (!rtcPeer || !_callActive) return;
  if (_screenSharing) {
    screenStream?.getTracks().forEach(t => t.stop());
    screenStream = null; _screenSharing = false;
    document.querySelectorAll('.ss-toggle').forEach(b => {
      b.style.background = 'rgba(255,255,255,.18)';
      b.querySelector('i').className = 'ti ti-screen-share';
    });
    toast('Демонстрация остановлена', 'info', 1800);
    return;
  }
  showScreenQualityPicker(async (opts) => {
    if (!opts) return;
    const resMap = { '1080p':{w:1920,h:1080},'720p':{w:1280,h:720},'480p':{w:854,h:480},'360p':{w:640,h:360} };
    const dim = resMap[opts.res] || resMap['720p'];
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width:{ideal:dim.w}, height:{ideal:dim.h}, frameRate:{ideal:parseInt(opts.fps)} },
        audio: true
      });
      const track = screenStream.getVideoTracks()[0];
      const sender = rtcPeer.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(track);
      _screenSharing = true;
      document.querySelectorAll('.ss-toggle').forEach(b => {
        b.style.background = 'var(--accent)';
        b.querySelector('i').className = 'ti ti-screen-share-off';
      });
      toast(`Демонстрация: ${opts.res} / ${opts.fps} FPS`, 'success', 2000);
      track.onended = () => switchToScreenShare(); // stop
    } catch (e) {
      if (e.name !== 'NotAllowedError') toast('Не удалось начать демонстрацию', 'error');
    }
  });
}


// ══════════════════════════════════════════════
// KEYBOARD SHORTCUTS  ← УДОБСТВО
// ══════════════════════════════════════════════
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === 'k') { e.preventDefault(); searchBox?.focus(); }
    if (meta && e.key === ',') { e.preventDefault(); openSettings(); }
    if (e.key === 'Escape') {
      closeSettings(); closeGroupModal();
      $('groupModal')?.classList.remove('open');
      $('settingsModal')?.classList.remove('open');
      $('dialogOverlay')?.classList.remove('open');
    }
  });
}

// ══════════════════════════════════════════════
// SIDEBAR MOBILE  ← УДОБСТВО
// ══════════════════════════════════════════════
let sidebarOverlay = null;
function toggleSidebar() {
  sidebar.classList.toggle('open');
  if (sidebar.classList.contains('open')) {
    if (!sidebarOverlay) {
      sidebarOverlay = document.createElement('div');
      sidebarOverlay.className = 'sidebar-overlay open';
      sidebarOverlay.onclick = toggleSidebar;
      document.body.appendChild(sidebarOverlay);
    } else sidebarOverlay.classList.add('open');
  } else {
    sidebarOverlay?.classList.remove('open');
  }
}
function closeSidebarMobile() {
  if (window.innerWidth <= 768) { sidebar.classList.remove('open'); sidebarOverlay?.classList.remove('open'); }
}

// Swipe to close sidebar on mobile
let _swipeX = 0;
document.addEventListener('touchstart', e => { _swipeX = e.touches[0].clientX; }, { passive:true });
document.addEventListener('touchend', e => {
  if (sidebar.classList.contains('open') && _swipeX > 80 && e.changedTouches[0].clientX - _swipeX < -60)
    toggleSidebar();
}, { passive:true });

// ══════════════════════════════════════════════
// REALTIME POLLING  ← УДОБСТВО: fallback
// ══════════════════════════════════════════════
setInterval(() => { if (currentUser) loadUserData(); }, 30000);
setInterval(() => { if (currentUser) socket.emit('ping'); }, 3000);

// ══════════════════════════════════════════════
// ONLINE BADGE  ← УДОБСТВО
// ══════════════════════════════════════════════
socket.on('avatar-updated', ({ username, avatar }) => {
  userAvatars[username] = avatar;
  // Header avatar update if in their room
  if (currentRoom.startsWith('private:') && currentRoom.includes(username)) {
    setAvatar(roomAvatar, username, avatar);
  }
  renderFriends();
});

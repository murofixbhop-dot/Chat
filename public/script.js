// ═══════════════════════════════════════════════════
// AURA MESSENGER — script.js
// Principal Engineer / UI Lead  2026
// ← КРАСОТА: код как архитектура
// ═══════════════════════════════════════════════════

'use strict';

// ── Socket (must be first) ──────────────────────────
const socket = io({ reconnectionAttempts: Infinity, timeout: 20000, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });

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
    // Rejoin current room after reconnect
    if (currentRoom) socket.emit('join-room', currentRoom);
    loadUserData();
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
  gotoRoom('general');
  setupDragDrop();
  setupKeyboardShortcuts();
  requestNotificationPermission();
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    // Ask after small delay so it doesn't feel abrupt
    setTimeout(async () => {
      await Notification.requestPermission();
    }, 3000);
  }
  // Subscribe to push if SW and permission granted
  if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
    const sw = await navigator.serviceWorker.ready.catch(() => null);
    if (sw) {
      socket.emit('sw-ready', { username: currentUser });
    }
  }
}

function showPushNotification(title, body, tag) {
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // only when tab hidden
  new Notification(title, {
    body,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: tag || 'aura',
    silent: false,
  });
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
  // Notification for messages when tab is hidden
  if (msg.user !== currentUser && document.visibilityState !== 'visible') {
    const nick = msg.user;
    const txt  = msg.type === 'text' ? msg.text : (msg.type === 'audio' ? 'Голосовое сообщение' : 'Медиафайл');
    showPushNotification(nick, txt, 'msg-' + msg.user);
  }
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
  const c = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl:  true,
    sampleRate:       48000,
    channelCount:     1,
    latency:          0,
  };
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
  if (!currentUser) return;
  if (!friendRequests.includes(from)) {
    friendRequests.push(from);
    renderRequests(); updateReqBadge();
    showFriendRequestPopup(from);
  }
});

// Sync friend requests on reconnect (server sends all pending)
socket.on('friend-requests-sync', ({ requests }) => {
  if (!currentUser || !requests?.length) return;
  let changed = false;
  requests.forEach(from => {
    if (!friendRequests.includes(from)) {
      friendRequests.push(from);
      changed = true;
    }
  });
  if (changed) { renderRequests(); updateReqBadge(); }
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
      // Send call-invite via socket (server will relay if online, queue if offline)
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
  // Browser notification when tab not focused
  if (document.hidden) {
    sendBrowserNotification(
      isVid ? `Видеозвонок от ${from}` : `Звонок от ${from}`,
      'Нажмите чтобы ответить', from
    );
  }
  if (_callActive) {
    socket.emit('call-busy', { to: from, from: currentUser });
    return;
  }
  console.log('[Call] Incoming from', from, 'video:', isVid);
  _callTarget = from;
  _callIsVid  = isVid;
  _isCaller   = false;

  // Push notification if tab not focused
  showPushNotification(
    isVid ? `Видеозвонок от ${from}` : `Звонок от ${from}`,
    'Нажмите чтобы ответить',
    'incoming-call'
  );

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
  // Focus window if possible
  window.focus();
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

// Target is offline when we tried to call
socket.on('call-target-offline', ({ target }) => {
  toast(`${target} сейчас не в сети. Они получат уведомление о пропущенном звонке.`, 'info', 4000);
  endCall();
});

// Missed calls delivered when user comes online
socket.on('missed-calls', ({ calls }) => {
  if (!calls?.length) return;
  calls.forEach(c => {
    const age = Math.round((Date.now() - c.time) / 60000);
    const ageStr = age < 1 ? 'только что' : age < 60 ? `${age} мин. назад` : `${Math.round(age/60)} ч. назад`;
    const icon = c.isVid ? 'ti-video' : 'ti-phone';
    const t = document.createElement('div');
    t.className = 'toast warning';
    t.style.cursor = 'pointer';
    t.innerHTML = `<i class="ti ${icon}"></i><span>Пропущенный звонок от <b>${c.from}</b> — ${ageStr}</span>`;
    t.onclick = () => { t.remove(); gotoPrivate(c.from); };
    $('toastContainer')?.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'toastOut .3s ease forwards';
      setTimeout(() => t.remove(), 300);
    }, 10000);
  });
  // Browser notification for missed calls
  if (document.hidden && calls.length > 0) {
    sendBrowserNotification(
      `Пропущенный звонок от ${calls[0].from}`,
      calls.length > 1 ? `Итого пропущено: ${calls.length} звонков` : 'Нажмите чтобы ответить',
      calls[0].from
    );
  }
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

// Callee receives offer → creates answer (also handles renegotiation mid-call)
socket.on('call-offer', async ({ from, sdp }) => {
  if (!rtcPeer) return;
  console.log('[SDP] Got offer from', from, 'signalingState:', rtcPeer.signalingState);
  try {
    await rtcPeer.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await rtcPeer.createAnswer();
    await rtcPeer.setLocalDescription(answer);
    socket.emit('call-answer', { to: from, from: currentUser, sdp: answer });
  } catch (e) { console.error('[SDP] answer error:', e); }
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
  // _callActive stays false until after initial offer/answer completes
  // onnegotiationneeded guards on _callActive so won't fire during setup
  _callActive = false; // set true after connection established

  // Add local tracks (this may trigger onnegotiationneeded — it's blocked by _callActive=false)
  localStream.getTracks().forEach(t => rtcPeer.addTrack(t, localStream));

  // Renegotiation (e.g. screen share added mid-call)
  // Guard: only fire when connection is already established, not during initial setup
  let _negotiating = false;
  rtcPeer.onnegotiationneeded = async () => {
    // Skip during initial setup (signalingState is 'stable' only after first exchange)
    if (!_callActive || _negotiating) return;
    if (rtcPeer.signalingState !== 'stable') return;
    if (!_isCaller) return; // only caller renegotiates
    _negotiating = true;
    try {
      const offer = await rtcPeer.createOffer();
      if (rtcPeer.signalingState !== 'stable') { _negotiating = false; return; }
      await rtcPeer.setLocalDescription(offer);
      socket.emit('call-offer', { to: _callTarget, from: currentUser, sdp: offer });
    } catch (e) { console.error('[RTC] renegotiation:', e); }
    finally { setTimeout(() => { _negotiating = false; }, 500); }
  };

  rtcPeer.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('call-ice', { to: _callTarget, from: currentUser, candidate });
    }
  };

  // Collect remote tracks — ontrack fires once per track (audio+video)
  let _remoteStream = new MediaStream();
  let _callWindowShown = false;
  rtcPeer.ontrack = (event) => {
    console.log('[RTC] Remote track:', event.track.kind);
    // Use the stream from the event if available, else build manually
    if (event.streams && event.streams[0]) {
      _remoteStream = event.streams[0];
    } else {
      _remoteStream.addTrack(event.track);
    }
    // Show window once — on first track, delay to collect all tracks
    if (!_callWindowShown) {
      _callWindowShown = true;
      setTimeout(() => {
        showCallWindow(_callTarget, _remoteStream, _callIsVid);
      }, 200);
    } else {
      // Update existing audio element if video track came later
      const audio = document.querySelector('.call-win audio');
      if (audio) audio.srcObject = _remoteStream;
      const vid = document.querySelector('#rv');
      if (vid) vid.srcObject = _remoteStream;
    }
  };

  rtcPeer.oniceconnectionstatechange = () => {
    const state = rtcPeer?.iceConnectionState;
    console.log('[RTC] ICE state:', state);
    if (state === 'connected' || state === 'completed') {
      _callActive = true; // NOW it's safe for renegotiation
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

// Missed call notification (delivered when user comes online)
socket.on('missed-call', ({ from, isVid, time }) => {
  const ago = Math.round((Date.now() - time) / 60000);
  const label = isVid ? 'Видеозвонок' : 'Звонок';
  const when  = ago < 1 ? 'только что' : ago + ' мин назад';
  toast(`Пропущен: ${label} от ${from} (${when})`, 'warning', 6000);
  showPushNotification(`Пропущен ${label}`, `От ${from} · ${when}`, 'missed-call');
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


function showScreenQualityPicker(callback) {
  const overlay = $('dialogOverlay');
  const box     = $('dialogBox');
  if (!overlay || !box) { callback({ res: '720p', fps: '30' }); return; }

  box.innerHTML = `
    <div class="dlg-ico info"><i class="ti ti-screen-share"></i></div>
    <h3>Настройки демонстрации</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <p style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Разрешение</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="sq-opt"><input type="radio" name="sqres" value="1080p"> 1080p</label>
          <label class="sq-opt sq-sel"><input type="radio" name="sqres" value="720p" checked> 720p</label>
          <label class="sq-opt"><input type="radio" name="sqres" value="480p"> 480p</label>
        </div>
      </div>
      <div>
        <p style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">FPS</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="sq-opt"><input type="radio" name="sqfps" value="60"> 60 FPS</label>
          <label class="sq-opt sq-sel"><input type="radio" name="sqfps" value="30" checked> 30 FPS</label>
          <label class="sq-opt"><input type="radio" name="sqfps" value="15"> 15 FPS</label>
        </div>
      </div>
    </div>
    <div class="dlg-btns">
      <button class="btn-secondary" id="dlgNo">Отмена</button>
      <button class="btn-primary"   id="dlgOk"><i class="ti ti-screen-share"></i> Начать</button>
    </div>`;

  // Add styles for radio options
  if (!document.getElementById('sqStyle')) {
    const st = document.createElement('style');
    st.id = 'sqStyle';
    st.textContent = '.sq-opt{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;cursor:pointer;font-size:13px;border:1.5px solid var(--border);transition:background .12s}.sq-opt:hover,.sq-opt.sq-sel{background:var(--active,rgba(99,102,241,.12));border-color:var(--accent)}.sq-opt input{accent-color:var(--accent)}';
    document.head.appendChild(st);
  }

  overlay.classList.add('open');

  box.querySelectorAll('input[type=radio]').forEach(r => {
    r.addEventListener('change', () => {
      box.querySelectorAll(`[name=${r.name}]`).forEach(x => x.closest('label').classList.remove('sq-sel'));
      r.closest('label').classList.add('sq-sel');
    });
  });

  const close = (v) => { overlay.classList.remove('open'); callback(v); };

  $('dlgOk').onclick = () => {
    const res = box.querySelector('input[name=sqres]:checked')?.value || '720p';
    const fps = box.querySelector('input[name=sqfps]:checked')?.value || '30';
    close({ res, fps });
  };
  $('dlgNo').onclick = () => close(null);
  overlay.onclick = e => { if (e.target === overlay) close(null); };
}

// ── SCREEN SHARE (mid-call) ───────────────────────────────
async function switchToScreenShare() {
  if (!rtcPeer || !_callActive) return;

  // ── Stop screen share ──
  if (_screenSharing) {
    screenStream?.getTracks().forEach(t => t.stop());
    screenStream = null; _screenSharing = false;
    // Restore camera if it was a video call
    if (_callIsVid) {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const camTrack = cam.getVideoTracks()[0];
        const sender = rtcPeer?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(camTrack);
        const lv = document.querySelector('#lv');
        if (lv) { lv.srcObject = cam; lv.style.width = '140px'; }
      } catch {}
    }
    document.querySelectorAll('.ss-toggle').forEach(b => {
      b.style.background = 'rgba(255,255,255,.18)';
      if (b.querySelector('i')) b.querySelector('i').className = 'ti ti-screen-share';
    });
    toast('Демонстрация остановлена', 'info', 1800);
    return;
  }

  // ── Start screen share ──
  // IMPORTANT: getDisplayMedia MUST be called directly in user gesture,
  // not inside a dialog callback (browsers block it otherwise).
  // So: get stream first, then show settings picker (or skip it and use defaults).
  try {
    // Get screen stream immediately on button click (user gesture context)
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width:{ideal:1920}, height:{ideal:1080}, frameRate:{ideal:30} },
      audio: true
    });
  } catch (e) {
    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
      toast('Не удалось захватить экран: ' + e.message, 'error');
    }
    return;
  }

  const screenVid = screenStream.getVideoTracks()[0];

  // Replace video sender OR add new track
  const senders = rtcPeer.getSenders();
  const vidSender = senders.find(s => s.track?.kind === 'video');
  if (vidSender) {
    await vidSender.replaceTrack(screenVid);
  } else {
    // Audio-only call: add screen track, renegotiate
    rtcPeer.addTrack(screenVid, screenStream);
    try {
      const offer = await rtcPeer.createOffer();
      await rtcPeer.setLocalDescription(offer);
      socket.emit('call-offer', { to: _callTarget, from: currentUser, sdp: offer });
    } catch(e) { console.error('[SS] renegotiate error:', e); }
  }

  // Replace audio with screen audio if available
  const screenAudio = screenStream.getAudioTracks()[0];
  if (screenAudio) {
    const audSender = senders.find(s => s.track?.kind === 'audio');
    if (audSender) await audSender.replaceTrack(screenAudio).catch(() => {});
  }

  // Local preview
  const lv = document.querySelector('#lv');
  if (lv) {
    lv.srcObject = screenStream;
    lv.style.width = '200px';
    lv.style.objectFit = 'contain';
    lv.style.borderRadius = '8px';
  }

  _screenSharing = true;
  document.querySelectorAll('.ss-toggle').forEach(b => {
    b.style.background = 'var(--accent)';
    if (b.querySelector('i')) b.querySelector('i').className = 'ti ti-screen-share-off';
  });
  toast('Демонстрация экрана активна', 'success', 2000);
  screenVid.onended = () => switchToScreenShare();
}


// ── CALL WINDOW UI ──────────────────────────────────────
function showCallWindow(peerId, remoteStream, isVid) {
  document.querySelectorAll('.call-win').forEach(w => w.remove());
  const win = document.createElement('div');
  win.className = 'call-modal open call-win';
  win.style.zIndex = '7000';

  if (isVid) {
    win.innerHTML = `
      <div class="call-bg"></div>
      <video id="rv" autoplay playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>
      <video id="lv" autoplay playsinline muted style="position:absolute;bottom:90px;right:20px;width:140px;border-radius:14px;border:2px solid rgba(255,255,255,.3);"></video>
      <div class="call-content" style="position:relative;z-index:1;justify-content:flex-end;padding-bottom:40px">
        <div class="call-timer" id="callTimer" style="color:rgba(255,255,255,.7);font-size:14px;margin-bottom:10px">0:00</div>
        <div class="call-actions">
          <button class="call-btn call-mute" onclick="toggleMuteWin(this)" title="Микрофон"><i class="ti ti-microphone"></i></button>
          <button class="call-btn ss-toggle" style="background:rgba(255,255,255,.18)" onclick="switchToScreenShare()" title="Демонстрация экрана"><i class="ti ti-screen-share"></i></button>
          <button class="call-btn call-end" onclick="endCall()" title="Завершить"><i class="ti ti-phone-off"></i></button>
        </div>
      </div>`;
    document.body.appendChild(win);
    const rv = win.querySelector('#rv');
    const lv = win.querySelector('#lv');
    rv.srcObject = remoteStream;
    rv.play().catch(() => {});
    if (localStream) { lv.srcObject = localStream; lv.play().catch(() => {}); }
  } else {
    win.innerHTML = `
      <div class="call-bg"></div>
      <div class="call-content" style="position:relative;z-index:1">
        <div class="call-ring"><div class="call-ava" id="caWin"></div></div>
        <div class="call-name">${peerId}</div>
        <div class="call-status" id="caStat">Разговор</div>
        <div class="call-timer" id="callTimer" style="color:rgba(255,255,255,.6);font-size:15px;font-variant-numeric:tabular-nums">0:00</div>
        <div class="call-actions">
          <button class="call-btn call-mute" onclick="toggleMuteWin(this)" title="Микрофон"><i class="ti ti-microphone"></i></button>
          <button class="call-btn ss-toggle" style="background:rgba(255,255,255,.18)" onclick="switchToScreenShare()" title="Демонстрация экрана"><i class="ti ti-screen-share"></i></button>
          <button class="call-btn call-end" onclick="endCall()" title="Завершить"><i class="ti ti-phone-off"></i></button>
        </div>
      </div>`;
    document.body.appendChild(win);
    setAvatar(win.querySelector('#caWin'), peerId, userAvatars[peerId]);
    // Audio — use a real element attached to DOM for reliable playback
    const audio = document.createElement('audio');
    audio.id = 'remoteAudio';
    audio.autoplay = true;
    audio.style.display = 'none';
    audio.srcObject = remoteStream;
    // Apply volume
    audio.volume = (parseInt(localStorage.getItem('aura_vol') || '100')) / 100;
    const spk = localStorage.getItem('aura_spk');
    if (spk && spk !== 'default' && audio.setSinkId) audio.setSinkId(spk).catch(() => {});
    win.appendChild(audio);
    // Force play after interaction — browsers may block autoplay
    audio.play().catch(() => {
      document.addEventListener('click', () => audio.play().catch(() => {}), { once: true });
    });
  }

  // Call timer
  let secs = 0;
  win._timer = setInterval(() => {
    secs++;
    const m = Math.floor(secs / 60), s = secs % 60;
    const t = win.querySelector('#callTimer');
    if (t) t.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);

  // Hide the ringing modal
  if (callModal) callModal.classList.remove('open');
}

// ── SCREEN SHARE WINDOW (full-screen viewer) ─────────────
function showScreenShareWindow(peerId, remoteStream) {
  document.querySelectorAll('.call-win').forEach(w => {
    if (w._timer) clearInterval(w._timer);
    w.remove();
  });
  const win = document.createElement('div');
  win.className = 'call-modal open call-win screen-win';
  win.style.zIndex = '7000';
  win.innerHTML = `
    <div class="call-bg" style="background:#000"></div>
    <div class="screen-share-ui screen-share-viewer">
      <div class="ss-header">
        <div class="ss-badge"><i class="ti ti-screen-share"></i> ${peerId} показывает экран</div>
        <button class="icon-btn sm" onclick="toggleFullscreenShare()"><i class="ti ti-maximize"></i></button>
      </div>
      <div class="ss-preview-wrap ss-main-view">
        <video id="ssRemote" autoplay playsinline class="ss-preview ss-remote"></video>
      </div>
      <div class="ss-controls">
        <button class="call-btn call-mute" onclick="toggleMuteWin(this)"><i class="ti ti-microphone"></i></button>
        <button class="call-btn" style="background:rgba(255,255,255,.15)" onclick="toggleFullscreenShare()"><i class="ti ti-maximize"></i></button>
        <button class="call-btn call-end" onclick="endCall()"><i class="ti ti-x"></i></button>
      </div>
    </div>`;
  document.body.appendChild(win);
  const vid = win.querySelector('#ssRemote');
  vid.srcObject = remoteStream;
  vid.play().catch(() => {});
  // Play audio too
  const audio = new Audio();
  audio.srcObject = remoteStream;
  audio.autoplay = true;
  audio.play().catch(() => {});
  win.appendChild(audio);
  if (callModal) callModal.classList.remove('open');
}

function toggleFullscreenShare() {
  const vid = document.querySelector('.ss-remote');
  if (!vid) return;
  if (!document.fullscreenElement) {
    (vid.requestFullscreen || vid.webkitRequestFullscreen).call(vid);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
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
// Smart real-time polling — every 8s as fallback for socket misses
let _lastFriendsHash = '';
let _lastReqsHash    = '';
setInterval(async () => {
  if (!currentUser) return;
  try {
    const r = await fetch('/api/get-user-data', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser })
    });
    const d = await r.json();
    // Only re-render if data actually changed (compare hashes)
    const newFrHash = JSON.stringify((d.friends||[]).sort());
    const newRqHash = JSON.stringify((d.friendRequests||[]).sort());
    if (newFrHash !== _lastFriendsHash) {
      _lastFriendsHash = newFrHash;
      friends = d.friends || [];
      renderFriends();
    }
    if (newRqHash !== _lastReqsHash) {
      _lastReqsHash = newRqHash;
      friendRequests = d.friendRequests || [];
      renderRequests();
      updateReqBadge();
    }
    groups = d.groups || [];
  } catch {}
}, 8000);
// Keep-alive ping every 5s
setInterval(() => { if (currentUser) socket.emit('ping'); }, 5000);

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

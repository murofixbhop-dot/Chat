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
    if (currentRoom) socket.emit('join-room', currentRoom);
    loadUserData();
  }
});

// Reconnect and refresh when tab becomes visible (phone screen on)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentUser) {
    if (!socket.connected) {
      socket.connect();
    } else {
      socket.emit('identify', currentUser);
      if (currentRoom) socket.emit('join-room', currentRoom);
    }
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
  if (!el) return;
  if (url) {
    el.style.backgroundImage = `url(${url})`;
    el.style.backgroundSize  = 'cover';
    el.style.backgroundPosition = 'center';
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
    avaEl.dataset.user = f;
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
  // Request avatars for friends we don't have yet
  list.forEach(f => {
    if (!userAvatars[f]) {
      fetch('/api/get-user-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: f })
      }).then(r => r.json()).then(d => {
        if (d.avatar) {
          userAvatars[f] = d.avatar;
          // Re-render that specific item
          document.querySelectorAll('.ci-ava[data-user="' + f + '"]').forEach(el => setAvatar(el, f, d.avatar));
        }
      }).catch(() => {});
    }
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
    inner += `<div class="msg-img-wrap"><img class="msg-img" src="${msg.url}" loading="lazy" onclick="viewMedia('${msg.url}','image')" alt="фото"></div>`;
    if (msg.text) inner += `<div class="msg-text">${esc(msg.text)}</div>`;
  } else if (msg.type === 'video') {
    inner += `<video class="msg-video" controls preload="auto" playsinline src="${msg.url}"></video>`;
    if (msg.text) inner += `<div class="msg-text">${esc(msg.text)}</div>`;
  } else if (msg.type === 'video_circle') {
    const vid_id = 'vc_' + (msg.id || Math.random().toString(36).slice(2,9));
    inner += `<div class="msg-circle-wrap" id="${vid_id}_wrap">
      <video class="msg-circle" id="${vid_id}" playsinline preload="metadata"
        src="${msg.url}"
        onmousedown="event.preventDefault()"
        onclick="vcTogglePlay('${vid_id}')"
        ondblclick="viewMedia('${msg.url}','video')"
        onloadedmetadata="vcShowDuration('${vid_id}')"></video>
      <div class="vc-overlay" id="${vid_id}_ov">
        <i class="ti ti-player-play vc-play-ico"></i>
      </div>
      <span class="vc-dur" id="${vid_id}_dur"></span>
    </div>`;
  } else if (msg.type === 'audio') {
    const pid = 'vp_' + (msg.id || Math.random().toString(36).slice(2));
    inner += `<div class="voice-player" id="${pid}">
      <button class="vp-play" onclick="vpToggle('${pid}','${msg.url}')"><i class="ti ti-player-play"></i></button>
      <div class="vp-body">
        <div class="vp-waveform" onclick="vpSeek(event,'${pid}','${msg.url}')">${Array.from({length:30},(_,i)=>`<div class="vp-bar" style="height:${8+Math.round(Math.sin(i*.7+1)*8+Math.random()*8)}px"></div>`).join('')}</div>
        <div class="vp-meta"><span class="vp-pos">0:00</span><span class="vp-dur">—</span></div>
      </div>
    </div>`;
  } else if (msg.type === 'file') {
    const fname = esc(msg.fileName || 'Файл');
    const ext = (msg.fileName||'').split('.').pop().toUpperCase().slice(0,4);
    inner += `<a class="msg-file" href="${msg.url}" target="_blank" rel="noopener">
      <i class="ti ti-file msg-file-ico"></i>
      <div class="msg-file-body">
        <div class="msg-file-name">${fname}</div>
        <div class="msg-file-size">${ext || 'FILE'}</div>
      </div>
    </a>`;
  } else {
    inner += `<div class="msg-text">${esc(msg.text)}</div>`;
  }

  inner += `<div class="msg-meta"><span class="msg-time">${msg.time}</span></div>`;
  bub.innerHTML = inner;

  // Convert any legacy <audio> elements to custom voice player
  bub.querySelectorAll('audio').forEach(a => {
    const pid = 'vpl_' + Math.random().toString(36).slice(2,9);
    const url = a.src || a.getAttribute('src') || '';
    if (!url) return;
    const vp = document.createElement('div');
    vp.className = 'voice-player'; vp.id = pid;
    vp.innerHTML = `<button class="vp-play" onclick="vpToggle('${pid}','${url}')"><i class="ti ti-player-play"></i></button><div class="vp-body"><div class="vp-waveform" onclick="vpSeek(event,'${pid}','${url}')">${Array.from({length:30},(_,i)=>'<div class="vp-bar" style="height:'+(8+Math.round(Math.sin(i*.7+1)*8+Math.random()*8))+'px"></div>').join('')}</div><div class="vp-meta"><span class="vp-pos">0:00</span><span class="vp-dur">—</span></div></div>`;
    a.replaceWith(vp);
  });

  // ← УДОБСТВО: right-click context menu
  bub.addEventListener('contextmenu', e => showCtxMsg(e, msg));

  if (!own) row.appendChild(ava);   // no avatar for own messages — no empty gap
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
    mediaRecorder = new MediaRecorder(recStream, { mimeType: mime, audioBitsPerSecond: 96000 });
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
  try { mediaRecorder.requestData(); } catch {}  // flush last chunk
  mediaRecorder.stop();  // onstop fires after all chunks collected
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
});

// New group created — update groups list
socket.on('group-created', () => {
  loadUserData(); // reload to get updated groups
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
//  CALLS — WebRTC + Socket.IO (clean rewrite)
// ══════════════════════════════════════════════════════════

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// State
let rtcPeer      = null;
let _callTarget  = null;
let _callIsVid   = false;
let _isCaller    = false;
let _inCall      = false;  // true from invite until cleanup
let _connected   = false;  // true once ICE connected
let _muted       = false;
let _screenSharing = false;
let screenStream = null;

// DOM
let callModal, callAva, callNm, callSt, callAct;
function initCallDOM() {
  callModal = $('callModal');
  callAva   = $('callAvatar');
  callNm    = $('callName');
  callSt    = $('callStatus');
  callAct   = $('callActions');
}

// ── HELPERS ─────────────────────────────────────────────
function callTarget() {
  if (!currentRoom || !currentRoom.startsWith('private:')) return null;
  return currentRoom.split(':').slice(1).find(p => p !== currentUser) || null;
}

let _ringCtx = null, _ringInterval = null;
function ringBeep() {
  try {
    _ringCtx = new AudioContext();
    const beep = () => {
      if (!_ringCtx) return;
      const o = _ringCtx.createOscillator();
      const g = _ringCtx.createGain();
      o.connect(g); g.connect(_ringCtx.destination);
      o.frequency.value = 480;
      g.gain.setValueAtTime(0.2, _ringCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, _ringCtx.currentTime + 0.4);
      o.start(_ringCtx.currentTime);
      o.stop(_ringCtx.currentTime + 0.4);
    };
    beep();
    _ringInterval = setInterval(beep, 1600);
  } catch {}
}
function stopRing() {
  clearInterval(_ringInterval); _ringInterval = null;
  try { _ringCtx?.close(); } catch {}
  _ringCtx = null;
}

// ── OUTGOING ────────────────────────────────────────────
function startCall(isVid) {
  const target = callTarget();
  if (!target) { toast('Открой личный чат для звонка', 'warning'); return; }
  if (_inCall)  { toast('Звонок уже идёт', 'warning'); return; }

  const vidConstraints = isVid ? {
    width:       { ideal: 1280, max: 1920 },
    height:      { ideal: 720,  max: 1080 },
    frameRate:   { ideal: 30,   max: 60   },
    facingMode:  'user',
  } : false;
  navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: vidConstraints })
    .then(stream => {
      localStream  = stream;
      _callTarget  = target;
      _callIsVid   = isVid;
      _isCaller    = true;
      _inCall      = true;
      _connected   = false;

      socket.emit('call-invite', { to: target, from: currentUser, isVid });
      _showOutgoingUI(target, isVid);
    })
    .catch(err => toast('Нет доступа к ' + (isVid ? 'камере/микрофону' : 'микрофону'), 'error'));
}

function _showOutgoingUI(target, isVid) {
  setAvatar(callAva, target, userAvatars[target]);
  callNm.textContent = target;
  callSt.textContent = isVid ? 'Видеозвонок…' : 'Звоним…';
  callAct.innerHTML  = `
    <button class="call-btn call-mute" id="callMuteBtn" onclick="toggleMute()">
      <i class="ti ti-microphone"></i>
    </button>
    <button class="call-btn call-end" onclick="endCall()">
      <i class="ti ti-phone-off"></i>
    </button>`;
  callModal.classList.add('open');
}

// ── INCOMING ────────────────────────────────────────────
socket.on('call-invite', ({ from, isVid }) => {
  if (document.hidden) {
    showPushNotification(
      isVid ? `Видеозвонок от ${from}` : `Звонок от ${from}`,
      'Нажмите чтобы ответить', 'call-' + from
    );
  }
  if (_inCall) {
    socket.emit('call-busy', { to: from, from: currentUser });
    return;
  }
  _callTarget = from;
  _callIsVid  = isVid;
  _isCaller   = false;
  _inCall     = true;
  _connected  = false;

  setAvatar(callAva, from, userAvatars[from]);
  callNm.textContent = from;
  callSt.textContent = isVid ? 'Видеозвонок…' : 'Входящий звонок…';
  callAct.innerHTML  = `
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
  toast(from + ' занят', 'info', 2500); endCall();
});

// ── ANSWER ──────────────────────────────────────────────
function answerCall() {
  stopRing();
  const vidC = _callIsVid ? { width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30}, facingMode:'user' } : false;
  navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: vidC })
    .then(stream => {
      localStream = stream;
      _createPeer();
      socket.emit('call-answer-ready', { to: _callTarget, from: currentUser });
      callModal.classList.remove('open');
    })
    .catch(() => { toast('Нет доступа к медиа', 'error'); declineCall(); });
}

function declineCall() {
  stopRing();
  socket.emit('call-decline', { to: _callTarget, from: currentUser });
  _cleanup();
}

socket.on('call-decline', () => { toast(_callTarget + ' отклонил звонок', 'info', 2500); _cleanup(); });

// ── SIGNALING ────────────────────────────────────────────
// 1. Callee ready → caller creates RTCPeer and offer
socket.on('call-answer-ready', async ({ from }) => {
  if (!_isCaller) return;
  callSt.textContent = 'Соединение…';
  _createPeer();
  try {
    const offer = await rtcPeer.createOffer();
    await rtcPeer.setLocalDescription(offer);
    socket.emit('call-offer', { to: from, from: currentUser, sdp: offer });
  } catch (e) { console.error('[SDP] offer:', e); _cleanup(); }
});

// 2. Receive offer — initial call OR renegotiation (screen share)
socket.on('call-offer', async ({ from, sdp }) => {
  if (!rtcPeer) return;
  console.log('[SDP] offer, signalingState:', rtcPeer.signalingState);
  try {
    if (rtcPeer.signalingState === 'have-local-offer') {
      await rtcPeer.setLocalDescription({ type: 'rollback' });
    }
    await rtcPeer.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await rtcPeer.createAnswer();
    await rtcPeer.setLocalDescription(answer);
    socket.emit('call-answer', { to: from, from: currentUser, sdp: answer });
  } catch (e) { console.error('[SDP] answer error:', e); }
});

// 3. Receive answer
socket.on('call-answer', async ({ sdp }) => {
  if (!rtcPeer) return;
  try {
    if (rtcPeer.signalingState === 'have-local-offer') {
      await rtcPeer.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  } catch (e) { console.error('[SDP] set-answer error:', e); }
});

// ICE
socket.on('call-ice', async ({ candidate }) => {
  if (!rtcPeer) return;
  try { await rtcPeer.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
});

// End
socket.on('call-end', () => _cleanup());

// Caller started screen share (replaceTrack path — no ontrack fired)
socket.on('screen-share-started', ({ from }) => {
  console.log('[SS] screen-share-started from', from);
  // The video track was already replaced in peer connection
  // Just update the video element to show the new stream
  const rv = document.querySelector('#rv');
  if (rv && rv.srcObject) {
    // Force re-read by reassigning
    const s = rv.srcObject;
    rv.srcObject = null;
    rv.srcObject = s;
    rv.play().catch(() => {});
    console.log('[SS] Refreshed #rv srcObject');
  } else if (!rv) {
    // Audio call — need to show video
    // The video track arrived via replaceTrack, receiver already has it in remoteStream
    // But we need to grab it fresh from the peer connection
    const receivers = rtcPeer?.getReceivers() || [];
    const vidReceiver = receivers.find(r => r.track?.kind === 'video');
    if (vidReceiver?.track) {
      const newStream = new MediaStream([vidReceiver.track]);
      _showScreenReceived(newStream);
      console.log('[SS] Created stream from receiver track');
    }
  }
});

// Caller stopped screen share
socket.on('screen-share-stopped', ({ from }) => {
  document.querySelector('#rv')?.remove();
  document.querySelector('#screenReceiveOverlay')?.remove();
  const win = document.getElementById('activeCallWin');
  if (win) win.style.height = '';
});

// Offline target
socket.on('call-target-offline', ({ target }) => {
  toast(`${target} не в сети — получат уведомление о пропущенном звонке`, 'info', 4000);
  _cleanup();
});

// Missed calls on reconnect
socket.on('missed-calls', ({ calls }) => {
  if (!calls?.length) return;
  calls.forEach(c => {
    const age = Math.round((Date.now() - c.time) / 60000);
    const when = age < 1 ? 'только что' : age < 60 ? `${age} мин. назад` : `${Math.round(age/60)} ч. назад`;
    const label = c.isVid ? 'видеозвонок' : 'звонок';
    const t = Object.assign(document.createElement('div'), {
      className: 'toast warning', style: 'cursor:pointer',
      innerHTML: `<i class="ti ti-phone-missed"></i><span>Пропущен ${label} от <b>${c.from}</b> · ${when}</span>`
    });
    t.onclick = () => { t.remove(); gotoPrivate(c.from); };
    $('toastContainer')?.appendChild(t);
    setTimeout(() => { t.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, 10000);
  });
  if (document.hidden) showPushNotification(`Пропущен звонок от ${calls[0].from}`, `Пропущено ${calls.length}`, 'missed');
});

// ── RTC PEER ─────────────────────────────────────────────
function _createPeer() {
  if (rtcPeer) { try { rtcPeer.close(); } catch {} }
  rtcPeer = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10,
    sdpSemantics: 'unified-plan',
  });

  // Add local tracks
  if (localStream) localStream.getTracks().forEach(t => rtcPeer.addTrack(t, localStream));

  // Send ICE candidates
  rtcPeer.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('call-ice', { to: _callTarget, from: currentUser, candidate });
  };

  // Keep ONE MediaStream and add/replace tracks in it
  let remoteStream = new MediaStream();
  rtcPeer.ontrack = ({ track, streams }) => {
    console.log('[RTC] ontrack:', track.kind, track.readyState);

    // Replace existing track of same kind, or add new
    const existing = remoteStream.getTracks().find(t => t.kind === track.kind);
    if (existing) {
      remoteStream.removeTrack(existing);
    }
    remoteStream.addTrack(track);

    // Update live video element if already shown
    const rv = document.querySelector('#rv');
    if (rv) {
      rv.srcObject = null;
      rv.srcObject = remoteStream;
      rv.play().catch(() => {});
    }

    // Update live audio element
    const ra = document.querySelector('#remoteAudio');
    if (ra && track.kind === 'audio') {
      ra.srcObject = remoteStream;
    }

    // New video track arrived = screen share from other side
    if (_connected && track.kind === 'video') {
      if (!rv) {
        // Audio call — create video element to show screen share
        _showScreenReceived(remoteStream);
      }
      // Video call — rv already updated above with new srcObject, no extra action needed
    }

    if (!_connected && track.kind === 'audio') {
      _connected = true;
      _showCallWindow(remoteStream);
    } else if (!_connected && track.kind === 'video' && _callIsVid) {
      _connected = true;
      _showCallWindow(remoteStream);
    }
  };

  // Connection state
  rtcPeer.onconnectionstatechange = () => {
    const st = rtcPeer?.connectionState;
    console.log('[RTC]', st);
    if (st === 'failed' || st === 'closed') _cleanup();
  };

  rtcPeer.oniceconnectionstatechange = () => {
    const st = rtcPeer?.iceConnectionState;
    console.log('[ICE]', st);
    if (st === 'failed') {
      rtcPeer.restartIce?.();
    }
  };
}

// ── SCREEN RECEIVED (other person sharing screen during audio call) ──
function _showScreenReceived(remoteStream) {
  document.querySelector('#screenReceiveOverlay')?.remove();
  document.querySelector('#rv')?.remove();

  // Find or create call window
  let win = document.getElementById('activeCallWin');
  if (!win) {
    console.warn('[SS] No activeCallWin for screen receive');
    return;
  }

  const scrVid = document.createElement('video');
  scrVid.id = 'rv';
  scrVid.autoplay = true;
  scrVid.playsinline = true;
  scrVid.muted = false;
  scrVid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#111;z-index:1;border-radius:inherit;';
  scrVid.srcObject = remoteStream;

  const badge = document.createElement('div');
  badge.id = 'screenReceiveOverlay';
  badge.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:6;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);border-radius:20px;padding:4px 12px;font-size:11px;color:#fff;display:flex;align-items:center;gap:5px;white-space:nowrap;pointer-events:none;';
  badge.innerHTML = '<i class="ti ti-screen-share" style="font-size:13px;color:var(--accent)"></i> Демонстрация экрана';

  win.insertBefore(scrVid, win.firstChild);
  win.appendChild(badge);

  // Expand call window height for screen share
  win.style.height = '260px';

  scrVid.play().catch(e => {
    console.warn('[SS] play failed:', e);
    // Try on user interaction
    document.addEventListener('click', () => scrVid.play().catch(() => {}), { once: true });
  });

  const vt = remoteStream.getVideoTracks()[0];
  if (vt) {
    vt.onended = () => {
      scrVid.remove();
      badge.remove();
      win.style.height = '';
      console.log('[SS] Screen share ended');
    };
  }
  console.log('[SS] Screen share video inserted, track:', vt?.readyState);
}

// ── CALL WINDOW ──────────────────────────────────────────
function _showCallWindow(remoteStream) {
  document.querySelectorAll('.call-win, .call-win-float').forEach(w => { if (w._timer) clearInterval(w._timer); w.remove(); });
  const win = document.createElement('div');
  win.className = 'call-win-float';
  win.id = 'activeCallWin';

  const btns = `
    <button class="cw-btn cw-mute" onclick="toggleMuteWin(this)" title="Микрофон"><i class="ti ti-microphone"></i></button>
    <button class="cw-btn cw-screen ss-toggle" id="cwScreenBtn" title="Экран"><i class="ti ti-screen-share"></i></button>
    <button class="cw-btn cw-end" onclick="endCall()" title="Завершить"><i class="ti ti-phone-off"></i></button>`;

  if (_callIsVid) {
    win.innerHTML = `
      <div class="cw-bg"></div>
      <video id="rv" autoplay playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;z-index:1;"></video>
      <video id="lv" autoplay playsinline muted style="position:absolute;bottom:58px;right:10px;width:90px;height:68px;border-radius:9px;border:2px solid rgba(255,255,255,.2);object-fit:cover;z-index:3;"></video>
      <div class="cw-controls" style="z-index:4;">
        <span class="cw-timer" id="cwTimer">0:00</span>
        <div class="cw-btns">${btns}</div>
      </div>`;
    document.body.appendChild(win);
    win.querySelector('#rv').srcObject = remoteStream;
    if (localStream) win.querySelector('#lv').srcObject = localStream;
  } else {
    win.innerHTML = `
      <div class="cw-bg"></div>
      <div class="cw-audio-content" id="cwAudioContent">
        <div class="cw-ava" id="cwAva"></div>
        <div class="cw-name" id="cwName">${_callTarget}</div>
      </div>
      <div class="cw-controls" style="z-index:4;">
        <span class="cw-timer" id="cwTimer">0:00</span>
        <div class="cw-btns">${btns}</div>
      </div>`;
    document.body.appendChild(win);
    const cwAva = win.querySelector('#cwAva');
    if (cwAva) setAvatar(cwAva, _callTarget, userAvatars[_callTarget] || null);
    const audio = Object.assign(document.createElement('audio'), { id: 'remoteAudio', autoplay: true });
    audio.srcObject = remoteStream;
    audio.volume = (parseInt(localStorage.getItem('aura_vol') || '100')) / 100;
    audio.play().catch(() => document.addEventListener('click', () => audio.play(), { once: true }));
    win.appendChild(audio);
  }

  // Long-press screen button → quality picker
  _setupScreenBtnLongPress(win);

  // Long-press window → expand/collapse
  _setupWinLongPress(win);

  makeDraggable(win);

  if (callModal) callModal.classList.remove('open');

  let secs = 0;
  win._timer = setInterval(() => {
    secs++;
    const m = Math.floor(secs/60), s = secs % 60;
    const t = win.querySelector('#cwTimer');
    if (t) t.textContent = `${m}:${s.toString().padStart(2,'0')}`;
  }, 1000);
}

function _setupScreenBtnLongPress(win) {
  const btn = win.querySelector('#cwScreenBtn');
  if (!btn) return;
  let _lpt = null;
  // Short click → start/stop screen share
  btn.addEventListener('click', () => switchToScreenShare());
  // Long press (500ms) → quality picker (only when sharing)
  btn.addEventListener('pointerdown', () => {
    _lpt = setTimeout(() => {
      _lpt = null;
      if (_screenSharing) {
        // Show quality picker while sharing
        showScreenQualityPicker(async (opts) => {
          if (!opts) return;
          // Restart with new quality
          if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
          }
          _screenSharing = false;
          setTimeout(() => switchToScreenShare(), 100);
        });
      }
    }, 500);
  });
  btn.addEventListener('pointerup',    () => { clearTimeout(_lpt); _lpt = null; });
  btn.addEventListener('pointerleave', () => { clearTimeout(_lpt); _lpt = null; });
}

function _setupWinLongPress(win) {
  let _lpt = null, _moved = false, _startX = 0, _startY = 0;
  win.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, video')) return;
    _moved = false; _startX = e.clientX; _startY = e.clientY;
    win.classList.add('pressing');
    _lpt = setTimeout(() => {
      if (!_moved) {
        win.classList.remove('pressing');
        toggleCallExpand();
      }
    }, 500);
  });
  win.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - _startX) > 8 || Math.abs(e.clientY - _startY) > 8) {
      _moved = true;
      win.classList.remove('pressing');
      clearTimeout(_lpt); _lpt = null;
    }
  });
  win.addEventListener('pointerup',    () => { win.classList.remove('pressing'); clearTimeout(_lpt); _lpt = null; });
  win.addEventListener('pointerleave', () => { win.classList.remove('pressing'); clearTimeout(_lpt); _lpt = null; });
}

// Make call window draggable ← УДОБСТВО
// ── EXPAND / MINIMIZE call window ──────────────────────
function toggleCallExpand() {
  const win = document.getElementById('activeCallWin');
  if (!win) return;
  const isExpanded = win.classList.contains('cw-expanded');
  if (isExpanded) {
    win.classList.remove('cw-expanded');
    // Restore position
    if (win._savedPos) {
      win.style.left = win._savedPos.left;
      win.style.top  = win._savedPos.top;
      win.style.right = win._savedPos.right;
      win.style.bottom = win._savedPos.bottom;
    }
  } else {
    // Save current position
    const r = win.getBoundingClientRect();
    win._savedPos = { left: win.style.left, top: win.style.top, right: win.style.right, bottom: win.style.bottom };
    win.classList.add('cw-expanded');
  }
}

function makeDraggable(el) {
  let ox=0, oy=0;
  // Position from CSS (top-right) — let CSS handle initial position

  const onDown = (e) => {
    if (e.target.closest('button, video')) return;
    e.preventDefault();
    const isTouch = e.type === 'touchstart';
    const cx = isTouch ? e.touches[0].clientX : e.clientX;
    const cy = isTouch ? e.touches[0].clientY : e.clientY;
    const rect = el.getBoundingClientRect();
    ox = cx - rect.left; oy = cy - rect.top;
    // Switch from right/top to left/top for dragging
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.left = rect.left + 'px'; el.style.top = rect.top + 'px';

    const onMove = (e) => {
      const mx = isTouch ? e.touches[0].clientX : e.clientX;
      const my = isTouch ? e.touches[0].clientY : e.clientY;
      const nx = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  mx - ox));
      const ny = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, my - oy));
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
    };
    const onUp = () => {
      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
      document.removeEventListener(isTouch ? 'touchend'  : 'mouseup',   onUp);
    };
    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
    document.addEventListener(isTouch ? 'touchend'  : 'mouseup',   onUp);
  };
  el.addEventListener('mousedown', onDown);
  el.addEventListener('touchstart', onDown, { passive: false });
}

// ── MUTE ────────────────────────────────────────────────
function toggleMute() {
  _muted = !_muted;
  localStream?.getAudioTracks().forEach(t => t.enabled = !_muted);
  const b = $('callMuteBtn');
  if (b) { b.querySelector('i').className = _muted ? 'ti ti-microphone-off' : 'ti ti-microphone'; b.style.background = _muted ? 'var(--danger)' : ''; }
}
function toggleMuteWin(btn) {
  _muted = !_muted;
  localStream?.getAudioTracks().forEach(t => t.enabled = !_muted);
  btn.querySelector('i').className = _muted ? 'ti ti-microphone-off' : 'ti ti-microphone';
  btn.style.background = _muted ? 'var(--danger)' : '';
}

// ── SCREEN SHARE ─────────────────────────────────────────
async function _applyScreenShare(capturedStream) {
  if (!rtcPeer) { capturedStream.getTracks().forEach(t => t.stop()); return; }
  screenStream = capturedStream;
  const vid = screenStream.getVideoTracks()[0];
  if (!vid) { console.error('[SS] No video track in screen stream'); return; }

  console.log('[SS] Video track:', vid.id, vid.readyState, vid.label);

  const existingSender = rtcPeer.getSenders().find(s => s.track?.kind === 'video');

  if (existingSender) {
    // VIDEO CALL: use replaceTrack — seamless, no renegotiation needed, ontrack fires on receiver
    try {
      await existingSender.replaceTrack(vid);
      console.log('[SS] replaceTrack done — receiver gets new video');
      // Signal to receiver via custom socket event so they know to show screen UI
      socket.emit('screen-share-started', { to: _callTarget, from: currentUser });
    } catch(e) { console.error('[SS] replaceTrack error:', e); return; }
  } else {
    // AUDIO CALL: add new video track then renegotiate
    rtcPeer.addTrack(vid, screenStream);
    console.log('[SS] addTrack done, senders:', rtcPeer.getSenders().length);

    // Wait for stable state
    if (rtcPeer.signalingState !== 'stable') {
      await new Promise(res => {
        const iv = setInterval(() => {
          if (!rtcPeer || rtcPeer.signalingState === 'stable') { clearInterval(iv); res(); }
        }, 80);
        setTimeout(() => { clearInterval(iv); res(); }, 4000);
      });
    }
    try {
      const offer = await rtcPeer.createOffer({ offerToReceiveVideo: true });
      await rtcPeer.setLocalDescription(offer);
      console.log('[SS] Offer SDP (first 200):', offer.sdp.slice(0, 200));
      socket.emit('call-offer', { to: _callTarget, from: currentUser, sdp: offer });
      console.log('[SS] Renegotiation offer sent for audio→screen');
    } catch(e) { console.error('[SS] renegotiation error:', e); return; }
  }

  // Show caller's own screen preview
  const win = document.getElementById('activeCallWin');
  const lv = win?.querySelector('#lv');
  if (lv) {
    lv.srcObject = screenStream;
    lv.style.cssText += ';width:180px;height:100px;object-fit:contain;';
  } else if (win) {
    let rv = win.querySelector('#rv');
    if (!rv) {
      rv = document.createElement('video');
      rv.id = 'rv'; rv.autoplay = true; rv.playsinline = true; rv.muted = true;
      rv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:1;border-radius:inherit;';
      win.insertBefore(rv, win.firstChild);
    }
    rv.srcObject = screenStream;
    rv.play().catch(() => {});
  }

  _screenSharing = true;
  document.querySelectorAll('.ss-toggle').forEach(b => {
    b.style.background = 'var(--accent)';
    b.querySelector('i').className = 'ti ti-screen-share-off';
  });
  // Hide avatar/name during screen share
  const ac = document.getElementById('cwAudioContent');
  if (ac) { ac.style.opacity = '0'; ac.style.pointerEvents = 'none'; }
  toast('Демонстрация экрана активна', 'success', 2500);

  vid.onended = () => switchToScreenShare(); // user clicks "stop sharing" in browser
}


async function switchToScreenShare() {
  if (!rtcPeer || !_connected) return;

  // Check if screen share is supported (not on iOS/Android)
  if (!navigator.mediaDevices?.getDisplayMedia) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const msg = isIOS
      ? 'iOS не поддерживает демонстрацию экрана в браузере'
      : 'Ваш браузер не поддерживает демонстрацию экрана';
    toast(msg, 'warning', 5000);
    return;
  }
  if (_screenSharing) {
    screenStream?.getTracks().forEach(t => t.stop());
    screenStream = null; _screenSharing = false;
    socket.emit('screen-share-stopped', { to: _callTarget, from: currentUser });
    document.querySelectorAll('.ss-toggle').forEach(b => {
      b.style.background = ''; b.title = 'Экран';
      b.querySelector('i').className = 'ti ti-screen-share';
    });
    // Restore avatar/name
    const ac = document.getElementById('cwAudioContent');
    if (ac) { ac.style.opacity = ''; ac.style.pointerEvents = ''; }
    // Remove screen video
    const rv = document.getElementById('activeCallWin')?.querySelector('#rv');
    if (rv && !_callIsVid) { rv.remove(); }
    const win = document.getElementById('activeCallWin');
    if (win) win.style.height = '';
    toast('Демонстрация остановлена', 'info', 2000);
    return;
  }

  // MUST call getDisplayMedia directly in user gesture — not inside dialog callback
  let _capturedStream = null;
  try {
    _capturedStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width:{ideal:1920}, height:{ideal:1080}, frameRate:{ideal:30} },
      audio: true
    });
  } catch(e) {
    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError')
      toast('Не удалось захватить экран: ' + e.message, 'error');
    return;
  }
  if (!_capturedStream) return;

  // Now stream is captured — add to peer connection
  await _applyScreenShare(_capturedStream);
}

function showScreenQualityPicker(cb) {
  const ov = $('dialogOverlay'), box = $('dialogBox');
  if (!ov || !box) { cb({ res:'720p', fps:'30' }); return; }
  box.innerHTML = `
    <div class="dlg-ico info"><i class="ti ti-screen-share"></i></div>
    <h3>Демонстрация экрана</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <p class="lbl mb-6">Разрешение</p>
        ${['1080p','720p','480p'].map((v,i) => `<label class="sq-opt${i===1?' sq-sel':''}"><input type="radio" name="sqr" value="${v}"${i===1?' checked':''}> ${v}</label>`).join('')}
      </div>
      <div>
        <p class="lbl mb-6">FPS</p>
        ${['60','30','15'].map((v,i) => `<label class="sq-opt${i===1?' sq-sel':''}"><input type="radio" name="sqf" value="${v}"${i===1?' checked':''}> ${v} FPS</label>`).join('')}
      </div>
    </div>
    <div class="dlg-btns">
      <button class="btn-secondary" id="dlgNo">Отмена</button>
      <button class="btn-primary" id="dlgOk"><i class="ti ti-screen-share"></i> Начать</button>
    </div>`;
  if (!document.getElementById('sqStyle')) {
    const st = document.createElement('style'); st.id='sqStyle';
    st.textContent='.sq-opt{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;cursor:pointer;font-size:13px;border:1.5px solid var(--border);margin-bottom:6px;transition:all .15s}.sq-opt:hover,.sq-opt.sq-sel{background:var(--active);border-color:var(--accent)}.sq-opt input{accent-color:var(--accent)}.mb-6{margin-bottom:6px}';
    document.head.appendChild(st);
  }
  ov.classList.add('open');
  box.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', () => {
    box.querySelectorAll(`[name=${r.name}]`).forEach(x => x.closest('label').classList.remove('sq-sel'));
    r.closest('label').classList.add('sq-sel');
  }));
  const close = v => { ov.classList.remove('open'); cb(v); };
  $('dlgOk').onclick = () => close({ res: box.querySelector('input[name=sqr]:checked')?.value||'720p', fps: box.querySelector('input[name=sqf]:checked')?.value||'30' });
  $('dlgNo').onclick = () => close(null);
  ov.onclick = e => { if (e.target===ov) close(null); };
}

// ── END / CLEANUP ────────────────────────────────────────
function endCall() {
  stopRing();
  if (_inCall && _callTarget) socket.emit('call-end', { to: _callTarget, from: currentUser });
  _cleanup();
}
function _cleanup() {
  stopRing();
  // Add call record to chat if call was connected
  if (_callTarget && currentRoom && _callConnectedTime) {
    const dur = Math.floor((Date.now() - _callConnectedTime) / 1000);
    const durStr = dur > 0
      ? (dur < 60 ? `${dur}с` : `${Math.floor(dur/60)}м ${dur%60}с`)
      : '';
    const icon = _callIsVid ? '📹' : '📞';
    const time = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    const label = _isCaller ? `Исходящий звонок` : `Входящий звонок`;
    const durLabel = durStr ? ` · ${durStr}` : ' · Не отвечено';
    addCallRecord(icon, label, durLabel, time);
  }
  _callConnectedTime = null;

  _inCall = false; _connected = false; _screenSharing = false; _muted = false;
  rtcPeer?.close(); rtcPeer = null;
  localStream?.getTracks().forEach(t => t.stop()); localStream = null;
  screenStream?.getTracks().forEach(t => t.stop()); screenStream = null;
  document.querySelectorAll('.call-win-float').forEach(w => { if (w._timer) clearInterval(w._timer); w.remove(); });
  if (callModal) callModal.classList.remove('open');
  if (callAct) callAct.innerHTML = '';
  if (callNm)  callNm.textContent = '';
  if (callSt)  callSt.textContent = '';
  _callTarget = null;
}

let _callConnectedTime = null;

function addCallRecord(icon, label, extra, time) {
  const row = document.createElement('div');
  row.className = 'call-record';
  row.innerHTML = `
    <span class="cr-icon">${icon}</span>
    <span class="cr-label">${label}</span>
    <span class="cr-extra">${extra}</span>
    <span class="cr-time">${time}</span>`;
  messagesDiv?.appendChild(row);
  if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
}


// ══════════════════════════════════════════════
// VIDEO CIRCLE  ← КРАСОТА
// ══════════════════════════════════════════════
function vcTogglePlay(id) {
  const v    = document.getElementById(id);
  const ov   = document.getElementById(id + '_ov');
  const ico  = ov?.querySelector('.vc-play-ico');
  const wrap = document.getElementById(id + '_wrap');
  const msgs = document.getElementById('messages');
  if (!v) return;

  const _vcStop = () => {
    if (ico) ico.className = 'ti ti-player-play vc-play-ico';
    ov?.classList.remove('playing');
    wrap?.classList.remove('vc-expanded');
    msgs?.classList.remove('circle-expanded');
    v.currentTime = 0;
  };

  if (v.paused) {
    // Save scroll position before expanding — prevent scroll jump
    const scrollY = msgs ? msgs.scrollTop : 0;
    v.play().catch(() => {});
    if (ico) ico.className = 'ti ti-player-pause vc-play-ico';
    ov?.classList.add('playing');
    wrap?.classList.add('vc-expanded');
    msgs?.classList.add('circle-expanded');
    // Restore scroll after class change to prevent jump
    if (msgs) requestAnimationFrame(() => { msgs.scrollTop = scrollY; });
    v.onended = _vcStop;
  } else {
    v.pause();
    if (ico) ico.className = 'ti ti-player-play vc-play-ico';
    ov?.classList.remove('playing');
    wrap?.classList.remove('vc-expanded');
    msgs?.classList.remove('circle-expanded');
  }
}
function vcShowDuration(id) {
  const v   = document.getElementById(id);
  const dur = document.getElementById(id + '_dur');
  if (!v || !dur || !isFinite(v.duration)) return;
  const m = Math.floor(v.duration / 60);
  const s = Math.floor(v.duration % 60);
  dur.textContent = `${m}:${s.toString().padStart(2,'0')}`;
}

// ══════════════════════════════════════════════
// VOICE PLAYER  ← КРАСОТА + УДОБСТВО
// ══════════════════════════════════════════════
const _vpAudios = {}; // pid -> Audio element

function _vpGetOrCreate(pid, url) {
  if (!_vpAudios[pid]) {
    const a = new Audio(url);
    a.preload = 'auto'; // preload fully for instant playback
    a.volume  = (parseInt(localStorage.getItem('aura_vol') || '100')) / 100;
    const spk = localStorage.getItem('aura_spk');
    if (spk && spk !== 'default' && a.setSinkId) a.setSinkId(spk).catch(() => {});
    // Use rAF instead of timeupdate for smooth waveform scrubbing
    let _vpRaf = null;
    const _vpTick = () => {
      if (!a.paused) _vpUpdate(pid, a);
      _vpRaf = requestAnimationFrame(_vpTick);
    };
    a.addEventListener('play',  () => { cancelAnimationFrame(_vpRaf); _vpRaf = requestAnimationFrame(_vpTick); });
    a.addEventListener('pause', () => { cancelAnimationFrame(_vpRaf); _vpUpdate(pid, a); });
    a.addEventListener('ended', () => { cancelAnimationFrame(_vpRaf); _vpReset(pid, a); });
    a.addEventListener('seeked', () => _vpUpdate(pid, a));
    a.addEventListener('loadedmetadata', () => {
      const c = document.getElementById(pid);
      if (c) {
        const dur = c.querySelector('.vp-dur');
        if (dur && isFinite(a.duration)) {
          const m = Math.floor(a.duration/60), s = Math.round(a.duration%60);
          dur.textContent = `${m}:${s.toString().padStart(2,'0')}`;
        }
      }
    });
    _vpAudios[pid] = a;
  }
  return _vpAudios[pid];
}

function vpToggle(pid, url) {
  const a = _vpGetOrCreate(pid, url);
  const c = document.getElementById(pid);
  const btn = c?.querySelector('.vp-play i');
  // Pause all other players
  Object.entries(_vpAudios).forEach(([id, au]) => {
    if (id !== pid && !au.paused) {
      au.pause();
      const ob = document.querySelector(`#${id} .vp-play i`);
      if (ob) ob.className = 'ti ti-player-play';
    }
  });
  if (a.paused) {
    // Ensure audio is loaded before play
    if (a.readyState < 3) {
      a.load();
      a.addEventListener('canplay', () => {
        a.play().catch(() => {});
        if (btn) btn.className = 'ti ti-player-pause';
      }, { once: true });
    } else {
      a.play().catch(() => {});
      if (btn) btn.className = 'ti ti-player-pause';
    }
  } else {
    a.pause();
    if (btn) btn.className = 'ti ti-player-play';
  }
}

function vpSeek(e, pid, url) {
  const a = _vpGetOrCreate(pid, url);
  if (!isFinite(a.duration)) return;
  const wf = e.currentTarget;
  const pct = (e.clientX - wf.getBoundingClientRect().left) / wf.offsetWidth;
  a.currentTime = pct * a.duration;
  _vpUpdate(pid, a);
}

let _vpLastUpdate = 0;
function _vpUpdate(pid, a) {
  // Throttle: max 30fps
  const now = performance.now();
  if (now - _vpLastUpdate < 33) return;
  _vpLastUpdate = now;

  const c = document.getElementById(pid);
  if (!c) return;
  const dur = a.duration;
  if (!dur || !isFinite(dur)) return;
  const pct = a.currentTime / dur;
  const bars = c.querySelectorAll('.vp-bar');
  const playedCount = Math.floor(pct * bars.length);
  // Use index comparison instead of classList.toggle for speed
  bars.forEach((b, i) => {
    const shouldPlay = i < playedCount;
    if (shouldPlay !== b._played) {
      b._played = shouldPlay;
      b.style.background = shouldPlay
        ? (c.closest('.msg-row.own') ? 'rgba(255,255,255,.95)' : 'var(--accent)')
        : '';
    }
  });
  const pos = c.querySelector('.vp-pos');
  if (pos) {
    const m = Math.floor(a.currentTime/60), s = Math.floor(a.currentTime%60);
    const txt = `${m}:${s.toString().padStart(2,'0')}`;
    if (pos.textContent !== txt) pos.textContent = txt;
  }
}

function _vpReset(pid, a) {
  a.currentTime = 0;
  const c = document.getElementById(pid);
  if (!c) return;
  c.querySelectorAll('.vp-bar').forEach(b => { b._played = false; b.style.background = ''; });
  const btn = c.querySelector('.vp-play i');
  if (btn) btn.className = 'ti ti-player-play';
  const pos = c.querySelector('.vp-pos');
  if (pos) pos.textContent = '0:00';
}


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

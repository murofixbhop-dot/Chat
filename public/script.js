// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// AURA MESSENGER вЂ” script.js
// Principal Engineer / UI Lead  2026
// в†ђ РљР РђРЎРћРўРђ: РєРѕРґ РєР°Рє Р°СЂС…РёС‚РµРєС‚СѓСЂР°
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

'use strict';

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// CUSTOM VIDEO PLAYER
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

function buildCustomVideoPlayer(src) {
  const wrap = document.createElement('div');
  wrap.className = 'cvp-wrap';

  const vid = document.createElement('video');
  vid.src = src;
  vid.preload = 'metadata';
  vid.setAttribute('playsinline', '');
  vid.setAttribute('webkit-playsinline', '');
  wrap.appendChild(vid);

  const bigPlay = document.createElement('div');
  bigPlay.className = 'cvp-big-play';
  bigPlay.innerHTML = `<div class="cvp-big-play-btn"><i class="ti ti-player-play"></i></div>`;
  wrap.appendChild(bigPlay);

  const badge = document.createElement('div');
  badge.className = 'cvp-badge';
  badge.innerHTML = `<i class="ti ti-video"></i><span class="cvp-badge-dur">вЂ”</span>`;
  wrap.appendChild(badge);

  const bar = document.createElement('div');
  bar.className = 'cvp-bar';

  const prog = document.createElement('div');
  prog.className = 'cvp-progress';
  const fill = document.createElement('div');
  fill.className = 'cvp-progress-fill';
  const thumb = document.createElement('div');
  thumb.className = 'cvp-progress-thumb';
  prog.appendChild(fill); prog.appendChild(thumb);

  const ctrl = document.createElement('div');
  ctrl.className = 'cvp-controls';

  const playBtn = document.createElement('button');
  playBtn.className = 'cvp-btn';
  playBtn.innerHTML = `<i class="ti ti-player-play"></i>`;

  const timeEl = document.createElement('span');
  timeEl.className = 'cvp-time';
  timeEl.textContent = '0:00 / 0:00';

  const spacer = document.createElement('div');
  spacer.className = 'cvp-spacer';

  const speedBtn = document.createElement('button');
  speedBtn.className = 'cvp-btn cvp-speed-btn';
  speedBtn.textContent = '1Г—';
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  let speedIdx = 2;

  const volWrap = document.createElement('div');
  volWrap.className = 'cvp-vol-wrap';
  const muteBtn = document.createElement('button');
  muteBtn.className = 'cvp-btn';
  muteBtn.innerHTML = `<i class="ti ti-volume"></i>`;
  const volSlider = document.createElement('input');
  volSlider.type = 'range'; volSlider.className = 'cvp-vol-slider';
  volSlider.min = 0; volSlider.max = 1; volSlider.step = 0.05; volSlider.value = 1;
  volWrap.appendChild(muteBtn); volWrap.appendChild(volSlider);

  const fsBtn = document.createElement('button');
  fsBtn.className = 'cvp-btn';
  fsBtn.innerHTML = `<i class="ti ti-arrows-maximize"></i>`;

  ctrl.append(playBtn, timeEl, spacer, speedBtn, volWrap, fsBtn);
  bar.appendChild(prog); bar.appendChild(ctrl);
  wrap.appendChild(bar);

  const fmt = s => { const m = Math.floor(s/60), sc = Math.floor(s%60); return `${m}:${sc.toString().padStart(2,'0')}`; };

  let hideTimer = null;
  const showCtrls = () => {
    wrap.classList.remove('controls-hidden');
    clearTimeout(hideTimer);
    if (!vid.paused) hideTimer = setTimeout(() => wrap.classList.add('controls-hidden'), 2800);
  };

  vid.addEventListener('loadedmetadata', () => {
    const d = fmt(vid.duration);
    timeEl.textContent = `0:00 / ${d}`;
    badge.querySelector('.cvp-badge-dur').textContent = d;

    // РћРїСЂРµРґРµР»СЏРµРј РѕСЂРёРµРЅС‚Р°С†РёСЋ Рё Р·Р°РґР°С‘Рј РїСЂР°РІРёР»СЊРЅС‹Рµ СЂР°Р·РјРµСЂС‹
    const vw = vid.videoWidth  || 1;
    const vh = vid.videoHeight || 1;
    const isPortrait = vh > vw;
    const ratio = vh / vw;

    if (isPortrait) {
      // Р’РµСЂС‚РёРєР°Р»СЊРЅРѕРµ РІРёРґРµРѕ вЂ” С€РёСЂРёРЅР° 220px, РІС‹СЃРѕС‚Р° РїСЂРѕРїРѕСЂС†РёРѕРЅР°Р»СЊРЅРѕ, РЅРѕ РЅРµ Р±РѕР»СЊС€Рµ 400px
      const w = 220;
      const h = Math.min(Math.round(w * ratio), 400);
      wrap.style.width    = w + 'px';
      wrap.style.maxWidth = w + 'px';
      vid.style.width     = '100%';
      vid.style.height    = h + 'px';
      vid.style.maxHeight = h + 'px';
      vid.style.objectFit = 'cover';
    } else {
      // Р“РѕСЂРёР·РѕРЅС‚Р°Р»СЊРЅРѕРµ вЂ” СЃС‚Р°РЅРґР°СЂС‚РЅР°СЏ С€РёСЂРёРЅР°, РѕРіСЂР°РЅРёС‡РёРІР°РµРј РІС‹СЃРѕС‚Сѓ
      wrap.style.maxWidth = '340px';
      vid.style.maxHeight = '260px';
      vid.style.objectFit = 'contain';
    }
  });
  vid.addEventListener('timeupdate', () => {
    if (!vid.duration) return;
    const p = (vid.currentTime / vid.duration) * 100;
    fill.style.width = p + '%';
    thumb.style.right = (100 - p) + '%';
    timeEl.textContent = `${fmt(vid.currentTime)} / ${fmt(vid.duration)}`;
  });
  vid.addEventListener('play',  () => { playBtn.innerHTML = `<i class="ti ti-player-pause"></i>`; bigPlay.classList.add('hidden'); showCtrls(); });
  vid.addEventListener('pause', () => { playBtn.innerHTML = `<i class="ti ti-player-play"></i>`;  bigPlay.classList.remove('hidden'); showCtrls(); });
  vid.addEventListener('ended', () => { playBtn.innerHTML = `<i class="ti ti-player-play"></i>`;  bigPlay.classList.remove('hidden'); wrap.classList.remove('controls-hidden'); });
  vid.addEventListener('volumechange', () => {
    muteBtn.innerHTML = vid.muted || vid.volume === 0
      ? `<i class="ti ti-volume-off"></i>`
      : vid.volume < 0.4 ? `<i class="ti ti-volume-2"></i>` : `<i class="ti ti-volume"></i>`;
    if (!vid.muted) volSlider.value = vid.volume;
  });

  vid.addEventListener('click', e => { e.stopPropagation(); vid.paused ? vid.play() : vid.pause(); showCtrls(); });
  vid.addEventListener('dblclick', e => { e.stopPropagation(); fsBtn.click(); });
  bigPlay.addEventListener('click', e => { e.stopPropagation(); vid.play(); });
  wrap.addEventListener('mousemove', showCtrls);
  wrap.addEventListener('touchstart', showCtrls, { passive: true });

  playBtn.addEventListener('click', e => { e.stopPropagation(); vid.paused ? vid.play() : vid.pause(); });

  prog.addEventListener('click', e => {
    e.stopPropagation();
    if (!vid.duration) return;
    const r = prog.getBoundingClientRect();
    vid.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * vid.duration;
  });
  prog.addEventListener('touchstart', e => {
    e.stopPropagation();
    const doSeek = ev => {
      const r = prog.getBoundingClientRect();
      const t = ev.touches[0] || ev.changedTouches[0];
      if (vid.duration) vid.currentTime = Math.max(0, Math.min(1, (t.clientX - r.left) / r.width)) * vid.duration;
    };
    doSeek(e);
    prog.addEventListener('touchmove', doSeek, { passive: true });
    prog.addEventListener('touchend', () => prog.removeEventListener('touchmove', doSeek), { once: true });
  }, { passive: true });

  volSlider.addEventListener('input', e => { e.stopPropagation(); vid.volume = parseFloat(volSlider.value); vid.muted = vid.volume === 0; });
  muteBtn.addEventListener('click', e => { e.stopPropagation(); vid.muted = !vid.muted; if (!vid.muted) volSlider.value = vid.volume || 0.7; });

  speedBtn.addEventListener('click', e => {
    e.stopPropagation();
    speedIdx = (speedIdx + 1) % speeds.length;
    vid.playbackRate = speeds[speedIdx];
    speedBtn.textContent = speeds[speedIdx] + 'Г—';
  });

  fsBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      (wrap.requestFullscreen || wrap.webkitRequestFullscreen || wrap.mozRequestFullScreen)?.call(wrap);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fsBtn.innerHTML = document.fullscreenElement
      ? `<i class="ti ti-arrows-minimize"></i>`
      : `<i class="ti ti-arrows-maximize"></i>`;
  });

  return wrap;
}

// РђРІС‚Рѕ-РїР°С‚С‡: Р·Р°РјРµРЅСЏРµРј РІСЃРµ video.msg-video РЅР° РєР°СЃС‚РѕРјРЅС‹Р№ РїР»РµРµСЂ
(function patchVideoPlayer() {
  function upgradeVideos(root) {
    root.querySelectorAll('video.msg-video').forEach(v => {
      if (v.dataset.cvpDone) return;
      v.dataset.cvpDone = '1';
      const src = v.src || v.getAttribute('src') || '';
      if (!src) return;
      v.parentNode.insertBefore(buildCustomVideoPlayer(src), v.nextSibling);
    });
  }
  const obs = new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.matches?.('video.msg-video')) upgradeVideos(n.parentNode);
      else upgradeVideos(n);
    }));
  });
  document.addEventListener('DOMContentLoaded', () => {
    upgradeVideos(document);
    obs.observe(document.body, { childList: true, subtree: true });
  });
  if (document.readyState !== 'loading') {
    upgradeVideos(document);
    obs.observe(document.body, { childList: true, subtree: true });
  }
})();

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// SMART FILE TYPE DETECTION
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const _FILE_CAT = {
  // images
  jpg:'image',jpeg:'image',png:'image',gif:'image',webp:'image',avif:'image',
  svg:'image',ico:'image',bmp:'image',tiff:'image',tif:'image',heic:'image',heif:'image',
  // video
  mp4:'video',webm:'video',mov:'video',avi:'video',mkv:'video',
  flv:'video',wmv:'video',m4v:'video',ogv:'video',ts:'video',
  // audio
  mp3:'audio',ogg:'audio',wav:'audio',flac:'audio',aac:'audio',
  m4a:'audio',opus:'audio',wma:'audio',amr:'audio',
  // docs
  pdf:'pdf',
  doc:'doc',docx:'doc',odt:'doc',rtf:'doc',pages:'doc',
  xls:'sheet',xlsx:'sheet',csv:'sheet',ods:'sheet',numbers:'sheet',
  ppt:'slide',pptx:'slide',odp:'slide',key:'slide',
  // archives
  zip:'arch',rar:'arch','7z':'arch',tar:'arch',gz:'arch',bz2:'arch',xz:'arch',iso:'arch',
  // code
  js:'code',ts:'code',jsx:'code',tsx:'code',html:'code',css:'code',
  py:'code',java:'code',c:'code',cpp:'code',cs:'code',go:'code',
  rs:'code',php:'code',rb:'code',swift:'code',kt:'code',dart:'code',
  sh:'code',bat:'code',yml:'code',yaml:'code',json:'code',xml:'code',
  sql:'code',vue:'code',svelte:'code',
  // text
  txt:'text',md:'text',log:'text',ini:'text',conf:'text',
  // apps
  apk:'apk',ipa:'apk',exe:'apk',dmg:'apk',pkg:'apk',deb:'apk',
  // fonts
  ttf:'font',otf:'font',woff:'font',woff2:'font',
  // 3d / design
  obj:'3d',fbx:'3d',gltf:'3d',glb:'3d',stl:'3d',blend:'3d',
  psd:'3d',ai:'3d',sketch:'3d',fig:'3d',
};
const _FILE_META = {
  image:{ icon:'ti-photo',         cls:'mft-image',  label:'РР·РѕР±СЂР°Р¶РµРЅРёРµ' },
  video:{ icon:'ti-video',         cls:'mft-video',  label:'Р’РёРґРµРѕ'       },
  audio:{ icon:'ti-music',         cls:'mft-audio',  label:'РђСѓРґРёРѕ'       },
  pdf:  { icon:'ti-file-type-pdf', cls:'mft-pdf',    label:'PDF'         },
  doc:  { icon:'ti-file-word',     cls:'mft-doc',    label:'Р”РѕРєСѓРјРµРЅС‚'    },
  sheet:{ icon:'ti-table',         cls:'mft-sheet',  label:'РўР°Р±Р»РёС†Р°'     },
  slide:{ icon:'ti-presentation',  cls:'mft-slide',  label:'РџСЂРµР·РµРЅС‚Р°С†РёСЏ' },
  arch: { icon:'ti-file-zip',      cls:'mft-arch',   label:'РђСЂС…РёРІ'       },
  code: { icon:'ti-code',          cls:'mft-code',   label:'РљРѕРґ'         },
  text: { icon:'ti-file-text',     cls:'mft-text',   label:'РўРµРєСЃС‚'       },
  apk:  { icon:'ti-device-mobile', cls:'mft-apk',    label:'РџСЂРёР»РѕР¶РµРЅРёРµ'  },
  font: { icon:'ti-letter-case',   cls:'mft-font',   label:'РЁСЂРёС„С‚'       },
  '3d': { icon:'ti-box',           cls:'mft-3d',     label:'3D/Р”РёР·Р°Р№РЅ'   },
  file: { icon:'ti-file',          cls:'mft-file',   label:'Р¤Р°Р№Р»'        },
};
function _detectFileCat(name, mime) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  const ext = (name || '').split('.').pop().toLowerCase();
  return _FILE_CAT[ext] || 'file';
}
function _buildFileIconHtml(name, mime) {
  const cat  = _detectFileCat(name, mime);
  const meta = _FILE_META[cat] || _FILE_META.file;
  const ext  = (name || '').split('.').pop().toUpperCase().slice(0, 6) || 'FILE';
  return `<div class="msg-file-ico-wrap ${meta.cls}"><i class="ti ${meta.icon}"></i></div>`;
}



// в”Ђв”Ђ Socket (must be first) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const socket = io({ reconnectionAttempts: Infinity, timeout: 20000, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// SPLASH / LOADING  в†ђ РљР РђРЎРћРўРђ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const splash     = document.getElementById('loadingScreen');
const splashText = document.getElementById('loadingText');
const splashFill = document.getElementById('splashFill');

let splashProgress = 0;
const splashInterval = setInterval(() => {
  splashProgress = Math.min(splashProgress + Math.random() * 18, 85);
  if (splashFill) splashFill.style.width = splashProgress + '%';
}, 200);

let _splashHidden = false;
function hideSplash() {
  if (_splashHidden) return;
  _splashHidden = true;
  clearInterval(splashInterval);
  if (!splash) return;
  if (splashFill) splashFill.style.width = '100%';
  setTimeout(() => {
    splash.classList.add('fade-out');
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.classList.remove('active');
      splash.style.display = 'none';
    }, 420);
  }, 250);
}

socket.on('connect', () => {
  if (splashText) splashText.textContent = 'РџРѕРґРєР»СЋС‡РµРЅРѕ вњ“';
  if (currentUser) {
    socket.emit('identify', currentUser);
    if (currentRoom) socket.emit('join-room', currentRoom);
    loadUserData();
  }
});

// Reconnect and refresh when tab becomes visible (phone screen on)
document.addEventListener('visibilitychange', () => {
  if (!currentUser) return;
  if (document.visibilityState === 'visible') {
    // Р’РµСЂРЅСѓР»РёСЃСЊ вЂ” РїРµСЂРµРїРѕРґРєР»СЋС‡Р°РµРјСЃСЏ РµСЃР»Рё РЅСѓР¶РЅРѕ Рё РѕР±РЅРѕРІР»СЏРµРј РґР°РЅРЅС‹Рµ
    if (!socket.connected) {
      socket.connect();
    } else {
      socket.emit('identify', currentUser);
      if (currentRoom) socket.emit('join-room', currentRoom);
    }
    if (!_inCall) loadUserData();
    if (currentRoom) _sendReadReceipt(currentRoom);
  } else {
    // РЈС…РѕРґРёРј РЅР° РґСЂСѓРіСѓСЋ РІРєР»Р°РґРєСѓ вЂ” СЏРІРЅРѕ РіРѕРІРѕСЂРёРј СЃРµСЂРІРµСЂСѓ С‡С‚Рѕ РѕРЅР»Р°Р№РЅ
    // (С‚Р°Р№РјРµСЂС‹ РІ С„РѕРЅРµ throttle-СЏС‚СЃСЏ, РїРѕСЌС‚РѕРјСѓ С€Р»С‘Рј identify СЃСЂР°Р·Сѓ)
    if (socket.connected) socket.emit('identify', currentUser);
  }
});
socket.on('connect_error', () => {
  if (splashText) splashText.textContent = 'РћС€РёР±РєР° СЃРѕРµРґРёРЅРµРЅРёСЏвЂ¦';
  setTimeout(hideSplash, 1200);
});
socket.on('reconnect_failed', () => hideSplash());

// Hide splash after max 2500ms regardless (covers slow B2 response)
setTimeout(hideSplash, 2500);

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// PALETTE / THEME BOOTSTRAP  в†ђ РљР РђРЎРћРўРђ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// STATE  в†ђ single source of truth
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
let currentUser    = null;
let _historyLoading = false; // true while loading history вЂ” РїРѕРґР°РІР»СЏРµРј СѓРІРµРґРѕРјР»РµРЅРёСЏ
let userData       = { nickname:'', avatar:null, theme:'dark' };
let currentRoom    = null;
let _chatPartner    = null;
const onlineUsersSet = new Set(); // РєС‚Рѕ СЃРµР№С‡Р°СЃ РѕРЅР»Р°Р№РЅ
const unreadCounts      = new Map(); // username -> РєРѕР»-РІРѕ РЅРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹С…
const groupUnreadCounts = new Map(); // groupId -> РєРѕР»-РІРѕ РЅРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹С…
const _chatOrder        = [];        // РїРѕСЂСЏРґРѕРє С‡Р°С‚РѕРІ РїРѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё
const _groupOrder       = [];        // РїРѕСЂСЏРґРѕРє РіСЂСѓРїРї РїРѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё
let friends        = [];
let groups         = [];
let friendRequests = [];
// РђРІР°С‚Р°СЂРєРё Рё РЅРёРєРё вЂ” Р·Р°РіСЂСѓР¶Р°РµРј РёР· localStorage РґР»СЏ РјРіРЅРѕРІРµРЅРЅРѕР№ РѕС‚СЂРёСЃРѕРІРєРё
let userAvatars   = {};
let userNicknames = {};
try {
  const cached = JSON.parse(localStorage.getItem('aura_avatars') || '{}');
  const cachedN = JSON.parse(localStorage.getItem('aura_nicknames') || '{}');
  userAvatars   = cached  || {};
  userNicknames = cachedN || {};
} catch(e) { userAvatars = {}; userNicknames = {}; }

function _saveAvatarCache() {
  try {
    localStorage.setItem('aura_avatars',   JSON.stringify(userAvatars));
    localStorage.setItem('aura_nicknames', JSON.stringify(userNicknames));
  } catch(e) {} // РµСЃР»Рё localStorage РїРµСЂРµРїРѕР»РЅРµРЅ вЂ” РјРѕР»С‡Р° РїСЂРѕРїСѓСЃРєР°РµРј
}

function _setAvatar(username, avatarUrl, nickname) {
  let changed = false;
  if (avatarUrl !== undefined && userAvatars[username] !== avatarUrl) {
    userAvatars[username] = avatarUrl;
    changed = true;
  }
  if (nickname !== undefined && userNicknames[username] !== nickname) {
    userNicknames[username] = nickname;
    changed = true;
  }
  if (changed) _saveAvatarCache();
}
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// DOM REFS  в†ђ keep it clean
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// TOAST  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// DIALOG  в†ђ РЈР”РћР‘РЎРўР’Рћ: РєР°СЃС‚РѕРјРЅС‹Рµ РѕРєРЅР° (no alert!)
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// PALETTE / ACCENT  в†ђ РљР РђРЎРћРўРђ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// LOGIN  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
function showLogin() {
  hideSplash(); // в†ђ РРЎРџР РђР’Р›Р•РќРР•: РІСЃРµРіРґР° РїСЂСЏС‡РµРј splash РїРµСЂРµРґ РїРѕРєР°Р·РѕРј Р»РѕРіРёРЅР°
  loginScreen.style.display = 'flex';
  loginScreen.classList.add('open');
  setTimeout(() => $('loginInput')?.focus(), 100);
}

async function doLogin() {
  const username = $('loginInput').value.trim();
  const password = $('loginPassInput')?.value?.trim() || '';
  const email = _isRegisterMode ? ($('loginEmailInput')?.value?.trim() || '') : '';
  const errEl    = $('loginErr');
  errEl.textContent = '';

  if (!username) {
    errEl.textContent = 'Р’РІРµРґРёС‚Рµ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ';
    $('loginInput').focus();
    return;
  }
  if (password.length < 4) {
    errEl.textContent = 'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РјРµРЅРµРµ 4 СЃРёРјРІРѕР»РѕРІ';
    $('loginPassInput').focus();
    return;
  }
  if (_isRegisterMode && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Р’РІРµРґРёС‚Рµ РєРѕСЂСЂРµРєС‚РЅС‹Р№ email';
    $('loginEmailInput').focus();
    return;
  }

  const btn = $('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>';

  try {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email, mode: _isRegisterMode ? 'register' : 'login' })
    });
    const d = await r.json();
    if (d.success) {
      localStorage.setItem('aura_user', d.user.username);
      localStorage.setItem('aura_pass', password);
      if (d.isNew) {
        toast(`Р”РѕР±СЂРѕ РїРѕР¶Р°Р»РѕРІР°С‚СЊ, ${d.user.username}!`, 'success');
        if (d.needsEmailVerify) {
          const emailVal = $('loginEmailInput')?.value?.trim();
          setTimeout(() => openEmailVerifyModal(emailVal || '', 'register'), 500);
        }
      }
      // Reset register mode
      _isRegisterMode = false;
      const emailWrap = $('loginEmailWrap');
      if (emailWrap) emailWrap.style.display = 'none';
      const subText = $('loginSubText');
      if (subText) subText.textContent = 'Р’РІРµРґРёС‚Рµ РёРјСЏ Рё РїР°СЂРѕР»СЊ';
      const registerLink = $('registerLink');
      if (registerLink) registerLink.textContent = 'Р РµРіРёСЃС‚СЂР°С†РёСЏ';
      const forgotLink = $('forgotLink');
      if (forgotLink) forgotLink.style.display = '';
      const loginBtnEl = $('loginBtn');
      if (loginBtnEl) loginBtnEl.innerHTML = 'Р’РѕР№С‚Рё <i class="ti ti-arrow-right"></i>';
      startSession(d.user);
    } else {
      errEl.textContent = d.error || 'РћС€РёР±РєР° РІС…РѕРґР°';
      $('loginPassInput').focus();
      $('loginPassInput').select();
    }
  } catch {
    errEl.textContent = 'РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ СЃ СЃРµСЂРІРµСЂРѕРј';
  } finally {
    btn.disabled = false;
    if (!_isRegisterMode) btn.innerHTML = 'Р’РѕР№С‚Рё <i class="ti ti-arrow-right"></i>';
  }
}

function togglePassVisibility() {
  const input = $('loginPassInput');
  const icon  = $('passEyeIcon');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  icon.className = input.type === 'password' ? 'ti ti-eye' : 'ti ti-eye-off';
}

let _isRegisterMode = false;

function toggleRegisterMode() {
  _isRegisterMode = !_isRegisterMode;
  const emailWrap  = $('loginEmailWrap');
  const subText    = $('loginSubText');
  const btn        = $('loginBtn');
  const regText    = $('registerLinkText');
  const forgotLink = $('forgotLink');

  if (_isRegisterMode) {
    emailWrap.style.display = 'flex';
    subText.textContent = 'РЎРѕР·РґР°Р№С‚Рµ Р°РєРєР°СѓРЅС‚';
    btn.innerHTML = 'Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ <i class="ti ti-user-plus"></i>';
    if (regText) regText.textContent = 'Р’РѕР№С‚Рё';
    forgotLink.style.display = 'none';
    $('loginEmailInput')?.focus();
  } else {
    emailWrap.style.display = 'none';
    subText.textContent = 'Р’РІРµРґРёС‚Рµ РёРјСЏ Рё РїР°СЂРѕР»СЊ';
    btn.innerHTML = 'Р’РѕР№С‚Рё <i class="ti ti-arrow-right"></i>';
    if (regText) regText.textContent = 'Р РµРіРёСЃС‚СЂР°С†РёСЏ';
    forgotLink.style.display = '';
  }
}

// в”Ђв”Ђ FORGOT PASSWORD вЂ” РєСЂР°СЃРёРІС‹Р№ РјРѕРґР°Р» в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _forgotUsername = '';
let _forgotCode     = '';

function openForgotPass() {
  _forgotUsername = '';
  _forgotCode     = '';
  // Reset to step 1
  ['forgotStep1','forgotStep2','forgotStep3'].forEach((id, i) => {
    const el = $(id);
    if (el) el.classList.toggle('active', i === 0);
  });
  const un = $('forgotUsername');
  if (un) un.value = '';
  ['forgotErr1','forgotErr2','forgotErr3'].forEach(id => {
    const el = $(id); if (el) el.textContent = '';
  });
  const m = $('forgotModal');
  if (m) m.classList.add('open');
  setTimeout(() => $('forgotUsername')?.focus(), 80);
}

function closeForgotPass() {
  const m = $('forgotModal');
  if (m) m.classList.remove('open');
}

// Р—Р°РєСЂС‹С‚РёРµ РїРѕ РєР»РёРєСѓ РЅР° С„РѕРЅ
document.addEventListener('DOMContentLoaded', () => {
  const m = $('forgotModal');
  if (m) m.addEventListener('click', e => { if (e.target === m) closeForgotPass(); });
  const ev = $('emailVerifyModal');
  if (ev) ev.addEventListener('click', e => { if (e.target === ev) closeEmailVerifyModal(); });
  const ai = $('aiChatModal');
  if (ai) ai.addEventListener('click', e => { if (e.target === ai) closeAiChat(); });
});

async function sendForgotCode() {
  const username = $('forgotUsername')?.value?.trim();
  const err = $('forgotErr1');
  if (!username) { if (err) err.textContent = 'Р’РІРµРґРёС‚Рµ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ'; return; }
  if (err) err.textContent = '';

  const btn = document.querySelector('#forgotStep1 .btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> РћС‚РїСЂР°РІРєР°вЂ¦'; }

  try {
    const r = await fetch('/api/request-password-reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const d = await r.json();
    if (d.success) {
      _forgotUsername = username;
      // Switch to step 2
      $('forgotStep1').classList.remove('active');
      $('forgotStep2').classList.add('active');
      setTimeout(() => document.querySelector('.code-digit')?.focus(), 80);
      toast('РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РЅР° email', 'success');
    } else {
      if (err) err.textContent = d.error || 'РћС€РёР±РєР°. РџСЂРѕРІРµСЂСЊС‚Рµ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.';
    }
  } catch {
    if (err) err.textContent = 'РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ СЃ СЃРµСЂРІРµСЂРѕРј';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> РћС‚РїСЂР°РІРёС‚СЊ РєРѕРґ'; }
  }
}

// РђРІС‚РѕРїРµСЂРµС…РѕРґ РјРµР¶РґСѓ С†РёС„СЂР°РјРё РєРѕРґР°
function codeDigit(input, idx) {
  const digits = document.querySelectorAll('.code-digit');
  const val = input.value.replace(/\D/g, '');
  input.value = val.slice(-1);
  if (val && idx < 5) digits[idx + 1]?.focus();
  // Р•СЃР»Рё РІСЃРµ Р·Р°РїРѕР»РЅРµРЅС‹ вЂ” Р°РІС‚РѕСЃР°Р±РјРёС‚
  const code = [...digits].map(d => d.value).join('');
  if (code.length === 6) verifyForgotCode();
}

function codeBack(e, input, idx) {
  if (e.key === 'Backspace' && !input.value && idx > 0) {
    const digits = document.querySelectorAll('.code-digit');
    digits[idx - 1].value = '';
    digits[idx - 1].focus();
  }
}

async function verifyForgotCode() {
  const digits = document.querySelectorAll('.code-digit');
  const code = [...digits].map(d => d.value).join('');
  const err = $('forgotErr2');
  if (code.length < 6) { if (err) err.textContent = 'Р’РІРµРґРёС‚Рµ РІСЃРµ 6 С†РёС„СЂ'; return; }
  if (err) err.textContent = '';
  _forgotCode = code;
  // Go to step 3
  $('forgotStep2').classList.remove('active');
  $('forgotStep3').classList.add('active');
  setTimeout(() => $('forgotNewPass')?.focus(), 80);
}

function toggleForgotPass() {
  const inp = $('forgotNewPass');
  const ico = $('forgotEyeIco');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (ico) ico.className = inp.type === 'password' ? 'ti ti-eye' : 'ti ti-eye-off';
}

async function resetPassword() {
  const newPass = $('forgotNewPass')?.value?.trim();
  const err = $('forgotErr3');
  if (!newPass || newPass.length < 4) {
    if (err) err.textContent = 'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РјРµРЅРµРµ 4 СЃРёРјРІРѕР»РѕРІ';
    return;
  }
  if (err) err.textContent = '';

  const btn = document.querySelector('#forgotStep3 .btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>'; }

  try {
    const r = await fetch('/api/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: _forgotUsername, code: _forgotCode, newPassword: newPass })
    });
    const d = await r.json();
    if (d.success) {
      closeForgotPass();
      toast('РџР°СЂРѕР»СЊ РёР·РјРµРЅС‘РЅ! Р’РѕР№РґРёС‚Рµ СЃ РЅРѕРІС‹Рј РїР°СЂРѕР»РµРј.', 'success');
      // Prefill username
      const inp = $('loginInput');
      if (inp) { inp.value = _forgotUsername; $('loginPassInput')?.focus(); }
    } else {
      if (err) err.textContent = d.error || 'РќРµРІРµСЂРЅС‹Р№ РёР»Рё РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Р№ РєРѕРґ';
      // Go back to step 2
      $('forgotStep3').classList.remove('active');
      $('forgotStep2').classList.add('active');
      document.querySelectorAll('.code-digit').forEach(d => d.value = '');
      document.querySelector('.code-digit')?.focus();
    }
  } catch {
    if (err) err.textContent = 'РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ СЃ СЃРµСЂРІРµСЂРѕРј';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-lock-check"></i> РЎРјРµРЅРёС‚СЊ РїР°СЂРѕР»СЊ'; }
  }
}

function startSession(user) {
  hideSplash(); // в†ђ РРЎРџР РђР’Р›Р•РќРР•: РїСЂСЏС‡РµРј splash РїСЂРё СЃС‚Р°СЂС‚Рµ СЃРµСЃСЃРёРё
  currentUser = user.username;
  userData    = user;
  if (user.avatar) userAvatars[user.username] = user.avatar;
  loginScreen.classList.remove('open');
  loginScreen.style.display = 'none';
  app.classList.remove('hidden');
  app.style.display = 'flex';
  updateProfileUI();
  switchTab('friends'); // СЏРІРЅРѕ РёРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј С‚Р°Р± Р±РµР· РјРёРіР°РЅРёСЏ
  socket.emit('identify', currentUser);
  // Р—Р°РіСЂСѓР¶Р°РµРј РґР°РЅРЅС‹Рµ, Р·Р°С‚РµРј РІРѕСЃСЃС‚Р°РЅР°РІР»РёРІР°РµРј РїРѕСЃР»РµРґРЅРёР№ С‡Р°С‚
  loadUserData().then(() => {
    const lastRoom = localStorage.getItem('aura_last_room');
    if (lastRoom && lastRoom.startsWith('private:')) {
      // РџСЂРѕРІРµСЂСЏРµРј С‡С‚Рѕ СЃРѕР±РµСЃРµРґРЅРёРє РІСЃС‘ РµС‰С‘ РІ РґСЂСѓР·СЊСЏС…
      const parts = lastRoom.split(':');
      const other = parts.slice(1).find(p => p !== currentUser) || parts[1];
      if (friends.includes(other)) {
        gotoRoom(lastRoom);
        return;
      }
    } else if (lastRoom && lastRoom.startsWith('group:')) {
      const gid = lastRoom.replace('group:', '');
      if (groups.find(g => g.id === gid)) {
        gotoRoom(lastRoom);
        return;
      }
    }
    // РќРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅРѕРіРѕ С‡Р°С‚Р° РёР»Рё РґСЂСѓРі СѓРґР°Р»С‘РЅ вЂ” РѕС‚РєСЂС‹РІР°РµРј РїРµСЂРІС‹Р№ С‡Р°С‚ РёР· СЃРїРёСЃРєР°
    if (friends.length > 0) {
      gotoRoom(getRoomId(friends[0]));
    } else {
      currentRoom = null;
      if (roomName)  roomName.textContent  = 'Р’С‹Р±РµСЂРёС‚Рµ С‡Р°С‚';
      if (roomSub)   roomSub.textContent   = '';
      if (hdrRight)  hdrRight.innerHTML    = '';
      if (messagesDiv) messagesDiv.innerHTML = '';
      if (msgsEmpty) { msgsEmpty.style.display = 'flex'; msgsEmpty.innerHTML = '<i class="ti ti-message-circle" style="font-size:48px;opacity:.2"></i><p>Р”РѕР±Р°РІСЊС‚Рµ РґСЂСѓРіР° С‡С‚РѕР±С‹ РЅР°С‡Р°С‚СЊ РѕР±С‰РµРЅРёРµ</p>'; }
      if (onlinePill) onlinePill.style.display = 'none';
    }
  });
  enableInput();
  initCallDOM();
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
  // Timeout: РµСЃР»Рё B2 / СЃРµСЂРІРµСЂ РЅРµ РѕС‚РІРµС‡Р°РµС‚ Р·Р° 4СЃ вЂ” РїРѕРєР°Р·С‹РІР°РµРј Р»РѕРіРёРЅ
  const restoreTimeout = setTimeout(() => showLogin(), 4000);
  fetch('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: savedUser, password: savedPass })
  })
  .then(r => r.json())
  .then(d => {
    clearTimeout(restoreTimeout);
    if (d.success) { startSession(d.user); }
    else {
      // Password changed or account deleted вЂ” show login
      localStorage.removeItem('aura_user');
      localStorage.removeItem('aura_pass');
      localStorage.removeItem('aura_last_room');
      // РќР• СѓРґР°Р»СЏРµРј aura_avatars/nicknames вЂ” РѕРЅРё РїРѕР»РµР·РЅС‹ РґР»СЏ Р»СЋР±РѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅР° СЌС‚РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ
      showLogin();
    }
  })
  .catch(() => { clearTimeout(restoreTimeout); showLogin(); });
} else {
  showLogin();
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// USER DATA  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
async function loadUserData() {
  try {
    const r = await fetch('/api/get-user-data', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser })
    });
    const d = await r.json();
    friends        = d.friends        || [];
    friendRequests = d.friendRequests || [];
    groups         = d.groups         || [];
    // РЎРѕС…СЂР°РЅСЏРµРј email РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ РµСЃР»Рё РІРµСЂРЅСѓР»СЃСЏ СЃ СЃРµСЂРІРµСЂР°
    if (d.recoveryEmail !== undefined) {
      userData.recoveryEmail = d.recoveryEmail;
    }
    if (d.emailVerified !== undefined) {
      userData.emailVerified = d.emailVerified;
    }
    renderFriends();
    renderGroups();
    renderRequests();
    updateReqBadge();

    // РћР±РЅРѕРІР»СЏРµРј РїРѕР»Рµ email РІ РЅР°СЃС‚СЂРѕР№РєР°С… РµСЃР»Рё РѕС‚РєСЂС‹С‚С‹
    const emailField = $('stRecoveryEmail');
    if (emailField && document.activeElement !== emailField) {
      emailField.value = userData.recoveryEmail || '';
    }

    // Р—Р°РіСЂСѓР¶Р°РµРј Р°РІР°С‚Р°СЂРєРё С‚РѕР»СЊРєРѕ С‚РµС… РєС‚Рѕ РµС‰С‘ РЅРµ Р±С‹Р» Р·Р°РіСЂСѓР¶РµРЅ
    friends.forEach(f => {
      if (userAvatars[f] === undefined || userNicknames[f] === undefined) fetchUserAvatar(f);
    });
  } catch(e) {
    console.warn('loadUserData error:', e);
  }
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// RENDER LISTS  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// Р”РІРёРіР°РµРј С‡Р°С‚ СЃРѕР±РµСЃРµРґРЅРёРєР° РЅР° РїРµСЂРІРѕРµ РјРµСЃС‚Рѕ РІ СЃРїРёСЃРєРµ
function _moveChatToTop(username) {
  const idx = _chatOrder.indexOf(username);
  if (idx > -1) _chatOrder.splice(idx, 1);
  _chatOrder.unshift(username);
}

function _moveGroupToTop(gid) {
  const idx = _groupOrder.indexOf(gid);
  if (idx > -1) _groupOrder.splice(idx, 1);
  _groupOrder.unshift(gid);
}

function renderFriends(filter = '') {
  const ul = friendsList;
  const list = filter
    ? friends.filter(f => {
        const nick = (userNicknames[f] || f).toLowerCase();
        return nick.includes(filter.toLowerCase()) || f.toLowerCase().includes(filter.toLowerCase());
      })
    : friends;

  // РЎРѕСЂС‚РёСЂСѓРµРј: СЃРЅР°С‡Р°Р»Р° СЃ РЅРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹РјРё/РїРѕСЃР»РµРґРЅРёРјРё СЃРѕРѕР±С‰РµРЅРёСЏРјРё
  const sortedList = [...list].sort((a, b) => {
    const ai = _chatOrder.indexOf(a);
    const bi = _chatOrder.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const list2 = filter ? list : sortedList;

  // в”Ђв”Ђ Smart diff: РЅРµ РїРµСЂРµСЂРёСЃРѕРІС‹РІР°РµРј РµСЃР»Рё СЃРїРёСЃРѕРє РЅРµ РёР·РјРµРЅРёР»СЃСЏ в”Ђв”Ђ
  const unreadKey = [...unreadCounts.entries()].map(([k,v])=>k+':'+v).join(',');
  const onlineKey = list2.filter(f => onlineUsersSet.has(f)).join(',');
  const newKey = list2.join('|') + '|' + (currentRoom || '') + '|' + unreadKey + '|' + onlineKey;
  if (ul._lastKey === newKey && !filter) return;
  ul._lastKey = newKey;

  if (!list.length) {
    ul.innerHTML = `<li class="msgs-empty" style="padding:24px;font-size:13px;">
      <i class="ti ti-user-off"></i><p>${filter ? 'РќРµ РЅР°Р№РґРµРЅРѕ' : 'РќРµС‚ РґСЂСѓР·РµР№'}</p></li>`;
    return;
  }

  // РЎС‚СЂРѕРёРј map СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёС… СЌР»РµРјРµРЅС‚РѕРІ
  const existing = {};
  ul.querySelectorAll('li[data-friend]').forEach(li => {
    existing[li.dataset.friend] = li;
  });

  // Р”РѕР±Р°РІР»СЏРµРј/РѕР±РЅРѕРІР»СЏРµРј Р±РµР· СѓРґР°Р»РµРЅРёСЏ вЂ” РїСЂРѕСЃС‚Рѕ РїРµСЂРµСЃС‚Р°РІР»СЏРµРј РїРѕСЂСЏРґРѕРє
  list2.forEach((f, idx) => {
    const room     = getRoomId(f);
    const dispName = userNicknames[f] || f;
    const isActive = currentRoom === room;

    let li = existing[f];
    if (!li) {
      // РќРѕРІС‹Р№ СЌР»РµРјРµРЅС‚
      li = document.createElement('li');
      li.dataset.friend = f;
      li.className = 'chat-item' + (isActive ? ' active' : '');
      const avaEl = document.createElement('div');
      avaEl.className = 'ci-ava';
      avaEl.dataset.user = f;
      setAvatar(avaEl, f, userAvatars[f]);
      const isOnNow = onlineUsersSet.has(f);
      const subText = isOnNow
        ? '<span style="color:#22c55e;font-weight:500">в—Џ РѕРЅР»Р°Р№РЅ</span>'
        : (dispName !== f ? '<span style="color:var(--text3)">@' + esc(f) + '</span>' : 'Р›РёС‡РЅС‹Р№ С‡Р°С‚');
      li.innerHTML = `<div class="ci-body">
        <span class="ci-name">${esc(dispName)}</span>
        <span class="ci-sub">${subText}</span>
      </div>
      <div class="ci-badge" id="badge_${f}" style="display:none"></div>`;
      // РћРЅР»Р°Р№РЅ-С‚РѕС‡РєР° РЅР° Р°РІР°С‚Р°СЂРєРµ
      const avaWrap = li.querySelector('.ci-ava');
      if (avaWrap && !avaWrap.querySelector('.online-dot')) {
        const dot = document.createElement('span');
        dot.className = 'online-dot';
        dot.dataset.onlineFor = f;
        dot.style.cssText = 'position:absolute;bottom:1px;right:1px;width:10px;height:10px;border-radius:50%;border:2px solid var(--surface);background:#6b7280;';
        dot.title = 'РќРµ РІ СЃРµС‚Рё';
        avaWrap.style.position = 'relative';
        avaWrap.appendChild(dot);
      }
      li.prepend(avaEl);
      li.onclick = () => { gotoPrivate(f); closeSidebarMobile(); };
      li.addEventListener('contextmenu', e => { e.preventDefault(); showCtxFriend(e, f); });
      // Long press mobile
      let _lptF = null;
      li.addEventListener('touchstart', e => {
        _lptF = setTimeout(() => { _lptF=null; const t=e.touches[0]; showCtxFriend({clientX:t.clientX,clientY:t.clientY,preventDefault:()=>{}},f); }, 600);
      }, { passive:true });
      li.addEventListener('touchend', () => { if(_lptF){clearTimeout(_lptF);_lptF=null;} }, { passive:true });
      li.addEventListener('touchmove', () => { if(_lptF){clearTimeout(_lptF);_lptF=null;} }, { passive:true });
    } else {
      // РћР±РЅРѕРІР»СЏРµРј СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ Р±РµР· РјРёРіР°РЅРёСЏ
      li.classList.toggle('active', isActive);
      const nameEl = li.querySelector('.ci-name');
      if (nameEl && nameEl.textContent !== dispName) nameEl.textContent = dispName;
      // РћР±РЅРѕРІР»СЏРµРј СЃС‚Р°С‚СѓСЃ РѕРЅР»Р°Р№РЅ РІ РїРѕРґРїРёСЃРё
      const subEl = li.querySelector('.ci-sub');
      if (subEl) {
        const isOnNow2 = onlineUsersSet.has(f);
        subEl.innerHTML = isOnNow2
          ? '<span style="color:#22c55e;font-weight:500">в—Џ РѕРЅР»Р°Р№РЅ</span>'
          : (dispName !== f ? `<span style="color:var(--text3)">@${esc(f)}</span>` : 'Р›РёС‡РЅС‹Р№ С‡Р°С‚');
      }
    }
    // РћР±РЅРѕРІР»СЏРµРј Р±РµР№РґР¶ РЅРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹С…
    const badge = li.querySelector('.ci-badge') || document.getElementById('badge_' + f);
    if (badge) {
      const cnt = unreadCounts.get(f) || 0;
      if (cnt > 0 && currentRoom !== getRoomId(f)) {
        badge.textContent = cnt > 99 ? '99+' : cnt;
        badge.style.display = 'flex';
        li.classList.add('has-unread');
      } else {
        badge.style.display = 'none';
        li.classList.remove('has-unread');
      }
    }

    // РЈР±РµР¶РґР°РµРјСЃСЏ С‡С‚Рѕ РїРѕСЂСЏРґРѕРє РїСЂР°РІРёР»СЊРЅС‹Р№
    const atIdx = ul.children[idx];
    if (atIdx !== li) ul.insertBefore(li, atIdx || null);
  });

  // РЈРґР°Р»СЏРµРј РёСЃС‡РµР·РЅСѓРІС€РёС… РґСЂСѓР·РµР№
  ul.querySelectorAll('li[data-friend]').forEach(li => {
    if (!list2.includes(li.dataset.friend)) li.remove();
  });

  // РЈР±РёСЂР°РµРј РїСѓСЃС‚РѕР№-СЃС‚РµР№С‚ li РµСЃР»Рё РѕРЅ РµСЃС‚СЊ
  ul.querySelectorAll('li.msgs-empty').forEach(li => li.remove());

  // Р—Р°РіСЂСѓР¶Р°РµРј Р°РІР°С‚Р°СЂРєРё С‚РѕР»СЊРєРѕ РґР»СЏ С‚РµС… РєС‚Рѕ РµС‰С‘ РЅРµ Р·Р°РіСЂСѓР¶РµРЅ
  list.forEach(f => {
    if (userAvatars[f] === undefined || userNicknames[f] === undefined) fetchUserAvatar(f);
  });
}

function renderGroups() {
  const ul = groupsList;
  if (!groups.length) {
    ul.innerHTML = `<li class="msgs-empty" style="padding:24px;font-size:13px;">
      <i class="ti ti-users"></i><p>РќРµС‚ РіСЂСѓРїРї</p></li>`;
    return;
  }
  const existing = {};
  ul.querySelectorAll('li[data-group]').forEach(li => { existing[li.dataset.group] = li; });

  // РЎРѕСЂС‚РёСЂСѓРµРј РіСЂСѓРїРїС‹ РїРѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё
  const sortedGroups = [...groups].sort((a, b) => {
    const ai = _groupOrder.indexOf(a.id);
    const bi = _groupOrder.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  // РћР±РЅРѕРІР»СЏРµРј РєР»СЋС‡ СЃ СѓС‡С‘С‚РѕРј РЅРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹С…
  const gUnreadKey = [...groupUnreadCounts.entries()].map(([k,v])=>k+':'+v).join(',');
  const newGKey = sortedGroups.map(g => g.id + g.name).join('|') + '|' + (currentRoom||'') + '|' + gUnreadKey;
  if (ul._lastKey === newGKey) return;
  ul._lastKey = newGKey;
  sortedGroups.forEach((g, idx) => {
    const isActive = currentRoom === `group:${g.id}`;
    let li = existing[g.id];
    if (!li) {
      li = document.createElement('li');
      li.dataset.group = g.id;
      li.className = 'chat-item' + (isActive ? ' active' : '');
      const avaEl = document.createElement('div');
      avaEl.className = 'ci-ava';
      avaEl.style.borderRadius = '12px';
      avaEl.dataset.groupAva = g.id;
      if (g.avatar) {
        setAvatar(avaEl, `group:${g.id}`, g.avatar);
      } else {
        avaEl.innerHTML = '<i class="ti ti-users"></i>';
      }
      li.innerHTML = `<div class="ci-body">
        <span class="ci-name">${esc(g.name)}</span>
        <span class="ci-sub">${(g.members||[]).length} СѓС‡Р°СЃС‚РЅРёРєРѕРІ</span>
      </div>
      <div class="ci-badge" id="gbadge_${g.id}" style="display:none"></div>`;
      li.prepend(avaEl);
      li.onclick = () => {
      if (groupUnreadCounts.has(g.id)) {
        groupUnreadCounts.delete(g.id);
        // РћР±РЅРѕРІРёРј Р±РµР№РґР¶ РЅРµРјРµРґР»РµРЅРЅРѕ
        const badge = li.querySelector('.ci-badge');
        if (badge) { badge.style.display = 'none'; }
        li.classList.remove('has-unread');
      }
      gotoRoom(`group:${g.id}`);
      closeSidebarMobile();
    };
    } else {
      li.classList.toggle('active', isActive);
      const avaEl = li.querySelector('[data-group-ava]');
      if (avaEl) {
        if (g.avatar) setAvatar(avaEl, `group:${g.id}`, g.avatar);
        else { avaEl.style.backgroundImage = ''; avaEl.innerHTML = '<i class="ti ti-users"></i>'; }
      }
      const nameEl = li.querySelector('.ci-name');
      if (nameEl) nameEl.textContent = g.name;
    }
    // РћР±РЅРѕРІР»СЏРµРј Р±РµР№РґР¶ (Рё РґР»СЏ РЅРѕРІС‹С… Рё РґР»СЏ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёС… li)
    const badge2 = document.getElementById('gbadge_' + g.id) || li.querySelector('.ci-badge');
    const cnt2 = groupUnreadCounts.get(g.id) || 0;
    if (badge2) {
      if (cnt2 > 0 && !isActive) {
        badge2.textContent = cnt2 > 99 ? '99+' : cnt2;
        badge2.style.display = 'flex';
        li.classList.add('has-unread');
      } else {
        badge2.style.display = 'none';
        li.classList.remove('has-unread');
      }
    }
    const at = ul.children[idx];
    if (at !== li) ul.insertBefore(li, at || null);
  });
  ul.querySelectorAll('li[data-group]').forEach(li => {
    if (!groups.find(g => g.id === li.dataset.group)) li.remove();
  });
  ul.querySelectorAll('li.msgs-empty').forEach(li => li.remove());
}

function renderRequests() {
  const ul = requestsList;
  ul.innerHTML = '';
  if (!friendRequests.length) {
    ul.innerHTML = `<li class="msgs-empty" style="padding:24px;font-size:13px;">
      <i class="ti ti-bell-off"></i><p>РќРµС‚ Р·Р°СЏРІРѕРє</p></li>`;
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
      <div class="ci-body"><span class="ci-name">${req}</span><span class="ci-sub">РҐРѕС‡РµС‚ РґРѕР±Р°РІРёС‚СЊ РІР°СЃ</span></div>
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

// в†ђ РЈР”РћР‘РЎРўР’Рћ: live search
function filterChats(q) {
  renderFriends(q);
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// SIDEBAR TABS  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// ROOMS  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
function getRoomId(friend) {
  return 'private:' + [currentUser, friend].sort().join(':');
}

function gotoPrivate(friend) {
  // РЎР±СЂРѕСЃ Р±РµР№РґР¶Р° РЅР°РїСЂСЏРјСѓСЋ РІ DOM
  unreadCounts.delete(friend);
  const badge = document.getElementById('badge_' + friend)
             || friendsList?.querySelector(`li[data-friend="${friend}"] .ci-badge`);
  if (badge) { badge.style.display = 'none'; badge.textContent = ''; }
  const li = friendsList?.querySelector(`li[data-friend="${friend}"]`);
  if (li) li.classList.remove('has-unread');
  gotoRoom(getRoomId(friend));
  if (window.innerWidth <= 768) closeSidebarMobile();
}

function gotoRoom(room) {
  if (currentRoom === room) return;
  currentRoom = room;
  // Р—Р°РїРѕРјРёРЅР°РµРј РїРѕСЃР»РµРґРЅРёР№ С‡Р°С‚
  try { localStorage.setItem('aura_last_room', room); } catch(e) {}
  // РЎР±СЂР°СЃС‹РІР°РµРј РєСЌС€ СЂРµРЅРґРµСЂР° С‡С‚РѕР±С‹ РѕР±РЅРѕРІРёС‚СЊ РІС‹РґРµР»РµРЅРёРµ Р°РєС‚РёРІРЅРѕРіРѕ С‡Р°С‚Р°
  if (friendsList) friendsList._lastKey = '';
  if (groupsList)  groupsList._lastKey  = '';

  const callBtnsHtml = `
    <button class="icon-btn" title="РђСѓРґРёРѕР·РІРѕРЅРѕРє" onclick="startCall(false)"><i class="ti ti-phone"></i></button>
    <button class="icon-btn" title="Р’РёРґРµРѕР·РІРѕРЅРѕРє" onclick="startCall(true)"><i class="ti ti-video"></i></button>`;

  if (room.startsWith('private:')) {
    const parts = room.split(':');
    const other = parts.slice(1).find(p => p !== currentUser) || parts[1];
    _chatPartner = other;
    const dispName = userNicknames[other] || other;
    roomName.textContent = dispName;
    // РћРЅР»Р°Р№РЅ-СЃС‚Р°С‚СѓСЃ РІ РїРѕРґР·Р°РіРѕР»РѕРІРєРµ
    const isOnlineNow = onlineUsersSet.has(other);
    roomSub.innerHTML = `<span id="chatOnlineStatus" style="color:${isOnlineNow?'#22c55e':'var(--text3)'}">
      ${isOnlineNow ? 'РѕРЅР»Р°Р№РЅ' : 'РЅРµ РІ СЃРµС‚Рё'}</span>`;
    setAvatar(roomAvatar, other, userAvatars[other]);
    if (onlinePill) onlinePill.style.display = 'none';
    hdrRight.innerHTML = callBtnsHtml;
    // РљР»РёРє РїРѕ Р°РІР°С‚Р°СЂРєРµ/РЅРёРєСѓ в†’ РїСЂРѕС„РёР»СЊ
    roomAvatar.style.cursor = 'pointer';
    roomAvatar.onclick = () => openUserProfile(other);
    roomName.style.cursor = 'pointer';
    roomName.onclick = () => openUserProfile(other);
  } else if (room.startsWith('group:')) {
    const g = groups.find(g => g.id === room.replace('group:', ''));
    roomName.textContent = g?.name || 'Р“СЂСѓРїРїР°';
    roomSub.textContent  = g ? `${(g.members||[]).length} СѓС‡Р°СЃС‚РЅРёРєРѕРІ` : 'Р“СЂСѓРїРїР°';
    if (g?.avatar) {
      setAvatar(roomAvatar, `group:${g.id}`, g.avatar);
    } else {
      roomAvatar.innerHTML = '<i class="ti ti-users" style="font-size:14px"></i>';
      roomAvatar.style.backgroundImage = '';
      roomAvatar.style.background = 'linear-gradient(135deg,var(--accent),var(--accent2))';
    }
    roomAvatar.style.borderRadius = '12px';
    if (onlinePill) onlinePill.style.display = 'none';
    // РљР»РёРє РїРѕ Р°РІР°С‚Р°СЂРєРµ/РЅР°Р·РІР°РЅРёСЋ в†’ РїСЂРѕС„РёР»СЊ РіСЂСѓРїРїС‹
    roomAvatar.style.cursor = 'pointer';
    roomAvatar.onclick = () => g && openGroupProfile(g);
    roomName.style.cursor = 'pointer';
    roomName.onclick = () => g && openGroupProfile(g);
    const isCreator = g?.creator === currentUser;
    const editBtn = isCreator
      ? `<button class="icon-btn" title="Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РіСЂСѓРїРїСѓ" onclick="openGroupEdit('${g.id}')"><i class="ti ti-settings"></i></button>`
      : '';
    hdrRight.innerHTML = editBtn + callBtnsHtml;
  }

  socket.emit('join-room', room);
  _sendReadReceipt(room); // СЃРѕРѕР±С‰Р°РµРј С‡С‚Рѕ РїСЂРѕС‡РёС‚Р°Р»Рё
  renderFriends();
  renderGroups();
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// MESSAGES  в†ђ РљР РђРЎРћРўРђ + РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
socket.on('online-count', n => { if (onlineCount) onlineCount.textContent = n; });
let _onlineUpdateTimer = null;
socket.on('online-users', users => {
  onlineUsersSet.clear();
  users.forEach(u => onlineUsersSet.add(u));
  
  // РћР±РЅРѕРІР»СЏРµРј С‚РѕС‡РєРё РЅР° Р°РІР°С‚Р°СЂРєР°С… СЃСЂР°Р·Сѓ
  document.querySelectorAll('[data-online-for]').forEach(dot => {
    const u = dot.dataset.onlineFor;
    const isOn = onlineUsersSet.has(u);
    dot.style.background = isOn ? '#22c55e' : '#6b7280';
    dot.title = isOn ? 'РћРЅР»Р°Р№РЅ' : 'РќРµ РІ СЃРµС‚Рё';
  });

  // renderFriends РѕР±РЅРѕРІРёС‚ ci-sub С‡РµСЂРµР· cache key (РІРєР»СЋС‡Р°РµС‚ onlineKey)
  if (friendsList) friendsList._lastKey = '';
  renderFriends();
  _updateChatOnlineStatus();
});

function _updateChatOnlineStatus() {
  if (!_chatPartner || !roomSub) return;
  const isOnline = onlineUsersSet.has(_chatPartner);
  const color = isOnline ? '#22c55e' : 'var(--text3)';
  const text = isOnline ? 'РѕРЅР»Р°Р№РЅ' : 'РЅРµ РІ СЃРµС‚Рё';
  // РћР±РЅРѕРІР»СЏРµРј РёР»Рё РїРµСЂРµСЃРѕР·РґР°С‘Рј span
  let statusEl = document.getElementById('chatOnlineStatus');
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.style.color = color;
  } else {
    // span РЅРµ СЃСѓС‰РµСЃС‚РІСѓРµС‚ вЂ” РїРµСЂРµСЃРѕР·РґР°С‘Рј roomSub
    roomSub.innerHTML = `<span id="chatOnlineStatus" style="color:${color}">${text}</span>`;
  }
}

socket.on('history', msgs => {
  _historyLoading = true;
  messagesDiv.innerHTML = '';
  _lastMsgDate = null;
  if (msgsEmpty) msgsEmpty.style.display = msgs.length ? 'none' : 'flex';
  msgs.forEach(addMessage);
  // РџРѕСЃР»Рµ РѕС‚СЂРёСЃРѕРІРєРё РёСЃС‚РѕСЂРёРё вЂ” СЂР°Р·СЂРµС€Р°РµРј СѓРІРµРґРѕРјР»РµРЅРёСЏ РґР»СЏ РЅРѕРІС‹С… СЃРѕРѕР±С‰РµРЅРёР№
  requestAnimationFrame(() => {
    _historyLoading = false;
    _applyHiddenMessages(); // СЃРєСЂС‹РІР°РµРј СѓРґР°Р»С‘РЅРЅС‹Рµ Сѓ СЃРµР±СЏ
    // РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј _lastMsgDate СЃ РїРѕСЃР»РµРґРЅРёРј РІРёРґРёРјС‹Рј СЂР°Р·РґРµР»РёС‚РµР»РµРј РІ DOM
    const seps = messagesDiv?.querySelectorAll('.msg-day-sep');
    const lastSep = seps?.length ? seps[seps.length - 1] : null;
    if (lastSep) {
      // РћР±СЂР°С‚РЅРѕ РєРѕРЅРІРµСЂС‚РёСЂСѓРµРј С‚РµРєСЃС‚ СЂР°Р·РґРµР»РёС‚РµР»СЏ РІ РґР°С‚Сѓ
      const txt = lastSep.textContent.trim();
      const today = new Date().toLocaleDateString('ru-RU', { day:'numeric', month:'long', timeZone:'Europe/Moscow' });
      const yesterday = new Date(Date.now()-86400000).toLocaleDateString('ru-RU', { day:'numeric', month:'long', timeZone:'Europe/Moscow' });
      if (txt === 'РЎРµРіРѕРґРЅСЏ') _lastMsgDate = today;
      else if (txt === 'Р’С‡РµСЂР°') _lastMsgDate = yesterday;
      else _lastMsgDate = txt;
    } else {
      _lastMsgDate = null; // РЅРµС‚ СЂР°Р·РґРµР»РёС‚РµР»РµР№ вЂ” СЃР±СЂР°СЃС‹РІР°РµРј
    }
  });
});

socket.on('message', msg => {
  const room = msg.room || '';
  const isOwn = msg.user === currentUser;
  const isActive = room === currentRoom;

  if (!isOwn && !isActive && !_historyLoading) {
    if (room.startsWith('private:')) {
      const partner = room.split(':').slice(1).find(p => p !== currentUser);
      if (partner) {
        // РћР±РЅРѕРІР»СЏРµРј СЃС‡С‘С‚С‡РёРє
        const cnt = (unreadCounts.get(partner) || 0) + 1;
        unreadCounts.set(partner, cnt);
        _moveChatToTop(partner);

        // РћР±РЅРѕРІР»СЏРµРј Р±РµР№РґР¶ РќРђРџР РЇРњРЈР® РІ DOM вЂ” Р±РµР· renderFriends
        const badge = document.getElementById('badge_' + partner)
                   || friendsList?.querySelector(`li[data-friend="${partner}"] .ci-badge`);
        if (badge) {
          badge.textContent = cnt > 99 ? '99+' : cnt;
          badge.style.display = 'flex';
          badge.closest('li')?.classList.add('has-unread');
        }

        // РџРѕРґРЅРёРјР°РµРј С‡Р°С‚ РЅР°РІРµСЂС… вЂ” РїРµСЂРµСЃС‚Р°РІР»СЏРµРј li
        const li = friendsList?.querySelector(`li[data-friend="${partner}"]`);
        if (li && friendsList?.firstChild !== li) {
          friendsList.prepend(li);
        }

        // Р—РІСѓРє СѓРІРµРґРѕРјР»РµРЅРёСЏ
        playNotifSound();

        // Push-СѓРІРµРґРѕРјР»РµРЅРёРµ РµСЃР»Рё РІРєР»Р°РґРєР° СЃРєСЂС‹С‚Р°
        if (document.hidden) {
          const senderNick = userNicknames?.[msg.user] || msg.user || '';
          const preview = msg.text ? msg.text.slice(0, 60) : 'рџ“Ћ Р’Р»РѕР¶РµРЅРёРµ';
          showPushNotification(senderNick, preview, room);
        }
      }
    } else if (room.startsWith('group:')) {
      const gid = room.slice(6);
      const cnt2 = (groupUnreadCounts.get(gid) || 0) + 1;
      groupUnreadCounts.set(gid, cnt2);
      _moveGroupToTop(gid);

      // РћР±РЅРѕРІР»СЏРµРј Р±РµР№РґР¶ РіСЂСѓРїРїС‹ РќРђРџР РЇРњРЈР®
      const gbadge = document.getElementById('gbadge_' + gid)
                  || groupsList?.querySelector(`li[data-group="${gid}"] .ci-badge`);
      if (gbadge) {
        gbadge.textContent = cnt2 > 99 ? '99+' : cnt2;
        gbadge.style.display = 'flex';
        gbadge.closest('li')?.classList.add('has-unread');
      }

      // РџРѕРґРЅРёРјР°РµРј РіСЂСѓРїРїСѓ РЅР°РІРµСЂС…
      const gli = groupsList?.querySelector(`[data-group="${gid}"]`);
      if (gli && groupsList?.firstChild !== gli) {
        groupsList.prepend(gli);
      }

      // Р—РІСѓРє СѓРІРµРґРѕРјР»РµРЅРёСЏ
      playNotifSound();

      // Push-СѓРІРµРґРѕРјР»РµРЅРёРµ РµСЃР»Рё РІРєР»Р°РґРєР° СЃРєСЂС‹С‚Р°
      if (document.hidden) {
        const grp = groups?.find(g => g.id === gid);
        const grpName = grp?.name || 'Р“СЂСѓРїРїР°';
        const senderNick = userNicknames?.[msg.user] || msg.user || '';
        const preview = msg.text
          ? (senderNick ? `${senderNick}: ${msg.text.slice(0,60)}` : msg.text.slice(0,60))
          : `${senderNick}: рџ“Ћ Р’Р»РѕР¶РµРЅРёРµ`;
        showPushNotification(grpName, preview, `group:${gid}`);
      }
    }
  }
  // Р РµРЅРґРµСЂРёРј С‚РѕР»СЊРєРѕ РµСЃР»Рё СЃРѕРѕР±С‰РµРЅРёРµ РёР· С‚РµРєСѓС‰РµР№ РєРѕРјРЅР°С‚С‹
  if (isActive) {
    addMessage(msg);
    // Р•СЃР»Рё РјС‹ СѓР¶Рµ РІ СЌС‚РѕРј С‡Р°С‚Рµ вЂ” СЃСЂР°Р·Сѓ РѕС‚РјРµС‡Р°РµРј РїСЂРѕС‡РёС‚Р°РЅРЅС‹Рј
    if (!document.hidden) {
      _sendReadReceipt(room);
    }
  }
});
socket.on('system', addSystem);

// РљРѕРЅРІРµСЂС‚РёСЂСѓРµС‚ URL С„Р°Р№Р»Р° РІ СЂР°Р±РѕС‡РёР№ src
function fileUrl(url) {
  if (!url) return url;
  if (url.startsWith('/api/dl')) return url;         // СѓР¶Рµ РїСЂРѕРєСЃРё
  if (url.startsWith('data:'))   return url;         // data URI
  if (url.startsWith('/'))       return url;         // РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Р№
  if (url.includes('.supabase.co/storage/')) return url; // Supabase public вЂ” РЅР°РїСЂСЏРјСѓСЋ
  // B2: /file/BUCKET/path в†’ /api/dl?f=path
  const m = url.match(/\/file\/[^/]+\/(.+?)(\?|$)/);
  if (m) return '/api/dl?f=' + encodeURIComponent(m[1]);
  return url; // Р»СЋР±РѕР№ РґСЂСѓРіРѕР№ РІРЅРµС€РЅРёР№ URL
}


// в”Ђв”Ђ Read receipts в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// РљРѕРіРґР° РїР°СЂС‚РЅС‘СЂ РѕС‚РєСЂС‹РІР°РµС‚ С‡Р°С‚ вЂ” РїРѕРјРµС‡Р°РµРј РЅР°С€Рё СЃРѕРѕР±С‰РµРЅРёСЏ РєР°Рє РїСЂРѕС‡РёС‚Р°РЅРЅС‹Рµ
socket.on('messages-read', ({ room, by }) => {
  if (room !== currentRoom) return;
  // РћР±РЅРѕРІР»СЏРµРј С‚РѕС‡РєРё С‚РѕР»СЊРєРѕ РґР»СЏ СЃРѕРѕР±С‰РµРЅРёР№ РІ СЌС‚РѕР№ РєРѕРјРЅР°С‚Рµ
  document.querySelectorAll(`.msg-status[data-room="${room}"]`).forEach(el => {
    const dots = el.querySelectorAll('.msg-dot');
    dots.forEach(d => { d.className = 'msg-dot msg-dot-2'; });
  });
  // РўР°РєР¶Рµ РѕР±РЅРѕРІР»СЏРµРј СЃРѕРѕР±С‰РµРЅРёСЏ Р±РµР· data-room (СЃС‚Р°СЂС‹Рµ)
  document.querySelectorAll('.msg-status:not([data-room])').forEach(el => {
    const dots = el.querySelectorAll('.msg-dot');
    dots.forEach(d => { d.className = 'msg-dot msg-dot-2'; });
  });
});

// РљРѕРіРґР° РњР« РѕС‚РєСЂС‹РІР°РµРј С‡Р°С‚ вЂ” СЃРѕРѕР±С‰Р°РµРј РѕС‚РїСЂР°РІРёС‚РµР»СЋ С‡С‚Рѕ РїСЂРѕС‡РёС‚Р°Р»Рё
function _sendReadReceipt(room) {
  if (!room || !currentUser) return;
  socket.emit('messages-read', { room, by: currentUser });
}

// Р—РІРѕРЅРѕРє РѕС‚ СЃРµСЂРІРµСЂР° (РёР· РёСЃС‚РѕСЂРёРё РёР»Рё СЂРµР°Р»С‚Р°Р№Рј)
socket.on('call-record', msg => {
  if (msg.room !== currentRoom) return;
  // cr_to = РєРѕРјСѓ Р·РІРѕРЅРёР»Рё. Р•СЃР»Рё СЏ вЂ” callee, РїРѕРєР°Р·С‹РІР°РµРј СЃРІРѕСЋ РјРµС‚РєСѓ
  const isCallee = msg.cr_to === currentUser;
  if (isCallee && msg.cr_label_callee) {
    msg = Object.assign({}, msg, {
      cr_label: msg.cr_label_callee,
      cr_extra: msg.cr_extra_callee || msg.cr_extra
    });
  }
  addMessage(msg);
});

let _lastMsgDate = null; // Р”Р»СЏ СЂР°Р·РґРµР»РёС‚РµР»РµР№ РїРѕ РґРЅСЏРј

function addMessage(msg) {
  if (msgsEmpty) msgsEmpty.style.display = 'none';

  // в”Ђв”Ђ Р”РµРЅСЊ-СЂР°Р·РґРµР»РёС‚РµР»СЊ в”Ђв”Ђ
  const msgDate = msg.date || (msg.ts
    ? new Date(msg.ts).toLocaleDateString('ru-RU', { day:'numeric', month:'long', timeZone:'Europe/Moscow' })
    : null);
  if (msgDate && msgDate !== _lastMsgDate) {
    _lastMsgDate = msgDate;
    const sep = document.createElement('div');
    sep.className = 'msg-day-sep';
    const today    = new Date().toLocaleDateString('ru-RU', { day:'numeric', month:'long', timeZone:'Europe/Moscow' });
    const yesterday = new Date(Date.now()-86400000).toLocaleDateString('ru-RU', { day:'numeric', month:'long', timeZone:'Europe/Moscow' });
    sep.textContent = msgDate === today ? 'РЎРµРіРѕРґРЅСЏ' : msgDate === yesterday ? 'Р’С‡РµСЂР°' : msgDate;
    messagesDiv?.appendChild(sep);
  }

  const own = msg.user === currentUser;
  const row = document.createElement('div');
  row.className = `msg-row${own ? ' own' : ''}${_historyLoading ? ' no-anim' : ''}`;
  row.dataset.id = msg.id;
  _replyStore.set(String(msg.id), msg);

  // Avatar вЂ” mark with data-user so avatar-updated can refresh it
  const ava = document.createElement('div');
  ava.className = 'avatar sm msg-ava';
  ava.dataset.user = msg.user;
  setAvatar(ava, msg.user, userAvatars[msg.user]);

  // Fetch avatar+nickname if we don't have it cached
  if (!own && (!userAvatars[msg.user] || !userNicknames[msg.user])) {
    fetchUserAvatar(msg.user);
  }

  // Bubble
  const bub = document.createElement('div');
  bub.className = 'msg-bubble';

  // Р’ Р»РёС‡РЅС‹С… С‡Р°С‚Р°С… РЅРµ РїРѕРєР°Р·С‹РІР°РµРј РЅРёРє Рё Р°РІР°С‚Р°СЂРєСѓ СЃРѕР±РµСЃРµРґРЅРёРєР°
  const isPrivateChat = currentRoom?.startsWith('private:');
  let inner = (!own && !isPrivateChat) ? `<div class="msg-sender">${esc(userNicknames[msg.user] || msg.user)}</div>` : '';

  // в”Ђв”Ђ Р¦РёС‚Р°С‚Р° РѕС‚РІРµС‚Р° в”Ђв”Ђ
  // РњРµС‚РєР° "РџРµСЂРµСЃР»Р°РЅРѕ" РЅР°Рґ СЃРѕРѕР±С‰РµРЅРёРµРј
  if (msg.forwarded || msg.mediaData?.forwarded) {
    const fwdFrom = msg.fwdFrom || msg.mediaData?.fwdFrom || '';
    const fwdNick = fwdFrom ? (userNicknames?.[fwdFrom] || fwdFrom) : '';
    inner += `<div class="fwd-label"><i class="ti ti-share"></i> РџРµСЂРµСЃР»Р°РЅРѕ${fwdNick ? ' РѕС‚ <b>' + esc(fwdNick) + '</b>' : ''}</div>`;
  }

  if (msg.replyTo) {
    const rt = msg.replyTo;
    const rNick = esc(userNicknames?.[rt.user] || rt.user || '?');
    const rText = rt.text
      ? esc(rt.text.slice(0, 80))
      : (rt.type === 'audio' ? 'рџЋ¤ Р“РѕР»РѕСЃРѕРІРѕРµ'
        : rt.type === 'video_circle' ? 'рџ“№ Р’РёРґРµРѕ'
        : 'рџ“Ћ Р’Р»РѕР¶РµРЅРёРµ');
    const rtId = String(rt.id || '').replace(/'/g, '');
    inner += `<div class="reply-quote" onclick="scrollToMsg('${rtId}')">
      <span class="rq-name">${rNick}</span>
      <span class="rq-text">${rText}</span>
    </div>`;
  }

  // в”Ђв”Ђ Р—Р°РїРёСЃСЊ Рѕ Р·РІРѕРЅРєРµ (РёР· РёСЃС‚РѕСЂРёРё) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  if (msg.type === 'call_record') {
    const crLabel = msg.cr_label || 'Р—РІРѕРЅРѕРє';
    const crExtra = msg.cr_extra || '';
    bub.classList.add('call-rec-bub');
    inner = `<div class="call-rec-wrap">
      <div class="cr-info">
        <div class="cr-lbl">${esc(crLabel)}</div>
        <div class="cr-sub">${esc(crExtra)}</div>
      </div>
    </div>`;
    bub.innerHTML = inner;
    // РљРѕРЅС‚РµРєСЃС‚РЅРѕРµ РјРµРЅСЋ РґР»СЏ Р·Р°РїРёСЃРё Р·РІРѕРЅРєР° (СѓРґР°Р»РёС‚СЊ Сѓ СЃРµР±СЏ / РІС‹Р±СЂР°С‚СЊ)
    bub.addEventListener('contextmenu', e => {
        e.preventDefault();
        // РџСЂР°РІР°СЏ РєРЅРѕРїРєР° РЅРµ РґРѕР»Р¶РЅР° РґРѕР±Р°РІР»СЏС‚СЊ РІ РІС‹РґРµР»РµРЅРёРµ
        showCtxMsg(e, msg);
      });
    row.appendChild(bub);
    messagesDiv?.appendChild(row);
    if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return;
  }

  if (msg.type === 'image') {
    const u = fileUrl(msg.url);
    inner += `<div class="msg-img-wrap"><img class="msg-img" src="${u}" loading="lazy" onclick="viewMedia('${u}','image')" alt="С„РѕС‚Рѕ" onerror="this.dataset.retry=(+this.dataset.retry||0)+1;if(this.dataset.retry<4){const t=this;setTimeout(()=>{t.src=t.src.split('?')[0]+'?r='+Date.now()},2000*+this.dataset.retry)}else{this.classList.add('img-broken')}"></div>`;
    if (msg.text) inner += `<div class="msg-text">${renderMsgText(msg.text)}</div>`;
  } else if (msg.type === 'video') {
    const u = fileUrl(msg.url);
    inner += `<video class="msg-video" controls preload="auto" playsinline src="${u}"></video>`;
    if (msg.text) inner += `<div class="msg-text">${renderMsgText(msg.text)}</div>`;
  } else if (msg.type === 'video_circle') {
    const u = fileUrl(msg.url);
    const vid_id = 'vc_' + (msg.id || Math.random().toString(36).slice(2,9));
    inner += `<div class="msg-square-wrap" id="${vid_id}_wrap">
      <video class="msg-square" id="${vid_id}" playsinline webkit-playsinline preload="metadata"
        src="${u}"
        onmousedown="event.preventDefault()"
        onclick="vcTogglePlay('${vid_id}')"
        onloadedmetadata="vcShowDuration('${vid_id}')"></video>
      <div class="vc-overlay" id="${vid_id}_ov" onclick="event.stopPropagation();vcTogglePlay('${vid_id}')">
        <i class="ti ti-player-play vc-play-ico"></i>
      </div>
      <span class="vc-dur" id="${vid_id}_dur"></span>
    </div>`;
  } else if (msg.type === 'audio') {
    const u = fileUrl(msg.url);
    const pid = 'vp_' + (msg.id || Math.random().toString(36).slice(2));
    inner += `<div class="voice-player" id="${pid}">
      <button class="vp-play" onclick="vpToggle('${pid}','${u}')"><i class="ti ti-player-play"></i></button>
      <div class="vp-body">
        <div class="vp-waveform" onclick="vpSeek(event,'${pid}','${u}')">${Array.from({length:30},(_,i)=>`<div class="vp-bar" style="height:${8+Math.round(Math.sin(i*.7+1)*8+Math.random()*8)}px"></div>`).join('')}</div>
        <div class="vp-meta"><span class="vp-pos">0:00</span><span class="vp-dur">вЂ”</span></div>
      </div>
    </div>`;
  } else if (msg.type === 'file') {
    const u = fileUrl(msg.url);
    const fname = esc(msg.fileName || 'Р¤Р°Р№Р»');
    const ext = (msg.fileName||'').split('.').pop().toUpperCase().slice(0,6) || 'FILE';
    const iconHtml = _buildFileIconHtml(msg.fileName || '', '');
    inner += `<a class="msg-file" href="${u}" target="_blank" rel="noopener" download>
      ${iconHtml}
      <div class="msg-file-body">
        <div class="msg-file-name">${fname}</div>
        <div class="msg-file-size">${ext}</div>
      </div>
    </a>`;
  } else {
    inner += `<div class="msg-text">${renderMsgText(msg.text)}</div>`;
  }

  // РўРѕС‡РєРё СЃС‚Р°С‚СѓСЃР° (С‚РѕР»СЊРєРѕ РґР»СЏ СЃРІРѕРёС… СЃРѕРѕР±С‰РµРЅРёР№ РІ Р»РёС‡РЅС‹С… С‡Р°С‚Р°С…)
  const isPriv  = (msg.room||'').startsWith('private:');
  const isGroup = (msg.room||'').startsWith('group:');
  let statusHtml = '';

  if (own && (isPriv || isGroup)) {
    // РўРѕР»СЊРєРѕ СЃРµСЂРІРµСЂ вЂ” РёСЃС‚РѕС‡РЅРёРє РёСЃС‚РёРЅС‹. partnerInChat РќР• РёСЃРїРѕР»СЊР·СѓРµРј РїСЂРё СЂРµРЅРґРµСЂРµ
    let isRead = false;
    if (isPriv) {
      const partner = (msg.room||'').split(':').slice(1).find(p => p !== currentUser);
      isRead = Array.isArray(msg.readBy) && !!partner && msg.readBy.includes(partner);
    } else {
      // Р“СЂСѓРїРїР°: С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РїСЂРѕС‡РёС‚Р°Р»
      isRead = Array.isArray(msg.readBy) && msg.readBy.length > 0;
    }
    statusHtml = `<span class="msg-status" data-msg-id="${msg.id}" data-room="${msg.room||''}">
      <span class="msg-dot ${isRead ? 'msg-dot-2' : 'msg-dot-1'}"></span>
      <span class="msg-dot ${isRead ? 'msg-dot-2' : 'msg-dot-grey'}"></span>
    </span>`;
  }
  const editedHtml = msg.edited ? '<span class="msg-edited">СЂРµРґ.</span>' : '';
  inner += `<div class="msg-meta"><span class="msg-time">${msg.time}</span>${editedHtml}${statusHtml}</div>`;
  bub.innerHTML = inner;

  // Convert any legacy <audio> elements to custom voice player
  bub.querySelectorAll('audio').forEach(a => {
    const pid = 'vpl_' + Math.random().toString(36).slice(2,9);
    const url = a.src || a.getAttribute('src') || '';
    if (!url) return;
    const vp = document.createElement('div');
    vp.className = 'voice-player'; vp.id = pid;
    vp.innerHTML = `<button class="vp-play" onclick="vpToggle('${pid}','${url}')"><i class="ti ti-player-play"></i></button><div class="vp-body"><div class="vp-waveform" onclick="vpSeek(event,'${pid}','${url}')">${Array.from({length:30},(_,i)=>'<div class="vp-bar" style="height:'+(8+Math.round(Math.sin(i*.7+1)*8+Math.random()*8))+'px"></div>').join('')}</div><div class="vp-meta"><span class="vp-pos">0:00</span><span class="vp-dur">вЂ”</span></div></div>`;
    a.replaceWith(vp);
  });

  // в”Ђв”Ђ РџСЂР°РІР°СЏ РєРЅРѕРїРєР° вЂ” РєРѕРЅС‚РµРєСЃС‚РЅРѕРµ РјРµРЅСЋ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  bub.addEventListener('contextmenu', e => {
      e.preventDefault();
      // РџСЂР°РІР°СЏ РєРЅРѕРїРєР° РЅРµ РґРѕР»Р¶РЅР° РґРѕР±Р°РІР»СЏС‚СЊ РІ РІС‹РґРµР»РµРЅРёРµ
      showCtxMsg(e, msg);
    });

  // в”Ђв”Ђ Р—Р°Р¶Р°С‚РёРµ Р»РµРІРѕР№ РєРЅРѕРїРєРё РјС‹С€Рё вЂ” РЅР°С‡Р°Р»Рѕ РІС‹РґРµР»РµРЅРёСЏ (desktop) в”Ђв”Ђв”Ђ
  let _mholdTimer = null;
  bub.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    _mholdTimer = setTimeout(() => {
      _mholdTimer = null;
      // Р—Р°Р¶Р°С‚РёРµ Р»РµРІРѕР№ РєРЅРѕРїРєРё вЂ” РЅР°С‡РёРЅР°РµРј/РґРѕР±Р°РІР»СЏРµРј Рє РІС‹РґРµР»РµРЅРёСЋ (С‚РёС…Рѕ, Р±РµР· РјРµРЅСЋ)
      if (_selectMode) {
        _toggleMsgSelect(String(msg.id), row);
      } else {
        startMsgSelect(String(msg.id));
      }
    }, 500);
  });
  bub.addEventListener('mouseup',   () => { clearTimeout(_mholdTimer); _mholdTimer = null; });
  bub.addEventListener('mouseleave',() => { clearTimeout(_mholdTimer); _mholdTimer = null; });

  // в”Ђв”Ђ РљР»РёРє РІ СЂРµР¶РёРјРµ РІС‹РґРµР»РµРЅРёСЏ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  bub.addEventListener('click', e => {
    if (_selectMode) {
      e.stopPropagation();
      _toggleMsgSelect(String(msg.id), row);
    }
  });

  // в”Ђв”Ђ Touch: long-press (mobile) + swipe-right в†’ РѕС‚РІРµС‚РёС‚СЊ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  let _lpt = null, _tx0 = 0, _ty0 = 0, _didSwipe = false;
  bub.addEventListener('touchstart', e => {
    _tx0 = e.touches[0].clientX; _ty0 = e.touches[0].clientY; _didSwipe = false;
    _lpt = setTimeout(() => {
      if (!_didSwipe) {
        _lpt = null;
        const t = e.touches[0];
        navigator.vibrate?.(30);
        // Р—Р°Р¶Р°С‚РёРµ РЅР° РјРѕР±РёР»Рµ = РїСЂР°РІР°СЏ РєРЅРѕРїРєР°: РѕС‚РєСЂС‹РІР°РµРј РєРѕРЅС‚РµРєСЃС‚РЅРѕРµ РјРµРЅСЋ
        showCtxMsg({ clientX: t.clientX, clientY: t.clientY, preventDefault: ()=>{} }, msg);
      }
    }, 500);
  }, { passive: true });
  bub.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - _tx0;
    const dy = Math.abs(e.touches[0].clientY - _ty0);
    if (dx > 55 && dy < 40 && !_didSwipe && !_selectMode) {
      _didSwipe = true;
      clearTimeout(_lpt); _lpt = null;
      _replyStore.set(String(msg.id), msg);
      startReply(msg);
      bub.style.transition = 'transform .18s cubic-bezier(.16,1,.3,1)';
      bub.style.transform = 'translateX(36px)';
      setTimeout(() => { bub.style.transition = 'transform .2s'; bub.style.transform = ''; }, 200);
    }
    if (dx > 8 || dy > 8) { clearTimeout(_lpt); _lpt = null; }
  }, { passive: true });
  bub.addEventListener('touchend', () => { clearTimeout(_lpt); _lpt = null; }, { passive: true });

  // Р’ Р»РёС‡РЅС‹С… С‡Р°С‚Р°С… РЅРµ РїРѕРєР°Р·С‹РІР°РµРј Р°РІР°С‚Р°СЂРєСѓ СЃРѕР±РµСЃРµРґРЅРёРєР°
  if (!own && !isPrivateChat) row.appendChild(ava);
  row.appendChild(bub);
  messagesDiv.appendChild(row);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  // РЈРІРµРґРѕРјР»РµРЅРёРµ С‚РѕР»СЊРєРѕ РґР»СЏ СЂРµР°Р»СЊРЅРѕ РЅРѕРІС‹С… СЃРѕРѕР±С‰РµРЅРёР№ (РЅРµ РїСЂРё Р·Р°РіСЂСѓР·РєРµ РёСЃС‚РѕСЂРёРё)
  if (!_historyLoading && msg.user !== currentUser && msg.room !== currentRoom) {
    playCallSound('message');
  }
  if (!_historyLoading && msg.user !== currentUser && document.visibilityState !== 'visible') {
    const nick = userNicknames[msg.user] || msg.user;
    const txt  = msg.type === 'text' ? msg.text : (msg.type === 'audio' ? 'Р“РѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ' : 'РњРµРґРёР°С„Р°Р№Р»');
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

// Р РµРЅРґРµСЂ С‚РµРєСЃС‚Р° СЃРѕРѕР±С‰РµРЅРёСЏ: markdown + Р°РІС‚РѕСЃСЃС‹Р»РєРё
function renderMsgText(s) {
  let t = String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
  t = t
    .replace(/\*\*(.+?)\*\*/g,  '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g,         '<s>$1</s>')
    .replace(/(?<![_])__(?!_)(.+?)__(?![_])/g, '<u>$1</u>')
    .replace(/(?<![_*])_(?!_)(.+?)_(?![_*])/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="msg-code">$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
             '<a href="$2" target="_blank" rel="noopener" class="msg-link">$1</a>')
    .replace(/(^|[\s])(https?:\/\/[^\s<"]+)/g,
             '$1<a href="$2" target="_blank" rel="noopener" class="msg-link">$2</a>');
  t = t.replace(/\n/g,'<br>');
  return t;
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// SENDING  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
function enableInput() {
  msgInput.disabled = false;
  attachBtn.disabled = false;
  refreshSendBtn();
}

function refreshSendBtn() {
  const hasText  = msgInput.value.trim().length > 0;
  const hasFiles = selectedFiles.length > 0;
  const canSend  = hasText || hasFiles;
  sendBtn.disabled = false; // always enabled вЂ” mic when empty
  if (canSend) {
    sendIco.className = 'ti ti-send';
    sendBtn.classList.remove('mic-mode');
  } else {
    sendIco.className = 'ti ti-microphone';
    sendBtn.classList.add('mic-mode');
  }
}


// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// MESSAGE SELECTION
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
let _selectedMsgs = new Set();
let _selectMode = false;

function startMsgSelect(id) {
  _selectMode = true;
  _selectedMsgs.clear();
  _selectedMsgs.add(String(id));
  _renderSelectMode();
  // РџРѕРєР°Р·С‹РІР°РµРј РїР°РЅРµР»СЊ РІС‹РґРµР»РµРЅРёСЏ
  _showSelectBar();
}

function _renderSelectMode() {
  // РљР°Р¶РґРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ вЂ” РєР»РёРєР°Р±РµР»СЊРЅРѕ РґР»СЏ РІС‹РґРµР»РµРЅРёСЏ
  document.querySelectorAll('.msg-row').forEach(row => {
    const id = row.dataset.id;
    if (!id) return;
    row.classList.toggle('msg-selected', _selectedMsgs.has(id));
    row.onclick = _selectMode ? (e) => { e.stopPropagation(); _toggleMsgSelect(id, row); } : null;
  });
}

function _toggleMsgSelect(id, row) {
  if (_selectedMsgs.has(id)) {
    _selectedMsgs.delete(id);
    row.classList.remove('msg-selected');
  } else {
    _selectedMsgs.add(id);
    row.classList.add('msg-selected');
  }
  _updateSelectCount();
  if (_selectedMsgs.size === 0) cancelMsgSelect();
}

function _showSelectBar() {
  // РџР°РЅРµР»СЊ РЅРµ РЅСѓР¶РЅР° вЂ” РґРµР№СЃС‚РІРёСЏ С‡РµСЂРµР· РїСЂР°РІСѓСЋ РєРЅРѕРїРєСѓ РјС‹С€Рё / РєРѕРЅС‚РµРєСЃС‚РЅРѕРµ РјРµРЅСЋ
  // РџРѕРєР°Р·С‹РІР°РµРј Р»С‘РіРєРёР№ СЃС‡С‘С‚С‡РёРє РІ Р·Р°РіРѕР»РѕРІРєРµ С‡Р°С‚Р°
  const sub = document.getElementById('roomSub');
  if (sub) sub.dataset.origText = sub.dataset.origText || sub.textContent;
  _updateSelectCount();
}

function _updateSelectCount() {
  const sub = document.getElementById('roomSub');
  if (!sub) return;
  if (_selectMode && _selectedMsgs.size > 0) {
    sub.textContent = `Р’С‹Р±СЂР°РЅРѕ: ${_selectedMsgs.size}`;
    sub.style.color = 'var(--accent)';
  } else if (!_selectMode) {
    sub.textContent = sub.dataset.origText || '';
    sub.style.color = '';
    delete sub.dataset.origText;
  }
}

function cancelMsgSelect() {
  _selectMode = false;
  _selectedMsgs.clear();
  document.querySelectorAll('.msg-row').forEach(row => {
    row.classList.remove('msg-selected');
    row.onclick = null;
  });
  _updateSelectCount();
}

function copySelectedMsgs() {
  const texts = [];
  _selectedMsgs.forEach(id => {
    const row = document.querySelector(`[data-id="${id}"]`);
    const bub = row?.querySelector('.msg-text,.msg-bubble');
    if (bub) texts.push(bub.innerText.trim());
  });
  navigator.clipboard?.writeText(texts.join('\n---\n')).then(() => toast('РЎРєРѕРїРёСЂРѕРІР°РЅРѕ', 'success', 1500));
  cancelMsgSelect();
}

async function deleteSelectedMsgsAll() {
  const ids = [..._selectedMsgs];
  cancelMsgSelect();
  // Delete for all вЂ” only own messages
  for (const id of ids) {
    const row = document.querySelector(`[data-id="${id}"]`);
    const isOwn = row?.classList.contains('own');
    if (isOwn) {
      try {
        await fetch('/api/delete-message', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ messageId: id, username: currentUser, forAll: true })
        });
      } catch {}
    }
  }
}

async function deleteSelectedMsgs() {
  const ids = [..._selectedMsgs];
  cancelMsgSelect();
  // Delete for me (local only)
  const key = 'aura_hidden:' + (currentRoom || 'all');
  try {
    const hidden = JSON.parse(localStorage.getItem(key) || '[]');
    const newHidden = [...new Set([...hidden, ...ids])].slice(-2000);
    localStorage.setItem(key, JSON.stringify(newHidden));
  } catch {}
  ids.forEach(id => {
    const row = document.querySelector(`[data-id="${id}"]`);
    if (row) { row.style.transition = 'opacity .2s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 200); }
  });
  toast(`РЈРґР°Р»РµРЅРѕ ${ids.length} СЃРѕРѕР±С‰РµРЅРёР№`, 'success', 2000);
}

function showForwardPicker() {
  return new Promise(res => {
    let resolved = false;
    let modal = document.getElementById('forwardModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'forwardModal';
      modal.className = 'modal-bg';
      modal.innerHTML = `
        <div class="modal-card forward-card">
          <div class="modal-hd">
            <span style="display:flex;align-items:center;gap:8px"><i class="ti ti-share" style="color:var(--accent)"></i> РџРµСЂРµСЃР»Р°С‚СЊ</span>
            <button class="icon-btn" id="fwCloseBtn"><i class="ti ti-x"></i></button>
          </div>
          <div class="fw-search-wrap">
            <i class="ti ti-search" style="color:var(--text3);font-size:14px"></i>
            <input id="fwSearchInput" class="fw-search" placeholder="РџРѕРёСЃРє" autocomplete="off">
          </div>
          <div class="forward-list" id="fwList"></div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => {
        if (e.target === modal) done(null);
      });
      modal.querySelector('#fwCloseBtn')?.addEventListener('click', () => done(null));
      modal.querySelector('#fwSearchInput')?.addEventListener('input', function() {
        const q = this.value.toLowerCase();
        modal.querySelectorAll('.forward-item').forEach(row => {
          const txt = (row.querySelector('.fi-title')?.textContent || '').toLowerCase();
          row.style.display = txt.includes(q) ? '' : 'none';
        });
      });
    }

    const list = modal.querySelector('.forward-list');
    if (list) list.innerHTML = '';

    const items = [];
    // РўРѕР»СЊРєРѕ СЂРµР°Р»СЊРЅС‹Рµ Р»РёС‡РЅС‹Рµ С‡Р°С‚С‹ Рё РіСЂСѓРїРїС‹ (Р±РµР· "РћР±С‰РµРіРѕ С‡Р°С‚Р°")
    (friends || []).forEach(f => {
      const name = userNicknames?.[f] || f;
      items.push({ title: name, sub: 'Р›РёС‡РЅС‹Р№ С‡Р°С‚', room: getRoomId(f), av: userAvatars?.[f] || null });
    });
    (groups || []).forEach(g => {
      items.push({ title: g.name || `Р“СЂСѓРїРїР° ${g.id}`, sub: 'Р“СЂСѓРїРїР°', room: `group:${g.id}`, av: g.avatar || null });
    });

    if (!items.length && list) {
      list.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px">РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… С‡Р°С‚РѕРІ</div>';
    } else if (list) {
      items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'forward-item';
        const avHtml = it.av
          ? `<div class="fi-av" style="background-image:url(${it.av});background-size:cover;border-radius:50%;width:36px;height:36px;flex-shrink:0"></div>`
          : `<div class="fi-av" style="border-radius:${it.sub==='Р“СЂСѓРїРїР°'?'10px':'50%'};width:36px;height:36px;flex-shrink:0;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700">${esc(it.title[0]||'?')}</div>`;
        row.innerHTML = `${avHtml}<div class="fi-info"><div class="fi-title">${esc(it.title)}</div><div class="fi-sub">${esc(it.sub)}</div></div>`;
        row.addEventListener('click', () => done(it.room));
        list.appendChild(row);
      });
    }

    modal.classList.add('open');

    function done(value) {
      if (resolved) return;
      resolved = true;
      modal.classList.remove('open');
      res(value);
    }
  });
}

async function forwardSelectedMsgs() {
  if (!_selectedMsgs.size) return;
  closeCtx();
  const targetRoom = await showForwardPicker();
  if (!targetRoom) return;

  let sent = 0;
  let skipped = 0;

  for (const id of _selectedMsgs) {
    const msg = _replyStore.get(String(id));
    if (!msg) { skipped++; continue; }

    const type = msg.type || 'text';
    const originalUser = msg.user || '';
    const fwdMeta = { forwarded: true, fwdFrom: originalUser };
    if (type === 'text') {
      const text = String(msg.text || '').trim();
      if (!text) { skipped++; continue; }
      socket.emit('message', { text, room: targetRoom, forwarded: true, fwdFrom: originalUser });
      sent++;
    } else if (['image','video','audio','file','video_circle','voice'].includes(type)) {
      socket.emit('media-message', {
        mediaData: { type, url: msg.url, fileName: msg.fileName, text: msg.text || '', forwarded: true, fwdFrom: originalUser },
        room: targetRoom
      });
      sent++;
    } else {
      skipped++;
    }
  }

  cancelMsgSelect();
  closeCtx();
  if (sent) toast(`РџРµСЂРµСЃР»Р°РЅРѕ: ${sent}`, 'success', 2000);
  if (skipped) toast(`РќРµ РїРµСЂРµСЃР»Р°РЅРѕ: ${skipped}`, 'info', 2000);
}

// в”Ђв”Ђ Р’СЃС‚Р°РІРєР° РёР· Р±СѓС„РµСЂР° РѕР±РјРµРЅР° (Ctrl+V / Command+V) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
document.addEventListener('paste', (e) => {
  if (!currentRoom || !currentUser) return;
  // РќРµ РїРµСЂРµС…РІР°С‚С‹РІР°РµРј РµСЃР»Рё С„РѕРєСѓСЃ РІ С‡СѓР¶РѕРј РїРѕР»Рµ
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT') && activeEl.id !== 'msgInput') return;

  const items = Array.from(e.clipboardData?.items || []);
  const fileItems = items.filter(it => it.kind === 'file');
  if (!fileItems.length) return;

  e.preventDefault();

  // Р”РѕР±Р°РІР»СЏРµРј С„Р°Р№Р»С‹ РІ РѕС‡РµСЂРµРґСЊ РїСЂРёРєСЂРµРїР»РµРЅРёР№ вЂ” РєР°Рє РїСЂРё РЅР°Р¶Р°С‚РёРё РєРЅРѕРїРєРё СЃРєСЂРµРїРєРё
  for (const item of fileItems) {
    const file = item.getAsFile();
    if (!file) continue;
    // РРјРµРЅСѓРµРј С„Р°Р№Р» РµСЃР»Рё РЅРµС‚ РёРјРµРЅРё (СЃРєСЂРёРЅС€РѕС‚ РёР· Р±СѓС„РµСЂР°)
    const named = file.name && file.name !== 'image.png'
      ? file
      : new File([file], file.type.startsWith('image/') ? `screenshot_${Date.now()}.png` : `file_${Date.now()}`, { type: file.type });
    addFile(named);
  }
});
function handleSend() {
  const text = msgInput.value.trim();

  if (_editMsgId) {
    if (!text) { toast('РўРµРєСЃС‚ РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј', 'warning', 1600); return; }
    socket.emit('edit-message', { messageId: _editMsgId, text, room: _editRoom || currentRoom });
    cancelEdit();
    msgInput.value = '';
    autoGrow(msgInput);
    refreshSendBtn();
    return;
  }

  if (text) {
    const replySnap = _replyMsg
      ? { id: _replyMsg.id, user: _replyMsg.user, text: _replyMsg.text?.slice(0,100), type: _replyMsg.type }
      : undefined;
    cancelReply();
    socket.emit('message', { text, room: currentRoom, replyTo: replySnap });
    msgInput.value = '';
    autoGrow(msgInput);
  }
  if (selectedFiles.length) sendFiles();
  refreshSendBtn();
}

// в†ђ РЈР”РћР‘РЎРўР’Рћ: Cmd+Enter sends, Enter adds newline only if Shift
function onMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = msgInput.value.trim();
    const hasFiles = selectedFiles.length > 0;
    if (text || hasFiles) handleSend();
  }
}

// в†ђ РљР РђРЎРћРўРђ: auto-growing textarea
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// FILE HANDLING  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// Attach menu в†ђ РљР РђРЎРћРўРђ
attachMenu.innerHTML = `
  <div class="att-item" onmousedown="event.preventDefault()" onclick="pickFiles('image/*')"><i class="ti ti-photo"></i> Р¤РѕС‚Рѕ</div>
  <div class="att-item" onmousedown="event.preventDefault()" onclick="pickFiles('video/*')"><i class="ti ti-video"></i> Р’РёРґРµРѕ</div>
  <div class="att-item" onmousedown="event.preventDefault()" onclick="pickFiles('audio/*')"><i class="ti ti-music"></i> РђСѓРґРёРѕ</div>
  <div class="att-item" onmousedown="event.preventDefault()" onclick="pickFiles('*/*')"><i class="ti ti-file"></i> Р¤Р°Р№Р»</div>
  <div class="att-item" onmousedown="event.preventDefault()" onclick="startCircleRecord()"><i class="ti ti-square-rounded"></i> РљРІР°РґСЂР°С‚</div>`;

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
  if (file.size > 50 * 1024 * 1024) { toast(`Р¤Р°Р№Р» СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№: ${file.name}`, 'warning'); return; }
  const cat = _detectFileCat(file.name, file.type);
  let type = 'file';
  if (cat === 'image') type = 'image';
  else if (cat === 'video') type = 'video';
  else if (cat === 'audio') type = 'audio';
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
    item.innerHTML = `${thumb}<span class="fp-item-name">${f.name}</span><button class="fp-remove" onclick="removeFile(${i})" title="РЈРґР°Р»РёС‚СЊ"><i class="ti ti-x"></i></button>`;
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
      } else toast(`РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё: ${f.name}`, 'error');
    } catch { toast(`РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё: ${f.name}`, 'error'); }
  }
  selectedFiles = [];
  renderFilePreviews();
  refreshSendBtn();
}

// в†ђ РЈР”РћР‘РЎРўР’Рћ: Drag & Drop
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// RECORDING (Voice + Circle)  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const isMobile = 'ontouchstart' in window;

// в”Ђв”Ђ Visual Viewport API вЂ” РїСЂРµРґРѕС‚РІСЂР°С‰Р°РµРј РїСЂС‹Р¶РѕРє РїСЂРё РїРѕСЏРІР»РµРЅРёРё РєР»Р°РІРёР°С‚СѓСЂС‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
if (window.visualViewport && /Android/i.test(navigator.userAgent)) {
  let _lastVVH = window.visualViewport.height;
  let _kbOpen = false;

  window.visualViewport.addEventListener('resize', () => {
    const newH = window.visualViewport.height;
    const diff = _lastVVH - newH;
    _lastVVH = newH;

    if (diff > 100 && !_kbOpen) {
      // РљР»Р°РІРёР°С‚СѓСЂР° РѕС‚РєСЂС‹Р»Р°СЃСЊ вЂ” С„РёРєСЃРёСЂСѓРµРј РЅРёР¶РЅСЋСЋ С‡Р°СЃС‚СЊ РёРЅС‚РµСЂС„РµР№СЃР°
      _kbOpen = true;
      const chatApp = document.getElementById('chatApp');
      const msgs = document.getElementById('messages');
      if (chatApp) {
        chatApp.style.height = newH + 'px';
        chatApp.style.position = 'fixed';
        chatApp.style.top = window.visualViewport.offsetTop + 'px';
      }
      // РЎРєСЂРѕР»Р»РёРј СЃРѕРѕР±С‰РµРЅРёСЏ РІРЅРёР· РїРѕСЃР»Рµ Р°РЅРёРјР°С†РёРё РєР»Р°РІРёР°С‚СѓСЂС‹
      if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 300);
    } else if (diff < -100 && _kbOpen) {
      // РљР»Р°РІРёР°С‚СѓСЂР° Р·Р°РєСЂС‹Р»Р°СЃСЊ вЂ” РІРѕСЃСЃС‚Р°РЅР°РІР»РёРІР°РµРј
      _kbOpen = false;
      const chatApp = document.getElementById('chatApp');
      if (chatApp) {
        chatApp.style.height = '';
        chatApp.style.position = '';
        chatApp.style.top = '';
      }
    }
  });

  // iOS/Android: РїСЂРё С„РѕРєСѓСЃРµ РЅР° РёРЅРїСѓС‚Рµ СЃРєСЂРѕР»Р»РёРј РІРЅРёР·
  document.addEventListener('focusin', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      const msgs = document.getElementById('messages');
      if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 350);
    }
  });
}


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

// в”Ђв”Ђ Desktop: hold to record, right-click for circle в”Ђв”Ђ
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

// в”Ђв”Ђ Mobile: hold = voice, swipe up = circle в”Ђв”Ђ
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
    recType_el.textContent = 'Р“РѕР»РѕСЃРѕРІРѕРµ';
    recSeconds = 0;
    recTimer_el.textContent = '0:00';
    recTimer = setInterval(() => {
      recSeconds++;
      const m = Math.floor(recSeconds/60), s = recSeconds % 60;
      recTimer_el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
    }, 1000);
  } catch {
    toast('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РјРёРєСЂРѕС„РѕРЅСѓ', 'error');
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
    } else toast('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РіРѕР»РѕСЃРѕРІРѕРіРѕ', 'error');
  } catch { toast('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РіРѕР»РѕСЃРѕРІРѕРіРѕ', 'error'); }
}

// в”Ђв”Ђ Circle  в†ђ РљР РђРЎРћРўРђ
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
    const PERIM = 813.7; // РїРµСЂРёРјРµС‚СЂ РїСЂСЏРјРѕСѓРіРѕР»СЊРЅРёРєР° 212x212 rx=20
    if (circleFg) { circleFg.style.strokeDasharray = PERIM; circleFg.style.strokeDashoffset = '0'; }
    circleTimerID = setInterval(() => {
      circleSecs++;
      const m = Math.floor(circleSecs/60), sec = circleSecs % 60;
      circleTimeEl.textContent = `${m}:${sec.toString().padStart(2,'0')}`;
      if (circleFg) circleFg.style.strokeDashoffset = PERIM * (circleSecs / MAX_CIRCLE);
      if (circleSecs >= MAX_CIRCLE) sendCircleRecord();
    }, 1000);
  } catch { toast('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РєР°РјРµСЂРµ', 'error'); }
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
  toast('РћС‚РїСЂР°РІРєР° РєСЂСѓР¶РєР°вЂ¦', 'info', 2000);
  try {
    const r = await fetch('/upload', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.success) {
      socket.emit('media-message', {
        mediaData: { type: 'video_circle', url: d.url, fileName: d.name, text: '' },
        room: currentRoom
      });
    } else toast('РћС€РёР±РєР° РѕС‚РїСЂР°РІРєРё РєСЂСѓР¶РєР°', 'error');
  } catch { toast('РћС€РёР±РєР° РѕС‚РїСЂР°РІРєРё РєСЂСѓР¶РєР°', 'error'); }
  circleChunks = [];
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// EMOJI  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const EMOJIS = ['рџЂ','рџ‚','рџЌ','рџҐ°','рџЋ','рџ¤”','рџ…','рџҐІ','рџ­','рџ¤','рџ¤Ї','рџҐі','рџґ','рџ™„','рџЏ','рџ«Ў',
  'рџ‘Ќ','рџ‘Ћ','вќ¤пёЏ','рџ”Ґ','рџ’Ї','вњ…','рџЋ‰','рџЋЉ','рџ’Є','рџ™Џ','рџ‘Ђ','рџ’Ђ','рџ¤ќ','вњЊпёЏ','рџ«¶','рџ’«',
  'рџё','рџђ¶','рџЊџ','вљЎ','рџЊ€','рџЋµ','рџЋ®','рџЏ†','рџљЂ','рџ’»','рџ“±','рџЋЇ','рџ’Ў','рџЊ™','вЂпёЏ','рџЊЉ'];

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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// CONTEXT MENUS  в†ђ РЈР”РћР‘РЎРўР’Рћ: Telegram Desktop feel
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const ctxMenu = $('ctxMenu');

let _replyMsg = null;
let _editMsgId = null;
let _editRoom = null;
const _replyStore = new Map(); // id -> msg snapshot РґР»СЏ РѕС‚РІРµС‚Р°

function startReply(msg) {
  _replyMsg = msg;
  let bar = document.getElementById('replyBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'replyBar';
    // Р’СЃС‚Р°РІР»СЏРµРј РїРµСЂРµРґ input-row
    const inputRow = document.querySelector('.input-zone .input-row');
    if (inputRow) inputRow.parentElement.insertBefore(bar, inputRow);
    else document.querySelector('.input-zone')?.prepend(bar);
  }
  const nick = userNicknames?.[msg.user] || msg.user;
  const prev = msg.text
    ? msg.text.slice(0, 60)
    : (msg.type === 'audio' ? 'рџЋ¤ Р“РѕР»РѕСЃРѕРІРѕРµ' : msg.type === 'video_circle' ? 'рџ“№ Р’РёРґРµРѕ' : 'рџ“Ћ Р’Р»РѕР¶РµРЅРёРµ');
  bar.innerHTML = `
    <i class="ti ti-arrow-back-up" style="color:var(--accent);font-size:15px;flex-shrink:0"></i>
    <div style="flex:1;min-width:0;overflow:hidden">
      <div style="color:var(--accent);font-size:11px;font-weight:700;line-height:1.4">${esc(nick)}</div>
      <div style="color:var(--text2);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4">${esc(prev)}</div>
    </div>
    <button onclick="cancelReply()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:20px;padding:0 4px;line-height:1;flex-shrink:0"><i class="ti ti-x"></i></button>`;
  bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 14px;border-left:3px solid var(--accent);background:var(--surface2);';
  bar.style.display = 'flex';
  document.getElementById('msgInput')?.focus();
}

function cancelReply() {
  _replyMsg = null;
  const bar = document.getElementById('replyBar');
  if (bar) { bar.style.display = 'none'; bar.innerHTML = ''; }
}

function cancelEdit() {
  _editMsgId = null;
  _editRoom = null;
  const bar = document.getElementById('editBar');
  if (bar) { bar.style.display = 'none'; bar.innerHTML = ''; }
}

function startMsgEdit(id) {
  const msgId = String(id);
  const cached = _replyStore.get(msgId) || {};
  const row = document.querySelector(`[data-id="${msgId}"]`);
  const text = (cached.text ?? row?.querySelector('.msg-text')?.textContent ?? '').toString();
  if (!text.trim()) { toast('РќРµС‡РµРіРѕ СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ', 'info', 1500); return; }
  if (cached.user && cached.user !== currentUser) return;

  _editMsgId = msgId;
  _editRoom = cached.room || currentRoom;

  cancelReply();
  if (typeof cancelMsgSelect === 'function') cancelMsgSelect();
  if (selectedFiles.length) { selectedFiles = []; renderFilePreviews(); }

  let bar = document.getElementById('editBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'editBar';
    const inputRow = document.querySelector('.input-zone .input-row');
    if (inputRow) inputRow.parentElement.insertBefore(bar, inputRow);
    else document.querySelector('.input-zone')?.prepend(bar);
  }
  const prev = text.slice(0, 60);
  bar.innerHTML = `
    <i class="ti ti-edit" style="color:var(--accent);font-size:15px;flex-shrink:0"></i>
    <div style="flex:1;min-width:0;overflow:hidden">
      <div style="color:var(--accent);font-size:11px;font-weight:700;line-height:1.4">Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ</div>
      <div style="color:var(--text2);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4">${esc(prev)}</div>
    </div>
    <button onclick="cancelEdit()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:20px;padding:0 4px;line-height:1;flex-shrink:0"><i class="ti ti-x"></i></button>`;
  bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 14px;border-left:3px solid var(--accent);background:var(--surface2);';
  bar.style.display = 'flex';

  msgInput.value = text;
  autoGrow(msgInput);
  msgInput.focus();
  refreshSendBtn();
}


function scrollToMsg(id) {
  const el = document.querySelector('[data-id="' + id + '"]');
  if (!el) { toast('РЎРѕРѕР±С‰РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ', 'info', 1500); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const bub = el.querySelector('.msg-bubble');
  if (bub) {
    bub.style.transition = 'outline .1s';
    bub.style.outline = '2px solid var(--accent)';
    setTimeout(() => { bub.style.outline = ''; }, 1200);
  }
}

// Р‘РµР·РѕРїР°СЃРЅРѕРµ С…СЂР°РЅРµРЅРёРµ msg РґР»СЏ РѕС‚РІРµС‚Р° (Р±РµР· JSON РІ Р°С‚СЂРёР±СѓС‚Р°С…)
function _replyFromId(id) {
  const msg = _replyStore.get(String(id));
  if (msg) startReply(msg);
}

function showCtxMsg(e, msg) {
  // РЎРѕС…СЂР°РЅСЏРµРј РІ Map РґР»СЏ _replyFromId
  _replyStore.set(String(msg.id), msg);
  e.preventDefault();
  const own = msg.user === currentUser;
  const canEdit = own && (msg.type || 'text') === 'text';
  const msgId = String(msg.id).replace(/'/g,'');
  // Р’ СЂРµР¶РёРјРµ РІС‹РґРµР»РµРЅРёСЏ вЂ” РїРѕРєР°Р·С‹РІР°РµРј РґРµР№СЃС‚РІРёСЏ РґР»СЏ РІСЃРµС… РІС‹РґРµР»РµРЅРЅС‹С…
  if (_selectMode && _selectedMsgs.size > 0) {
    ctxMenu.innerHTML = `
      <div class="ctx-item" style="font-size:11px;color:var(--text3);pointer-events:none;padding:4px 14px">
        ${_selectedMsgs.size} РІС‹Р±СЂР°РЅРѕ
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" onclick="copySelectedMsgs();closeCtx()"><i class="ti ti-copy"></i> РљРѕРїРёСЂРѕРІР°С‚СЊ</div>
      <div class="ctx-item" onclick="forwardSelectedMsgs()"><i class="ti ti-share"></i> РџРµСЂРµСЃР»Р°С‚СЊ</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" onclick="deleteSelectedMsgsAll();closeCtx()"><i class="ti ti-trash"></i> РЈРґР°Р»РёС‚СЊ Сѓ РІСЃРµС…</div>
      <div class="ctx-item danger" onclick="deleteSelectedMsgs();closeCtx()"><i class="ti ti-trash" style="opacity:.6"></i> РЈРґР°Р»РёС‚СЊ Сѓ СЃРµР±СЏ</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" onclick="cancelMsgSelect();closeCtx()"><i class="ti ti-x"></i> РћС‚РјРµРЅРёС‚СЊ РІС‹Р±РѕСЂ</div>
    `;
    showCtx(e);
    return;
  }
  ctxMenu.innerHTML = `
    <div class="ctx-item" onclick="_replyFromId('${msgId}');closeCtx()"><i class="ti ti-arrow-back-up"></i> РћС‚РІРµС‚РёС‚СЊ</div>
    <div class="ctx-item" onclick="copyMsgText('${msg.id}');closeCtx()"><i class="ti ti-copy"></i> РљРѕРїРёСЂРѕРІР°С‚СЊ С‚РµРєСЃС‚</div>
    ${canEdit ? `<div class="ctx-item" onclick="startMsgEdit('${msgId}');closeCtx()"><i class="ti ti-edit"></i> Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ</div>` : ''}
    <div class="ctx-item" onclick="startMsgSelect('${msgId}');closeCtx()"><i class="ti ti-checkbox"></i> Р’С‹Р±СЂР°С‚СЊ</div>
    <div class="ctx-sep"></div>
    ${own ? `
      <div class="ctx-item danger" onclick="deleteMsgForAll('${msgId}');closeCtx()"><i class="ti ti-trash"></i> РЈРґР°Р»РёС‚СЊ Сѓ РІСЃРµС…</div>
      <div class="ctx-item danger" onclick="deleteMsgForMe('${msgId}');closeCtx()"><i class="ti ti-trash" style="opacity:.6"></i> РЈРґР°Р»РёС‚СЊ Сѓ СЃРµР±СЏ</div>
    ` : `
      <div class="ctx-item danger" onclick="deleteMsgForMe('${msgId}');closeCtx()"><i class="ti ti-trash"></i> РЈРґР°Р»РёС‚СЊ Сѓ СЃРµР±СЏ</div>
    `}`;
  showCtx(e);
}

async function deleteMsgForAll(id) {
  closeCtx();
  const ok = await dialog({
    icon: 'ti-trash', iconType: 'error',
    title: 'РЈРґР°Р»РёС‚СЊ Сѓ РІСЃРµС…?',
    msg: 'РЎРѕРѕР±С‰РµРЅРёРµ РёСЃС‡РµР·РЅРµС‚ Сѓ РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ С‡Р°С‚Р°.',
    ok: 'РЈРґР°Р»РёС‚СЊ', cancel: 'РћС‚РјРµРЅР°', danger: true
  });
  if (!ok) return;
  try {
    const r = await fetch('/api/delete-message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: id, username: currentUser, forAll: true })
    });
    const d = await r.json();
    if (!d.success) toast(d.error || 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ', 'error');
  } catch { toast('РћС€РёР±РєР° СЃРѕРµРґРёРЅРµРЅРёСЏ', 'error'); }
}

async function deleteMsgForMe(id) {
  closeCtx();
  // РџСЂРѕСЃС‚Рѕ СЃРєСЂС‹РІР°РµРј РёР· DOM Р»РѕРєР°Р»СЊРЅРѕ вЂ” РЅРµ РѕС‚РїСЂР°РІР»СЏРµРј РЅР° СЃРµСЂРІРµСЂ
  const row = document.querySelector(`[data-id="${id}"]`);
  if (row) {
    row.style.transition = 'opacity .2s, transform .2s';
    row.style.opacity = '0';
    row.style.transform = 'scale(.95)';
    setTimeout(() => row.remove(), 200);
  }
  // РЎРѕС…СЂР°РЅСЏРµРј id РІ localStorage С‡С‚РѕР±С‹ РЅРµ РїРѕРєР°Р·С‹РІР°С‚СЊ РїРѕСЃР»Рµ РїРµСЂРµР·Р°РіСЂСѓР·РєРё
  try {
    const key = 'aura_hidden:' + (currentRoom || 'all');
    const hidden = JSON.parse(localStorage.getItem(key) || '[]');
    hidden.push(String(id));
    localStorage.setItem(key, JSON.stringify(hidden.slice(-500)));
  } catch {}
}

// РџСЂРё Р·Р°РіСЂСѓР·РєРµ РёСЃС‚РѕСЂРёРё вЂ” СЃРєСЂС‹РІР°РµРј СѓРґР°Р»С‘РЅРЅС‹Рµ Сѓ СЃРµР±СЏ
function _applyHiddenMessages() {
  try {
    const key = 'aura_hidden:' + (currentRoom || 'all');
    const hidden = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    if (!hidden.size) return;
    document.querySelectorAll('[data-id]').forEach(row => {
      if (hidden.has(row.dataset.id)) row.remove();
    });
    // РЈРґР°Р»СЏРµРј РѕСЃРёСЂРѕС‚РµРІС€РёРµ СЂР°Р·РґРµР»РёС‚РµР»Рё РґРЅРµР№
    _cleanOrphanSeparators();
  } catch {}
}

function _cleanOrphanSeparators() {
  const msgs = document.getElementById('messages');
  if (!msgs) return;
  // Р Р°Р·РґРµР»РёС‚РµР»СЊ вЂ” СЃРёСЂРѕС‚Р° РµСЃР»Рё РїРѕСЃР»Рµ РЅРµРіРѕ РЅРµС‚ СЃРѕРѕР±С‰РµРЅРёР№ РґРѕ СЃР»РµРґСѓСЋС‰РµРіРѕ СЂР°Р·РґРµР»РёС‚РµР»СЏ
  const children = Array.from(msgs.children);
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (!el.classList.contains('msg-day-sep')) continue;
    // РС‰РµРј СЃР»РµРґСѓСЋС‰РёР№ СЌР»РµРјРµРЅС‚ РєРѕС‚РѕСЂС‹Р№ СЏРІР»СЏРµС‚СЃСЏ СЃРѕРѕР±С‰РµРЅРёРµРј (РЅРµ СЂР°Р·РґРµР»РёС‚РµР»РµРј)
    let hasMsg = false;
    for (let j = i + 1; j < children.length; j++) {
      if (children[j].classList.contains('msg-day-sep')) break; // СЃР»РµРґСѓСЋС‰РёР№ СЂР°Р·РґРµР»РёС‚РµР»СЊ
      if (children[j].dataset.id || children[j].classList.contains('call-record')) {
        hasMsg = true; break;
      }
    }
    if (!hasMsg) el.remove();
  }
}

// РЎС‚Р°СЂР°СЏ С„СѓРЅРєС†РёСЏ РґР»СЏ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё
async function deleteMsg(id) { return deleteMsgForAll(id); }

// Real-time deletion from server
socket.on('group-history-cleared', ({ groupId }) => {
  const room = `group:${groupId}`;
  if (currentRoom === room) {
    const msgs = document.getElementById('messages');
    if (msgs) { msgs.innerHTML = ''; _lastMsgDate = null; }
    if (msgsEmpty) msgsEmpty.style.display = 'flex';
    toast('РСЃС‚РѕСЂРёСЏ РіСЂСѓРїРїС‹ РѕС‡РёС‰РµРЅР°', 'info', 2500);
  }
});

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

function applyMessageEdit(messageId, text) {
  const row = document.querySelector(`[data-id="${messageId}"]`);
  if (!row) return;
  const textEl = row.querySelector('.msg-text');
  if (textEl) textEl.textContent = text;

  const meta = row.querySelector('.msg-meta');
  if (meta) {
    let ed = meta.querySelector('.msg-edited');
    if (!ed) {
      ed = document.createElement('span');
      ed.className = 'msg-edited';
      ed.textContent = 'СЂРµРґ.';
      const status = meta.querySelector('.msg-status');
      if (status) meta.insertBefore(ed, status);
      else meta.appendChild(ed);
    }
  }

  const cached = _replyStore.get(String(messageId));
  if (cached) {
    cached.text = text;
    cached.edited = true;
    _replyStore.set(String(messageId), cached);
  }
}

socket.on('message-edited', ({ messageId, text }) => {
  applyMessageEdit(messageId, text);
});


function showCtxFriend(e, friend) {
  e.preventDefault();
  ctxMenu.innerHTML = `
    <div class="ctx-item" onclick="gotoPrivate('${friend}');closeCtx()"><i class="ti ti-message-circle"></i> РќР°РїРёСЃР°С‚СЊ</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" onclick="removeFriend('${friend}')"><i class="ti ti-user-minus"></i> РЈРґР°Р»РёС‚СЊ РёР· РґСЂСѓР·РµР№</div>`;
  showCtx(e);
}

function showCtx(e) {
  // РЎРЅР°С‡Р°Р»Р° СЂР°Р·РјРµС‰Р°РµРј РІ С‚РѕС‡РєРµ РєР»РёРєР° (Р·Р° СЌРєСЂР°РЅРѕРј РЅРµ РІРёРґРЅРѕ)
  ctxMenu.style.left = '-9999px';
  ctxMenu.style.top  = '-9999px';
  ctxMenu.classList.add('open');

  requestAnimationFrame(() => {
    const W  = window.innerWidth;
    const H  = window.innerHeight;
    const mw = ctxMenu.offsetWidth  || 200;
    const mh = ctxMenu.offsetHeight || 100;

    // РњРѕР±РёР»СЊРЅС‹Р№: РІСЃРµРіРґР° Сѓ РЅРёР¶РЅРµРіРѕ РєСЂР°СЏ вЂ” СѓРґРѕР±РЅРµРµ РґР»СЏ РїР°Р»СЊС†РµРІ
    if (isMobile || W < 600) {
      ctxMenu.style.left   = '50%';
      ctxMenu.style.top    = 'auto';
      ctxMenu.style.bottom = '8px';
      ctxMenu.style.transform = 'translateX(-50%)';
      ctxMenu.style.width  = Math.min(W - 16, 320) + 'px';
      ctxMenu.style.borderRadius = '16px';
    } else {
      ctxMenu.style.transform = '';
      ctxMenu.style.width  = '';
      ctxMenu.style.bottom = '';
      let x = e.clientX ?? 0;
      let y = e.clientY ?? 0;
      if (x + mw + 8 > W) x = Math.max(8, x - mw);
      if (y + mh + 8 > H) y = Math.max(8, y - mh);
      x = Math.max(8, Math.min(x, W - mw - 8));
      y = Math.max(8, Math.min(y, H - mh - 8));
      ctxMenu.style.left = x + 'px';
      ctxMenu.style.top  = y + 'px';
    }
  });
}

function closeCtx() { ctxMenu.classList.remove('open'); }
document.addEventListener('click', closeCtx);
document.addEventListener('touchstart', e => {
  if (ctxMenu && ctxMenu.classList.contains('open') && !ctxMenu.contains(e.target)) {
    closeCtx();
  }
}, { passive: true });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCtx(); $('emojiPicker').classList.remove('open'); closeAiChat(); } });

function copyMsgText(id) {
  const row = document.querySelector(`[data-id="${id}"]`);
  const text = row?.querySelector('.msg-text')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => toast('РЎРєРѕРїРёСЂРѕРІР°РЅРѕ', 'success', 1500));
  closeCtx();
}

async function removeFriend(friend) {
  closeCtx();
  const ok = await dialog({ icon:'ti-user-minus', iconType:'warning', title:'РЈРґР°Р»РёС‚СЊ РґСЂСѓРіР°?', msg:`РЈРґР°Р»РёС‚СЊ ${friend} РёР· РґСЂСѓР·РµР№?`, ok:'РЈРґР°Р»РёС‚СЊ', cancel:'РћС‚РјРµРЅР°', danger:true });
  if (!ok) return;
  // No API endpoint for this in original вЂ” just remove locally
  friends = friends.filter(f => f !== friend);
  renderFriends();
  toast(`${friend} СѓРґР°Р»С‘РЅ РёР· РґСЂСѓР·РµР№`, 'info');
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// MEDIA VIEWER  в†ђ РЈР”РћР‘РЎРўР’Рћ + РљР РђРЎРћРўРђ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
function viewMedia(url, type) {
  const viewer = document.createElement('div');
  viewer.className = 'media-viewer open';
  viewer.innerHTML = `
    <button class="mv-close" onclick="this.closest('.media-viewer').remove()"><i class="ti ti-x"></i></button>
    ${type === 'image'
      ? `<img src="${url}" style="max-width:92vw;max-height:92vh;border-radius:12px;object-fit:contain;">`
      : `<video src="${url}" controls autoplay playsinline webkit-playsinline style="max-width:92vw;max-height:92vh;border-radius:12px;"></video>`}`;
  viewer.onclick = e => { if (e.target === viewer) viewer.remove(); };
  document.body.appendChild(viewer);
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// FRIENDS / REQUESTS  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
async function openAddFriend() {
  const ov = $('dialogOverlay');
  const box = $('dialogBox');
  if (!ov || !box) return;

  let searchTimeout = null;
  let searchResults = [];

  box.innerHTML = `
    <div class="dlg-ico info"><i class="ti ti-user-plus"></i></div>
    <h3>Р”РѕР±Р°РІРёС‚СЊ РґСЂСѓРіР°</h3>
    <div class="field-wrap" style="margin-bottom:12px">
      <i class="ti ti-search field-ico"></i>
      <input id="addFriendSearch" class="field" type="text" placeholder="РџРѕРёСЃРє РїРѕ РёРјРµРЅРё РёР»Рё nikвЂ¦" autocomplete="off" style="padding-left:38px"/>
    </div>
    <div id="addFriendResults" style="max-height:220px;overflow-y:auto;margin-bottom:12px"></div>
    <div class="dlg-btns">
      <button class="btn-secondary" id="addFriendCancel">РћС‚РјРµРЅР°</button>
    </div>`;

  ov.classList.add('open');

  const searchInput = document.getElementById('addFriendSearch');
  const resultsEl = document.getElementById('addFriendResults');

  const doSearch = async (q) => {
    if (!q || q.length < 1) {
      resultsEl.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:12px">Р’РІРµРґРёС‚Рµ РёРјСЏ РґР»СЏ РїРѕРёСЃРєР°</div>';
      return;
    }
    resultsEl.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:12px"><i class="ti ti-loader" style="animation:spin 1s linear infinite"></i></div>';
    try {
      const r = await fetch('/api/search-users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, requester: currentUser })
      });
      const d = await r.json();
      searchResults = d.users || [];
      if (!searchResults.length) {
        resultsEl.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:12px">РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ</div>';
        return;
      }
      resultsEl.innerHTML = searchResults.map(u => {
        const initials = (u.nickname || u.username).charAt(0).toUpperCase();
        const friendBadge = u.isFriend
          ? `<span style="font-size:10px;color:var(--success);background:rgba(34,197,94,.12);border-radius:6px;padding:2px 7px;border:1px solid rgba(34,197,94,.25)"><i class="ti ti-check"></i> Р”СЂСѓРі</span>`
          : `<button class="btn-secondary" style="padding:5px 10px;font-size:11px;flex-shrink:0" onclick="sendFriendReqTo('${u.username}')"><i class="ti ti-user-plus"></i> Р”РѕР±Р°РІРёС‚СЊ</button>`;
        return `
          <div class="af-result-item" style="cursor:${u.isFriend?'default':'pointer'}" ${!u.isFriend ? `onclick="sendFriendReqTo('${u.username}')"` : ''}>
            <div class="avatar sm" style="flex-shrink:0">${initials}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(u.nickname || u.username)}</div>
              <div style="font-size:11px;color:var(--text2)">@${u.username}</div>
            </div>
            ${friendBadge}
          </div>`;
      }).join('');
    } catch {
      resultsEl.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:12px">РћС€РёР±РєР° РїРѕРёСЃРєР°</div>';
    }
  };

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => doSearch(searchInput.value.trim()), 300);
  });

  searchInput.focus();

  document.getElementById('addFriendCancel').onclick = () => ov.classList.remove('open');
  ov.onclick = (e) => { if (e.target === ov) ov.classList.remove('open'); };
}

window.sendFriendReqTo = async function(username) {
  const ov = $('dialogOverlay');
  ov.classList.remove('open');
  try {
    const r = await fetch('/api/send-friend-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: currentUser, to: username })
    });
    const d = await r.json();
    if (d.success) toast(`Р—Р°СЏРІРєР° РѕС‚РїСЂР°РІР»РµРЅР° ${username}!`, 'success');
    else toast(d.message || d.error || 'РћС€РёР±РєР°', 'error');
  } catch { toast('РћС€РёР±РєР°', 'error'); }
};

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
    toast(`${req} С‚РµРїРµСЂСЊ РІР°С€ РґСЂСѓРі!`, 'success');
  } else toast('РћС€РёР±РєР°', 'error');
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

// New group created вЂ” update groups list
socket.on('group-created', () => {
  loadUserData();
});

// РћР±РЅРѕРІР»РµРЅРёРµ РіСЂСѓРїРїС‹ (РЅР°Р·РІР°РЅРёРµ/Р°РІР°С‚Р°СЂРєР°)
socket.on('group-updated', ({ groupId, name, avatar }) => {
  const g = groups.find(g => g.id === groupId);
  if (g) {
    if (name   !== undefined) g.name   = name;
    if (avatar !== undefined) g.avatar = avatar;
  }
  if (currentRoom === `group:${groupId}`) {
    if (roomName && name)     roomName.textContent = name;
    if (roomAvatar && avatar) setAvatar(roomAvatar, `group:${groupId}`, avatar);
    else if (roomAvatar && name) roomAvatar.innerHTML = name.charAt(0).toUpperCase();
  }
  if (groupsList) groupsList._lastKey = '';
  renderGroups();
});

socket.on('group-deleted', ({ groupId }) => {
  // РЈРґР°Р»СЏРµРј РёР· Р»РѕРєР°Р»СЊРЅРѕРіРѕ РјР°СЃСЃРёРІР°
  groups = groups.filter(g => g.id !== groupId);
  // Р•СЃР»Рё Р±С‹Р»Р° РѕС‚РєСЂС‹С‚Р° вЂ” РїРµСЂРµС…РѕРґРёРј Рє РїРµСЂРІРѕРјСѓ РґСЂСѓРіСѓ РёР»Рё РїСѓСЃС‚РѕРјСѓ СЌРєСЂР°РЅСѓ
  if (currentRoom === `group:${groupId}`) {
    currentRoom = null;
    try { localStorage.removeItem('aura_last_room'); } catch(e) {}
    if (friends.length > 0) {
      gotoRoom(getRoomId(friends[0]));
    } else {
      if (roomName)    roomName.textContent = 'Р’С‹Р±РµСЂРёС‚Рµ С‡Р°С‚';
      if (roomSub)     roomSub.textContent  = '';
      if (hdrRight)    hdrRight.innerHTML   = '';
      if (messagesDiv) messagesDiv.innerHTML = '';
      if (msgsEmpty)   { msgsEmpty.style.display = 'flex'; }
      if (onlinePill)  onlinePill.style.display = 'none';
    }
  }
  if (groupsList) groupsList._lastKey = '';
  renderGroups();
  toast('Р“СЂСѓРїРїР° СѓРґР°Р»РµРЅР°', 'info');
});

socket.on('avatar-updated', ({ username, avatar }) => {
  _setAvatar(username, avatar, undefined); // СЃРѕС…СЂР°РЅСЏРµРј РІ РєСЌС€
  const applyAll = (sel) => document.querySelectorAll(sel).forEach(el => setAvatar(el, username, avatar));
  applyAll(`.msg-ava[data-user="${username}"]`);
  applyAll(`.ci-ava[data-user="${username}"]`);
  // РћР±РЅРѕРІР»СЏРµРј Р°РІР°С‚Р°СЂРєСѓ РІ С€Р°РїРєРµ С‡Р°С‚Р° РўРћР›Р¬РљРћ РµСЃР»Рё СЌС‚Рѕ СЃРѕР±РµСЃРµРґРЅРёРє (РЅРµ РјС‹ СЃР°РјРё)
  if (currentRoom && currentRoom.startsWith('private:')) {
    const other = currentRoom.split(':').slice(1).find(p => p !== currentUser);
    if (other && other === username) setAvatar(roomAvatar, username, avatar);
  }
  const settingsAva = document.getElementById('settingsAvatar');
  if (settingsAva && username === currentUser) setAvatar(settingsAva, username, avatar);
});

// Fetch avatar + nickname вЂ” РµСЃР»Рё СѓР¶Рµ РµСЃС‚СЊ РІ РєСЌС€Рµ (localStorage), РЅРµ РґРµР»Р°РµРј Р·Р°РїСЂРѕСЃ
const _fetchingUsers = new Set(); // РґРµРґСѓРїР»РёРєР°С†РёСЏ РѕРґРЅРѕРІСЂРµРјРµРЅРЅС‹С… Р·Р°РїСЂРѕСЃРѕРІ
async function fetchUserAvatar(username) {
  // РЈР¶Рµ РІ РїСЂРѕС†РµСЃСЃРµ Р·Р°РіСЂСѓР·РєРё РёР»Рё РѕР±Р° РµСЃС‚СЊ РІ РєСЌС€Рµ в†’ РЅРёС‡РµРіРѕ РЅРµ РґРµР»Р°РµРј
  if (_fetchingUsers.has(username)) return;
  if (userAvatars[username] !== undefined && userNicknames[username] !== undefined) return;
  _fetchingUsers.add(username);
  try {
    const r = await fetch('/api/get-avatar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    if (!r.ok) return;
    const d = await r.json();

    const newAvatar   = d.avatar   ?? null;
    const newNickname = d.nickname ?? username;

    // РЎСЂР°РІРЅРёРІР°РµРј СЃ РєСЌС€РµРј вЂ” РѕР±РЅРѕРІР»СЏРµРј С‚РѕР»СЊРєРѕ РµСЃР»Рё РёР·РјРµРЅРёР»РѕСЃСЊ
    const avatarChanged   = userAvatars[username]   !== newAvatar;
    const nicknameChanged = userNicknames[username] !== newNickname;

    if (avatarChanged) {
      _setAvatar(username, newAvatar, undefined);
      document.querySelectorAll(`.msg-ava[data-user="${username}"]`).forEach(el => setAvatar(el, username, newAvatar));
      document.querySelectorAll(`.ci-ava[data-user="${username}"]`).forEach(el => setAvatar(el, username, newAvatar));
      const other = currentRoom?.startsWith('private:')
        ? currentRoom.split(':').slice(1).find(p => p !== currentUser) : null;
      if (other === username) setAvatar(roomAvatar, username, newAvatar);
    }
    if (nicknameChanged) {
      _setAvatar(username, undefined, newNickname);
      document.querySelectorAll(`.msg-sender`).forEach(el => {
        const row = el.closest('.msg-row');
        if (row && row.querySelector(`.msg-ava[data-user="${username}"]`)) el.textContent = newNickname;
      });
      if (friendsList) friendsList._lastKey = '';
    }
  } catch {}
}

function showFriendRequestPopup(from) {
  document.querySelectorAll('.frq-popup').forEach(p => p.remove());
  const pop = document.createElement('div');
  pop.className = 'frq-popup';
  pop.innerHTML = `
    <div class="frq-ava">${from.charAt(0).toUpperCase()}</div>
    <div class="frq-txt"><div class="frq-name">${from}</div><div class="frq-sub">С…РѕС‡РµС‚ РґРѕР±Р°РІРёС‚СЊ РІР°СЃ</div></div>
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// GROUPS  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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
  if (!name) { toast('Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ', 'warning'); return; }
  const members = [...document.querySelectorAll('#grpMembers input:checked')].map(i => i.value);
  const r = await fetch('/api/create-group', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator: currentUser, name, members })
  });
  const d = await r.json();
  if (d.success) {
    toast(`Р“СЂСѓРїРїР° В«${name}В» СЃРѕР·РґР°РЅР°!`, 'success');
    closeGroupModal();
    loadUserData();
  } else toast('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РіСЂСѓРїРїС‹', 'error');
}

// в”Ђв”Ђ Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РіСЂСѓРїРїС‹ (РЅР°Р·РІР°РЅРёРµ + Р°РІР°С‚Р°СЂРєР°) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function openGroupEdit(groupId) {
  const g = groups.find(g => g.id === groupId);
  if (!g || g.creator !== currentUser) { toast('РўРѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ РјРѕР¶РµС‚ СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РіСЂСѓРїРїСѓ', 'warning'); return; }

  const ov  = $('dialogOverlay');
  const box = $('dialogBox');
  if (!ov || !box) return;

  box.innerHTML = `
    <div class="dlg-ico info"><i class="ti ti-users"></i></div>
    <h3>Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РіСЂСѓРїРїСѓ</h3>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:16px">
      <div class="ava-rel" style="cursor:pointer" onclick="document.getElementById('grpAvaInput').click()">
        <div class="avatar lg" id="grpEditAva" style="border-radius:16px"></div>
        <div class="ava-cam"><i class="ti ti-camera"></i></div>
      </div>
      <input type="file" id="grpAvaInput" accept="image/*" style="display:none"/>
      <span class="sub-text">РќР°Р¶РјРёС‚Рµ РґР»СЏ СЃРјРµРЅС‹ С„РѕС‚Рѕ</span>
    </div>
    <div class="field-wrap" style="margin-bottom:14px">
      <i class="ti ti-users field-ico"></i>
      <input id="grpEditName" class="field" type="text" value="${esc(g.name)}" placeholder="РќР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹вЂ¦" maxlength="40"/>
    </div>
    <div id="grpEditErr" class="login-err"></div>
    <div class="dlg-btns" style="flex-direction:column;gap:8px">
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn-secondary" id="grpEditCancel" style="flex:1">РћС‚РјРµРЅР°</button>
        <button class="btn-primary" id="grpEditSave" style="flex:2"><i class="ti ti-check"></i> РЎРѕС…СЂР°РЅРёС‚СЊ</button>
      </div>
      <button class="btn-danger w-full" id="grpEditDelete"><i class="ti ti-trash"></i> РЈРґР°Р»РёС‚СЊ РіСЂСѓРїРїСѓ</button>
    </div>`;

  // РџРѕРєР°Р·С‹РІР°РµРј С‚РµРєСѓС‰СѓСЋ Р°РІР°С‚Р°СЂРєСѓ
  const avaEl = box.querySelector('#grpEditAva');
  setAvatar(avaEl, `group:${groupId}`, g.avatar);

  ov.classList.add('open');

  // Р’С‹Р±РѕСЂ РЅРѕРІРѕР№ Р°РІР°С‚Р°СЂРєРё
  let newAvatarUrl = undefined;
  const avaInput = box.querySelector('#grpAvaInput');
  avaInput.addEventListener('change', async () => {
    const file = avaInput.files[0];
    if (!file) return;
    const saveBtn = box.querySelector('#grpEditSave');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.url) {
        newAvatarUrl = d.url;
        setAvatar(avaEl, `group:${groupId}`, newAvatarUrl);
        toast('Р¤РѕС‚Рѕ Р·Р°РіСЂСѓР¶РµРЅРѕ', 'success');
      }
    } catch { toast('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё С„РѕС‚Рѕ', 'error'); }
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="ti ti-check"></i> РЎРѕС…СЂР°РЅРёС‚СЊ';
  });

  box.querySelector('#grpEditCancel').onclick = () => ov.classList.remove('open');
  ov.onclick = e => { if (e.target === ov) ov.classList.remove('open'); };

  box.querySelector('#grpEditDelete').onclick = async () => {
    const ok = await dialog({
      icon: 'ti-trash', iconType: 'error',
      title: 'РЈРґР°Р»РёС‚СЊ РіСЂСѓРїРїСѓ?',
      msg: `Р“СЂСѓРїРїР° В«${g.name}В» Рё РІСЃСЏ РёСЃС‚РѕСЂРёСЏ С‡Р°С‚Р° Р±СѓРґРµС‚ СѓРґР°Р»РµРЅР° РґР»СЏ РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ.`,
      ok: 'РЈРґР°Р»РёС‚СЊ', cancel: 'РћС‚РјРµРЅР°', danger: true
    });
    if (!ok) return;
    try {
      const r = await fetch('/api/delete-group', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, groupId })
      });
      const d = await r.json();
      if (d.success) {
        ov.classList.remove('open');
        toast(`Р“СЂСѓРїРїР° В«${g.name}В» СѓРґР°Р»РµРЅР°`, 'success');
      } else toast(d.error || 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ', 'error');
    } catch { toast('РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ', 'error'); }
  };

  box.querySelector('#grpEditSave').onclick = async () => {
    const newName = box.querySelector('#grpEditName').value.trim();
    const errEl = box.querySelector('#grpEditErr');
    if (!newName) { errEl.textContent = 'Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ'; return; }

    const saveBtn = box.querySelector('#grpEditSave');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>';

    const body = { username: currentUser, groupId };
    if (newName !== g.name) body.name = newName;
    if (newAvatarUrl !== undefined) body.avatar = newAvatarUrl;

    try {
      const r = await fetch('/api/update-group', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (d.success) {
        ov.classList.remove('open');
        toast('Р“СЂСѓРїРїР° РѕР±РЅРѕРІР»РµРЅР°', 'success');
      } else {
        errEl.textContent = d.error || 'РћС€РёР±РєР°';
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="ti ti-check"></i> РЎРѕС…СЂР°РЅРёС‚СЊ';
      }
    } catch {
      errEl.textContent = 'РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ';
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="ti ti-check"></i> РЎРѕС…СЂР°РЅРёС‚СЊ';
    }
  };
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// SETTINGS  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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
  // Accent вЂ” restore active state and checkmark
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
  // Notification sound name
  const notifData = localStorage.getItem('aura_notif_sound');
  const notifNameEl = $('notifSoundName');
  const notifResetBtn = $('notifSoundResetBtn');
  if (notifNameEl) notifNameEl.textContent = notifData ? 'рџЋµ РљР°СЃС‚РѕРјРЅС‹Р№ Р·РІСѓРє' : 'РЎС‚Р°РЅРґР°СЂС‚РЅС‹Р№ Р·РІСѓРє';
  if (notifResetBtn) notifResetBtn.style.display = notifData ? '' : 'none';
  // Recovery email + verified badge
  $('stRecoveryEmail').value = userData.recoveryEmail || '';
  const badge = $('emailVerifiedBadge');
  if (badge) badge.style.display = userData.emailVerified && userData.recoveryEmail ? 'flex' : 'none';
}

async function saveRecoveryEmail() {
  const email = $('stRecoveryEmail').value.trim();
  if (!email) {
    // РЈРґР°Р»РµРЅРёРµ email
    try {
      await fetch('/api/update-recovery-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, email: '' })
      });
      userData.recoveryEmail = null;
      userData.emailVerified = false;
      toast('Email СѓРґР°Р»С‘РЅ', 'info');
    } catch { toast('РћС€РёР±РєР°', 'error'); }
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast('Р’РІРµРґРёС‚Рµ РєРѕСЂСЂРµРєС‚РЅС‹Р№ email', 'warning');
    return;
  }

  const btn = document.querySelector('#st_account .btn-secondary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>'; }

  try {
    const r = await fetch('/api/update-recovery-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, email })
    });
    const d = await r.json();
    if (d.success && d.needsVerify) {
      toast(d.message || 'РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ', 'info');
      openEmailVerifyModal(email, 'email');
    } else if (d.success) {
      userData.recoveryEmail = email;
      toast('Email СЃРѕС…СЂР°РЅС‘РЅ', 'success');
    } else {
      toast(d.error || 'РћС€РёР±РєР°', 'error');
    }
  } catch { toast('РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ', 'error'); }
  finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i>'; }
  }
}

// в”Ђв”Ђ Email verify modal (РѕР±С‰РёР№ РґР»СЏ РЅР°СЃС‚СЂРѕРµРє Рё СЂРµРіРёСЃС‚СЂР°С†РёРё) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _verifyContext = 'email'; // 'email' | 'register'

function openEmailVerifyModal(email, context = 'email') {
  _verifyContext = context;
  const m = $('emailVerifyModal');
  if (!m) return;
  const hint = $('evHint');
  if (hint) hint.textContent = `РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РЅР° ${email}`;
  document.querySelectorAll('.ev-digit').forEach(d => { d.value = ''; });
  $('evErr').textContent = '';
  m.classList.add('open');
  setTimeout(() => document.querySelector('.ev-digit')?.focus(), 80);
}

function closeEmailVerifyModal() {
  $('emailVerifyModal')?.classList.remove('open');
}

function evDigit(input, idx) {
  const digits = document.querySelectorAll('.ev-digit');
  input.value = input.value.replace(/\D/g,'').slice(-1);
  if (input.value && idx < 5) digits[idx+1]?.focus();
  const code = [...digits].map(d => d.value).join('');
  if (code.length === 6) confirmEmailCode();
}

function evBack(e, input, idx) {
  if (e.key === 'Backspace' && !input.value && idx > 0) {
    const digits = document.querySelectorAll('.ev-digit');
    digits[idx-1].value = '';
    digits[idx-1].focus();
  }
}

async function confirmEmailCode() {
  const digits = document.querySelectorAll('.ev-digit');
  const code = [...digits].map(d => d.value).join('');
  const err = $('evErr');
  if (code.length < 6) { if (err) err.textContent = 'Р’РІРµРґРёС‚Рµ РІСЃРµ 6 С†РёС„СЂ'; return; }
  if (err) err.textContent = '';

  const btn = $('evConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>'; }

  try {
    const r = await fetch('/api/verify-email-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, code })
    });
    const d = await r.json();
    if (d.success) {
      userData.recoveryEmail = d.email;
      userData.emailVerified = true;
      closeEmailVerifyModal();
      // Update settings field with verified badge
      const f = $('stRecoveryEmail');
      if (f) f.value = d.email;
      const badge = $('emailVerifiedBadge');
      if (badge) badge.style.display = 'flex';
      toast('Email РїРѕРґС‚РІРµСЂР¶РґС‘РЅ вњ“', 'success');
    } else {
      if (err) err.textContent = d.error || 'РќРµРІРµСЂРЅС‹Р№ РєРѕРґ';
      digits.forEach(d => d.value = '');
      document.querySelector('.ev-digit')?.focus();
    }
  } catch { if (err) err.textContent = 'РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ'; }
  finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> РџРѕРґС‚РІРµСЂРґРёС‚СЊ'; }
  }
}

function closeSettings() { $('settingsModal').classList.remove('open'); }

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
//  AI CHAT  в†ђ Mistral AI СЃ РїР°РјСЏС‚СЊСЋ СЂР°Р·РіРѕРІРѕСЂР°
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// в”Ђв”Ђ AI Р§РђРў вЂ” РєР»РёРµРЅС‚ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _aiAttachment = null; // { type:'image'|'file', data, mimeType, name, preview }

let _aiDebugMode = false;

async function openAiChat() {
  // Р—Р°РіСЂСѓР¶Р°РµРј РёСЃС‚РѕСЂРёСЋ РёР· СЃРµСЂРІРµСЂР° РµСЃР»Рё messages РїСѓСЃС‚С‹
  const msgs = document.getElementById('aiMessages');
  if (msgs && msgs.children.length <= 1 && currentUser) {
    try {
      const r = await fetch(`/api/ai-history/${encodeURIComponent(currentUser)}`);
      const d = await r.json();
      if (d.history?.length) {
        const welcome = msgs.querySelector('.ai-welcome');
        if (welcome) welcome.remove();
        d.history.forEach(m => {
          if (m.role === 'user') {
            _aiAddMessage('user', m.content);
          } else if (m.role === 'assistant' && m.content) {
            _aiAddMessage('assistant', m.content);
          }
        });
        // Restore file cards from saved files
        if (d.files?.length) {
          d.files.forEach(f => {
            if (!_aiShownFileIds.has(f.id)) _aiAddFileCard(f);
          });
        }
        setTimeout(() => { if (msgs) msgs.scrollTop = msgs.scrollHeight; }, 50);
      }
    } catch {}
  }

  // Р”РѕР±Р°РІР»СЏРµРј РІС‹Р±РѕСЂ РјРѕРґРµР»Рё РµСЃР»Рё РµС‰С‘ РЅРµС‚
  if (!document.getElementById('aiModelWrap')) {
    const sendBtn = document.getElementById('aiSendBtn');
    const parent  = sendBtn?.parentElement;
    if (parent) {
      const models = [
        { value: 'mistral',               label: 'Mistral',           icon: '*', group: 'Core' },
        { value: 'minimax',               label: 'Aura AI',           icon: '+', group: 'Core' },
        { value: 'qw/qwen3-coder-plus',   label: 'Qwen3 Coder Plus',  icon: 'Q', group: 'OmniRouter' },
        { value: 'qw/qwen3-coder-flash',  label: 'Qwen3 Coder Flash', icon: 'Q', group: 'OmniRouter' },
        { value: 'qw/vision-model',       label: 'Qwen Vision',       icon: 'V', group: 'OmniRouter' },
        { value: 'qw/coder-model',        label: 'Qwen Coder',        icon: 'C', group: 'OmniRouter' },
      ];
      let currentModel = 'mistral';
      const modeState = {
        thinking: localStorage.getItem('ai_thinking') === '1',
        multiagent: localStorage.getItem('ai_multiagent') === '1',
      };

      const wrap = document.createElement('div');
      wrap.id = 'aiModelWrap';
      wrap.style.cssText = 'position:relative;flex-shrink:0;bottom:4px;';

      const btn = document.createElement('button');
      btn.id   = 'aiModelBtn';
      btn.type = 'button';
      btn.style.cssText = 'display:flex;align-items:center;gap:5px;padding:6px 10px;background:var(--surface3);border:1.5px solid var(--border);border-radius:12px;color:var(--text);font-size:12.5px;font-weight:500;font-family:inherit;cursor:pointer;white-space:nowrap;transition:all .2s;box-shadow:0 1px 4px rgba(0,0,0,.08);';
      btn.innerHTML = '<span id="aiModelIcon">*</span><span id="aiModelLabel" style="margin:0 2px">Mistral</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.5;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>';

      // Dropdown вЂ” position:fixed С‡С‚РѕР±С‹ РЅРµ РѕР±СЂРµР·Р°Р»СЃСЏ overflow РјРѕРґР°Р»Р°
      const drop = document.createElement('div');
      drop.id = 'aiModelDrop';
      drop.style.cssText = 'display:none;position:fixed;background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:5px;min-width:140px;box-shadow:0 8px 32px rgba(0,0,0,.22);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);z-index:99999;';

      function updateDropPos() {
        const r = btn.getBoundingClientRect();
        drop.style.left   = r.left + 'px';
        drop.style.top    = (r.top - drop.offsetHeight - 6) + 'px';
        // РµСЃР»Рё РЅРµ РїРѕРјРµС‰Р°РµС‚СЃСЏ СЃРІРµСЂС…Сѓ вЂ” РїРѕРєР°Р·С‹РІР°РµРј СЃРЅРёР·Сѓ
        if (r.top - drop.offsetHeight - 6 < 8) {
          drop.style.top  = (r.bottom + 6) + 'px';
        }
      }

      function openDrop() {
        drop.style.display = 'block';
        // position after display:block so offsetHeight is real
        requestAnimationFrame(updateDropPos);
        drop.style.animation = 'modelDropIn .14s cubic-bezier(.16,1,.3,1)';
        btn.style.borderColor = 'var(--accent)';
        btn.style.background  = 'var(--surface2)';
        btn.style.boxShadow   = '0 2px 10px rgba(99,102,241,.18)';
      }
      function closeDrop() {
        drop.style.display = 'none';
        btn.style.borderColor = 'var(--border)';
        btn.style.background  = 'var(--surface3)';
        btn.style.boxShadow   = '0 1px 4px rgba(0,0,0,.08)';
      }

      models.forEach(m => {
        const item = document.createElement('div');
        item.dataset.val = m.value;
        item.style.cssText = 'display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;transition:background .1s;color:var(--text);';
        item.innerHTML = '<span style="font-size:16px;line-height:1">' + m.icon + '</span><span>' + m.label + '</span>';
        if (m.value === currentModel) item.style.background = 'var(--accent-dim)';

        item.onmouseenter = () => { item.style.background = 'var(--surface2)'; };
        item.onmouseleave = () => { item.style.background = currentModel === m.value ? 'var(--accent-dim)' : ''; };
        item.onmousedown  = (e) => {
          e.preventDefault(); e.stopPropagation();
          currentModel = m.value;
          document.getElementById('aiModelIcon').textContent  = m.icon;
          document.getElementById('aiModelLabel').textContent = m.label;
          drop.querySelectorAll('[data-val]').forEach(d => { d.style.background = d.dataset.val === m.value ? 'var(--accent-dim)' : ''; });
          let sel = document.getElementById('aiModelSelect');
          if (sel) sel.value = m.value;
          closeDrop();
        };
        drop.appendChild(item);
      });

      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:var(--border);margin:6px 4px;';
      drop.appendChild(sep);

      function buildModeItem(id, label, key) {
        const item = document.createElement('button');
        item.type = 'button';
        item.id = id;
        item.style.cssText = 'width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border:none;background:transparent;color:var(--text);border-radius:10px;cursor:pointer;font-size:12.5px;font-family:inherit;';
        const render = () => {
          const on = !!modeState[key];
          item.innerHTML = `<span>${label}</span><span style="font-size:11px;padding:2px 8px;border-radius:999px;background:${on ? 'var(--accent)' : 'var(--surface3)'};color:${on ? '#fff' : 'var(--text2)'}">${on ? 'ON' : 'OFF'}</span>`;
        };
        render();
        item.onmouseenter = () => { item.style.background = 'var(--surface2)'; };
        item.onmouseleave = () => { item.style.background = 'transparent'; };
        item.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          modeState[key] = !modeState[key];
          localStorage.setItem(`ai_${key}`, modeState[key] ? '1' : '0');
          render();
          try {
            await fetch('/api/ai-settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: currentUser,
                thinking: key === 'thinking' ? modeState[key] : undefined,
                multiagent: key === 'multiagent' ? modeState[key] : undefined
              })
            });
          } catch {}
        };
        return item;
      }

      drop.appendChild(buildModeItem('aiThinkBtn', 'Thinking', 'thinking'));
      drop.appendChild(buildModeItem('aiMultiAgentBtn', 'Multi-Agent', 'multiagent'));

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        drop.style.display === 'block' ? closeDrop() : openDrop();
      });

      document.addEventListener('mousedown', (e) => {
        if (!wrap.contains(e.target) && e.target !== drop && !drop.contains(e.target)) {
          closeDrop();
        }
      });
      window.addEventListener('scroll', closeDrop, true);
      window.addEventListener('resize', () => { if (drop.style.display==='block') updateDropPos(); });

      // РЎРєСЂС‹С‚С‹Р№ select РґР»СЏ РїРѕР»СѓС‡РµРЅРёСЏ Р·РЅР°С‡РµРЅРёСЏ
      const hidSel = document.createElement('select');
      hidSel.id = 'aiModelSelect';
      hidSel.style.display = 'none';
      models.forEach(m => {
        const o = document.createElement('option');
        o.value = m.value; o.textContent = m.label;
        hidSel.appendChild(o);
      });
      document.body.appendChild(drop);
      wrap.appendChild(btn);
      wrap.appendChild(hidSel);
      parent.insertBefore(wrap, sendBtn);
    }
  }
  $('aiChatModal').classList.add('open');
  aiRefreshFileBadge();
  _aiConnectSse();
  // РќР° РјРѕР±РёР»СЊРЅРѕРј РЅРµ С„РѕРєСѓСЃРёСЂСѓРµРј Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё вЂ” СЌС‚Рѕ РІС‹Р·С‹РІР°РµС‚ РїСЂС‹Р¶РѕРє РєР»Р°РІРёР°С‚СѓСЂС‹
  if (!isMobile) setTimeout(() => $('aiInput')?.focus(), 80);
}

function closeAiChat() {
  $('aiChatModal').classList.remove('open');
  closeAiFilePanel();
}




async function aiRefreshFileBadge() {
  if (!currentUser) return;
  try {
    const r = await fetch(`/api/ai-files/${encodeURIComponent(currentUser)}`);
    const d = await r.json();
    const cnt = d.files?.length || 0;
    const badge = $('aiFilesBtn');
    if (badge) badge.innerHTML = `<i class="ti ti-files"></i>${cnt > 0 ? `<span style="position:absolute;top:-4px;right:-4px;background:var(--accent);color:#fff;border-radius:99px;font-size:10px;width:16px;height:16px;display:flex;align-items:center;justify-content:center">${cnt}</span>` : ''}`;
  } catch {}
}

// РљРЅРѕРїРєР° РїСЂРёРєСЂРµРїРёС‚СЊ С„Р°Р№Р»/С„РѕС‚Рѕ РІ AI С‡Р°С‚Рµ
function aiAttach() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*,.txt,.py,.js,.ts,.html,.css,.json,.csv,.md,.xml,.yaml,.yml,.log,.sh,.sql';
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      _aiAttachment = {
        type: isImage ? 'image' : 'file',
        data: base64,
        mimeType: file.type || 'text/plain',
        name: file.name,
        preview: isImage ? e.target.result : null,
        textContent: isImage ? null : atob(base64)
      };
      _aiUpdateAttachBar();
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}

function _aiUpdateAttachBar() {
  let bar = document.getElementById('aiAttachBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'aiAttachBar';
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--surface2);border-top:1px solid var(--border);font-size:12px;flex-shrink:0;';
    const inputZone = document.querySelector('#aiChatModal .input-box')?.parentElement;
    if (inputZone) inputZone.parentElement.insertBefore(bar, inputZone);
  }
  if (!_aiAttachment) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const preview = _aiAttachment.preview
    ? `<img src="${_aiAttachment.preview}" style="width:36px;height:36px;border-radius:6px;object-fit:cover">`
    : `<i class="ti ti-file" style="font-size:18px;color:var(--accent)"></i>`;
  bar.innerHTML = `
    ${preview}
    <span style="flex:1;color:var(--text2)">рџ“Ћ ${esc(_aiAttachment.name)}</span>
    <button onclick="_aiAttachment=null;_aiUpdateAttachBar()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px">
      <i class="ti ti-x"></i>
    </button>`;
}

function _aiAddMessage(role, content, attachment) {
  const msgs = $('aiMessages');
  if (!msgs) return;
  const welcome = msgs.querySelector('.ai-welcome');
  if (welcome) welcome.remove();

  const wrap = document.createElement('div');
  wrap.style.cssText = `display:flex;gap:8px;align-items:flex-end;margin-bottom:4px;${role === 'user' ? 'flex-direction:row-reverse' : ''}`;

  const ava = document.createElement('div');
  ava.style.cssText = 'width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;';
  if (role === 'user') {
    // РџРѕРєР°Р·С‹РІР°РµРј РЅР°СЃС‚РѕСЏС‰СѓСЋ Р°РІР°С‚Р°СЂРєСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
    const userAv = userAvatars[currentUser];
    if (userAv) {
      ava.style.backgroundImage = `url('${userAv}')`;
      ava.style.backgroundSize = 'cover';
      ava.style.backgroundPosition = 'center';
    } else {
      ava.style.background = 'linear-gradient(135deg,var(--accent),var(--accent2))';
      ava.style.color = '#fff';
      ava.textContent = (userData.nickname || currentUser || '?').charAt(0).toUpperCase();
    }
  } else {
    ava.style.background = 'linear-gradient(135deg,#6366f1,#8b5cf6)';
    ava.style.color = '#fff';
    ava.innerHTML = '<i class="ti ti-robot" style="font-size:14px"></i>';
  }

  const bubble = document.createElement('div');
  const isUser = role === 'user';
  bubble.style.cssText = `max-width:82%;padding:9px 13px;border-radius:${isUser?'16px 16px 4px 16px':'16px 16px 16px 4px'};font-size:13.5px;line-height:1.55;word-break:break-word;${isUser?'background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;':'background:var(--surface3);color:var(--text);'}`;

  // РџРѕРєР°Р·С‹РІР°РµРј РїСЂРёРєСЂРµРїР»С‘РЅРЅРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ
  let bubbleHtml = '';
  if (attachment?.type === 'image' && attachment.preview) {
    bubbleHtml += `<img src="${attachment.preview}" style="max-width:220px;border-radius:10px;display:block;margin-bottom:6px;cursor:pointer" onclick="viewMedia('${attachment.preview}','image')">`;
  } else if (attachment?.type === 'file') {
    bubbleHtml += `<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(0,0,0,.12);border-radius:8px;margin-bottom:6px;font-size:12px;"><i class="ti ti-file"></i>${esc(attachment.name)}</div>`;
  }

  // Markdown СЂРµРЅРґРµСЂ
  if (content) {
    bubbleHtml += _aiRenderMarkdown(content);
  }

  bubble.innerHTML = bubbleHtml;
  wrap.appendChild(ava);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  _aiSmartScroll();
  return wrap;
}

function _aiAddTyping() {
  const msgs = $('aiMessages');
  if (!msgs) return null;
  const wrap = document.createElement('div');
  wrap.id = 'aiTyping';
  wrap.style.cssText = 'display:flex;gap:8px;align-items:flex-end;margin-bottom:4px';
  wrap.innerHTML = `
    <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <i class="ti ti-robot" style="font-size:14px;color:#fff"></i>
    </div>
    <div style="background:var(--surface3);border-radius:16px 16px 16px 4px;padding:10px 14px;display:flex;gap:5px;align-items:center">
      <span style="width:7px;height:7px;border-radius:50%;background:var(--text2);animation:dotBounce .8s ease-in-out infinite"></span>
      <span style="width:7px;height:7px;border-radius:50%;background:var(--text2);animation:dotBounce .8s ease-in-out .16s infinite"></span>
      <span style="width:7px;height:7px;border-radius:50%;background:var(--text2);animation:dotBounce .8s ease-in-out .32s infinite"></span>
    </div>`;
  msgs.appendChild(wrap);
  _aiSmartScroll();
  return wrap;
}

// РўСЂРµРєРµСЂ СЃРѕР·РґР°РЅРЅС‹С… С„Р°Р№Р»РѕРІ РІ С‚РµРєСѓС‰РµРј РѕС‚РІРµС‚Рµ (РґР»СЏ ZIP СЃРєР°С‡РёРІР°РЅРёСЏ)
let _aiLastCreatedFiles = [];
const _aiShownFileIds = new Set(); // РґРµРґСѓРїР»РёРєР°С†РёСЏ РєР°СЂС‚РѕС‡РµРє

function _aiAddFileCard(file) {
  if (_aiShownFileIds.has(file.id)) return;
  _aiShownFileIds.add(file.id);
  _aiLastCreatedFiles.push(file);
  const msgs = $('aiMessages');
  if (!msgs) return;

  const card = document.createElement('div');
  card.className = 'ai-file-card';
  card.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border2);border-radius:14px;margin:4px 0 4px 36px;max-width:300px;';
  const ext = file.name.split('.').pop().toUpperCase();
  const icons = { py:'ti-brand-python', js:'ti-brand-javascript', html:'ti-brand-html5', css:'ti-brand-css3', json:'ti-json', csv:'ti-table', md:'ti-markdown', sh:'ti-terminal', sql:'ti-database' };
  const icon = icons[file.name.split('.').pop()?.toLowerCase()] || 'ti-file-code';
  card.innerHTML = `
    <i class="ti ${icon}" style="font-size:22px;color:var(--accent);flex-shrink:0"></i>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(file.name)}</div>
      <div style="font-size:11px;color:var(--text2)">${ext} • ${(file.content?.length||0).toLocaleString()} bytes • keeps 5 turns</div>
      ${file.description ? `<div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(file.description)}</div>` : ''}
    </div>
    <a class="ai-file-download" href="/api/ai-file/${encodeURIComponent(currentUser)}/${file.id}" download="${encodeURIComponent(file.name)}"
       style="padding:6px 10px;background:var(--accent);color:#fff;border-radius:8px;font-size:12px;text-decoration:none;flex-shrink:0" title="Download">
      <i class="ti ti-download"></i>
    </a>`;

  const extLower = file.name.split('.').pop().toLowerCase();
  const previewable = ['html','svg'].includes(extLower) || extLower === 'js' || extLower === 'css';
  if (previewable) {
    const previewBtn = document.createElement('button');
    previewBtn.title = 'Preview';
    previewBtn.style.cssText = 'padding:6px 10px;background:var(--surface3);border:1px solid var(--border);color:var(--text2);border-radius:8px;font-size:12px;cursor:pointer;flex-shrink:0;margin-right:4px';
    previewBtn.innerHTML = '<i class="ti ti-eye"></i>';
    previewBtn.onclick = () => _aiPreviewFile(file.id, file.name);
    const dlBtn = card.querySelector('a[download]');
    if (dlBtn) card.insertBefore(previewBtn, dlBtn);
    else card.appendChild(previewBtn);
  }

  msgs.appendChild(card);
  _aiUpdateFileCardsUi();
  _aiSmartScroll();
}

function _aiUpdateFileCardsUi() {
  const msgs = $('aiMessages');
  if (!msgs) return;
  const count = _aiLastCreatedFiles.length;
  let zipBar = $('aiZipBar');

  if (count > 1) {
    if (!zipBar) {
      zipBar = document.createElement('div');
      zipBar.id = 'aiZipBar';
      zipBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 14px;margin:4px 0 4px 36px;max-width:300px;background:var(--accent-dim);border:1px solid var(--border2);border-radius:10px;font-size:12px;cursor:pointer';
      zipBar.onclick = _aiDownloadZip;
      msgs.appendChild(zipBar);
    }
    zipBar.innerHTML = `<i class="ti ti-archive" style="color:var(--accent)"></i><span style="color:var(--accent);font-weight:600">Download ZIP (${count})</span><i class="ti ti-download" style="color:var(--accent);margin-left:auto"></i>`;
    if (zipBar.parentElement !== msgs) msgs.appendChild(zipBar);
  } else if (zipBar) {
    zipBar.remove();
  }

  const hideSingleDownloads = count > 2;
  msgs.querySelectorAll('.ai-file-download').forEach((el) => {
    el.style.display = hideSingleDownloads ? 'none' : '';
  });
}
async function _aiPreviewFile(fileId, mainName) {
  // Р—Р°РіСЂСѓР¶Р°РµРј С„Р°Р№Р» СЃ СЃРµСЂРІРµСЂР° (Р°РєС‚СѓР°Р»СЊРЅРѕРµ СЃРѕРґРµСЂР¶РёРјРѕРµ)
  let mainContent = '';
  try {
    const r = await fetch('/api/ai-file/' + encodeURIComponent(currentUser) + '/' + fileId);
    mainContent = await r.text();
  } catch(e) {
    toast('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё С„Р°Р№Р»Р°', 'error'); return;
  }
  const allFiles = _aiLastCreatedFiles;
  const mainFile = allFiles.find(f => f.id === fileId) || { id: fileId, name: mainName || 'file', content: mainContent };
  if (!mainFile) return;

  const ext = mainFile.name.split('.').pop().toLowerCase();
  let html = '';

  if (ext === 'html') {
    // РРЅР»Р°Р№РЅРёРј CSS Рё JS РёР· РґСЂСѓРіРёС… С„Р°Р№Р»РѕРІ СЃРµСЃСЃРёРё
    html = mainFile.content;
    allFiles.forEach(f => {
      const fext = f.name.split('.').pop().toLowerCase();
      if (fext === 'css') {
        html = html.replace(/<link[^>]+href=["'][^"']*\.css["'][^>]*>/gi, `<style>${f.content}</style>`);
        // Р•СЃР»Рё link РЅРµ РЅР°Р№РґРµРЅ - РґРѕР±Р°РІР»СЏРµРј РІ head
        if (!html.includes(f.content)) {
          html = html.replace('</head>', `<style>${f.content}</style></head>`);
        }
      }
      if (fext === 'js') {
        html = html.replace(/<script[^>]+src=["'][^"']*\.js["'][^>]*><\/script>/gi, `<script>${f.content}</script>`);
        if (!html.includes(f.content)) {
          html = html.replace('</body>', `<script>${f.content}</script></body>`);
        }
      }
    });
  } else if (ext === 'svg') {
    html = `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#111">${mainFile.content}</body></html>`;
  } else {
    // JS/CSS - РѕР±РѕСЂР°С‡РёРІР°РµРј РІ HTML
    html = ext === 'js'
      ? `<!DOCTYPE html><html><head><title>Preview</title></head><body><script>${mainFile.content}</script></body></html>`
      : `<!DOCTYPE html><html><head><style>${mainFile.content}</style></head><body><div class="demo">РџСЂРµРІСЊСЋ CSS</div></body></html>`;
  }

  // РћС‚РєСЂС‹РІР°РµРј РІ РјРѕРґР°Р»СЊРЅРѕРј РѕРєРЅРµ
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);display:flex;flex-direction:column;animation:fadeIn .2s ease';
  modal.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0">
      <span style="font-weight:700;font-size:14px;color:var(--text)"><i class="ti ti-eye" style="color:var(--accent)"></i> РџСЂРµРІСЊСЋ: ${esc(mainFile.name)}</span>
      <span style="font-size:12px;color:var(--text3)">Р’СЃРµ СЃРІСЏР·Р°РЅРЅС‹Рµ С„Р°Р№Р»С‹ РїРѕРґРєР»СЋС‡РµРЅС‹ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё</span>
      <button onclick="this.closest('[style*=fixed]').remove()" style="margin-left:auto;background:var(--surface3);border:1px solid var(--border);color:var(--text);padding:5px 12px;border-radius:8px;cursor:pointer;font-family:inherit">вњ• Р—Р°РєСЂС‹С‚СЊ</button>
    </div>
    <iframe id="aiPreviewFrame" sandbox="allow-scripts allow-same-origin" style="flex:1;border:none;background:#fff"></iframe>`;
  document.body.appendChild(modal);

  const iframe = modal.querySelector('#aiPreviewFrame');
  // iOS Safari РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ blob URL РІ iframe вЂ” РёСЃРїРѕР»СЊР·СѓРµРј srcdoc РІРµР·РґРµ
  try {
    // srcdoc СЂР°Р±РѕС‚Р°РµС‚ РІРµР·РґРµ РІРєР»СЋС‡Р°СЏ iOS
    iframe.srcdoc = html;
    // Fallback: blob URL РµСЃР»Рё srcdoc РЅРµ СЃСЂР°Р±РѕС‚Р°Р»
    setTimeout(() => {
      try {
        if (!iframe.contentDocument?.body?.innerHTML?.length) {
          const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
          iframe.src = URL.createObjectURL(blob);
        }
      } catch {}
    }, 1500);
  } catch(e) {
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    iframe.src = URL.createObjectURL(blob);
  }
}

async function _aiDownloadZip() {
  const ids = _aiLastCreatedFiles.map(f => f.id);
  try {
    const r = await fetch('/api/ai-files-zip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, fileIds: ids })
    });
    if (!r.ok) { toast('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ ZIP', 'error'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'aura_ai_files.zip';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch { toast('РћС€РёР±РєР° СЃРєР°С‡РёРІР°РЅРёСЏ', 'error'); }
}

const _aiToolLabels = {
  web_search: 'рџ”Ќ РџРѕРёСЃРє', get_weather: 'рџЊ¤ РџРѕРіРѕРґР°', calculate: 'рџ”ў РљР°Р»СЊРєСѓР»СЏС‚РѕСЂ',
  get_time: 'рџ•ђ Р’СЂРµРјСЏ', convert_currency: 'рџ’± РљСѓСЂСЃ РІР°Р»СЋС‚', translate: 'рџЊђ РџРµСЂРµРІРѕРґ',
  create_file: 'рџ“„ РЎРѕР·РґР°РЅРёРµ С„Р°Р№Р»Р°', generate_data: 'рџ“Љ Р“РµРЅРµСЂР°С†РёСЏ РґР°РЅРЅС‹С…',
  get_crypto: 'в‚ї РљСЂРёРїС‚РѕРІР°Р»СЋС‚С‹', url_info: 'рџ”— URL', wiki_search: 'рџ“– Wikipedia',
  get_stock: 'рџ“€ РљРѕС‚РёСЂРѕРІРєРё', timezone_convert: 'рџ•ђ Р§Р°СЃРѕРІС‹Рµ РїРѕСЏСЃР°', qr_generate: 'рџ”І QR',
  color_palette: 'рџЋЁ РџР°Р»РёС‚СЂР°', unit_convert: 'рџ“ђ Р•РґРёРЅРёС†С‹', dictionary: 'рџ“љ РЎР»РѕРІР°СЂСЊ',
  analyze_archive: 'рџ“¦ РђСЂС…РёРІ', check_code: 'рџ”¬ РџСЂРѕРІРµСЂРєР° РєРѕРґР°', run_code: 'в–¶ Р—Р°РїСѓСЃРє',
  news_search: 'рџ“° РќРѕРІРѕСЃС‚Рё', image_generate: 'рџЋЁ Р“РµРЅРµСЂР°С†РёСЏ РєР°СЂС‚РёРЅРєРё',
  create_presentation: 'рџ“Љ РџСЂРµР·РµРЅС‚Р°С†РёСЏ', regex_test: 'рџ”Ќ Regex',
  encode_decode: 'рџ”ђ РљРѕРґРёСЂРѕРІР°РЅРёРµ', json_format: '{} JSON',
  random: 'рџЋІ РЎР»СѓС‡Р°Р№РЅРѕРµ', date_calc: 'рџ“… Р”Р°С‚С‹', text_analyze: 'рџ“Љ РђРЅР°Р»РёР· С‚РµРєСЃС‚Р°',
  math_advanced: 'рџ”ў РњР°С‚РµРјР°С‚РёРєР°', ip_info: 'рџЊЌ IP',
  web_scrape: 'рџ•· РЎРєСЂРµР№РїРёРЅРі', api_test: 'рџ”Њ API С‚РµСЃС‚',
  markdown_render: 'рџ“ќ Markdown', schedule_generate: 'рџ“… Р Р°СЃРїРёСЃР°РЅРёРµ',
  country_info: 'рџЊЌ РЎС‚СЂР°РЅР°', music_info: 'рџЋµ РњСѓР·С‹РєР°',
  code_convert: 'рџ”„ РљРѕРЅРІРµСЂС‚РµСЂ РєРѕРґР°', git_explain: 'рџ”Ђ Git', pdf_to_text: 'рџ“„ PDF',
  uuid_generate: 'рџ†” UUID', slugify_text: 'рџ”— Slug',
  csv_to_json: 'рџ“„ CSVв†’JSON', json_to_csv: 'рџ“„ JSONв†’CSV'
};

// Р”РѕР±Р°РІР»СЏРµС‚ РєРѕР»Р»Р°РїСЃРёСЂСѓРµРјС‹Р№ Р»РѕРі РёРЅСЃС‚СЂСѓРјРµРЅС‚РѕРІ (РєР°Рє РЅР° СЃРєСЂРёРЅРµ)
// в”Ђв”Ђ AI Р·Р°РґР°С‘С‚ РІРѕРїСЂРѕСЃ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// в”Ђв”Ђ AI РІРѕРїСЂРѕСЃС‹ РЅР°Рґ Р±Р°СЂРѕРј РІРІРѕРґР° (СЃ РјСѓР»СЊС‚РёСЃРµР»РµРєС‚РѕРј Рё С†РµРїРѕС‡РєРѕР№) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _aiQuestionQueue   = [];  // РѕС‡РµСЂРµРґСЊ РІРѕРїСЂРѕСЃРѕРІ
let _aiQuestionAnswers = {};  // РѕС‚РІРµС‚С‹ РЅР° РІРѕРїСЂРѕСЃС‹ { index: value }
let _aiQuestionIdx     = 0;   // С‚РµРєСѓС‰РёР№ РІРѕРїСЂРѕСЃ

function _aiShowQuestion(askData) {
  // РџРѕРґРґРµСЂР¶РєР° РѕР±РѕРёС… С„РѕСЂРјР°С‚РѕРІ
  let questions = askData.questions;
  if (!questions && askData.question) {
    questions = [{ question: askData.question, options: askData.options || [], allow_custom: askData.allow_custom, required: true }];
  }
  _aiQuestionQueue   = questions || [];
  _aiQuestionAnswers = {};
  _aiQuestionIdx     = 0;
  _aiRenderQuestionBar();
}

function _aiRenderQuestionBar() {
  // РЈР±РёСЂР°РµРј СЃС‚Р°СЂС‹Р№ Р±Р°СЂ РµСЃР»Рё РµСЃС‚СЊ
  document.getElementById('aiQuestionBar')?.remove();

  if (_aiQuestionIdx >= _aiQuestionQueue.length) {
    // Р’СЃРµ РІРѕРїСЂРѕСЃС‹ РѕС‚РІРµС‡РµРЅС‹ вЂ” РѕС‚РїСЂР°РІР»СЏРµРј РёС‚РѕРі
    _aiSubmitAnswers();
    return;
  }

  const q      = _aiQuestionQueue[_aiQuestionIdx];
  const total  = _aiQuestionQueue.length;
  const isLast = _aiQuestionIdx === total - 1;
  const multi  = q.multi_select === true;
  const canSkip = q.required === false;

  // Р‘Р°СЂ РЅР°Рґ РїРѕР»РµРј РІРІРѕРґР°
  const modal = $('aiChatModal')?.querySelector('.modal-card');
  if (!modal) return;

  const bar = document.createElement('div');
  bar.id = 'aiQuestionBar';
  bar.style.cssText = `
    padding:12px 16px;background:var(--surface);border-top:1px solid var(--border);
    flex-shrink:0;animation:fadeUp .2s cubic-bezier(.16,1,.3,1);`;

  // Р—Р°РіРѕР»РѕРІРѕРє: РїСЂРѕРіСЂРµСЃСЃ + С‚РµРєСЃС‚ РІРѕРїСЂРѕСЃР°
  const progress = total > 1
    ? `<span style="font-size:10px;color:var(--text3);background:var(--surface3);padding:2px 8px;border-radius:99px;margin-right:6px">${_aiQuestionIdx+1}/${total}</span>`
    : '';
  const qText = document.createElement('div');
  qText.style.cssText = 'font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:4px';
  qText.innerHTML = `${progress}${esc(q.question)}`;
  if (multi) qText.innerHTML += `<span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:4px">(РјРѕР¶РЅРѕ РІС‹Р±СЂР°С‚СЊ РЅРµСЃРєРѕР»СЊРєРѕ)</span>`;
  bar.appendChild(qText);

  // Р’С‹Р±СЂР°РЅРЅС‹Рµ РІР°СЂРёР°РЅС‚С‹ (РґР»СЏ РјСѓР»СЊС‚РёСЃРµР»РµРєС‚Р°)
  const selected = new Set();

  // РљРЅРѕРїРєРё РІР°СЂРёР°РЅС‚РѕРІ
  if (q.options?.length) {
    const btnGrid = document.createElement('div');
    btnGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px';

    q.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.style.cssText = `padding:6px 14px;border-radius:20px;border:1.5px solid var(--border);
        background:var(--surface3);color:var(--text);font-size:12px;font-weight:500;
        cursor:pointer;transition:all .15s;font-family:inherit;`;
      btn.textContent = opt;

      const setActive = (active) => {
        btn.style.background = active ? 'var(--accent)' : 'var(--surface3)';
        btn.style.color      = active ? '#fff'          : 'var(--text)';
        btn.style.borderColor= active ? 'var(--accent)' : 'var(--border)';
      };

      btn.onclick = () => {
        if (multi) {
          if (selected.has(opt)) { selected.delete(opt); setActive(false); }
          else                   { selected.add(opt);    setActive(true);  }
        } else {
          // РћРґРёРЅРѕС‡РЅС‹Р№ вЂ” СЃСЂР°Р·Сѓ РїРµСЂРµС…РѕРґРёРј
          _aiQuestionAnswers[_aiQuestionIdx] = opt;
          _aiQuestionIdx++;
          _aiRenderQuestionBar();
        }
      };
      btnGrid.appendChild(btn);
    });
    bar.appendChild(btnGrid);
  }

  // в”Ђв”Ђ Р”Р»СЏ РјСѓР»СЊС‚РёСЃРµР»РµРєС‚Р°: РєРЅРѕРїРєР° "Р”Р°Р»РµРµ/РџСЂРѕРїСѓСЃС‚РёС‚СЊ" в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  if (multi) {
    const actWrap = document.createElement('div');
    actWrap.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;margin-top:6px';
    if (canSkip) {
      const skipBtn = document.createElement('button');
      skipBtn.style.cssText = `padding:6px 14px;border-radius:10px;background:var(--surface3);
        border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;font-family:inherit;`;
      skipBtn.textContent = 'РџСЂРѕРїСѓСЃС‚РёС‚СЊ';
      skipBtn.onclick = () => { _aiQuestionAnswers[_aiQuestionIdx] = null; _aiQuestionIdx++; _aiRenderQuestionBar(); };
      actWrap.appendChild(skipBtn);
    }
    const nextBtn = document.createElement('button');
    nextBtn.style.cssText = `padding:6px 16px;border-radius:10px;background:var(--accent);
      border:none;color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;`;
    nextBtn.textContent = isLast ? 'Р“РѕС‚РѕРІРѕ' : 'Р”Р°Р»РµРµ в†’';
    nextBtn.onclick = () => {
      const answer = [...selected];
      _aiQuestionAnswers[_aiQuestionIdx] = answer.length > 1 ? answer : answer[0] || null;
      _aiQuestionIdx++;
      _aiRenderQuestionBar();
    };
    actWrap.appendChild(nextBtn);
    bar.appendChild(actWrap);
  }

  // в”Ђв”Ђ РЎРІРѕР±РѕРґРЅС‹Р№ РІРІРѕРґ: Р·Р°РјРµРЅСЏРµС‚ РіР»Р°РІРЅС‹Р№ input bar в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  let customInput = null;
  if (!multi && (q.allow_custom || !q.options?.length)) {
    // РџРµСЂРµС…РІР°С‚С‹РІР°РµРј РіР»Р°РІРЅС‹Р№ РёРЅРїСѓС‚ С‡Р°С‚Р°
    const mainInput = $('aiInput');
    const mainSend  = $('aiSendBtn');
    if (mainInput) {
      const prevPlaceholder = mainInput.placeholder;
      const prevOnkeydown   = mainInput.onkeydown;
      mainInput.placeholder = q.options?.length ? 'РР»Рё РІРІРµРґРёС‚Рµ СЃРІРѕР№ РІР°СЂРёР°РЅС‚вЂ¦' : 'Р’Р°С€ РѕС‚РІРµС‚вЂ¦';
      mainInput.value = '';
      mainInput.focus();

      const submitCustom = () => {
        const val = mainInput.value.trim();
        // Р’РѕСЃСЃС‚Р°РЅР°РІР»РёРІР°РµРј РёРЅРїСѓС‚
        mainInput.placeholder = prevPlaceholder;
        mainInput.onkeydown   = prevOnkeydown;
        if (mainSend) mainSend.onclick = () => aiSend();
        _aiQuestionAnswers[_aiQuestionIdx] = val || null;
        _aiQuestionIdx++;
        mainInput.value = '';
        _aiRenderQuestionBar();
      };

      mainInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCustom(); } };
      if (mainSend) mainSend.onclick = submitCustom;

      // РџСЂРѕРїСѓСЃС‚РёС‚СЊ вЂ” СЃСЃС‹Р»РєР° РїРѕРґ Р±Р°СЂРѕРј
      if (canSkip) {
        const skipLink = document.createElement('div');
        skipLink.style.cssText = 'text-align:right;margin-top:4px';
        skipLink.innerHTML = `<button onclick="
          $('aiInput').placeholder = 'РЎРїСЂРѕСЃРёС‚Рµ С‡С‚Рѕ-РЅРёР±СѓРґСЊвЂ¦';
          $('aiInput').onkeydown = (e) => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiSend();} };
          $('aiSendBtn').onclick = () => aiSend();
          _aiQuestionAnswers[_aiQuestionIdx] = null; _aiQuestionIdx++; _aiRenderQuestionBar();"
          style="background:none;border:none;color:var(--text3);font-size:12px;cursor:pointer;font-family:inherit;padding:0">
          РџСЂРѕРїСѓСЃС‚РёС‚СЊ в†’</button>`;
        bar.appendChild(skipLink);
      }
    }
  }

  // Р’СЃС‚Р°РІР»СЏРµРј РїРµСЂРµРґ РїРѕР»РµРј РІРІРѕРґР°
  const inputZone = modal.querySelector('.input-box')?.parentElement;
  if (inputZone) modal.insertBefore(bar, inputZone);
  else modal.appendChild(bar);
}

async function _aiSubmitAnswers() {
  document.getElementById('aiQuestionBar')?.remove();

  // РЎРѕР±РёСЂР°РµРј РѕС‚РІРµС‚С‹ вЂ” С‚РѕР»СЊРєРѕ Р·РЅР°С‡РµРЅРёСЏ, Р±РµР· РїРѕРІС‚РѕСЂРµРЅРёСЏ РІРѕРїСЂРѕСЃРѕРІ
  const answered = _aiQuestionQueue
    .map((q, i) => {
      const ans = _aiQuestionAnswers[i];
      if (ans === null || ans === undefined) return null;
      return Array.isArray(ans) ? ans.join(', ') : String(ans);
    })
    .filter(Boolean);

  if (!answered.length) {
    // Р’СЃС‘ РїСЂРѕРїСѓС‰РµРЅРѕ вЂ” РЅРёС‡РµРіРѕ РЅРµ РѕС‚РїСЂР°РІР»СЏРµРј
    return;
  }

  // Р•СЃР»Рё РѕРґРёРЅ РІРѕРїСЂРѕСЃ вЂ” РїСЂРѕСЃС‚Рѕ РѕС‚РІРµС‚. Р•СЃР»Рё РЅРµСЃРєРѕР»СЊРєРѕ вЂ” РЅСѓРјРµСЂРѕРІР°РЅРЅС‹Р№ СЃРїРёСЃРѕРє
  const summaryMsg = answered.length === 1
    ? answered[0]
    : answered.map((a, i) => `${i+1}. ${a}`).join('\n');
  _aiAddMessage('user', summaryMsg);

  const sendBtn = $('aiSendBtn');
  _aiLocked = true;
  if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.5'; }
  const typing = _aiAddTyping();

  try {
    const aiModel = document.getElementById('aiModelSelect')?.value || 'mistral';
    const r = await fetch('/api/ai-chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, message: summaryMsg, model: aiModel })
    });
    const d = await r.json();
    if (typing) typing.remove();
    if (d.success) {
      if (d.debugMode !== undefined) _aiSetDebugMode(d.debugMode);
      if (d.toolsUsed?.length) _aiAddToolLog(d.toolsUsed);
      if (d.askUser) { _aiShowQuestion(d.askUser); return; }
      if (d.reply) _aiAddMessage('assistant', d.reply);
      if (d.createdFiles?.length) {
        d.createdFiles.forEach(f => _aiAddFileCard(f));
        if (_aiFilePanelOpen) aiRenderFilePanel();
        else aiRefreshFileBadge();
      }
    } else {
      _aiAddMessage('assistant', 'вљ пёЏ ' + (d.error || 'РћС€РёР±РєР°'));
    }
  } catch {
    if (typing) typing.remove();
    _aiAddMessage('assistant', 'вљ пёЏ РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ.');
  } finally {
    _aiLocked = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = ''; }
    $('aiInput')?.focus();
  }
}

// РЎС‚Р°СЂР°СЏ С„СѓРЅРєС†РёСЏ вЂ” С‚РµРїРµСЂСЊ РїСЂРѕСЃС‚Рѕ Р°Р»РёР°СЃ
async function _aiSendOption(text) {
  document.getElementById('aiQuestionBar')?.remove();
  _aiAddMessage('user', text);
  const sendBtn = $('aiSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  const typing = _aiAddTyping();
  try {
    const r = await fetch('/api/ai-chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, message: text })
    });
    const d = await r.json();
    if (typing) typing.remove();
    if (d.success) {
      if (d.debugMode !== undefined) _aiSetDebugMode(d.debugMode);
      if (d.toolsUsed?.length) _aiAddToolLog(d.toolsUsed);
      if (d.askUser) { _aiShowQuestion(d.askUser); return; }
      if (d.reply) _aiAddMessage('assistant', d.reply);
      if (d.createdFiles?.length) { d.createdFiles.forEach(f => _aiAddFileCard(f)); aiRefreshFileBadge(); }
    } else {
      _aiAddMessage('assistant', 'вљ пёЏ ' + (d.error || 'РћС€РёР±РєР°'));
    }
  } catch {
    if (typing) typing.remove();
    _aiAddMessage('assistant', 'вљ пёЏ РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ.');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    $('aiInput')?.focus();
  }
}

function _aiAddToolLog(tools) {
  const msgs = $('aiMessages');
  if (!msgs || !tools?.length) return;

  const logId = 'ailog_' + Date.now();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin: 2px 0 6px 36px;';

  const count = tools.length;
  const summary = tools.length === 1
    ? _aiToolLabels[tools[0]] || tools[0]
    : `Р—Р°РїСѓС‰РµРЅРѕ ${count} РёРЅСЃС‚СЂСѓРјРµРЅС‚${count===1?'':count<5?'Р°':'РѕРІ'}`;

  wrap.innerHTML = `
    <div class="ai-tool-log">
      <button class="ai-tool-toggle" onclick="this.parentElement.classList.toggle('open')" style="display:flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:0;color:var(--text2);font-size:12px;font-family:inherit">
        <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:99px;transition:background .15s">
          <i class="ti ti-adjustments-horizontal" style="font-size:11px"></i>
          ${esc(summary)}
          <i class="ti ti-chevron-down ai-log-arrow" style="font-size:10px;transition:transform .2s"></i>
        </span>
      </button>
      <div class="ai-tool-steps" style="display:none;margin-top:6px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;font-size:12px;display:none">
        ${tools.map(t => `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;color:var(--text2)">
          <i class="ti ti-check" style="font-size:12px;color:var(--success);flex-shrink:0"></i>
          ${esc(_aiToolLabels[t] || t)}
        </div>`).join('')}
      </div>
    </div>`;

  // Toggle logic
  const toggle = wrap.querySelector('.ai-tool-toggle');
  const steps  = wrap.querySelector('.ai-tool-steps');
  const arrow  = wrap.querySelector('.ai-log-arrow');
  toggle.addEventListener('click', () => {
    const open = steps.style.display === 'none' || steps.style.display === '';
    steps.style.display = open ? 'block' : 'none';
    if (arrow) arrow.style.transform = open ? 'rotate(180deg)' : '';
  });

  msgs.appendChild(wrap);
  _aiSmartScroll();
}

// в”Ђв”Ђ SSE СЃС‚СЂРёРјРёРЅРі в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _aiSse = null;          // EventSource
let _aiStreamBubble = null; // С‚РµРєСѓС‰РёР№ СЃС‚СЂРёРјСЏС‰РёР№СЃСЏ bubble div
let _aiStreamContent = '';  // РЅР°РєРѕРїР»РµРЅРЅС‹Р№ С‚РµРєСЃС‚
let _aiStreamingStarted = false; // С„Р»Р°Рі вЂ” SSE СЃС‚СЂРёРјРёРЅРі СѓР¶Рµ РЅР°С‡Р°Р»СЃСЏ

function _aiConnectSse() {
  // РџРµСЂРµРїРѕРґРєР»СЋС‡Р°РµРј РµСЃР»Рё СЃРѕРµРґРёРЅРµРЅРёРµ Р·Р°РєСЂС‹С‚Рѕ
  if (_aiSse && _aiSse.readyState !== EventSource.CLOSED) return;
  if (_aiSse) { _aiSse.close(); _aiSse = null; }
  if (!currentUser) return;
  _aiSse = new EventSource(`/api/ai-stream/${encodeURIComponent(currentUser)}`);

  _aiSse.addEventListener('log', (e) => {
    try {
      const d = JSON.parse(e.data);
      _aiAddLiveLog(d);
    } catch {}
  });

  _aiSse.addEventListener('chunk', (e) => {
    try {
      const { text } = JSON.parse(e.data);
      // РњС‹СЃР»Рё РЅРµР№СЂРѕСЃРµС‚Рё в†’ РІ live log РїР°РЅРµР»СЊ, РЅРµ РІ bubble
      if (text && text.startsWith('__THINK__')) {
        // РњС‹СЃР»Рё в†’ С‚РѕР»СЊРєРѕ РІ live log, РќР• РІ bubble
        document.getElementById('aiTyping')?.remove(); // СѓР±РёСЂР°РµРј Р°РЅРёРјР°С†РёСЋ РїРѕРєР° РґСѓРјР°РµС‚
        _aiAddLiveLog({ icon: 'рџ’­', text: text.slice(9), type: 'think' });
        return;
      }
      // РџРµСЂРІС‹Р№ С‚РµРєСЃС‚РѕРІС‹Р№ С‡Р°РЅРє = РєРѕРЅРµС† СЂР°Р·РјС‹С€Р»РµРЅРёР№, РЅР°С‡Р°Р»Рѕ РѕС‚РІРµС‚Р°
      if (!_aiStreamingStarted) {
        // РЈР±РёСЂР°РµРј typing indicator
        document.getElementById('aiTyping')?.remove();
      }
      _aiStreamingStarted = true;
      if (!_aiStreamBubble) {
        _aiStreamContent = '';
        const { wrap, bubble } = _aiCreateStreamBubble();
        _aiStreamBubble = bubble;
      }
      _aiStreamContent += text;
      _aiStreamBubble.innerHTML = _aiRenderMarkdown(_aiStreamContent) + '<span class="ai-cursor">в–‹</span>';
      _aiSmartScroll();
    } catch {}
  });

  // РњРµРґРёР° (РёР·РѕР±СЂР°Р¶РµРЅРёРµ/РІРёРґРµРѕ) РѕС‚ AI
  _aiSse.addEventListener('media', (e) => {
    try {
      const d = JSON.parse(e.data);
      document.getElementById('aiTyping')?.remove();
      const sendBtn2 = $('aiSendBtn');
      if (sendBtn2) sendBtn2.disabled = false;

      if (d.type === 'image') {
        _aiAddMediaMessage(d.base64, d.prompt || '', d.fileId);
        if (d.remaining !== undefined && d.remaining <= 1) {
          setTimeout(() => _aiAddMessage('assistant', `_(РћСЃС‚Р°Р»РѕСЃСЊ РёР·РѕР±СЂР°Р¶РµРЅРёР№ СЃРµРіРѕРґРЅСЏ: ${d.remaining})_`), 300);
        }
      } else if (d.type === 'video_preview') {
        _aiAddVideoPreviewMessage(d.base64, d.prompt || '', d.fileId, d.filename, d.frameCount || 1);
      } else if (d.type === 'video_real') {
        _aiAddRealVideoMessage(d.base64, d.prompt || '', d.fileId, d.filename);
      } else if (d.type === 'image_error') {
        _aiAddMessage('assistant', 'вљ пёЏ ' + (d.error || 'РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё'));
      }
    } catch(err) { console.error('SSE media err', err); }
  });

  _aiSse.addEventListener('ask_user', (e) => {
    try {
      const d = JSON.parse(e.data);
      document.getElementById('aiTyping')?.remove();
      _aiShowQuestion(d);
    } catch {}
  });

  // Р¤Р°Р№Р»С‹ РїСЂРёС…РѕРґСЏС‚ С‡РµСЂРµР· SSE СЃСЂР°Р·Сѓ РїСЂРё СЃРѕР·РґР°РЅРёРё
  _aiSse.addEventListener('file_created', (e) => {
    try {
      const f = JSON.parse(e.data);
      if (!_aiShownFileIds.has(f.id)) {
        _aiAddFileCard(f);
        aiRefreshFileBadge();
      }
    } catch {}
  });

  _aiSse.addEventListener('done', () => {
    if (_aiStreamBubble) {
      // РЈР±РёСЂР°РµРј РєСѓСЂСЃРѕСЂ
      _aiStreamBubble.innerHTML = _aiRenderMarkdown(_aiStreamContent);
      _aiStreamBubble = null;
      _aiStreamContent = '';
    }
    document.getElementById('aiTyping')?.remove();
  });

  _aiSse.onerror = () => {};
}

// РџРѕРєР°Р·С‹РІР°РµС‚ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РѕС‚ AI РїСЂСЏРјРѕ РІ С‡Р°С‚Рµ
function _aiAddMediaMessage(base64url, prompt, fileId) {
  const msgs = $('aiMessages');
  if (!msgs) return;
  const welcome = msgs.querySelector('.ai-welcome');
  if (welcome) welcome.remove();

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin-bottom:8px';

  const ava = document.createElement('div');
  ava.style.cssText = 'width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px';
  ava.innerHTML = '<i class="ti ti-robot" style="font-size:14px;color:#fff"></i>';

  const bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:85%;';

  // РР·РѕР±СЂР°Р¶РµРЅРёРµ СЃ РєРЅРѕРїРєР°РјРё
  const imgWrap = document.createElement('div');
  imgWrap.style.cssText = 'position:relative;display:inline-block;border-radius:14px;overflow:hidden;background:var(--surface2)';

  const img = document.createElement('img');
  img.src = base64url;
  img.alt = prompt;
  img.style.cssText = 'max-width:360px;max-height:280px;display:block;border-radius:14px;cursor:pointer;transition:filter .2s';
  img.onclick = () => viewMedia(base64url, 'image');
  img.onmouseover = () => img.style.filter = 'brightness(.85)';
  img.onmouseout  = () => img.style.filter = '';

  // РљРЅРѕРїРєР° СЃРєР°С‡Р°С‚СЊ
  const dl = document.createElement('a');
  dl.href = fileId ? `/api/ai-file/${encodeURIComponent(currentUser)}/${fileId}` : base64url;
  dl.download = 'ai_image.html';
  dl.style.cssText = 'position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;padding:5px 10px;border-radius:8px;font-size:12px;text-decoration:none;backdrop-filter:blur(4px)';
  dl.innerHTML = '<i class="ti ti-download"></i>';

  imgWrap.appendChild(img);
  imgWrap.appendChild(dl);

  if (prompt) {
    const cap = document.createElement('div');
    cap.style.cssText = 'font-size:11px;color:var(--text3);margin-top:4px;padding:0 2px';
    cap.textContent = prompt;
    bubble.appendChild(imgWrap);
    bubble.appendChild(cap);
  } else {
    bubble.appendChild(imgWrap);
  }

  wrap.appendChild(ava);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  _aiSmartScroll();
}

// РџРѕРєР°Р·С‹РІР°РµС‚ РІРёРґРµРѕ-РїСЂРµРІСЊСЋ РѕС‚ AI РІ С‡Р°С‚Рµ
// РџРѕРєР°Р·С‹РІР°РµС‚ СЂРµР°Р»СЊРЅРѕРµ MP4 РІРёРґРµРѕ РІ С‡Р°С‚Рµ (Stability AI / Replicate)
function _aiAddRealVideoMessage(base64url, prompt, fileId, filename) {
  const msgs = $('aiMessages');
  if (!msgs) return;

  const welcome = msgs.querySelector('.ai-welcome');
  if (welcome) welcome.remove();

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin-bottom:8px';

  const ava = document.createElement('div');
  ava.style.cssText = 'width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px';
  ava.innerHTML = '<i class="ti ti-robot" style="font-size:14px;color:#fff"></i>';

  const bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:min(420px,90vw)';

  const videoEl = document.createElement('video');
  videoEl.src = base64url;
  videoEl.controls = true;
  videoEl.loop = true;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');
  videoEl.setAttribute('x-webkit-airplay', 'allow');
  videoEl.style.cssText = 'width:100%;border-radius:14px;display:block;box-shadow:0 4px 20px rgba(0,0,0,.4);background:#000';
  // iOS requires user gesture for play вЂ” show native controls
  videoEl.addEventListener('loadedmetadata', () => { videoEl.play().catch(() => {}); });

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap';
  const dlLink = document.createElement('a');
  dlLink.href = base64url;
  dlLink.download = filename || 'ai_video.mp4';
  dlLink.style.cssText = 'padding:5px 12px;background:var(--accent);color:#fff;border-radius:8px;font-size:12px;text-decoration:none;flex-shrink:0';
  dlLink.innerHTML = '<i class="ti ti-download"></i> РЎРєР°С‡Р°С‚СЊ MP4';
  const caption = document.createElement('span');
  caption.style.cssText = 'font-size:11px;color:var(--text3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  caption.textContent = prompt;
  actions.appendChild(dlLink);
  actions.appendChild(caption);

  bubble.appendChild(videoEl);
  bubble.appendChild(actions);
  wrap.appendChild(ava);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  _aiSmartScroll();
}

function _aiAddVideoPreviewMessage(base64url, prompt, fileId, filename, frameCount) {
  const msgs = $('aiMessages');
  if (!msgs) return;
  const welcome = msgs.querySelector('.ai-welcome');
  if (welcome) welcome.remove();

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin-bottom:8px';

  const ava = document.createElement('div');
  ava.style.cssText = 'width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px';
  ava.innerHTML = '<i class="ti ti-robot" style="font-size:14px;color:#fff"></i>';

  const bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:85%';

  const card = document.createElement('div');
  card.style.cssText = 'position:relative;display:inline-block;border-radius:14px;overflow:hidden;background:var(--surface2)';

  // РџСЂРµРІСЊСЋ-РєР°РґСЂ
  const img = document.createElement('img');
  img.src = base64url;
  img.style.cssText = 'max-width:min(360px,85vw);max-height:280px;display:block;border-radius:14px;opacity:.85';

  // РџР»Р°С€РєР° "Р’РёРґРµРѕ"
  const badge = document.createElement('div');
  badge.style.cssText = 'position:absolute;top:8px;left:8px;background:rgba(0,0,0,.7);color:#fff;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;display:flex;align-items:center;gap:5px;backdrop-filter:blur(4px)';
  badge.innerHTML = '<i class="ti ti-video" style="font-size:12px"></i> Р’РёРґРµРѕ В· ' + frameCount + ' РєР°РґСЂРѕРІ';

  // РљРЅРѕРїРєР° РѕС‚РєСЂС‹С‚СЊ
  const openBtn = document.createElement('div');
  openBtn.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer';
  openBtn.innerHTML = '<div style="width:52px;height:52px;border-radius:50%;background:rgba(99,102,241,.85);display:flex;align-items:center;justify-content:center"><i class="ti ti-player-play" style="font-size:22px;color:#fff;margin-left:2px"></i></div>';
  openBtn.onclick = () => {
    if (fileId) {
      // РћС‚РєСЂС‹РІР°РµРј HTML РІРёРґРµРѕ РІ РїСЂРµРІСЊСЋ
      _aiPreviewFile(fileId, filename || 'ai_video.html');
    }
  };

  // РЎРєР°С‡Р°С‚СЊ
  const dl = document.createElement('a');
  dl.href = '/api/ai-file/' + encodeURIComponent(currentUser) + '/' + fileId;
  dl.download = filename || 'ai_video.html';
  dl.style.cssText = 'position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;padding:5px 10px;border-radius:8px;font-size:12px;text-decoration:none;backdrop-filter:blur(4px)';
  dl.innerHTML = '<i class="ti ti-download"></i>';

  card.appendChild(img);
  card.appendChild(badge);
  card.appendChild(openBtn);
  card.appendChild(dl);

  const cap = document.createElement('div');
  cap.style.cssText = 'font-size:11px;color:var(--text3);margin-top:4px;padding:0 2px';
  cap.textContent = prompt;

  bubble.appendChild(card);
  bubble.appendChild(cap);

  wrap.appendChild(ava);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  _aiSmartScroll();
}

// РЈРјРЅС‹Р№ СЃРєСЂРѕР»Р»: РїСЂРѕРєСЂСѓС‡РёРІР°РµРј РІРЅРёР· С‚РѕР»СЊРєРѕ РµСЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЈР–Р• РІРЅРёР·Сѓ
function _aiSmartScroll() {
  const msgs = $('aiMessages');
  if (!msgs) return;
  const threshold = 80; // px РѕС‚ РЅРёР·Р° вЂ” СЃС‡РёС‚Р°РµРј "РІРЅРёР·Сѓ"
  const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < threshold;
  if (atBottom) msgs.scrollTop = msgs.scrollHeight;
}

function _aiCreateStreamBubble() {
  const msgs = $('aiMessages');
  if (!msgs) return { wrap: null, bubble: null };

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin-bottom:4px';

  const ava = document.createElement('div');
  ava.style.cssText = 'width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px';
  ava.innerHTML = '<i class="ti ti-robot" style="font-size:14px;color:#fff"></i>';

  const bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:82%;padding:9px 13px;border-radius:16px 16px 16px 4px;font-size:13.5px;line-height:1.55;word-break:break-word;background:var(--surface3);color:var(--text);';
  bubble.innerHTML = '<span class="ai-cursor">в–‹</span>';

  wrap.appendChild(ava);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  _aiSmartScroll();

  return { wrap, bubble };
}

// Р–РёРІРѕР№ Р»РѕРі РёРЅСЃС‚СЂСѓРјРµРЅС‚РѕРІ вЂ” РґРѕР±Р°РІР»СЏРµС‚СЃСЏ РїРѕСЃС‚РµРїРµРЅРЅРѕ
let _aiLiveLogWrap = null;
let _aiLiveLogList = null;
let _aiLiveLogItems = [];

function _aiAddLiveLog(d) {
  const msgs = $('aiMessages');
  if (!msgs) return;

  if (!_aiLiveLogWrap) {
    _aiLiveLogWrap = document.createElement('div');
    _aiLiveLogWrap.style.cssText = 'margin:2px 0 6px 36px;';
    const toggle = document.createElement('div');
    toggle.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer;margin-bottom:4px;user-select:none';
    toggle.innerHTML = `<i class="ti ti-adjustments-horizontal" style="font-size:11px"></i><span id="aiLogSummary">Р—Р°РїСѓСЃРєР°СЋ РёРЅСЃС‚СЂСѓРјРµРЅС‚С‹...</span><i class="ti ti-chevron-down" id="aiLogArrow" style="font-size:10px;transition:transform .2s;margin-left:auto"></i>`;
    _aiLiveLogList = document.createElement('div');
    _aiLiveLogList.style.cssText = 'padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;font-size:12px;display:none;';
    toggle.onclick = () => {
      const open = _aiLiveLogList.style.display === 'none';
      _aiLiveLogList.style.display = open ? 'block' : 'none';
      const arrow = document.getElementById('aiLogArrow');
      if (arrow) arrow.style.transform = open ? 'rotate(180deg)' : '';
    };
    _aiLiveLogWrap.appendChild(toggle);
    _aiLiveLogWrap.appendChild(_aiLiveLogList);
    msgs.appendChild(_aiLiveLogWrap);
  }

  const item = document.createElement('div');
  item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0;color:var(--text2);animation:fadeIn .2s ease';
  // РРєРѕРЅРєР° РїРѕ С‚РёРїСѓ (РјР°Р»РµРЅСЊРєРёР№ РёРЅРґРёРєР°С‚РѕСЂ Р±РµР· emoji-СЂРѕР±РѕС‚РѕРІ)
  const typeColors = { search:'#6366f1', fetch:'#06b6d4', process:'#f59e0b', write:'#10b981', check:'#8b5cf6', think:'#9898b0', result:'#22c55e' };
  const col = typeColors[d.type] || 'var(--text3)';
  item.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${col};flex-shrink:0;display:inline-block;margin-top:5px"></span><span style="color:var(--text2)">${esc(d.text || '')}</span>`;
  _aiLiveLogList.appendChild(item);
  _aiLiveLogItems.push(item);

  // РћР±РЅРѕРІР»СЏРµРј summary
  const summary = document.getElementById('aiLogSummary');
  if (summary) summary.textContent = d.text || 'Р Р°Р±РѕС‚Р°СЋ...';

  _aiSmartScroll();
}

function _aiResetLiveLog() {
  _aiLiveLogWrap = null;
  _aiLiveLogList = null;
  _aiLiveLogItems = [];
}

function _aiRenderMarkdown(text) {
  return esc(text)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre style="background:rgba(0,0,0,.25);padding:10px;border-radius:10px;overflow-x:auto;font-family:monospace;font-size:12px;margin:6px 0;white-space:pre-wrap">${code}</pre>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,.2);padding:1px 5px;border-radius:4px;font-family:monospace;font-size:12px">$1</code>')
    .replace(/^вЂў (.+)$/gm, '<li style="margin-left:12px">$1</li>')
    .replace(/\n/g, '<br>');
}

let _aiLocked = false; // Р±Р»РѕРєРёСЂРѕРІРєР° РїРѕРєР° РёРґС‘С‚ РѕС‚РІРµС‚

async function aiSend() {
  if (_aiLocked) return; // РЅРµ РѕС‚РїСЂР°РІР»СЏРµРј РїРѕРєР° РёРґС‘С‚ РѕС‚РІРµС‚
  const inp = $('aiInput');
  if (!inp) return;
  const text = inp.value.trim();
  const attach = _aiAttachment;

  if (!text && !attach) return;

  // в”Ђв”Ђ РџРµСЂРµС…РІР°С‚ Р·Р°РїСЂРѕСЃРѕРІ РЅР° РёР·РѕР±СЂР°Р¶РµРЅРёРµ/РІРёРґРµРѕ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const imgKeywords  = /(РЅР°СЂРёСЃСѓР№|СЃРіРµРЅРµСЂРёСЂСѓР№|СЃРѕР·РґР°Р№|СЃРґРµР»Р°Р№|РїРѕРєР°Р¶Рё|draw|generate|create|make).*(РєР°СЂС‚РёРЅРє|РёР·РѕР±СЂР°Р¶РµРЅРё|С„РѕС‚Рѕ|СЂРёСЃСѓРЅ|image|picture|photo|pic)|(image|picture|photo|img).*(of|СЃ|РєРѕС‚Р°|РєРѕС‚|СЃРѕР±Р°Рє|РїРµР№Р·Р°Р¶|РїРѕСЂС‚СЂРµС‚)/i;
  const vidKeywords  = /(СЃРґРµР»Р°Р№|СЃРѕР·РґР°Р№|СЃРіРµРЅРµСЂРёСЂСѓР№|generate|create|make).*(РІРёРґРµРѕ|video|Р°РЅРёРјР°С†Рё|animation|РєР»РёРї|clip)/i;
  const isImgRequest = imgKeywords.test(text) || text.toLowerCase().startsWith('РЅР°СЂРёСЃСѓР№') || text.toLowerCase().startsWith('draw ') || text.toLowerCase().includes('РєР°СЂС‚РёРЅРєСѓ') || text.toLowerCase().includes('РёР·РѕР±СЂР°Р¶РµРЅРёРµ') || /^(img|image|РєР°СЂС‚РёРЅРєР°|РЅР°СЂРёСЃСѓР№|СЃРіРµРЅРµСЂРёСЂСѓР№ РєР°СЂС‚РёРЅРє)/i.test(text.trim());
  const isVidRequest = vidKeywords.test(text);

  if ((isImgRequest || isVidRequest) && !attach) {
    const sendBtn = $('aiSendBtn'); // РѕР±СЉСЏРІР»СЏРµРј Р·РґРµСЃСЊ РґР»СЏ РїРµСЂРµС…РІР°С‚Р°
    inp.value = '';
    autoGrow(inp);
    _aiResetLiveLog();
    _aiStreamingStarted = false;
    _aiLastCreatedFiles = [];
    _aiShownFileIds.clear();
    document.getElementById('aiZipBar')?.remove();

    const userMsg = text;
    _aiAddMessage('user', userMsg);
    const typing = _aiAddTyping();
    if (sendBtn) sendBtn.disabled = true;

    // Р’С‹С‚Р°СЃРєРёРІР°РµРј РїСЂРѕРјРїС‚ РёР· СЃРѕРѕР±С‰РµРЅРёСЏ
    let prompt = userMsg
      .replace(/^(РЅР°СЂРёСЃСѓР№|СЃРіРµРЅРµСЂРёСЂСѓР№|СЃРѕР·РґР°Р№|СЃРґРµР»Р°Р№|РїРѕРєР°Р¶Рё|draw|generate|create|make)\s+(РјРЅРµ\s+)?(РєР°СЂС‚РёРЅРєСѓ|РєР°СЂС‚РёРЅРє[Р°РµСѓ]|РёР·РѕР±СЂР°Р¶РµРЅРёРµ|С„РѕС‚Рѕ|СЂРёСЃСѓРЅРѕРє|image|picture|photo|РІРёРґРµРѕ|video|Р°РЅРёРјР°С†РёСЋ)\s*/i, '')
      .replace(/^(РєР°СЂС‚РёРЅРєСѓ|РёР·РѕР±СЂР°Р¶РµРЅРёРµ|С„РѕС‚Рѕ)\s+/i, '')
      .trim() || userMsg;

    const endpoint = isVidRequest ? '/api/generate-video' : '/api/generate-image';

    // РљР РРўРР§РќРћ: РїРѕРґРєР»СЋС‡Р°РµРј SSE Р”Рћ Р·Р°РїСЂРѕСЃР° РіРµРЅРµСЂР°С†РёРё
    _aiConnectSse();
    // Р”Р°С‘Рј SSE СѓСЃС‚Р°РЅРѕРІРёС‚СЊ СЃРѕРµРґРёРЅРµРЅРёРµ
    await new Promise(r => setTimeout(r, 300));

    try {
      const r = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, prompt, style: 'high quality, detailed, cinematic' })
      });
      const d = await r.json();

      if (d.error) {
        if (typing) typing.remove();
        _aiAddMessage('assistant', 'вљ пёЏ ' + d.error);
      } else if (d.pending) {
        // Р“РµРЅРµСЂР°С†РёСЏ РёРґС‘С‚ РІ С„РѕРЅРµ вЂ” typing РѕСЃС‚Р°РЅРµС‚СЃСЏ РґРѕ SSE СЃРѕР±С‹С‚РёСЏ media/done
        // typing СѓР±РёСЂР°РµС‚СЃСЏ РІ SSE РѕР±СЂР°Р±РѕС‚С‡РёРєРµ
      } else {
        if (typing) typing.remove();
        if (d.message) _aiAddMessage('assistant', d.message);
      }
    } catch {
      if (typing) typing.remove();
      _aiAddMessage('assistant', 'вљ пёЏ РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ СЃ СЃРµСЂРІРµСЂРѕРј.');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
    return;
  }
  // в”Ђв”Ђ РљРѕРЅРµС† РїРµСЂРµС…РІР°С‚Р° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  inp.value = '';
  autoGrow(inp);
  _aiAttachment = null;
  _aiUpdateAttachBar();
  _aiResetLiveLog();
  _aiStreamingStarted = false;
  _aiLastCreatedFiles = [];
  _aiShownFileIds.clear();
  document.getElementById('aiZipBar')?.remove();

  const sendBtn = $('aiSendBtn');
  if (sendBtn) sendBtn.disabled = true;

  _aiAddMessage('user', text, attach);
  const typing = _aiAddTyping();

  try {
    const body = { username: currentUser, message: text };
    if (attach?.type === 'image') {
      body.imageData = attach.data;
      body.imageType = attach.mimeType;
    } else if (attach?.type === 'file') {
      body.fileContent = attach.textContent || '';
      body.fileName    = attach.name;
    }

    body.model = document.getElementById('aiModelSelect')?.value || 'mistral';
    const r = await fetch('/api/ai-chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    // Typing СѓР±РёСЂР°РµС‚СЃСЏ С‡РµСЂРµР· SSE 'done' event, РЅРѕ РЅР° РІСЃСЏРєРёР№ СЃР»СѓС‡Р°Р№
    if (typing) typing.remove();

    if (d.success) {
      if (d.debugMode !== undefined) _aiSetDebugMode(d.debugMode);
      // Р’РѕРїСЂРѕСЃ РѕС‚ AI РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ
      if (d.askUser) {
        _aiShowQuestion(d.askUser);
        return;
      }
      // Р•СЃР»Рё РѕС‚РІРµС‚ СѓР¶Рµ РїСЂРёС€С‘Р» С‡РµСЂРµР· SSE streaming вЂ” _aiStreamBubble СѓР¶Рµ РіРѕС‚РѕРІ
      // Р•СЃР»Рё РЅРµС‚ SSE РєР»РёРµРЅС‚Р° вЂ” РґРѕР±Р°РІР»СЏРµРј РѕР±С‹С‡РЅРѕ
      // Р”РѕР±Р°РІР»СЏРµРј РѕС‚РІРµС‚ С‚РѕР»СЊРєРѕ РµСЃР»Рё SSE СЃС‚СЂРёРјРёРЅРі РЅРµ РЅР°С‡Р°Р»СЃСЏ
      if (d.reply && !_aiStreamingStarted) {
        _aiAddMessage('assistant', d.reply);
      }
      // Р¤Р°Р№Р»С‹
      if (d.createdFiles?.length) {
        d.createdFiles.forEach(f => _aiAddFileCard(f));
        if (_aiFilePanelOpen) aiRenderFilePanel();
        else aiRefreshFileBadge();
      }
      // Р›РѕРі РёРЅСЃС‚СЂСѓРјРµРЅС‚РѕРІ (fallback РµСЃР»Рё SSE РЅРµ Р±С‹Р»Рѕ)
      if (d.toolsUsed?.length && !_aiLiveLogWrap) _aiAddToolLog(d.toolsUsed);
      // РџРѕРєР°Р·С‹РІР°РµРј РєР°СЂС‚РѕС‡РєРё СЃРѕР·РґР°РЅРЅС‹С… С„Р°Р№Р»РѕРІ
      if (d.createdFiles?.length) {
        d.createdFiles.forEach(f => _aiAddFileCard(f));
        if (_aiFilePanelOpen) aiRenderFilePanel();
        else aiRefreshFileBadge();
      }
    } else {
      _aiAddMessage('assistant', 'вљ пёЏ ' + (d.error || 'РћС€РёР±РєР°. РџРѕРїСЂРѕР±СѓР№ РµС‰С‘ СЂР°Р·.'));
    }
  } catch {
    if (typing) typing.remove();
    _aiAddMessage('assistant', 'вљ пёЏ РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ СЃ СЃРµСЂРІРµСЂРѕРј.');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    inp.focus();
  }
}

// в”Ђв”Ђ AI Р¤Р°Р№Р»РѕРІР°СЏ Р±Р°Р·Р° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _aiFilePanelOpen = false;
let _aiEditingFile   = null; // { id, name, content }

function toggleAiFilePanel() {
  _aiFilePanelOpen ? closeAiFilePanel() : openAiFilePanel();
}

async function openAiFilePanel() {
  _aiFilePanelOpen = true;
  let panel = $('aiFilePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'aiFilePanel';
    panel.style.cssText = `
      position:absolute; right:0; top:0; bottom:0; width:260px;
      background:var(--surface); border-left:1px solid var(--border);
      display:flex; flex-direction:column; z-index:10;
      animation:slideRight .2s cubic-bezier(.16,1,.3,1);`;
    panel.innerHTML = `
      <div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <span style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px">
          <i class="ti ti-files" style="color:var(--accent)"></i> Р‘Р°Р·Р° С„Р°Р№Р»РѕРІ
        </span>
        <button class="icon-btn sm" onclick="closeAiFilePanel()"><i class="ti ti-x"></i></button>
      </div>
      <div id="aiFilePanelList" style="flex:1;overflow-y:auto;padding:8px"></div>
      <div style="padding:10px;border-top:1px solid var(--border);font-size:11px;color:var(--text3);text-align:center;flex-shrink:0">
        Р¤Р°Р№Р»С‹ С…СЂР°РЅСЏС‚СЃСЏ 5 РѕС‚РІРµС‚РѕРІ
      </div>`;
    const modal = $('aiChatModal')?.querySelector('.modal-card');
    if (modal) { modal.style.position = 'relative'; modal.style.overflow = 'hidden'; modal.appendChild(panel); }
  }
  panel.style.display = 'flex';
  await aiRenderFilePanel();
}

function closeAiFilePanel() {
  _aiFilePanelOpen = false;
  const panel = $('aiFilePanel');
  if (panel) panel.style.display = 'none';
}

async function aiRenderFilePanel() {
  const list = $('aiFilePanelList');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:12px"><i class="ti ti-loader" style="animation:spin 1s linear infinite"></i></div>';
  try {
    const r = await fetch(`/api/ai-files/${encodeURIComponent(currentUser)}`);
    const d = await r.json();
    const files = d.files || [];
    if (!files.length) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px"><i class="ti ti-file-off" style="font-size:28px;display:block;margin-bottom:6px;opacity:.3"></i>РќРµС‚ С„Р°Р№Р»РѕРІ</div>';
      return;
    }
    list.innerHTML = '';
    files.forEach(f => {
      const ext  = f.name.split('.').pop().toUpperCase();
      const item = document.createElement('div');
      item.style.cssText = 'padding:8px 10px;border-radius:10px;margin-bottom:4px;background:var(--surface2);border:1px solid var(--border);cursor:pointer;transition:background .15s;';
      item.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:8px">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--accent-dim);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:700;color:var(--accent)">${esc(ext.slice(0,4))}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(f.name)}">${esc(f.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${f.size} Р±Р°Р№С‚ В· РµС‰С‘ ${f.ttl} РѕС‚РІ.</div>
            ${f.description ? `<div style="font-size:11px;color:var(--text2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.description)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:4px;margin-top:6px">
          <a href="/api/ai-file/${encodeURIComponent(currentUser)}/${f.id}" download="${esc(f.name)}"
             style="flex:1;padding:4px 6px;background:var(--accent);color:#fff;border-radius:6px;font-size:11px;text-decoration:none;text-align:center" onclick="event.stopPropagation()">
            <i class="ti ti-download"></i> РЎРєР°С‡Р°С‚СЊ
          </a>
          <button onclick="aiEditFile('${f.id}','${esc(f.name).replace(/'/g,'\\\'')}')" style="padding:4px 8px;background:var(--surface3);border:1px solid var(--border);border-radius:6px;font-size:11px;cursor:pointer;color:var(--text)">
            <i class="ti ti-edit"></i>
          </button>
          <button onclick="aiDeleteFile('${f.id}')" style="padding:4px 8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:6px;font-size:11px;cursor:pointer;color:var(--danger)">
            <i class="ti ti-trash"></i>
          </button>
        </div>`;
      // Preview on hover
      if (f.preview) {
        item.title = f.preview;
      }
      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = '<div style="padding:12px;color:var(--danger);font-size:12px">РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё</div>';
  }
  aiRefreshFileBadge();
}

async function aiEditFile(fileId, fileName) {
  // Р—Р°РіСЂСѓР¶Р°РµРј СЃРѕРґРµСЂР¶РёРјРѕРµ С„Р°Р№Р»Р°
  try {
    const r = await fetch(`/api/ai-file/${encodeURIComponent(currentUser)}/${fileId}`);
    const content = await r.text();

    // РЎРѕР·РґР°С‘Рј СЂРµРґР°РєС‚РѕСЂ РїРѕРІРµСЂС… РїР°РЅРµР»Рё
    const ov = $('dialogOverlay');
    const box = $('dialogBox');
    if (!ov || !box) return;

    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px"><i class="ti ti-file-code" style="color:var(--accent)"></i> Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С„Р°Р№Р»</h3>
        <button class="icon-btn sm" onclick="$('dialogOverlay').classList.remove('open')"><i class="ti ti-x"></i></button>
      </div>
      <div class="field-wrap" style="margin-bottom:10px">
        <i class="ti ti-file field-ico"></i>
        <input id="aiEditName" class="field" type="text" value="${esc(fileName)}" placeholder="РРјСЏ С„Р°Р№Р»Р°" maxlength="80"/>
      </div>
      <textarea id="aiEditContent" style="width:100%;height:300px;background:var(--surface3);color:var(--text);border:1.5px solid var(--border);border-radius:12px;padding:12px;font-family:monospace;font-size:12px;outline:none;resize:vertical;line-height:1.5" spellcheck="false">${esc(content)}</textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-secondary" style="flex:1" onclick="$('dialogOverlay').classList.remove('open')">РћС‚РјРµРЅР°</button>
        <button class="btn-primary" style="flex:2" onclick="aiSaveEdit('${fileId}')"><i class="ti ti-check"></i> РЎРѕС…СЂР°РЅРёС‚СЊ</button>
      </div>`;

    ov.classList.add('open');
  } catch { toast('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё С„Р°Р№Р»Р°', 'error'); }
}

async function aiSaveEdit(fileId) {
  const name    = $('aiEditName')?.value?.trim();
  const content = $('aiEditContent')?.value;
  if (!name) { toast('Р’РІРµРґРёС‚Рµ РёРјСЏ С„Р°Р№Р»Р°', 'warning'); return; }
  try {
    const r = await fetch('/api/ai-file-edit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, fileId, content, name })
    });
    const d = await r.json();
    if (d.success) {
      $('dialogOverlay').classList.remove('open');
      toast('Р¤Р°Р№Р» СЃРѕС…СЂР°РЅС‘РЅ', 'success');
      aiRenderFilePanel();
    } else { toast(d.error || 'РћС€РёР±РєР°', 'error'); }
  } catch { toast('РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ', 'error'); }
}

async function aiDeleteFile(fileId) {
  const ok = await dialog({ icon:'ti-trash', iconType:'error', title:'РЈРґР°Р»РёС‚СЊ С„Р°Р№Р»?', msg:'Р¤Р°Р№Р» Р±СѓРґРµС‚ СѓРґР°Р»С‘РЅ РёР· Р±Р°Р·С‹ AI.', ok:'РЈРґР°Р»РёС‚СЊ', cancel:'РћС‚РјРµРЅР°', danger:true });
  if (!ok) return;
  try {
    await fetch('/api/ai-file-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, fileId })
    });
    aiRenderFilePanel();
    toast('Р¤Р°Р№Р» СѓРґР°Р»С‘РЅ', 'info');
  } catch { toast('РћС€РёР±РєР°', 'error'); }
}

// в”Ђв”Ђ Debug mode handling в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function _aiSetDebugMode(active) {
  _aiDebugMode = active;
  const indicator = $('aiDebugIndicator');
  if (indicator) {
    indicator.style.display = active ? 'flex' : 'none';
    indicator.innerHTML = active ? '<i class="ti ti-bug" style="font-size:11px"></i> DEBUG' : '';
  }
  const hd = $('aiChatModal')?.querySelector('.modal-hd h2');
  if (hd) {
    hd.innerHTML = active
      ? '<i class="ti ti-robot"></i> Aura AI <span style="font-size:10px;background:var(--danger);color:#fff;padding:2px 7px;border-radius:99px;margin-left:4px">DEBUG</span>'
      : '<i class="ti ti-robot"></i> Aura AI';
  }
}

async function aiClearHistory() {
  try {
    await fetch('/api/ai-clear', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser })
    });
  } catch {}
  _aiAttachment = null;
  _aiUpdateAttachBar();
  const msgs = $('aiMessages');
  if (msgs) msgs.innerHTML = `
    <div class="ai-welcome">
      <i class="ti ti-robot" style="font-size:36px;color:var(--accent);display:block;text-align:center;margin-bottom:8px"></i>
      <p style="text-align:center;color:var(--text2);font-size:14px">РСЃС‚РѕСЂРёСЏ РѕС‡РёС‰РµРЅР°. Р§РµРј РјРѕРіСѓ РїРѕРјРѕС‡СЊ?</p>
    </div>`;
  toast('РСЃС‚РѕСЂРёСЏ РѕС‡РёС‰РµРЅР°', 'info');
}

async function resendEmailVerify() {
  const email = $('stRecoveryEmail')?.value?.trim() || userData.recoveryEmail;
  if (!email) { toast('Р’РІРµРґРёС‚Рµ email СЃРЅР°С‡Р°Р»Р°', 'warning'); return; }
  const btn = document.querySelector('#emailVerifyModal .btn-ghost');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>'; }
  try {
    const r = await fetch('/api/update-recovery-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, email })
    });
    const d = await r.json();
    if (d.success) toast('РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РїРѕРІС‚РѕСЂРЅРѕ', 'info');
    else toast(d.error || 'РћС€РёР±РєР°', 'error');
  } catch { toast('РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ', 'error'); }
  finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-refresh"></i> РћС‚РїСЂР°РІРёС‚СЊ СЃРЅРѕРІР°'; }
  }
}

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
    toast('РџСЂРѕС„РёР»СЊ РѕР±РЅРѕРІР»С‘РЅ', 'success');
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
    toast('РђРІР°С‚Р°СЂ РѕР±РЅРѕРІР»С‘РЅ', 'success');
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
    ms.innerHTML = '<option value="default">РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ</option>';
    mics.forEach(d => { const o = new Option(d.label || `РњРёРєСЂРѕС„РѕРЅ`, d.deviceId); if (d.deviceId === savMic) o.selected = true; ms.appendChild(o); });
    if (typeof HTMLMediaElement.prototype.setSinkId === 'function' && spks.length) {
      ss.innerHTML = '<option value="default">РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ</option>';
      spks.forEach(d => { const o = new Option(d.label || `Р”РёРЅР°РјРёРє`, d.deviceId); if (d.deviceId === savSpk) o.selected = true; ss.appendChild(o); });
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
  out.textContent = 'рџЋ™пёЏ Р“РѕРІРѕСЂРёС‚Рµ (2 СЃРµРє)вЂ¦';
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
      out.textContent = max > 5 ? `вњ… РЈСЂРѕРІРµРЅСЊ: ${Math.round(max)} / 255` : 'вљ пёЏ Р—РІСѓРє РЅРµ РѕР±РЅР°СЂСѓР¶РµРЅ';
      out.style.color = max > 5 ? 'var(--success)' : 'var(--warn)';
    }, 2000);
  } catch (e) { out.textContent = 'вќЊ ' + e.message; out.style.color = 'var(--danger)'; }
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
  // Apply instantly вЂ” no separate button needed
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('aura_theme', t);
  userData.theme = t;
  fetch('/api/update-profile', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser, theme: t })
  }).catch(() => {});
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
  toast('РўРµРјР° СЃРѕС…СЂР°РЅРµРЅР°', 'success');
}

// Account
async function deleteAccount() {
  const ok = await dialog({ icon:'ti-trash', iconType:'error', title:'РЈРґР°Р»РёС‚СЊ Р°РєРєР°СѓРЅС‚?', msg:'Р’СЃРµ РґР°РЅРЅС‹Рµ Р±СѓРґСѓС‚ СѓРґР°Р»РµРЅС‹ Р±РµР· РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ.', ok:'РЈРґР°Р»РёС‚СЊ', cancel:'РћС‚РјРµРЅР°', danger:true });
  if (!ok) return;
  await fetch('/api/delete-account', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser })
  });
  localStorage.clear();
  location.reload();
}


// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
//  CALLS вЂ” WebRTC + Socket.IO (clean rewrite)
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// ICE / TURN вЂ” СЂР°СЃС€РёСЂРµРЅРЅС‹Р№ СЃРїРёСЃРѕРє СЃРµСЂРІРµСЂРѕРІ РґР»СЏ СЂР°Р±РѕС‚С‹ Р·Р° NAT/firewall
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const ICE_SERVERS_STATIC = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'stun:stun.global.twilio.com:3478' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun.nextcloud.com:443' },
  // openrelay вЂ” РІСЃРµ С‚СЂР°РЅСЃРїРѕСЂС‚С‹
  { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:3478',              username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443',              username: 'openrelayproject', credential: 'openrelayproject' },
  // freeturn
  { urls: 'turn:freeturn.net:3478',                      username: 'free', credential: 'free' },
  { urls: 'turn:freeturn.net:5349?transport=tcp',        username: 'free', credential: 'free' },
  { urls: 'turns:freeturn.tel:5349',                     username: 'free', credential: 'free' },
  // numb
  { urls: 'turn:numb.viagenie.ca',                       username: 'webrtc@live.com', credential: 'muazkh' },
  { urls: 'turn:numb.viagenie.ca?transport=tcp',         username: 'webrtc@live.com', credential: 'muazkh' },
  // expressrturn
  { urls: 'turn:turn.anyfirewall.com:443?transport=tcp', username: 'webrtc', credential: 'webrtc' },
  // relay.webwormhole.it
  { urls: 'stun:stun.webwormhole.it:3478' },
  // Additional Google STUN
  { urls: 'stun:stun.services.mozilla.com' },
  { urls: 'stun:stun.sipgate.net' },
  { urls: 'stun:stun.voipstunt.com' },
];

let ICE_SERVERS = ICE_SERVERS_STATIC; // Р±СѓРґРµС‚ РѕР±РЅРѕРІР»С‘РЅ РЅРёР¶Рµ РµСЃР»Рё РµСЃС‚СЊ API РєР»СЋС‡

// в”Ђв”Ђ Р•СЃР»Рё Р·Р°РґР°РЅ METERED_API_KEY РІ .env вЂ” РїРѕР»СѓС‡Р°РµРј РІСЂРµРјРµРЅРЅС‹Рµ TURN credentials в”Ђв”Ђ
// Р”Р»СЏ СЌС‚РѕРіРѕ РІ server.js РґРѕР±Р°РІСЊС‚Рµ СЌРЅРґРїРѕРёРЅС‚ /api/ice-servers (СѓР¶Рµ РґРѕР±Р°РІР»РµРЅРѕ РІ server.js)
async function fetchIceServers() {
  try {
    const r = await fetch('/api/ice-servers', { method: 'GET' });
    if (!r.ok) return;
    const data = await r.json();
    if (Array.isArray(data) && data.length > 0) {
      ICE_SERVERS = data;
      console.log('[ICE] РџРѕР»СѓС‡РµРЅС‹ РґРёРЅР°РјРёС‡РµСЃРєРёРµ TURN СЃРµСЂРІРµСЂС‹:', data.length);
    }
  } catch (e) {
    console.log('[ICE] РСЃРїРѕР»СЊР·СѓРµРј СЃС‚Р°С‚РёС‡РЅС‹Рµ TURN СЃРµСЂРІРµСЂС‹');
  }
}
// Р—Р°РіСЂСѓР¶Р°РµРј ICE СЃРµСЂРІРµСЂС‹ РїСЂРё СЃС‚Р°СЂС‚Рµ (РЅРµ Р±Р»РѕРєРёСЂСѓРµС‚ UI)
fetchIceServers();

// State
let rtcPeer      = null;
let _callTarget  = null;
let _callRoom    = null; // РєРѕРјРЅР°С‚Р° РіРґРµ РЅР°С‡Р°Р»СЃСЏ Р·РІРѕРЅРѕРє
let _callIsVid   = false;
let _isCaller    = false;
let _inCall      = false;  // true from invite until cleanup
let _connected   = false;  // true once ICE connected
let _muted       = false;
let _screenSharing = false;
let screenStream = null;
let _partnerSharing = false; // РїР°СЂС‚РЅС‘СЂ С‚РѕР¶Рµ С€Р°СЂРёС‚ СЌРєСЂР°РЅ
let _groupCall   = false;   // true if in a group call
let _groupMembers = [];      // members in group call
let groupPeers   = new Map(); // member -> RTCPeerConnection

// DOM
let callModal, callAva, callNm, callSt, callAct;
function initCallDOM() {
  callModal = $('callModal');
  callAva   = $('callAvatar');
  callNm    = $('callName');
  callSt    = $('callStatus');
  callAct   = $('callActions');
}

// в”Ђв”Ђ HELPERS в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function callTarget() {
  if (!currentRoom) return null;
  if (currentRoom.startsWith('private:')) {
    return currentRoom.split(':').slice(1).find(p => p !== currentUser) || null;
  }
  if (currentRoom.startsWith('group:')) {
    const g = groups.find(g => g.id === currentRoom.replace('group:', ''));
    if (!g) return null;
    return { type: 'group', groupId: g.id, name: g.name, members: g.members.filter(m => m !== currentUser) };
  }
  return null;
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

// в”Ђв”Ђ OUTGOING в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// USER PROFILE MODAL
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// GROUP PROFILE MODAL
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
function openGroupProfile(g) {
  let modal = document.getElementById('groupProfileModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'groupProfileModal';
    modal.className = 'user-profile-modal-bg';
    modal.onclick = (e) => { if (e.target === modal) closeGroupProfile(); };
    document.body.appendChild(modal);
  }

  // Collect media from ALL messages in this group
  const msgs = document.getElementById('messages');
  const images = [], videos = [], files = [];
  if (msgs) {
    msgs.querySelectorAll('.msg-row').forEach(row => {
      row.querySelectorAll('.msg-img').forEach(img => {
        if (img.src) images.push(img.src);
      });
      row.querySelectorAll('.msg-video, .msg-square').forEach(v => {
        const src = v.src || v.getAttribute('src');
        if (src && !src.startsWith('blob:') && src !== window.location.href) videos.push(src);
      });
      row.querySelectorAll('.msg-file').forEach(a => {
        const name = a.querySelector('.msg-file-name')?.textContent || 'Р¤Р°Р№Р»';
        if (a.href) files.push({ href: a.href, name });
      });
    });
  }

  const members = g.members || [];
  const membersHtml = `
    <div class="upm-members-list">
      ${members.map(m => {
        const mNick = userNicknames[m] || m;
        const mAv   = userAvatars[m];
        const mOn   = onlineUsersSet.has(m);
        const avEl  = mAv
          ? `<div class="upm-member-ava" style="background-image:url('${mAv}');background-size:cover;background-position:center;cursor:pointer" onclick="viewMedia('${mAv}','image')"></div>`
          : `<div class="upm-member-ava" style="background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:15px">${mNick[0].toUpperCase()}</div>`;
        return `<div class="upm-member-row">
          <div style="position:relative;flex-shrink:0">
            ${avEl}
            <span class="upm-member-dot ${mOn ? 'upm-member-dot-on' : ''}"></span>
          </div>
          <div class="upm-member-info">
            <div class="upm-member-name">${esc(mNick)}</div>
            <div class="upm-member-status">${mOn ? 'Р’ СЃРµС‚Рё' : 'РќРµ РІ СЃРµС‚Рё'}</div>
          </div>
          ${m === g.creator ? '<span class="upm-creator-badge">СЃРѕР·РґР°С‚РµР»СЊ</span>' : ''}
        </div>`;
      }).join('')}
    </div>`;

  const imgGrid = images.length
    ? `<div class="upm-media-grid">${images.map(src =>
        `<div class="upm-media-item" onclick="viewMedia('${src.replace(/'/g,'')}','image')"><img src="${src}" loading="lazy"></div>`).join('')}</div>`
    : `<div class="upm-empty"><i class="ti ti-photo-off"></i><span>РќРµС‚ С„РѕС‚Рѕ</span></div>`;

  const vidGrid = videos.length
    ? `<div class="upm-media-grid">${videos.map(src =>
        `<div class="upm-media-item upm-vid" onclick="viewMedia('${src.replace(/'/g,'')}','video')">
          <video src="${src}" muted preload="metadata"></video>
          <div class="upm-play-ico"><i class="ti ti-player-play-filled"></i></div>
        </div>`).join('')}</div>`
    : `<div class="upm-empty"><i class="ti ti-video-off"></i><span>РќРµС‚ РІРёРґРµРѕ</span></div>`;

  const fileList = files.length
    ? `<div class="upm-file-list">${files.map(f =>
        `<a class="upm-file-row" href="${f.href}" target="_blank" download>
          <i class="ti ti-file"></i>
          <span class="upm-file-name">${esc(f.name)}</span>
          <i class="ti ti-download" style="margin-left:auto;color:var(--text3)"></i>
        </a>`).join('')}</div>`
    : `<div class="upm-empty"><i class="ti ti-files-off"></i><span>РќРµС‚ С„Р°Р№Р»РѕРІ</span></div>`;

  // Group avatar
  let grpAvHtml;
  if (g.avatar) {
    grpAvHtml = `<div class="upm-avatar" style="background-image:url('${g.avatar}');background-size:cover;background-position:center;border-radius:20px;cursor:pointer" onclick="viewMedia('${g.avatar}','image')"></div>`;
  } else {
    grpAvHtml = `<div class="upm-avatar" style="background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:32px;color:#fff"><i class="ti ti-users"></i></div>`;
  }

  modal.innerHTML = `
    <div class="user-profile-modal">
      <button class="upm-close" onclick="closeGroupProfile()"><i class="ti ti-x"></i></button>
      ${grpAvHtml}
      <div class="upm-name">${esc(g.name || 'Р“СЂСѓРїРїР°')}</div>
      <div class="upm-username">${members.length} СѓС‡Р°СЃС‚РЅРёРєРѕРІ</div>
      ${g.creator === currentUser ? `
      <button class="upm-delete-chat-btn" onclick="confirmClearGroup('${esc(g.id)}','${esc(g.name||'')}')">
        <i class="ti ti-trash"></i> РћС‡РёСЃС‚РёС‚СЊ РёСЃС‚РѕСЂРёСЋ РіСЂСѓРїРїС‹
      </button>` : ''}

      <div class="upm-tabs">
        <button class="upm-tab active" onclick="upmGTab(this,'ugm-members')"><i class="ti ti-users"></i> РЈС‡Р°СЃС‚РЅРёРєРё</button>
        <button class="upm-tab" onclick="upmGTab(this,'ugm-photos')"><i class="ti ti-photo"></i> Р¤РѕС‚Рѕ</button>
        <button class="upm-tab" onclick="upmGTab(this,'ugm-videos')"><i class="ti ti-video"></i> Р’РёРґРµРѕ</button>
        <button class="upm-tab" onclick="upmGTab(this,'ugm-files')"><i class="ti ti-files"></i> Р¤Р°Р№Р»С‹</button>
      </div>
      <div id="ugm-members" class="upm-pane">${membersHtml}</div>
      <div id="ugm-photos"  class="upm-pane" style="display:none">${imgGrid}</div>
      <div id="ugm-videos"  class="upm-pane" style="display:none">${vidGrid}</div>
      <div id="ugm-files"   class="upm-pane" style="display:none">${fileList}</div>
    </div>`;

  modal.classList.add('open');
}


async function confirmClearGroup(groupId, groupName) {
  closeGroupProfile();
  const ok = await dialog({
    icon: 'ti-trash', iconType: 'error',
    title: 'РћС‡РёСЃС‚РёС‚СЊ РёСЃС‚РѕСЂРёСЋ РіСЂСѓРїРїС‹?',
    msg: `Р’СЃРµ СЃРѕРѕР±С‰РµРЅРёСЏ РІ РіСЂСѓРїРїРµ В«${esc(groupName)}В» Р±СѓРґСѓС‚ СѓРґР°Р»РµРЅС‹ Сѓ РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ. Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.`,
    ok: 'РћС‡РёСЃС‚РёС‚СЊ', cancel: 'РћС‚РјРµРЅР°', danger: true
  });
  if (!ok) return;
  try {
    const r = await fetch('/api/clear-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, username: currentUser })
    });
    const d = await r.json();
    if (!d.success) toast(d.error || 'РћС€РёР±РєР°', 'error');
    else toast('РСЃС‚РѕСЂРёСЏ РіСЂСѓРїРїС‹ РѕС‡РёС‰РµРЅР°', 'success', 2500);
  } catch { toast('РћС€РёР±РєР° СЃРѕРµРґРёРЅРµРЅРёСЏ', 'error'); }
}

function closeGroupProfile() {
  document.getElementById('groupProfileModal')?.classList.remove('open');
}

function upmGTab(btn, paneId) {
  const modal = btn.closest('.user-profile-modal');
  modal.querySelectorAll('.upm-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  modal.querySelectorAll('.upm-pane').forEach(p => p.style.display = 'none');
  document.getElementById(paneId).style.display = '';
}


async function confirmDeleteChat() {
  const ok = await dialog({
    icon: 'ti-trash', iconType: 'error',
    title: 'Р’С‹ С‚РѕС‡РЅРѕ С…РѕС‚РёС‚Рµ СѓРґР°Р»РёС‚СЊ РІСЃСЋ РїРµСЂРµРїРёСЃРєСѓ?',
    msg: 'РџРµСЂРµРїРёСЃРєР° СѓРґР°Р»РёС‚СЃСЏ С‚РѕР»СЊРєРѕ Сѓ РІР°СЃ. Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ Р±СѓРґРµС‚ РѕС‚РјРµРЅРёС‚СЊ.',
    ok: 'РЈРґР°Р»РёС‚СЊ', cancel: 'РћС‚РјРµРЅР°', danger: true
  });
  if (!ok) return;

  // РЎРєСЂС‹РІР°РµРј РІСЃРµ СЃРѕРѕР±С‰РµРЅРёСЏ Р»РѕРєР°Р»СЊРЅРѕ
  const msgs = document.getElementById('messages');
  if (msgs) {
    const ids = [...msgs.querySelectorAll('[data-id]')].map(r => r.dataset.id);
    try {
      const key = 'aura_hidden:' + (currentRoom || 'all');
      const hidden = JSON.parse(localStorage.getItem(key) || '[]');
      const newHidden = [...new Set([...hidden, ...ids])].slice(-2000);
      localStorage.setItem(key, JSON.stringify(newHidden));
    } catch {}
    msgs.innerHTML = '';
    _lastMsgDate = null; // СЃР±СЂР°СЃС‹РІР°РµРј РґР°С‚Сѓ С‡С‚РѕР±С‹ СЃР»РµРґСѓСЋС‰РµРµ СЃРѕРѕР±С‰РµРЅРёРµ РїРѕР»СѓС‡РёР»Рѕ СЂР°Р·РґРµР»РёС‚РµР»СЊ
    if (msgsEmpty) msgsEmpty.style.display = '';
  }
  toast('РџРµСЂРµРїРёСЃРєР° СѓРґР°Р»РµРЅР° Сѓ РІР°СЃ', 'success', 2500);
}

function openUserProfile(username) {
  const nick = userNicknames[username] || username;
  const av   = userAvatars[username];
  const isOn = onlineUsersSet.has(username);

  let modal = document.getElementById('userProfileModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'userProfileModal';
    modal.className = 'user-profile-modal-bg';
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };
    document.body.appendChild(modal);
  }

  // РЎРѕР±РёСЂР°РµРј РјРµРґРёР° РћР‘РћРРҐ СЃС‚РѕСЂРѕРЅ РёР· DOM
  const msgs = document.getElementById('messages');
  const images = [], videos = [], files = [];
  if (msgs) {
    // Р’СЃРµ СЃС‚СЂРѕРєРё (own + not own)
    msgs.querySelectorAll('.msg-row').forEach(row => {
      // Р¤РѕС‚Рѕ
      row.querySelectorAll('.msg-img').forEach(img => {
        if (img.src) images.push(img.src);
      });
      // Р’РёРґРµРѕ (РѕР±С‹С‡РЅРѕРµ + РєРІР°РґСЂР°С‚РЅРѕРµ)
      row.querySelectorAll('.msg-video, .msg-square').forEach(v => {
        const src = v.src || v.getAttribute('src');
        if (src && !src.startsWith('blob:') && src !== window.location.href) videos.push(src);
      });
      // Р¤Р°Р№Р»С‹
      row.querySelectorAll('.msg-file').forEach(a => {
        const name = a.querySelector('.msg-file-name')?.textContent || 'Р¤Р°Р№Р»';
        if (a.href) files.push({ href: a.href, name });
      });
    });
  }

  const imgGrid = images.length
    ? `<div class="upm-media-grid">${images.map(src =>
        `<div class="upm-media-item" onclick="viewMedia('${src.replace(/'/g,'')}','image')">
          <img src="${src}" loading="lazy">
        </div>`).join('')}</div>`
    : `<div class="upm-empty"><i class="ti ti-photo-off"></i><span>РќРµС‚ С„РѕС‚Рѕ</span></div>`;

  const vidGrid = videos.length
    ? `<div class="upm-media-grid">${videos.map(src =>
        `<div class="upm-media-item upm-vid" onclick="viewMedia('${src.replace(/'/g,'')}','video')">
          <video src="${src}" muted preload="metadata"></video>
          <div class="upm-play-ico"><i class="ti ti-player-play-filled"></i></div>
        </div>`).join('')}</div>`
    : `<div class="upm-empty"><i class="ti ti-video-off"></i><span>РќРµС‚ РІРёРґРµРѕ</span></div>`;

  const fileList = files.length
    ? `<div class="upm-file-list">${files.map(f =>
        `<a class="upm-file-row" href="${f.href}" target="_blank" download>
          <i class="ti ti-file"></i>
          <span class="upm-file-name">${esc(f.name)}</span>
          <i class="ti ti-download" style="margin-left:auto;color:var(--text3)"></i>
        </a>`).join('')}</div>`
    : `<div class="upm-empty"><i class="ti ti-files-off"></i><span>РќРµС‚ С„Р°Р№Р»РѕРІ</span></div>`;

  const avHtml = av
    ? `<div class="upm-avatar" style="background-image:url('${av}');background-size:cover;background-position:center;cursor:pointer" onclick="viewMedia('${av}','image')"></div>`
    : `<div class="upm-avatar" style="background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#fff">${nick[0].toUpperCase()}</div>`;

  modal.innerHTML = `
    <div class="user-profile-modal">
      <button class="upm-close" onclick="document.getElementById('userProfileModal').classList.remove('open')">
        <i class="ti ti-x"></i>
      </button>
      ${avHtml}
      <div class="upm-name">${esc(nick)}</div>
      <div class="upm-username">@${esc(username)}</div>
      <div class="upm-status ${isOn ? 'upm-online' : ''}">${isOn ? 'в—Џ Р’ СЃРµС‚Рё' : 'в—Џ РќРµ РІ СЃРµС‚Рё'}</div>
      <button class="upm-delete-chat-btn" onclick="confirmDeleteChat()">
        <i class="ti ti-trash"></i> РЈРґР°Р»РёС‚СЊ РїРµСЂРµРїРёСЃРєСѓ
      </button>
      <div class="upm-tabs">
        <button class="upm-tab active" onclick="upmTab(this,'upm-photos')"><i class="ti ti-photo"></i> Р¤РѕС‚Рѕ</button>
        <button class="upm-tab" onclick="upmTab(this,'upm-videos')"><i class="ti ti-video"></i> Р’РёРґРµРѕ</button>
        <button class="upm-tab" onclick="upmTab(this,'upm-files')"><i class="ti ti-files"></i> Р¤Р°Р№Р»С‹</button>
      </div>
      <div id="upm-photos" class="upm-pane">${imgGrid}</div>
      <div id="upm-videos" class="upm-pane" style="display:none">${vidGrid}</div>
      <div id="upm-files"  class="upm-pane" style="display:none">${fileList}</div>
    </div>`;

  modal.classList.add('open');
}

function upmTab(btn, paneId) {
  btn.closest('.user-profile-modal').querySelectorAll('.upm-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  btn.closest('.user-profile-modal').querySelectorAll('.upm-pane').forEach(p => p.style.display = 'none');
  document.getElementById(paneId).style.display = '';
}

// в”Ђв”Ђ Wake Lock: РЅРµ РґР°С‘Рј СѓСЃС‚СЂРѕР№СЃС‚РІСѓ СЃРїР°С‚СЊ РІРѕ РІСЂРµРјСЏ Р·РІРѕРЅРєР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _wakeLock = null;
async function _acquireWakeLock() {
  try {
    if ('wakeLock' in navigator && !_wakeLock) {
      _wakeLock = await navigator.wakeLock.request('screen');
      _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    }
  } catch(e) { /* РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ вЂ” РёРіРЅРѕСЂРёСЂСѓРµРј */ }
}
function _releaseWakeLock() {
  if (_wakeLock) { _wakeLock.release(); _wakeLock = null; }
}


// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// CALL SOUNDS вЂ” Web Audio API (Р±РµР· С„Р°Р№Р»РѕРІ)
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// в”Ђв”Ђ Audio system в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _audioCtx = null;
let _audioReady = false;

function _getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

// РџСЂРѕРіСЂРµРІР°РµРј AudioContext РїСЂРё РїРµСЂРІРѕРј РєР°СЃР°РЅРёРё/РєР»РёРєРµ вЂ” СѓР±РёСЂР°РµС‚ Р·Р°РґРµСЂР¶РєСѓ
function _warmAudio() {
  if (_audioReady) return;
  try {
    const ctx = _getAudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => { _audioReady = true; });
    } else {
      _audioReady = true;
    }
    // РўРёС…РёР№ РїСѓСЃС‚РѕР№ Р±СѓС„РµСЂ вЂ” Р°РєС‚РёРІРёСЂСѓРµС‚ РєРѕРЅС‚РµРєСЃС‚
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {}
}
// Р’РµС€Р°РµРј РЅР° РїРµСЂРІРѕРµ РІР·Р°РёРјРѕРґРµР№СЃС‚РІРёРµ
['touchstart','mousedown','keydown'].forEach(ev =>
  document.addEventListener(ev, _warmAudio, { once: true, passive: true })
);


// в”Ђв”Ђ Custom notification sound в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _notifAudio = null; // РєР°СЃС‚РѕРјРЅС‹Р№ Audio РѕР±СЉРµРєС‚

function _loadNotifSound() {
  const data = localStorage.getItem('aura_notif_sound');
  if (data) {
    _notifAudio = new Audio(data);
    _notifAudio.volume = 1.0;
  } else {
    _notifAudio = null;
  }
}
_loadNotifSound(); // Р·Р°РіСЂСѓР¶Р°РµРј РїСЂРё СЃС‚Р°СЂС‚Рµ

function uploadNotifSound(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    toast('Р¤Р°Р№Р» СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№ (РјР°РєСЃ 2 РњР‘)', 'error'); return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      localStorage.setItem('aura_notif_sound', e.target.result);
      _loadNotifSound();
      // РћР±РЅРѕРІР»СЏРµРј UI
      const nameEl = document.getElementById('notifSoundName');
      const resetBtn = document.getElementById('notifSoundResetBtn');
      if (nameEl) nameEl.textContent = file.name;
      if (resetBtn) resetBtn.style.display = '';
      toast('Р—РІСѓРє СѓРІРµРґРѕРјР»РµРЅРёСЏ Р·Р°РіСЂСѓР¶РµРЅ', 'success', 2000);
    } catch(err) {
      toast('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ Р·РІСѓРє (РІРѕР·РјРѕР¶РЅРѕ РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РјРµСЃС‚Р°)', 'error');
    }
  };
  reader.readAsDataURL(file);
  input.value = ''; // СЃР±СЂРѕСЃ input С‡С‚РѕР±С‹ РјРѕР¶РЅРѕ Р±С‹Р»Рѕ Р·Р°РіСЂСѓР·РёС‚СЊ С‚РѕС‚ Р¶Рµ С„Р°Р№Р»
}

function resetNotifSound() {
  localStorage.removeItem('aura_notif_sound');
  _loadNotifSound();
  const nameEl = document.getElementById('notifSoundName');
  const resetBtn = document.getElementById('notifSoundResetBtn');
  if (nameEl) nameEl.textContent = 'РЎС‚Р°РЅРґР°СЂС‚РЅС‹Р№ Р·РІСѓРє';
  if (resetBtn) resetBtn.style.display = 'none';
  toast('РЎС‚Р°РЅРґР°СЂС‚РЅС‹Р№ Р·РІСѓРє РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅ', 'info', 1500);
}

function previewNotifSound() {
  playNotifSound();
}

function playNotifSound() {
  if (_notifAudio) {
    // Р’РѕСЃРїСЂРѕРёР·РІРѕРґРёРј РєР°СЃС‚РѕРјРЅС‹Р№ Р·РІСѓРє
    _notifAudio.currentTime = 0;
    _notifAudio.play().catch(() => {
      // Р•СЃР»Рё РЅРµ СѓРґР°Р»РѕСЃСЊ вЂ” РїР°РґР°РµРј РЅР° СЃС‚Р°РЅРґР°СЂС‚РЅС‹Р№
      playCallSound('message');
    });
  } else {
    playCallSound('message');
  }
}

function playCallSound(type) {
  try {
    const ctx = _getAudioCtx();
    // Р•СЃР»Рё suspended вЂ” resume Рё РёРіСЂР°РµРј С‡РµСЂРµР· 50РјСЃ (РјРёРЅРёРјР°Р»СЊРЅР°СЏ Р·Р°РґРµСЂР¶РєР°)
    const doPlay = () => {
      const now = ctx.currentTime;
      // РљРѕРјРїСЂРµСЃСЃРѕСЂ РґР»СЏ РіСЂРѕРјРєРѕСЃС‚Рё Рё С‡С‘С‚РєРѕСЃС‚Рё
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 6;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.1;
      comp.connect(ctx.destination);

      const tone = (freq, t, dur, vol, type = 'sine') => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(comp);
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, now + t);
        g.gain.linearRampToValueAtTime(vol, now + t + 0.008); // Р±С‹СЃС‚СЂР°СЏ Р°С‚Р°РєР°
        g.gain.setValueAtTime(vol, now + t + dur * 0.7);
        g.gain.linearRampToValueAtTime(0, now + t + dur);
        o.start(now + t);
        o.stop(now + t + dur + 0.01);
      };

      if (type === 'message') {
        // Telegram-style: РґРІР° Р±С‹СЃС‚СЂС‹С… С‚РѕРЅР°, РіСЂРѕРјРєРѕ Рё С‡С‘С‚РєРѕ
        tone(1318, 0,     0.07, 0.55, 'sine'); // E6
        tone(1047, 0.075, 0.10, 0.45, 'sine'); // C6
      } else if (type === 'connect') {
        // РўСЂРё РІРѕСЃС…РѕРґСЏС‰РёС… С‚РѕРЅР° вЂ” РїРѕРґРєР»СЋС‡РµРЅРёРµ
        tone(523, 0,    0.09, 0.4); // C5
        tone(659, 0.1,  0.09, 0.4); // E5
        tone(784, 0.2,  0.13, 0.5); // G5
      } else if (type === 'end') {
        // Р”РІР° РЅРёСЃС…РѕРґСЏС‰РёС… вЂ” Р·Р°РІРµСЂС€РµРЅРёРµ
        tone(523, 0,    0.10, 0.4); // C5
        tone(392, 0.12, 0.16, 0.35); // G4
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(doPlay);
    } else {
      doPlay();
    }
  } catch(e) {}
}

async function startCall(isVid) {
  const target = callTarget();
  if (!target) { toast('РћС‚РєСЂРѕР№ С‡Р°С‚ РґР»СЏ Р·РІРѕРЅРєР°', 'warning'); return; }
  if (_inCall)  { toast('Р—РІРѕРЅРѕРє СѓР¶Рµ РёРґС‘С‚', 'warning'); return; }

  const vidConstraints = isVid ? {
    width:       { ideal: 1280, max: 1920 },
    height:      { ideal: 720,  max: 1080 },
    frameRate:   { ideal: 30,   max: 60   },
    facingMode:  'user',
  } : false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: vidConstraints });
    localStream  = stream;
    _callIsVid   = isVid;
    _isCaller    = true;
    _inCall      = true;
    _connected   = false;

    if (typeof target === 'object' && target.type === 'group') {
      // GROUP CALL
      _groupCall = true;
      _groupMembers = target.members;
      _callTarget = target.name;
      if (target.members.length === 0) { toast('Р’ РіСЂСѓРїРїРµ РЅРµС‚ СѓС‡Р°СЃС‚РЅРёРєРѕРІ', 'warning'); _cleanup(); return; }
      // Create peer connections for each member
      _showGroupCallUI(target.name, target.members);
      ringBeep(); // РіСѓРґРѕРє Сѓ Р·РІРѕРЅСЏС‰РµРіРѕ РІ РіСЂСѓРїРїРµ
      // Initiate call with each member sequentially
      for (const member of target.members) {
        await _initiateGroupPeer(member);
      }
    } else {
      // PRIVATE CALL
      _callTarget  = target;
      _callRoom    = currentRoom; // Р·Р°РїРѕРјРёРЅР°РµРј РєРѕРјРЅР°С‚Сѓ РіРґРµ РЅР°С‡Р°Р»СЃСЏ Р·РІРѕРЅРѕРє
      _groupCall = false;
      _groupMembers = [];
      socket.emit('call-invite', { to: target, from: currentUser, isVid });
      _showOutgoingUI(target, isVid);
      // РђРІС‚Рѕ-СЃР±СЂРѕСЃ С‡РµСЂРµР· 60 СЃРµРєСѓРЅРґ РµСЃР»Рё РЅРµС‚ РѕС‚РІРµС‚Р°
      _callAutoTimeout = setTimeout(() => {
        if (_inCall && !_connected) {
          toast('РќРµС‚ РѕС‚РІРµС‚Р°', 'info', 3000);
          endCall();
        }
      }, 60000);
    }
  } catch(err) {
    toast('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє ' + (isVid ? 'РєР°РјРµСЂРµ/РјРёРєСЂРѕС„РѕРЅСѓ' : 'РјРёРєСЂРѕС„РѕРЅСѓ'), 'error');
  }
}

async function _initiateGroupPeer(member) {
  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceTransportPolicy: 'all',       // РїСЂРѕР±СѓРµРј РІСЃРµ РїСѓС‚Рё РІРєР»СЋС‡Р°СЏ TURN
    iceCandidatePoolSize: 10,        // Р±РѕР»СЊС€Рµ РєР°РЅРґРёРґР°С‚РѕРІ = Р±С‹СЃС‚СЂРµРµ СЃРѕРµРґРёРЅРµРЅРёРµ
    bundlePolicy: 'max-bundle',      // РѕР±СЉРµРґРёРЅСЏРµРј Р°СѓРґРёРѕ+РІРёРґРµРѕ РІ РѕРґРёРЅ РїРѕС‚РѕРє
    rtcpMuxPolicy: 'require',        // СЌРєРѕРЅРѕРјРёРј РїРѕСЂС‚С‹
    iceCandidatePoolSize: 10,
    sdpSemantics: 'unified-plan',
  });
  groupPeers.set(member, pc);

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('call-ice', { to: member, from: currentUser, candidate });
  };

  const remoteStream = new MediaStream();
  pc.ontrack = ({ track, streams }) => {
    const existing = remoteStream.getTracks().find(t => t.kind === track.kind);
    if (existing) remoteStream.removeTrack(existing);
    remoteStream.addTrack(track);
    _addGroupParticipantStream(member, remoteStream);
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      // РџРµСЂРІС‹Р№ СѓС‡Р°СЃС‚РЅРёРє РїСЂРёРЅСЏР» вЂ” РѕСЃС‚Р°РЅР°РІР»РёРІР°РµРј РіСѓРґРѕРє
      stopRing();
      playCallSound('connect');
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      groupPeers.delete(member);
      _updateGroupCallStatus();
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') {
      pc.restartIce?.();
    }
  };

  // РџРµСЂРµРґР°С‘Рј groupId С‡С‚РѕР±С‹ РїРѕР»СѓС‡Р°С‚РµР»СЊ Р·РЅР°Р» С‡С‚Рѕ СЌС‚Рѕ РіСЂСѓРїРїРѕРІРѕР№ Р·РІРѕРЅРѕРє
  const gid = currentRoom?.startsWith('group:') ? currentRoom.replace('group:', '') : null;
  socket.emit('call-invite', { to: member, from: currentUser, isVid: _callIsVid, groupId: gid });
}

function _addGroupParticipantStream(member, remoteStream) {
  const grid = document.getElementById('gcwGrid');
  if (!grid) return;
  _addGroupParticipantTile(grid, member, remoteStream, false);
  // РћР±РЅРѕРІР»СЏРµРј С‡РёСЃР»Рѕ РєРѕР»РѕРЅРѕРє
  const count = grid.querySelectorAll('.gp-tile').length;
  _updateGcwGrid(count);
  _updateGroupCallStatus();
}

function _updateGroupCallStatus() {
  const connectedCount = Array.from(groupPeers.values()).filter(pc => pc.connectionState === 'connected').length;
  const totalCount = _groupMembers.length;
  const statusEl = document.getElementById('gcStatus');
  if (statusEl) {
    if (connectedCount === 0) statusEl.textContent = 'РЎРѕРµРґРёРЅРµРЅРёРµ...';
    else statusEl.textContent = `${connectedCount + 1} СѓС‡Р°СЃС‚РЅРёРє${connectedCount !== totalCount ? ` РёР· ${totalCount + 1}` : ''}`;
  }
}

let _gcwTimer = null; // С‚Р°Р№РјРµСЂ РґР»РёС‚РµР»СЊРЅРѕСЃС‚Рё Р·РІРѕРЅРєР°
let _gcwStartTime = null;

function _gcwFormatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function _showGroupCallUI(groupName, members) {
  document.querySelectorAll('.group-call-win').forEach(w => { if(w._timer) clearInterval(w._timer); w.remove(); });

  const win = document.createElement('div');
  win.className = 'group-call-win';
  win.id = 'groupCallWin';

  // Р’С‹РІРѕРґРёРј СЃР°РјРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ + СѓС‡Р°СЃС‚РЅРёРєРѕРІ
  const allMembers = [currentUser, ...members];

  win.innerHTML = `
    <div class="gcw-bg" id="gcwBg"></div>
    <div class="gcw-top">
      <div class="gcw-group-name">${esc(groupName)}</div>
      <div class="gcw-timer" id="gcwTimer">00:00</div>
      <div class="gcw-status" id="gcStatus">РЎРѕРµРґРёРЅРµРЅРёРµвЂ¦</div>
    </div>
    <div class="gcw-grid gp-grid" id="gcwGrid"></div>
    <div class="gcw-bottom">
      <div class="gcw-controls">
        <button class="gcw-btn gcw-mute" id="gcwMuteBtn" onclick="toggleGroupMute()" title="РњРёРєСЂРѕС„РѕРЅ">
          <i class="ti ti-microphone"></i>
        </button>
        ${_callIsVid ? `<button class="gcw-btn gcw-vid" id="gcwVidBtn" onclick="toggleGroupCamera()" title="РљР°РјРµСЂР°">
          <i class="ti ti-video"></i>
        </button>` : ''}
        <button class="gcw-btn gcw-flip" onclick="flipGroupCamera()" title="РџРµСЂРµРІРµСЂРЅСѓС‚СЊ РєР°РјРµСЂСѓ" style="${_callIsVid?'':'display:none'}">
          <i class="ti ti-rotate"></i>
        </button>
        <button class="gcw-btn gcw-screen" id="gcwScreenBtn" onclick="toggleGroupScreenShare()" title="Р”РµРјРѕРЅСЃС‚СЂР°С†РёСЏ СЌРєСЂР°РЅР°">
          <i class="ti ti-screen-share"></i>
        </button>
        <button class="gcw-btn gcw-end" onclick="endCall()" title="Р—Р°РІРµСЂС€РёС‚СЊ">
          <i class="ti ti-phone-off"></i>
        </button>
      </div>
    </div>`;

  document.body.appendChild(win);

  // Р”РѕР±Р°РІР»СЏРµРј РїР»РёС‚РєСѓ РґР»СЏ СЃРµР±СЏ
  _addGroupParticipantTile(win.querySelector('#gcwGrid'), currentUser, localStream, true);

  // РћР±РЅРѕРІР»СЏРµРј СЃРµС‚РєСѓ РїРѕ С‡РёСЃР»Сѓ СѓС‡Р°СЃС‚РЅРёРєРѕРІ
  _updateGcwGrid(allMembers.length);

  // РўР°Р№РјРµСЂ Р·РІРѕРЅРєР°
  _muted = false; // СЃР±СЂР°СЃС‹РІР°РµРј СЃРѕСЃС‚РѕСЏРЅРёРµ РјРёРєСЂРѕС„РѕРЅР° РїСЂРё РЅРѕРІРѕРј Р·РІРѕРЅРєРµ
  _gcwStartTime = Date.now();
  _gcwTimer = setInterval(() => {
    const el = document.getElementById('gcwTimer');
    if (el) el.textContent = _gcwFormatTime(Math.floor((Date.now() - _gcwStartTime) / 1000));
  }, 1000);
  win._timer = _gcwTimer;
}

function _updateGcwGrid(count) {
  const win = document.getElementById('groupCallWin');
  if (!win) return;
  const cols = count <= 1 ? 1 : count <= 2 ? 2 : count <= 4 ? 2 : 3;
  win.querySelector('#gcwGrid')?.style.setProperty('--gp-cols', cols) ||
  win.style.setProperty('--gp-cols', cols);
  const grid = document.getElementById('gcwGrid');
  if (grid) grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
}

function _addGroupParticipantTile(grid, member, stream, isLocal) {
  const isSelf = member === currentUser;
  const nick = userNicknames[member] || member;
  const av = userAvatars[member];

  let tile = document.querySelector(`[data-participant="${member}"]`);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'gp-tile' + (isSelf ? ' gp-self' : '');
    tile.dataset.participant = member;
    tile.innerHTML = `
      <video class="gp-vid" id="gp_vid_${member}" autoplay playsinline ${isLocal?'muted':''}></video>
      <div class="gp-ava-wrap" id="gp_ava_wrap_${member}">
        <div class="gp-ava" id="gp_ava_${member}"></div>
      </div>
      <div class="gp-info">
        <span class="gp-name-label">${esc(nick)}</span>
        <span class="gp-mic-ico" id="gp_mic_${member}"><i class="ti ti-microphone"></i></span>
      </div>
      ${isSelf ? '<div class="gp-self-label">Р’С‹</div>' : ''}`;
    grid?.appendChild(tile);
    const avaEl = document.getElementById('gp_ava_' + member);
    if (avaEl) setAvatar(avaEl, member, av);

    // РљР»РёРє в†’ РїРѕР»РЅС‹Р№ СЌРєСЂР°РЅ
    tile.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      _toggleTileFullscreen(tile);
    });

    // РџСЂР°РІР°СЏ РєРЅРѕРїРєР° в†’ РіСЂРѕРјРєРѕСЃС‚СЊ (С‚РѕР»СЊРєРѕ РґР»СЏ РґСЂСѓРіРёС…)
    if (!isLocal) {
      tile.addEventListener('contextmenu', e => {
        e.preventDefault();
        showUserVolumeMenu(e, member, userNicknames[member] || member);
      });
    }
  }

  const vid = document.getElementById('gp_vid_' + member);
  if (vid && stream) {
    vid.srcObject = stream;
    // РџСЂРёРјРµРЅСЏРµРј СЃРѕС…СЂР°РЅС‘РЅРЅСѓСЋ РіСЂРѕРјРєРѕСЃС‚СЊ
    if (!isLocal) vid.volume = Math.min(1, _userVolumes.get(member) ?? 1.0);
    vid.play().catch(()=>{});
    // РџРѕРєР°Р·С‹РІР°РµРј РІРёРґРµРѕ С‚РѕР»СЊРєРѕ РµСЃР»Рё РµСЃС‚СЊ РІРёРґРµРѕРґРѕСЂРѕР¶РєР°
    const hasVideo = stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled;
    const avaWrap = document.getElementById('gp_ava_wrap_' + member);
    if (hasVideo) { vid.style.display = 'block'; if(avaWrap) avaWrap.style.display = 'none'; }
    else          { vid.style.display = 'none';  if(avaWrap) avaWrap.style.display = 'flex'; }
  }
  return tile;
}

function toggleGroupCamera() {
  const tracks = localStream?.getVideoTracks();
  if (!tracks?.length) return;
  const enabled = !tracks[0].enabled;
  tracks[0].enabled = enabled;
  const btn = document.getElementById('gcwVidBtn');
  if (btn) { btn.querySelector('i').className = enabled ? 'ti ti-video' : 'ti ti-video-off'; btn.classList.toggle('muted', !enabled); }
  // РћР±РЅРѕРІР»СЏРµРј РїР»РёС‚РєСѓ СЃРµР±СЏ
  const vid = document.getElementById('gp_vid_' + currentUser);
  const avaWrap = document.getElementById('gp_ava_wrap_' + currentUser);
  if (vid) { vid.style.display = enabled ? 'block' : 'none'; }
  if (avaWrap) avaWrap.style.display = enabled ? 'none' : 'flex';
}

let _gcwFacingMode = 'user';
async function flipGroupCamera() {
  _gcwFacingMode = _gcwFacingMode === 'user' ? 'environment' : 'user';
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: _gcwFacingMode }, audio: false });
    const newVid = newStream.getVideoTracks()[0];
    localStream?.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
    localStream?.addTrack(newVid);
    // Replace in all peers
    groupPeers.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(newVid);
    });
    // Update local tile
    const vid = document.getElementById('gp_vid_' + currentUser);
    if (vid) vid.srcObject = localStream;
  } catch {}
}


// Р’С…РѕРґСЏС‰РёР№ РіСЂСѓРїРїРѕРІРѕР№ Р·РІРѕРЅРѕРє
function _showGroupIncomingUI(from, isVid, group) {
  if (_inCall) { socket.emit('call-busy', { to: from, from: currentUser }); return; }
  _callTarget = from;
  _callRoom   = `group:${group.id}`;
  _callIsVid  = isVid;
  _isCaller   = false;
  _inCall     = true;
  _groupCall  = true;
  _groupMembers = group.members.filter(m => m !== currentUser);

  const fromNick = userNicknames[from] || from;
  setAvatar(callAva, `group:${group.id}`, group.avatar);
  callNm.textContent = group.name;
  callSt.textContent = `${fromNick} РЅР°С‡Р°Р»${isVid ? ' РІРёРґРµРѕ' : ''}Р·РІРѕРЅРѕРє`;
  callAct.innerHTML = `
    <button class="call-btn call-ans" onclick="answerGroupCall()">
      <i class="ti ti-phone"></i>
    </button>
    <button class="call-btn call-end" onclick="declineCall()">
      <i class="ti ti-phone-off"></i>
    </button>`;
  callModal.classList.add('open');
  ringBeep();
}

async function answerGroupCall() {
  stopRing();
  callModal.classList.remove('open');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: _callIsVid ? { facingMode:'user' } : false });
    localStream = stream;
    _showGroupCallUI(_callTarget, _groupMembers);
    // Connect back to each group member
    for (const member of _groupMembers) {
      await _initiateGroupPeer(member);
    }
  } catch(e) {
    toast('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РјРёРєСЂРѕС„РѕРЅСѓ', 'error');
    _cleanup();
  }
}

function _showOutgoingUI(target, isVid) {
  setAvatar(callAva, target, userAvatars[target]);
  callNm.textContent = userNicknames[target] || target;
  callSt.textContent = isVid ? 'Р’РёРґРµРѕР·РІРѕРЅРѕРєвЂ¦' : 'Р—РІРѕРЅРёРјвЂ¦';
  callAct.innerHTML  = `
    <button class="call-btn call-mute" id="callMuteBtn" onclick="toggleMute()">
      <i class="ti ti-microphone"></i>
    </button>
    <button class="call-btn call-end" onclick="endCall()">
      <i class="ti ti-phone-off"></i>
    </button>`;
  callModal.classList.add('open');
  ringBeep(); // РіСѓРґРѕРє Сѓ Р·РІРѕРЅСЏС‰РµРіРѕ
}

// в”Ђв”Ђ INCOMING в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
socket.on('call-invite', ({ from, isVid, resumed, groupId }) => {
  // РЈРІРµРґРѕРјР»РµРЅРёРµ РµСЃР»Рё РІРєР»Р°РґРєР° СЃРєСЂС‹С‚Р°
  if (document.hidden) {
    showPushNotification(
      isVid ? `Р’РёРґРµРѕР·РІРѕРЅРѕРє РѕС‚ ${userNicknames[from] || from}` : `Р—РІРѕРЅРѕРє РѕС‚ ${userNicknames[from] || from}`,
      'РќР°Р¶РјРёС‚Рµ С‡С‚РѕР±С‹ РѕС‚РІРµС‚РёС‚СЊ', 'call-' + from
    );
  }

  // РЈР¶Рµ РІ РіСЂСѓРїРїРѕРІРѕРј Р·РІРѕРЅРєРµ вЂ” РґРѕР±Р°РІР»СЏРµРј СѓС‡Р°СЃС‚РЅРёРєР°
  if (_groupCall) {
    if (groupPeers.has(from)) { _handleGroupAnswer(from, isVid); return; }
    _initiateGroupPeer(from);
    return;
  }

  // Р•СЃР»Рё resumed вЂ” СЌС‚Рѕ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёРµ Р·РІРѕРЅРєР° РїРѕСЃР»Рµ РЅР°РІРёРіР°С†РёРё/РїРµСЂРµР·Р°РіСЂСѓР·РєРё.
  // Р•СЃР»Рё СѓР¶Рµ РІ Р·РІРѕРЅРєРµ СЃ РєРµРј-С‚Рѕ РґСЂСѓРіРёРј вЂ” С‚РѕРіРґР° Р·Р°РЅСЏС‚.
  // Р•СЃР»Рё РІ Р·РІРѕРЅРєРµ СЃ С‚РµРј Р¶Рµ вЂ” РёРіРЅРѕСЂРёСЂСѓРµРј (РґСѓР±Р»СЊ).
  if (_inCall) {
    if (_callTarget === from) return; // СѓР¶Рµ РїСЂРёРЅРёРјР°РµРј/РѕС‚РІРµС‡Р°РµРј СЌС‚РѕС‚ Р·РІРѕРЅРѕРє
    socket.emit('call-busy', { to: from, from: currentUser });
    return;
  }

  // Р•СЃР»Рё Р·РІРѕРЅРѕРє РіСЂСѓРїРїРѕРІРѕР№ вЂ” РїРѕРєР°Р·С‹РІР°РµРј РіСЂСѓРїРїРѕРІРѕР№ UI
  const incomingGroupId = groupId;
  if (incomingGroupId) {
    const grp = groups.find(g => g.id === incomingGroupId);
    if (grp) { _showGroupIncomingUI(from, isVid, grp); return; }
  }

  _callTarget = from;
  _callRoom   = currentRoom; // РєРѕРјРЅР°С‚Р° РіРґРµ РїСЂРёРЅСЏС‚ Р·РІРѕРЅРѕРє
  _callIsVid  = isVid;
  _isCaller   = false;
  _inCall     = true;
  _connected  = false;

  setAvatar(callAva, from, userAvatars[from]);
  callNm.textContent = userNicknames[from] || from;
  callSt.textContent = isVid ? 'Р’РёРґРµРѕР·РІРѕРЅРѕРєвЂ¦' : 'Р’С…РѕРґСЏС‰РёР№ Р·РІРѕРЅРѕРєвЂ¦';
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

async function _handleGroupAnswer(from, isVid) {
  const pc = groupPeers.get(from);
  if (!pc) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: isVid ? { facingMode:'user' } : false });
    localStream = stream;
    _createGroupPeerAnswer(from, pc);
  } catch {
    socket.emit('call-decline', { to: from, from: currentUser });
  }
}

async function _createGroupPeerAnswer(member, pc) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('call-offer', { to: member, from: currentUser, sdp: offer });
  } catch(e) { console.error('[Group Answer]', e); }
}

socket.on('call-busy', ({ from }) => {
  if (_groupCall) {
    // Р’ РіСЂСѓРїРїРѕРІРѕРј Р·РІРѕРЅРєРµ вЂ” СѓС‡Р°СЃС‚РЅРёРє Р·Р°РЅСЏС‚, РїСЂРѕРїСѓСЃРєР°РµРј РµРіРѕ
    const nick = userNicknames[from] || from;
    toast(`${nick} Р·Р°РЅСЏС‚`, 'info', 1500);
    const pc = groupPeers.get(from);
    if (pc) { pc.close(); groupPeers.delete(from); }
    document.querySelector(`[data-participant="${from}"]`)?.remove();
    _groupMembers = _groupMembers.filter(m => m !== from);
    _updateGroupCallStatus();
    if (groupPeers.size === 0 && _groupMembers.length === 0) endCall();
    return;
  }
  // Р›РёС‡РЅС‹Р№ Р·РІРѕРЅРѕРє
  toast((userNicknames[from] || from) + ' Р·Р°РЅСЏС‚', 'info', 2500);
  endCall();
});

// в”Ђв”Ђ ANSWER в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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
    .catch(async (err) => {
      console.log('[Call] РњРµРґРёР° РѕС€РёР±РєР°:', err.name, err.message);
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.name === 'NotReadableError') {
        // РќРµС‚ РєР°РјРµСЂС‹ вЂ” РїСЂРѕР±СѓРµРј С‚РѕР»СЊРєРѕ Р°СѓРґРёРѕ
        if (_callIsVid) {
          toast('РљР°РјРµСЂР° РЅРµРґРѕСЃС‚СѓРїРЅР° вЂ” Р·РІРѕРЅРѕРє С‚РѕР»СЊРєРѕ СЃ Р°СѓРґРёРѕ', 'info', 3000);
          try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            _callIsVid = false; // РїРѕРјРµС‡Р°РµРј С‡С‚Рѕ Сѓ РЅР°СЃ РЅРµС‚ РІРёРґРµРѕ
            _callNoCamera = true; // С„Р»Р°Рі вЂ” РїРѕРєР°Р·С‹РІР°РµРј Р°РІР°С‚Р°СЂРєСѓ РІРјРµСЃС‚Рѕ РєР°РјРµСЂС‹
            _startCallAsCaller_noVideo();
            return;
          } catch(e2) {
            toast('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РјРёРєСЂРѕС„РѕРЅСѓ', 'error');
          }
        }
      } else {
        toast('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РјРµРґРёР°', 'error');
      }
      declineCall();
    });
}

// РќР°С‡РёРЅР°РµРј Р·РІРѕРЅРѕРє Р±РµР· РєР°РјРµСЂС‹ (С‚РѕР»СЊРєРѕ Р°СѓРґРёРѕ + Р°РІР°С‚Р°СЂРєР°)
async function _startCallAsCaller_noVideo() {
  // localStream СѓР¶Рµ РїРѕР»СѓС‡РµРЅ СЃ С‚РѕР»СЊРєРѕ Р°СѓРґРёРѕ
  const target = _callTarget;
  _createPeer(target);
  if (localStream) {
    localStream.getTracks().forEach(t => rtcPeer.addTrack(t, localStream));
  }
  try {
    const offer = await rtcPeer.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
    await rtcPeer.setLocalDescription(offer);
    socket.emit('call-offer', { to: target, from: currentUser, sdp: offer, noCamera: true });
  } catch(e) {
    console.error('[Call no-camera]', e);
    endCall();
  }
}

function declineCall() {
  stopRing();
  // Р”Р»СЏ РіСЂСѓРїРїРѕРІРѕРіРѕ Р·РІРѕРЅРєР°: groupId РїРµСЂРµРґР°С‘Рј С‡С‚РѕР±С‹ Р·РІРѕРЅСЏС‰РёР№ Р·РЅР°Р» вЂ” СЌС‚Рѕ decline РѕС‚ РѕРґРЅРѕРіРѕ СѓС‡Р°СЃС‚РЅРёРєР°
  const gid = _groupCall ? (currentRoom?.replace('group:','') || null) : null;
  socket.emit('call-decline', { to: _callTarget, from: currentUser, groupId: gid });
  _cleanup();
}

socket.on('call-decline', ({ from, groupId } = {}) => {
  const nick = userNicknames[from] || from || '?';
  if (_groupCall && groupId) {
    // Р“СЂСѓРїРїРѕРІРѕР№ Р·РІРѕРЅРѕРє вЂ” РѕРґРёРЅ СѓС‡Р°СЃС‚РЅРёРє РѕС‚РєР»РѕРЅРёР», РїСЂРѕРґРѕР»Р¶Р°РµРј РґР»СЏ РѕСЃС‚Р°Р»СЊРЅС‹С…
    toast(`${nick} РѕС‚РєР»РѕРЅРёР» Р·РІРѕРЅРѕРє`, 'info', 2000);
    // Р—Р°РєСЂС‹РІР°РµРј РїРёСЂ-СЃРѕРµРґРёРЅРµРЅРёРµ СЃ СЌС‚РёРј СѓС‡Р°СЃС‚РЅРёРєРѕРј
    const pc = groupPeers.get(from);
    if (pc) { pc.close(); groupPeers.delete(from); }
    // РЈР±РёСЂР°РµРј РїР»РёС‚РєСѓ СЌС‚РѕРіРѕ СѓС‡Р°СЃС‚РЅРёРєР° РёР· UI
    document.querySelector(`[data-participant="${from}"]`)?.remove();
    // РћР±РЅРѕРІР»СЏРµРј СЃС‡С‘С‚С‡РёРє СѓС‡Р°СЃС‚РЅРёРєРѕРІ
    _groupMembers = _groupMembers.filter(m => m !== from);
    _updateGroupCallStatus();
    // Р•СЃР»Рё Р±РѕР»СЊС€Рµ РЅРёРєРѕРіРѕ РЅРµС‚ вЂ” Р·Р°РІРµСЂС€Р°РµРј
    if (groupPeers.size === 0 && _groupMembers.length === 0) {
      toast('Р’СЃРµ СѓС‡Р°СЃС‚РЅРёРєРё РѕС‚РєР»РѕРЅРёР»Рё Р·РІРѕРЅРѕРє', 'info', 2500);
      endCall();
    }
    return;
  }
  // Р›РёС‡РЅС‹Р№ Р·РІРѕРЅРѕРє вЂ” РѕР±С‹С‡РЅР°СЏ Р»РѕРіРёРєР°
  toast(`${nick} РѕС‚РєР»РѕРЅРёР» Р·РІРѕРЅРѕРє`, 'info', 2500);
  _cleanup();
});

// РђРґСЂРµСЃР°С‚ РІРµСЂРЅСѓР»СЃСЏ РѕРЅР»Р°Р№РЅ РїРѕРєР° РјС‹ Р·РІРѕРЅРёРј вЂ” РѕР±РЅРѕРІР»СЏРµРј СЃС‚Р°С‚СѓСЃ
socket.on('call-callee-online', ({ to }) => {
  if (_inCall && _callTarget === to && callSt) {
    callSt.textContent = 'РЎРѕРµРґРёРЅСЏРµРјСЃСЏвЂ¦';
  }
});

// в”Ђв”Ђ SIGNALING в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// 1. Callee ready в†’ caller creates RTCPeer and offer
socket.on('call-answer-ready', async ({ from }) => {
  if (!_isCaller) return;
  callSt.textContent = 'РЎРѕРµРґРёРЅРµРЅРёРµвЂ¦';
  _createPeer();
  try {
    const offer = await rtcPeer.createOffer();
    await rtcPeer.setLocalDescription(offer);
    socket.emit('call-offer', { to: from, from: currentUser, sdp: offer });
  } catch (e) { console.error('[SDP] offer:', e); _cleanup(); }
});

// 2. Receive offer вЂ” initial call OR renegotiation (screen share)
socket.on('call-offer', async ({ from, sdp }) => {
  // Route to group peer if this is a group call
  if (groupPeers.has(from)) {
    const pc = groupPeers.get(from);
    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call-answer', { to: from, from: currentUser, sdp: answer });
    } catch (e) { console.error('[Group SDP] answer error:', e); }
    return;
  }
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
socket.on('call-answer', async ({ from, sdp }) => {
  // Route to group peer if this is a group call
  if (groupPeers.has(from)) {
    const pc = groupPeers.get(from);
    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    } catch (e) { console.error('[Group SDP] set-answer error:', e); }
    return;
  }
  if (!rtcPeer) return;
  try {
    if (rtcPeer.signalingState === 'have-local-offer') {
      await rtcPeer.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  } catch (e) { console.error('[SDP] set-answer error:', e); }
});

// ICE
socket.on('call-ice', async ({ from, candidate }) => {
  // Route to group peer if this is a group call
  if (groupPeers.has(from)) {
    const pc = groupPeers.get(from);
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    return;
  }
  if (!rtcPeer) return;
  try { await rtcPeer.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
});

// End
socket.on('call-end', ({ from, groupId } = {}) => {
  if (_groupCall && groupId && from) {
    // РћРґРёРЅ СѓС‡Р°СЃС‚РЅРёРє РіСЂСѓРїРїРѕРІРѕРіРѕ Р·РІРѕРЅРєР° Р·Р°РІРµСЂС€РёР» вЂ” СѓР±РёСЂР°РµРј С‚РѕР»СЊРєРѕ РµРіРѕ
    const nick = userNicknames[from] || from;
    toast(`${nick} РїРѕРєРёРЅСѓР» Р·РІРѕРЅРѕРє`, 'info', 1500);
    const pc = groupPeers.get(from);
    if (pc) { pc.close(); groupPeers.delete(from); }
    document.querySelector(`[data-participant="${from}"]`)?.remove();
    _groupMembers = _groupMembers.filter(m => m !== from);
    _updateGroupCallStatus();
    if (groupPeers.size === 0 && _groupMembers.length === 0) {
      endCall();
    }
    return;
  }
  // Р›РёС‡РЅС‹Р№ Р·РІРѕРЅРѕРє вЂ” РїСЂРѕРїСѓС‰РµРЅРЅС‹Р№ РёР»Рё Р·Р°РІРµСЂС€РµРЅРёРµ
  if (_inCall && !_connected && !_isCaller && _callTarget && currentRoom) {
    socket.emit('save-call-record', {
      room: currentRoom, from: _callTarget, to: currentUser,
      isVid: _callIsVid, isCaller: false, connected: false,
      dur: 0, missed: true, timestamp: Date.now()
    });
  }
  _cleanup();
});

// Caller started screen share (replaceTrack path вЂ” no ontrack fired)
socket.on('screen-share-started', ({ from }) => {
  console.log('[SS] screen-share-started from', from);
  _partnerSharing = true; // РїР°СЂС‚РЅС‘СЂ РЅР°С‡Р°Р» С€Р°СЂРёС‚СЊ
  // РЎРєСЂС‹РІР°РµРј Р°РІР°С‚Р°СЂ/РёРјСЏ Сѓ РћР‘РћРРҐ вЂ” Сѓ С€Р°СЂРµСЂР° Рё Сѓ СЃРјРѕС‚СЂСЏС‰РµРіРѕ
  const cwAudio = document.getElementById('cwAudioContent');
  if (cwAudio) cwAudio.style.display = 'none';
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
    // Audio call вЂ” need to show video
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
  _partnerSharing = false; // РїР°СЂС‚РЅС‘СЂ РѕСЃС‚Р°РЅРѕРІРёР» С€Р°СЂРёРЅРі
  // РЈР±РёСЂР°РµРј РІРёРґРµРѕ РїР°СЂС‚РЅС‘СЂР°
  const rv = document.querySelector('#rv');
  if (rv) {
    rv.remove();
    document.querySelector('#screenReceiveOverlay')?.remove();
    const win = document.getElementById('activeCallWin');
    if (win) win.style.height = '';
  }
  // Р’РѕСЃСЃС‚Р°РЅР°РІР»РёРІР°РµРј cwAudioContent С‚РѕР»СЊРєРѕ РµСЃР»Рё РњР« РўРћР–Р• РЅРµ С€Р°СЂРёРј
  if (!_screenSharing) {
    const cwAudio = document.getElementById('cwAudioContent');
    if (cwAudio) cwAudio.style.display = '';
  }
});

// Offline target
socket.on('call-target-offline', ({ target }) => {
  toast(`${target} РЅРµ РІ СЃРµС‚Рё вЂ” РїРѕР»СѓС‡Р°С‚ СѓРІРµРґРѕРјР»РµРЅРёРµ Рѕ РїСЂРѕРїСѓС‰РµРЅРЅРѕРј Р·РІРѕРЅРєРµ`, 'info', 4000);
  _cleanup();
});

// Missed calls on reconnect
socket.on('missed-calls', ({ calls }) => {
  if (!calls?.length) return;
  calls.forEach(c => {
    const age = Math.round((Date.now() - c.time) / 60000);
    const when = age < 1 ? 'С‚РѕР»СЊРєРѕ С‡С‚Рѕ' : age < 60 ? `${age} РјРёРЅ. РЅР°Р·Р°Рґ` : `${Math.round(age/60)} С‡. РЅР°Р·Р°Рґ`;
    const label = c.isVid ? 'РІРёРґРµРѕР·РІРѕРЅРѕРє' : 'Р·РІРѕРЅРѕРє';
    const t = Object.assign(document.createElement('div'), {
      className: 'toast warning', style: 'cursor:pointer',
      innerHTML: `<i class="ti ti-phone-missed"></i><span>РџСЂРѕРїСѓС‰РµРЅ ${label} РѕС‚ <b>${c.from}</b> В· ${when}</span>`
    });
    t.onclick = () => { t.remove(); gotoPrivate(c.from); };
    $('toastContainer')?.appendChild(t);
    setTimeout(() => { t.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, 10000);
  });
  if (document.hidden) showPushNotification(`РџСЂРѕРїСѓС‰РµРЅ Р·РІРѕРЅРѕРє РѕС‚ ${calls[0].from}`, `РџСЂРѕРїСѓС‰РµРЅРѕ ${calls.length}`, 'missed');
});

// в”Ђв”Ђ RTC PEER в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function _createPeer() {
  if (rtcPeer) { try { rtcPeer.close(); } catch {} }
  rtcPeer = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
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
        // Audio call вЂ” create video element to show screen share
        _showScreenReceived(remoteStream);
      }
      // Video call вЂ” rv already updated above with new srcObject, no extra action needed
    }

    if (!_connected && track.kind === 'audio') {
      _connected = true;
      _callConnectedTime = Date.now();
      stopRing(); // РѕСЃС‚Р°РЅР°РІР»РёРІР°РµРј РіСѓРґРѕРє
      playCallSound('connect');
      _showCallWindow(remoteStream);
    } else if (!_connected && track.kind === 'video' && _callIsVid) {
      _connected = true;
      _callConnectedTime = Date.now();
      stopRing(); // РѕСЃС‚Р°РЅР°РІР»РёРІР°РµРј РіСѓРґРѕРє
      playCallSound('connect');
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
      console.warn('[ICE] Connection failed, attempting TURN fallback...');
      rtcPeer.restartIce?.();
      // If still failing after restart, try recreating peer with TURN-only config
      setTimeout(() => {
        if (rtcPeer?.iceConnectionState === 'failed' && _inCall && _callTarget) {
          console.warn('[ICE] Restart failed, recreating peer connection with TURN priority...');
          _recreatePeerWithTurnFallback();
        }
      }, 5000);
    }
  };
}

// в”Ђв”Ђ TURN FALLBACK вЂ” recreate peer with TURN-first config в”Ђв”Ђ
async function _recreatePeerWithTurnFallback() {
  if (!_inCall || !_callTarget || !localStream) return;
  const target = _callTarget;
  const isVid = _callIsVid;
  const wasConnected = _connected;

  // Close old peer
  rtcPeer?.close();
  rtcPeer = null;

  // TURN-first config вЂ” РїСЂРёРѕСЂРёС‚РµС‚ TURN relay РґР»СЏ СЃС‚СЂРѕРіРёС… NAT
  const TURN_FIRST = [
    ...ICE_SERVERS.filter(s => s.urls?.toString().startsWith('turn') || s.urls?.toString().startsWith('turns')),
    // Р”РѕР±Р°РІР»СЏРµРј STUN РІ РєРѕРЅРµС† РєР°Рє Р·Р°РїР°СЃРЅРѕР№ РІР°СЂРёР°РЅС‚
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:3478' },
  ];

  rtcPeer = new RTCPeerConnection({
    iceServers: TURN_FIRST,
    iceCandidatePoolSize: 10,
    sdpSemantics: 'unified-plan',
  });

  localStream.getTracks().forEach(t => rtcPeer.addTrack(t, localStream));

  rtcPeer.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('call-ice', { to: target, from: currentUser, candidate });
  };

  let remoteStream = new MediaStream();
  rtcPeer.ontrack = ({ track, streams }) => {
    const existing = remoteStream.getTracks().find(t => t.kind === track.kind);
    if (existing) remoteStream.removeTrack(existing);
    remoteStream.addTrack(track);
    const rv = document.querySelector('#rv');
    if (rv) { rv.srcObject = remoteStream; rv.play().catch(() => {}); }
    const ra = document.querySelector('#remoteAudio');
    if (ra && track.kind === 'audio') { ra.srcObject = remoteStream; }
  };

  rtcPeer.onconnectionstatechange = () => {
    if (rtcPeer?.connectionState === 'failed' || rtcPeer?.connectionState === 'closed') _cleanup();
  };

  try {
    const offer = await rtcPeer.createOffer();
    await rtcPeer.setLocalDescription(offer);
    socket.emit('call-offer', { to: target, from: currentUser, sdp: offer });
    toast('РџРµСЂРµРїРѕРґРєР»СЋС‡РµРЅРёРµ С‡РµСЂРµР· TURNвЂ¦', 'info', 3000);
  } catch(e) {
    console.error('[TURN] Recreate peer failed:', e);
    toast('РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРїРѕРґРєР»СЋС‡РёС‚СЊСЃСЏ', 'error', 4000);
    _cleanup();
  }
}

// в”Ђв”Ђ SCREEN RECEIVED (other person sharing screen during audio call) в”Ђв”Ђ
function _showScreenReceived(remoteStream) {
  document.querySelector('#screenReceiveOverlay')?.remove();
  document.querySelector('#rv')?.remove();

  // Find or create call window
  let win = document.getElementById('activeCallWin');
  if (!win) {
    console.warn('[SS] No activeCallWin for screen receive');
    return;
  }

  // РЎРєСЂС‹РІР°РµРј Р°РІР°С‚Р°СЂРєСѓ/РЅРёРє Сѓ СЃРјРѕС‚СЂСЏС‰РµРіРѕ (РєР°Рє Сѓ С€Р°СЂРµСЂР°)
  const cwAudio = document.getElementById('cwAudioContent');
  if (cwAudio) cwAudio.style.display = 'none';

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
  badge.innerHTML = '<i class="ti ti-screen-share" style="font-size:13px;color:var(--accent)"></i> Р”РµРјРѕРЅСЃС‚СЂР°С†РёСЏ СЌРєСЂР°РЅР°';

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
      if (win) win.style.height = '';
      // Restore avatar/name for viewer when partner stops sharing
      if (!_screenSharing) {
        const cwAudio = document.getElementById('cwAudioContent');
        if (cwAudio) cwAudio.style.display = '';
      }
      console.log('[SS] Screen share ended via track.onended');
    };
  }
  console.log('[SS] Screen share video inserted, track:', vt?.readyState);
}


// в”Ђв”Ђ Per-user volume control в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const _userVolumes = new Map(); // username -> volume (0.0 - 2.0, default 1.0)

function _setUserVolume(username, vol) {
  vol = Math.max(0, Math.min(2, vol));
  _userVolumes.set(username, vol);
  // Р›РёС‡РЅС‹Р№ Р·РІРѕРЅРѕРє вЂ” audio element
  const audio = document.getElementById('remoteAudio');
  if (audio && _callTarget === username) audio.volume = Math.min(1, vol);
  // Р“СЂСѓРїРїРѕРІРѕР№ Р·РІРѕРЅРѕРє вЂ” video element (audio plays through it)
  const vid = document.getElementById('gp_vid_' + username);
  if (vid) vid.volume = Math.min(1, vol); // Р±СЂР°СѓР·РµСЂ РѕРіСЂР°РЅРёС‡РёРІР°РµС‚ РґРѕ 1.0
}

function showUserVolumeMenu(e, username, displayName) {
  e.preventDefault();
  e.stopPropagation();
  // РЈР±РёСЂР°РµРј СЃС‚Р°СЂРѕРµ РјРµРЅСЋ
  document.getElementById('userVolMenu')?.remove();

  const vol = _userVolumes.get(username) ?? 1.0;
  const pct = Math.round(vol * 100);

  const menu = document.createElement('div');
  menu.id = 'userVolMenu';
  menu.className = 'user-vol-menu';
  menu.innerHTML = `
    <div class="uvm-header">
      <span class="uvm-name">${esc(displayName)}</span>
    </div>
    <div class="uvm-section">
      <div class="uvm-label"><i class="ti ti-volume"></i> Р“СЂРѕРјРєРѕСЃС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</div>
      <div class="uvm-slider-row">
        <span class="uvm-pct" id="uvmPct">${pct}%</span>
        <input type="range" class="uvm-slider" id="uvmSlider"
          min="0" max="200" step="5" value="${pct}">
      </div>
    </div>
    <div class="uvm-section" style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
      <div class="uvm-item" id="uvmMuteBtn">
        <i class="ti ti-volume-off"></i>
        <span>${vol === 0 ? 'Р’РєР»СЋС‡РёС‚СЊ Р·РІСѓРє' : 'Р—Р°РіР»СѓС€РёС‚СЊ'}</span>
      </div>
    </div>`;

  // РџРѕР·РёС†РёСЏ РјРµРЅСЋ
  const x = Math.min(e.clientX, window.innerWidth - 220);
  const y = Math.min(e.clientY, window.innerHeight - 160);
  menu.style.cssText += `;left:${x}px;top:${y}px`;

  document.body.appendChild(menu);

  // РЎР»Р°Р№РґРµСЂ
  const slider = menu.querySelector('#uvmSlider');
  const pctEl  = menu.querySelector('#uvmPct');
  slider.addEventListener('input', () => {
    const v = parseInt(slider.value) / 100;
    pctEl.textContent = slider.value + '%';
    _setUserVolume(username, v);
  });

  // РљРЅРѕРїРєР° Р·Р°РіР»СѓС€РёС‚СЊ
  menu.querySelector('#uvmMuteBtn').addEventListener('click', () => {
    const curVol = _userVolumes.get(username) ?? 1.0;
    const newVol = curVol > 0 ? 0 : 1.0;
    _setUserVolume(username, newVol);
    slider.value = Math.round(newVol * 100);
    pctEl.textContent = slider.value + '%';
    menu.querySelector('#uvmMuteBtn span').textContent = newVol === 0 ? 'Р’РєР»СЋС‡РёС‚СЊ Р·РІСѓРє' : 'Р—Р°РіР»СѓС€РёС‚СЊ';
  });

  // Р—Р°РєСЂС‹С‚РёРµ РїРѕ РєР»РёРєСѓ РІРЅРµ
  const closeMenu = (ev) => {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', closeMenu); }
  };
  setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

// в”Ђв”Ђ CALL WINDOW в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function _showCallWindow(remoteStream) {
  document.querySelectorAll('.call-win, .call-win-float').forEach(w => { if (w._timer) clearInterval(w._timer); w.remove(); });
  const win = document.createElement('div');
  win.className = 'call-win-float';
  win.id = 'activeCallWin';

  const btns = `
    <button class="cw-btn cw-mute" onclick="toggleMuteWin(this)" title="РњРёРєСЂРѕС„РѕРЅ"><i class="ti ti-microphone"></i></button>
    <button class="cw-btn cw-screen ss-toggle" id="cwScreenBtn" title="Р­РєСЂР°РЅ"><i class="ti ti-screen-share"></i></button>
    <button class="cw-btn cw-end" onclick="endCall()" title="Р—Р°РІРµСЂС€РёС‚СЊ"><i class="ti ti-phone-off"></i></button>`;

  if (_callIsVid || _callNoCamera) {
    // Р•СЃР»Рё РЅРµС‚ РєР°РјРµСЂС‹ вЂ” РїРѕРєР°Р·С‹РІР°РµРј Р°РІР°С‚Р°СЂРєСѓ РІ PIP РІРјРµСЃС‚Рѕ РІРёРґРµРѕ
    const pipContent = _callNoCamera
      ? `<div id="lv" style="position:absolute;bottom:58px;right:10px;width:90px;height:68px;border-radius:9px;border:2px solid rgba(255,255,255,.3);background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;z-index:3;font-size:24px;font-weight:700;color:#fff">${(currentUser||'?')[0].toUpperCase()}</div>`
      : `<video id="lv" autoplay playsinline webkit-playsinline muted style="position:absolute;bottom:58px;right:10px;width:90px;height:68px;border-radius:9px;border:2px solid rgba(255,255,255,.2);object-fit:cover;z-index:3;"></video>`;
    win.innerHTML = `
      <div class="cw-bg"></div>
      <video id="rv" autoplay playsinline webkit-playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;z-index:1;"></video>
      ${pipContent}
      ${_callNoCamera ? '<div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:3px 8px;border-radius:99px;z-index:5;backdrop-filter:blur(4px)">рџЋ¤ РўРѕР»СЊРєРѕ Р°СѓРґРёРѕ</div>' : ''}
      <div class="cw-controls" style="z-index:4;">
        <span class="cw-timer" id="cwTimer">0:00</span>
        <div class="cw-btns">${btns}</div>
      </div>`;
    document.body.appendChild(win);
    const rvEl = win.querySelector('#rv');
    rvEl.srcObject = remoteStream;
    rvEl.style.cursor = 'context-menu';
    rvEl.addEventListener('contextmenu', e => showUserVolumeMenu(e, _callTarget, userNicknames[_callTarget] || _callTarget));
    if (localStream && !_callNoCamera) win.querySelector('#lv').srcObject = localStream;
  } else {
    win.innerHTML = `
      <div class="cw-bg"></div>
      <div class="cw-audio-content" id="cwAudioContent" style="transition:opacity .3s">
        <div class="cw-ava" id="cwAva"></div>
        <div class="cw-name" id="cwName">${_callTarget}</div>
      </div>
      <div class="cw-controls" style="z-index:4;">
        <span class="cw-timer" id="cwTimer">0:00</span>
        <div class="cw-btns">${btns}</div>
      </div>`;
    document.body.appendChild(win);
    const cwAva = win.querySelector('#cwAva');
    if (cwAva) {
      setAvatar(cwAva, _callTarget, userAvatars[_callTarget] || null);
      // РџСЂР°РІР°СЏ РєРЅРѕРїРєР° в†’ РјРµРЅСЋ РіСЂРѕРјРєРѕСЃС‚Рё
      const nick = userNicknames[_callTarget] || _callTarget;
      cwAva.style.cursor = 'context-menu';
      cwAva.addEventListener('contextmenu', e => showUserVolumeMenu(e, _callTarget, nick));
      win.querySelector('#cwName')?.addEventListener('contextmenu', e => showUserVolumeMenu(e, _callTarget, nick));
    }
    const audio = Object.assign(document.createElement('audio'), { id: 'remoteAudio', autoplay: true });
    audio.srcObject = remoteStream;
    audio.volume = (_userVolumes.get(_callTarget) ?? (parseInt(localStorage.getItem('aura_vol') || '100')) / 100);
    audio.play().catch(() => document.addEventListener('click', () => audio.play(), { once: true }));
    win.appendChild(audio);
  }

  // Long-press screen button в†’ quality picker
  _setupScreenBtnLongPress(win);

  // Long-press window в†’ expand/collapse
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
  // Short click в†’ start/stop screen share
  btn.addEventListener('click', () => switchToScreenShare());
  // Long press (500ms) в†’ quality picker (only when sharing)
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

// Make call window draggable в†ђ РЈР”РћР‘РЎРўР’Рћ
// в”Ђв”Ђ EXPAND / MINIMIZE call window в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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
  // Position from CSS (top-right) вЂ” let CSS handle initial position

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

// в”Ђв”Ђ MUTE в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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


// в”Ђв”Ђ GROUP SCREEN SHARE в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _groupScreenSharing = false;
let _groupScreenStream  = null;

async function toggleGroupScreenShare() {
  if (!_groupCall) return;

  if (_groupScreenSharing) {
    // РћСЃС‚Р°РЅРѕРІРёС‚СЊ РґРµРјРєСѓ
    _groupScreenStream?.getTracks().forEach(t => t.stop());
    _groupScreenStream = null;
    _groupScreenSharing = false;

    // Р’РѕСЃСЃС‚Р°РЅР°РІР»РёРІР°РµРј РІРёРґРµРѕРґРѕСЂРѕР¶РєСѓ РєР°РјРµСЂС‹ (РёР»Рё СѓР±РёСЂР°РµРј РµСЃР»Рё Р°СѓРґРёРѕ-Р·РІРѕРЅРѕРє)
    groupPeers.forEach(async (pc, member) => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        if (_callIsVid && localStream) {
          const camTrack = localStream.getVideoTracks()[0];
          if (camTrack) await sender.replaceTrack(camTrack).catch(() => {});
        } else {
          await sender.replaceTrack(null).catch(() => {});
        }
      }
    });

    // РЈРІРµРґРѕРјР»СЏРµРј РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ
    groupPeers.forEach((_, member) => {
      socket.emit('group-screen-share-stopped', { to: member, from: currentUser });
    });

    // РћР±РЅРѕРІР»СЏРµРј РєРЅРѕРїРєСѓ
    const btn = document.getElementById('gcwScreenBtn');
    if (btn) { btn.style.background = ''; btn.querySelector('i').className = 'ti ti-screen-share'; }

    // РЈР±РёСЂР°РµРј Р±РѕР»СЊС€РѕР№ СЌРєСЂР°РЅ РёР· СЃРІРѕРµР№ РїР»РёС‚РєРё
    const myTile = document.querySelector(`[data-participant="${currentUser}"]`);
    if (myTile) {
      const vid = myTile.querySelector('.gp-vid');
      const avaWrap = myTile.querySelector('.gp-ava-wrap');
      if (vid) { vid.srcObject = _callIsVid && localStream ? localStream : null; vid.style.display = _callIsVid ? 'block' : 'none'; }
      if (avaWrap) avaWrap.style.display = _callIsVid ? 'none' : 'flex';
    }

    toast('Р”РµРјРѕРЅСЃС‚СЂР°С†РёСЏ РѕСЃС‚Р°РЅРѕРІР»РµРЅР°', 'info', 1500);
    return;
  }

  // РџСЂРѕРІРµСЂСЏРµРј РїРѕРґРґРµСЂР¶РєСѓ
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast('Р‘СЂР°СѓР·РµСЂ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЋ СЌРєСЂР°РЅР°', 'warning'); return;
  }

  // Р’С‹Р±РѕСЂ РєР°С‡РµСЃС‚РІР° в†’ Р·Р°С…РІР°С‚
  const opts = await new Promise(res => showScreenQualityPicker(res));
  if (!opts) return;

  const resMap = { '1080p':{w:1920,h:1080}, '720p':{w:1280,h:720}, '480p':{w:854,h:480} };
  const rz = resMap[opts.res] || resMap['720p'];
  const fps = parseInt(opts.fps) || 30;

  let captured = null;
  try {
    captured = await navigator.mediaDevices.getDisplayMedia({
      video: { width:{ideal:rz.w,max:rz.w}, height:{ideal:rz.h,max:rz.h}, frameRate:{ideal:fps,max:fps} },
      audio: true
    });
  } catch(e) {
    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError')
      toast('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°С…РІР°С‚РёС‚СЊ СЌРєСЂР°РЅ: ' + e.message, 'error');
    return;
  }

  _groupScreenStream = captured;
  _groupScreenSharing = true;
  const vid = captured.getVideoTracks()[0];

  // Р—Р°РјРµРЅСЏРµРј РІРёРґРµРѕРґРѕСЂРѕР¶РєСѓ РІРѕ РІСЃРµС… peer-СЃРѕРµРґРёРЅРµРЅРёСЏС…
  const peerPromises = [];
  groupPeers.forEach(async (pc, member) => {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) {
      peerPromises.push(sender.replaceTrack(vid).catch(() => {}));
    } else {
      // РђСѓРґРёРѕ-Р·РІРѕРЅРѕРє вЂ” РґРѕР±Р°РІР»СЏРµРј РЅРѕРІС‹Р№ С‚СЂРµРє + СЂenegotiate
      pc.addTrack(vid, captured);
      try {
        const offer = await pc.createOffer({ offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        socket.emit('call-offer', { to: member, from: currentUser, sdp: offer });
      } catch {}
    }
    // РЈРІРµРґРѕРјР»СЏРµРј СѓС‡Р°СЃС‚РЅРёРєР°
    socket.emit('group-screen-share-started', { to: member, from: currentUser });
  });
  await Promise.all(peerPromises);

  // РџРѕРєР°Р·С‹РІР°РµРј СЃРІРѕР№ СЌРєСЂР°РЅ РІ СЃРІРѕРµР№ РїР»РёС‚РєРµ
  const myTile = document.querySelector(`[data-participant="${currentUser}"]`);
  if (myTile) {
    const myVid = myTile.querySelector('.gp-vid');
    const myAva = myTile.querySelector('.gp-ava-wrap');
    if (myVid) {
      myVid.srcObject = captured;
      myVid.style.display = 'block';
      myVid.style.objectFit = 'contain'; // РЅРµ РѕР±СЂРµР·Р°С‚СЊ СЌРєСЂР°РЅ
      myVid.style.background = '#000';
    }
    if (myAva) myAva.style.display = 'none';
    // РћС‚РєСЂС‹РІР°РµРј СЃРІРѕСЋ РїР»РёС‚РєСѓ РЅР° РІРµСЃСЊ СЌРєСЂР°РЅ
    _toggleTileFullscreen(myTile);
  }

  // РћР±РЅРѕРІР»СЏРµРј РєРЅРѕРїРєСѓ
  const btn = document.getElementById('gcwScreenBtn');
  if (btn) { btn.style.background = 'var(--accent)'; btn.querySelector('i').className = 'ti ti-screen-share-off'; }

  // РљРѕРіРґР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅР°Р¶Р°Р» "РћСЃС‚Р°РЅРѕРІРёС‚СЊ" РІ Р±СЂР°СѓР·РµСЂРµ
  vid.onended = () => toggleGroupScreenShare();

  toast('Р”РµРјРѕРЅСЃС‚СЂР°С†РёСЏ СЌРєСЂР°РЅР° РЅР°С‡Р°С‚Р°', 'info', 1500);
}

// РџРѕР»СѓС‡РёР»Рё СЃРёРіРЅР°Р» С‡С‚Рѕ РєС‚Рѕ-С‚Рѕ РЅР°С‡Р°Р» С€Р°СЂРёС‚СЊ СЌРєСЂР°РЅ РІ РіСЂСѓРїРїРµ
socket.on('group-screen-share-started', ({ from }) => {
  if (!_groupCall) return;
  const nick = userNicknames[from] || from;
  toast(`${nick} РїРѕРєР°Р·С‹РІР°РµС‚ СЌРєСЂР°РЅ`, 'info', 2000);
  const tile = document.querySelector(`[data-participant="${from}"]`);
  if (tile) {
    let badge = tile.querySelector('.gp-ss-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'gp-ss-badge';
      badge.innerHTML = '<i class="ti ti-screen-share"></i>';
      badge.style.cssText = 'position:absolute;top:7px;left:7px;background:rgba(99,102,241,.85);color:#fff;border-radius:8px;padding:3px 8px;font-size:11px;display:flex;align-items:center;gap:4px;z-index:5;';
      tile.appendChild(badge);
    }
    // РџРµСЂРµРєР»СЋС‡Р°РµРј РЅР° contain С‡С‚РѕР±С‹ РЅРµ РѕР±СЂРµР·Р°Р»Рѕ РґРµРјРєСѓ
    const vid = tile.querySelector('.gp-vid');
    if (vid) { vid.style.objectFit = 'contain'; vid.style.background = '#000'; }
    // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РѕС‚РєСЂС‹РІР°РµРј РЅР° РІРµСЃСЊ СЌРєСЂР°РЅ
    _toggleTileFullscreen(tile);
  }
});

// РџРѕР»СѓС‡РёР»Рё СЃРёРіРЅР°Р» С‡С‚Рѕ РєС‚Рѕ-С‚Рѕ РѕСЃС‚Р°РЅРѕРІРёР» С€Р°СЂРёРЅРі
socket.on('group-screen-share-stopped', ({ from }) => {
  if (!_groupCall) return;
  const tile = document.querySelector(`[data-participant="${from}"]`);
  if (tile) {
    tile.querySelector('.gp-ss-badge')?.remove();
    // Р’РѕР·РІСЂР°С‰Р°РµРј cover Рё СѓР±РёСЂР°РµРј fullscreen
    const vid2 = tile.querySelector('.gp-vid');
    if (vid2) { vid2.style.objectFit = ''; vid2.style.background = ''; }
    if (_fullscreenTile === tile) _toggleTileFullscreen(tile);
    // РЎР±СЂР°СЃС‹РІР°РµРј video: РµСЃР»Рё Сѓ СѓС‡Р°СЃС‚РЅРёРєР° РЅРµС‚ РєР°РјРµСЂС‹ вЂ” СЃРєСЂС‹РІР°РµРј, РїРѕРєР°Р·С‹РІР°РµРј Р°РІР°С‚Р°СЂРєСѓ
    const vid = tile.querySelector('.gp-vid');
    const avaWrap = tile.querySelector('.gp-ava-wrap');
    // РџРѕР»СѓС‡Р°РµРј С‚РµРєСѓС‰РёР№ remoteStream СЌС‚РѕРіРѕ СѓС‡Р°СЃС‚РЅРёРєР° РёР· peer connection
    const pc = groupPeers.get(from);
    if (pc && vid) {
      const receivers = pc.getReceivers();
      const videoReceiver = receivers.find(r => r.track?.kind === 'video');
      if (videoReceiver && videoReceiver.track.readyState === 'live') {
        // Р•СЃС‚СЊ Р¶РёРІР°СЏ РІРёРґРµРѕРґРѕСЂРѕР¶РєР° (РєР°РјРµСЂР° РїР°СЂС‚РЅС‘СЂР°)
        const newStream = new MediaStream([videoReceiver.track]);
        vid.srcObject = newStream;
        vid.style.display = 'block';
        if (avaWrap) avaWrap.style.display = 'none';
      } else {
        // РќРµС‚ РІРёРґРµРѕ вЂ” РїРѕРєР°Р·С‹РІР°РµРј Р°РІР°С‚Р°СЂРєСѓ
        vid.srcObject = null;
        vid.style.display = 'none';
        if (avaWrap) avaWrap.style.display = 'flex';
      }
    } else if (vid) {
      vid.srcObject = null;
      vid.style.display = 'none';
      if (avaWrap) avaWrap.style.display = 'flex';
    }
  }
  toast(`${userNicknames[from] || from} РѕСЃС‚Р°РЅРѕРІРёР» РґРµРјРѕРЅСЃС‚СЂР°С†РёСЋ`, 'info', 1500);
});


// в”Ђв”Ђ РџРѕР»РЅРѕСЌРєСЂР°РЅРЅС‹Р№ СЂРµР¶РёРј РґР»СЏ РїР»РёС‚РєРё СѓС‡Р°СЃС‚РЅРёРєР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _fullscreenTile = null;

function _toggleTileFullscreen(tile) {
  const grid = document.getElementById('gcwGrid');
  const win  = document.getElementById('groupCallWin');
  if (!grid || !win) return;

  if (_fullscreenTile === tile) {
    // Р’С‹С…РѕРґРёРј
    _fullscreenTile = null;
    tile.classList.remove('gp-tile-fullscreen');
    grid.classList.remove('has-fullscreen');
    win.classList.remove('has-fs-tile');
    _updateGcwGrid(grid.querySelectorAll('.gp-tile').length);
    return;
  }

  if (_fullscreenTile) {
    _fullscreenTile.classList.remove('gp-tile-fullscreen');
  }

  _fullscreenTile = tile;
  tile.classList.add('gp-tile-fullscreen');
  grid.classList.add('has-fullscreen');
  win.classList.add('has-fs-tile');
}

// Р’С‹С…РѕРґ РёР· fullscreen РїРѕ Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _fullscreenTile) {
    _toggleTileFullscreen(_fullscreenTile);
  }
}, { passive: true });

function toggleGroupMute() {
  _muted = !_muted;
  localStream?.getAudioTracks().forEach(t => t.enabled = !_muted);
  const btn = document.getElementById('gcwMuteBtn');
  if (btn) {
    btn.querySelector('i').className = _muted ? 'ti ti-microphone-off' : 'ti ti-microphone';
    btn.classList.toggle('muted', _muted);
  }
}

// в”Ђв”Ђ SCREEN SHARE в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function _applyScreenShare(capturedStream) {
  if (!rtcPeer) { capturedStream.getTracks().forEach(t => t.stop()); return; }
  screenStream = capturedStream;
  const vid = screenStream.getVideoTracks()[0];
  if (!vid) { console.error('[SS] No video track in screen stream'); return; }

  console.log('[SS] Video track:', vid.id, vid.readyState, vid.label);

  const existingSender = rtcPeer.getSenders().find(s => s.track?.kind === 'video');

  if (existingSender) {
    // VIDEO CALL: use replaceTrack вЂ” seamless, no renegotiation needed, ontrack fires on receiver
    try {
      await existingSender.replaceTrack(vid);
      console.log('[SS] replaceTrack done вЂ” receiver gets new video');
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
      console.log('[SS] Renegotiation offer sent for audioв†’screen');
    } catch(e) { console.error('[SS] renegotiation error:', e); return; }
  }

  // Р—РІРѕРЅСЏС‰РёР№ вЂ” РїРѕРєР°Р·С‹РІР°РµРј РјР°Р»РµРЅСЊРєРёР№ РїСЂРµРІСЊСЋ СЃРІРѕРµРіРѕ СЌРєСЂР°РЅР° РІ PIP
  // Рё Р±РѕР»СЊС€РѕР№ СЌРєСЂР°РЅ РЎРћР‘Р•РЎР•Р”РќРРљРђ (rv) РѕСЃС‚Р°РІР»СЏРµРј Р±РµР· РёР·РјРµРЅРµРЅРёР№
  const win = document.getElementById('activeCallWin');
  const lv = win?.querySelector('#lv');
  if (lv) {
    // РЈР¶Рµ РµСЃС‚СЊ PIP вЂ” РїРѕРєР°Р·С‹РІР°РµРј РїСЂРµРІСЊСЋ СЃРІРѕРµРіРѕ СЌРєСЂР°РЅР° С‚Р°Рј (РјРѕР¶РµС‚ Р±С‹С‚СЊ display:none)
    lv.srcObject = screenStream;
    lv.style.display = 'block';
    lv.style.width  = '180px';
    lv.style.height = '100px';
    lv.style.objectFit = 'contain';
    lv.style.background = '#000';
    lv.play().catch(() => {});
  } else if (win) {
    // Р”РѕР±Р°РІР»СЏРµРј РјР°Р»РµРЅСЊРєРёР№ РїСЂРµРІСЊСЋ СЃРІРѕРµРіРѕ СЌРєСЂР°РЅР° РІ СѓРіР»Сѓ
    const pip = document.createElement('video');
    pip.id = 'lv'; pip.autoplay = true; pip.playsinline = true; pip.muted = true;
    pip.style.cssText = 'position:absolute;bottom:58px;right:10px;width:160px;height:90px;border-radius:8px;border:2px solid rgba(255,255,255,.3);object-fit:contain;background:#000;z-index:3;';
    pip.srcObject = screenStream;
    win.appendChild(pip);
    pip.play().catch(() => {});
  }

  _screenSharing = true;
  document.querySelectorAll('.ss-toggle').forEach(b => {
    b.style.background = 'var(--accent)';
    b.querySelector('i').className = 'ti ti-screen-share-off';
  });
  // РЎРєСЂС‹РІР°РµРј Р°РІР°С‚Р°СЂРєСѓ/РёРјСЏ РІРѕ РІСЂРµРјСЏ РґРµРјРѕРЅСЃС‚СЂР°С†РёРё СЌРєСЂР°РЅР°
  const ac = document.getElementById('cwAudioContent');
  if (ac) { ac.style.display = 'none'; ac.style.pointerEvents = 'none'; }
  toast('Р”РµРјРѕРЅСЃС‚СЂР°С†РёСЏ СЌРєСЂР°РЅР° Р°РєС‚РёРІРЅР°', 'success', 2500);

  vid.onended = () => switchToScreenShare(); // user clicks "stop sharing" in browser
}


async function switchToScreenShare() {
  if (!rtcPeer || !_connected) return;

  // Check if screen share is supported
  if (!navigator.mediaDevices?.getDisplayMedia) {
    const isMobile = /Android|iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isMobile) {
      await dialog({
        icon: 'ti-device-mobile', iconType: 'warning',
        title: 'Р”РµРјРѕРЅСЃС‚СЂР°С†РёСЏ СЌРєСЂР°РЅР°',
        msg: 'РњРѕР±РёР»СЊРЅС‹Рµ Р±СЂР°СѓР·РµСЂС‹ РЅРµ РїРѕР·РІРѕР»СЏСЋС‚ РїСЂРёР»РѕР¶РµРЅРёСЏРј Р·Р°С…РІР°С‚С‹РІР°С‚СЊ СЌРєСЂР°РЅ. Р§С‚РѕР±С‹ РїРѕРґРµР»РёС‚СЊСЃСЏ СЌРєСЂР°РЅРѕРј, РёСЃРїРѕР»СЊР·СѓР№С‚Рµ Aura РЅР° РєРѕРјРїСЊСЋС‚РµСЂРµ РёР»Рё СѓСЃС‚Р°РЅРѕРІРёС‚Рµ PWA-РїСЂРёР»РѕР¶РµРЅРёРµ.',
        ok: 'РџРѕРЅСЏС‚РЅРѕ', cancel: null
      });
    } else {
      toast('Р’Р°С€ Р±СЂР°СѓР·РµСЂ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЋ СЌРєСЂР°РЅР°', 'warning', 5000);
    }
    return;
  }
  if (_screenSharing) {
    screenStream?.getTracks().forEach(t => t.stop());
    screenStream = null; _screenSharing = false;
    socket.emit('screen-share-stopped', { to: _callTarget, from: currentUser });
    document.querySelectorAll('.ss-toggle').forEach(b => {
      b.style.background = ''; b.title = 'Р­РєСЂР°РЅ';
      b.querySelector('i').className = 'ti ti-screen-share';
    });
    // Р’РѕСЃСЃС‚Р°РЅР°РІР»РёРІР°РµРј Р°РІР°С‚Р°СЂРєСѓ/РёРјСЏ Сѓ С€Р°СЂРµСЂР°
    const ac = document.getElementById('cwAudioContent');
    if (ac) { ac.style.display = ''; ac.style.pointerEvents = ''; }
    // РЈР±РёСЂР°РµРј СЃРІРѕР№ PIP РїСЂРµРІСЊСЋ СЌРєСЂР°РЅР°
    const lv = document.getElementById('activeCallWin')?.querySelector('#lv');
    if (lv) {
      lv.srcObject = null;
      lv.style.display = 'none'; // СЃРєСЂС‹РІР°РµРј pip РїСЂРµРІСЊСЋ СЃРІРѕРµР№ РґРµРјРєРё
    }
    // Р•СЃР»Рё СЌС‚Рѕ Р±С‹Р» Р°СѓРґРёРѕР·РІРѕРЅРѕРє вЂ” СѓР±РёСЂР°РµРј РІРёРґРµРѕ СЌР»РµРјРµРЅС‚
    const win2 = document.getElementById('activeCallWin');
    if (win2) {
      if (!_callIsVid && !_partnerSharing) {
        // РЈР±РёСЂР°РµРј #rv С‚РѕР»СЊРєРѕ РµСЃР»Рё РїР°СЂС‚РЅС‘СЂ РўРћР–Р• РЅРµ С€Р°СЂРёС‚
        win2.querySelector('#rv')?.remove();
        win2.style.height = '';
      } else if (_partnerSharing) {
        // РџР°СЂС‚РЅС‘СЂ РµС‰С‘ С€Р°СЂРёС‚ вЂ” РїРѕРєР°Р·С‹РІР°РµРј РµРіРѕ СЌРєСЂР°РЅ СЃРЅРѕРІР° (РѕРЅ РјРѕРі Р±С‹С‚СЊ СЃРєСЂС‹С‚)
        const rvEl = document.querySelector('#rv');
        if (rvEl) rvEl.style.display = 'block';
        const cwA = document.getElementById('cwAudioContent');
        if (cwA) cwA.style.display = 'none'; // РІСЃС‘ РµС‰С‘ СЃРєСЂС‹С‚ РїРѕРєР° РїР°СЂС‚РЅС‘СЂ С€Р°СЂРёС‚
      }
      // Р’РѕСЃСЃС‚Р°РЅР°РІР»РёРІР°РµРј РєР°РјРµСЂСѓ РІ lv РµСЃР»Рё РІРёРґРµРѕР·РІРѕРЅРѕРє
      if (_callIsVid && lv && localStream) {
        lv.srcObject = localStream;
        lv.style.width = '';
        lv.style.height = '';
        lv.style.objectFit = 'cover';
        lv.style.background = '';
      }
    }
    toast('Р”РµРјРѕРЅСЃС‚СЂР°С†РёСЏ РѕСЃС‚Р°РЅРѕРІР»РµРЅР°', 'info', 2000);
    return;
  }

  // РџРѕРєР°Р·С‹РІР°РµРј РІС‹Р±РѕСЂ РєР°С‡РµСЃС‚РІР°, РїРѕС‚РѕРј getDisplayMedia
  let _selectedOpts = await new Promise(res => showScreenQualityPicker(res));
  if (!_selectedOpts) return; // РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РѕС‚РјРµРЅРёР»

  const resMap = { '1080p':{w:1920,h:1080}, '720p':{w:1280,h:720}, '480p':{w:854,h:480} };
  const rz = resMap[_selectedOpts.res] || resMap['720p'];
  const fps = parseInt(_selectedOpts.fps) || 30;

  let _capturedStream = null;
  try {
    _capturedStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width:{ideal:rz.w,max:rz.w}, height:{ideal:rz.h,max:rz.h}, frameRate:{ideal:fps,max:fps} },
      audio: true
    });
  } catch(e) {
    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError')
      toast('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°С…РІР°С‚РёС‚СЊ СЌРєСЂР°РЅ: ' + e.message, 'error');
    return;
  }
  if (!_capturedStream) return;

  await _applyScreenShare(_capturedStream);
}

function showScreenQualityPicker(cb) {
  const ov = $('dialogOverlay'), box = $('dialogBox');
  if (!ov || !box) { cb({ res:'720p', fps:'30' }); return; }
  box.innerHTML = `
    <div class="dlg-ico info"><i class="ti ti-screen-share"></i></div>
    <h3>Р”РµРјРѕРЅСЃС‚СЂР°С†РёСЏ СЌРєСЂР°РЅР°</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <p class="lbl mb-6">Р Р°Р·СЂРµС€РµРЅРёРµ</p>
        ${['1080p','720p','480p'].map((v,i) => `<label class="sq-opt${i===1?' sq-sel':''}"><input type="radio" name="sqr" value="${v}"${i===1?' checked':''}> ${v}</label>`).join('')}
      </div>
      <div>
        <p class="lbl mb-6">FPS</p>
        ${['60','30','15'].map((v,i) => `<label class="sq-opt${i===1?' sq-sel':''}"><input type="radio" name="sqf" value="${v}"${i===1?' checked':''}> ${v} FPS</label>`).join('')}
      </div>
    </div>
    <div class="dlg-btns">
      <button class="btn-secondary" id="dlgNo">РћС‚РјРµРЅР°</button>
      <button class="btn-primary" id="dlgOk"><i class="ti ti-screen-share"></i> РќР°С‡Р°С‚СЊ</button>
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

// в”Ђв”Ђ END / CLEANUP в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function endCall() {
  stopRing();
  if (_groupCall) {
    // Р“СЂСѓРїРїРѕРІРѕР№ Р·РІРѕРЅРѕРє вЂ” С€Р»С‘Рј Р·Р°РІРµСЂС€РµРЅРёРµ РІСЃРµРј СѓС‡Р°СЃС‚РЅРёРєР°Рј СЃ groupId
    const gid = currentRoom?.replace('group:','') || _callRoom?.replace('group:','') || '';
    const targets = [...groupPeers.keys()];
    if (_callTarget && !targets.includes(_callTarget)) targets.push(_callTarget);
    targets.forEach(member => {
      socket.emit('call-end', { to: member, from: currentUser, groupId: gid });
    });
  } else if (_callTarget) {
    socket.emit('call-end', { to: _callTarget, from: currentUser });
  }
  _cleanup();
}
function doLogout() {
  // РћС‡РёС‰Р°РµРј СЃРµСЃСЃРёСЋ Рё РІРѕР·РІСЂР°С‰Р°РµРј РЅР° СЌРєСЂР°РЅ РІС…РѕРґР°
  localStorage.removeItem('aura_user');
  localStorage.removeItem('aura_pass');
  localStorage.removeItem('aura_last_room');
  // РћС‚РєР»СЋС‡Р°РµРјСЃСЏ РѕС‚ СЃРѕРєРµС‚Р°
  socket.emit('logout', { username: currentUser });
  // РЎР±СЂР°СЃС‹РІР°РµРј СЃРѕСЃС‚РѕСЏРЅРёРµ
  currentUser = null;
  if (_inCall) endCall();
  // РџРѕРєР°Р·С‹РІР°РµРј СЌРєСЂР°РЅ РІС…РѕРґР°
  const chatApp = document.getElementById('chatApp');
  if (chatApp) chatApp.style.display = 'none';
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) { loginScreen.style.display = 'flex'; loginScreen.classList.add('open'); }
  closeSettings();
  toast('Р’С‹ РІС‹С€Р»Рё РёР· Р°РєРєР°СѓРЅС‚Р°', 'info', 2000);
}

function _cleanup() {
  if (_connected) playCallSound('end'); // Р·РІСѓРє С‚РѕР»СЊРєРѕ РµСЃР»Рё Р·РІРѕРЅРѕРє Р±С‹Р» РїСЂРёРЅСЏС‚
  stopRing();
  // Add call record to chat if call was connected
  if (_callTarget && _callRoom && !_groupCall) {
    const dur = _callConnectedTime ? Math.floor((Date.now() - _callConnectedTime) / 1000) : 0;
    // РўРѕР»СЊРєРѕ Р·РІРѕРЅРёРІС€РёР№ (caller) СЃРѕС…СЂР°РЅСЏРµС‚ Р·Р°РїРёСЃСЊ вЂ” СЃРµСЂРІРµСЂ СЂР°Р·РѕС€Р»С‘С‚ РѕР±РѕРёРј
    if (_isCaller) {
      socket.emit('save-call-record', {
        room: _callRoom, from: currentUser, to: _callTarget,
        isVid: _callIsVid, isCaller: true,
        connected: !!_callConnectedTime, dur,
        timestamp: Date.now()
      });
    }
  }
  _callConnectedTime = null;
  _callRoom = null;
  _partnerSharing = false;

  if (_callAutoTimeout) { clearTimeout(_callAutoTimeout); _callAutoTimeout = null; }
  _releaseWakeLock();
  _inCall = false; _connected = false; _screenSharing = false; _muted = false; _callNoCamera = false;
  rtcPeer?.close(); rtcPeer = null;
  // Close all group peer connections
  groupPeers.forEach(pc => pc.close());
  groupPeers.clear();
  localStream?.getTracks().forEach(t => t.stop()); localStream = null;
  screenStream?.getTracks().forEach(t => t.stop()); screenStream = null;
  _groupScreenStream?.getTracks().forEach(t => t.stop()); _groupScreenStream = null;
  _groupScreenSharing = false;
  _groupCall = false;
  _groupMembers = [];
  document.querySelectorAll('.call-win-float').forEach(w => { if (w._timer) clearInterval(w._timer); w.remove(); });
  document.querySelectorAll('.group-call-win').forEach(w => w.remove());
  if (callModal) callModal.classList.remove('open');
  if (callAct) callAct.innerHTML = '';
  if (callNm)  callNm.textContent = '';
  if (callSt)  callSt.textContent = '';
  _callTarget = null;
}

let _callConnectedTime = null;
let _callNoCamera = false;
let _callAutoTimeout = null; // Р°РІС‚Рѕ-СЃР±СЂРѕСЃ С‡РµСЂРµР· 60СЃ РµСЃР»Рё РЅРµ РѕС‚РІРµС‚РёР»Рё

function addCallRecord(label, extra, time) {
  const row = document.createElement('div');
  row.className = 'call-record';
  row.innerHTML = `
    <span class="cr-label">${label}</span>
    <span class="cr-extra">${extra}</span>
    <span class="cr-time">${time}</span>`;
  messagesDiv?.appendChild(row);
  if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
}


// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// VIDEO CIRCLE вЂ” fullscreen viewer  в†ђ РљР РђРЎРћРўРђ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// в”Ђв”Ђ Video Circle в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// РћРґРЅРѕ РЅР°Р¶Р°С‚РёРµ:  expand РІ С‡Р°С‚Рµ (СЃРѕРѕР±С‰РµРЅРёСЏ РїР»Р°РІРЅРѕ РѕС‚РѕРґРІРёРіР°СЋС‚СЃСЏ)
// Р”РІРѕР№РЅРѕРµ:       fullscreen РЅР° РІРµСЃСЊ СЌРєСЂР°РЅ
// РљРѕРЅРµС† РІРёРґРµРѕ:   Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЃС…Р»РѕРїС‹РІР°РµС‚СЃСЏ РѕР±СЂР°С‚РЅРѕ

let _vcExpandedId   = null;
let _vcExpandTimer  = null;
let _vcTapCount     = 0;    // СЃС‡С‘С‚С‡РёРє С‚Р°РїРѕРІ
let _vcTapTimer     = null; // С‚Р°Р№РјРµСЂ РґР»СЏ double-tap

// в”Ђв”Ђ РћРґРЅРѕ РЅР°Р¶Р°С‚РёРµ: СѓРІРµР»РёС‡РёРІР°РµРј РЅР° РјРµСЃС‚Рµ + СЃРєСЂРѕР»Р»РёРј Рє РЅРµРјСѓ
// в”Ђв”Ђ Р”РІРѕР№РЅРѕРµ РЅР°Р¶Р°С‚РёРµ: fullscreen overlay
function vcTogglePlay(id) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  _vcTapCount++;
  clearTimeout(_vcTapTimer);

  if (_vcTapCount === 1) {
    // Р–РґС‘Рј 260ms вЂ” РµСЃР»Рё РІС‚РѕСЂРѕРіРѕ С‚Р°РїР° РЅРµС‚, СЃС‡РёС‚Р°РµРј РѕРґРёРЅРѕС‡РЅС‹Рј
    _vcTapTimer = setTimeout(() => {
      _vcTapCount = 0;
      _vcSingleTap(id);
    }, 260);
  } else {
    // Double-tap в†’ fullscreen
    _vcTapCount = 0;
    clearTimeout(_vcTapTimer);
    _vcOpenFullscreen(id);
  }
}

function _vcSingleTap(id) {
  const v    = document.getElementById(id);
  const wrap = document.getElementById(id + '_wrap');
  if (!v || !wrap) return;

  const isExpanded = wrap.classList.contains('vc-expanded');

  if (isExpanded) {
    // РџР°СѓР·Р°/РІРѕСЃРїСЂРѕРёР·РІРµРґРµРЅРёРµ РµСЃР»Рё СѓР¶Рµ СЂР°СЃС€РёСЂРµРЅ
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    // РћР±РЅРѕРІР»СЏРµРј overlay
    const ov = document.getElementById(id + '_ov');
    if (ov) {
      ov.querySelector('i').className = v.paused ? 'ti ti-player-play vc-play-ico' : 'ti ti-player-pause vc-play-ico';
      ov.style.opacity = v.paused ? '1' : '0';
    }
    return;
  }

  // Collapse any other expanded
  if (_vcExpandedId && _vcExpandedId !== id) {
    _vcCollapse(_vcExpandedId);
  }

  _vcExpand(id);
}

function _vcExpand(id) {
  const v    = document.getElementById(id);
  const wrap = document.getElementById(id + '_wrap');
  const row  = wrap?.closest('.msg-row');
  if (!v || !wrap) return;

  _vcExpandedId = id;

  // Р¦РµР»РµРІРѕР№ СЂР°Р·РјРµСЂ вЂ” РІРїРёСЃС‹РІР°РµРј РІ С€РёСЂРёРЅСѓ С‡Р°С‚Р°
  const msgs  = document.getElementById('messages');
  const msgsW = msgs ? msgs.clientWidth - 32 : window.innerWidth - 32; // 16px padding each side
  const target = Math.min(Math.floor(msgsW), window.innerWidth <= 480 ? 260 : 340);

  // РџР»Р°РІРЅРѕ СѓРІРµР»РёС‡РёРІР°РµРј wrap вЂ” СЃРѕРѕР±С‰РµРЅРёСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЂР°Р·РґРІРёРЅСѓС‚СЃСЏ РІРЅРёР·
  wrap.style.transition = 'width .35s cubic-bezier(.16,1,.3,1), height .35s cubic-bezier(.16,1,.3,1), box-shadow .35s, border-radius .35s';
  wrap.style.width      = target + 'px';
  wrap.style.height     = target + 'px';
  wrap.style.boxShadow  = '0 8px 32px rgba(0,0,0,.45)';
  wrap.style.zIndex     = '10';
  wrap.classList.add('vc-expanded');

  // Р’РёРґРµРѕ РІРЅСѓС‚СЂРё
  v.style.transition = 'width .35s cubic-bezier(.16,1,.3,1), height .35s cubic-bezier(.16,1,.3,1)';
  v.style.width  = target + 'px';
  v.style.height = target + 'px';

  // РџСЂСЏС‡РµРј РёРєРѕРЅРєСѓ play
  const ov = document.getElementById(id + '_ov');
  if (ov) { ov.style.transition = 'opacity .2s'; ov.style.opacity = '0'; }

  // Р—Р°РїСѓСЃРєР°РµРј
  v.play().catch(() => {});
  v.onended = () => _vcCollapse(id);

  // РЎРєСЂРѕР»Р»РёРј С‡С‚РѕР±С‹ РєРІР°РґСЂР°С‚ Р±С‹Р» РІРёРґРµРЅ вЂ” РїРѕСЃР»Рµ Р°РЅРёРјР°С†РёРё
  setTimeout(() => {
    const wrapEl = document.getElementById(id + '_wrap');
    if (wrapEl && msgs) {
      const wrapRect = wrapEl.getBoundingClientRect();
      const msgsRect = msgs.getBoundingClientRect();
      // Р•СЃР»Рё РЅРёР· РєРІР°РґСЂР°С‚Р° РІС‹Р»Р°Р·РёС‚ Р·Р° РЅРёР¶РЅРёР№ РєСЂР°Р№ РѕР±Р»Р°СЃС‚Рё вЂ” СЃРєСЂРѕР»Р»РёРј РІРЅРёР·
      if (wrapRect.bottom > msgsRect.bottom - 20) {
        const delta = wrapRect.bottom - msgsRect.bottom + 24;
        msgs.scrollBy({ top: delta, behavior: 'smooth' });
      }
      // Р•СЃР»Рё РІРµСЂС… РєРІР°РґСЂР°С‚Р° РІС‹С€Рµ РІРµСЂС…РЅРµРіРѕ РєСЂР°СЏ вЂ” СЃРєСЂРѕР»Р»РёРј РІРІРµСЂС…
      else if (wrapRect.top < msgsRect.top + 10) {
        msgs.scrollBy({ top: wrapRect.top - msgsRect.top - 10, behavior: 'smooth' });
      }
    }
  }, 380); // РїРѕСЃР»Рµ Р·Р°РІРµСЂС€РµРЅРёСЏ Р°РЅРёРјР°С†РёРё

  // РџСЂРё РєР»РёРєРµ РЅР° СЂР°СЃС€РёСЂРµРЅРЅС‹Р№ вЂ” РїР°СѓР·Р°/РїР»РµР№
  wrap._expandHandler = (e) => {
    e.stopPropagation();
    _vcSingleTap(id);
  };
  wrap.addEventListener('click', wrap._expandHandler);
}

// в”Ђв”Ђ Collapse РѕР±СЂР°С‚РЅРѕ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function _vcCollapse(id) {
  const v    = document.getElementById(id);
  const wrap = document.getElementById(id + '_wrap');
  if (!v || !wrap) return;

  const origSize = window.innerWidth <= 480 ? '160px' : '180px'; // РёР· CSS

  wrap.style.transition = 'width .3s cubic-bezier(.16,1,.3,1), height .3s cubic-bezier(.16,1,.3,1), box-shadow .3s';
  wrap.style.width  = origSize;
  wrap.style.height = origSize;
  wrap.style.boxShadow = '';
  wrap.style.zIndex = '';
  wrap.classList.remove('vc-expanded');

  v.style.width  = origSize;
  v.style.height = origSize;

  const ov = document.getElementById(id + '_ov');
  if (ov) {
    ov.style.opacity = '1';
    ov.querySelector('i').className = 'ti ti-player-play vc-play-ico';
  }

  v.pause();
  v.onended = null;

  if (wrap._expandHandler) {
    wrap.removeEventListener('click', wrap._expandHandler);
    wrap._expandHandler = null;
  }

  if (_vcExpandedId === id) _vcExpandedId = null;
}

// в”Ђв”Ђ Double-tap в†’ fullscreen overlay в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function _vcOpenFullscreen(id) {
  const v = document.getElementById(id);
  if (!v) return;

  // Р•СЃР»Рё Р±С‹Р» СЂР°СЃС€РёСЂРµРЅ вЂ” СЃРЅР°С‡Р°Р»Р° РєРѕР»Р»Р°РїСЃРёСЂСѓРµРј
  if (_vcExpandedId === id) _vcCollapse(id);

  const src = v.src || v.currentSrc;
  const overlay = document.createElement('div');
  overlay.id = id + '_fso';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;animation:fadeIn .2s ease;touch-action:none;';

  const vSize = Math.min(window.innerWidth * 0.92, window.innerHeight * 0.78, 520);
  const vid2 = document.createElement('video');
  vid2.src = src;
  vid2.controls = true;
  vid2.autoplay = true;
  vid2.playsInline = true;
  vid2.loop = true;
  vid2.setAttribute('playsinline','');
  vid2.style.cssText = `width:${vSize}px;height:${vSize}px;object-fit:cover;border-radius:18px;display:block;box-shadow:0 8px 48px rgba(0,0,0,.6);`;

  const hint = document.createElement('div');
  hint.style.cssText = 'color:rgba(255,255,255,.45);font-size:12px;text-align:center;';
  hint.textContent = 'Р”РІР°Р¶РґС‹ РЅР°Р¶РјРёС‚Рµ РґР»СЏ Р·Р°РєСЂС‹С‚РёСЏ';

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;padding:9px 28px;border-radius:22px;font-size:14px;cursor:pointer;backdrop-filter:blur(8px);font-family:inherit;';
  closeBtn.innerHTML = '<i class="ti ti-x"></i> Р—Р°РєСЂС‹С‚СЊ';
  closeBtn.onclick = () => overlay.remove();

  overlay.appendChild(vid2);
  overlay.appendChild(hint);
  overlay.appendChild(closeBtn);

  // Р—Р°РєСЂС‹С‚РёРµ РїРѕ РґРІРѕР№РЅРѕРјСѓ С‚Р°РїСѓ РёР»Рё РєР»РёРєСѓ РІРЅРµ РІРёРґРµРѕ
  let _fsoTaps = 0, _fsoTimer = null;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === hint) {
      _fsoTaps++;
      clearTimeout(_fsoTimer);
      _fsoTimer = setTimeout(() => { _fsoTaps = 0; }, 350);
      if (_fsoTaps >= 2) overlay.remove();
    }
  });

  document.body.appendChild(overlay);
  v.pause(); // РїР°СѓР·Р° РѕСЂРёРіРёРЅР°Р»Р°
}

function _vcCloseFullscreen(id) {
  document.getElementById(id + '_fso')?.remove();
}

// РћСЃС‚Р°РІР»СЏРµРј РґР»СЏ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё (ondblclick="viewMedia" РІ СЃС‚Р°СЂРѕРј HTML)
function closeVcFullscreen(id) { _vcCloseFullscreen(id); }

function vcShowDuration(id) {
  const v   = document.getElementById(id);
  const dur = document.getElementById(id + '_dur');
  if (!v || !dur || !isFinite(v.duration)) return;
  const m = Math.floor(v.duration / 60);
  const s = Math.floor(v.duration % 60);
  dur.textContent = `${m}:${s.toString().padStart(2,'0')}`;
}

function vcShowDuration(id) {
  const v   = document.getElementById(id);
  const dur = document.getElementById(id + '_dur');
  if (!v || !dur || !isFinite(v.duration)) return;
  const m = Math.floor(v.duration / 60);
  const s = Math.floor(v.duration % 60);
  dur.textContent = `${m}:${s.toString().padStart(2,'0')}`;
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// TEXT FORMAT BAR вЂ” РїР°РЅРµР»СЊ С„РѕСЂРјР°С‚РёСЂРѕРІР°РЅРёСЏ
// РџРѕСЏРІР»СЏРµС‚СЃСЏ РїСЂРё РІС‹РґРµР»РµРЅРёРё РјС‹С€СЊСЋ РІ РїРѕР»Рµ РІРІРѕРґР°
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
(function() {
  'use strict';
  let _bar = null;
  let _skip = false;

  function removeBar() { _bar && (_bar.remove(), _bar = null); }

  function wrapSel(ta, before, after) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    if (s === e) return;
    const sel = ta.value.slice(s, e);
    ta.value = ta.value.slice(0,s) + before + sel + after + ta.value.slice(e);
    ta.selectionStart = s + before.length;
    ta.selectionEnd   = e + before.length;
    ta.dispatchEvent(new Event('input', {bubbles:true}));
    ta.focus();
  }

  function makeBar(ta, x, y) {
    removeBar();
    const bar = document.createElement('div');
    bar.className = 'fmt-bar';
    _bar = bar;

    const BTNS = [
      { html:'<b>B</b>',   title:'Р–РёСЂРЅС‹Р№',        fn:()=>wrapSel(ta,'**','**') },
      { html:'<i>I</i>',   title:'РљСѓСЂСЃРёРІ',         fn:()=>wrapSel(ta,'_','_') },
      { html:'<u>U</u>',   title:'РџРѕРґС‡С‘СЂРєРЅСѓС‚С‹Р№',   fn:()=>wrapSel(ta,'__','__') },
      { html:'<s>S</s>',   title:'Р—Р°С‡С‘СЂРєРЅСѓС‚С‹Р№',    fn:()=>wrapSel(ta,'~~','~~') },
      { html:'<code style="font-size:11px;font-family:monospace">`В·`</code>', title:'РњРѕРЅРѕС€РёСЂРёРЅРЅС‹Р№', fn:()=>wrapSel(ta,'`','`') },
    ];

    BTNS.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'fmt-btn';
      btn.title = b.title;
      btn.innerHTML = b.html;
      btn.addEventListener('mousedown', e => { e.preventDefault(); b.fn(); removeBar(); });
      bar.appendChild(btn);
    });

    // Р Р°Р·РґРµР»РёС‚РµР»СЊ
    const sep = document.createElement('div');
    sep.className = 'fmt-sep';
    bar.appendChild(sep);

    // РљРЅРѕРїРєР° СЃСЃС‹Р»РєРё
    const lBtn = document.createElement('button');
    lBtn.className = 'fmt-btn';
    lBtn.title = 'Р’СЃС‚Р°РІРёС‚СЊ СЃСЃС‹Р»РєСѓ';
    lBtn.innerHTML = '<i class="ti ti-link"></i>';
    lBtn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); showLink(ta, bar, x, y); });
    bar.appendChild(lBtn);

    // Р”РѕР±Р°РІР»СЏРµРј РІ DOM (СЃРєСЂС‹С‚С‹Рј), РїРѕС‚РѕРј РїРѕР·РёС†РёРѕРЅРёСЂСѓРµРј
    bar.style.visibility = 'hidden';
    document.body.appendChild(bar);

    requestAnimationFrame(() => {
      const bw = bar.offsetWidth || 250;
      const bh = bar.offsetHeight || 42;
      let lx = x - bw / 2;
      let ly = y - bh - 10;
      lx = Math.max(6, Math.min(lx, window.innerWidth  - bw - 6));
      ly = ly < 6 ? y + 10 : ly;
      bar.style.left = lx + 'px';
      bar.style.top  = ly + 'px';
      bar.style.visibility = '';
    });
  }

  function showLink(ta, bar, ox, oy) {
    // РЎРѕС…СЂР°РЅСЏРµРј РїРѕР·РёС†РёСЋ РІС‹РґРµР»РµРЅРёСЏ
    const ss = ta.selectionStart, se = ta.selectionEnd;
    bar.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'fmt-link-row';
    const inp = document.createElement('input');
    inp.className = 'fmt-link-input';
    inp.placeholder = 'https://...';
    inp.type = 'text';
    const ok = document.createElement('button');
    ok.className = 'fmt-link-ok';
    ok.innerHTML = '<i class="ti ti-check"></i>';

    const apply = () => {
      let url = inp.value.trim();
      if (!url) { removeBar(); ta.focus(); return; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      const sel = ta.value.slice(ss, se) || url;
      const md  = '[' + sel + '](' + url + ')';
      ta.value = ta.value.slice(0, ss) + md + ta.value.slice(se);
      ta.selectionStart = ta.selectionEnd = ss + md.length;
      ta.dispatchEvent(new Event('input', {bubbles:true}));
      removeBar(); ta.focus();
    };

    ok.addEventListener('mousedown', e => { e.preventDefault(); apply(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); apply(); }
      if (e.key === 'Escape') { removeBar(); ta.focus(); }
    });

    row.appendChild(inp); row.appendChild(ok);
    bar.appendChild(row);

    requestAnimationFrame(() => {
      const bw = bar.offsetWidth || 240;
      let lx = ox - bw / 2;
      lx = Math.max(6, Math.min(lx, window.innerWidth - bw - 6));
      bar.style.left = lx + 'px';
      inp.focus();
    });
  }

  // Р—Р°РєСЂС‹С‚РёРµ РїРѕ РєР»РёРєСѓ РІРЅРµ
  document.addEventListener('mousedown', e => {
    if (_skip) return;
    if (_bar && !_bar.contains(e.target)) removeBar();
  });

  // РРЅРёС†РёР°Р»РёР·Р°С†РёСЏ вЂ” РІРµС€Р°РµРј РЅР° msgInput
  function init() {
    const ta = document.getElementById('msgInput');
    if (!ta || ta._fmtOk) return;
    ta._fmtOk = true;

    // РџР°РЅРµР»СЊ РїРѕСЏРІР»СЏРµС‚СЃСЏ РўРћР›Р¬РљРћ РїРѕ РџРљРњ Рё С‚РѕР»СЊРєРѕ РµСЃР»Рё РµСЃС‚СЊ РІС‹РґРµР»РµРЅРёРµ
    ta.addEventListener('contextmenu', e => {
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
      if (!sel) return; // РЅРµС‚ РІС‹РґРµР»РµРЅРёСЏ вЂ” РґР°С‘Рј Р±СЂР°СѓР·РµСЂСѓ РїРѕРєР°Р·Р°С‚СЊ СЃС‚Р°РЅРґР°СЂС‚РЅРѕРµ РјРµРЅСЋ
      e.preventDefault();
      e.stopPropagation();
      makeBar(ta, e.clientX, e.clientY);
    });

    // Touch: РїРѕРєР°Р·С‹РІР°РµРј РїРѕСЃР»Рµ РґРѕР»РіРѕРіРѕ РЅР°Р¶Р°С‚РёСЏ/РІС‹РґРµР»РµРЅРёСЏ
    ta.addEventListener('touchend', () => {
      setTimeout(() => {
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
        if (!sel) { removeBar(); return; }
        const r = ta.getBoundingClientRect();
        makeBar(ta, r.left + r.width / 2, r.top - 8);
      }, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('load', init);
})();

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// VOICE PLAYER  в†ђ РљР РђРЎРћРўРђ + РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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


// KEYBOARD SHORTCUTS  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// SIDEBAR MOBILE  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
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
  sidebar.classList.remove('open');
  sidebarOverlay?.classList.remove('open');
}

// Swipe to close sidebar on mobile
let _swipeX = 0;
document.addEventListener('touchstart', e => { _swipeX = e.touches[0].clientX; }, { passive:true });
document.addEventListener('touchend', e => {
  if (sidebar.classList.contains('open') && _swipeX > 80 && e.changedTouches[0].clientX - _swipeX < -60)
    toggleSidebar();
}, { passive:true });

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// REALTIME POLLING  в†ђ РЈР”РћР‘РЎРўР’Рћ: fallback
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// Smart real-time polling вЂ” every 8s as fallback for socket misses
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
// РЈРІРµР»РёС‡РµРЅРЅС‹Р№ РёРЅС‚РµСЂРІР°Р» вЂ” Р±СЂР°СѓР·РµСЂС‹ throttle-СЏС‚ С‚Р°Р№РјРµСЂС‹ РІ С„РѕРЅРµ РґРѕ ~60СЃ
// Socket.IO СЃР°Рј РїРѕРґРґРµСЂР¶РёРІР°РµС‚ СЃРѕРµРґРёРЅРµРЅРёРµ С‡РµСЂРµР· СЃРѕР±СЃС‚РІРµРЅРЅС‹Р№ keepalive
setInterval(() => { if (currentUser && socket.connected) socket.emit('ping'); }, 20000);

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// ONLINE BADGE  в†ђ РЈР”РћР‘РЎРўР’Рћ
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
socket.on('online-count', count => {
  if (onlineCount) onlineCount.textContent = count;
  if (onlinePill) onlinePill.style.display = count > 0 ? '' : 'none';
});

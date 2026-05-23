(() => {
  const root = document.documentElement;
  const topbar = document.querySelector('[data-topbar]');
  const menu = document.querySelector('[data-menu]');
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let installPrompt = null;
  let toastTimer = 0;

  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const platform = (() => {
    const ua = navigator.userAgent || '';
    const platformValue = navigator.userAgentData?.platform || navigator.platform || '';
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const ios = /iPhone|iPad|iPod/i.test(ua) || (platformValue === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const windows = /Win/i.test(platformValue);
    const mac = /Mac/i.test(platformValue) && !ios;
    const linux = /Linux/i.test(platformValue) && !android;
    const desktop = !mobile && !ios && !android;

    let name = 'устройства';
    let label = 'Скачать приложение';
    let pill = 'Ваше устройство определено';

    if (ios) {
      name = 'iPhone';
      label = 'Скачать на iPhone';
      pill = 'iOS: добавить на экран';
    } else if (android) {
      name = 'Android';
      label = 'Скачать на Android';
      pill = 'Android: установка через браузер';
    } else if (windows) {
      name = 'Windows';
      label = 'Скачать для Windows';
      pill = 'Windows: установка как приложение';
    } else if (mac) {
      name = 'macOS';
      label = 'Скачать для macOS';
      pill = 'macOS: установка как приложение';
    } else if (linux) {
      name = 'Linux';
      label = 'Скачать для Linux';
      pill = 'Linux: установка как приложение';
    } else if (desktop) {
      name = 'ПК';
      label = 'Скачать для ПК';
      pill = 'ПК: установка как приложение';
    }

    return { ua, name, label, pill, mobile, ios, android, windows, mac, linux, desktop };
  })();

  const setPlatformCopy = () => {
    qsa('[data-install-label], [data-install-label-secondary]').forEach((node) => {
      node.textContent = platform.label;
    });

    const pill = qs('[data-platform-pill]');
    if (pill) pill.textContent = platform.pill;
  };

  const showToast = (message) => {
    const toast = qs('[data-toast]');
    if (!toast) return;

    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 3600);
  };

  const openInstallModal = () => {
    const modal = qs('[data-install-modal]');
    const instruction = qs('[data-install-instruction]');
    const steps = qs('[data-install-steps]');
    if (!modal || !instruction || !steps) return;

    let text = 'Откройте меню браузера и выберите установку приложения. После этого Aura появится на рабочем столе или главном экране.';
    let stepList = [
      'Откройте Aura в браузере.',
      'Найдите в адресной строке кнопку установки приложения.',
      'Подтвердите установку и запустите Aura как обычное приложение.'
    ];

    if (platform.ios) {
      text = 'На iPhone установка работает через Safari. Добавьте Aura на экран «Домой», и она будет запускаться как приложение.';
      stepList = [
        'Откройте сайт в Safari.',
        'Нажмите кнопку «Поделиться».',
        'Выберите «На экран Домой» и подтвердите добавление.'
      ];
    } else if (platform.android) {
      text = 'На Android Aura можно установить через браузер или добавить на главный экран.';
      stepList = [
        'Откройте сайт в Chrome или другом браузере.',
        'Нажмите «Установить приложение» или меню ⋮.',
        'Выберите «Добавить на главный экран» / «Установить приложение».'
      ];
    } else {
      text = 'На ПК Aura устанавливается как PWA-приложение через Chrome, Edge или другой поддерживаемый браузер.';
      stepList = [
        'Откройте сайт в Chrome, Edge или похожем браузере.',
        'Нажмите иконку установки в адресной строке или меню браузера.',
        'Подтвердите установку — ярлык Aura появится на рабочем столе.'
      ];
    }

    instruction.textContent = text;
    steps.innerHTML = stepList.map((step, index) => `<div><strong>${index + 1}.</strong> ${step}</div>`).join('');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeInstallModal = () => {
    const modal = qs('[data-install-modal]');
    if (!modal) return;

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const installApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice.catch(() => null);
      installPrompt = null;

      if (choice?.outcome === 'accepted') {
        showToast('Aura устанавливается на ваше устройство.');
      } else {
        showToast('Установку можно запустить позже этой же кнопкой.');
      }
      return;
    }

    openInstallModal();
  };

  const setupInstall = () => {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      showToast(`Aura готова к установке на ${platform.name}.`);
    });

    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      showToast('Aura установлена. Запускайте её как обычное приложение.');
    });

    qsa('[data-install-button], [data-install-button-secondary], [data-install-footer]').forEach((button) => {
      button.addEventListener('click', installApp);
    });

    qsa('[data-close-install]').forEach((button) => {
      button.addEventListener('click', closeInstallModal);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeInstallModal();
    });
  };

  const setupNav = () => {
    const updateTopbar = () => {
      if (topbar) topbar.classList.toggle('is-scrolled', window.scrollY > 12);
    };

    updateTopbar();
    window.addEventListener('scroll', updateTopbar, { passive: true });

    if (!menu || !menuToggle) return;

    menuToggle.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('is-open');
      menuToggle.classList.toggle('is-open', isOpen);
      menuToggle.setAttribute('aria-expanded', String(isOpen));
    });

    qsa('a', menu).forEach((link) => {
      link.addEventListener('click', () => {
        menu.classList.remove('is-open');
        menuToggle.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  };

  const setupPointer = () => {
    if (reduceMotion) return;

    let raf = 0;
    window.addEventListener('pointermove', (event) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        root.style.setProperty('--mx', `${event.clientX}px`);
        root.style.setProperty('--my', `${event.clientY}px`);
        raf = 0;
      });
    }, { passive: true });
  };

  const setupReveal = () => {
    const items = qsa('.reveal');
    if (!items.length) return;

    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -40px 0px' });

    items.forEach((item) => observer.observe(item));
  };

  const setupTilt = () => {
    if (reduceMotion || window.matchMedia('(pointer: coarse)').matches) return;

    qsa('[data-tilt]').forEach((card) => {
      let raf = 0;
      let currentX = 0.5;
      let currentY = 0.5;
      let targetX = 0.5;
      let targetY = 0.5;
      let hovering = false;
      const stableTarget = card.classList.contains('app-window') ? qs('.messenger-mockup', card) : card;
      const isHeroPreview = card.classList.contains('app-window');

      const render = () => {
        currentX += (targetX - currentX) * 0.16;
        currentY += (targetY - currentY) * 0.16;
        const rotateY = (currentX - .5) * (isHeroPreview ? 3.2 : 5);
        const rotateX = (.5 - currentY) * (isHeroPreview ? 2.4 : 5);
        stableTarget.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(${isHeroPreview ? 0 : -3}px)`;

        if (hovering || Math.abs(targetX - currentX) > 0.004 || Math.abs(targetY - currentY) > 0.004) {
          raf = requestAnimationFrame(render);
        } else {
          raf = 0;
          if (!hovering && Math.abs(currentX - .5) < 0.01 && Math.abs(currentY - .5) < 0.01) {
            stableTarget.style.transform = '';
          }
        }
      };

      const startAnim = () => {
        if (!raf) raf = requestAnimationFrame(render);
      };

      const reset = () => {
        hovering = false;
        targetX = 0.5;
        targetY = 0.5;
        startAnim();
      };

      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        hovering = true;
        targetX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        targetY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));

        card.style.setProperty('--mx', `${targetX * 100}%`);
        card.style.setProperty('--my', `${targetY * 100}%`);
        startAnim();
      }, { passive: true });

      card.addEventListener('pointerleave', reset);
      card.addEventListener('blur', reset);
    });
  };

  const setupMagneticButtons = () => {
    if (reduceMotion || window.matchMedia('(pointer: coarse)').matches) return;

    qsa('.magnetic, .btn').forEach((button) => {
      button.addEventListener('pointermove', (event) => {
        const rect = button.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        button.style.setProperty('--x', `${x}px`);
        button.style.setProperty('--y', `${y}px`);

        if (!button.classList.contains('magnetic')) return;
        const dx = (x - rect.width / 2) * .08;
        const dy = (y - rect.height / 2) * .12;
        button.style.transform = `translate(${dx}px, ${dy}px)`;
      });

      button.addEventListener('pointerleave', () => {
        button.style.transform = '';
      });
    });
  };

  const setupCanvas = () => {
    if (reduceMotion) return;

    const canvas = qs('#auroraCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let particles = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(86, Math.max(32, Math.floor((width * height) / 21000)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.9 + .5,
        vx: (Math.random() - .5) * .22,
        vy: (Math.random() - .5) * .22,
        alpha: Math.random() * .42 + .16
      }));
    };

    const tick = () => {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 8);
        gradient.addColorStop(0, `rgba(196,181,253,${p.alpha})`);
        gradient.addColorStop(1, 'rgba(196,181,253,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 8, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 150) continue;

          ctx.strokeStyle = `rgba(99,102,241,${(1 - dist / 150) * .18})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      requestAnimationFrame(tick);
    };

    resize();
    tick();

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 150);
    }, { passive: true });
  };

  const setupTicker = () => {
    const ticker = qs('.ticker');
    if (!ticker) return;
    const track = qs('.ticker-track', ticker);
    if (!track) return;
    const source = qs('.ticker-group', track);
    if (!source) return;

    const rebuild = () => {
      const groups = qsa('.ticker-group', track);
      groups.slice(1).forEach((group) => group.remove());
      source.removeAttribute('aria-hidden');

      const sourceWidth = Math.ceil(source.getBoundingClientRect().width || source.scrollWidth);
      if (!sourceWidth) return;

      const minWidth = ticker.clientWidth + sourceWidth * 2;
      let guard = 0;
      while (track.scrollWidth < minWidth && guard < 32) {
        const clone = source.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.dataset.tickerClone = 'true';
        track.appendChild(clone);
        guard += 1;
      }

      track.style.setProperty('--ticker-distance', `${-sourceWidth}px`);
      track.style.setProperty('--ticker-duration', `${Math.max(18, sourceWidth / 28).toFixed(2)}s`);
    };

    rebuild();
    if (document.fonts?.ready) document.fonts.ready.then(rebuild).catch(() => {});

    let timer = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(rebuild, 120);
    }, { passive: true });
  };


  const setupPreviewMockup = () => {
    const app = qs('[data-preview-app]');
    if (!app) return;

    const title = qs('[data-preview-title]', app);
    const subtitle = qs('[data-preview-subtitle]', app);
    const message = qs('[data-preview-message]', app);
    const joinButton = qs('[data-preview-join]', app);
    const voice = qs('[data-preview-voice]', app);
    const voiceStatus = qs('[data-voice-status]', app);
    const composer = qs('[data-preview-compose]', app);
    const editor = qs('[data-preview-editor]', app);
    const sendButton = qs('[data-preview-send]', app);
    const feed = qs('[data-preview-feed]', app);
    const mediaRow = qs('[data-preview-media]', app);
    let autoReplySent = false;
    if (!feed || !editor || !composer || !sendButton) return;

    const escapeHtml = (value) => value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

    const scrollFeed = () => {
      feed.scrollTop = feed.scrollHeight;
    };

    const addMessage = ({ side = 'incoming', author = 'Aura', avatar = 'A', text = '', extraClass = '' }) => {
      const bubble = document.createElement('div');
      bubble.className = `msg ${side} ${extraClass} is-new`.trim();
      bubble.innerHTML = `<span class="avatar">${escapeHtml(avatar)}</span><div><strong>${escapeHtml(author)}</strong><p>${escapeHtml(text)}</p></div>`;
      if (mediaRow) feed.insertBefore(bubble, mediaRow);
      else feed.appendChild(bubble);
      requestAnimationFrame(scrollFeed);
      return bubble;
    };

    const addTyping = () => {
      const bubble = document.createElement('div');
      bubble.className = 'msg incoming reply-message is-new';
      bubble.innerHTML = '<span class="avatar">A</span><div><strong>Aura</strong><p class="typing-dots"><span></span><span></span><span></span></p></div>';
      if (mediaRow) feed.insertBefore(bubble, mediaRow);
      else feed.appendChild(bubble);
      requestAnimationFrame(scrollFeed);
      return bubble;
    };

    const makeReply = (userText) => {
      const currentTitle = title ? title.textContent : '';
      const normalized = userText.toLowerCase();

      if (normalized.includes('звон')) return 'Звонок запускается из чата в один клик, когда нужно быстро перейти к разговору.';
      if (normalized.includes('ai') || normalized.includes('ии')) return 'AI-помощник в Aura помогает быстрее отвечать, собирать идеи и структурировать обсуждение.';
      if (currentTitle.includes('проекты')) return 'Вот так выглядит переписка по проекту: ваши сообщения выделяются отдельно, а ответы команды остаются в общей ленте.';
      if (currentTitle.includes('идеи')) return 'Идеи можно быстро обсудить в отдельном канале и сразу сохранить контекст для всей команды.';
      if (normalized.includes('?')) return 'Да, именно так выглядит ответ в Aura: ваши сообщения выделены цветом, а сообщения собеседника выглядят отдельно.';
      return 'Вот так выглядят ваши сообщения в Aura: исходящее сообщение выделяется цветом, а ответы команды остаются в общем стиле мессенджера.';
    };

    qsa('[data-preview-channel]', app).forEach((channel) => {
      const activate = () => {
        qsa('[data-preview-channel]', app).forEach((item) => item.classList.remove('active'));
        channel.classList.add('active');
        if (title) title.textContent = channel.dataset.title || channel.textContent.trim();
        if (subtitle) subtitle.textContent = channel.dataset.subtitle || 'пространство Aura';
        if (message) message.textContent = channel.dataset.message || 'Канал открыт в превью интерфейса.';
      };
      channel.addEventListener('click', activate);
      channel.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });

    qsa('[data-preview-server]', app).forEach((server) => {
      const activate = () => {
        qsa('[data-preview-server]', app).forEach((item) => item.classList.remove('active'));
        server.classList.add('active');
      };
      server.addEventListener('click', activate);
      server.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });

    if (joinButton) {
      joinButton.addEventListener('click', () => {
        const joined = joinButton.classList.toggle('is-joined');
        joinButton.textContent = joined ? 'Joined' : 'Join';
      });
    }

    if (voice) {
      const toggleVoice = () => {
        const active = voice.classList.toggle('is-active');
        if (voiceStatus) voiceStatus.textContent = active ? 'вы подключены' : '4 участника';
      };
      voice.addEventListener('click', toggleVoice);
      voice.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleVoice();
        }
      });
    }

    qsa('[data-preview-media] span', app).forEach((item) => {
      const select = () => {
        qsa('[data-preview-media] span', app).forEach((media) => media.classList.remove('is-selected'));
        item.classList.add('is-selected');
      };
      item.addEventListener('click', select);
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });
    });

    const setComposerState = () => {
      composer.classList.toggle('is-composing', editor.textContent.trim().length > 0 || document.activeElement === editor);
    };

    const sendMessage = () => {
      const text = editor.textContent.replace(/\s+/g, ' ').trim();
      if (!text) return;

      addMessage({ side: 'outgoing', author: 'Вы', avatar: 'В', text, extraClass: 'user-message' });
      editor.textContent = '';
      setComposerState();

      if (!autoReplySent) {
        autoReplySent = true;
        const typingBubble = addTyping();
        window.setTimeout(() => {
          typingBubble.remove();
          addMessage({ side: 'incoming', author: 'Aura', avatar: 'A', text: makeReply(text), extraClass: 'reply-message' });
        }, 850);
      }
    };

    composer.addEventListener('click', () => editor.focus());
    editor.addEventListener('focus', setComposerState);
    editor.addEventListener('blur', () => window.setTimeout(setComposerState, 20));
    editor.addEventListener('input', setComposerState);
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    sendButton.addEventListener('click', sendMessage);
  };

  const setupServiceWorker = () => {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  };

  setPlatformCopy();
  setupInstall();
  setupNav();
  setupPointer();
  setupReveal();
  setupTilt();
  setupMagneticButtons();
  setupTicker();
  setupPreviewMockup();
  setupCanvas();
  setupServiceWorker();
})();

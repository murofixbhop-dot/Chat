'use strict';

(function setupIconFallback() {
  function checkIcons() {
    const test = document.createElement('i');
    test.className = 'ti ti-home';
    test.style.cssText = 'position:absolute;visibility:hidden;font-size:16px';
    document.body.appendChild(test);
    const width = test.getBoundingClientRect().width;
    document.body.removeChild(test);

    if (width >= 3) return;
    const fallback = document.getElementById('tablerFallback');
    if (!fallback || fallback.href) return;

    fallback.href = 'https://unpkg.com/@tabler/icons-webfont@3.14.0/dist/tabler-icons.min.css';
    setTimeout(() => {
      const secondTest = document.createElement('i');
      secondTest.className = 'ti ti-home';
      secondTest.style.cssText = 'position:absolute;visibility:hidden;font-size:16px';
      document.body.appendChild(secondTest);
      const secondWidth = secondTest.getBoundingClientRect().width;
      document.body.removeChild(secondTest);

      if (secondWidth < 3) {
        const third = document.createElement('link');
        third.rel = 'stylesheet';
        third.href = 'https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/3.14.0/tabler-icons.min.css';
        document.head.appendChild(third);
      }
    }, 2000);
  }

  if (document.readyState === 'complete') setTimeout(checkIcons, 500);
  else window.addEventListener('load', () => setTimeout(checkIcons, 500));
})();

(function keepMobileFocusStable() {
  if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return;
  let lastScrollY = 0;

  document.addEventListener('focusin', event => {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      lastScrollY = window.scrollY;
      setTimeout(() => window.scrollTo(0, lastScrollY), 100);
    }
  });

  window.addEventListener('resize', () => {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    window.scrollTo(0, lastScrollY);
  });

  document.addEventListener('touchstart', () => {}, { passive: true });
})();

(function setupPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW:', reg.scope))
      .catch(err => console.warn('SW fail:', err));
  }

  let installPrompt = null;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    setTimeout(showInstallButton, 1500);
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    document.getElementById('pwaInstallBtn')?.remove();
  });

  function showInstallButton() {
    if (!installPrompt || document.getElementById('pwaInstallBtn')) return;

    const button = document.createElement('button');
    button.id = 'pwaInstallBtn';
    button.className = 'pwa-install-btn';
    button.innerHTML = '<i class="ti ti-download"></i> Установить приложение';
    button.onclick = async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      button.remove();
      if (outcome === 'accepted' && typeof toast === 'function') {
        toast('Приложение установлено!', 'success');
      }
    };

    const profile = document.querySelector('.sb-profile');
    if (profile) profile.parentNode.insertBefore(button, profile);
    else document.body.appendChild(button);
  }
})();

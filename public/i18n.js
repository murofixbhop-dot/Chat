(() => {
  const STORAGE_KEY = 'aura:language';
  const MANUAL_KEY = 'aura:language:manual';
  const SUPPORTED = ['ru', 'en', 'es', 'pt', 'fr', 'de', 'it', 'tr', 'uk', 'pl', 'ar', 'zh', 'ja', 'ko', 'hi', 'id', 'nl', 'sv', 'no', 'da', 'fi', 'cs', 'ro', 'hu', 'vi', 'th', 'he', 'fa'];
  const RTL = new Set(['ar', 'he', 'fa']);

  const LANGUAGE_NAMES = {
    ru: 'Русский',
    en: 'English',
    es: 'Español',
    pt: 'Português',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    tr: 'Türkçe',
    uk: 'Українська',
    pl: 'Polski',
    ar: 'العربية',
    zh: '中文',
    ja: '日本語',
    ko: '한국어',
    hi: 'हिन्दी',
    id: 'Indonesia',
    nl: 'Nederlands',
    sv: 'Svenska',
    no: 'Norsk',
    da: 'Dansk',
    fi: 'Suomi',
    cs: 'Čeština',
    ro: 'Română',
    hu: 'Magyar',
    vi: 'Tiếng Việt',
    th: 'ไทย',
    he: 'עברית',
    fa: 'فارسی'
  };

  const COUNTRY_LANGUAGE = {
    RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru', AM: 'ru',
    UA: 'uk',
    US: 'en', GB: 'en', IE: 'en', CA: 'en', AU: 'en', NZ: 'en', ZA: 'en', PH: 'en',
    ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', UY: 'es', PY: 'es', BO: 'es', CR: 'es', PA: 'es', DO: 'es', GT: 'es', HN: 'es', SV: 'es', NI: 'es',
    BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt',
    FR: 'fr', BE: 'fr', MC: 'fr', LU: 'fr', SN: 'fr', CI: 'fr', CM: 'fr', CD: 'fr',
    DE: 'de', AT: 'de', CH: 'de',
    IT: 'it', SM: 'it',
    TR: 'tr', CY: 'tr',
    PL: 'pl',
    CN: 'zh', HK: 'zh', MO: 'zh', TW: 'zh', SG: 'zh',
    JP: 'ja',
    KR: 'ko',
    IN: 'hi',
    ID: 'id',
    NL: 'nl',
    SE: 'sv',
    NO: 'no',
    DK: 'da',
    FI: 'fi',
    CZ: 'cs',
    RO: 'ro',
    HU: 'hu',
    VN: 'vi',
    TH: 'th',
    IL: 'he',
    IR: 'fa',
    SA: 'ar', AE: 'ar', EG: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', LY: 'ar', JO: 'ar', LB: 'ar', IQ: 'ar', KW: 'ar', QA: 'ar', BH: 'ar', OM: 'ar', YE: 'ar', PS: 'ar', SD: 'ar', SY: 'ar'
  };

  const base = {
    'page.title': 'Aura Messenger - download or open in browser',
    'meta.description': 'Aura Messenger is a modern messenger for projects, teams, and friends. Chats, voice messages, calls, media, AI, and instant browser access.',
    'meta.ogTitle': 'Aura Messenger - communication for your projects',
    'meta.ogDescription': 'Create spaces, chat, send media, start calls, and open Aura right in the browser.',
    'nav.menu': 'Open menu',
    'nav.about': 'About',
    'nav.features': 'Features',
    'nav.download': 'Download',
    'nav.browser': 'In browser',
    'nav.openAura': 'Open Aura',
    'hero.title': 'A space for communication,<span>always within reach.</span>',
    'hero.lead': 'Aura Messenger brings teams, friends, and projects together in one place: topic chats, voice messages, calls, media, an AI assistant, and instant browser login.',
    'cta.download': 'Download app',
    'cta.browser': 'Open in browser',
    'platform.detecting': 'Detecting device...',
    'platform.simple': 'No extra steps',
    'platform.online': 'Works online',
    'platform.genericName': 'device',
    'platform.genericLabel': 'Download app',
    'platform.genericPill': 'Your device is detected',
    'platform.iosLabel': 'Download for iPhone',
    'platform.iosPill': 'iOS: add to Home Screen',
    'platform.androidLabel': 'Download for Android',
    'platform.androidPill': 'Android: install from browser',
    'platform.windowsLabel': 'Download for Windows',
    'platform.windowsPill': 'Windows: install as an app',
    'platform.macLabel': 'Download for macOS',
    'platform.macPill': 'macOS: install as an app',
    'platform.linuxLabel': 'Download for Linux',
    'platform.linuxPill': 'Linux: install as an app',
    'platform.desktopLabel': 'Download for desktop',
    'platform.desktopPill': 'Desktop: install as an app',
    'preview.aria': 'Aura Messenger preview',
    'preview.textChannels': 'Text channels',
    'preview.general': '# general-chat',
    'preview.projects': '# projects',
    'preview.ideas': '# ideas',
    'preview.voice': 'Voice',
    'preview.voiceRoom': 'Team room',
    'preview.voiceStatus': '4 members',
    'preview.voiceConnected': 'you are connected',
    'preview.generalSub': 'fast communication without noise',
    'preview.generalMessage': 'Discuss ideas, files, and team plans in one place.',
    'preview.projectsSub': 'tasks, releases, and decisions',
    'preview.projectsMessage': 'Keep project discussions together so nothing gets lost.',
    'preview.ideasSub': 'drafts, proposals, and quick notes',
    'preview.ideasMessage': 'Capture ideas and turn them into clear decisions.',
    'preview.join': 'Join',
    'preview.joined': 'Joined',
    'preview.auraMessage': 'Download the app or open the messenger in your browser - both options are ready instantly.',
    'preview.messageLabel': 'Message',
    'preview.placeholder': 'Write a message...',
    'preview.send': 'Send message',
    'preview.you': 'You',
    'preview.reply.default': 'This is how your messages look in Aura: outgoing messages are highlighted, while team replies stay in a clean messenger style.',
    'preview.reply.question': 'Yes, this is how replies look in Aura: your message is highlighted, and the other side stays visually separate.',
    'preview.reply.call': 'Calls start from a chat in one click when you need to move into a conversation fast.',
    'preview.reply.ai': 'Aura AI helps answer faster, collect ideas, and structure discussions.',
    'preview.reply.projects': 'Project chats keep decisions, files, and replies in one clear feed.',
    'preview.reply.ideas': 'Ideas can be discussed in a separate channel and kept with context for the whole team.',
    'ticker.chats': 'Chats',
    'ticker.voice': 'Voice',
    'ticker.video': 'Video',
    'ticker.media': 'Media',
    'ticker.ai': 'AI',
    'ticker.pwa': 'PWA',
    'ticker.browser': 'Browser',
    'ticker.teams': 'Teams',
    'about.kicker': 'About',
    'about.title': 'Aura is a messenger for projects where all communication lives in one window.',
    'about.body': 'Create a space for a team or community, split discussions by channels, send media, jump into calls, and connect an AI assistant for quick answers.',
    'about.link': 'Try without downloading ->',
    'about.card1.title': 'Order in communication',
    'about.card1.body': 'Channels keep topics, files, and decisions separated so the team finds what matters faster.',
    'about.card2.title': 'Instant entry',
    'about.card2.body': 'Open Aura in the browser and start chatting without installation, waiting, or extra redirects.',
    'about.card3.title': 'App on your device',
    'about.card3.body': 'Install Aura as a PWA on desktop or phone so it opens like a normal app.',
    'features.kicker': 'Features',
    'features.title': 'Everything for communication, work, and quick decisions.',
    'features.body': 'Aura feels like a full app while staying available from any device by link.',
    'feature.chats.title': 'Channels and chats',
    'feature.chats.body': 'Collect conversations in clear spaces: general chat, projects, ideas, support, and private rooms.',
    'feature.voice.title': 'Voice and media',
    'feature.voice.body': 'Send voice messages, files, photos, and videos without switching services.',
    'feature.calls.title': 'Calls',
    'feature.calls.body': 'Move from text to a live call when a question needs to be solved now.',
    'feature.ai.title': 'Aura AI',
    'feature.ai.body': 'Use the built-in assistant for ideas, quick answers, and working with messages.',
    'feature.squares.title': 'Squares',
    'feature.squares.body': 'Record short square videos, like stories in chat but made for Aura.',
    'feature.browser.title': 'No-install access',
    'feature.browser.body': 'Open the web version in one click - perfect for first launch, guests, and any device.',
    'download.kicker': 'Download Aura',
    'download.title': 'Install Aura on desktop or phone and launch it like a normal app.',
    'download.body': 'Aura supports PWA installation: your browser can add the messenger to the desktop or home screen, and the download button shows the right option for your device.',
    'device.desktop.os': 'Windows / macOS / Linux',
    'device.desktop.title': 'For desktop',
    'device.desktop.body': 'Install through Chrome, Edge, or another PWA-ready browser.',
    'device.android.os': 'Android',
    'device.android.title': 'On Home Screen',
    'device.android.body': 'Install through the Aura button or your browser menu.',
    'device.iphone.os': 'iPhone',
    'device.iphone.title': 'Add to Home',
    'device.iphone.body': 'Safari -> Share -> Add to Home Screen.',
    'browser.kicker': 'Browser version',
    'browser.title': 'Do not want to install? Open Aura right now.',
    'browser.body': 'The web version goes to the same messenger and is great for quick tests, guest login, or another device.',
    'browser.url': 'https://your-site.com/app.html',
    'footer.tagline': 'One space for chats, media, and teamwork.',
    'footer.top': 'Top',
    'footer.open': 'Open Aura',
    'footer.download': 'Download',
    'install.close': 'Close',
    'install.title': 'Install Aura',
    'install.defaultText': 'Open your browser menu and choose app installation. Aura will appear on your desktop or home screen.',
    'install.defaultSteps': 'Open Aura in the browser.|Find the app install button in the address bar.|Confirm installation and launch Aura like a normal app.',
    'install.iosText': 'On iPhone, installation works through Safari. Add Aura to the Home Screen and it will launch like an app.',
    'install.iosSteps': 'Open the site in Safari.|Tap Share.|Choose Add to Home Screen and confirm.',
    'install.androidText': 'On Android, Aura can be installed through the browser or added to the Home Screen.',
    'install.androidSteps': 'Open the site in Chrome or another browser.|Tap Install app or the menu.|Choose Add to Home Screen / Install app.',
    'install.desktopText': 'On desktop, Aura installs as a PWA through Chrome, Edge, or another supported browser.',
    'install.desktopSteps': 'Open the site in Chrome, Edge, or a similar browser.|Click the install icon in the address bar or browser menu.|Confirm installation - the Aura shortcut will appear on your desktop.',
    'install.ok': 'Got it',
    'toast.installReady': 'Aura is ready to install on {device}.',
    'toast.installAccepted': 'Aura is installing on your device.',
    'toast.installDismissed': 'You can start installation later with the same button.',
    'toast.installed': 'Aura is installed. Launch it like a normal app.',
    'app.loading': 'Connecting...',
    'app.connected': 'Connected',
    'app.connectionError': 'Connection error...',
    'app.callStatus': 'Call...',
    'app.cancel': 'Cancel',
    'app.send': 'Send',
    'app.loginTitle': 'Welcome<br/>to <span class="grad">Aura</span>',
    'app.loginSub': 'Enter username and password',
    'app.registerSub': 'Create an account',
    'app.loginUsername': 'Username...',
    'app.loginPassword': 'Password (min. 8 characters)...',
    'app.showPassword': 'Show password',
    'app.recoveryEmail': 'Email for password recovery',
    'app.loginButton': 'Sign in <i class="ti ti-arrow-right"></i>',
    'app.registerButton': 'Register <i class="ti ti-user-plus"></i>',
    'app.forgot': '<i class="ti ti-lock-open"></i>Forgot password?',
    'app.register': 'Register',
    'app.loginLink': 'Sign in',
    'app.theme': 'Theme:',
    'app.themeName': 'Theme',
    'app.settings': '<i class="ti ti-settings-2"></i> Settings',
    'app.profile': '<i class="ti ti-user"></i>Profile',
    'app.sound': '<i class="ti ti-headphones"></i>Sound',
    'app.themeTab': '<i class="ti ti-palette"></i>Theme',
    'app.account': '<i class="ti ti-shield-lock"></i>Account',
    'app.changeAvatar': 'Tap to change',
    'app.displayName': 'Display name',
    'app.save': '<i class="ti ti-check"></i> Save',
    'app.microphone': '<i class="ti ti-microphone"></i> Microphone',
    'app.default': 'Default',
    'app.speakers': '<i class="ti ti-volume"></i> Speakers',
    'app.volume': '<i class="ti ti-adjustments-h"></i> Volume -',
    'app.testMic': '<i class="ti ti-microphone"></i> Test microphone',
    'app.notificationSound': '<i class="ti ti-music"></i> Notification sound',
    'app.standardSound': 'Standard sound',
    'app.upload': '<i class="ti ti-upload"></i> Upload',
    'app.preview': '<i class="ti ti-player-play"></i> Preview',
    'app.browserNotifications': 'Show browser notifications',
    'app.hide': '<i class="ti ti-eye-off"></i> Hide',
    'app.accentColor': 'Accent color',
    'app.darkTheme': '<i class="ti ti-moon"></i> Dark',
    'app.lightTheme': '<i class="ti ti-sun"></i> Light',
    'app.yourLogin': 'Your login',
    'app.recoveryEmailLabel': '<i class="ti ti-mail"></i> Recovery email',
    'app.emailVerified': '<i class="ti ti-circle-check"></i> Email verified',
    'app.recoveryEmailHelp': 'Used for password recovery',
    'app.logout': '<i class="ti ti-logout"></i> Log out',
    'app.deleteAccount': '<i class="ti ti-trash"></i> Delete account',
    'app.createGroupTitle': '<i class="ti ti-users-group"></i> Create group',
    'app.name': 'Name',
    'app.groupPlaceholder': 'My group...',
    'app.members': 'Members',
    'app.create': '<i class="ti ti-check"></i> Create',
    'app.search': 'Search...',
    'app.chats': '<i class="ti ti-message"></i>Chats',
    'app.groups': '<i class="ti ti-users"></i>Groups',
    'app.requests': '<i class="ti ti-bell"></i>Requests',
    'app.addFriend': '<i class="ti ti-plus"></i> Add friend',
    'app.createGroup': '<i class="ti ti-plus"></i> Create group',
    'app.generalChat': 'General chat',
    'app.publicChat': 'Public chat',
    'app.online': 'online',
    'app.dropFile': 'Drop file',
    'app.startConversation': 'Start a conversation',
    'app.voice': 'Voice',
    'app.attach': 'Attach',
    'app.message': 'Message...',
    'app.messageAria': 'Message text',
    'app.forgotTitle': '<i class="ti ti-lock-open"></i> Password recovery',
    'app.forgotStep1': 'Enter your login - we will send a code to the linked email.',
    'app.sendCode': '<i class="ti ti-send"></i> Send code',
    'app.forgotStep2': 'Enter the 6-digit code from the email',
    'app.confirm': '<i class="ti ti-check"></i> Confirm',
    'app.resend': '<i class="ti ti-refresh"></i> Send again',
    'app.forgotStep3': 'Create a new password',
    'app.newPassword': 'New password (min. 8 characters)...',
    'app.changePassword': '<i class="ti ti-lock-check"></i> Change password',
    'app.emailConfirmTitle': '<i class="ti ti-mail-check"></i> Email confirmation',
    'app.emailSent': 'Code sent to your email',
    'app.aiWelcome': 'Web search · Weather · Exchange rates<br>Crypto · File generation · Code<br>Image analysis · Wikipedia and much more',
    'app.askAi': 'Ask anything...'
  };

  const dictionaries = {
    en: base,
    ru: {
      'page.title': 'Aura Messenger - скачать или открыть в браузере',
      'meta.description': 'Aura Messenger - современный мессенджер для проектов, команд и друзей. Чаты, голосовые, звонки, медиа, AI и быстрый запуск в браузере.',
      'meta.ogTitle': 'Aura Messenger - общение для ваших проектов',
      'meta.ogDescription': 'Создавайте пространства, общайтесь в чатах, отправляйте медиа, запускайте звонки и открывайте Aura прямо в браузере.',
      'nav.menu': 'Открыть меню',
      'platform.genericLabel': 'Скачать приложение',
      'platform.genericPill': 'Ваше устройство определено',
      'preview.reply.default': 'Вот так выглядят ваши сообщения в Aura: исходящее сообщение выделяется цветом, а ответы команды остаются в общем стиле мессенджера.',
      'preview.reply.question': 'Да, именно так выглядит ответ в Aura: ваше сообщение выделено цветом, а сообщения собеседника выглядят отдельно.',
      'preview.reply.call': 'Звонок запускается из чата в один клик, когда нужно быстро перейти к разговору.',
      'preview.reply.ai': 'AI-помощник в Aura помогает быстрее отвечать, собирать идеи и структурировать обсуждение.',
      'preview.reply.projects': 'В проектном чате решения, файлы и ответы остаются в одной понятной ленте.',
      'preview.reply.ideas': 'Идеи можно быстро обсудить в отдельном канале и сохранить контекст для всей команды.',
      'install.defaultSteps': 'Откройте Aura в браузере.|Найдите в адресной строке кнопку установки приложения.|Подтвердите установку и запустите Aura как обычное приложение.',
      'install.iosSteps': 'Откройте сайт в Safari.|Нажмите кнопку «Поделиться».|Выберите «На экран Домой» и подтвердите добавление.',
      'install.androidSteps': 'Откройте сайт в Chrome или другом браузере.|Нажмите «Установить приложение» или меню.|Выберите «Добавить на главный экран» / «Установить приложение».',
      'install.desktopSteps': 'Откройте сайт в Chrome, Edge или похожем браузере.|Нажмите иконку установки в адресной строке или меню браузера.|Подтвердите установку - ярлык Aura появится на рабочем столе.',
      'install.ok': 'Понятно',
      'toast.installReady': 'Aura готова к установке на {device}.',
      'toast.installAccepted': 'Aura устанавливается на ваше устройство.',
      'toast.installDismissed': 'Установку можно запустить позже этой же кнопкой.',
      'toast.installed': 'Aura установлена. Запускайте её как обычное приложение.',
      'app.connected': 'Подключено',
      'app.connectionError': 'Ошибка соединения...',
      'app.loginButton': 'Войти <i class="ti ti-arrow-right"></i>',
      'app.registerButton': 'Зарегистрироваться <i class="ti ti-user-plus"></i>',
      'app.forgot': '<i class="ti ti-lock-open"></i>Забыли пароль?',
      'app.register': 'Регистрация',
      'app.loginLink': 'Войти'
    },
    es: {
      'page.title': 'Aura Messenger - descargar o abrir en el navegador',
      'meta.description': 'Aura Messenger es un mensajero moderno para proyectos, equipos y amigos.',
      'nav.about': 'Producto', 'nav.features': 'Funciones', 'nav.download': 'Descargar', 'nav.browser': 'Navegador', 'nav.openAura': 'Abrir Aura',
      'hero.title': 'Un espacio para comunicarte,<span>siempre a mano.</span>',
      'hero.lead': 'Aura reúne equipos, amigos y proyectos en un solo lugar: chats por temas, voz, llamadas, media, IA y acceso inmediato desde el navegador.',
      'cta.download': 'Descargar app', 'cta.browser': 'Abrir en navegador',
      'platform.simple': 'Sin pasos extra', 'platform.online': 'Funciona online', 'platform.genericLabel': 'Descargar app', 'platform.genericPill': 'Dispositivo detectado',
      'platform.iosLabel': 'Descargar para iPhone', 'platform.androidLabel': 'Descargar para Android', 'platform.windowsLabel': 'Descargar para Windows', 'platform.macLabel': 'Descargar para macOS', 'platform.linuxLabel': 'Descargar para Linux', 'platform.desktopLabel': 'Descargar para PC',
      'preview.textChannels': 'Canales de texto', 'preview.voice': 'Voz', 'preview.voiceRoom': 'Sala del equipo', 'preview.voiceStatus': '4 miembros', 'preview.voiceConnected': 'estás conectado',
      'preview.general': '# chat-general', 'preview.projects': '# proyectos', 'preview.ideas': '# ideas', 'preview.generalSub': 'comunicación rápida sin ruido', 'preview.generalMessage': 'Ideas, archivos y planes del equipo en un solo lugar.', 'preview.projectsSub': 'tareas, lanzamientos y decisiones', 'preview.projectsMessage': 'Mantén las discusiones de proyectos juntas.', 'preview.ideasSub': 'borradores, propuestas y notas rápidas', 'preview.ideasMessage': 'Guarda ideas y conviértelas en decisiones claras.', 'preview.auraMessage': 'Descarga la app o abre Aura en el navegador: ambas opciones están listas.', 'preview.placeholder': 'Escribe un mensaje...', 'preview.you': 'Tú',
      'ticker.chats': 'Chats', 'ticker.voice': 'Voz', 'ticker.video': 'Video', 'ticker.media': 'Media', 'ticker.browser': 'Navegador', 'ticker.teams': 'Equipos',
      'about.kicker': 'Producto', 'about.title': 'Aura es un mensajero para proyectos donde toda la comunicación vive en una ventana.', 'about.body': 'Crea un espacio para tu equipo, separa conversaciones por canales, envía media, llama y usa IA para respuestas rápidas.', 'about.link': 'Probar sin descargar ->',
      'about.card1.title': 'Orden en la comunicación', 'about.card1.body': 'Los canales separan temas, archivos y decisiones.', 'about.card2.title': 'Entrada inmediata', 'about.card2.body': 'Abre Aura en el navegador y empieza sin instalar.', 'about.card3.title': 'App en tu dispositivo', 'about.card3.body': 'Instala Aura como PWA en PC o móvil.',
      'features.kicker': 'Funciones', 'features.title': 'Todo para comunicarte, trabajar y decidir rápido.', 'features.body': 'Aura se siente como una app completa y está disponible desde cualquier dispositivo.',
      'feature.chats.title': 'Canales y chats', 'feature.voice.title': 'Voz y media', 'feature.calls.title': 'Llamadas', 'feature.ai.title': 'Aura AI', 'feature.squares.title': 'Squares', 'feature.browser.title': 'Sin instalación',
      'download.kicker': 'Descargar Aura', 'download.title': 'Instala Aura en PC o móvil y ábrela como una app normal.', 'download.body': 'Aura admite instalación PWA: el navegador puede añadir el mensajero al escritorio o pantalla de inicio.',
      'browser.kicker': 'Versión web', 'browser.title': '¿No quieres instalar? Abre Aura ahora.', 'browser.body': 'La versión web abre el mismo mensajero y sirve para pruebas rápidas o dispositivos ajenos.',
      'footer.tagline': 'Un espacio para chats, media y trabajo en equipo.', 'footer.top': 'Arriba', 'footer.open': 'Abrir Aura',
      'install.title': 'Instalar Aura', 'install.ok': 'Entendido', 'install.defaultText': 'Abre el menú del navegador y elige instalar la app.', 'install.iosText': 'En iPhone se instala desde Safari.', 'install.androidText': 'En Android puedes instalar Aura desde el navegador.', 'install.desktopText': 'En PC Aura se instala como PWA.',
      'app.loading': 'Conectando...', 'app.loginTitle': 'Bienvenido<br/>a <span class="grad">Aura</span>', 'app.loginSub': 'Introduce usuario y contraseña', 'app.registerSub': 'Crea una cuenta', 'app.loginUsername': 'Usuario...', 'app.loginPassword': 'Contraseña (mín. 8 caracteres)...', 'app.loginButton': 'Entrar <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'Registrarse <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>¿Olvidaste la contraseña?', 'app.register': 'Registro', 'app.loginLink': 'Entrar', 'app.theme': 'Tema:', 'app.search': 'Buscar...', 'app.chats': '<i class="ti ti-message"></i>Chats', 'app.groups': '<i class="ti ti-users"></i>Grupos', 'app.requests': '<i class="ti ti-bell"></i>Solicitudes', 'app.message': 'Mensaje...', 'app.send': 'Enviar'
    },
    pt: {
      'page.title': 'Aura Messenger - baixar ou abrir no navegador',
      'nav.about': 'Produto', 'nav.features': 'Recursos', 'nav.download': 'Baixar', 'nav.browser': 'Navegador', 'nav.openAura': 'Abrir Aura',
      'hero.title': 'Um espaço para conversar,<span>sempre por perto.</span>',
      'hero.lead': 'Aura une equipes, amigos e projetos em um só lugar: chats por tema, voz, chamadas, mídia, IA e acesso instantâneo pelo navegador.',
      'cta.download': 'Baixar app', 'cta.browser': 'Abrir no navegador', 'platform.simple': 'Sem passos extras', 'platform.online': 'Funciona online',
      'about.kicker': 'Produto', 'about.title': 'Aura é um messenger para projetos com toda a conversa em uma janela.', 'about.body': 'Crie espaços, organize canais, envie mídia, faça chamadas e use IA para respostas rápidas.', 'about.link': 'Testar sem baixar ->',
      'features.kicker': 'Recursos', 'features.title': 'Tudo para conversar, trabalhar e decidir rápido.', 'download.kicker': 'Baixar Aura', 'download.title': 'Instale Aura no PC ou celular e abra como um app normal.', 'browser.kicker': 'Versão web', 'browser.title': 'Não quer instalar? Abra Aura agora.', 'footer.tagline': 'Um espaço para chats, mídia e trabalho em equipe.',
      'app.loginTitle': 'Bem-vindo<br/>ao <span class="grad">Aura</span>', 'app.loginSub': 'Digite usuário e senha', 'app.loginUsername': 'Usuário...', 'app.loginPassword': 'Senha (mín. 8 caracteres)...', 'app.loginButton': 'Entrar <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'Criar conta <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>Esqueceu a senha?', 'app.register': 'Cadastro', 'app.loginLink': 'Entrar', 'app.theme': 'Tema:', 'app.search': 'Buscar...', 'app.message': 'Mensagem...'
    },
    fr: {
      'page.title': 'Aura Messenger - télécharger ou ouvrir dans le navigateur',
      'nav.about': 'Produit', 'nav.features': 'Fonctions', 'nav.download': 'Télécharger', 'nav.browser': 'Navigateur', 'nav.openAura': 'Ouvrir Aura',
      'hero.title': 'Un espace pour communiquer,<span>toujours à portée.</span>',
      'hero.lead': 'Aura réunit équipes, amis et projets au même endroit : salons, messages vocaux, appels, médias, IA et accès instantané dans le navigateur.',
      'cta.download': 'Télécharger', 'cta.browser': 'Ouvrir dans le navigateur', 'platform.simple': 'Sans étapes inutiles', 'platform.online': 'Fonctionne en ligne',
      'about.kicker': 'Produit', 'about.title': 'Aura est une messagerie pour projets où toute la communication tient dans une fenêtre.', 'about.body': 'Créez un espace, organisez les discussions, envoyez des médias, lancez des appels et utilisez l’IA.', 'about.link': 'Essayer sans télécharger ->',
      'features.kicker': 'Fonctions', 'features.title': 'Tout pour communiquer, travailler et décider vite.', 'download.kicker': 'Télécharger Aura', 'download.title': 'Installez Aura sur ordinateur ou mobile.', 'browser.kicker': 'Version web', 'browser.title': 'Vous ne voulez pas installer ? Ouvrez Aura maintenant.',
      'app.loginTitle': 'Bienvenue<br/>dans <span class="grad">Aura</span>', 'app.loginSub': 'Entrez le nom et le mot de passe', 'app.loginUsername': 'Nom d’utilisateur...', 'app.loginPassword': 'Mot de passe (min. 8 caractères)...', 'app.loginButton': 'Connexion <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'Créer un compte <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>Mot de passe oublié ?', 'app.register': 'Inscription', 'app.loginLink': 'Connexion', 'app.theme': 'Thème:', 'app.search': 'Recherche...', 'app.message': 'Message...'
    },
    de: {
      'page.title': 'Aura Messenger - herunterladen oder im Browser öffnen',
      'nav.about': 'Produkt', 'nav.features': 'Funktionen', 'nav.download': 'Download', 'nav.browser': 'Browser', 'nav.openAura': 'Aura öffnen',
      'hero.title': 'Ein Raum für Kommunikation,<span>immer griffbereit.</span>',
      'hero.lead': 'Aura verbindet Teams, Freunde und Projekte: Themenchats, Sprachnachrichten, Anrufe, Medien, KI und sofortiger Browserzugang.',
      'cta.download': 'App laden', 'cta.browser': 'Im Browser öffnen', 'platform.simple': 'Ohne Zusatzschritte', 'platform.online': 'Online verfügbar',
      'about.kicker': 'Produkt', 'about.title': 'Aura ist ein Messenger für Projekte, in dem alles in einem Fenster bleibt.', 'about.body': 'Erstelle Räume, organisiere Kanäle, sende Medien, starte Anrufe und nutze KI für schnelle Antworten.', 'about.link': 'Ohne Download testen ->',
      'features.kicker': 'Funktionen', 'features.title': 'Alles für Kommunikation, Arbeit und schnelle Entscheidungen.', 'download.kicker': 'Aura herunterladen', 'download.title': 'Installiere Aura auf Desktop oder Smartphone.', 'browser.kicker': 'Webversion', 'browser.title': 'Nicht installieren? Öffne Aura sofort.',
      'app.loginTitle': 'Willkommen<br/>bei <span class="grad">Aura</span>', 'app.loginSub': 'Benutzername und Passwort eingeben', 'app.loginUsername': 'Benutzername...', 'app.loginPassword': 'Passwort (min. 8 Zeichen)...', 'app.loginButton': 'Anmelden <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'Registrieren <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>Passwort vergessen?', 'app.register': 'Registrieren', 'app.loginLink': 'Anmelden', 'app.theme': 'Design:', 'app.search': 'Suchen...', 'app.message': 'Nachricht...'
    },
    it: {
      'page.title': 'Aura Messenger - scarica o apri nel browser',
      'nav.about': 'Prodotto', 'nav.features': 'Funzioni', 'nav.download': 'Scarica', 'nav.browser': 'Browser', 'nav.openAura': 'Apri Aura',
      'hero.title': 'Uno spazio per comunicare,<span>sempre a portata.</span>',
      'hero.lead': 'Aura unisce team, amici e progetti: chat tematiche, voce, chiamate, media, AI e accesso immediato dal browser.',
      'cta.download': 'Scarica app', 'cta.browser': 'Apri nel browser', 'about.kicker': 'Prodotto', 'about.title': 'Aura è un messenger per progetti con tutto in una finestra.', 'features.kicker': 'Funzioni', 'features.title': 'Tutto per comunicare, lavorare e decidere velocemente.', 'download.kicker': 'Scarica Aura', 'browser.kicker': 'Versione web',
      'app.loginTitle': 'Benvenuto<br/>in <span class="grad">Aura</span>', 'app.loginSub': 'Inserisci nome e password', 'app.loginUsername': 'Nome utente...', 'app.loginPassword': 'Password (min. 8 caratteri)...', 'app.loginButton': 'Accedi <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'Registrati <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>Password dimenticata?', 'app.register': 'Registrazione', 'app.loginLink': 'Accedi', 'app.search': 'Cerca...', 'app.message': 'Messaggio...'
    },
    tr: {
      'page.title': 'Aura Messenger - indir veya tarayıcıda aç',
      'nav.about': 'Ürün', 'nav.features': 'Özellikler', 'nav.download': 'İndir', 'nav.browser': 'Tarayıcı', 'nav.openAura': 'Aura aç',
      'hero.title': 'İletişim için bir alan,<span>her zaman elinin altında.</span>',
      'hero.lead': 'Aura ekipleri, arkadaşları ve projeleri tek yerde toplar: konu sohbetleri, ses, aramalar, medya, AI ve hızlı tarayıcı girişi.',
      'cta.download': 'Uygulamayı indir', 'cta.browser': 'Tarayıcıda aç', 'about.kicker': 'Ürün', 'about.title': 'Aura, tüm iletişimi tek pencerede toplayan proje mesajlaşmasıdır.', 'features.kicker': 'Özellikler', 'features.title': 'İletişim, çalışma ve hızlı karar için her şey.',
      'app.loginTitle': '<span class="grad">Aura</span>\'ya<br/>hoş geldin', 'app.loginSub': 'Kullanıcı adı ve şifre gir', 'app.loginUsername': 'Kullanıcı adı...', 'app.loginPassword': 'Şifre (min. 8 karakter)...', 'app.loginButton': 'Giriş <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'Kayıt ol <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>Şifreni mi unuttun?', 'app.register': 'Kayıt', 'app.loginLink': 'Giriş', 'app.search': 'Ara...', 'app.message': 'Mesaj...'
    },
    uk: {
      'page.title': 'Aura Messenger - завантажити або відкрити в браузері',
      'nav.about': 'Про продукт', 'nav.features': 'Можливості', 'nav.download': 'Завантажити', 'nav.browser': 'У браузері', 'nav.openAura': 'Відкрити Aura',
      'hero.title': 'Простір для спілкування,<span>який завжди поруч.</span>',
      'hero.lead': 'Aura об’єднує команди, друзів і проєкти: чати за темами, голосові, дзвінки, медіа, AI та швидкий вхід через браузер.',
      'cta.download': 'Завантажити застосунок', 'cta.browser': 'Відкрити в браузері', 'about.kicker': 'Про продукт', 'about.title': 'Aura - месенджер для проєктів, де все спілкування в одному вікні.', 'features.kicker': 'Можливості', 'features.title': 'Усе для спілкування, роботи й швидких рішень.',
      'app.loginTitle': 'Ласкаво просимо<br/>в <span class="grad">Aura</span>', 'app.loginSub': 'Введіть ім’я і пароль', 'app.loginUsername': 'Ім’я користувача...', 'app.loginPassword': 'Пароль (мін. 8 символів)...', 'app.loginButton': 'Увійти <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'Зареєструватися <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>Забули пароль?', 'app.register': 'Реєстрація', 'app.loginLink': 'Увійти', 'app.search': 'Пошук...', 'app.message': 'Повідомлення...'
    },
    pl: {
      'page.title': 'Aura Messenger - pobierz lub otwórz w przeglądarce',
      'nav.about': 'Produkt', 'nav.features': 'Funkcje', 'nav.download': 'Pobierz', 'nav.browser': 'Przeglądarka', 'nav.openAura': 'Otwórz Aura',
      'hero.title': 'Przestrzeń do komunikacji,<span>zawsze pod ręką.</span>',
      'hero.lead': 'Aura łączy zespoły, znajomych i projekty: czaty tematyczne, głos, rozmowy, media, AI i szybkie wejście z przeglądarki.',
      'cta.download': 'Pobierz aplikację', 'cta.browser': 'Otwórz w przeglądarce', 'about.kicker': 'Produkt', 'about.title': 'Aura to komunikator dla projektów, gdzie wszystko jest w jednym oknie.', 'features.kicker': 'Funkcje', 'features.title': 'Wszystko do rozmów, pracy i szybkich decyzji.',
      'app.loginTitle': 'Witaj<br/>w <span class="grad">Aura</span>', 'app.loginSub': 'Wpisz nazwę i hasło', 'app.loginUsername': 'Nazwa użytkownika...', 'app.loginPassword': 'Hasło (min. 8 znaków)...', 'app.loginButton': 'Zaloguj <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'Zarejestruj <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>Nie pamiętasz hasła?', 'app.register': 'Rejestracja', 'app.loginLink': 'Zaloguj', 'app.search': 'Szukaj...', 'app.message': 'Wiadomość...'
    },
    ar: {
      'page.title': 'Aura Messenger - تنزيل أو فتح في المتصفح',
      'nav.about': 'المنتج', 'nav.features': 'الميزات', 'nav.download': 'تنزيل', 'nav.browser': 'المتصفح', 'nav.openAura': 'فتح Aura',
      'hero.title': 'مساحة للتواصل،<span>دائما في متناولك.</span>',
      'hero.lead': 'يجمع Aura الفرق والأصدقاء والمشاريع في مكان واحد: محادثات، صوت، مكالمات، وسائط، ذكاء اصطناعي ودخول سريع من المتصفح.',
      'cta.download': 'تنزيل التطبيق', 'cta.browser': 'فتح في المتصفح', 'about.kicker': 'المنتج', 'about.title': 'Aura هو ماسنجر للمشاريع يجمع التواصل في نافذة واحدة.', 'features.kicker': 'الميزات', 'features.title': 'كل ما تحتاجه للتواصل والعمل واتخاذ القرار بسرعة.',
      'app.loginTitle': 'مرحبا بك<br/>في <span class="grad">Aura</span>', 'app.loginSub': 'أدخل اسم المستخدم وكلمة المرور', 'app.loginUsername': 'اسم المستخدم...', 'app.loginPassword': 'كلمة المرور (8 أحرف على الأقل)...', 'app.loginButton': 'دخول <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'تسجيل <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>نسيت كلمة المرور؟', 'app.register': 'تسجيل', 'app.loginLink': 'دخول', 'app.search': 'بحث...', 'app.message': 'رسالة...'
    },
    zh: {
      'page.title': 'Aura Messenger - 下载或在浏览器中打开',
      'nav.about': '产品', 'nav.features': '功能', 'nav.download': '下载', 'nav.browser': '浏览器', 'nav.openAura': '打开 Aura',
      'hero.title': '一个沟通空间，<span>随时触手可及。</span>',
      'hero.lead': 'Aura 将团队、朋友和项目放在一起：主题聊天、语音、通话、媒体、AI 和浏览器快速进入。',
      'cta.download': '下载应用', 'cta.browser': '在浏览器打开', 'about.kicker': '产品', 'about.title': 'Aura 是项目消息工具，所有沟通都在一个窗口中。', 'features.kicker': '功能', 'features.title': '沟通、工作和快速决策所需的一切。',
      'app.loginTitle': '欢迎来到<br/><span class="grad">Aura</span>', 'app.loginSub': '输入用户名和密码', 'app.loginUsername': '用户名...', 'app.loginPassword': '密码（至少 8 个字符）...', 'app.loginButton': '登录 <i class="ti ti-arrow-right"></i>', 'app.registerButton': '注册 <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>忘记密码？', 'app.register': '注册', 'app.loginLink': '登录', 'app.search': '搜索...', 'app.message': '消息...'
    },
    ja: {
      'page.title': 'Aura Messenger - ダウンロードまたはブラウザで開く',
      'nav.about': '製品', 'nav.features': '機能', 'nav.download': 'ダウンロード', 'nav.browser': 'ブラウザ', 'nav.openAura': 'Aura を開く',
      'hero.title': 'いつでも使える、<span>コミュニケーション空間。</span>',
      'hero.lead': 'Aura はチーム、友人、プロジェクトを一つにまとめます。チャット、音声、通話、メディア、AI、ブラウザからの即時アクセス。',
      'cta.download': 'アプリを入手', 'cta.browser': 'ブラウザで開く', 'about.kicker': '製品', 'about.title': 'Aura はプロジェクト向けメッセンジャーです。', 'features.kicker': '機能', 'features.title': '会話、作業、素早い判断のためのすべて。',
      'app.loginTitle': '<span class="grad">Aura</span>へ<br/>ようこそ', 'app.loginSub': 'ユーザー名とパスワードを入力', 'app.loginUsername': 'ユーザー名...', 'app.loginPassword': 'パスワード（8文字以上）...', 'app.loginButton': 'ログイン <i class="ti ti-arrow-right"></i>', 'app.registerButton': '登録 <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>パスワードを忘れた？', 'app.register': '登録', 'app.loginLink': 'ログイン', 'app.search': '検索...', 'app.message': 'メッセージ...'
    },
    ko: {
      'page.title': 'Aura Messenger - 다운로드 또는 브라우저에서 열기',
      'nav.about': '제품', 'nav.features': '기능', 'nav.download': '다운로드', 'nav.browser': '브라우저', 'nav.openAura': 'Aura 열기',
      'hero.title': '언제나 가까운,<span>소통 공간.</span>',
      'hero.lead': 'Aura는 팀, 친구, 프로젝트를 한곳에 모읍니다: 주제별 채팅, 음성, 통화, 미디어, AI, 빠른 브라우저 접속.',
      'cta.download': '앱 다운로드', 'cta.browser': '브라우저에서 열기', 'about.kicker': '제품', 'about.title': 'Aura는 모든 대화를 한 창에 모으는 프로젝트 메신저입니다.', 'features.kicker': '기능', 'features.title': '소통, 작업, 빠른 결정을 위한 모든 것.',
      'app.loginTitle': '<span class="grad">Aura</span>에<br/>오신 것을 환영합니다', 'app.loginSub': '사용자 이름과 비밀번호 입력', 'app.loginUsername': '사용자 이름...', 'app.loginPassword': '비밀번호(최소 8자)...', 'app.loginButton': '로그인 <i class="ti ti-arrow-right"></i>', 'app.registerButton': '가입 <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>비밀번호를 잊으셨나요?', 'app.register': '가입', 'app.loginLink': '로그인', 'app.search': '검색...', 'app.message': '메시지...'
    },
    hi: {
      'page.title': 'Aura Messenger - डाउनलोड करें या ब्राउज़र में खोलें',
      'nav.about': 'प्रोडक्ट', 'nav.features': 'फीचर', 'nav.download': 'डाउनलोड', 'nav.browser': 'ब्राउज़र', 'nav.openAura': 'Aura खोलें',
      'hero.title': 'बातचीत की जगह,<span>हमेशा आपके पास।</span>',
      'hero.lead': 'Aura टीम, दोस्तों और प्रोजेक्ट्स को एक जगह लाता है: चैट, आवाज़, कॉल, मीडिया, AI और ब्राउज़र से तुरंत प्रवेश।',
      'cta.download': 'ऐप डाउनलोड करें', 'cta.browser': 'ब्राउज़र में खोलें', 'about.kicker': 'प्रोडक्ट', 'about.title': 'Aura प्रोजेक्ट्स के लिए मैसेंजर है जहां बातचीत एक ही विंडो में रहती है।', 'features.kicker': 'फीचर', 'features.title': 'बातचीत, काम और तेज निर्णय के लिए सब कुछ।',
      'app.loginTitle': '<span class="grad">Aura</span> में<br/>स्वागत है', 'app.loginSub': 'यूज़रनेम और पासवर्ड डालें', 'app.loginUsername': 'यूज़रनेम...', 'app.loginPassword': 'पासवर्ड (कम से कम 8 अक्षर)...', 'app.loginButton': 'लॉग इन <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'रजिस्टर <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>पासवर्ड भूल गए?', 'app.register': 'रजिस्टर', 'app.loginLink': 'लॉग इन', 'app.search': 'खोजें...', 'app.message': 'संदेश...'
    },
    id: {
      'page.title': 'Aura Messenger - unduh atau buka di browser',
      'nav.about': 'Produk', 'nav.features': 'Fitur', 'nav.download': 'Unduh', 'nav.browser': 'Browser', 'nav.openAura': 'Buka Aura',
      'hero.title': 'Ruang untuk komunikasi,<span>selalu dekat.</span>',
      'hero.lead': 'Aura menyatukan tim, teman, dan proyek: chat topik, suara, panggilan, media, AI, dan akses cepat dari browser.',
      'cta.download': 'Unduh aplikasi', 'cta.browser': 'Buka di browser', 'about.kicker': 'Produk', 'about.title': 'Aura adalah messenger proyek dengan semua komunikasi dalam satu jendela.', 'features.kicker': 'Fitur', 'features.title': 'Semua untuk komunikasi, kerja, dan keputusan cepat.',
      'app.loginTitle': 'Selamat datang<br/>di <span class="grad">Aura</span>', 'app.loginSub': 'Masukkan username dan password', 'app.loginUsername': 'Username...', 'app.loginPassword': 'Password (min. 8 karakter)...', 'app.loginButton': 'Masuk <i class="ti ti-arrow-right"></i>', 'app.registerButton': 'Daftar <i class="ti ti-user-plus"></i>', 'app.forgot': '<i class="ti ti-lock-open"></i>Lupa password?', 'app.register': 'Daftar', 'app.loginLink': 'Masuk', 'app.search': 'Cari...', 'app.message': 'Pesan...'
    }
  };

  const state = {
    lang: 'ru',
    reason: 'default',
    applying: false,
    observerTimer: 0
  };
  const russianDefaults = new Map();
  const textOriginals = new WeakMap();
  const textTranslated = new WeakMap();
  const attrOriginals = new WeakMap();
  const attrTranslated = new WeakMap();
  const memoryByLang = new Map();
  const pendingTranslations = new Map();
  const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const AUTO_SKIP_SELECTOR = [
    'script',
    'style',
    'noscript',
    'template',
    'svg',
    'canvas',
    'code',
    'pre',
    'select',
    'option',
    '[contenteditable="true"]',
    '[data-aura-no-translate]',
    '[data-no-translate]',
    '.aura-lang-wrap',
    '.brand',
    '.brand-name',
    '.brand-copy',
    '.browser-url',
    '.avatar',
    '.msg-ava',
    '.msg-text',
    '.msg-file-name',
    '#messages .msg',
    '#messages .msg *',
    '#aiMessages .msg',
    '#aiMessages .msg *',
    '#consoleOutput',
    '#consoleInput',
    '#profileNickname',
    '#profileUsername',
    '#acLoginName',
    '#roomName',
    '#aiModelLabel',
    '.fi-title',
    '.ci-title',
    '.sb-pname',
    '.sb-psub',
    '.code-digit'
  ].join(',');

  const LANDING_TARGETS = [
    ['.menu-btn', 'nav.menu', 'aria-label'],
    ['.nav-links a[href="#about"]', 'nav.about'],
    ['.nav-links a[href="#features"]', 'nav.features'],
    ['.nav-links a[href="#download"]', 'nav.download'],
    ['.nav-links a[href="#browser"]', 'nav.browser'],
    ['.nav-links .nav-pill', 'nav.openAura'],
    ['.hero h1', 'hero.title', 'html'],
    ['.hero-lead', 'hero.lead'],
    ['[data-install-label], [data-install-label-secondary]', 'platform.label'],
    ['[data-open-browser] span', 'cta.browser'],
    ['[data-platform-pill]', 'platform.pill'],
    ['.platform-strip span:nth-child(2)', 'platform.simple'],
    ['.platform-strip span:nth-child(3)', 'platform.online'],
    ['.hero-app', 'preview.aria', 'aria-label'],
    ['.channels-panel .channel-title:nth-of-type(2)', 'preview.textChannels'],
    ['.channels-panel .channel-title:nth-of-type(6)', 'preview.voice'],
    ['.channels-panel .channel[data-preview-channel]:nth-of-type(3)', 'preview.general'],
    ['.channels-panel .channel[data-preview-channel]:nth-of-type(4)', 'preview.projects'],
    ['.channels-panel .channel[data-preview-channel]:nth-of-type(5)', 'preview.ideas'],
    ['.voice-card strong', 'preview.voiceRoom'],
    ['[data-voice-status]', 'preview.voiceStatus'],
    ['[data-preview-title]', 'preview.general'],
    ['[data-preview-subtitle]', 'preview.generalSub'],
    ['[data-preview-message]', 'preview.generalMessage'],
    ['[data-preview-join]', 'preview.join'],
    ['.msg.outgoing p', 'preview.auraMessage'],
    ['.message-input label', 'preview.messageLabel'],
    ['[data-preview-editor]', 'preview.placeholder', 'placeholder'],
    ['[data-preview-editor]', 'preview.messageLabel', 'aria-label'],
    ['[data-preview-send]', 'preview.send', 'aria-label'],
    ['#about .section-kicker', 'about.kicker'],
    ['#about .section-copy h2', 'about.title'],
    ['#about .section-copy > p:not(.section-kicker)', 'about.body'],
    ['#about .text-link', 'about.link'],
    ['#about .info-card:nth-child(1) h3', 'about.card1.title'],
    ['#about .info-card:nth-child(1) p', 'about.card1.body'],
    ['#about .info-card:nth-child(2) h3', 'about.card2.title'],
    ['#about .info-card:nth-child(2) p', 'about.card2.body'],
    ['#about .info-card:nth-child(3) h3', 'about.card3.title'],
    ['#about .info-card:nth-child(3) p', 'about.card3.body'],
    ['#features .section-kicker', 'features.kicker'],
    ['#features .section-head h2', 'features.title'],
    ['#features .section-head p:not(.section-kicker)', 'features.body'],
    ['#features .feature-card:nth-child(1) h3', 'feature.chats.title'],
    ['#features .feature-card:nth-child(1) p', 'feature.chats.body'],
    ['#features .feature-card:nth-child(2) h3', 'feature.voice.title'],
    ['#features .feature-card:nth-child(2) p', 'feature.voice.body'],
    ['#features .feature-card:nth-child(3) h3', 'feature.calls.title'],
    ['#features .feature-card:nth-child(3) p', 'feature.calls.body'],
    ['#features .feature-card:nth-child(4) h3', 'feature.ai.title'],
    ['#features .feature-card:nth-child(4) p', 'feature.ai.body'],
    ['#features .feature-card:nth-child(5) h3', 'feature.squares.title'],
    ['#features .feature-card:nth-child(5) p', 'feature.squares.body'],
    ['#features .feature-card:nth-child(6) h3', 'feature.browser.title'],
    ['#features .feature-card:nth-child(6) p', 'feature.browser.body'],
    ['#download .section-kicker', 'download.kicker'],
    ['#download .download-copy h2', 'download.title'],
    ['#download .download-copy p:not(.section-kicker)', 'download.body'],
    ['#download .btn-dark', 'cta.browser'],
    ['#download .device-card:nth-child(1) span', 'device.desktop.os'],
    ['#download .device-card:nth-child(1) strong', 'device.desktop.title'],
    ['#download .device-card:nth-child(1) small', 'device.desktop.body'],
    ['#download .device-card:nth-child(2) span', 'device.android.os'],
    ['#download .device-card:nth-child(2) strong', 'device.android.title'],
    ['#download .device-card:nth-child(2) small', 'device.android.body'],
    ['#download .device-card:nth-child(3) span', 'device.iphone.os'],
    ['#download .device-card:nth-child(3) strong', 'device.iphone.title'],
    ['#download .device-card:nth-child(3) small', 'device.iphone.body'],
    ['#browser .section-kicker', 'browser.kicker'],
    ['#browser .browser-copy h2', 'browser.title'],
    ['#browser .browser-copy p:not(.section-kicker)', 'browser.body'],
    ['#browser .browser-copy .btn', 'cta.browser'],
    ['.browser-url', 'browser.url'],
    ['.footer-brand span', 'footer.tagline'],
    ['.footer-links a[href="#top"]', 'footer.top'],
    ['.footer-links a[href^="/app.html"]', 'footer.open'],
    ['.footer-links button', 'footer.download'],
    ['.modal-close', 'install.close', 'aria-label'],
    ['#installTitle', 'install.title'],
    ['[data-install-instruction]', 'install.text'],
    ['.install-dialog .modal-actions .btn-primary', 'cta.browser'],
    ['.install-dialog .modal-actions .btn-secondary', 'install.ok']
  ];

  const APP_TARGETS = [
    ['#loadingText', 'app.loading'],
    ['#callStatus', 'app.callStatus'],
    ['#circleOverlay .btn-ghost', 'app.cancel', 'html'],
    ['#circleOverlay .btn-primary', 'app.send', 'html'],
    ['.login-h1', 'app.loginTitle', 'html'],
    ['#loginInput', 'app.loginUsername', 'placeholder'],
    ['#loginPassInput', 'app.loginPassword', 'placeholder'],
    ['#loginEmailInput', 'app.recoveryEmail', 'placeholder'],
    ['.pass-toggle', 'app.showPassword', 'title'],
    ['.pal-label', 'app.theme'],
    ['#settingsModal .modal-hd h2', 'app.settings', 'html'],
    ['#settingsModal .mtab:nth-child(1)', 'app.profile', 'html'],
    ['#settingsModal .mtab:nth-child(2)', 'app.sound', 'html'],
    ['#settingsModal .mtab:nth-child(3)', 'app.themeTab', 'html'],
    ['#settingsModal .mtab:nth-child(4)', 'app.account', 'html'],
    ['#settingsModal .ava-center .sub-text', 'app.changeAvatar'],
    ['label[for="stNickname"], #st_profile .lbl', 'app.displayName'],
    ['#st_profile .btn-primary', 'app.save', 'html'],
    ['#st_sound .lbl:nth-of-type(1)', 'app.microphone', 'html'],
    ['#micSel option[value="default"]', 'app.default'],
    ['#st_sound .lbl:nth-of-type(2)', 'app.speakers', 'html'],
    ['#spkSel option[value="default"]', 'app.default'],
    ['#st_sound .lbl:nth-of-type(3)', 'app.volume', 'html'],
    ['#st_sound .btn-secondary.w-full', 'app.testMic', 'html'],
    ['#st_sound .lbl:nth-of-type(4)', 'app.notificationSound', 'html'],
    ['#notifSoundName', 'app.standardSound'],
    ['#notifSoundWrap button:nth-of-type(1)', 'app.upload', 'html'],
    ['#notifSoundWrap button:nth-of-type(3)', 'app.preview', 'html'],
    ['.notif-pref-check span', 'app.browserNotifications'],
    ['.notif-pref-row .btn-secondary', 'app.hide', 'html'],
    ['#st_theme > .lbl:nth-of-type(1)', 'app.accentColor'],
    ['#st_theme > .lbl:nth-of-type(2)', 'app.themeName'],
    ['#thDark', 'app.darkTheme', 'html'],
    ['#thLight', 'app.lightTheme', 'html'],
    ['#st_account .acct-row .sub-text', 'app.yourLogin'],
    ['#st_account .lbl', 'app.recoveryEmailLabel', 'html'],
    ['#emailVerifiedBadge', 'app.emailVerified', 'html'],
    ['#st_account > .sub-text', 'app.recoveryEmailHelp'],
    ['#st_account .btn-secondary.w-full', 'app.logout', 'html'],
    ['#st_account .btn-danger', 'app.deleteAccount', 'html'],
    ['#groupModal .modal-hd h2', 'app.createGroupTitle', 'html'],
    ['#groupModal .lbl:nth-of-type(1)', 'app.name'],
    ['#grpName', 'app.groupPlaceholder', 'placeholder'],
    ['#groupModal .lbl:nth-of-type(2)', 'app.members'],
    ['#groupModal .btn-primary', 'app.create', 'html'],
    ['#searchBox', 'app.search', 'placeholder'],
    ['#stFriends', 'app.chats', 'html'],
    ['#stGroups', 'app.groups', 'html'],
    ['#stReqs', 'app.requests', 'html'],
    ['#pFriends .new-btn', 'app.addFriend', 'html'],
    ['#pGroups .new-btn', 'app.createGroup', 'html'],
    ['#onlinePill span:last-child', 'app.online'],
    ['#dropZone p', 'app.dropFile'],
    ['#msgsEmpty p', 'app.startConversation'],
    ['#recType', 'app.voice'],
    ['#attachBtn', 'app.attach', 'title'],
    ['#msgInput', 'app.message', 'placeholder'],
    ['#msgInput', 'app.messageAria', 'aria-label'],
    ['#sendBtn', 'app.send', 'aria-label'],
    ['#forgotModal .modal-hd h2', 'app.forgotTitle', 'html'],
    ['#forgotStep1 > p', 'app.forgotStep1'],
    ['#forgotUsername', 'app.loginUsername', 'placeholder'],
    ['#forgotStep1 .btn-primary', 'app.sendCode', 'html'],
    ['#forgotStep2 > p', 'app.forgotStep2'],
    ['#forgotStep2 .btn-primary', 'app.confirm', 'html'],
    ['#forgotStep2 .btn-ghost', 'app.resend', 'html'],
    ['#forgotStep3 > p', 'app.forgotStep3'],
    ['#forgotNewPass', 'app.newPassword', 'placeholder'],
    ['#forgotStep3 .btn-primary', 'app.changePassword', 'html'],
    ['#emailVerifyModal .modal-hd h2', 'app.emailConfirmTitle', 'html'],
    ['#evHint', 'app.emailSent'],
    ['#evConfirmBtn', 'app.confirm', 'html'],
    ['#emailVerifyModal .btn-ghost', 'app.resend', 'html'],
    ['#aiMessages .ai-welcome p:last-child', 'app.aiWelcome', 'html'],
    ['#aiInput', 'app.askAi', 'placeholder']
  ];

  const TICKER_KEYS = ['ticker.chats', 'ticker.voice', 'ticker.video', 'ticker.media', 'ticker.ai', 'ticker.pwa', 'ticker.browser', 'ticker.teams'];

  const defaultId = (key, mode = 'text') => `${key}::${mode || 'text'}`;

  const rememberRussianDefault = (key, value, mode = 'text') => {
    const text = String(value || '').trim();
    if (!key || !text) return;
    const exact = defaultId(key, mode);
    if (!russianDefaults.has(exact)) russianDefaults.set(exact, value);
    const generic = defaultId(key, 'text');
    if (!russianDefaults.has(generic) && mode !== 'html') russianDefaults.set(generic, value);
  };

  const get = (key, fallbackText, mode = 'text') => {
    const dict = dictionaries[state.lang] || dictionaries.en;
    if (dict[key] !== undefined) return dict[key];
    if (state.lang === 'ru') {
      const exact = russianDefaults.get(defaultId(key, mode));
      if (exact !== undefined) return exact;
      const generic = russianDefaults.get(defaultId(key, 'text'));
      if (generic !== undefined) return generic;
    }
    return base[key] ?? fallbackText ?? key;
  };

  const getOwn = (key) => {
    const dict = dictionaries[state.lang] || {};
    return dict[key];
  };

  const normalizeLanguage = (value) => {
    const raw = String(value || '').trim().toLowerCase().replace('_', '-');
    if (!raw) return '';
    if (raw.startsWith('zh')) return 'zh';
    if (raw.startsWith('pt')) return 'pt';
    const baseCode = raw.split('-')[0];
    return SUPPORTED.includes(baseCode) ? baseCode : '';
  };

  const detectBrowserLanguage = () => {
    const candidates = [
      ...(navigator.languages || []),
      navigator.language,
      navigator.userLanguage
    ];
    for (const candidate of candidates) {
      const lang = normalizeLanguage(candidate);
      if (lang) return lang;
    }
    return '';
  };

  const detectUrlLanguage = () => {
    try {
      return normalizeLanguage(new URLSearchParams(location.search).get('lang'));
    } catch {
      return '';
    }
  };

  const detectIpLanguage = async () => {
    const endpoints = ['https://ipapi.co/json/', 'https://ipwho.is/'];
    for (const endpoint of endpoints) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 1400);
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) continue;
        const data = await response.json();
        const country = String(data.country_code || data.countryCode || '').toUpperCase();
        const lang = COUNTRY_LANGUAGE[country];
        if (lang) return lang;
      } catch {
        // Ignore network/privacy failures and keep browser-language fallback.
      } finally {
        window.clearTimeout(timer);
      }
    }
    return '';
  };

  const setContent = (selector, key, mode = 'text') => {
    document.querySelectorAll(selector).forEach((node) => {
      const value = getDynamicValue(key, readCurrent(node, mode), mode);
      if (mode === 'html') {
        if (node.innerHTML !== value) node.innerHTML = value;
      } else if (mode === 'placeholder') {
        if (node.getAttribute('placeholder') !== value) node.setAttribute('placeholder', value);
      } else if (mode === 'title') {
        if (node.getAttribute('title') !== value) node.setAttribute('title', value);
      } else if (mode === 'aria-label') {
        if (node.getAttribute('aria-label') !== value) node.setAttribute('aria-label', value);
      } else {
        if (node.textContent !== value) node.textContent = value;
      }
    });
  };

  const getDynamicValue = (key, fallbackText, mode = 'text') => {
    if (key === 'platform.label') {
      const platformKey = getPlatformKey('Label');
      const captured = get(key, '', mode);
      return getOwn(platformKey) || getOwn('cta.download') || (captured && captured !== key ? captured : get(platformKey, fallbackText, mode));
    }
    if (key === 'platform.pill') {
      const platformKey = getPlatformKey('Pill');
      const captured = get(key, '', mode);
      return getOwn(platformKey) || getOwn('platform.genericPill') || (captured && captured !== key ? captured : get(platformKey, fallbackText, mode));
    }
    if (key === 'install.text') {
      return get(getInstallModeKey('Text'), fallbackText, mode);
    }
    return get(key, fallbackText, mode);
  };

  const readCurrent = (node, mode) => {
    if (mode === 'html') return node.innerHTML;
    if (mode === 'placeholder') return node.getAttribute('placeholder') || '';
    if (mode === 'title') return node.getAttribute('title') || '';
    if (mode === 'aria-label') return node.getAttribute('aria-label') || '';
    return node.textContent || '';
  };

  const getMemory = (lang = state.lang) => {
    if (!memoryByLang.has(lang)) {
      try {
        memoryByLang.set(lang, JSON.parse(window.localStorage?.getItem(`aura:i18n:auto:${lang}`) || '{}'));
      } catch {
        memoryByLang.set(lang, {});
      }
    }
    return memoryByLang.get(lang);
  };

  const saveMemorySoon = (() => {
    let timer = 0;
    return (lang) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          const memory = getMemory(lang);
          const entries = Object.entries(memory).slice(-900);
          window.localStorage?.setItem(`aura:i18n:auto:${lang}`, JSON.stringify(Object.fromEntries(entries)));
        } catch {
          // localStorage may be disabled or full; translation still works for this session.
        }
      }, 500);
    };
  })();

  const normalizeForTranslation = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  const preserveOuterWhitespace = (source, translated) => {
    const raw = String(source || '');
    const prefix = raw.match(/^\s*/)?.[0] || '';
    const suffix = raw.match(/\s*$/)?.[0] || '';
    return `${prefix}${translated}${suffix}`;
  };

  const shouldSkipElement = (element) => {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
    return !!element.closest(AUTO_SKIP_SELECTOR);
  };

  const isProbablyUserOrCode = (text) => {
    const value = normalizeForTranslation(text);
    if (!value || value.length < 2 || value.length > 520) return true;
    if (/^[\d\s.,:;!?()[\]{}+\-*/=#%<>|"'`~@\\]+$/.test(value)) return true;
    if (/^(https?:\/\/|www\.|\/[\w.-]|#[\w-]+$|@[\w.-]+$)/i.test(value)) return true;
    if (/^[A-Z0-9_./:-]{2,}$/.test(value)) return true;
    if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(value)) return true;
    return !/[A-Za-zА-Яа-яЁёІіЇїЄєҐґÀ-žĀ-žΑ-ω\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0E00-\u0E7F\u3040-\u30ff\u3400-\u9fff]/u.test(value);
  };

  const googleLanguage = (lang) => {
    if (lang === 'zh') return 'zh-CN';
    if (lang === 'he') return 'he';
    return lang;
  };

  const translateViaNetwork = async (text, lang) => {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'auto');
    url.searchParams.set('tl', googleLanguage(lang));
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', text);
    const response = await fetch(url.toString(), { cache: 'force-cache' });
    if (!response.ok) throw new Error(`translate ${response.status}`);
    const data = await response.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map((part) => part?.[0] || '').join('')
      : '';
    return translated.trim() || text;
  };

  const translateText = (text, lang = state.lang) => {
    const source = normalizeForTranslation(text);
    if (!source || lang === 'ru') return Promise.resolve(source);
    const memory = getMemory(lang);
    if (memory[source]) return Promise.resolve(memory[source]);
    const pendingKey = `${lang}\n${source}`;
    if (pendingTranslations.has(pendingKey)) return pendingTranslations.get(pendingKey);

    const task = translateViaNetwork(source, lang)
      .then((translated) => {
        memory[source] = translated;
        saveMemorySoon(lang);
        return translated;
      })
      .catch(() => source)
      .finally(() => pendingTranslations.delete(pendingKey));

    pendingTranslations.set(pendingKey, task);
    return task;
  };

  const rememberTextNodeOriginal = (node) => {
    const current = node.nodeValue || '';
    const previousTranslation = textTranslated.get(node);
    if (!textOriginals.has(node) || (previousTranslation && current !== previousTranslation && current !== textOriginals.get(node))) {
      textOriginals.set(node, current);
    }
    return textOriginals.get(node) || current;
  };

  const rememberAttrOriginal = (node, attr) => {
    let attrMap = attrOriginals.get(node);
    if (!attrMap) {
      attrMap = {};
      attrOriginals.set(node, attrMap);
    }
    let translatedMap = attrTranslated.get(node);
    if (!translatedMap) {
      translatedMap = {};
      attrTranslated.set(node, translatedMap);
    }
    const current = node.getAttribute(attr) || '';
    if (!attrMap[attr] || (translatedMap[attr] && current !== translatedMap[attr] && current !== attrMap[attr])) {
      attrMap[attr] = current;
    }
    return attrMap[attr] || current;
  };

  const processTextNode = (node) => {
    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) return;
    const original = rememberTextNodeOriginal(node);
    if (isProbablyUserOrCode(original)) return;

    if (state.lang === 'ru') {
      if (node.nodeValue !== original) node.nodeValue = original;
      textTranslated.delete(node);
      return;
    }

    const langAtRequest = state.lang;
    translateText(original, langAtRequest).then((translated) => {
      if (state.lang !== langAtRequest) return;
      if (textOriginals.get(node) !== original) return;
      const value = preserveOuterWhitespace(original, translated);
      if (node.nodeValue !== value) {
        node.nodeValue = value;
        textTranslated.set(node, value);
      }
    });
  };

  const processElementAttributes = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE || shouldSkipElement(node)) return;
    TRANSLATABLE_ATTRS.forEach((attr) => {
      if (!node.hasAttribute(attr)) return;
      const original = rememberAttrOriginal(node, attr);
      if (isProbablyUserOrCode(original)) return;

      if (state.lang === 'ru') {
        if (node.getAttribute(attr) !== original) node.setAttribute(attr, original);
        const translatedMap = attrTranslated.get(node);
        if (translatedMap) delete translatedMap[attr];
        return;
      }

      const langAtRequest = state.lang;
      translateText(original, langAtRequest).then((translated) => {
        if (state.lang !== langAtRequest) return;
        const attrMap = attrOriginals.get(node);
        if (!attrMap || attrMap[attr] !== original) return;
        if (node.getAttribute(attr) !== translated) {
          node.setAttribute(attr, translated);
          let translatedMap = attrTranslated.get(node);
          if (!translatedMap) {
            translatedMap = {};
            attrTranslated.set(node, translatedMap);
          }
          translatedMap[attr] = translated;
        }
      });
    });
  };

  const walkTranslatableNodes = (rootNode) => {
    if (!rootNode) return;
    if (rootNode.nodeType === Node.TEXT_NODE) {
      processTextNode(rootNode);
      return;
    }
    if (rootNode.nodeType !== Node.ELEMENT_NODE && rootNode.nodeType !== Node.DOCUMENT_NODE) return;
    const rootElement = rootNode.nodeType === Node.ELEMENT_NODE ? rootNode : rootNode.documentElement;
    if (rootElement && rootElement.nodeType === Node.ELEMENT_NODE) processElementAttributes(rootElement);
    if (rootElement && rootElement.nodeType === Node.ELEMENT_NODE && shouldSkipElement(rootElement)) return;

    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          return shouldSkipElement(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
        const parent = node.parentElement;
        if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) processTextNode(node);
      else if (node.nodeType === Node.ELEMENT_NODE) processElementAttributes(node);
      node = walker.nextNode();
    }
  };

  const translateDynamicUi = () => {
    walkTranslatableNodes(document.body);
  };

  const captureOriginalNodes = (rootNode) => {
    if (!rootNode) return;
    const captureElement = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE || shouldSkipElement(node)) return;
      let attrMap = attrOriginals.get(node);
      if (!attrMap) {
        attrMap = {};
        attrOriginals.set(node, attrMap);
      }
      TRANSLATABLE_ATTRS.forEach((attr) => {
        if (node.hasAttribute(attr) && !attrMap[attr]) attrMap[attr] = node.getAttribute(attr) || '';
      });
    };

    const captureText = (node) => {
      const parent = node.parentElement;
      if (!parent || shouldSkipElement(parent)) return;
      if (!textOriginals.has(node)) textOriginals.set(node, node.nodeValue || '');
    };

    if (rootNode.nodeType === Node.TEXT_NODE) {
      captureText(rootNode);
      return;
    }

    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          return shouldSkipElement(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
        const parent = node.parentElement;
        if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) captureText(node);
      else if (node.nodeType === Node.ELEMENT_NODE) captureElement(node);
      node = walker.nextNode();
    }
  };

  const getPlatform = () => {
    const ua = navigator.userAgent || '';
    const platformValue = navigator.userAgentData?.platform || navigator.platform || '';
    const ios = /iPhone|iPad|iPod/i.test(ua) || (platformValue === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const windows = /Win/i.test(platformValue);
    const mac = /Mac/i.test(platformValue) && !ios;
    const linux = /Linux/i.test(platformValue) && !android;
    if (ios) return 'ios';
    if (android) return 'android';
    if (windows) return 'windows';
    if (mac) return 'mac';
    if (linux) return 'linux';
    return 'desktop';
  };

  const getPlatformKey = (suffix) => {
    const platform = getPlatform();
    return `platform.${platform}${suffix}`;
  };

  const getInstallModeKey = (suffix) => {
    const platform = getPlatform();
    if (platform === 'ios') return `install.ios${suffix}`;
    if (platform === 'android') return `install.android${suffix}`;
    if (['windows', 'mac', 'linux', 'desktop'].includes(platform)) return `install.desktop${suffix}`;
    return `install.default${suffix}`;
  };

  const updateMeta = () => {
    document.title = get('page.title', document.title, 'meta');
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute('content', get('meta.description', metaDescription.getAttribute('content') || '', 'meta'));
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', get('meta.ogTitle', ogTitle.getAttribute('content') || '', 'meta'));
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute('content', get('meta.ogDescription', ogDescription.getAttribute('content') || '', 'meta'));
  };

  const updateLanguageControls = () => {
    document.querySelectorAll('[data-aura-language]').forEach((select) => {
      if (!select.dataset.ready) {
        select.innerHTML = SUPPORTED.map((lang) => `<option value="${lang}">${LANGUAGE_NAMES[lang]}</option>`).join('');
        select.addEventListener('change', () => {
          window.localStorage?.setItem(MANUAL_KEY, '1');
          applyLanguage(select.value, 'manual');
        });
        select.dataset.ready = '1';
      }
      if (select.value !== state.lang) select.value = state.lang;
      select.setAttribute('aria-label', LANGUAGE_NAMES[state.lang] || 'Language');
    });
  };

  const createLanguageControl = () => {
    const wrap = document.createElement('div');
    wrap.className = 'aura-lang-wrap';
    wrap.innerHTML = `
      <span class="aura-lang-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18M4.5 7.5h15M4.5 16.5h15"/>
          <circle cx="12" cy="12" r="9"/>
        </svg>
      </span>
      <select class="aura-lang-select" data-aura-language></select>
    `;
    return wrap;
  };

  const ensureLanguageControls = () => {
    if (!document.querySelector('[data-aura-language-style]')) {
      const style = document.createElement('style');
      style.dataset.auraLanguageStyle = '1';
      style.textContent = `
        .aura-lang-wrap{position:relative;display:inline-flex;align-items:center;flex:0 0 auto}
        .nav-links .aura-lang-wrap{margin-left:4px;margin-right:4px}
        .aura-lang-icon{position:absolute;left:13px;top:50%;z-index:1;width:16px;height:16px;transform:translateY(-50%);color:rgba(248,251,255,.78);pointer-events:none}
        .aura-lang-icon svg{display:block;width:16px;height:16px}
        .aura-lang-icon path,.aura-lang-icon circle{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        .aura-lang-select{height:42px;min-width:122px;padding:0 34px 0 38px;border:1px solid rgba(255,255,255,.13);border-radius:999px;color:#fff;background:linear-gradient(180deg,rgba(255,255,255,.105),rgba(255,255,255,.055));box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 12px 34px rgba(0,0,0,.18);font:800 13px/1 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;outline:none;cursor:pointer;appearance:none;transition:border-color .2s ease,background .2s ease,box-shadow .2s ease,transform .2s ease;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%),linear-gradient(180deg,rgba(255,255,255,.105),rgba(255,255,255,.055));background-position:calc(100% - 18px) 18px,calc(100% - 13px) 18px,0 0;background-size:5px 5px,5px 5px,100% 100%;background-repeat:no-repeat}
        .aura-lang-select:hover{border-color:rgba(255,255,255,.24);background-color:rgba(255,255,255,.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 16px 38px rgba(0,0,0,.24);transform:translateY(-1px)}
        .aura-lang-select:focus-visible{border-color:rgba(196,181,253,.72);box-shadow:0 0 0 3px rgba(99,102,241,.24),0 16px 38px rgba(0,0,0,.24)}
        .aura-lang-select option{background:#111526;color:#fff}
        html[dir="rtl"] .aura-lang-icon{left:auto;right:13px}
        html[dir="rtl"] .aura-lang-select{padding:0 38px 0 34px;background-position:18px 18px,13px 18px,0 0}
        @media (max-width:760px){.nav-links .aura-lang-wrap{width:100%;margin:2px 0 6px}.nav-links .aura-lang-select{width:100%;min-width:0}}
      `;
      document.head.appendChild(style);
    }

    const nav = document.querySelector('.nav-links');
    if (nav && !nav.querySelector('[data-aura-language]')) {
      const wrap = createLanguageControl();
      const pill = nav.querySelector('.nav-pill');
      nav.insertBefore(wrap, pill || null);
    }

  };

  const updateTicker = () => {
    document.querySelectorAll('.ticker-group').forEach((group) => {
      Array.from(group.children).forEach((node, index) => {
        const key = TICKER_KEYS[index % TICKER_KEYS.length];
        const value = get(key, node.textContent);
        if (node.textContent !== value) node.textContent = value;
      });
    });
  };

  const updatePreviewDatasets = () => {
    const channels = [
      ['preview.general', 'preview.generalSub', 'preview.generalMessage'],
      ['preview.projects', 'preview.projectsSub', 'preview.projectsMessage'],
      ['preview.ideas', 'preview.ideasSub', 'preview.ideasMessage']
    ];
    document.querySelectorAll('[data-preview-channel]').forEach((node, index) => {
      const keys = channels[index];
      if (!keys) return;
      node.dataset.title = get(keys[0], node.dataset.title);
      node.dataset.subtitle = get(keys[1], node.dataset.subtitle);
      node.dataset.message = get(keys[2], node.dataset.message);
    });
  };

  const updateInstallSteps = () => {
    const stepsBox = document.querySelector('[data-install-steps]');
    if (!stepsBox) return;
    const raw = get(getInstallModeKey('Steps'), get('install.defaultSteps'));
    const steps = raw.split('|').filter(Boolean);
    if (!steps.length) return;
    stepsBox.innerHTML = steps.map((step, index) => `<div><strong>${index + 1}.</strong> ${step}</div>`).join('');
  };

  const updateAppLinks = () => {
    document.querySelectorAll('a[href="/app.html"], a[href^="/app.html?"], a[href^="app.html"]').forEach((link) => {
      try {
        const url = new URL(link.getAttribute('href'), location.origin);
        url.searchParams.set('lang', state.lang);
        link.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // ignore malformed links
      }
    });
  };

  const captureRussianDefaults = () => {
    rememberRussianDefault('page.title', document.title, 'meta');
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) rememberRussianDefault('meta.description', metaDescription.getAttribute('content') || '', 'meta');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) rememberRussianDefault('meta.ogTitle', ogTitle.getAttribute('content') || '', 'meta');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) rememberRussianDefault('meta.ogDescription', ogDescription.getAttribute('content') || '', 'meta');

    [...LANDING_TARGETS, ...APP_TARGETS].forEach(([selector, key, mode = 'text']) => {
      const node = document.querySelector(selector);
      if (node) rememberRussianDefault(key, readCurrent(node, mode), mode);
    });

    document.querySelectorAll('.ticker-group:first-child span').forEach((node, index) => {
      const key = TICKER_KEYS[index % TICKER_KEYS.length];
      rememberRussianDefault(key, node.textContent || '', 'text');
    });

    const channelKeys = [
      ['preview.general', 'preview.generalSub', 'preview.generalMessage'],
      ['preview.projects', 'preview.projectsSub', 'preview.projectsMessage'],
      ['preview.ideas', 'preview.ideasSub', 'preview.ideasMessage']
    ];
    document.querySelectorAll('[data-preview-channel]').forEach((node, index) => {
      const keys = channelKeys[index];
      if (!keys) return;
      rememberRussianDefault(keys[0], node.dataset.title || node.textContent || '', 'text');
      rememberRussianDefault(keys[1], node.dataset.subtitle || '', 'text');
      rememberRussianDefault(keys[2], node.dataset.message || '', 'text');
    });
  };

  const updateLoginState = () => {
    if (!document.getElementById('loginScreen')) return;
    let isRegister = false;
    try {
      isRegister = typeof _isRegisterMode !== 'undefined' && _isRegisterMode;
    } catch {
      const buttonText = document.getElementById('loginBtn')?.textContent || '';
      isRegister = /register|registr|зарегистр|реєстр|注册|가입|تسجيل|daftar/i.test(buttonText);
    }
    const sub = document.getElementById('loginSubText');
    const btn = document.getElementById('loginBtn');
    const regText = document.getElementById('registerLinkText');
    const forgot = document.getElementById('forgotLink');
    if (sub) sub.textContent = get(isRegister ? 'app.registerSub' : 'app.loginSub', sub.textContent, 'text');
    if (btn) btn.innerHTML = get(isRegister ? 'app.registerButton' : 'app.loginButton', btn.innerHTML, 'html');
    if (regText) regText.textContent = get(isRegister ? 'app.loginLink' : 'app.register', regText.textContent, 'text');
    if (forgot) forgot.innerHTML = get('app.forgot', forgot.innerHTML, 'html');
  };

  const applyTargets = () => {
    LANDING_TARGETS.forEach(([selector, key, mode]) => setContent(selector, key, mode));
    APP_TARGETS.forEach(([selector, key, mode]) => setContent(selector, key, mode));
    updateTicker();
    updatePreviewDatasets();
    updateInstallSteps();
    updateLoginState();
  };

  const applyLanguage = (lang, reason = 'manual') => {
    const normalized = normalizeLanguage(lang) || 'en';
    state.lang = normalized;
    state.reason = reason;
    document.documentElement.lang = normalized;
    document.documentElement.dir = RTL.has(normalized) ? 'rtl' : 'ltr';
    window.localStorage?.setItem(STORAGE_KEY, normalized);

    state.applying = true;
    ensureLanguageControls();
    updateMeta();
    applyTargets();
    updateAppLinks();
    updateLanguageControls();
    translateDynamicUi();
    state.applying = false;

    window.dispatchEvent(new CustomEvent('aura:languagechange', { detail: { lang: normalized, reason } }));
  };

  const installObserver = () => {
    const observer = new MutationObserver(() => {
      if (state.applying) return;
      window.clearTimeout(state.observerTimer);
      state.observerTimer = window.setTimeout(() => {
        state.applying = true;
        applyTargets();
        updateAppLinks();
        translateDynamicUi();
        state.applying = false;
      }, 40);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  };

  const initialize = async () => {
    captureOriginalNodes(document.body);
    captureRussianDefaults();
    const urlLang = detectUrlLanguage();
    const manualLang = window.localStorage?.getItem(MANUAL_KEY) ? normalizeLanguage(window.localStorage.getItem(STORAGE_KEY)) : '';
    const browserLang = detectBrowserLanguage();
    const firstLang = urlLang || manualLang || browserLang || 'en';

    applyLanguage(firstLang, urlLang ? 'url' : manualLang ? 'manual' : 'browser');
    installObserver();

    if (urlLang) window.localStorage?.setItem(STORAGE_KEY, urlLang);
    if (urlLang || manualLang) return;

    const ipLang = await detectIpLanguage();
    if (ipLang && (!browserLang || browserLang === 'en')) {
      applyLanguage(ipLang, 'ip');
    }
  };

  window.AuraI18n = {
    supported: SUPPORTED,
    names: LANGUAGE_NAMES,
    t: get,
    apply: (lang) => {
      window.localStorage?.setItem(MANUAL_KEY, '1');
      applyLanguage(lang, 'manual');
    },
    get language() {
      return state.lang;
    },
    get reason() {
      return state.reason;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();

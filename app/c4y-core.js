/* ════════════════════════════════════════════════════════════════
   care4you – Core Library
   Behebt mehrere Architektur-Lücken in einem sauberen Layer:
     • Echter Backend/API   → Store-Abstraktion (localStorage ↔ REST)
     • DSGVO-Architektur     → Consent, Export, Löschung, Audit
     • Mehrsprachigkeit      → i18n (DE / EN / TR)
   Wird von allen care4you-Seiten geladen.
   ════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ───────────────────────────────────────────────
     1) CONFIG  —  hier auf echtes Backend umstellen
     ─────────────────────────────────────────────── */
  const C4Y_CONFIG = {
    // 'local'  = localStorage (Beta / Offline)
    // 'remote' = REST-API (Launch). Nur diese Zeile ändern.
    backend: 'local',
    apiBase: 'https://api.care4youapp.com/v1',
    // Verschlüsselung der lokalen Daten "at rest" (leichtgewichtig)
    encryptLocal: true,
    appVersion: '1.0.0',
  };

  /* ───────────────────────────────────────────────
     2) Leichte lokale "Verschlüsselung"
        Hinweis: echte E2E-Verschlüsselung gehört serverseitig /
        in WebCrypto mit nutzergebundenem Schlüssel. Dies ist eine
        Obfuskation gegen einfaches Auslesen im Beta-Stadium.
     ─────────────────────────────────────────────── */
  const Crypto = {
    _key: 'c4y-local-key-v1',
    enc(str) {
      if (!C4Y_CONFIG.encryptLocal) return str;
      try {
        const k = this._key;
        let out = '';
        for (let i = 0; i < str.length; i++) {
          out += String.fromCharCode(str.charCodeAt(i) ^ k.charCodeAt(i % k.length));
        }
        return 'enc:' + btoa(unescape(encodeURIComponent(out)));
      } catch (e) { return str; }
    },
    dec(str) {
      if (typeof str !== 'string' || !str.startsWith('enc:')) return str;
      try {
        const raw = decodeURIComponent(escape(atob(str.slice(4))));
        const k = this._key;
        let out = '';
        for (let i = 0; i < raw.length; i++) {
          out += String.fromCharCode(raw.charCodeAt(i) ^ k.charCodeAt(i % k.length));
        }
        return out;
      } catch (e) { return str; }
    },
  };

  /* ───────────────────────────────────────────────
     3) STORE  —  einheitliche async-API für Daten
        Heute: localStorage.  Morgen: fetch() zum Backend.
        Die App ruft IMMER store.get/set/... auf und merkt
        vom Backend-Wechsel nichts.
     ─────────────────────────────────────────────── */
  const Store = {
    _prefix: 'c4y_',
    _outboxKey: 'c4y_outbox',

    async get(key, fallback = null) {
      if (C4Y_CONFIG.backend === 'remote') {
        try {
          const res = await fetch(`${C4Y_CONFIG.apiBase}/data/${encodeURIComponent(key)}`, {
            headers: this._headers(), credentials: 'include',
          });
          if (!res.ok) throw new Error(res.status);
          return await res.json();
        } catch (e) {
          // Offline-Fallback auf lokalen Spiegel
          return this._localGet(key, fallback);
        }
      }
      return this._localGet(key, fallback);
    },

    async set(key, value) {
      // Immer lokal spiegeln (Offline-First)
      this._localSet(key, value);
      Audit.log('write', key);
      if (C4Y_CONFIG.backend === 'remote') {
        try {
          const res = await fetch(`${C4Y_CONFIG.apiBase}/data/${encodeURIComponent(key)}`, {
            method: 'PUT', headers: this._headers(), credentials: 'include',
            body: JSON.stringify(value),
          });
          if (!res.ok) throw new Error(res.status);
        } catch (e) {
          // Bei Fehler: in Outbox legen, Service Worker sendet später
          this._queue(key, value);
        }
      }
      return value;
    },

    async remove(key) {
      this._localRemove(key);
      Audit.log('delete', key);
      if (C4Y_CONFIG.backend === 'remote') {
        try {
          await fetch(`${C4Y_CONFIG.apiBase}/data/${encodeURIComponent(key)}`, {
            method: 'DELETE', headers: this._headers(), credentials: 'include',
          });
        } catch (e) { this._queue(key, null, true); }
      }
    },

    // ── lokale Implementierung ──
    _localGet(key, fallback) {
      try {
        const raw = localStorage.getItem(this._prefix + key);
        if (raw === null) return fallback;
        const dec = Crypto.dec(raw);
        return JSON.parse(dec);
      } catch (e) { return fallback; }
    },
    _localSet(key, value) {
      try {
        const json = JSON.stringify(value);
        localStorage.setItem(this._prefix + key, Crypto.enc(json));
      } catch (e) { console.warn('Store: write failed', e); }
    },
    _localRemove(key) {
      try { localStorage.removeItem(this._prefix + key); } catch (e) {}
    },

    _headers() {
      const h = { 'Content-Type': 'application/json' };
      const t = this._localGet('auth_token', null);
      if (t) h['Authorization'] = 'Bearer ' + t;
      return h;
    },

    // Outbox für Offline-Writes (Background Sync)
    _queue(key, value, isDelete = false) {
      const ob = this._localGet('outbox', []);
      ob.push({ key, value, isDelete, ts: Date.now() });
      this._localSet('outbox', ob);
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready.then((reg) => reg.sync.register('c4y-sync-data')).catch(() => {});
      }
    },
    async flushOutbox() {
      if (C4Y_CONFIG.backend !== 'remote') return;
      const ob = this._localGet('outbox', []);
      const remaining = [];
      for (const item of ob) {
        try {
          await fetch(`${C4Y_CONFIG.apiBase}/data/${encodeURIComponent(item.key)}`, {
            method: item.isDelete ? 'DELETE' : 'PUT',
            headers: this._headers(), credentials: 'include',
            body: item.isDelete ? undefined : JSON.stringify(item.value),
          });
        } catch (e) { remaining.push(item); }
      }
      this._localSet('outbox', remaining);
    },

    // Alle care4you-Schlüssel (für Export/Löschung)
    _allKeys() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this._prefix)) keys.push(k.slice(this._prefix.length));
      }
      return keys;
    },
  };

  /* ───────────────────────────────────────────────
     4) AUDIT-LOG  (DSGVO Art. 30 – Verarbeitungsverzeichnis)
        Transparenz: Nutzer kann sehen, was wann passierte.
     ─────────────────────────────────────────────── */
  const Audit = {
    log(action, target) {
      try {
        const key = 'c4y_audit';
        const raw = localStorage.getItem(key);
        let arr = raw ? JSON.parse(Crypto.dec(raw)) : [];
        arr.push({ a: action, t: target, ts: Date.now() });
        if (arr.length > 200) arr = arr.slice(-200); // begrenzen
        localStorage.setItem(key, Crypto.enc(JSON.stringify(arr)));
      } catch (e) {}
    },
    read() {
      try {
        const raw = localStorage.getItem('c4y_audit');
        return raw ? JSON.parse(Crypto.dec(raw)) : [];
      } catch (e) { return []; }
    },
  };

  /* ───────────────────────────────────────────────
     5) CONSENT  (DSGVO Art. 6/7/9 – Einwilligung)
        Granulare Opt-ins, jederzeit widerrufbar.
     ─────────────────────────────────────────────── */
  const Consent = {
    DEFAULTS: {
      essential: true,        // notwendig, nicht abwählbar
      research: false,        // anonymisierte Forschungsdaten
      family: false,          // Teilen mit Angehörigen
      analytics: false,       // Nutzungsstatistik zur Verbesserung
      reminders: false,       // Push-Benachrichtigungen
    },
    get() {
      return Store._localGet('consent', null) || { ...this.DEFAULTS, _set: false };
    },
    set(partial) {
      const cur = this.get();
      const next = { ...cur, ...partial, essential: true, _set: true, _ts: Date.now() };
      Store._localSet('consent', next);
      Audit.log('consent', JSON.stringify(partial));
      return next;
    },
    has(scope) { return !!this.get()[scope]; },
    isConfigured() { return !!this.get()._set; },
  };

  /* ───────────────────────────────────────────────
     6) DSGVO-Rechte: Auskunft, Datenübertragbarkeit, Löschung
        (Art. 15, 20, 17)
     ─────────────────────────────────────────────── */
  const Privacy = {
    // Art. 20 – alle Daten als JSON exportieren
    exportAll() {
      const data = {};
      Store._allKeys().forEach((k) => {
        if (k === 'audit') return; // optional
        data[k] = Store._localGet(k, null);
      });
      return {
        _meta: {
          app: 'care4you',
          version: C4Y_CONFIG.appVersion,
          exported: new Date().toISOString(),
          notice: 'Dies sind alle über Sie gespeicherten Daten (DSGVO Art. 15 & 20).',
        },
        data,
        auditLog: Audit.read(),
      };
    },
    downloadExport() {
      const payload = JSON.stringify(this.exportAll(), null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `care4you-meine-daten-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      Audit.log('export', 'all');
    },
    // Art. 17 – Recht auf Vergessenwerden
    async deleteAll() {
      const keys = Store._allKeys();
      for (const k of keys) await Store.remove(k);
      try {
        localStorage.removeItem('c4y_audit');
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.filter(n => n.startsWith('care4you-')).map(n => caches.delete(n)));
        }
      } catch (e) {}
    },
  };

  /* ───────────────────────────────────────────────
     7) i18n  (Mehrsprachigkeit DE / EN / TR)
        TR ist bewusst dabei: größte nicht-deutschsprachige
        Pflege-Community in DE.
     ─────────────────────────────────────────────── */
  const STRINGS = {
    de: {
      'app.tagline': 'Ihre digitale Pflegebegleitung',
      'ob.welcome.title': 'Ihre digitale Pflegebegleitung',
      'ob.welcome.sub': 'Ich bin für Sie da – jeden Tag. Ich höre zu, erkenne früh wenn Hilfe nötig ist, und begleite Sie auf Ihrem Weg.',
      'ob.start': 'Los geht\u2019s',
      'ob.role.q': 'Wer sind Sie?',
      'ob.role.sub': 'Damit ich Ihnen genau die richtige Begleitung geben kann.',
      'ob.role.self': 'Ich selbst',
      'ob.role.self.d': 'Ich möchte gut für mich sorgen und begleitet werden',
      'ob.role.family': 'Für einen Angehörigen',
      'ob.role.family.d': 'Ich kümmere mich um einen lieben Menschen',
      'ob.role.pro': 'Als Pflegekraft',
      'ob.role.pro.d': 'Ich betreue Menschen beruflich',
      'ob.consent.title': 'Ihre Daten gehören Ihnen',
      'ob.consent.sub': 'Sie entscheiden, was geteilt wird. Jederzeit änderbar.',
      'ob.consent.essential': 'Grundfunktionen',
      'ob.consent.essential.d': 'Notwendig damit die App funktioniert',
      'ob.consent.research': 'Anonyme Forschung unterstützen',
      'ob.consent.research.d': 'Hilft, Pflege für alle zu verbessern – vollständig anonym',
      'ob.consent.reminders': 'Erinnerungen erlauben',
      'ob.consent.reminders.d': 'Sanfte Hinweise für Bewegung, Trinken, Check-in',
      'ob.consent.accept': 'Einverstanden & weiter',
      'nav.home': 'Start',
      'nav.chat': 'Momo',
      'nav.motion': 'Bewegung',
      'nav.situation': 'Situation',
      'nav.report': 'Bericht',
      'home.greeting.morning': 'Guten Morgen',
      'home.greeting.day': 'Guten Tag',
      'home.greeting.evening': 'Guten Abend',
      'family.title': 'Familie & Angehörige',
      'family.invite': 'Angehörige einladen',
      'privacy.title': 'Datenschutz & meine Daten',
      'privacy.export': 'Meine Daten herunterladen',
      'privacy.delete': 'Alle meine Daten löschen',
      'common.continue': 'Weiter',
      'common.back': 'Zurück',
      'common.save': 'Speichern',
      'common.cancel': 'Abbrechen',
      'a11y.skip': 'Zum Hauptinhalt springen',
      'family.short': 'Familie',
    },
    en: {
      'app.tagline': 'Your digital care companion',
      'ob.welcome.title': 'Your digital care companion',
      'ob.welcome.sub': 'I\u2019m here for you – every day. I listen, notice early when help is needed, and walk beside you.',
      'ob.start': 'Let\u2019s begin',
      'ob.role.q': 'Who are you?',
      'ob.role.sub': 'So I can give you exactly the right support.',
      'ob.role.self': 'Myself',
      'ob.role.self.d': 'I want to care for myself and be supported',
      'ob.role.family': 'For a loved one',
      'ob.role.family.d': 'I care for someone dear to me',
      'ob.role.pro': 'As a caregiver',
      'ob.role.pro.d': 'I care for people professionally',
      'ob.consent.title': 'Your data belongs to you',
      'ob.consent.sub': 'You decide what is shared. Changeable anytime.',
      'ob.consent.essential': 'Core features',
      'ob.consent.essential.d': 'Required for the app to work',
      'ob.consent.research': 'Support anonymous research',
      'ob.consent.research.d': 'Helps improve care for everyone – fully anonymous',
      'ob.consent.reminders': 'Allow reminders',
      'ob.consent.reminders.d': 'Gentle nudges for movement, hydration, check-in',
      'ob.consent.accept': 'Agree & continue',
      'nav.home': 'Home',
      'nav.chat': 'Momo',
      'nav.motion': 'Movement',
      'nav.situation': 'Situation',
      'nav.report': 'Report',
      'home.greeting.morning': 'Good morning',
      'home.greeting.day': 'Good day',
      'home.greeting.evening': 'Good evening',
      'family.title': 'Family & loved ones',
      'family.invite': 'Invite a relative',
      'privacy.title': 'Privacy & my data',
      'privacy.export': 'Download my data',
      'privacy.delete': 'Delete all my data',
      'common.continue': 'Continue',
      'common.back': 'Back',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'a11y.skip': 'Skip to main content',
      'family.short': 'Family',
    },
    tr: {
      'app.tagline': 'Dijital bakım arkadaşınız',
      'ob.welcome.title': 'Dijital bakım arkadaşınız',
      'ob.welcome.sub': 'Her gün yanınızdayım. Sizi dinlerim, yardım gerektiğinde erkenden fark ederim ve yolunuzda size eşlik ederim.',
      'ob.start': 'Başlayalım',
      'ob.role.q': 'Siz kimsiniz?',
      'ob.role.sub': 'Size tam doğru desteği verebilmem için.',
      'ob.role.self': 'Kendim',
      'ob.role.self.d': 'Kendime iyi bakmak ve desteklenmek istiyorum',
      'ob.role.family': 'Bir yakınım için',
      'ob.role.family.d': 'Sevdiğim birine bakıyorum',
      'ob.role.pro': 'Bakıcı olarak',
      'ob.role.pro.d': 'Mesleki olarak insanlara bakıyorum',
      'ob.consent.title': 'Verileriniz size aittir',
      'ob.consent.sub': 'Neyin paylaşılacağına siz karar verirsiniz. İstediğiniz zaman değiştirilebilir.',
      'ob.consent.essential': 'Temel işlevler',
      'ob.consent.essential.d': 'Uygulamanın çalışması için gereklidir',
      'ob.consent.research': 'Anonim araştırmayı destekle',
      'ob.consent.research.d': 'Herkes için bakımı iyileştirir – tamamen anonim',
      'ob.consent.reminders': 'Hatırlatmalara izin ver',
      'ob.consent.reminders.d': 'Hareket, su içme ve kontrol için nazik uyarılar',
      'ob.consent.accept': 'Kabul et ve devam et',
      'nav.home': 'Ana sayfa',
      'nav.chat': 'Momo',
      'nav.motion': 'Hareket',
      'nav.situation': 'Durum',
      'nav.report': 'Rapor',
      'home.greeting.morning': 'Günaydın',
      'home.greeting.day': 'İyi günler',
      'home.greeting.evening': 'İyi akşamlar',
      'family.title': 'Aile ve yakınlar',
      'family.invite': 'Bir yakını davet et',
      'privacy.title': 'Gizlilik ve verilerim',
      'privacy.export': 'Verilerimi indir',
      'privacy.delete': 'Tüm verilerimi sil',
      'common.continue': 'Devam',
      'common.back': 'Geri',
      'common.save': 'Kaydet',
      'common.cancel': 'İptal',
      'a11y.skip': 'Ana içeriğe geç',
      'family.short': 'Aile',
    },
  };

  const i18n = {
    _lang: 'de',
    LANGS: [
      { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
      { code: 'en', label: 'English', flag: '🇬🇧' },
      { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
    ],
    init() {
      const saved = Store._localGet('lang', null);
      const browser = (navigator.language || 'de').slice(0, 2);
      this._lang = saved || (STRINGS[browser] ? browser : 'de');
      document.documentElement.lang = this._lang;
    },
    get() { return this._lang; },
    set(code) {
      if (!STRINGS[code]) return;
      this._lang = code;
      Store._localSet('lang', code);
      document.documentElement.lang = code;
      this.apply();
      window.dispatchEvent(new CustomEvent('c4y:langchange', { detail: code }));
    },
    t(key, fallback) {
      return (STRINGS[this._lang] && STRINGS[this._lang][key]) ||
             (STRINGS.de && STRINGS.de[key]) || fallback || key;
    },
    // Übersetzt alle Elemente mit data-i18n / data-i18n-ph
    apply(root) {
      const scope = root || document;
      scope.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = this.t(el.getAttribute('data-i18n'));
      });
      scope.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-ph')));
      });
      scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
        el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria')));
      });
    },
  };

  /* ───────────────────────────────────────────────
     8) PWA-Registrierung
     ─────────────────────────────────────────────── */
  const PWA = {
    register() {
      if (!('serviceWorker' in navigator)) return;
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
          // Bei Sync-Nachricht Outbox leeren
          navigator.serviceWorker.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'SYNC_NOW') Store.flushOutbox();
          });
        }).catch((e) => console.warn('SW registration failed', e));
      });
      // Online → Outbox leeren
      window.addEventListener('online', () => Store.flushOutbox());
    },
  };

  /* ───────────────────────────────────────────────
     Export
     ─────────────────────────────────────────────── */
  global.C4Y = { config: C4Y_CONFIG, Store, Audit, Consent, Privacy, i18n, PWA };

  // Auto-Init
  i18n.init();
  PWA.register();

})(window);

# care4you – Ihre digitale Pflegebegleitung

> **Professionelle Pflege überall. Sicherheit on the Go.**
> care4you bringt professionelles Pflegewissen digital, verständlich und jederzeit griffbereit – als Hilfe zur Selbsthilfe für mehr Sicherheit und Selbstständigkeit zu Hause.

**⚠️ Hinweis:** care4you ist **kein Medizinprodukt** und ersetzt keine ärztliche oder pflegerische Diagnose, Behandlung oder Beratung. Diese Beta dient dem Test mit ersten Nutzerinnen und Nutzern.

---

## 📂 Projektstruktur

```
care4you-deploy/
├── index.html                  # Landing Page (Einstiegspunkt)
├── wissen.html                 # SEO-Wissensseite / Pflege-Ratgeber
├── app/
│   ├── index.html              # Web-App (Onboarding + Hub)
│   ├── assessment.html         # Modul: Pflege-Assessment
│   ├── momo.html               # Modul: Momo (Wellness-Chat)
│   ├── motion.html             # Modul: Bewegung / Schritte
│   ├── c4y-core.js             # Kern-Bibliothek (Storage, Consent, i18n, PWA)
│   ├── manifest.json           # PWA-Manifest
│   └── sw.js                   # Service Worker (Offline-Caching)
├── legal/
│   ├── impressum.html
│   └── datenschutz.html
└── assets/
    ├── img/                    # Logos, Icons, Foto
    └── media/                  # Hero-Video (mp4/webm) + Poster
```

## 🚀 Schnellstart (lokal)

Die Seite ist statisches HTML/CSS/JS – **kein Build-Schritt nötig**. Wegen der Module (iframes, Service Worker) sollte sie über einen lokalen Webserver laufen, nicht per Doppelklick:

```bash
# Python (vorinstalliert auf den meisten Systemen)
python3 -m http.server 8000
# danach im Browser öffnen: http://localhost:8000

# Alternativ mit Node:
npx serve .
```

> `file://` direkt öffnen funktioniert eingeschränkt, da Browser dort keine Module/Service Worker laden.

## 🌐 Deployment

Da rein statisch, lässt sich care4you überall hosten. Empfohlen:

### GitHub Pages
1. Repository auf GitHub anlegen und Dateien pushen (siehe unten).
2. **Settings → Pages → Source:** Branch `main`, Ordner `/ (root)`.
3. Nach wenigen Minuten ist die Seite unter `https://<user>.github.io/<repo>/` erreichbar.

### Netlify / Vercel / Cloudflare Pages
- Repo verbinden, **kein Build-Command**, **Publish directory: `.`** (root).
- Custom Domain (z. B. `care4youapp.com`) in den Projekteinstellungen hinterlegen.

## ⚙️ Git: erste Schritte

```bash
git init
git add .
git commit -m "care4you Beta – initial deployment"
git branch -M main
git remote add origin https://github.com/<user>/care4you.git
git push -u origin main
```

## 🔧 Wichtige Hinweise vor dem Live-Gang

- [ ] **Domain & canonical:** In `wissen.html` und den Meta-Tags ggf. die finale Domain eintragen (aktuell `care4youapp.com`).
- [ ] **Impressum:** Telefon und USt-IdNr. ergänzen (`legal/impressum.html`).
- [ ] **Datenschutz:** Hosting-Anbieter eintragen (`legal/datenschutz.html`).
- [ ] **Rechtsprüfung:** Impressum & Datenschutz anwaltlich prüfen lassen.
- [ ] **Inhaltliche Zahlen:** Statistiken/Pflege-Beträge (Pflegegeld etc.) vor Launch gegen Originalquellen prüfen (Angaben ohne Gewähr).
- [ ] **Analytics/Consent:** Falls Tracking gewünscht, datenschutzkonformes Consent-Banner ergänzen.

## 🧪 Daten & Datenschutz

care4you ist **offline-first**: Daten bleiben standardmäßig auf dem Gerät (localStorage). Es gibt aktuell **kein Backend** – `c4y-core.js` ist so gestaltet, dass sich später eine API anbinden lässt, ohne die Module umzuschreiben.

## 🛠️ Tech-Stack

Reines HTML, CSS und Vanilla JavaScript. Keine Frameworks, keine Abhängigkeiten, kein Build. Schriftarten via Google Fonts (Inter, DM Serif Display, Merriweather).

## 📍 Status

**Beta** – Test mit ersten Nutzerinnen und Nutzern. Funktionsumfang und Inhalte werden laufend weiterentwickelt.

---

© 2025 Endlich UG (haftungsbeschränkt) · care4you ist kein Medizinprodukt.

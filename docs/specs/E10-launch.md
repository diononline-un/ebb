# E10 · Launch

Migrationsblock 0100–0109. PRD: F18, §10, §13. **Vor Start am Code nachschärfen (Claude).**

## Entscheidungen
- EN ist Quelle und Launch-Sprache. Übersetzungen in der Reihenfolge ES, FR, DE, JA, ZH-CN, maschinell per Skript, Stichprobe durch einen Menschen vor jedem Release.
- Die Landingpage ist eine eigene Oberfläche im Persuade-Modus: vorher `do-design-new` mit Recherche (`layers/06`). Das App-Papier gilt weiter für Farben und Schrift.
- Rechtstexte schreibt kein Agent. Die Seiten zeigen Inhalte, die Dion liefert.
- Produkt-Events nur in der eigenen DB, im Self-Host-Modus aus.

## Wellen
A: P1 ‖ P3 ‖ P6 → B: P2 ‖ P5 → C: P4

### E10-P1 · Übersetzungs-Skript und Pseudo-Locale
- **Ausführung:** DeepSeek
- **Dateien:** `scripts/translate.ts`, `locales/.meta.json`, `scripts/pseudo-locale.ts`, Tests.
- **Auftrag:** Übersetzt nur fehlende oder geänderte Schlüssel (Hash der EN-Quelle), erhält Platzhalter `{{x}}` und Plural-Suffixe, markiert maschinelle Einträge in `.meta.json`. Pseudo-Locale `en-XA` (+40 %, Akzente) für Layout-Tests.
- **Akzeptanz:** Platzhalter-Prüfung schlägt an, wenn eine Übersetzung `{{count}}` verliert. Screenshots aller Hauptseiten in `en-XA` bei 390 ohne Überlauf (`render-audit.py`).

### E10-P2 · Übersetzungen ES, FR, DE, JA, ZH-CN
- **Ausführung:** DeepSeek · **hängt ab von:** P1, alle UI-Epics
- **Dateien:** `locales/{es,fr,de,ja,zh-CN}/*.json`.
- **Akzeptanz:** vollständige Abdeckung (Skript-Check), CJK-Screenshots ohne abgeschnittene Labels, verbotene Wörter aus DESIGN.md §9 sinngemäß auch in den Übersetzungen vermieden (Liste pro Sprache in `.meta.json`).

### E10-P3 · Rechtsseiten
- **Ausführung:** DeepSeek · **hängt ab von:** Texte von Dion (PRD O2)
- **Dateien:** `src/web/routes/legal.*.tsx`, `content/legal/{en,de}/*.md`.
- **Auftrag:** Impressum, Datenschutz, AGB, Links im Footer der Einstellungen und auf der Landingpage. Markdown-Rendering ohne HTML-Durchreichung.

### E10-P4 · Landingpage
- **Ausführung:** DeepSeek nach Design-Paket von Claude (`do-design-new`, Persuade) · **hängt ab von:** Produktname (PRD O1)
- **Dateien:** `src/web/routes/index.tsx` (für nicht angemeldete Nutzer), `src/web/features/landing/*`, `locales/en/landing.json`.
- **Akzeptanz:** Swap-Test bestanden (Claude), Lighthouse Performance ≥ 90 mobil, keine Behauptung ohne Quelle (`audit.py copy`, keine offenen Gap-Marker).

### E10-P5 · PWA-Feinschliff
- **Ausführung:** DeepSeek · **hängt ab von:** App-Icon (DESIGN.md §8)
- **Dateien:** `public/icons/*`, Manifest-Shortcuts („Add thought“ → Quick Capture), Splash-Screens iOS, `src/web/features/shell/InstallHint.tsx`.
- **Akzeptanz:** Lighthouse PWA und Barrierefreiheit ≥ 90, Shortcut öffnet Quick Capture.

### E10-P6 · Produkt-Events und Metriken
- **Ausführung:** DeepSeek
- **Dateien:** `src/server/domain/events/track.ts`, Aufrufe an den Stellen aus PRD §10 (Onboarding-Schritte, Anker gesetzt/erledigt, Ritual geöffnet, Trial → Abo), `docs/metriken.md` (SQL-Abfragen für jede Metrik).
- **Akzeptanz:** Events ohne IP und ohne Freitext, im Self-Host-Modus abgeschaltet (Test). Jede Metrik aus PRD §10 ist mit einer Abfrage aus `docs/metriken.md` beantwortbar.

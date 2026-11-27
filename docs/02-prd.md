# PRD: Planungs-App für volle Köpfe „Ebbe“

Stand: 2026-11-21 · Status: Entwurf v1 · Grundlage: [01-analyse.md](01-analyse.md)
Produktname „Ebbe“ (Entscheidung 2026-11-27, vorher Arbeitstitel „Ebb“). Der Name ist **nicht** markenrechtlich geprüft; die Prüfung kommt vor dem Launch. Technische Bezeichner (`ebb_*`-Rollen, CSS-Klassen, Speicherschlüssel, Repo) bleiben `ebb`.

## 0. Entscheidungen (2026-11-21)

| Thema | Entscheidung |
|---|---|
| Rechte | Eigene Methode, eigene Texte, eigener Name. Nichts aus dem „Kaizen Life System“ übernehmen (Texte, Lektionen, Beispiele, Design, Name). |
| Zielgruppe | Neurodivergente Menschen und Menschen im Overwhelm (ADHS, Burnout, Erschöpfung) |
| Lizenz | AGPL-3.0, Self-Hosting kostenlos |
| Plattform | PWA, mobile-first, installierbar. Online-first, nur der Dump-Quick-Capture funktioniert offline. |
| Stack | TypeScript-Monorepo: React + Vite (PWA), Hono (API), PostgreSQL mit RLS, Drizzle, Better Auth (Passkey + Passwort) |
| Hosting | Eigener Contabo-VPS in DE mit Docker Compose. Nicht auf dem Entity-Tracker-Server. |
| Datenschutz | DSGVO, EU-Hosting, Verschlüsselung at rest. Kein E2EE. |
| Mandanten | Persönlicher Bereich + geteilte Bereiche (Paar, Familie, kleines Team), **zum Launch** |
| Preis | 7 Tage Trial ohne Karte → Founder 30 €/Jahr (gesperrt auf Lebenszeit) → später 39 €/Jahr. +5 €/Jahr pro zusätzlichem Mitglied |
| Zahlung | Paddle als Merchant of Record |
| Trial-Ende | Read-only + Export. Löschung nach 12 Monaten Inaktivität mit Vorwarnung. „Karte vorab“ per Config umschaltbar. |
| Module v1 | Kern-Ablauf, Low-Energy-Modus, Ziele, Habits, Weekly Reset, Projekte, wiederkehrende Tasks, Fokus-Timer |
| Erinnerungen | Web Push |
| KI | Nicht in v1. Später opt-in, beim Self-Hosting mit eigenem API-Key |
| Sprachen | EN zum Launch. Danach maschinell übersetzt: ES, FR, DE, JA, ZH (in dieser Reihenfolge) |
| Tickets | GitHub Issues, ein Issue pro Paket. Umsetzung durch den DeepSeek-Harness, Prüfung durch Claude |

## 1. Problem

Wer einen vollen Kopf hat, scheitert selten am Wissen, *was* zu tun ist. Er scheitert am Anfangen, weil sich alles gleich dringend anfühlt, die Energie schwankt und jede verpasste Aufgabe Schuldgefühle erzeugt. Klassische Todo-Apps verlangen Priorisierung und Disziplin, also genau das, was fehlt. Notion-Templates bilden gute Methoden ab, bringen aber Reibung mit (Drag & Drop, manuelle Buttons, lange Anleitungen), funktionieren mobil schlecht und stoßen an die Grenzen des Free-Accounts.

## 2. Vision

> Eine App, die dich jeden Morgen in drei Minuten vom vollen Kopf zu einem machbaren Tag führt, und an schlechten Tagen zu einer einzigen Sache.

**Leitprinzipien (gelten für jede Produkt- und UI-Entscheidung):**
1. **Weniger Entscheidungen.** Die App stellt eine Frage nach der anderen, statt ein Board voller Optionen zu zeigen.
2. **Konsequenz statt Priorität.** Sortiert wird nach „Was passiert, wenn das wartet?“, nicht nach „Wie wichtig ist das?“.
3. **Energie statt Zeit.** Der Plan richtet sich nach der Energie, die heute da ist.
4. **Keine Schuld.** Keine roten Überfällig-Zähler und keine Streak-Strafen. Verschobenes heißt „verschoben“, nicht „verpasst“. Pausen sind Teil des Systems.
5. **Ruhig.** Wenig Farbe, keine Animationen ohne Zweck, nichts blinkt.
6. **Deine Daten.** Export jederzeit, Self-Hosting kostenlos, kein Tracking durch Dritte.

## 3. Zielgruppe

**Primär:** Erwachsene mit ADHS (diagnostiziert oder vermutet), Menschen in oder nach Burnout und Menschen, die sich dauerhaft überfordert fühlen. Sie nutzen das Smartphone mehr als den Desktop.

**Personas**
- **Mara, 29, UX-Designerin, ADHS.** Hat fünf Todo-Apps ausprobiert und alle nach zwei Wochen aufgegeben. Braucht einen schnellen Einstieg und an schlechten Tagen genau einen nächsten Schritt.
- **Jonas, 41, Teamleiter nach Burnout.** Plant zu viel und schafft dann nichts. Braucht eine Obergrenze („höchstens drei Muss-Aufgaben“) und den wöchentlichen Rückblick, um Muster zu sehen. Teilt den Haushalt mit seiner Partnerin, deshalb der geteilte Bereich.

**Sekundär:** Privacy-bewusste Self-Hoster, die Notion keine Daten geben wollen.

## 4. Abgrenzung

- **Gegenüber dem Notion-Template:** gleiche Mechanik, aber ohne Reibung. Rollover automatisch, eine Zeile wird mit einem Tap zur Aufgabe, ein geführtes Morgen-Ritual statt Board-Arbeit, mobil zuerst, Erinnerungen, Ziele, Messung.
- **Gegenüber Todoist/TickTick:** geführtes Ritual statt leerer Liste, Energie-Modi.
- **Gegenüber Sunsama:** etwa ein Siebtel des Preises, self-hostbar, für Overwhelm gemacht statt für Wissensarbeiter-Kalender.
- **Gegenüber OSS-ADHS-Planern (tictic, my-focus-log, DailyWave):** Multi-Device mit Konto, geteilte Bereiche, Weekly Reset, Ziele.

## 5. Die Methode (eigene Formulierung)

Glossar mit Code-Namen: [architektur.md → Glossar](architektur.md#glossar).

**Täglich (Morgen-Ritual, 2–5 Minuten):**
1. **Energie-Check:** „Wie viel Akku hast du heute?“ → *Low* oder *Good*.
2. **Rollover:** Unerledigtes von gestern liegt automatisch wieder in der Inbox. Die App sagt das neutral, ohne Vorwurf.
3. **Leeren:** Was ist seit gestern im Kopf dazugekommen? → Brain Dump.
4. **Sortieren:** Für jede Aufgabe in der Inbox eine Frage: „Was passiert, wenn das bis morgen wartet?“
   - *Dann gibt es echte Probleme* → heute, als **Muss** markiert (höchstens 3, Warnung ab 4, Sperre ab 6)
   - *Nichts Schlimmes* → anderer Tag (Do Date). Eine echte Frist kommt separat ins Feld **Deadline**.
   - *Kleinkram* → **Erledigungen** (undatiert, werden gebündelt abgearbeitet, rollen nicht und zählen nicht als verschoben)
   - *Will ich heute machen* → in einen **Block** (Block 1–4, ein Block = eine Sitzung, danach Pause)
5. **Anker wählen:** Eine einzige Aufgabe, die den Tag lohnenswert macht.
6. **Loslegen:** Block 1 starten, optional mit Timer.

**Low-Energy-Tag:** Statt des Boards kommt ein leerer Screen mit einer Aufgabe: Muss-Aufgaben oder der Anker. Dazu ein Feld „Was ist der erste 10-Minuten-Schritt?“ und ein Timer. Am Ende *Erledigt* oder *Notiz, wo ich aufgehört habe*. Mehr wird nicht verlangt.

**Wöchentlich (Weekly Reset, Standard: Sonntag, konfigurierbar):**
1. Rückblick: drei Fragen (Was lief gut? Was nicht? Was ändere ich?).
2. Zahlen ohne Wertung: Anker erledigt x/7, Habits pro Ziel, erledigte Aufgaben pro Projekt.
3. **Dauerschieber:** Aufgaben, die 3-mal oder öfter verschoben wurden oder älter als 14 Tage sind. Je Aufgabe muss eine Entscheidung fallen: neues Datum, in Schritte zerlegen, überspringen oder löschen.
4. Ausblick: Deadlines und geplante Aufgaben der nächsten 7 Tage.

**Hier geht die App über das Template hinaus:** Die Schiebe-Zählung (`push_count`) und die Wochenzahlen machen Verbesserung über die Zeit messbar.

## 6. Funktionsumfang v1 (Launch)

Jede Funktion hat Anforderungen, die sich prüfen lassen. Details pro Paket stehen in den Tickets.

### F1 Konto und Anmeldung
- Registrierung per E-Mail + Passwort oder per Passkey. E-Mail-Verifizierung ist Pflicht (außer im Self-Host-Modus ohne SMTP).
- Passkey zu einem bestehenden Konto hinzufügen. Mehrere Passkeys pro Konto.
- Passwort vergessen per E-Mail-Link. Rate-Limit auf Login, Registrierung und Reset.
- Sitzungen in httpOnly-, Secure-, SameSite=Lax-Cookies. Liste aktiver Sitzungen mit „Abmelden überall“.
- Bei der Registrierung entsteht automatisch der persönliche Bereich.

### F2 Geführtes Onboarding (Kernhebel gegen Churn)
Ziel: In unter 5 Minuten zu einem ersten echten Tag. Jeder Schritt kann übersprungen werden, außer Schritt 1. Fortschrittsanzeige. Bricht jemand ab, geht es beim nächsten Öffnen an derselben Stelle weiter.
1. Begrüßung in einem Satz, Zeitzone und Sprache werden automatisch erkannt (änderbar).
2. **Ziele:** „Wofür machst du das?“ 1–3 Ziele, mit Beispiel-Chips und optional „Warum ist dir das wichtig?“.
3. **Habits:** 1–2 Habits, aus Vorschlägen passend zum Ziel oder frei. Rhythmus täglich oder x-mal pro Woche, optional mit Erinnerungszeit. Mehr als 2 lässt das Onboarding nicht zu („Fang klein an, später kannst du mehr anlegen“).
4. **Erster Brain Dump:** großes Textfeld mit Denkanstößen („Woran darfst du nicht vergessen zu denken?“, „Auf wen wartest du?“, „Was steht bald an?“).
5. **Zeilen zu Aufgaben:** Pro Zeile ein Tap auf „→ Aufgabe“.
6. **Sortieren:** Die Konsequenz-Frage für bis zu 3 Aufgaben (der Rest bleibt in der Inbox).
7. **Anker wählen.**
8. **Rituale:** Uhrzeit fürs Morgen-Ritual und Tag/Uhrzeit für den Weekly Reset. Push aktivieren; auf iOS mit Hinweis „zum Home-Bildschirm hinzufügen“, weil Push nur in der installierten PWA geht.
9. Fertig → Heute-Screen.

Akzeptanz: Ein neuer Nutzer kommt mit den Vorschlägen in ≤ 15 Taps durch das Onboarding. Ein Abbruch in Schritt n führt beim nächsten Öffnen zurück zu Schritt n.

### F3 Brain Dump
- Ein Textfeld pro Nutzer, jede Zeile ein eigener Eintrag (`dump_line`).
- Pro Zeile „→ Aufgabe“: erzeugt eine Aufgabe in der Inbox mit Do Date heute und markiert die Zeile als umgewandelt (durchgestrichen, nicht gelöscht).
- Zeilen archivieren („Gedanke ist raus, kann weg“). „Gedanken behalten“ verschiebt sie in ein Archiv.
- **Offline:** Neue Zeilen landen ohne Netz in einer lokalen Warteschlange (IndexedDB) und werden beim nächsten Online-Zustand in Reihenfolge übertragen. Der Status ist sichtbar („3 Gedanken warten auf Verbindung“).
- **Quick Capture:** von überall erreichbar (FAB auf Mobil, Tastenkürzel `n` auf Desktop), plus PWA-Shortcut im App-Icon-Menü.

### F4 Aufgaben und Sortieren
- Felder: Titel, Notiz, Status (`todo`, `doing`, `waiting`, `done`, `skipped`), Do Date, Deadline, Muss (bool), Slot (`inbox`, `block1`–`block4`, `errands`), Anker (bool), Projekt, Eltern-Aufgabe, Zuständige Person (nur in geteilten Bereichen), Schiebe-Zähler.
- Sortier-Flow: eine Aufgabe nach der anderen, Karte mit vier großen Antworten (siehe Methode). Wischgesten auf Mobil, Tasten 1–4 auf Desktop.
- Do Date und Deadline sind getrennt. Liegt die Deadline vor dem Do Date, erscheint eine Warnung.
- **Muss-Grenze:** ab der 4. Muss-Aufgabe am Tag ein Hinweis, ab der 6. ist es gesperrt.

### F5 Heute
- Ansicht mit Anker oben, darunter Muss-Aufgaben, dann Block 1–4 und Erledigungen. Leere Blöcke werden ausgeblendet.
- Aufgaben per Drag & Drop zwischen Blöcken verschieben **und** per Menü („Verschieben nach …“), damit es barrierefrei geht.
- **Anker:** höchstens einer pro Nutzer und Tag. Wer einen neuen setzt, entfernt den alten (mit Rückfrage).
- **Automatischer Rollover** beim ersten Aufruf nach Tagesbeginn (Standard 04:00 Ortszeit, einstellbar): Aufgaben mit Status `todo` oder `doing` und Do Date vor heute bekommen Do Date heute und Slot `inbox`, der `push_count` steigt um 1. Muss und Anker werden zurückgesetzt. Die Deadline bleibt. `waiting` wird nicht verschoben und erscheint in „Wartet auf …“.
- Zusätzlich Ansichten **Morgen** und **Woche** (7-Tage-Liste, kein Kalender-Grid in v1), dazu Erledigt und Übersprungen.
- **Erledigungen-Ansicht:** alle Aufgaben mit Slot `errands`, egal welches Do Date. Erledigte und übersprungene bleiben 7 Tage sichtbar. Ein optionaler Erledigungs-Tag schickt eine Erinnerung.

### F6 Low-Energy-Modus
- Wird über den Energie-Check gewählt und lässt sich jederzeit umschalten.
- Zeigt: eine Aufgabe (Vorschlag: Muss vor Anker vor erster Inbox-Aufgabe, änderbar), das Feld „Erster 10-Minuten-Schritt“, Timer-Start (10 Minuten), Knöpfe *Erledigt* und *Für heute aufhören* (mit Notiz-Feld, die Notiz landet an der Aufgabe).
- Nach *Erledigt* kommt das Angebot: „Noch eine?“ oder „Genug für heute“, ohne Druck und ohne Emoji (DESIGN.md §9).

### F7 Fokus-Timer
- Pro Block startbar. Dauer 25, 50 oder 90 Minuten oder frei. Am Ende ein Pausen-Hinweis per Notification (Seite offen) oder Push (Seite zu).
- Die laufende Zeit lebt im Client; Start und Ende werden als `focus_session` gespeichert (für den Wochenrückblick).

### F8 Ziele
- 1–5 aktive Ziele pro Person (das Onboarding legt 1–3 an). Felder: Titel, Warum, Status (`active`, `paused`, `done`), Reihenfolge.
- Habits und Projekte können einem Ziel zugeordnet werden. Die Zielseite zeigt die Habits dieser Woche, offene Projekte und den nächsten Schritt.
- Ziele sind persönlich. In geteilten Bereichen gibt es nur Projekte und Aufgaben (siehe F13).

### F9 Habits
- Felder: Name, Ziel (optional), Rhythmus (`daily` oder `weekly_count` mit 1–7), Wochentage (optional), Erinnerungszeit (optional), archiviert.
- Abhaken pro Tag (ein Tap auf Heute, im Bereich „Habits heute“). Gestern lässt sich nachtragen, ältere Tage nicht.
- **Keine Streak-Strafe:** gezeigt wird „5 von 7 diese Woche“, nicht „Streak verloren“.

### F10 Projekte und Unteraufgaben
- Projekt: Name, Ziel (optional), Status (`active`, `paused`, `done`), Start, Ende/Deadline, Bereich (persönlich oder geteilt).
- Fortschritt = erledigte ÷ (alle − übersprungene) Aufgaben des Projekts.
- Warnungen: Deadline in ≤ 3 Tagen und Fortschritt < 100 %. Aktives Projekt ohne offene Aufgabe mit Do Date („Kein nächster Schritt geplant“).
- Unteraufgaben: eine Ebene tief. Die Eltern-Aufgabe zeigt x/y.

### F11 Wiederkehrende Aufgaben
- Regeln: täglich, werktags, wöchentlich an bestimmten Tagen, alle N Tage, monatlich am Tag N (gibt es den Tag im Monat nicht, gilt der letzte Tag).
- Die Instanz für heute wird beim Tagesbeginn angelegt, und nur wenn für diesen Tag noch keine existiert (idempotent). Verpasste Instanzen werden nicht nachgeholt; die alte rollt normal über.
- Regel bearbeiten wirkt ab der nächsten Instanz.

### F12 Weekly Reset
- Geführter Ablauf in 4 Schritten (siehe Methode). Er lässt sich unterbrechen und später fortsetzen.
- Die Antworten der Reflexion werden pro Woche gespeichert. Frühere Wochen bleiben lesbar.
- Dauerschieber-Schritt: Jede Aufgabe braucht eine Entscheidung, bevor der Schritt abgeschlossen ist („Später“ ist keine Option).

### F13 Geteilte Bereiche
- Jede Person hat genau einen persönlichen Bereich und kann geteilten Bereichen beitreten oder sie anlegen.
- Einladung per Link (läuft nach 7 Tagen ab, einmal nutzbar) oder per E-Mail. Rollen `owner` und `member`. Ein Owner kann Mitglieder entfernen und den Bereich löschen. Ein Mitglied kann austreten.
- In geteilten Bereichen: Projekte und Aufgaben. Eine Aufgabe ist nicht zugewiesen oder genau einer Person zugewiesen. Zugewiesene Aufgaben erscheinen im Tagesplan dieser Person. Nicht zugewiesene stehen in der Bereichsliste und lassen sich mit „Übernehmen“ zu sich ziehen.
- Planungsfelder (Slot, Muss, Anker, Do Date) gehören der zuständigen Person.
- Dump, Ziele, Habits und Weekly Reset bleiben persönlich.
- Wer ein Mitglied entfernt, setzt dessen zugewiesene Aufgaben auf „nicht zugewiesen“.
- Abrechnung: siehe F15.

### F14 Erinnerungen (Web Push)
- Typen: Morgen-Ritual, Habit-Erinnerung, Weekly Reset, Erledigungs-Tag, Timer-Ende, Trial endet bald. Jeder Typ ist einzeln abschaltbar.
- Ruhezeiten: Standard 21:00–07:00 Ortszeit, nur der Timer darf darin senden.
- Fällt Push weg (abgelaufene Subscription, 404/410), wird die Subscription gelöscht. Keine E-Mail als Ersatz.
- iOS: Push nur in der installierten PWA (ab iOS 16.4). Ein Hinweis-Screen erklärt die Installation.

### F15 Trial, Abo, Zugriff
- **Trial:** 7 Tage ab Registrierung, ohne Zahlungsdaten. Config `TRIAL_REQUIRES_CARD=false` (bei `true` startet der Trial über einen Paddle-Checkout mit Trial-Zeitraum).
- **Preise (Paddle-Price-IDs per Config):** Basis-Abo jährlich, Founder 30 € oder Standard 39 €. Welcher Preis neuen Kunden angeboten wird, steuert `PRICE_BASE_ACTIVE`. Bestehende Abos behalten ihren Preis. Zusatzmitglied 5 €/Jahr als Menge am selben Abo.
- **Zugriff (Entitlement)** für eine Person gilt, wenn mindestens eines zutrifft: Self-Host-Modus, Trial läuft, eigenes Abo aktiv, Sitz auf dem Abo einer anderen Person aktiv.
- **Sitze:** Wer zahlt, kann Personen aus seinen geteilten Bereichen „mit abdecken“ → Menge +1 (anteilig berechnet über Paddle). Obergrenze `MAX_EXTRA_SEATS` (Standard 5).
- **Ohne Zugriff:** Lesen und Export gehen, Schreiben nicht. Die API antwortet mit 402 und dem Code `subscription_required`, die UI zeigt ein ruhiges Banner mit „Abo abschließen“. Mitglieder geteilter Bereiche ohne Zugriff können dort ebenfalls nur lesen.
- **E-Mails:** Trial endet in 2 Tagen (mit Wochenrückblick als Wertbeleg), Trial beendet, Zahlung fehlgeschlagen (kommt von Paddle), Löschung in 30 und in 7 Tagen.
- **Löschung:** 12 Monate ohne Zugriff und ohne Login → Konto und persönliche Daten löschen. In geteilten Bereichen werden ihre Aufgaben „nicht zugewiesen“, Bereiche ohne Mitglieder werden gelöscht.
- Abo verwalten (Kündigen, Zahlungsmittel, Rechnungen) über das Paddle-Kundenportal (Link aus der App).

### F16 Self-Host-Modus
- `APP_MODE=selfhost`: kein Billing, kein Trial, Zugriff immer an. Registrierung offen, nur per Einladung oder geschlossen (`REGISTRATION=open|invite|closed`). Der erste registrierte Nutzer wird Instanz-Admin.
- Ohne SMTP: keine Verifizierungs-Mails, Passwort-Reset per CLI-Befehl (`node dist/cli.js reset-password <email>`).
- VAPID-Schlüssel werden beim ersten Start erzeugt und in der Datenbank gespeichert.
- Lieferung: ein Docker-Image (`ghcr.io/<org>/<app>`) und `docker-compose.selfhost.yml` mit Postgres. Ein README mit 5-Minuten-Anleitung.

### F17 Daten-Export und Löschung (DSGVO)
- Export jederzeit, auch read-only: ZIP mit `data.json` (alle eigenen Daten plus Aufgaben in geteilten Bereichen, die man angelegt hat oder die einem zugewiesen sind) und CSV pro Entität.
- Konto löschen: sofort abgemeldet, Daten nach spätestens 30 Tagen hart gelöscht (Wartefrist für versehentliches Löschen, Wiederherstellung per Support). Ein aktives Paddle-Abo wird vorher gekündigt.

### F18 Mehrsprachigkeit
- Alle UI-Texte in `locales/<lang>.json`, Quellsprache EN. Keine Texte im Code.
- Datum, Zahl und Wochenstart über `Intl` und die Locale. Der Weekly-Reset-Tag ist unabhängig davon einstellbar.
- Übersetzung per Skript (LLM über API) für `es`, `fr`, `de`, `ja`, `zh-CN`. Es übersetzt nur geänderte Schlüssel und markiert maschinelle Übersetzungen. Ein Mensch prüft stichprobenartig vor jedem Release.
- CJK: System-Font-Fallbacks, keine abgeschnittenen Labels (Layout-Tests mit Pseudo-Locale `en-XA`, 40 % längere Texte).
- Rechtstexte (Impressum, Datenschutz, AGB) auf EN und DE, von einem Menschen geschrieben.

### F19 Einstellungen
- Profil, Sprache, Zeitzone, Tagesbeginn, Weekly-Reset-Tag/-Uhrzeit, Erledigungs-Tag, Erinnerungen, Muss-Limit-Hinweis (3–5), Timer-Standard, Passkeys, Sitzungen, Abo, Export, Konto löschen.

## 7. Nicht in v1

KI-Extraktion aus dem Dump, Spracheingabe, native Apps (die PWA reicht), Kalender-Sync (Google/iCal), Import aus Notion, Ende-zu-Ende-Verschlüsselung, Integrationen (Todoist, GitHub …), Teams mit mehr als `1 + MAX_EXTRA_SEATS` Personen, Gamification (Punkte, Level), Kalender-Grid-Ansicht, Unteraufgaben in mehr als einer Ebene, Anhänge/Dateien, Kommentare an Aufgaben.

## 8. Nicht-funktionale Anforderungen

| Bereich | Anforderung |
|---|---|
| Performance | Heute-Screen auf einem Mittelklasse-Handy (Moto G Power, 4G) in < 2 s interaktiv. API p95 < 200 ms bei 50 gleichzeitigen Requests. JS-Bundle initial < 250 KB gzip. |
| Barrierefreiheit | WCAG 2.2 AA. Alles per Tastatur bedienbar, Drag & Drop hat immer eine Menü-Alternative. `prefers-reduced-motion` wird respektiert. Touch-Ziele ≥ 44 px. |
| Sicherheit | Mandantentrennung per PostgreSQL-RLS (`FORCE`), App-Rolle ohne `BYPASSRLS`. Jeder Endpunkt hat einen Test, dass fremde IDs 404 liefern. Eingaben werden am Server mit zod validiert. CSP ohne `unsafe-inline` für Skripte. Paddle-Webhooks mit Signaturprüfung. Secrets nur über ENV. |
| Datenschutz | Nur ein technisch notwendiges Cookie (Session), daher kein Consent-Banner. Keine Drittanbieter-Skripte außer Paddle.js auf der Checkout-Seite. Produkt-Events nur in der eigenen DB, ohne IP, aggregierbar, im Self-Host-Modus aus. Auftragsverarbeiter: Contabo, Paddle, E-Mail-Provider (EU). |
| Zuverlässigkeit | Backup täglich (`pg_dump`, verschlüsselt, offsite in der EU). Aufbewahrung 14 Tage täglich + 8 Wochen wöchentlich. Restore-Test monatlich. Ziel 99,5 % Verfügbarkeit, gemessen per Uptime-Monitor. |
| Browser | Aktuelle Versionen von Chrome, Edge, Firefox und Safari; iOS Safari ab 16.4, Android Chrome. |
| Code | TypeScript strict. Tests: Vitest (Unit + Integration gegen echtes Postgres) und Playwright für die Hauptabläufe. `npm run check` und `npm test` grün vor jedem Merge. |

## 9. Monetarisierung

| | Preis/Jahr (brutto) | Netto nach 19 % USt und Paddle (~5 % + 0,50 $) |
|---|---|---|
| Founder (Basis) | 30 € | ≈ 23 € |
| Standard (Basis) | 39 € | ≈ 30 € |
| Zusatzmitglied | 5 € | ≈ 4 € |

Zum Marktvergleich (Jahrespreise laut Vergleichsseiten, Stand Herbst 2026): TickTick ~36–50 $, Tiimo ~54 $, Todoist ~60 $, Lunatask ~72 $, Amazing Marvin ~96 $, Sunsama ~204–240 $. Any.do Family ~100 $ für 4 Personen.

**Founder-Phase:** endet, wenn `PRICE_BASE_ACTIVE` umgestellt wird. Vorschlag: nach 500 zahlenden Konten oder 6 Monaten nach dem Launch, je nachdem, was zuerst eintritt. Wird in der App offen kommuniziert („Founder-Preis, bleibt für dich für immer“).

**Hinweis zu den Zusatzmitgliedern:** 5 € pro Person mit voller App ist sehr günstig (Claude hat 10 € empfohlen). Entscheidung: 5 €. Der Preis liegt in der Config und lässt sich für Neukunden ändern.

## 10. Erfolgsmessung

| Metrik | Definition | Ziel nach 3 Monaten |
|---|---|---|
| Onboarding-Abschluss | Anteil der Registrierten, die Schritt 9 erreichen | ≥ 70 % |
| Aktivierung | Am Tag 1 einen Anker gesetzt **und** erledigt | ≥ 40 % |
| D7-Retention | An ≥ 3 der ersten 7 Tage das Morgen-Ritual geöffnet | ≥ 35 % |
| Trial → Abo | Anteil der Trials mit Abschluss innerhalb von 14 Tagen nach Trial-Ende | ≥ 8 % |
| Jahres-Churn | Abos, die nicht verlängert werden | ≤ 35 % |

Gemessen über eigene Events in der Datenbank (Tabelle `product_event`), ausgewertet per SQL. Kein Drittanbieter.

## 11. Betrieb und Kapazität

- **Zielsystem:** bestehender Contabo-VPS in DE als eigenes Compose-Projekt (eigene Postgres-Instanz, eigenes Netzwerk, CPU-/RAM-Limits), Caddy für TLS. Getrennt vom Entity-Tracker-Server, damit eine kompromittierte oder überlastete App die andere nicht mitreißt.
- **Schätzung, nicht gemessen:** ein aktiver Nutzer erzeugt ~150–300 kleine API-Requests pro Tag und ~1–5 MB Daten pro Jahr. 5 000 täglich Aktive ≈ 1,5 Mio Requests/Tag ≈ 17/s im Schnitt und ~100/s in der Morgenspitze. Das schafft ein 4-vCPU-VPS mit Node + Postgres komfortabel. Push an 5 000 Nutzer in einer Minute ist mit Batching kein Problem. Paket E9-P6 prüft das per Lasttest.
- **Wechsel auf einen größeren oder dedizierten Server bei Messwerten, nicht bei Nutzerzahlen:** p95-Latenz > 300 ms über einen Tag, CPU dauerhaft > 70 %, RAM > 80 % oder Datenbank > 50 % der Platte. Erster Schritt: Postgres auf eigenen VPS auslagern. Zweiter Schritt: mehrere App-Instanzen hinter Caddy (dafür muss der Job-Runner per Advisory Lock schon jetzt single-instance-sicher sein).

## 12. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Nähe zum Kaizen Life System (Urheber- und Markenrecht) | Abmahnung, Launch-Stopp | Eigene Texte und Namen, keine Lektionen übernehmen. Anwaltliche Kurzprüfung vor dem Launch. |
| iOS-Push nur in der installierten PWA | Erinnerungen erreichen iPhone-Nutzer schlechter | Installations-Hinweis im Onboarding. Das Morgen-Ritual funktioniert auch ohne Push. |
| Gesättigter Markt | Zu wenig Nutzer | Positionierung über das geführte Ritual und Overwhelm. Self-Hosting als Vertrauensanker. |
| Code-Qualität durch DeepSeek | Sicherheitslücken, Mandanten-Leaks | Kern-Pakete (Datenmodell, RLS, Auth, Billing) baut Claude. Jedes Paket wird von Claude geprüft. Adversary-Tests für Mandantentrennung. |
| Support-Last bei 23 € netto | Solo nicht tragbar | Self-Service (Paddle-Portal, Export, FAQ). Support nur per E-Mail, Antwort in 3 Werktagen. |
| Contabo-Leistung (überbuchte CPUs) | Latenzspitzen | Messwerte überwachen, Wechselkriterien siehe §11 |

## 13. Offene Punkte

| # | Frage | Wer | Vorschlag |
|---|---|---|---|
| O1 | Produktname und Markenprüfung (DPMA/EUIPO), Domain | Dion | Drei Kandidaten sammeln, dann prüfen. Bis dahin Codename im Code. |
| O2 | Rechtstexte (Impressum, Datenschutz, AGB) | Dion + Anwalt | Generator plus anwaltliche Prüfung, Paddle-Käuferbedingungen verlinken |
| O3 | E-Mail-Provider (EU) | Dion | z. B. Brevo oder Mailjet, alternativ SMTP über eigenen Mailserver |
| O4 | GitHub-Organisation und Repo-Name, Sichtbarkeit | Dion | Privat bis zur Beta, öffentlich zum Launch (AGPL) |
| O5 | Ende der Founder-Phase | Dion | 500 Konten oder 6 Monate |

## 14. Meilensteine (Epics)

Details, Pakete und Wellen: GitHub Issues (Epic-Issue pro Zeile, Paket-Issues als Sub-Issues).

| Epic | Inhalt | Hängt ab von |
|---|---|---|
| E1 | Fundament: Repo, CI, Docker, DB + RLS, Auth, Bereiche, i18n-Gerüst, Design-Tokens, App-Shell | — |
| E2 | Kern-Ablauf: Dump (+ offline), Aufgaben, Sortieren, Heute, Blöcke, Anker, Muss, Rollover, Morgen/Woche | E1 |
| E3 | Energie: Morgen-Ritual, Low-Energy-Modus, Fokus-Timer | E2 |
| E4 | Ziele, Habits, Onboarding | E2 (Onboarding auch E3) |
| E5 | Projekte, Unteraufgaben, wiederkehrende Aufgaben, Erledigungen | E2 |
| E6 | Weekly Reset und Wochenzahlen | E4, E5 |
| E7 | Geteilte Bereiche: Einladungen, Zuweisung, Übernehmen | E2 |
| E8 | Billing: Trial, Paddle, Sitze, Entitlement, Read-only, Self-Host-Modus | E1, E7 |
| E9 | Betrieb: Push, Export/Löschung, Backups, Deploy, Monitoring, Lasttest | E1 (Push: E3, E4) |
| E10 | Launch: Übersetzungen, Rechtstexte, Landingpage, PWA-Feinschliff | alle |

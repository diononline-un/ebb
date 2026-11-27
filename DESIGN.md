# Design Constitution: ebbe

**Version** 1.0.2 · **Stand** 2026-11-27 · **Amended by** Claude (Richtung „Ebbe“, freigegeben von Dion)
**Status:** bindend. Vor jeder UI-Arbeit lesen. Änderungen nur über §12, nie durch Improvisation.

---

## 0. Warum es dieses Dokument gibt

Mehrere Coding-Agents bauen diese Oberfläche, jeder ohne Gedächtnis. Ohne Papier entstehen zehn Grautöne, drei Rundungen und rote Überfällig-Badges, also genau die Schuld-UI, gegen die das Produkt antritt. Dieses Papier legt Werte, Gründe und Verbote fest, damit Paket 40 aussieht wie Paket 1.

---

## 1. Positionierung

- **Für:** Erwachsene mit vollem Kopf, also ADHS, Burnout oder Dauer-Overwhelm, die morgens am Handy ihren Tag sortieren und an schlechten Tagen genau eine Sache brauchen.
- **Nicht für:** Power-User, die Kanban, Zeitblöcke im Kalender, Tags und Filter erwarten (die sind bei Todoist, Sunsama oder Notion besser aufgehoben).
- **Erste 3 Sekunden sollen sich anfühlen:** ruhig, aufgeräumt, freundlich.
- **Was morgen hängen bleibt:** „Die App hat mich eine Frage nach der anderen gefragt, und dann war mein Tag klar.“
- **Haltung zur Konvention:** passt zum Sektor (Operate-Modus), weil Navigation, Listen und Formulare für Menschen mit wenig Energie sofort lesbar sein müssen. Abweichen dürfen nur die Signatur (Tide-Linie, §6) und der Tonfall (§9).
- **Abgrenzung:** nichts vom Notion-Template „Kaizen Life System“. Kein Navy, kein gelber Sonnenkreis, keine Japan-Motive, keine goldenen Callout-Boxen, keine roten EOD-Karten, kein „babe“-Ton.
- **Evidenz:** Richtung aus `docs/01-analyse.md` (Schwächen des Templates) und `docs/02-prd.md` §2 (Leitprinzipien), Kontraste gemessen mit `audit.py contrast` am 2026-11-21. Eine eigene Design-Recherche-Datei gibt es nicht: `[source needed]`, falls die Landingpage (Persuade) gebaut wird.

---

## 2. Farbe

Welt: Ufer bei Ebbe, früher Morgen. Nasser Sand als Grund, Schiefer als Tinte, Meerglas als einziger Akzent.

### Light

| Rolle | Token | Wert | Darf | Nie |
|---|---|---|---|---|
| Grund | `--ground` | `#F4F2EE` | Seite | Bedeutung tragen |
| Fläche erhöht | `--surface-2` | `#FBFAF8` | Sheets, Popover, Eingabe-Karten im Ritual | Seitenhintergrund |
| Fläche vertieft | `--surface-sunken` | `#ECE9E3` | Eingabefelder, Dump-Fläche, inaktive Spuren | Text darauf in `--ink-3` unter 15 px |
| Tinte | `--ink` | `#1F2A2E` | Text, Icons, Muss-Punkt | Deko |
| Tinte sekundär | `--ink-2` | `#4A5559` | Beschreibungen, Notizen | Überschriften |
| Tinte gedämpft | `--ink-3` | `#5A6569` | Meta, erledigte Aufgaben, deaktiviert | etwas Tragendes |
| Linie | `--line` | `--ink` @ 10 % (`rgb(31 42 46 / .10)`) | Trenner, Rahmen | Betonung |
| Akzent | `--signal` | `#1D6B62` | Primär-Aktion, Anker-Markierung, Tide-Linie, Fokus-Ring | Fließtext, große Flächen |
| Akzent Hover | `--signal-hover` | `#175A52` | Hover/Pressed des Primär-Buttons | sonst |
| Text auf Akzent | `--signal-ink` | `#FFFFFF` | Text auf `--signal` | sonst |
| Hinweis | `--warn` | `#8A5A00` | „Deadline in 2 Tagen“ (nur Text + Icon) | Flächen, Überfälliges |
| Fehler | `--danger` | `#A3362B` | echte Fehler, destruktive Bestätigung | Muss, verschobene oder überfällige Aufgaben |

### Dark (eigenes Design, keine Umkehrung)

| Rolle | Token | Wert |
|---|---|---|
| Grund | `--ground` | `#121A1C` |
| Fläche 1 (Karten) | `--surface-1` | `#182224` |
| Fläche 2 (Sheets, Popover) | `--surface-2` | `#1F2A2D` |
| Fläche vertieft | `--surface-sunken` | `#0E1517` |
| Tinte / 2 / 3 | `--ink` `--ink-2` `--ink-3` | `#E8ECEA` / `#B5BEBC` / `#8D9997` |
| Linie | `--line` | `rgb(232 236 234 / .12)` |
| Akzent / Hover / Text darauf | `--signal` `--signal-hover` `--signal-ink` | `#6FC2B4` / `#83CDC0` / `#0E2421` |
| Hinweis / Fehler | `--warn` `--danger` | `#E3B565` / `#F08C7E` |

Maschinenlesbare Kopie für `scripts/check-design.py`:

<!-- TOKENS
ground: #F4F2EE #FBFAF8 #ECE9E3
ink: #1F2A2E #4A5559 #5A6569
accent: #1D6B62 #175A52
on-accent: #FFFFFF
color: #8A5A00 #A3362B
ground-dark: #121A1C #182224 #1F2A2D #0E1517
ink-dark: #E8ECEA #B5BEBC #8D9997
accent-dark: #6FC2B4 #83CDC0
on-accent-dark: #0E2421
color-dark: #E3B565 #F08C7E
radius: 0 8 12 16 9999
spacing: 0 4 8 12 16 24 32 48 64 96
fonts: "Atkinson Hyperlegible Next" "Atkinson Hyperlegible Mono" "Hiragino Sans" "Noto Sans CJK JP" "PingFang SC"
-->

**Kontrast (gemessen am 2026-11-21):**
- Light: ink/ground 13,14 · ink-2/ground 6,87 · ink-3/ground 5,37 · ink-3/sunken 4,95 · signal/ground 5,64 · signal/surface-2 6,04 · weiß/signal 6,30 · warn/ground 5,30 · danger/ground 6,02.
- Dark: ink/ground 14,80 · ink-2/ground 9,29 · ink-3/ground 6,00 · ink-3/surface-2 5,00 · signal/ground 8,45 · signal/surface-2 7,04 · signal-ink/signal 7,77 · warn 9,30 · danger 7,36.
- Neue Paare werden vor der Nutzung gemessen (`audit.py contrast`) und hier eingetragen.

**Akzent-Budget:** höchstens 5 % eines Screens, höchstens zwei Stellen gleichzeitig (typisch: Tide-Linie + Primär-Button).
**Rahmen:** nur `--line` (transparent). Keine festen Hex-Rahmen.
**Dark Mode:** ja, folgt `prefers-color-scheme`, umschaltbar in den Einstellungen. Tiefe über hellere Flächen, nicht über Schatten.
**Verbotene Farben:** Rot oder Orange für Muss, verschobene oder überfällige Aufgaben (Schuld-Signal, Leitprinzip 4). Lila-Blau-Verläufe und jeder Verlauf als Deko. Gelb/Gold als Fläche (Nähe zum Template). Mehr als ein Akzent.

**Warum diese Palette:** Die Zielgruppe öffnet die App oft mit Stress. Warmes Sand-Grau beruhigt mehr als reines Weiß. Schiefer statt Schwarz senkt die Härte und bleibt mit 13:1 sehr lesbar. Meerglas-Grün ist der einzige Akzent: Es signalisiert „hier geht's weiter“ ohne die Alarmwirkung von Rot oder Orange und hat keinen Bezug zum Navy und Gelb des Templates.

---

## 3. Typografie

| Aufgabe | Schrift | Schnitte | Für | Nie für |
|---|---|---|---|---|
| Alles (Display, Body, UI) | Atkinson Hyperlegible Next (variabel) | 400, 500, 700 | Überschriften, Text, Labels, Buttons | — |
| Zahlen, die laufen oder verglichen werden | Atkinson Hyperlegible Mono | 400, 500 | Timer, Wochenzahlen („5/7“) | Fließtext, Deko |

**Skala (mobile-first, rem bezogen auf 16 px):**

| Rolle | Größe | Zeilenhöhe | Laufweite | Einsatz |
|---|---|---|---|---|
| Question | 32 px | 38 px | −0.01em, 500 | die eine Frage im Ritual und im Low-Energy-Modus |
| Title | 24 px | 30 px | 0, 700 | Seitentitel („Today“), Anker-Titel |
| Heading | 19 px | 26 px | 0, 700 | Abschnitte (Block 1, Habits) |
| Body | 17 px | 26 px | 0, 400 | Aufgabentitel, Text, Buttons (500) |
| Small | 15 px | 22 px | 0, 400 | Notizen, Hilfetexte |
| Meta | 13 px | 18 px | 0.01em, 400 | Datum, Projekt, Zähler (nie allein tragend) |

**Regeln**
- Hierarchie über Größe und Farbe zuerst, Gewicht danach.
- Body 17 px statt 16 px, weil die Zielgruppe oft müde und unkonzentriert liest. Der Mehrwert an Lesbarkeit kostet kaum Platz.
- Zeilenlänge für Fließtext 45–75 Zeichen, Container `max-width: 65ch`.
- `font-variant-numeric: tabular-nums` für alle wechselnden Zahlen.
- Satzanfang groß, sonst klein (Sentence case). Keine Versalien-Labels.
- Schriften selbst gehostet (`@fontsource-variable/…` bzw. lokale Dateien), keine Requests an Dritte.
- CJK-Sprachen: System-Fallback (`"Hiragino Sans", "Noto Sans CJK JP", "PingFang SC", sans-serif`) hinter Atkinson.

**Warum:** Atkinson Hyperlegible wurde vom Braille Institute für maximale Unterscheidbarkeit der Zeichen entworfen (I, l, 1, 0, O sind eindeutig). Das hilft bei Legasthenie und Müdigkeit und passt zu „ruhig, genau“. Eine einzige Familie hält das System ruhig.

---

## 4. Raum

- **Basis:** 4 px. **Skala:** 0 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96.
- **Dichte:** großzügig. Eine Aufgabenzeile ist mindestens 52 px hoch (Touch-Ziel 44 px + Luft). Wenig Elemente pro Screen sind Absicht, kein Platzproblem.
- **Abschnittsabstand:** 32 px mobil / 48 px Desktop. In Gruppen 8–12 px.
- **Gruppierung:** Nähe zuerst. Linien (`--line`) nur zwischen Listeneinträgen, keine Karten um Listen.
- **Werte außerhalb der Skala:** nicht erlaubt. Fehlt ein Wert, Papier ändern (§12).

**Warum:** Wenig Reize pro Screen sind das Produkt. Dichte Listen erzeugen genau das Gefühl „zu viel“, gegen das die App antritt.

---

## 5. Layout

- **Container:** Inhalt `max-width: 640px`, zentriert. Fließtext `65ch`.
- **Breakpoints:** `sm 640` · `md 768` · `lg 1024`.
- **Mobil (390 zuerst):** Untere Tab-Leiste mit vier Zielen: **Today · Dump · Plan · More**. Quick-Capture als runder Button rechts unten über der Leiste (56 px, `--signal`, Icon `plus`). Task-Details als Bottom-Sheet.
- **Desktop (≥ lg):** linke Leiste 240 px mit denselben Zielen (More klappt auf: Goals, Habits, Projects, Weekly reset, Spaces, Settings), Inhalt 640 px, Task-Details als Seiten-Sheet rechts (400 px), die Liste bleibt sichtbar.
- **Today, Reihenfolge von oben:** Titel mit Datum → Energie-Zustand (eine Zeile) → **Anker** → **Tide-Linie** → Muss-Aufgaben → Block 1–4 (leere ausgeblendet) → Erledigungen → Habits heute → „Erledigt heute“ eingeklappt.
- **Above the fold (390 × 844):** Anker und die ersten Muss-Aufgaben müssen ohne Scrollen sichtbar sein.
- **Ritual und Onboarding:** eine Frage pro Screen, Frage oben in „Question“, Antworten als große Flächen (≥ 56 px) unten in Daumenreichweite. Fortschritt als feine Linie oben (keine Schritt-Nummern „01/09“).
- **Navigation:** konventionell, weil Neuheit in der Navigation Energie kostet.

---

## 6. Form und Tiefe

- **Radien:** Control 8 · Karte/Popover 12 · Sheet 16 (nur obere Ecken mobil) · Pill 9999 (Chips, Quick-Capture). Verschachtelt: innen = außen − Innenabstand (`calc()`).
- **Tiefe:** Helligkeitsstufen. Light: `--ground` → `--surface-2`. Dark: `--ground` → `--surface-1` → `--surface-2`.
- **Schatten:** nur für schwebende Elemente (Sheet, Popover, Quick-Capture), nur Light: `0 8px 24px -8px rgb(31 42 46 / .18)`. Dark: kein Schatten, stattdessen `--surface-2` + `--line`.
- **Karten:** nicht als Strukturmittel. Listen sind Listen mit Trennlinien. Eine Fläche (`--surface-2`, Radius 12) bekommen nur der Anker im Low-Energy-Modus, Ritual-Fragen und Sheets.

### Signatur: die Tide-Linie

Eine 1 px hohe Linie in `--signal` über die volle Inhaltsbreite, direkt unter dem Anker.
- **Today:** trennt den Anker vom Rest des Tages.
- **Low-Energy-Modus:** Alles unterhalb der Linie wird ausgeblendet („ebbt weg“). Übrig bleiben Anker, erster Schritt und Timer.
- **Ritual und Onboarding:** Die Fortschrittslinie oben ist dieselbe Linie und füllt sich von links nach rechts.
- **Anker erledigt:** Die Linie zeichnet sich einmal neu von links nach rechts (§7, der einzige inszenierte Moment).
Die Linie wird nirgends sonst verwendet. Sie ist das Wiedererkennungsmerkmal.

### Aufgabenzeile (Anatomie)

`[Kreis-Checkbox 24 px, Trefferfläche 44 px] [Muss-Punkt 8 px in --ink, falls Muss] Titel (Body) / darunter Meta (Projekt · Deadline)`
- Erledigt: Titel durchgestrichen in `--ink-3`, bleibt bis zum Tagesende in „Erledigt heute“.
- **Muss:** gefüllter Punkt in `--ink` plus unsichtbarer Text „Must“ für Screenreader. Nie Rot, nie Rahmen, nie Hintergrund.
- **Verschoben-Zähler** („↻ 3×“, Icon `rotate-cw`) nur in Plan und Weekly Reset, nie auf Today.
- **Deadline bald:** `--warn`-Text mit Icon `clock`, nur wenn ≤ 2 Tage.

---

## 7. Bewegung

- **Dauern:** sofort 120 ms · Standard 240 ms · inszeniert 400 ms (nur der Anker-Moment).
- **Easing:** Ankommen `cubic-bezier(0.16, 1, 0.3, 1)` · Gehen `cubic-bezier(0.7, 0, 0.84, 0)`.
- **Erlaubte Muster (genau zwei):**
  1. **Sheet:** `translateY(16px)` + Opacity → 0, 240 ms.
  2. **Karte weiter** (Ritual, Sortieren): aktuelle Karte `translateX(-24px)` + Opacity raus, nächste Opacity rein, 240 ms.
- **Inszenierter Moment:** Anker erledigt → Tide-Linie `scaleX(0 → 1)` von links, 400 ms. Kein Konfetti, kein Ton.
- **Nie:** `linear`, `transition: all`, Animation von width/height/top/left/margin, Loops (Pulsieren, Shimmer), Hover-Scale, Zahlen hochzählen, Bounce.
- **Reduzierte Bewegung:** Transform weg, Opacity- und Farbwechsel bleiben.

**Warum:** Bewegung beantwortet nur „was hat sich geändert?“. Für reizempfindliche Menschen ist jede zusätzliche Bewegung eine Unterbrechung.

---

## 8. Bilder

- **Art:** keine Fotos, keine Illustrationen. Icons: lucide-react, Strichstärke 1.75, Größe 20 (Listen) oder 24 (Navigation).
- **Leere Zustände:** Text plus eine Aktion, keine Illustration.
- **App-Icon:** `[asset needed]`: Entwurf passend zur Tide-Linie (Linie über Sand/Schiefer), vor Launch.
- **Alt-Text:** Icons ohne Text bekommen `aria-label`. Dekorative Icons `aria-hidden`.

**Warum:** Illustrationen in Planungs-Apps landen schnell bei „niedliche Figur feiert dich“, was Druck aufbaut. Text und Raum reichen.

---

## 9. Stimme

- **Tonfall:** ruhig, genau, ein wenig warm. Wie eine Freundin, die gut organisiert ist und nicht drängelt.
- **Verbotene Wörter (UI, Mails, Push):** overdue, late, failed, missed, lazy, streak, behind, crush, hustle, boost, supercharge, unlock, seamless, magic, productivity hack, babe, and every swear word.
- **Statt Schuld:** „came along from yesterday“ statt „overdue“, „not today“ statt „skipped“ (Status-Label), „rolled over 3×“ statt „postponed 3 times“.
- **Satzrhythmus:** meist kurz, ab und zu ein längerer Satz.
- **Überschriften:** sagen, was hier ist (`Today`, `Weekly reset`), keine Begrüßung („Welcome back!“).
- **Zeichensetzung:** keine Ausrufezeichen. Keine Punkte an Buttons, Labels, Überschriften. Gedankenstrich in UI-Texten vermeiden. Keine Emojis in UI-Texten (nur in Nutzerinhalten).
- **Fehler:** Problem + Ausweg in einem Satz („No connection. Your thought is saved here and will sync when you're back online.“).
- **Zahlen:** immer mit Bezug („5 of 7 days this week“), nie allein.

**Beispiele unserer Stimme (EN-Quelle):**
- Rollover: „3 tasks came along from yesterday. They're waiting in your inbox.“
- Sortierfrage: „What breaks if this waits until tomorrow?“, Antworten: „Something real, it's a must today“ · „Nothing much, pick a day“ · „It's a small errand“ · „I want to do it today“.
- Low-Energy-Ende: „Done. One more, or call it a day?“
- Trial-Ende: „Your trial has ended. Everything is still here, and you can export it any time. Subscribe to keep planning.“

---

## 10. Präzedenz

| ✅ Richtig, weil | ❌ Falsch, weil |
|---|---|
| `[noch kein Code]`: erster Today-Screen nach E2 hier eintragen | — |

*Wird gepflegt, sobald es Screens gibt. Pro Epic mindestens ein Eintrag bei der Prüfung.*

---

## 11. Bewusst nicht

- **Rote oder orange Markierung für Muss, Überfälliges, Verschobenes:** erzeugt Schuld (Leitprinzip 4).
- **Streaks, Punkte, Badges, Level, Konfetti:** Belohnungslogik kippt bei schlechten Tagen in Strafe.
- **Zahlen-Badges am App-Icon oder in der Navigation:** ein offener Zähler ist ein Dauer-Vorwurf.
- **Kanban-Board als Standard für Today:** Spalten verlangen Überblick, den die Zielgruppe morgens nicht hat; Today ist eine Liste in Blöcken.
- **Modals zum Bearbeiten von Aufgaben:** Sheets halten den Kontext sichtbar. Dialoge nur für destruktive Bestätigungen.
- **Karten-Raster mit Icon + Überschrift + Text:** Standard-Gerüst ohne Aussage.
- **Template-Optik (Navy, Sonnenkreis, Pagode, goldene Callouts):** rechtliche und inhaltliche Abgrenzung.
- **Drängelnde Trial-Hinweise (Countdown, Modal-Wände):** eine ruhige Zeile reicht.

---

## 12. Änderungen

- **Vorschlagen:** jeder Agent (als Frage im Bericht). **Entscheidet:** Dion.
- **Versionen:** Minor für Ergänzungen, Major für Änderungen, die bestehende Arbeit ungültig machen.
- **Bewusste Ausnahme:** einmal erlaubt, mit Grund im Log.
- **Nicht abgedeckt:** Erst das Papier ändern, dann bauen.

### Log

| Version | Datum | Änderung | Warum |
|---|---|---|---|
| 1.0 | 2026-11-21 | erste Fassung, Richtung „Ebbe“ | Start vor dem ersten UI-Paket |
| 1.0.1 | 2026-11-21 | CJK-Fallback-Schriften aus §3 in den Token-Block übernommen | Token-Block und §3 waren nicht synchron; der Checker hätte den Fallback als fremde Schrift gezählt (Bericht E1-P6) |
| 1.0.2 | 2026-11-27 | Produktname „ebbe“ (klein, auch am Satzanfang) statt Arbeitstitel „Ebb“ | Entscheidung Dion; passt zur Richtung aus 1.0, keine Token-Änderung |

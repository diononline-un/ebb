# Analyse: Kaizen-Notion-Template

Stand: 2026-11-21 · Quelle: öffentliche Notion-Seite `ruriohama.notion.site/Home-Page-…`
Gelesen: Home (Dump-, Planning- und Projects-Tab), Lektionen 1–8 komplett. Von Lektion 9–13 und „The Kaizen Method“ nur die Gliederung (Browser hat den Rest nicht gerendert). Ungelesen: FAQs, Habit-Tracker-Schema, Projekt-Formeln, Reflection-Sunday-Vorlage.

## 1. Was das ist

Das Template ist ein **kommerzielles Produkt**: „Kaizen Life System“ von Ruri Ohama, verkauft auf Gumroad (`ohamaruri.gumroad.com/l/kaizenadhdsystem`). Zielgruppe sind Menschen mit ADHS.

Kernidee in zwei Sätzen:
1. **Nicht priorisieren, sondern nach Konsequenz fragen:** „Was passiert, wenn das heute nicht erledigt wird?“
2. **Nach Energie planen, nicht nach Zeit:** Jeder Tag ist entweder ein *Low Day* oder ein *Better Day*, und je nach Tag gibt es einen anderen Ablauf.

## 2. Der Ablauf

```
Täglich
  Dump (Freitext, ein Gedanke pro Zeile)
    │  Zeile ist eine Aktion? → in „To sort“ (Task, Do Date = heute)
    ▼
  [Roll to Today]  nicht begonnene Tasks mit Do Date in der Vergangenheit → heute
    ▼
  Sortieren, pro Task die Frage: „Was passiert, wenn das bis morgen liegt?“
    ├─ echte Konsequenz heute  → EOD? anhaken (Karte wird rot, max. 1–3, nie >5)
    ├─ kann warten             → späteres Do Date (≠ Final Deadline)
    ├─ Kleinkram               → Admin (wird gebündelt erledigt)
    └─ heute dran              → Sprint 1–4 (ein Sprint = ein Arbeitsblock, danach Pause)
    ▼
  Today's Win wählen (genau 1 Task: „Was würde den Tag lohnenswert machen?“)
    ▼
  Sprints abarbeiten → Status Done / Skipped

Low Day:     Board ignorieren → 1 Task als Win → ersten 10-Minuten-Schritt aufschreiben → anfangen
             → fertig oder Notiz „wo ich aufgehört habe“
Wöchentlich: Admin-Session (alle Kleinkram-Tasks am Stück)
Sonntag:     Reflexion + „Tasks to decide“: Dauerschieber neu datieren, skippen oder löschen
Optional:    Habit-Tracker, Projekte
```

## 3. Rekonstruiertes Datenmodell

| Entität | Felder (aus Notion-Properties und Lektionen) |
|---|---|
| **Task** | Name, Status (Not started / In progress / Done / Skipped / …), Do Date, Final Deadline, EOD? (bool), Sprint (To sort, Sprint 1–4, Admin), Today's Win? (bool), Projekt, Parent-Task/Subtasks, Blocked by/Blocking, Urgency, Assignee, Created/Edited |
| **Projekt** | Name, Status, Start, Ende, Deadline Check (Formel), Completion % (aus Tasks) |
| **Dump** | Freitext-Seite + „Saved dumps“ (optional archiviert) |
| **Habit** | Habit-Tracker (Schema nicht gelesen) |
| **Reflexion** | wöchentliche Sonntags-Reflexion |

**Ansichten:** Today's Sprint (Board nach Sprint), Tomorrow's Sprints, Weekly Tasks (Kalender), Skipped, Finished, Today's Win, Past Wins, Admin-Board, Active Projects, Project Timeline, Unfinished/Finished Projects.

**Regeln, die das Template stillschweigend umsetzt:**
- Do Date (wann ich dran arbeite) ≠ Final Deadline (wann es fertig sein muss). Rollover verschiebt nur das Do Date.
- Past Wins = `todays_win && do_date < heute`. Ein Win zählt erst ab morgen als „past“.
- Erledigte/geskippte Admin-Tasks bleiben eine Woche sichtbar.
- Roll to Today ist ein **manueller** Button.
- Neue Tasks bekommen ein Template mit Subtask-Abschnitt; Drag & Drop aus dem Dump wendet es *nicht* an.
- Wiederkehrende Tasks (L13), Deadline-Warnung und „fehlende Tasks finden“ (L11) existieren, Details nicht gelesen.

## 4. Bewertung: gut oder Mist?

**Kurz: Die Methode ist gut (7/10), die Notion-Umsetzung ist schwach (4/10).** Was das Produkt wert macht, ist die Methode samt Tonfall, nicht der Notion-Unterbau.

**Was gut ist**
- Die Konsequenz-Frage ist für ADHS wirklich besser als Priorisieren. „Was ist wichtig?“ beantwortet ein ADHS-Kopf mit „alles“. „Was passiert, wenn nicht?“ hat eine ehrliche Antwort.
- Die Energie-Modi nehmen Druck raus. Ein Low Day mit einem einzigen Task und einem 10-Minuten-Einstieg bricht den Kreislauf aus Aufschieben und Schuldgefühl.
- Do Date und Deadline sind sauber getrennt. Das können viele Todo-Apps nicht.
- Der Sonntags-Zwang, über Dauerschieber zu entscheiden, verhindert den typischen Backlog-Friedhof.
- Alles besteht aus erprobten Bausteinen: GTD-Capture und Weekly Review, „Highlight“ aus *Make Time*, Timeboxing, Batching.

**Was schwach ist**
- „Kaizen“ ist nur ein Etikett. Kontinuierliche Verbesserung passiert bloß als Sonntags-Freitext, gemessen wird nichts (Win-Quote, wie oft ein Task geschoben wurde, Sprint-Erfüllung).
- Viel Reibung: Zeilen per Drag & Drop in Tabellen ziehen, Templates von Hand anwenden, Rollover per Knopfdruck, 13 Lektionen für ein „einfaches“ System. **Der Einstieg ist die größte Schwäche**, genau das, was du selbst erlebt hast.
- Sprint 1–4 sind starre Spalten ohne Dauer und ohne Timer.
- Keine Erinnerungen, mobil schlecht nutzbar (laut Guide: „phone-friendly layout coming soon“).
- Habits und Projekte hängen lose dran und sind nicht Teil des Tagesablaufs. Ziele gibt es gar nicht, also fehlt das „Warum“.

**Was eine eigene App besser kann:** Eine Dump-Zeile wird mit einem Tap zum Task. Der Rollover läuft automatisch. Ein geführtes Morgen-Ritual (Energie-Check → Konsequenz-Frage pro Task → Win → Sprints) ersetzt das Board-Gefummel. Der Low Day bekommt einen eigenen, leeren Screen. Und ein Onboarding legt Ziele und 1–2 Habits fest, bevor der erste Task existiert.

## 5. Markt: Gibt es das schon?

Nur über Suchergebnisse und READMEs geprüft, nicht im Code.

| Projekt | Art | Überschneidung | Was fehlt |
|---|---|---|---|
| [Super Productivity](https://super-productivity.com/blog/best-sunsama-alternatives-2026/) | OSS, local-first | Tagesplanung, Timeboxing, Pomodoro | kein geführtes Ritual, kein Energie-Modus, riesige Codebasis |
| [tictic](https://github.com/ehsannaeemirad-droid/tictic) | OSS-PWA, ADHS | „Frog“-Priorität, Habits, Fokus-Timer | nur ein Nutzer, offline, kein Sync, kein SaaS |
| [my-focus-log](https://github.com/antonyhipkins/my-focus-log) | OSS-Web-App, ADHS | Brain Dump, Fokus-Liste, Habits | kein Backend, kein Login |
| [DailyWave](https://github.com/kks0488/dailywave) | OSS, ADHS | „Chaos Dump“, ein nächster Schritt | kein Weekly Reset, kein Energie-Modus |
| [open-sunsama](https://github.com/kaijiabo/open-sunsama) | OSS, self-host | Kanban, Timeblocking | kein ADHS-Fokus |
| [will-be-done](https://github.com/will-be-done/will-be-done) | OSS, self-host | Wochen-Timeline, Docker + SQLite | keine Habits, kein Ritual |
| [adhd-productivity-app](https://github.com/zdub0is/adhd-productivity-app) | OSS, Portfolio-Projekt | Planung à la Sunsama, Journaling | Portfolio, nicht produktreif |
| Sunsama, Lunatask, Tiimo, Amazing Marvin | kommerziell | geführte Planung, ADHS | nicht self-hostbar, teurer |

**Fazit:** Den Bereich gibt es schon, er ist voll mit ADHS-Planern. Keiner kombiniert aber Konsequenz-Frage, Energie-Modi, Today's Win, Sprints, Sunday Reset und Habits mit Self-Hosting **und** einem günstigen gehosteten Abo. Witzlos ist das Projekt also nicht. Abheben kann es sich aber nur über das **geführte Ritual**, nicht über eine längere Feature-Liste.

Einen Fork rate ich nicht: tictic und my-focus-log sind bewusst ohne Backend gebaut, Super Productivity ist ein riesiges Angular-Projekt ohne Multi-Tenant-Unterbau. Besser neu bauen und Ideen übernehmen.

### Nachtrag 2026-11-22 (nach E3)

Erneut geprüft, als Ritual, Low-Modus und Timer fertig waren. Wieder nur über Suchergebnisse und Store-Texte, keine App ausprobiert. „Was fehlt“ heißt hier: im Store- oder Produkttext nicht erwähnt.

| Projekt | Art | Überschneidung | Was fehlt |
|---|---|---|---|
| [Dune Seven](https://apps.apple.com/app/id6755029930) | kommerziell, nur iOS, ~40 $/Jahr | Tagesstart mit Energie-Modus (Flow, Focus, Low, Rest) und einer Tagesabsicht, Habits | Konsequenz-Frage, Low-Tag mit genau einer Aufgabe, Self-Hosting |
| [Sunsama for ADHD](https://sunsama.com/for-adhd) | kommerziell, ~16–25 $/Monat | geführtes Tagesritual, Shutdown, Weekly Review, wirbt jetzt gezielt mit ADHS | Energie-Modus; teuer, kalenderzentriert |
| [Tiimo](https://tiimoapp.com/features) | kommerziell, iPhone-App des Jahres 2025 | KI-Co-Planer, energiebewusste Planung, Stimmungs-Check, Fokus-Timer | Morgen-Ritual mit Sortierfrage, Self-Hosting |
| [Structured](https://help.structured.app/en/articles/1747650) | kommerziell | Energie-Monitor: Energie-Budget pro Tag (experimentell) | Ritual; reiner Timeline-Planer |
| [Amazing Marvin](https://amazingmarvin.com/features/day-planning) | kommerziell | Energie-Tags, kurze Today-Liste, „Procrastination Wizard“ | eine Frage nach der anderen; viele Einstellungen statt weniger Entscheidungen |
| [DopaFlow](https://awesome.ecosyste.ms/projects/github.com%2Fkazandthecompiler%2Fdopaflow) | OSS, self-host | Docker, offline-first, Markdown-Tagesnotizen | ein Nutzer (SQLite), kein Ritual |

**Was sich am Fazit ändert:**
- Der Energie-Check am Morgen ist kein Alleinstellungsmerkmal mehr (Dune Seven, Tiimo, Structured).
- Die Abgrenzung zu Sunsama in PRD §4 („für Overwhelm gemacht“) trägt weniger, seit Sunsama mit ADHS wirbt. Es bleiben Preis, Self-Hosting und Energie-Modi.
- Bei niemandem gefunden: Sortieren über die Konsequenz-Frage, ein Low-Tag mit genau einer Aufgabe, schuldfreier Ton als Regel, geteilte Bereiche, AGPL-Self-Hosting zusammen mit einem günstigen EU-Abo.
- Die Technik (Konten, Mandantentrennung, Timer, Dump) ist Standard. Abheben kann sich das Projekt nur über die Methode als Ganzes, also Ritual, Konsequenz-Frage und Ton, nicht über einzelne Funktionen.

**Empfehlung:** Vor E4–E10 eine kleine Beta mit 5–10 Leuten aus der Zielgruppe. Die eine Frage dabei: Nutzen sie das Ritual in der zweiten Woche noch? Ziele, Habits und Projekte decken TickTick, Tiimo und Marvin schon gut ab; dort lohnt sich Aufwand erst, wenn das Ritual trägt.

## 6. Rechtliches: muss vor dem Launch geklärt sein

Ideen und Methoden sind nicht urheberrechtlich geschützt. **Geschützt sind Texte, Lektionen, Beispielinhalte, Screenshots, das Design und der Produktname.** Eine App, die das Kaizen Life System eins zu eins nachbaut und ähnlich heißt, verkauft Ruri Ohamas Produkt unter eigenem Namen. Der Name „Kaizen“ würde außerdem mit ihrem Produkt und mehreren bestehenden Apps kollidieren.
→ Eigener Name, alle Texte selbst schreiben, keine Lektionen übernehmen. Das ist keine Rechtsberatung: Vor einem kommerziellen Launch kurz anwaltlich prüfen lassen.

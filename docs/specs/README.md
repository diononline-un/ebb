# Specs und Pakete

Je Epic eine Datei. Jede Datei zerlegt das Epic in **Pakete**: kleine, einzeln prüfbare Aufträge mit einem Commit pro Paket.
Jedes Paket wird ein GitHub Issue (Label `paket`, `epic:E<n>`, `exec:kern` oder `exec:deepseek`), jedes Epic ein Issue mit den Paketen als Sub-Issues. Die Dateien hier sind die Quelle, aus der die Issues erzeugt werden.

- **Ausführung: Kern** baut Claude (Datenmodell, RLS, Auth, Billing, Sicherheit, heikle Kernlogik).
- **Ausführung: DeepSeek** läuft im dsh-Harness und wird danach einzeln von Claude geprüft (nicht erst nach einem ganzen Sprint).
- Startprompt-Kopf und Prüfablauf: `AGENTS.md`.

| Datei | Epic | Hängt ab von | Detailgrad |
|---|---|---|---|
| [E01-fundament.md](E01-fundament.md) | Fundament | — | startbereit |
| [E02-kern.md](E02-kern.md) | Kern-Ablauf | E1 | startbereit |
| [E03-energie.md](E03-energie.md) | Ritual, Low-Energy, Timer | E2 | vor Start nachschärfen |
| [E04-ziele-habits-onboarding.md](E04-ziele-habits-onboarding.md) | Ziele, Habits, Onboarding | E2, E3 | vor Start nachschärfen |
| [E05-projekte.md](E05-projekte.md) | Projekte, Unteraufgaben, Wiederkehrendes, Erledigungen | E2 | vor Start nachschärfen |
| [E06-weekly-reset.md](E06-weekly-reset.md) | Weekly Reset | E4, E5 | vor Start nachschärfen |
| [E07-bereiche.md](E07-bereiche.md) | Geteilte Bereiche | E2 | vor Start nachschärfen |
| [E08-billing.md](E08-billing.md) | Trial, Paddle, Sitze, Self-Host | E1, E7 | vor Start nachschärfen |
| [E09-betrieb.md](E09-betrieb.md) | Push, Export, Löschung, Deploy, Backups | E1, E3, E4 | vor Start nachschärfen |
| [E10-launch.md](E10-launch.md) | Übersetzungen, Rechtstexte, Landingpage, PWA-Feinschliff | alle | vor Start nachschärfen |

„Vor Start nachschärfen“ heißt: Bevor eine Welle startet, prüft Claude die Pakete gegen den dann echten Code (Dateipfade, Funktionsnamen, Ist-Stand) und ergänzt Signaturen. Erst dann bekommt das Issue das Label `ready`.

## Aufbau jedes Pakets

- `### E<n>-P<m> · Titel`
- **Ausführung** (Kern | DeepSeek) · **hängt ab von** · **parallel zu**
- **Dateien** (abschließende Liste) · **Abhängigkeiten** (npm, nur wenn neu)
- **Auftrag**: konkrete Schritte, Signaturen, Regeln
- **Akzeptanz**: prüfbare Kriterien und Tests (Datei, Fälle)
- **Nicht tun**: naheliegende Fehler und verbotene Abkürzungen

## Dateien, die mehrere Pakete anfassen

Nie zwei Pakete gleichzeitig:

| Datei(en) | Wer |
|---|---|
| `src/server/app.ts` (Routen registrieren) | jedes API-Paket hängt genau eine Zeile an; Wellen so geschnitten, dass sich API-Pakete hier nicht überlappen, sonst löst die Prüfung den Konflikt |
| `tests/isolation.routes.ts` | jedes API-Paket hängt Einträge an (Konflikte trivial, löst die Prüfung) |
| `package.json` / `package-lock.json` | nur Pakete mit neuen Abhängigkeiten. Die Prüfung mergt nacheinander |
| `locales/en/common.json`, `src/web/ui/*` | nur E1-P6 und die Prüfung |
| `migrations/` | jedes Epic nur in seinem Block (`docs/architektur.md`) |

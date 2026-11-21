# Architektur

Stand: 2026-11-21. Produkt: [02-prd.md](02-prd.md). Arbeitsregeln: [../AGENTS.md](../AGENTS.md).
Codename im Code: `ebb` (Paketname, DB-Name, Image). Der Anzeigename kommt aus `locales/*.json` (`app.name`).

## Stack

| Schicht | Wahl | Warum |
|---|---|---|
| Laufzeit | Node 24, TypeScript strict, Server **ohne Build** (Type-Stripping: `node src/server/index.ts`) | wie HERO-Booking; keine Enums, keine Parameter-Properties, Importe mit `.ts`-Endung |
| API | Hono + `@hono/node-server`, Validierung mit zod (`@hono/zod-validator`) | klein, schnell, testbar über `app.request()` ohne Netzwerk |
| DB | PostgreSQL 17, Treiber `postgres` (porsager), **reine SQL-Migrationen**, RLS mit `FORCE` | gleiches Muster wie HERO-Booking, das der Harness kennt; Policies stehen ausdrücklich im SQL |
| Auth | Better Auth: E-Mail + Passwort, Passkey-Plugin, Sessions in Postgres. Eigener `pg`-Pool nur für die Auth-Tabellen | Passkeys und Passwort-Reset fertig; Auth-Tabellen haben kein RLS und gehören nur Better Auth |
| Jobs | graphile-worker (Cron + Queue in Postgres) | wie HERO-Booking; sicher bei mehreren Instanzen |
| Datum | `date-fns` + `@date-fns/tz` | Zeitzonen pro Nutzer |
| Web | React 19 + Vite, TanStack Router (dateibasiert), TanStack Query, Tailwind CSS 4, shadcn/ui (Radix), lucide-react, dnd-kit | verbreitet, also gut bekannt für LLMs; Radix bringt die Barrierefreiheit mit |
| PWA | vite-plugin-pwa (Workbox, `injectManifest`), idb-keyval für die Offline-Warteschlange, Web Push mit `web-push` | |
| i18n | i18next + react-i18next, JSON pro Sprache | |
| Tests | Vitest (Unit + Integration gegen echtes Postgres), Playwright (E2E) | |
| Betrieb | Docker (ein Image), Docker Compose, Caddy (TLS), Contabo-VPS | |

**Abweichung vom Grill-Ergebnis:** Statt Drizzle verwenden wir `postgres` mit SQL-Migrationen. Grund: identisches, erprobtes Muster aus HERO-Booking, RLS ohne ORM-Umwege und nur eine Wahrheitsquelle fürs Schema.

## Repo-Aufbau (ein Paket, kein Monorepo)

```
src/
  shared/            reine Logik ohne IO, von Web und Server genutzt
    schemas.ts       zod-Schemas der API (Ein- und Ausgabe)
    day.ts           localDate(now, tz, dayStartMinute), Wochenbeginn
    recurrence.ts    occursOn(rule, startsOn, date)
    entitlement.ts   hasAccess(facts)
    triage.ts        Antworten der Konsequenz-Frage → Feldänderungen
  server/
    index.ts         Start: Migrationsstand prüfen, Worker starten, HTTP
    app.ts           createApp(deps) → Hono-App (Tests nutzen sie direkt)
    env.ts           ENV per zod parsen; einzige Stelle, die process.env liest
    db.ts            sql-Pools, withUser(), withSystem()
    auth.ts          Better-Auth-Instanz
    middleware/      session.ts, day-start.ts, entitlement.ts
    routes/<bereich>.ts   dünn: validieren, domain aufrufen, Fehler übersetzen
    domain/<bereich>/*.ts Fachlogik + DB-Zugriff
    jobs/            worker.ts, tasks/<name>.ts, crontab
    billing/         paddle.ts (API), webhook.ts, seats.ts
    cli.ts           reset-password, create-admin
  web/
    main.tsx, router.tsx, routes/…    Seiten (TanStack Router)
    features/<bereich>/               Komponenten + Hooks je Bereich
    ui/                               Design-System-Bausteine (nur Tokens aus DESIGN.md)
    lib/api.ts, lib/i18n.ts, lib/offline-queue.ts, lib/push.ts
    sw.ts                             Service Worker (Push, Cache, Sync)
locales/<lang>/<bereich>.json   (en zuerst; common.json, today.json, dump.json, …)
migrations/NNNN_name.sql
scripts/migrate.ts, test-setup.ts, seed-dev.ts, translate.ts
tests/            Vitest (shared + server)      e2e/   Playwright
docker/           Dockerfile, Caddyfile         docker-compose.yml (dev), docker-compose.selfhost.yml, docker-compose.prod.yml
```

## Glossar

Produktbegriff (EN-UI) ↔ Code ↔ DB-Wert. Diese Namen sind verbindlich und werden nicht übersetzt oder variiert.

| Begriff (UI, EN) | Deutsch (Doku) | Code | DB |
|---|---|---|---|
| Brain Dump | Brain Dump | `dumpLine` | Tabelle `dump_line` |
| Inbox | Inbox (unsortiert) | `slot: 'inbox'` | `task.slot = 'inbox'` |
| Block 1–4 | Block | `slot: 'block1'…'block4'` | `task.slot` |
| Errands | Erledigungen | `slot: 'errands'` | `task.slot = 'errands'` |
| Anchor | Anker (die eine Sache des Tages) | `anchor` | `task.anchor` |
| Must | Muss heute | `must` | `task.must` |
| Do date | Do Date (wann ich dran arbeite) | `doDate` | `task.do_date` |
| Deadline | Deadline (wann es fertig sein muss) | `deadline` | `task.deadline` |
| What breaks if this waits? | Konsequenz-Frage | `triage` | — |
| Energy check | Energie-Check | `energy: 'low' \| 'good'` | `day_entry.energy` |
| Low-energy mode | Low-Energy-Modus | `LowMode` | — |
| Next step | erster 10-Minuten-Schritt / wo ich aufgehört habe | `nextStep` | `task.next_step` |
| Rolled over | verschoben | `pushCount` | `task.push_count` |
| Stuck tasks | Dauerschieber | `stuck` | `push_count >= 3 OR created_at < today-14` |
| Weekly reset | Weekly Reset | `weeklyReset` | Tabelle `weekly_reset` |
| Focus timer | Fokus-Timer | `focusSession` | Tabelle `focus_session` |
| Goal / Habit / Project | Ziel / Habit / Projekt | `goal`, `habit`, `project` | gleichnamig |
| Space | Bereich (persönlich/geteilt) | `space`, `kind: 'personal' \| 'shared'` | `space`, `space_member` |
| Day start | Tagesbeginn | `dayStartMinute` | `user_settings.day_start_minute` (Standard 240 = 04:00) |

Status einer Aufgabe: `todo` · `doing` · `waiting` · `done` · `skipped`.

## Datenmodell

Alle IDs der App-Tabellen sind `uuid` (`gen_random_uuid()`), Nutzer-IDs sind `text` (Better Auth). Zeitpunkte als `timestamptz`, Kalendertage als `date` in der Ortszeit des Nutzers.

**Bereiche**
- `space (id, name, kind, owner_id, created_at)`. Partieller Unique-Index: genau ein `personal` pro `owner_id`.
- `space_member (space_id, user_id, role 'owner'|'member', joined_at)`, PK `(space_id, user_id)`.
- `space_invite (id, space_id, token_hash, email null, created_by, expires_at, used_at, used_by)`.

**Planung**
- `task (id, space_id, created_by, assignee_id null, title, notes, next_step, status, do_date null, deadline null, must bool, slot, position int, anchor bool, project_id null, parent_id null, recurrence_id null, push_count int, completed_at null, created_at, updated_at)`
  - Im persönlichen Bereich ist `assignee_id` immer der Owner (NOT NULL per Check über einen Trigger, siehe E2).
  - Unique: höchstens ein Anker pro `(assignee_id, do_date)` (partieller Index `WHERE anchor`).
  - `parent_id` nur eine Ebene tief (Domain-Prüfung + Test).
- `recurrence (id, space_id, created_by, assignee_id, title, notes, project_id null, rule jsonb, starts_on, last_generated_on null, active)`
  - `rule`: `{ freq: 'daily'|'weekdays'|'weekly'|'every_n_days'|'monthly', interval?: int, weekdays?: int[] (0=So), monthDay?: int }`
- `dump_line (id, user_id, client_id uuid unique, text, created_at, task_id null, archived_at null)`
- `project (id, space_id, goal_id null, name, status, start_date null, deadline null, created_by, created_at)`

**Persönlich**
- `user_settings (user_id pk, locale, timezone, day_start_minute, last_day_started date, morning_reminder time null, weekly_reset_dow int, weekly_reset_time time, errands_dow int null, quiet_start time, quiet_end time, must_warn_at int, timer_default_min int, notify jsonb, onboarding_step int, onboarding_done_at null)`
- `user_access (user_id pk, trial_ends_at null, deletion_warned_at null, last_seen_at)`. Darf nur das System schreiben (RLS: Nutzer nur `SELECT` der eigenen Zeile).
- `day_entry (user_id, date, energy null, rolled_count int, ritual_done_at null)`, PK `(user_id, date)`
- `goal (id, user_id, title, why, status, position, created_at)`
- `habit (id, user_id, goal_id null, name, cadence 'daily'|'weekly_count', weekly_target null, weekdays int[] null, reminder_time null, position, archived_at null, created_at)`
- `habit_log (habit_id, user_id, date)`, PK `(habit_id, date)`
- `weekly_reset (user_id, week_start date, went_well, went_badly, change, step int, completed_at null)`, PK `(user_id, week_start)`
- `focus_session (id, user_id, task_id null, slot null, started_at, planned_minutes, ended_at null)`
- `push_subscription (id, user_id, endpoint unique, p256dh, auth, created_at, last_success_at null)`
- `product_event (id bigserial, user_id, name, props jsonb, created_at)`

**Billing und System** (nur `withSystem`)
- `subscription (id, payer_user_id, paddle_subscription_id unique, paddle_customer_id, status, base_price_id, extra_seats int, current_period_end, updated_at)`
- `subscription_seat (subscription_id, user_id unique)`
- `paddle_event (event_id pk, type, payload jsonb, received_at, processed_at null)`
- `instance_config (key pk, value)`: VAPID-Schlüssel, Instanz-Admin

## Mandantentrennung (heilig)

- Vier DB-Rollen (angelegt vom Postgres-Init-Skript, Passwörter aus ENV):
  - `ebb_owner` besitzt die Tabellen und führt Migrationen aus, nie im Request-Pfad.
  - `ebb_app` ist die Request-Rolle, ohne `BYPASSRLS` und ohne Rechte auf die Auth-Tabellen.
  - `ebb_system` hat `BYPASSRLS` und ist nur erlaubt in `src/server/jobs/`, `src/server/billing/webhook.ts`, Auth-Hooks und `cli.ts`.
  - `ebb_auth` hat nur Rechte auf die Better-Auth-Tabellen (Passwort-Hashes und Sessions sind für `ebb_app` unlesbar).
- Verbindungen baut `env.ts` aus `PGHOST`, `PGPORT`, `EBB_DB_NAME` und je einem Passwort pro Rolle. Tests setzen nur `EBB_DB_NAME=ebb_test_<paket>`.
- `withUser(userId, tx => …)`: Transaktion als `ebb_app` mit `set_config('app.user_id', userId, true)`. **Jede** Abfrage im Request-Pfad läuft darin.
- **Zeilen kommen in camelCase zurück** (`transform: postgres.camel` in `db.ts`). SQL schreibt man weiter in snake_case: `select do_date from task` liefert `row.doDate`.
- **`date`-Spalten kommen als String `'YYYY-MM-DD'`** zurück (eigener Parser in `db.ts`), Zeitstempel als `Date`. Kalendertage nie in `Date` umwandeln; rechnen mit `src/shared/day.ts`.
- Invarianten von `task` hält der Trigger `app.task_before_write` (Migration `0020`): Persönliche Aufgaben gehören immer dem Owner, geteilte nur Mitgliedern; `created_by`/`created_at` sind unveränderlich, `updated_at` setzt er selbst. Neue Spalten in E5 brauchen dort nichts.
- Die Owner-Verbindung gibt es nur in `scripts/` und `tests/harness.ts`, nie in `src/`. Testdatenbanken müssen mit `ebb_test` beginnen; `db:test-setup` und `resetDb()` verweigern alles andere.
- Testdateien laufen nacheinander (`fileParallelism: false`), weil sie sich eine Datenbank teilen.
- `withSystem(tx => …)`: Transaktion als `ebb_system`. Jeder Aufruf bekommt einen Kommentar, warum er plattformweit sein muss.
- Hilfsfunktionen (SECURITY DEFINER, Schema `app`): `app.uid()` liefert `current_setting('app.user_id', true)`. `app.is_member(space_id)`.
- Policies:
  - Persönliche Tabellen: `user_id = app.uid()`.
  - `task`, `project`, `recurrence`: `app.is_member(space_id)`. Löschen von `task` nur durch `created_by = app.uid()` oder den Owner des Bereichs.
  - `space`: Lesen bei Mitgliedschaft. Ändern und Löschen nur durch den Owner.
  - Beitreten nur über `app.accept_invite(token)` (SECURITY DEFINER).
- Jede neue Tabelle bekommt `ENABLE` + `FORCE ROW LEVEL SECURITY` in derselben Migration.
- **Policies nennen immer ihre Rolle** (`CREATE POLICY … TO ebb_app`). FORCE bindet auch `ebb_owner`, und damit die SECURITY-DEFINER-Funktionen in `app`. Braucht eine solche Funktion eine Tabelle, bekommt diese eine eigene, kommentierte Policy `TO ebb_owner` (Beispiel: `member_read_by_definer` auf `space_member` in `0003`). Ohne sie gäbe es Rekursion (`is_member` → Policy → `is_member`) oder leere Ergebnisse.
- Was `ebb_app` nie darf, wird zusätzlich per `REVOKE` entzogen. So gibt es einen Fehler statt stiller 0 Zeilen (z. B. `user_access` ändern, Mitgliedschaften anlegen). Spalten, die geändert werden dürfen, stehen als Spalten-`GRANT` (z. B. `space.name`).
- Gemeinsame Bereiche entstehen nur über eine SECURITY-DEFINER-Funktion (E7-P1), weil die Owner-Mitgliedschaft im selben Schritt angelegt werden muss.
- Tests prüfen Daten über `withSystem`, nicht über die Owner-Verbindung (die sieht auf geforceten Tabellen nichts).
- Pflichttest pro Endpunkt (`tests/isolation.test.ts`): Nutzer B bekommt für jede ID von Nutzer A `404`, nie `403` (keine Existenz verraten) und nie Daten.

## Tagesbeginn und Rollover

- `localDate(now, timezone, dayStartMinute)`: Vor 04:00 gilt noch der Vortag.
- Die Middleware `day-start.ts` läuft vor jedem API-Request (außer Auth/Billing/Health). Ist `last_day_started < heute`, führt sie atomar aus (`UPDATE user_settings SET last_day_started = $heute WHERE user_id = $1 AND last_day_started < $heute RETURNING` als Sperre):
  1. Rollover der Aufgaben, die mir zugewiesen sind (Regeln im PRD, F5), als **ein** `UPDATE` in `src/server/domain/day/start-day.ts`. Die Regel steht nur dort. Die Anzahl landet in `day_entry.rolled_count` für den Hinweis „3 tasks came along“.
  2. Instanzen wiederkehrender Aufgaben für heute erzeugen (F11).
  Beides ist idempotent; parallele Requests erzeugen nichts doppelt.
- Kein Cron fürs Rollover: Wer die App nicht öffnet, braucht keins.

## Jobs (graphile-worker)

| Job | Takt | Zweck |
|---|---|---|
| `reminders` | jede Minute | Morgen-Ritual, Habits, Weekly Reset, Erledigungs-Tag: fällige Nutzer per SQL in Ortszeit finden, `*_sent_on` gegen Dopplung, Ruhezeiten beachten, Push senden |
| `send_push` | Queue | eine Nachricht an alle Subscriptions eines Nutzers; 404/410 → Subscription löschen |
| `trial_mails` | stündlich | „Trial endet in 2 Tagen“, „Trial beendet“ |
| `retention` | täglich 03:00 UTC | Lösch-Warnungen (30/7 Tage), Löschung nach 12 Monaten, gelöschte Konten nach 30 Tagen hart entfernen |
| `paddle_event` | Queue | gespeicherte Webhook-Events verarbeiten |

## Billing (Paddle)

- Checkout mit Paddle.js (Overlay) auf `/billing`, `customData: { userId }`. Items: Basis-Preis (`PRICE_BASE_ACTIVE`) und Zusatzmitglied (Menge = Sitze).
- Webhook `POST /api/billing/webhook`: Signatur (`Paddle-Signature`, HMAC-SHA256) prüfen → in `paddle_event` speichern (idempotent über `event_id`) → 200. Verarbeitung im Job.
- Sitze ändern: `PATCH /subscriptions/{id}` über die Paddle-API mit neuer Menge, `proration_billing_mode: prorated_immediately`. Die Wahrheit kommt erst mit dem Webhook.
- `hasAccess` (rein, `src/shared/entitlement.ts`): `selfhost || trialEndsAt > now || ownSub in (active, trialing, past_due) || seatSub in (active, trialing, past_due)`. `past_due` bekommt die Kulanzzeit von Paddle (Dunning).
- Die Middleware `entitlement.ts` sperrt schreibende Methoden ohne Zugriff mit `402 { code: 'subscription_required' }`. Ausgenommen: Auth, Billing, Export, Konto löschen, Einstellungen zu Sprache/Zeitzone.

## PWA und Offline

- Der Service Worker cacht die App-Shell (precache) und liefert offline die letzte Heute-Ansicht aus dem TanStack-Query-Cache (persistiert in IndexedDB).
- Schreiben geht nur online. **Ausnahme Dump:** `POST /api/dump` mit `client_id` (uuid vom Client). Offline landet der Request in `offline-queue.ts` (IndexedDB) und wird bei `online` oder Background Sync der Reihe nach gesendet. Der Server ist über `client_id` idempotent.
- Push: `sw.ts` verarbeitet `push` und `notificationclick` (öffnet die Ziel-URL aus der Payload).

## i18n

- Eine Datei pro Bereich und Sprache: `locales/<lang>/<bereich>.json` (i18next-Namespaces, z. B. `locales/en/today.json`). So schreiben parallele Pakete nie in dieselbe Datei. Gemeinsame Texte (Buttons, Fehler) in `locales/<lang>/common.json`, die nur E1 und die Prüfung ändern.
- Schlüssel hierarchisch (`anchor.empty`). Quellsprache `en`. Keine zusammengesetzten Sätze im Code, Plural über i18next.
- `scripts/translate.ts` übersetzt fehlende oder geänderte Schlüssel (Hash der EN-Quelle in `locales/.meta.json`) per LLM-API. Der Key kommt aus ENV, nie im Repo.
- Pseudo-Locale `en-XA` für Layout-Tests (Text +40 %, Akzente).

## Deployment

- Ein Image: Stage 1 baut das Web (`vite build` → `dist/web`), Stage 2 Runtime Node 24 mit `src/server` + `dist/web` + `migrations`. Start: `node src/server/index.ts` (Migrationen per `npm run db:migrate` vor dem Start im Entrypoint).
- `docker-compose.prod.yml`: app, postgres, caddy, backup (pg_dump täglich → verschlüsselt mit age → offsite). Ressourcenlimits pro Service.
- `docker-compose.selfhost.yml`: app + postgres, `APP_MODE=selfhost`.
- CI (GitHub Actions): check → test (Postgres-Service) → build → Image nach GHCR bei Tag `v*`.
- Dev-Ports aus Dions Port-Ring (2000–2999, am 2026-11-21 frei): `2040` App/API, `2041` Postgres, `2042` Vite.

## Migrationsblöcke

Damit parallele Pakete sich keine Nummern wegnehmen:

| Epic | Block | Epic | Block |
|---|---|---|---|
| E1 | 0001–0019 | E6 | 0060–0069 |
| E2 | 0020–0029 | E7 | 0070–0079 |
| E3 | 0030–0039 | E8 | 0080–0089 |
| E4 | 0040–0049 | E9 | 0090–0099 |
| E5 | 0050–0059 | E10 | 0100–0109 |

## Entscheidungen (ADR-kurz)

- **A1** `postgres` + SQL-Migrationen statt Drizzle (siehe oben).
- **A2** Eigene Tabellen für Bereiche statt des Better-Auth-Organization-Plugins: Einladungen per Link ohne E-Mail, RLS auf eigenen Tabellen, weniger Magie.
- **A3** Rollover lazy pro Nutzer beim ersten Request des Tages statt per Cron.
- **A4** Ein Repo-Paket statt Monorepo: Web und Server teilen `src/shared` direkt.
- **A5** Zugriffsprüfung als reine Funktion plus Middleware. Billing-Details bleiben in `src/server/billing/`.
- **A6** Planungsfelder einer Aufgabe gehören der zuständigen Person. Nicht zugewiesene Aufgaben in geteilten Bereichen stehen in keinem Tagesplan.

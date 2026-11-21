# E1 · Fundament

Migrationsblock 0001–0019. Paket-IDs `E1-Pn`. Startprompt-Kopf: `AGENTS.md`.

## Ziel

Ein lauffähiges, leeres Produkt mit allem, worauf jedes spätere Paket baut: Repo und Skripte, Postgres mit vier Rollen und RLS-Hilfen, Anmeldung per Passwort und Passkey, persönlicher Bereich je Nutzer, ein Isolationstest, der neue Endpunkte automatisch erfasst, die Web-Shell mit Design-Tokens, i18n, PWA, Docker-Image und CI.

## Ist-Stand

Kein Code. Es gibt `docs/`, `DESIGN.md`, `AGENTS.md`, `CLAUDE.md`, `PROJECT_STATUS.md`, `scripts/check-design.py`.

## Entscheidungen

### Getroffen
- Stack, Rollen und Repo-Aufbau wie in `docs/architektur.md` (A1–A6).
- Dev-Ports aus dem Port-Ring 2000–2999: App/API `2040`, Postgres `2041`, Vite `2042` (am 2026-11-21 in keinem Compose-, Vite- oder Env-Beispiel im Workspace belegt; im Dashboard eintragen).
- Server ohne Build über Type-Stripping. TS-Option `erasableSyntaxOnly` erzwingt, dass nur entfernbare Syntax benutzt wird.
- Mails im Dev-Modus: abgefangen und über `GET /api/dev/mails` lesbar.

### Offen
| # | Frage | Wer | Vorschlag | Betrifft |
|---|---|---|---|---|
| D1 | Ports 2040–2042 im Dashboard reservieren | Dion | so übernehmen | E1-P1, P2 |
| D2 | GitHub-Organisation/Repo-Name für GHCR | Dion | `diononline-un/ebb`, privat | E1-P8 |

## Wellen

| Welle | Pakete |
|---|---|
| A | P1 |
| B | P2 (Kern) ‖ P6 |
| C | P3 (Kern) ‖ P8 ‖ P9 |
| D | P4 (Kern) ‖ P7 |
| E | P5 |

---

### E1-P1 · Repo-Gerüst

- **Ausführung:** DeepSeek · **hängt ab von:** — · **parallel zu:** —
- **Dateien:** anlegen `package.json`, `tsconfig.base.json`, `tsconfig.server.json`, `tsconfig.web.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `.env.example`, `LICENSE`, `README.md`, `src/server/app.ts`, `src/server/index.ts`, `src/web/main.tsx`, `src/shared/.gitkeep`, `tests/health.test.ts`.
- **Abhängigkeiten:** `hono`, `@hono/node-server`, `zod`, `react`, `react-dom`; dev: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `@types/node`, `@types/react`, `@types/react-dom`.
- **Auftrag:**
  1. `package.json`: `"name": "ebb"`, `"private": true`, `"type": "module"`, `"engines": { "node": ">=24" }`, `"license": "AGPL-3.0-only"`. Scripts:
     `"dev:api": "node --watch --env-file-if-exists=.env src/server/index.ts"`, `"dev:web": "vite"`, `"dev": "npm run dev:api & npm run dev:web"`, `"build": "vite build"`, `"start": "node src/server/index.ts"`, `"check": "tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.web.json --noEmit"`, `"test": "vitest run"`.
  2. `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `skipLibCheck`, `target: ES2023`.
     `tsconfig.server.json`: extends base, `module`/`moduleResolution: nodenext`, `types: ["node"]`, include `src/server`, `src/shared`, `scripts`, `tests`.
     `tsconfig.web.json`: extends base, `module: esnext`, `moduleResolution: bundler`, `jsx: react-jsx`, `lib: ["ES2023","DOM","DOM.Iterable"]`, include `src/web`, `src/shared`.
  3. `src/server/app.ts`: `export function createApp(): Hono` mit `GET /api/health` → `200 { ok: true }`. Kein Start-Code in dieser Datei.
  4. `src/server/index.ts`: liest `PORT` (Standard 2040), startet `createApp()` mit `serve()`. Wenn `NODE_ENV=production`: zusätzlich `serveStatic({ root: './dist/web' })` und SPA-Fallback auf `dist/web/index.html` für alle Nicht-`/api`-Pfade.
  5. `vite.config.ts`: React-Plugin, `build.outDir: 'dist/web'`, `server.port: 2042`, `server.proxy: { '/api': 'http://127.0.0.1:2040' }`.
  6. `index.html` mit `<div id="root"></div>` und `<script type="module" src="/src/web/main.tsx">`. `main.tsx` rendert vorerst `<></>` (die Shell kommt in E1-P6).
  7. `LICENSE`: der offizielle AGPL-3.0-Text, heruntergeladen mit `curl -sL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE` (nicht abtippen).
  8. `README.md`: drei Abschnitte (Was ist das, Entwickeln: `npm ci && npm run dev`, Lizenz). Höchstens 30 Zeilen.
  9. `.gitignore`: `node_modules`, `dist`, `.env`, `*.local`, `playwright-report`, `test-results`.
  10. `tests/health.test.ts`: `createApp().request('/api/health')` liefert 200 und `{ ok: true }`.
- **Akzeptanz:** `npm ci`, `npm run check` (0 Fehler), `npx vitest run tests/health.test.ts` grün. `npm run build` erzeugt `dist/web/index.html`. `node src/server/index.ts` beantwortet `curl localhost:2040/api/health`.
- **Nicht tun:** kein Monorepo/Workspaces, keine ESLint-/Prettier-Konfiguration, kein Express/Next, keine `enum`, kein `ts-node`/`tsx`.

### E1-P2 · Datenbank, Rollen, Migrationen, `withUser`

- **Ausführung:** Kern · **hängt ab von:** P1 · **parallel zu:** P6
- **Dateien:** anlegen `docker-compose.yml`, `docker/postgres/init/01-roles.sh`, `migrations/0001_app_schema.sql`, `scripts/migrate.ts`, `scripts/test-setup.ts`, `src/server/env.ts`, `src/server/db.ts`, `tests/harness.ts`, `tests/db.test.ts`, `vitest.config.ts` (globalSetup); ändern `package.json` (Scripts `db:migrate`, `db:test-setup`), `.env.example`.
- **Abhängigkeiten:** `postgres`.
- **Auftrag:**
  1. `docker-compose.yml`: Service `postgres` (Image `postgres:17`), Port `2041:5432`, Volume, ENV `POSTGRES_PASSWORD`, `EBB_OWNER_PASSWORD`, `EBB_APP_PASSWORD`, `EBB_SYSTEM_PASSWORD`, `EBB_AUTH_PASSWORD` (Dev-Standard `ebb_dev`). Das Init-Skript legt die Rollen `ebb_owner` (LOGIN), `ebb_app` (LOGIN, NOBYPASSRLS), `ebb_system` (LOGIN, BYPASSRLS), `ebb_auth` (LOGIN) an und die Datenbank `ebb` mit Owner `ebb_owner`.
  2. `migrations/0001_app_schema.sql`: Schema `app`; `app.uid()` (`nullif(current_setting('app.user_id', true), '')`); `GRANT USAGE ON SCHEMA app, public TO ebb_app, ebb_system`; `ALTER DEFAULT PRIVILEGES FOR ROLE ebb_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ebb_app, ebb_system` und `USAGE, SELECT ON SEQUENCES`; `REVOKE CREATE ON SCHEMA public FROM PUBLIC`.
  3. `scripts/migrate.ts`: verbindet als `ebb_owner`, legt `schema_migrations(name text primary key, applied_at timestamptz default now())` an, führt alle `migrations/*.sql` nach Namen sortiert aus, die noch fehlen, jede Datei in einer eigenen Transaktion. Bricht bei Fehler mit Dateiname ab.
  4. `scripts/test-setup.ts`: verbindet als Superuser (`POSTGRES_SUPERUSER_URL`, Standard `postgres://postgres:ebb_dev@127.0.0.1:2041/postgres`), legt fehlende Rollen an (gleiche Logik wie das Init-Skript), löscht die Datenbank `EBB_DB_NAME` und legt sie neu an (Owner `ebb_owner`), führt dann die Migrationen aus.
  5. `src/server/env.ts`: zod-Schema für `APP_MODE` (`development|production|selfhost`), `APP_URL`, `PORT`, `PGHOST`, `PGPORT`, `EBB_DB_NAME`, die vier Rollenpasswörter. Exportiert `env` und `dbUrl(role)`. Einzige Stelle, die `process.env` liest.
  6. `src/server/db.ts`: `appSql`, `systemSql`, `ownerSql` (nur für Skripte/Tests). `withUser<T>(userId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T>` setzt in der Transaktion `select set_config('app.user_id', ${userId}, true)`. `withSystem<T>(fn)` ohne Kontext. Pools schließen mit `closeDb()`.
  7. `tests/harness.ts`: `resetDb()` (TRUNCATE aller Tabellen in `public` außer `schema_migrations`, `RESTART IDENTITY CASCADE`, als Owner). In E1-P4 kommen `createUser` und `as()` dazu.
  8. `tests/db.test.ts`: `withUser('u1', tx => tx\`select app.uid() as id\`)` liefert `u1`. Außerhalb von `withUser` liefert `app.uid()` null. `ebb_app` hat `rolbypassrls = false`, `ebb_system` hat `true`. `set_config` gilt nur innerhalb der Transaktion (zweiter Aufruf ohne Kontext → null).
- **Akzeptanz:** `docker compose up -d postgres && npm run db:test-setup && npx vitest run tests/db.test.ts` grün. Zweimal `npm run db:migrate` ist idempotent.
- **Nicht tun:** kein ORM, kein Migrationstool von Dritten, keine Rollen in Migrationen anlegen (Passwörter gehören nicht ins Repo), kein `SET` ohne `LOCAL`/`is_local=true`.

### E1-P3 · Anmeldung mit Better Auth

- **Ausführung:** Kern · **hängt ab von:** P2 · **parallel zu:** P8, P9
- **Dateien:** anlegen `src/server/auth.ts`, `src/server/mail.ts`, `src/server/middleware/session.ts`, `src/server/routes/dev.ts`, `src/server/domain/users/bootstrap.ts` (leerer Stub), `migrations/0002_auth.sql`, `tests/auth.test.ts`; ändern `src/server/app.ts`, `src/server/env.ts`, `package.json`, `.env.example`.
- **Abhängigkeiten:** `better-auth` (Version pinnen), Passkey-Plugin laut aktueller Better-Auth-Doku, `pg`, `@types/pg`, `nodemailer`, `@types/nodemailer`.
- **Auftrag:**
  1. `0002_auth.sql`: das von der Better-Auth-CLI für Postgres erzeugte Schema (user, session, account, verification, passkey, rateLimit), unverändert committen. Danach: `REVOKE ALL ON <diese Tabellen> FROM ebb_app, ebb_system`, `GRANT SELECT, INSERT, UPDATE, DELETE … TO ebb_auth`, `GRANT SELECT ("id","email","name") ON "user" TO ebb_system`. Kein RLS auf Auth-Tabellen.
  2. `auth.ts`: `betterAuth` mit `pg`-Pool als `ebb_auth`; E-Mail/Passwort (min. 10 Zeichen, Verifizierung Pflicht außer `APP_MODE=selfhost` ohne `SMTP_URL`); Passwort-Reset per Mail; Passkey (`rpID` = Host von `APP_URL`, `rpName` 'Ebb', `origin` = `APP_URL`); `rateLimit` an, Speicher DB; `trustedOrigins: [APP_URL]`; `databaseHooks.user.create.after` ruft `bootstrapUser(user.id)`.
  3. `mail.ts`: `sendMail({ to, subject, text })`. Mit `SMTP_URL` → nodemailer, sonst in-memory Liste (nur `development`/Tests). `devMails()` und `clearDevMails()` für Tests.
  4. `app.ts`: `app.on(['GET','POST'], '/api/auth/*', c => auth.handler(c.req.raw))`; `sessionMiddleware` auf `/api/*` setzt `c.var.user` (oder null); `requireUser` antwortet `401 { code: 'unauthenticated' }`; `GET /api/me` → `{ id, email, name }`; `routes/dev.ts` nur bei `APP_MODE=development`.
  5. Verifizierungs- und Reset-Mails: englischer Text (Mails werden in E10 übersetzt), Link auf `APP_URL`.
- **Akzeptanz:** `tests/auth.test.ts`: Registrierung → Mail abgefangen → Verifizierungslink aufrufen → Login → `GET /api/me` liefert die ID. Falsches Passwort → 401. Nach 10 Fehlversuchen in 60 s → 429. `ebb_app` bekommt `permission denied` auf `select * from "user"` und `"session"`. `bootstrapUser` wird genau einmal pro Registrierung aufgerufen (Spy). Passkey-Registrierung wird hier nur konfiguriert; der Browser-Test kommt in E1-P7.
- **Nicht tun:** keine eigene Passwort-Hash-Logik, keine Sessions in localStorage, keine JWT, kein OAuth-Provider.

### E1-P4 · Bereiche, Nutzer-Bootstrap, Isolations-Harness

- **Ausführung:** Kern · **hängt ab von:** P3 · **parallel zu:** P7
- **Dateien:** anlegen `migrations/0003_spaces_users.sql`, `src/server/domain/users/bootstrap.ts` (füllen), `src/server/domain/users/me.ts`, `tests/isolation.routes.ts`, `tests/isolation.test.ts`, `tests/bootstrap.test.ts`; ändern `tests/harness.ts`, `src/server/app.ts` (`/api/me` erweitern).
- **Auftrag:**
  1. Migration: Tabellen `space`, `space_member`, `space_invite`, `user_settings`, `user_access`, `product_event` laut `docs/architektur.md`. `app.is_member(space_id uuid)` als SECURITY DEFINER (`search_path` fest gesetzt). Partieller Unique-Index für `personal`. RLS `ENABLE` + `FORCE` auf allen. Policies: `space` (Lesen bei Mitgliedschaft, Ändern/Löschen nur Owner, Insert nur mit `owner_id = app.uid()` und `kind = 'shared'`), `space_member` (Lesen bei Mitgliedschaft im Bereich, kein direkter Insert für `ebb_app`), `user_settings` (eigene Zeile, kein Insert/Delete), `user_access` (nur `SELECT` der eigenen Zeile), `product_event` (Insert/Select eigene).
  2. `bootstrapUser(userId)` per `withSystem` in einer Transaktion: persönlicher Bereich (`name` = '', `kind` = 'personal'), Mitgliedschaft `owner`, `user_settings` mit Standardwerten (Zeitzone 'UTC', `day_start_minute` 240, `must_warn_at` 4, `timer_default_min` 25, `weekly_reset_dow` 0, `weekly_reset_time` '18:00', `quiet_start` '21:00', `quiet_end` '07:00'), `user_access` mit `trial_ends_at = now() + 7 days` (bei `APP_MODE=selfhost`: null). Idempotent (zweiter Aufruf ändert nichts).
  3. `GET /api/me` → `{ user, settings, personalSpaceId, trialEndsAt }`.
  4. Harness: `createUser(email?)` registriert über Better Auth (Verifizierung im Test übersprungen) und liefert `{ id, cookie }`; `as(user).get/post/patch/delete(path, body?)` auf `createApp().request`.
  5. Isolation: `tests/isolation.routes.ts` exportiert `isolationRoutes: Array<{ method, path: string /* mit :id */, seed: (owner) => Promise<string> /* liefert die id */, body?: unknown }>`. `tests/isolation.test.ts`: für jeden Eintrag legt Nutzer A per `seed` eine Ressource an, Nutzer B ruft `method path(id)` auf → erwartet `404`, Body ohne Daten von A. **Zusatztest:** Jede in `createApp()` registrierte Route mit Parameter (`app.routes`, Pfad enthält `:`) muss in `isolationRoutes` vorkommen, außer sie steht in `isolationExempt` (nur `/api/auth/*`, `/api/billing/webhook`) → sonst schlägt der Test mit dem Pfad fehl.
- **Akzeptanz:** `tests/bootstrap.test.ts`: Nach der Registrierung existieren genau ein persönlicher Bereich, eine Mitgliedschaft, Settings und Access. Nutzer B sieht per `withUser` weder A's Bereich noch Settings. `ebb_app` kann `user_access.trial_ends_at` nicht ändern (Fehler). `tests/isolation.test.ts` läuft grün (noch ohne Einträge, der Zusatztest aktiv).
- **Nicht tun:** keine Better-Auth-Organisationen; Policies nie mit `USING (true)`; `bootstrapUser` nie mit `ebb_app`.

### E1-P5 · Einstellungen-API

- **Ausführung:** DeepSeek · **hängt ab von:** P4 · **parallel zu:** —
- **Dateien:** anlegen `src/shared/schemas/settings.ts`, `src/server/routes/settings.ts`, `src/server/domain/settings/settings.ts`, `tests/settings.test.ts`; ändern `src/server/app.ts` (eine Zeile).
- **Auftrag:**
  1. zod `SettingsPatch` (alle optional): `locale` (`en|es|fr|de|ja|zh-CN`), `timezone` (muss in `Intl.supportedValuesOf('timeZone')` sein), `dayStartMinute` (0–720), `morningReminder` (`HH:MM` oder null), `weeklyResetDow` (0–6), `weeklyResetTime` (`HH:MM`), `errandsDow` (0–6 oder null), `quietStart`, `quietEnd` (`HH:MM`), `mustWarnAt` (3–5), `timerDefaultMin` (5–180), `notify` (Objekt mit booleschen Feldern `morning`, `habits`, `weeklyReset`, `errands`, `timer`, `trial`).
  2. `GET /api/settings`, `PATCH /api/settings` (nur die Felder aus dem Schema; Antwort = vollständige Settings in camelCase). Alles in `withUser`.
- **Akzeptanz:** `tests/settings.test.ts`: gültiges Patch wird gespeichert; ungültige Zeitzone → 400 mit Feldname; `dayStartMinute` 721 → 400; unbekanntes Feld wird ignoriert (nicht gespeichert); Nutzer B ändert nie A's Settings.
- **Nicht tun:** `onboarding_*`, `last_day_started` und `user_access` sind hier nicht änderbar.

### E1-P6 · Web-Fundament: Tokens, Schrift, i18n, Router, Shell

- **Ausführung:** DeepSeek · **hängt ab von:** P1 · **parallel zu:** P2
- **Dateien:** anlegen `src/web/styles.css`, `src/web/router.tsx`, `src/web/routes/__root.tsx`, `src/web/routes/index.tsx` (Redirect auf `/today`), `src/web/routes/today.tsx`, `src/web/routes/dump.tsx`, `src/web/routes/plan.tsx`, `src/web/routes/more.tsx`, `src/web/features/shell/AppShell.tsx`, `src/web/ui/` (Button, IconButton, Input, Textarea, Checkbox, Sheet, Dialog, Tabs, Menu, EmptyState, TideLine), `src/web/lib/i18n.ts`, `src/web/lib/api.ts`, `src/web/lib/cn.ts`, `locales/en/common.json`, `locales/en/shell.json`, `tests/web/no-hardcoded-text.test.ts`; ändern `src/web/main.tsx`, `vite.config.ts`, `package.json`.
- **Abhängigkeiten:** `@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/react-query`, `tailwindcss`, `@tailwindcss/vite`, `i18next`, `react-i18next`, `lucide-react`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`, `@radix-ui/react-checkbox`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, Schriftpakete für Atkinson Hyperlegible Next und Mono (Fontsource; gibt es sie nicht unter diesem Namen: aufhören und berichten).
- **Auftrag:**
  1. `styles.css`: Tailwind 4 `@theme` mit **allen** Tokens aus `DESIGN.md` §2–§7 als CSS-Variablen (Light auf `:root`, Dark unter `@media (prefers-color-scheme: dark)` und `[data-theme=dark]`). Spacing-, Radius- und Schriftskala genau wie im Papier. Browser-Oberflächen: `::selection` (signal @ 20 %), `caret-color: var(--signal)`, Fokus-Ring `outline: 2px solid var(--signal); outline-offset: 2px` nur bei `:focus-visible`, `font-variant-numeric: tabular-nums` als Utility.
  2. `ui/`: shadcn-Bausteine, auf die Tokens umgestellt (keine Standardfarben von shadcn/Tailwind). `TideLine`: 1 px `--signal`, volle Breite, Prop `animateIn` (scaleX 0 → 1, 400 ms, ease-out laut Papier; bei `prefers-reduced-motion` ohne Transform).
  3. `AppShell`: mobil eine untere Leiste mit Today, Dump, Plan, More (lucide `sun`, `notebook-pen`, `calendar-days`, `menu`) und einem Quick-Capture-Platzhalter-Button (56 px, Pill, `--signal`, Icon `plus`, öffnet in E2 ein Sheet). Ab `lg` eine linke Leiste mit 240 px. Aktiver Eintrag in `--ink`, inaktive in `--ink-3`. Touch-Ziele ≥ 44 px.
  4. Seiten `today|dump|plan|more`: nur Titel + `EmptyState` mit Text aus `locales/en/shell.json`.
  5. `i18n.ts`: i18next mit Namespaces, lädt `locales/<lang>/<ns>.json` per Vite-Glob-Import, Fallback `en`, Sprache aus Settings (vorerst `navigator.language`, auf unterstützte gemappt).
  6. `api.ts`: `apiFetch<T>(path, init)`: JSON, `credentials: 'include'`, 401 → Navigation zu `/sign-in`, 402 → setzt den globalen Zustand `readOnly` (TanStack-Query-Kontext), Fehler als `ApiError { status, code, fields? }`.
  7. `no-hardcoded-text.test.ts`: durchsucht `src/web/**/*.tsx` nach JSX-Textknoten mit Buchstaben (`/>\s*[A-Za-z][^<{]*</`) und nach `placeholder="…"`/`aria-label="…"` mit Literal. Erlaubt ist nur `t(...)`.
- **Akzeptanz:** `npm run check` grün; `python3 scripts/check-design.py` Exit 0; `npx vitest run tests/web/no-hardcoded-text.test.ts` grün; im Bericht Screenshots bei 390 × 844 (light und dark) und 1280 × 800. Tab-Reihenfolge der Navigation logisch, Fokus sichtbar.
- **Nicht tun:** keine Farb-/Abstandswerte außerhalb der Tokens, keine Google-Fonts-URL, kein Dark-Mode per Invertierung, keine Icons außer lucide.

### E1-P7 · Anmelde-Seiten

- **Ausführung:** DeepSeek · **hängt ab von:** P3, P6 · **parallel zu:** P4
- **Dateien:** anlegen `src/web/lib/auth-client.ts`, `src/web/routes/sign-in.tsx`, `src/web/routes/sign-up.tsx`, `src/web/routes/verify-email.tsx`, `src/web/routes/forgot-password.tsx`, `src/web/routes/reset-password.tsx`, `src/web/routes/settings.security.tsx`, `src/web/features/auth/*`, `locales/en/auth.json`, `e2e/auth.spec.ts`, `playwright.config.ts`; ändern `src/web/routes/__root.tsx` (Guard), `package.json`.
- **Abhängigkeiten:** dev `@playwright/test`.
- **Auftrag:** Better-Auth-React-Client mit Passkey-Client-Plugin. Registrieren (E-Mail, Passwort mit Hinweis „mindestens 10 Zeichen“), Anmelden (Passwort **oder** „Mit Passkey anmelden“), Hinweis-Seite „Bestätige deine E-Mail“, Passwort vergessen/zurücksetzen, Einstellungen → Sicherheit: Passkey hinzufügen, Passkeys auflisten und löschen, aktive Sitzungen, „Überall abmelden“. Route-Guard: ohne Session → `/sign-in?next=…`. Fehler nach DESIGN.md §9 (Problem + Ausweg).
- **Akzeptanz:** `e2e/auth.spec.ts`: Registrieren → Dev-Mail lesen (`/api/dev/mails`) → verifizieren → angemeldet auf `/today`; Abmelden; Anmelden mit Passwort; Passkey hinzufügen und damit anmelden über den virtuellen WebAuthn-Authenticator von Chromium (CDP `WebAuthn.addVirtualAuthenticator`). `no-hardcoded-text` bleibt grün.
- **Nicht tun:** keine eigene Formularvalidierung, die vom Server abweicht; Passwort nie in URL oder Storage.

### E1-P8 · Docker-Image und CI

- **Ausführung:** DeepSeek · **hängt ab von:** P2 · **parallel zu:** P3, P9
- **Dateien:** anlegen `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, `.github/workflows/ci.yml`.
- **Auftrag:** Mehrstufiges Image. Stufe *build*: `npm ci && npm run build`. Stufe *runtime*: `node:24-slim`, nur Produktionsabhängigkeiten, `src/`, `migrations/`, `scripts/migrate.ts`, `dist/web`, Nutzer `node`, `EXPOSE 2040`. Entrypoint: `node scripts/migrate.ts && exec node src/server/index.ts`. CI bei Push und PR: Postgres-17-Service mit Init-Skript, `npm ci`, `npm run check`, `npm run db:test-setup`, `npm test`, `npm run build`, `python3 scripts/check-design.py`. Bei Tag `v*`: Image bauen und nach `ghcr.io/<owner>/ebb:<tag>` pushen.
- **Akzeptanz:** `docker build .` erfolgreich; Container startet gegen die Compose-DB und beantwortet `/api/health`. CI-Workflow ist syntaktisch gültig (`actionlint`, falls vorhanden; sonst im Bericht vermerken).
- **Nicht tun:** keine Secrets im Image, kein `latest`-Tag als einziger Tag, kein Root-Nutzer.

### E1-P9 · PWA-Grundlage

- **Ausführung:** DeepSeek · **hängt ab von:** P6 · **parallel zu:** P3, P8
- **Dateien:** anlegen `src/web/sw.ts`, `public/icons/icon.svg`, `public/icons/maskable.svg`, `src/web/features/shell/InstallHint.tsx`, `locales/en/install.json`; ändern `vite.config.ts`, `package.json`.
- **Abhängigkeiten:** `vite-plugin-pwa`, `workbox-precaching`, `workbox-routing`.
- **Auftrag:** `vite-plugin-pwa` mit `strategies: 'injectManifest'`, `srcDir: 'src/web'`, `filename: 'sw.ts'`. Manifest: `name`/`short_name` 'Ebb', `display: standalone`, `background_color` und `theme_color` `#F4F2EE`, Icons aus `public/icons`. Platzhalter-Icon: Quadrat in `--ground`, eine waagrechte Linie in `--signal` auf 60 % Höhe (Tide-Linie), kein Text. `sw.ts`: Precache, Navigation-Fallback auf `index.html` außer `/api/*`. `InstallHint`: nur auf iOS-Safari außerhalb von `display-mode: standalone`, eine ruhige Zeile mit Anleitung „Teilen → Zum Home-Bildschirm“ (Text über i18n), schließbar, Zustand in localStorage.
- **Akzeptanz:** `npm run build` erzeugt `manifest.webmanifest` und `sw.js`. Lighthouse-PWA-Prüfung „installable“ erfüllt (Ausgabe im Bericht). `/api/*` wird nie aus dem Cache geliefert.
- **Nicht tun:** kein Runtime-Caching von API-Antworten (Offline-Daten regelt E2-P6), keine Push-Logik (E9).

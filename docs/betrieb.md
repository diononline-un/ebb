# Betrieb

Produktion läuft als ein Compose-Stack (`docker-compose.prod.yml`): App, PostgreSQL, Caddy und
ein Backup-Dienst. Nur Caddy veröffentlicht Ports (80, 443 und 443/udp); App, Datenbank und Backups
sind ausschließlich im internen Netz erreichbar. Alle Variablen stehen in `.env`, die Vorlage ist
`.env.prod.example`. `src/server/env.ts` prüft sie beim Start und bricht bei fehlenden Werten ab.

## Voraussetzungen

- Server (Contabo-VPS) mit Docker und dem Compose-Plugin, mindestens 2 GB RAM.
- DNS: ein A-Record für die Domain zeigt auf den Server. Für IPv6 zusätzlich ein AAAA-Record.
- Firewall: eingehend nur 80/tcp, 443/tcp und 443/udp offen. Alles andere blockt die Firewall,
  der Stack selbst veröffentlicht nichts weiter.
- Ein Release-Tag `v*` in GitHub mit gebautem Image in GHCR (CI-Job `image`), zum Beispiel `v0.1.0`.
- `openssl` auf dem Server für die Secrets.

## Erster Deploy

1. Repo klonen und `.env` anlegen:

   ```bash
   git clone https://github.com/diononline-un/ebb.git
   cd ebb
   cp .env.prod.example .env
   ```

2. In `.env` alle `change-me` ersetzen:
   - `EBB_DOMAIN` und `APP_URL`: derselbe Host, `APP_URL` mit `https://`.
   - `EBB_VERSION`: der Release-Tag, zum Beispiel `v0.1.0`. Kein `latest`, damit ein Neustart
     dieselbe Version startet.
   - `POSTGRES_PASSWORD`, `EBB_OWNER_PASSWORD`, `EBB_APP_PASSWORD`, `EBB_SYSTEM_PASSWORD`,
     `EBB_AUTH_PASSWORD`, `AUTH_SECRET`: je ein eigenes `openssl rand -hex 32`.
     `POSTGRES_PASSWORD` gehört dem Superuser des Datenbankcontainers. Die vier
     `EBB_*_PASSWORD` setzt das Init-Skript beim ersten Start der frischen Datenbank, sie müssen
     zu den Werten in `.env` passen.
   - `SMTP_URL` und `MAIL_FROM`: Zugang des Mail-Anbieters. Ohne `SMTP_URL` startet die App im
     Modus `production` nicht.
   - Paddle bleibt leer. Dafür gibt es den Abschnitt [Paddle live schalten](#paddle-live-schalten).

3. Starten:

   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```

   Beim ersten Start legt das Postgres-Init-Skript die vier Rollen und die Datenbank an. Der
   App-Entrypoint spielt danach die Migrationen ein und übergibt an den Server.

4. Prüfen:

   ```bash
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs -f app
   curl -fsS https://<domain>/api/health
   ```

   Die letzte Zeile antwortet mit `{"ok":true}`. Caddy holt das TLS-Zertifikat beim ersten
   HTTPS-Aufruf; bei Problemen stehen Details in `docker compose -f docker-compose.prod.yml logs caddy`.

## Update

1. In `.env` `EBB_VERSION` auf den neuen Tag setzen.
2. Image ziehen und Stack neu starten:

   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```

   Compose ersetzt nur die Dienste, deren Image oder Konfiguration sich geändert hat. Der
   Entrypoint der App spielt vor dem Start die Migrationen ein.

3. `docker compose -f docker-compose.prod.yml logs -f app` und
   `curl -fsS https://<domain>/api/health` prüfen.

Migrationen laufen nur vorwärts (`docs/architektur.md`). Zurück auf den alten Tag geht mit
`EBB_VERSION` zurücksetzen und `up -d`, solange die neue Migration abwärtskompatibel war. Vor einem
Update mit Migration ein Backup auslösen (siehe unten).

## Backup prüfen

Der Dienst `backup` schläft bis zur nächsten vollen Stunde und sichert täglich um `BACKUP_HOUR`
(UTC). Jeder Lauf legt `/backups/<UTC-Zeitstempel>/` an mit `roles.sql`, `<EBB_DB_NAME>.dump`
(Custom-Format) und `toc.txt` aus `pg_restore --list`. Ordner, die älter als `BACKUP_KEEP_DAYS`
Tage sind, löscht derselbe Lauf.

- Log verfolgen: `docker compose -f docker-compose.prod.yml logs -f backup`
- Inhalt ansehen: `docker compose -f docker-compose.prod.yml exec backup ls -l /backups`
- Lauf sofort auslösen:

  ```bash
  docker compose -f docker-compose.prod.yml run --rm -e BACKUP_ONCE=1 backup
  ```

  Der Befehl endet bei Erfolg mit Exit 0, schreibt einen Ordner mit dem aktuellen Zeitstempel und
  beendet sich. Schlägt er fehl, nennt das Log den Schritt und der Exit-Code ist ungleich 0.
- Plausibilität eines Dumps:

  ```bash
  docker compose -f docker-compose.prod.yml exec backup \
    pg_restore --list /backups/<stamp>/<EBB_DB_NAME>.dump | head
  ```

Die Backups liegen auf demselben Server wie die Datenbank. Kopiere sie regelmäßig außer Haus
(anderer Host, EU), sonst ist ein Serververlust auch ein Backup-Verlust. Der Dienst verschlüsselt
nichts und lädt nichts hoch; das Offsite-Ziel ist noch offen (`docs/specs/E09-betrieb.md`, D1).
Verschlüssele die Kopie auf dem Ziel, wenn der Speicher nicht ohnehin verschlüsselt ist.

## Restore-Runbook

Ziel: einen Backup-Ordner in eine leere Postgres-Instanz spielen und die Zeilenzahlen prüfen.
Das Skript braucht `POSTGRES_PASSWORD`, `EBB_DB_NAME` und den Ordner im Volume `backups`
(Compose-Name in diesem Stack: `ebb_backups`).

> **Nie `docker compose down -v` auf dem Produktions-Host.** `-v` löscht alle Volumes, auch `ebb_backups`
> und `pgdata`. Für einen Neustart reicht `down` ohne `-v`.
> Legt ein `docker run -v ebb_backups:…` das Volume vor Compose an, warnt Compose später
> („volume already exists but was not created by Docker Compose“). Das ist harmlos; vermeiden lässt es
> sich mit `docker compose -f docker-compose.prod.yml create backup` vorher.

### Drill auf einem zweiten Host

1. Repo und `.env` auf den zweiten Host kopieren. `.env` braucht dieselben Werte für
   `POSTGRES_PASSWORD`, `EBB_DB_NAME` und die vier `EBB_*_PASSWORD` wie der Quell-Stack.
2. Nur die Datenbank starten. Das Init-Skript legt Rollen und die leere Datenbank an:

   ```bash
   docker compose -f docker-compose.prod.yml up -d postgres
   ```

3. Den Backup-Ordner vom Quell-Server auf den zweiten Host kopieren und in das Volume legen.
   `<stamp>` ist der Ordnername, zum Beispiel `20261127T030000Z`:

   ```bash
   docker run --rm -v ebb_backups:/backups -v "$PWD/<stamp>:/in:ro" postgres:17 \
     sh -c 'mkdir -p /backups/<stamp> && cp -a /in/. /backups/<stamp>/'
   ```

4. Restore starten. Vorher die Uhrzeit notieren, danach noch einmal:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm --entrypoint sh backup \
     /backup/restore.sh /backups/<stamp>
   ```

   Das Skript spielt zuerst fehlende Rollen ein. Die vier `ebb_*`-Rollen existieren in der frischen
   Instanz schon, deshalb bleibt `roles.sql` für sie folgenlos und die neuen Passwörter aus `.env`
   gelten weiter. Danach läuft `pg_restore --exit-on-error` in `EBB_DB_NAME`. Am Ende stehen die
   Zeilenzahlen für `"user"`, `task` und `space` im Log. Exit 0 heißt: Restore vollständig.

5. Zahlen mit dem Quellstand vergleichen. Danach die App starten und anmelden:

   ```bash
   docker compose -f docker-compose.prod.yml up -d app
   curl -fsS https://<domain>/api/health
   ```

### Notfall-Restore auf dem Produktions-Host

Nur wenn die laufende Datenbank verloren oder beschädigt ist. Die Schritte löschen den aktuellen
Datenbankstand. Der Backup-Ordner liegt schon im Volume `ebb_backups` und überlebt die Schritte 2
und 3.

1. App stoppen:

   ```bash
   docker compose -f docker-compose.prod.yml stop app
   ```

2. Stack entfernen und das Datenbank-Volume löschen:

   ```bash
   docker compose -f docker-compose.prod.yml down
   docker volume rm ebb_pgdata
   ```

3. Leere Datenbank starten:

   ```bash
   docker compose -f docker-compose.prod.yml up -d postgres
   ```

4. Restore ausführen wie im Drill, Schritt 4.
5. Alles starten und prüfen:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   curl -fsS https://<domain>/api/health
   ```

Die Dauer des Drills hängt an der Größe des Dumps: eine kleine Datenbank ist in Sekunden zurück,
bei einigen GB dominiert `pg_restore`. Start- und Endzeit aus Schritt 4 gehören in den Drill-Bericht.

## Paddle live schalten

Die Billing-Variablen in `.env` füllen:

| Variable | Wert |
|---|---|
| `PADDLE_WEBHOOK_SECRET` | Secret der Notification Destination in Paddle |
| `PADDLE_API_KEY` | serverseitiger API-Key aus Paddle |
| `PADDLE_PRICE_FOUNDER` | Price-ID des Gründer-Preises |
| `PADDLE_PRICE_STANDARD` | Price-ID des Standard-Preises |
| `PADDLE_PRICE_SEAT` | Price-ID des Zusatz-Sitzes |
| `PRICE_BASE_ACTIVE` | `founder` oder `standard` |
| `TRIAL_REQUIRES_CARD` | `true` oder `false` |
| `MAX_EXTRA_SEATS` | 0 bis 20, Standard 5 |

Danach die App neu erzeugen, damit sie die neuen Werte liest:

```bash
docker compose -f docker-compose.prod.yml up -d app
```

In Paddle eine Notification Destination auf `https://<domain>/api/billing/webhook` setzen. Ohne
`PADDLE_WEBHOOK_SECRET` antwortet die Route mit 503, mit falschem Secret mit 401. Beides steht im
App-Log, wenn Paddle zustellt.

## Monitoring

Ein externer Uptime-Monitor (jeder HTTP-Check genügt) fragt alle 60 Sekunden
`https://<domain>/api/health/deep` ab. Alarmiert wird nach zwei Fehlschlägen in Folge, damit ein
einzelner Aussetzer keinen Weckruf auslöst.

Die Route antwortet mit `200`, solange die Datenbank erreichbar ist und kein Billing-Ereignis länger
als zehn Minuten offen liegt; sonst mit `503`. Der Body ist immer dasselbe Objekt:

| Feld | Bedeutung |
|---|---|
| `ok` | `true`, wenn Datenbank und Billing-Warteschlange in Ordnung sind |
| `db` | `true`, wenn die Datenbank auf `select 1` antwortet |
| `billingLagSeconds` | Alter des ältesten offenen Billing-Ereignisses in Sekunden, `null` ohne offene Zeile |

`GET /api/health` bleibt der billige Lebenszeichen-Check für den Compose-Healthcheck; die tiefe
Prüfung ist für den externen Monitor gedacht. Beide Routen nennen keine Person und brauchen keine
Anmeldung.

### Logs

Die App schreibt je API-Antwort eine JSON-Zeile auf stdout, in `production` und `selfhost` bei jedem
Request:

```json
{"t":"2026-11-27T10:00:00.000Z","method":"GET","route":"/api/tasks/:id","status":200,"ms":14}
```

- `t`: Antwortzeitpunkt in UTC.
- `method`: HTTP-Methode.
- `route`: das Routen-Muster, nie der echte Pfad. Damit stehen keine UUIDs, Einladungs-Tokens
  (`/api/tasks/:id` statt der echten Id) oder Mail-Adressen im Log.
- `status`: der HTTP-Status der Antwort.
- `ms`: Dauer vom Eingang bis zur Antwort in Millisekunden.

Query, Header, Body, User-ID und IP-Adresse landen bewusst nicht im Log. `GET /api/health` und
`GET /api/health/deep` werden übersprungen, damit Uptime-Checks kein Rauschen erzeugen. In
`APP_MODE=development` ist die Ausgabe aus, außer `LOG_REQUESTS=1` steht in der Umgebung.

Ansehen mit `docker compose -f docker-compose.prod.yml logs app`. Die Rotation ist in
`docker-compose.prod.yml` je Dienst gesetzt (`max-size: 10m`, `max-file: "5"`), ältere Zeilen fallen
also von selbst weg.

## Lasttest

Zielwerte (PRD §9, Kapazitätsschätzung): 5 000 Nutzer mit je 50 Aufgaben, Morgenspitze um 100 req/s
gemischt, p95 unter 200 ms bei 50 gleichzeitigen Requests.

`k6` ist nicht installiert und kommt nicht dazu. Die Mischlast läuft in Node über `fetch`:
`scripts/load/seed.ts` legt die Daten an, `scripts/load/scenario.ts` fährt sie. Beide Dateien stehen
unter `tsconfig.server.json` und werden von `npm run check` geprüft.

### Auf dem Ziel-VPS

**Nie gegen Produktion.** Der Seed schreibt 250 000 Aufgaben, der Lauf schreibt echte Dumps und
Aufgaben dazu. Immer gegen eine Kopie, die nach dem Abschnitt „Restore-Runbook“ in eine eigene
Datenbank gespielt wird. Eigener Port, eigener Prozess, und am Ende wieder aufräumen.

```bash
# 1. Eigene Datenbank mit Rollen und Migrationen. db:test-setup akzeptiert nur Namen mit dem
#    Präfix ebb_test, deshalb heißt die Lastdatenbank ebb_test_load.
export EBB_DB_NAME=ebb_test_load
npm run db:test-setup

# 2. Daten: 5000 Konten mit je 50 Aufgaben, 200 Sitzungen nach /tmp/ebb-load-sessions.json
node scripts/load/seed.ts --users 5000

# 3. Server auf eigenem Port, Timeout als Absicherung
setsid env APP_MODE=development PORT=2050 EBB_DB_NAME=ebb_test_load \
  timeout 1800 node src/server/index.ts >/tmp/ebb-load-server.log 2>&1 &

# 4. Lauf: 100 req/s für 120 s, höchstens 50 gleichzeitig
node scripts/load/scenario.ts --rate 100 --duration 120 --concurrency 50

# 5. Aufräumen: PID aus `ss -ltnp | grep :2050` gezielt beenden, danach die Datenbank löschen
kill <PID>
psql "$POSTGRES_SUPERUSER_URL" -c 'drop database ebb_test_load with (force)'
```

`--base` nimmt nur `http://127.0.0.1:<port>` oder `http://localhost:<port>` an. Cookies und
Datenbanknamen gehören nicht ins Repo; die Sitzungen landen in `/tmp/ebb-load-sessions.json`.

### Messwerte (2026-11-27, Entwicklungs-VPS, vorläufig)

Lauf wie oben: 5000 Konten mit 250 000 Aufgaben, 200 Sitzungen, 100 req/s für 120 s, höchstens 50
gleichzeitig. Die Maschine ist die Entwicklungs-VPS und teilt Datenbank und CPU mit anderen
Projekten. Die Werte sind vorläufig; der Ziel-VPS wird mit demselben Ablauf gemessen.

| Größe | Ziel | Gemessen |
|---|---|---|
| Requests | 12 000 (100 req/s × 120 s) | 12 000, erreicht 99,9 req/s |
| Fehler (Status ≥ 400 oder Verbindungsfehler) | 0 | 0 |
| p50 gesamt | – | 92 ms |
| p95 gesamt | unter 200 ms | **663 ms** |
| p99 gesamt | – | 920 ms |
| CPU des Node-Prozesses | – | 84 % eines Kerns (101 s in 120 s), `ps` über die Prozesslaufzeit: 55 % |
| RAM des Node-Prozesses | – | Spitze 386 MB (`ps`), im Lauf zwischen 161 und 386 MB |
| Datenbank | – | 109 MB, 252 127 Aufgaben, 5000 Konten |

| Route | Requests | p50 | p95 | p99 |
|---|---|---|---|---|
| `GET /api/today` | 6061 | 92 ms | 609 ms | 793 ms |
| `PATCH /api/tasks/:id` | 1813 | 108 ms | 799 ms | 1138 ms |
| `GET /api/habits/today` | 1187 | 71 ms | 584 ms | 754 ms |
| `POST /api/dump` | 1176 | 96 ms | 757 ms | 1038 ms |
| `GET /api/tasks?view=week` | 1170 | 63 ms | 554 ms | 725 ms |
| `POST /api/tasks` | 593 | 107 ms | 818 ms | 1085 ms |

### Ursache für p95 über 200 ms

Dieselben Skripte, einmal mit `--rate 5` und einmal mit `--rate 100`:

- Ohne Last (5 req/s): p50 38 ms, p95 128 ms; Node 11 % und PostgreSQL 7 % eines Kerns. Das Ziel ist
  ohne Last erreichbar.
- Unter Last (100 req/s): Node 80 bis 84 %, PostgreSQL 77 bis 84 % eines Kerns. Beide Prozesse
  brauchen zusammen rund 16 ms CPU je Request.

`EXPLAIN (ANALYZE, BUFFERS)` auf den Abfragen der langsamsten Route (`POST /api/tasks`, p95 818 ms):
die teuerste ist das `insert into task` mit 3,5 ms, davon 1,6 ms im Trigger `task_before_write`
(liest `space` unter RLS) und 0,7 ms in den Fremdschlüssel-Triggern. Alle anderen Abfragen der Route
liegen unter 1 ms: Sitzung 0,07 ms, Tagesbeginn 0,17 ms, Zugriff 0,05 bis 0,2 ms, persönlicher
Bereich 0,6 ms. `GET /api/today` liest 46 Zeilen in 0,96 ms.

Keine Abfrage ist langsam, kein Index fehlt. Die Antwortzeit entsteht aus der CPU-Arbeit je Request:
viele kurze Abfragen mit je 0,1 bis 0,7 ms Planungszeit, dazu die RLS-Funktionen, verteilt auf einen
einkernigen Node-Prozess und eine geteilte PostgreSQL-Instanz. Bei 50 gleichzeitigen Requests
summieren sich 16 ms CPU je Request auf bis zu 800 ms Wartezeit. Drei Läufe am selben Tag streuten
zwischen p95 663 und 929 ms; die VPS trägt auch andere Projekte.

Verbesserungen an Poolgröße, Abfragezahl oder RLS-Aufrufen gehören deshalb in ein eigenes Paket,
nicht in den Lasttest.

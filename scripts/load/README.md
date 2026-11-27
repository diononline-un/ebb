# Lasttest (E9-P6)

Fährt die Mischlast aus dem Paket gegen einen lokalen Entwicklungsserver. Kein k6, kein
autocannon: nur Node und `fetch`. Messwerte, Zielwerte und der Ablauf auf dem Ziel-VPS stehen in
[../../docs/betrieb.md](../../docs/betrieb.md), Abschnitt „Lasttest".

```bash
# Eigene Datenbank. db:test-setup legt Rollen und Migrationen an, akzeptiert aber nur Namen mit
# dem Präfix ebb_test; deshalb heißt die Lastdatenbank ebb_test_load.
export EBB_DB_NAME=ebb_test_load
npm run db:test-setup

# 5000 Konten mit je 50 Aufgaben, dazu 200 Sitzungen in /tmp/ebb-load-sessions.json (nie im Repo)
node scripts/load/seed.ts --users 5000

# Server auf eigenem Port
setsid env APP_MODE=development PORT=2050 EBB_DB_NAME=ebb_test_load \
  timeout 1800 node src/server/index.ts >/tmp/ebb-load-server.log 2>&1 &

# 100 req/s für 120 s, höchstens 50 gleichzeitig
node scripts/load/scenario.ts --rate 100 --duration 120 --concurrency 50
```

`scenario.ts` gibt eine JSON-Zeile und eine Tabelle mit Requests, Fehlern und p50/p95/p99 je Route
und gesamt aus. `--base` nimmt nur `http://127.0.0.1:<port>` oder `http://localhost:<port>` an:
niemals gegen Produktion oder die Entwicklungsdatenbank `ebb` fahren.

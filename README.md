# Fanclub Busfahrten

Web-App (PWA) für die Busfahrten eines Fanclubs: Mitglieder bekunden zuerst Interesse, die Plätze werden automatisch nach bisherigen Fahrten vergeben, danach können alle Restplätze buchen.

Aktueller Stand: **Phase 1 ohne Datenbank.** Alle Daten liegen im Browser (localStorage). So lässt sich die App direkt auf dem Handy ausprobieren.

## Ablauf einer Fahrt

1. Ein Admin erstellt die Fahrt. **3 Tage lang** dürfen nur Mitglieder Interesse bekunden.
2. Danach werden die Plätze **automatisch** vergeben: wer die meisten bisherigen Fahrten hat, kommt zuerst dran (bei Gleichstand zählt das frühere Interesse). Wer keinen Platz bekommt, steht auf der Warteliste.
3. Sind Plätze frei, kann **jeder** angemeldete Benutzer buchen, auch Nicht-Mitglieder. Ist der Bus voll, geht es auf die Warteliste. Bei einer Stornierung rückt die Warteliste automatisch nach.

Als „bisherige Fahrten“ zählen bestätigte Plätze auf abgefahrenen Fahrten plus ein vom Admin gesetzter Startwert für Fahrten vor der App.

## Funktionen

- Registrierung und Anmeldung mit E-Mail und Passwort (Demo-Login, nicht sicher)
- Mitgliederverwaltung: Registrierte können eine Mitgliedschaft anfragen, Admins bestätigen
- Fahrten ansehen, Interesse bekunden, buchen, stornieren, Wartelistenplatz sehen
- Admin-Bereich: Fahrten anlegen, bearbeiten, löschen, Teilnehmer ansehen, Benutzer verwalten
- Wechselbare Designs (Profil → Design): „Stadion-Nacht“ und „Klassisch“
- Installierbar als PWA („Zum Startbildschirm hinzufügen“), läuft offline

### Demo-Zugänge

| Rolle | E-Mail | Passwort |
| --- | --- | --- |
| Admin | `admin@fanclub.test` | `admin123` |
| Mitglied | `anna@fanclub.test` (auch `max`, `julia`, `karl`, `sophie`) | `demo123` |
| Kein Mitglied | `lukas@fanclub.test` | `demo123` |

Im Admin-Bereich setzt „Demo-Daten zurücksetzen“ alles zurück. Mit „Interessensphase beenden“ lässt sich die Vergabe sofort auslösen, ohne drei Tage zu warten.

## Entwicklung

```bash
npm ci
npm run dev        # Entwicklungsserver
npm test           # Regel-Tests (Vitest)
npm run build      # Typecheck + Produktions-Build nach dist/
npm run preview    # gebauten Stand ansehen
```

Die App ist für den Pfad `/TestRepo/` gebaut. Für einen anderen Pfad: `BASE_PATH=/ npm run build`.

## Deployment (kostenlos)

Bei jedem Push auf `master` baut GitHub Actions die App und veröffentlicht sie auf GitHub Pages (`.github/workflows/deploy.yml`). `ci.yml` prüft jeden Push mit Typecheck, Tests und Build.

Einmalig einrichten: *Settings → Pages → Source: GitHub Actions*. Für Branches außer dem Standard-Branch muss unter *Settings → Environments → github-pages* eine Branch-Regel ergänzt werden. Die Design-Mockups liegen nach dem Deployment unter `/mockups/`.

## Aufbau

- `src/domain/` – Regeln (Phasen, Vergabe, Warteliste), reine Funktionen mit Tests in `tests/`
- `src/data/DataService.ts` – Schnittstelle zum Speicher, `localStorageService.ts` ist die Demo-Umsetzung
- `src/auth/AuthService.ts` – Schnittstelle zur Anmeldung, `localAuth.ts` ist die Demo-Umsetzung
- `src/themes/` – Designs als CSS-Variablen. Neues Design: CSS-Datei mit `:root[data-theme='<id>']` anlegen, in `main.tsx` importieren und in `themes/index.ts` eintragen
- `mockups/` – statische Design-Entwürfe

## Später: Datenbank und echte Anmeldung

Die App greift nur über `DataService` und `AuthService` auf Daten zu. Für den Echtbetrieb genügt es, dafür neue Umsetzungen zu schreiben und in `src/state/AppContext.tsx` einzutragen. Empfehlung für einen gemeinnützigen Verein: **Supabase** im kostenlosen Tarif (Postgres, Anmeldung mit E-Mail und OpenID Connect, Zugriffsregeln pro Zeile, geplante Jobs für die automatische Platzvergabe). Die Vergabe läuft dann serverseitig, die Regeln aus `src/domain/rules.ts` dienen als Vorlage.

Weitere Ideen: Benachrichtigungen bei Platzvergabe, Bezahlung, Veröffentlichung als App über Capacitor oder TWA.

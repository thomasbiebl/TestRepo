# Fanclub Busfahrten

Web-App (PWA) für die Busfahrten eines Fanclubs: Mitglieder bekunden zuerst Interesse, die Plätze werden automatisch nach bisherigen Fahrten vergeben, danach können alle Restplätze buchen.

Die App läuft in zwei Modi:

- **Demo-Modus** (Standard): Alle Daten liegen im Browser (localStorage), der Login ist nur zum Ausprobieren.
- **Echtbetrieb mit Supabase**: Datenbank und sichere Anmeldung. Einrichtung in [docs/SUPABASE.md](docs/SUPABASE.md). Sobald `SUPABASE_URL` und `SUPABASE_ANON_KEY` gesetzt sind, schaltet die App automatisch um.

## Ablauf einer Fahrt

1. Ein Admin erstellt die Fahrt. Der **Vorlauf für Mitglieder** (Standard 3 Tage, einstellbar) gilt: so lange dürfen nur Mitglieder Interesse bekunden.
2. Danach werden die Plätze **automatisch** vergeben: wer die meisten bisherigen Fahrten hat, kommt zuerst dran (bei Gleichstand zählt das frühere Interesse). Wer keinen Platz bekommt, steht auf der Warteliste.
3. Sind Plätze frei, kann **jeder** angemeldete Benutzer buchen, auch Nicht-Mitglieder (abschaltbar). Ist der Bus voll, geht es auf die Warteliste (abschaltbar). Bei einer Stornierung rückt die Warteliste automatisch nach.

Als „bisherige Fahrten“ zählen bestätigte Plätze auf abgefahrenen Fahrten plus ein vom Admin gesetzter Startwert für Fahrten vor der App.

## Funktionen

**Für Mitglieder und Gäste**
- Registrierung und Anmeldung mit E-Mail und Passwort, Passwort zurücksetzen, optional Google, Apple, Facebook (nur mit Supabase)
- Fahrten ansehen, Interesse bekunden, buchen, stornieren, Wartelistenplatz sehen
- Begleitpersonen mitbringen, Zustiegsstelle wählen, Fahrpreis und Zahlungsstatus sehen
- Mitteilungen in der App (Glocke) und optional per E-Mail: Platz vergeben, nachgerückt, Fahrt abgesagt, neue Fahrt, News
- News lesen, Abfahrt in den Kalender übernehmen
- Profil: Name und Passwort ändern, Mitgliedscode einlösen, Daten herunterladen, Konto löschen, Design wählen (Stadion-Nacht, Klassisch, Clean, Ticket)

**Für Admins**
- Fahrten anlegen, bearbeiten, absagen, löschen (Anstoß, Rückfahrt, Hinweise, Zustiegsstellen, mehrere Busse, Punkte)
- Teilnehmerliste je Fahrt mit Kasse (erwartet, bezahlt, offen), „bezahlt“ und „eingestiegen / nicht erschienen“ abhaken, Bus zuordnen, CSV-Export und Druckansicht
- Benutzer verwalten, Mitgliederliste per CSV importieren, Mitgliedscode festlegen
- News veröffentlichen und anpinnen
- Einstellungen: Vorlauf für Mitglieder, Gäste dürfen buchen, Warteliste, Stornofrist, Begleitpersonen, Abzug bei Nichterscheinen, Vorgaben für neue Fahrten, Vereinsname
- Änderungsprotokoll: wer hat wann was geändert
- **Hilfe in der App** (Symbol „?“ oben, auch ohne Anmeldung unter `#/help`): Anleitung für Mitglieder und, nur für Admins, die genaue Buchungslogik mit allen Einstellungen. Die Texte folgen den Einstellungen des Vereins, das Rechenbeispiel zur Platzvergabe wird mit der echten Vergabe berechnet. Die Texte stehen in `src/help/`. Ändert sich eine Regel, passe dort den Text an, die Tests in `tests/help.test.tsx` melden Abweichungen.
- Installierbar als PWA („Zum Startbildschirm hinzufügen“), läuft offline

**Rangfolge bei der Platzvergabe:** Punkte = Startwert + Punkte der Fahrten, an denen man teilgenommen hat, minus Abzug für Nichterscheinen (einstellbar). Eine Fahrt zählt in der Regel 1 Punkt, Admins können weite Fahrten höher gewichten. Eine Buchung mit Begleitpersonen belegt entsprechend viele Plätze. Passt eine Gruppe nicht mehr in den Bus, kommt sie auf die Warteliste, und die nächsten Interessenten werden weiter geprüft.

Nicht enthalten: Push-Nachrichten aufs Handy (Web Push) und Online-Bezahlung. Der Zahlungsstatus wird von Hand geführt.

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
npm test           # Regel-Tests (Vitest), inkl. SQL-Tests
npm run build      # Typecheck + Produktions-Build nach dist/
npm run preview    # gebauten Stand ansehen
```

Lokal läuft die App unter `/`. Das Deployment baut sie automatisch für den Pfad `/<Repo-Name>/` (Variable `BASE_PATH`), den Namen des Repos kannst du also jederzeit ändern. Für einen eigenen Pfad: `BASE_PATH=/mein-pfad/ npm run build`.

## Deployment (kostenlos)

Bei jedem Push auf `master` baut GitHub Actions die App und veröffentlicht sie auf GitHub Pages (`.github/workflows/deploy.yml`). `ci.yml` prüft jeden Push mit Typecheck, Tests und Build.

Einmalig einrichten: *Settings → Pages → Source: GitHub Actions*. Für Branches außer dem Standard-Branch muss unter *Settings → Environments → github-pages* eine Branch-Regel ergänzt werden. Die Design-Mockups liegen nach dem Deployment unter `/mockups/`.

## Aufbau

- `src/domain/` – Regeln (Phasen, Vergabe, Warteliste, Punkte, Mitteilungen, Protokoll), reine Funktionen mit Tests in `tests/`
- `src/data/DataService.ts` – Schnittstelle zum Speicher, `localStorageService.ts` ist die Demo-Umsetzung
- `src/auth/AuthService.ts` – Schnittstelle zur Anmeldung, `localAuth.ts` ist die Demo-Umsetzung
- `src/themes/` – Designs als CSS-Variablen. Neues Design: CSS-Datei mit `:root[data-theme='<id>']` anlegen, in `main.tsx` importieren und in `themes/index.ts` eintragen
- `supabase/migrations/` – Datenbank (Tabellen, Zugriffsregeln, Vergabe), `supabase/functions/` – E-Mail-Versand
- `mockups/` – statische Design-Entwürfe

## Datenbank und Anmeldung (Supabase)

Die App greift nur über `DataService` und `AuthService` auf Daten zu. Dafür gibt es zwei Umsetzungen: browserlokal (`localStorageService.ts`, `localAuth.ts`) und Supabase (`supabaseService.ts`, `supabaseAuth.ts`). `src/services.ts` wählt anhand der Umgebungsvariablen aus.

Beim Echtbetrieb liegen die Regeln in der Datenbank (`supabase/migrations/0001_init.sql`): Platzvergabe, Warteliste, Zugriffsrechte. Die Vergabe läuft serverseitig, bei Bedarf alle 5 Minuten per `pg_cron`, und `src/domain/rules.ts` spiegelt dieselben Regeln für die Anzeige. Die SQL-Regeln sind mit `npm test` gegen eine echte Postgres-Engine (PGlite) getestet.

Kosten: GitHub Pages und der kostenlose Supabase-Tarif reichen für rund 500 Nutzer. `keepalive.yml` verhindert die Pausierung, `backup.yml` sichert wöchentlich verschlüsselt.

Weitere Ideen: Anmeldung mit Google, Apple oder Facebook (OpenID Connect), Benachrichtigungen bei Platzvergabe, Bezahlung, Veröffentlichung als App über Capacitor oder TWA.

import { Link } from 'react-router-dom';
import type { Settings } from '../domain/types';
import { daysText, hoursText, priorityText } from './format';
import type { HelpSection } from './sections';

const yes = (v: boolean) => (v ? 'an' : 'aus');

/** The guide for admins, with the full booking logic. The numbers follow the club's current settings. */
export function adminSections(s: Settings): HelpSection[] {
  return [
    {
      id: 'rollen',
      title: 'Rollen und Menüpunkte',
      keywords: 'rollen gast mitglied admin menü bereiche übersicht',
      body: (
        <>
          <div className="table-scroll">
            <table className="help-table">
              <thead><tr><th>Rolle</th><th>Kann</th></tr></thead>
              <tbody>
                <tr><td>Gast</td><td>Sich registrieren, Fahrten und News ansehen. Buchen nur in der offenen Phase{s.guestsMayBook ? '' : ' (bei uns abgeschaltet)'}.</td></tr>
                <tr><td>Mitglied</td><td>Wie ein Gast, dazu Interesse bekunden in der Vorrang-Phase und Vorrang bei der Vergabe.</td></tr>
                <tr><td>Admin</td><td>Alles, plus der Bereich <b>Admin</b> unten rechts. Wer auch mitfährt, sollte zusätzlich als Mitglied markiert sein, sonst kann er in der Vorrang-Phase kein Interesse bekunden.</td></tr>
              </tbody>
            </table>
          </div>
          <p>Der Bereich <b>Admin</b> enthält:</p>
          <ul>
            <li><b>Fahrten verwalten:</b> anlegen, ändern, absagen, löschen, Teilnehmerliste und Kasse.</li>
            <li><b>Benutzer verwalten:</b> Mitglied und Admin setzen, Startwert für Fahrten, Konten löschen.</li>
            <li><b>Mitgliederliste importieren</b> und der <b>Mitgliedscode</b> (unter Einstellungen).</li>
            <li><b>News verwalten</b>, <b>Einstellungen</b>, <b>Änderungsprotokoll</b>.</li>
          </ul>
          <p className="muted">Läuft die App im Demo-Modus (ohne Datenbank), liegen alle Daten nur im Browser dieses Geräts. Für den Echtbetrieb braucht es Supabase, siehe <code>docs/SUPABASE.md</code> im Repository.</p>
        </>
      ),
    },
    {
      id: 'logik',
      title: 'Buchungslogik im Detail',
      keywords: 'buchungslogik phasen vergabe rangfolge warteliste nachrücken zeitpunkt automatisch sonderfälle gruppen platzzahl absagen',
      body: (
        <>
          <h4>1. Phasen und Zeitpunkte</h4>
          <ul>
            <li>Beim <b>Anlegen</b> einer Fahrt wird das Ende der Vorrang-Phase festgeschrieben: Anlegezeit plus Vorrang-Tage aus den Einstellungen (aktuell: {priorityText(s)}).</li>
            <li>Ändert ihr die Einstellung später, gilt das nur für <b>neu angelegte</b> Fahrten. Bestehende behalten ihre Frist.</li>
            <li>Phase 1: <b>Interesse</b> (bis zum festgeschriebenen Zeitpunkt). Phase 2: <b>Offene Buchung</b> (danach bis zur Abfahrt). Danach ist die Fahrt <b>abgefahren</b>. Eine abgesagte Fahrt ist immer <b>abgesagt</b>.</li>
            <li><b>Interessensphase beenden</b> bei einer Fahrt (Fahrten verwalten) setzt das Ende auf jetzt und vergibt sofort. Nutze das für Tests oder wenn der Verein früher entscheiden will.</li>
          </ul>

          <h4>2. Wer darf wann was?</h4>
          <div className="table-scroll">
            <table className="help-table">
              <thead><tr><th>Phase</th><th>Mitglied</th><th>Gast</th></tr></thead>
              <tbody>
                <tr><td>Interesse</td><td>Interesse bekunden (auch mit Begleitung)</td><td>Nur ansehen</td></tr>
                <tr><td>Offene Buchung</td><td>Buchen, sonst Warteliste</td><td>{s.guestsMayBook ? 'Buchen, sonst Warteliste' : 'Nur ansehen (bei uns abgeschaltet)'}</td></tr>
                <tr><td>Abgefahren / abgesagt</td><td>Nichts mehr</td><td>Nichts mehr</td></tr>
              </tbody>
            </table>
          </div>
          <p>Eine Person kann eine Fahrt nur einmal buchen. {s.waitlistEnabled ? 'Ist der Bus voll, geht die Buchung auf die Warteliste.' : 'Ist der Bus voll, wird die Buchung abgelehnt, eine Warteliste gibt es bei uns nicht.'}</p>

          <h4>3. Die Vergabe Schritt für Schritt</h4>
          <ol>
            <li>Sobald die Vorrang-Phase zu Ende ist, werden alle Interessenten nach <b>Punkten</b> sortiert (absteigend). Bei gleichen Punkten steht vorn, wer sein Interesse <b>früher</b> bekundet hat.</li>
            <li>Die Liste wird von oben abgearbeitet. Jede Buchung braucht <b>1 Platz plus Begleitpersonen</b>. Passt sie in die noch freien Plätze, wird sie <b>bestätigt</b>.</li>
            <li>Passt sie nicht mehr, kommt sie auf die <b>Warteliste</b>. Die Liste wird trotzdem weiter abgearbeitet: Eine kleinere Gruppe weiter unten kann noch einen Platz bekommen.</li>
            <li>Die Warteliste hat dieselbe Reihenfolge wie die Rangliste.</li>
            <li>Jede Person bekommt eine Mitteilung (Platz bestätigt oder Warteliste). Danach gilt die Fahrt als vergeben, das passiert nur einmal.</li>
          </ol>
          <p>Wann läuft das?</p>
          <ul>
            <li><b>Echtbetrieb (Supabase):</b> alle 5 Minuten per Datenbank-Job (wenn <code>pg_cron</code> aktiv ist), außerdem bei jedem Öffnen der App und vor jeder Buchung. Die Verzögerung nach Fristende beträgt also höchstens wenige Minuten.</li>
            <li><b>Demo-Modus:</b> beim Öffnen der App und alle 30 Sekunden, solange sie offen ist.</li>
            <li>Bucht in der offenen Phase jemand, wird <b>zuerst</b> vergeben. So kann niemand einem Interessenten den Platz wegbuchen.</li>
          </ul>

          <h4>4. Offene Buchung</h4>
          <p>Wer bucht, bekommt den Platz sofort, wenn seine ganze Gruppe in die freien Plätze passt (Reihenfolge: wer zuerst kommt). Sonst landet er hinten auf der Warteliste.</p>
          <p className="muted">Auch ein einzelner neuer Buchender bekommt einen freien Einzelplatz, selbst wenn auf der Warteliste eine größere Gruppe wartet, der dieser Platz nicht reicht.</p>

          <h4>5. Nachrücken</h4>
          <ul>
            <li>Wird eine <b>bestätigte</b> Buchung storniert oder ein Konto gelöscht, rückt die Warteliste nach, und zwar in ihrer Reihenfolge. Es rückt nur nach, wessen ganze Gruppe in die freien Plätze passt.</li>
            <li>Erhöht ihr die <b>Platzzahl</b> einer Fahrt, rücken ebenfalls Wartende nach.</li>
            <li>Wer nachrückt, bekommt eine Mitteilung.</li>
            <li>Storniert ein Admin eine Buchung (Liste &amp; Kasse), rückt die Warteliste genauso nach, und die betroffene Person bekommt eine Mitteilung.</li>
            <li>Das Zurückziehen von Interesse oder von der Warteliste lässt niemanden nachrücken.</li>
          </ul>

          <h4>6. Sonderfälle</h4>
          <ul>
            <li><b>Platzzahl verringern:</b> Niemand wird verdrängt. Es werden nur keine neuen Plätze mehr frei.</li>
            <li><b>Fahrt absagen:</b> Niemand kann mehr buchen, es gibt keine Vergabe. Alle mit Interesse, Platz oder Wartelistenplatz bekommen die Absage mit dem Grund. Die Fahrt zählt nicht für Punkte.</li>
            <li><b>Fahrt löschen:</b> Entfernt die Fahrt und alle Buchungen endgültig, ohne Benachrichtigung. Sage lieber ab.</li>
            <li><b>Konto löschen:</b> Entfernt die Buchungen der Person. Plätze werden frei, die Warteliste rückt nach.</li>
            <li><b>Begleitpersonen:</b> Für die Rangfolge zählen nur die Punkte der buchenden Person. Begleitpersonen belegen Plätze und zahlen, bekommen aber selbst keine Punkte.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'punkte',
      title: 'Punkte und Nichterscheinen',
      keywords: 'punkte startwert fahrten vor der app abzug no-show nicht erschienen gewichtung rangfolge',
      body: (
        <>
          <p>Die Punkte entscheiden über die Rangfolge. Sie werden zum Zeitpunkt der Vergabe berechnet:</p>
          <p className="formula">Punkte = Startwert + Punkte der Fahrten − {s.noShowPenalty} × Nichterscheinen</p>
          <ul>
            <li><b>Startwert:</b> Fahrten aus der Zeit vor der App. Trage ihn unter <b>Benutzer verwalten → Fahrten vor der App</b> ein.</li>
            <li><b>Fahrtpunkte:</b> Jede Fahrt hat ein Feld „Punkte“ (Standard 1, Bereich 0 bis 10). Eine weite oder besondere Fahrt kann mehr zählen. Punkte bekommt, wer einen <b>bestätigten Platz</b> auf einer <b>abgefahrenen, nicht abgesagten</b> Fahrt hatte und nicht als „fehlt“ markiert wurde.</li>
            <li><b>Nichterscheinen:</b> In <b>Liste &amp; Kasse</b> markierst du Personen als „da“ oder „fehlt“. Wer fehlt, bekommt für diese Fahrt keine Punkte und verliert zusätzlich {s.noShowPenalty} {s.noShowPenalty === 1 ? 'Punkt' : 'Punkte'}{s.noShowPenalty === 0 ? ' (aktuell ist der Abzug ausgeschaltet)' : ''}. Ohne Markierung gilt jeder als erschienen. Die Punkte fallen nie unter 0.</li>
            <li>Die Anzahl „bisheriger Fahrten“ zählt jede Teilnahme einfach, unabhängig von den Fahrtpunkten.</li>
          </ul>
          <p>Jedes Mitglied sieht seine Punkte im Profil und in der Rangliste der Fahrt (dort mit abgekürzten Namen der anderen).</p>
        </>
      ),
    },
    {
      id: 'fahrten',
      title: 'Fahrten anlegen und verwalten',
      keywords: 'fahrt anlegen bearbeiten absagen löschen zustiegsstellen busse hinweise anstoß rückfahrt interessensphase beenden',
      body: (
        <>
          <p><b>Admin → Fahrten verwalten → + Neue Fahrt.</b> Die Vorgaben (Plätze, Preis, Treffpunkt) kommen aus den Einstellungen.</p>
          <div className="table-scroll">
            <table className="help-table">
              <thead><tr><th>Feld</th><th>Wirkung</th></tr></thead>
              <tbody>
                <tr><td>Titel</td><td>Name der Fahrt, z. B. „Augsburg (A)“.</td></tr>
                <tr><td>Abfahrt</td><td>Ab diesem Zeitpunkt ist die Fahrt abgefahren, es geht nichts mehr.</td></tr>
                <tr><td>Treffpunkt</td><td>Wird angezeigt. Bei mehreren Zustiegsstellen wählen die Mitfahrer eine aus.</td></tr>
                <tr><td>Preis, Plätze</td><td>Preis pro Person. Plätze insgesamt, über alle Busse.</td></tr>
                <tr><td>Busse</td><td>Anzahl der Busse (1 bis 10). Mitfahrer ordnest du in der Liste einem Bus zu.</td></tr>
                <tr><td>Punkte</td><td>Punkte, die die Teilnahme für die Rangfolge bringt.</td></tr>
                <tr><td>Anstoß, Rückfahrt, Hinweise</td><td>Nur zur Information. Die Rückfahrt steht auch im Kalendereintrag.</td></tr>
                <tr><td>Zustiegsstellen</td><td>Eine pro Zeile. Gibt es welche, muss jede Buchung eine wählen.</td></tr>
              </tbody>
            </table>
          </div>
          <ul>
            <li><b>Bearbeiten</b> ändert die Felder, nicht die Vorrang-Frist und nicht die Buchungen.</li>
            <li><b>Fahrt absagen</b> mit Grund: sieh Abschnitt Buchungslogik. <b>Löschen</b> entfernt alles.</li>
            <li><b>Teilnehmer</b> zeigt eine Schnellansicht, <b>Liste &amp; Kasse</b> die volle Verwaltung.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'liste',
      title: 'Teilnehmerliste und Kasse',
      keywords: 'teilnehmerliste kasse bezahlt eingestiegen fehlt bus csv drucken excel fahrer',
      body: (
        <>
          <p><b>Fahrten verwalten → Liste &amp; Kasse</b> einer Fahrt. Diese Seite ist für den Busfahrer und den Kassenwart gedacht.</p>
          <ul>
            <li><b>Kasse:</b> erwartete, bezahlte und offene Beträge. Jede Begleitperson zahlt den vollen Preis.</li>
            <li><b>Bezahlt:</b> Haken setzen, sobald das Geld da ist. Die Person sieht „bezahlt ✓“ in ihrer Buchung.</li>
            <li><b>da / fehlt:</b> beim Einsteigen abhaken. „fehlt“ wirkt auf die Punkte (siehe Punkte).</li>
            <li><b>Busse:</b> Bei mehreren Bussen sortiert die Liste nach Bus und Zustiegsstelle. Teile die Mitfahrer in der Schnellansicht <b>Teilnehmer</b> den Bussen zu.</li>
            <li><b>CSV herunterladen:</b> Datei für Excel (Semikolon, UTF-8). Sie enthält Namen, E-Mail, Plätze, Begleitung, Zustieg, Bus, Betrag, bezahlt und eingestiegen.</li>
            <li><b>Stornieren:</b> Entfernt die Buchung einer Person (bestätigt, Warteliste oder Interesse), auch nach der Stornofrist. Die Person wird benachrichtigt, nach der Abfahrt geht es nicht mehr.</li>
            <li><b>Drucken:</b> Druckansicht ohne Menü. Alle Abschnitte werden mit ausgegeben.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'mitglieder',
      title: 'Mitglieder verwalten',
      keywords: 'mitglieder benutzer liste import csv code mitgliedschaft anfrage admin rechte startwert löschen',
      body: (
        <>
          <h4>Benutzer verwalten</h4>
          <ul>
            <li>Haken <b>Mitglied</b> und <b>Admin</b> setzen. Neue Anfragen („Anfrage“) stehen oben.</li>
            <li><b>Fahrten vor der App</b> ist der Startwert für die Punkte.</li>
            <li><b>Löschen</b> entfernt das Konto und die Buchungen. Dich selbst kannst du hier nicht löschen, und der letzte Admin kann sein Konto nicht löschen.</li>
          </ul>
          <h4>Mitgliederliste importieren</h4>
          <p><b>Admin → Mitgliederliste importieren.</b> Füge die Liste aus Excel ein, eine Person pro Zeile, etwa:</p>
          <pre className="errortext">{'max@example.org;Max Huber;1024\nanna@example.org;Anna Maier;1025'}</pre>
          <ul>
            <li>Nur die E-Mail-Adresse ist Pflicht. Name und Mitgliedsnummer in beliebiger Reihenfolge. Eine Kopfzeile wird übersprungen.</li>
            <li>Wer die Adresse beim Registrieren verwendet, ist <b>sofort Mitglied</b>. Bereits registrierte Personen werden beim Import zu Mitgliedern.</li>
            <li>Wiederholte Importe aktualisieren die Liste. „Liste leeren“ entfernt Einträge, macht aber niemanden zum Nicht-Mitglied.</li>
            <li>Die Mitgliedschaft hängt an der E-Mail-Adresse. Lasst deshalb in der Anmeldung die E-Mail-Bestätigung eingeschaltet.</li>
          </ul>
          <h4>Mitgliedscode</h4>
          <p>Unter <b>Einstellungen → Mitgliedschaft</b> legst du einen Code fest. Wer ihn im Profil eingibt, wird sofort Mitglied. Nach 5 falschen Versuchen pro Stunde ist für die Person Pause. Ändere den Code, wenn er öffentlich wurde.</p>
        </>
      ),
    },
    {
      id: 'einstellungen',
      title: 'Alle Einstellungen erklärt',
      keywords: 'einstellungen vorrang vorlauf gäste warteliste stornofrist begleitpersonen abzug vorgaben vereinsname mitgliedscode',
      body: (
        <>
          <p>Unter <b>Admin → Einstellungen</b>. Die Spalte „Aktuell“ zeigt, was bei euch eingestellt ist.</p>
          <div className="table-scroll">
            <table className="help-table wide">
              <thead><tr><th>Einstellung</th><th>Wirkung</th><th>Aktuell</th></tr></thead>
              <tbody>
                <tr><td>Vorlauf für Mitglieder (Tage)</td><td>So lange dürfen nur Mitglieder Interesse bekunden. 0 = keine Vorrang-Zeit, alle buchen sofort. Gilt nur für neue Fahrten.</td><td>{daysText(s.interestDays)}</td></tr>
                <tr><td>Nicht-Mitglieder dürfen nach der Vergabe buchen</td><td>Aus: In der offenen Phase können nur Mitglieder buchen.</td><td>{yes(s.guestsMayBook)}</td></tr>
                <tr><td>Warteliste bei ausgebuchten Fahrten</td><td>Aus: Ist der Bus voll, wird die Buchung abgelehnt. Wer schon auf einer Warteliste steht, bleibt dort.</td><td>{yes(s.waitlistEnabled)}</td></tr>
                <tr><td>Stornofrist (Stunden vor Abfahrt)</td><td>Bis dahin können Mitfahrer bestätigte Plätze selbst stornieren. 0 = bis zur Abfahrt. Interesse und Warteliste gehen immer.</td><td>{s.cancelDeadlineHours === 0 ? 'bis zur Abfahrt' : hoursText(s.cancelDeadlineHours)}</td></tr>
                <tr><td>Begleitpersonen pro Buchung</td><td>Höchstzahl. 0 schaltet Begleitpersonen ab.</td><td>{s.maxCompanions}</td></tr>
                <tr><td>Abzug bei Nichterscheinen (Punkte)</td><td>Punkte, die jemand pro „fehlt“ verliert, zusätzlich zu den entgangenen Fahrtpunkten.</td><td>{s.noShowPenalty}</td></tr>
                <tr><td>Mitgliedscode</td><td>Code, mit dem man sich im Profil zum Mitglied macht. Leer = aus.</td><td>{s.memberCode ? 'gesetzt' : 'aus'}</td></tr>
                <tr><td>Standard für neue Fahrten</td><td>Plätze, Preis und Treffpunkt, mit denen das Formular vorbelegt wird.</td><td>{s.defaultSeats} Plätze, {s.defaultPrice} €, {s.defaultMeetingPoint}</td></tr>
                <tr><td>Vereinsname</td><td>Erscheint auf der Anmeldeseite, im Seitentitel und in E-Mails.</td><td>{s.clubName}</td></tr>
              </tbody>
            </table>
          </div>
          <p>Änderungen gelten sofort, mit einer Ausnahme: Die Vorrang-Zeit gilt nur für Fahrten, die danach angelegt werden. Alle Änderungen stehen im Änderungsprotokoll.</p>
        </>
      ),
    },
    {
      id: 'news',
      title: 'News und Mitteilungen',
      keywords: 'news mitteilungen e-mail anpinnen benachrichtigung rundmail limit brevo',
      body: (
        <>
          <ul>
            <li><b>News verwalten:</b> Titel und Text (Zeilenumbrüche bleiben erhalten, es gibt keine Formatierung). Mit „Anpinnen“ steht eine News ganz oben.</li>
            <li>Jede neue Fahrt erzeugt eine Mitteilung in der App für alle, jede neue News für alle außer den Autor.</li>
            <li>Persönliche Mitteilungen gehen an die Betroffenen: Platz vergeben, Warteliste, nachgerückt, Fahrt abgesagt, Buchung von einem Admin storniert.</li>
            <li><b>E-Mail:</b> Nur im Echtbetrieb mit eingerichteter E-Mail-Funktion. Persönliche Meldungen sind standardmäßig an, Rundmails zu neuen Fahrten und News aus. Das stellt jede Person selbst im Profil ein. Der Grund: Kostenlose Mail-Tarife erlauben nur wenige hundert Mails pro Tag, eine Fahrt an 500 Personen würde das sprengen.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'protokoll',
      title: 'Änderungsprotokoll und Datenschutz',
      keywords: 'protokoll änderungen datenschutz dsgvo löschen backup namen sichtbar',
      body: (
        <>
          <h4>Änderungsprotokoll</h4>
          <p>Unter <b>Admin → Änderungsprotokoll</b> stehen die letzten Änderungen mit Datum und Name: Fahrten (angelegt, geändert, abgesagt, gelöscht, Vorrang beendet), News, Einstellungen, Mitgliedschaften, Admin-Rechte, Startwerte, gelöschte Konten, Listenimport und Zahlungs-, Einstiegs- und Bus-Markierungen sowie von Admins stornierte Buchungen. Der Mitgliedscode selbst steht nicht im Protokoll.</p>
          <p>Nicht protokolliert werden die automatische Platzvergabe und Buchungen oder Stornierungen der Mitglieder selbst.</p>
          <h4>Datenschutz</h4>
          <ul>
            <li>E-Mail-Adressen sehen nur Admins. Andere Mitglieder sehen in der Rangliste nur abgekürzte Namen und Punkte.</li>
            <li>Jede Person kann ihre Daten herunterladen und ihr Konto selbst löschen.</li>
            <li>Für den Echtbetrieb braucht der Verein ein Impressum und eine Datenschutzerklärung. Nennt darin die genutzten Dienste (Datenbank-Anbieter, E-Mail-Anbieter, Hosting).</li>
            <li>Der kostenlose Datenbank-Tarif hat keine automatischen Backups. Die wöchentliche verschlüsselte Sicherung ist in <code>docs/SUPABASE.md</code> beschrieben. Richtet sie ein, bevor echte Daten drin sind.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'rezepte',
      title: 'Typische Situationen',
      keywords: 'rezepte situationen zweiter bus voll tauschen fahrt fällt aus vorrang abschalten bezahlt nicht storno frist falsche vergabe',
      body: (
        <>
          <h4>Der Bus ist voll, aber es wollen noch welche mit</h4>
          <p>Erhöhe die Platzzahl der Fahrt (Bearbeiten). Wartende rücken sofort nach und werden benachrichtigt. Braucht ihr einen zweiten Bus, erhöhe zusätzlich „Busse“ und teile die Mitfahrer in der Schnellansicht <b>Teilnehmer</b> zu.</p>
          <h4>Die Fahrt fällt aus</h4>
          <p>Fahrt <b>absagen</b> und einen Grund eintragen. Alle Betroffenen bekommen eine Mitteilung. Nicht löschen, sonst verschwinden auch die Buchungen.</p>
          <h4>Alle sollen sofort buchen können, ohne Vorrang</h4>
          <p>Setze den Vorlauf in den Einstellungen auf 0. Das gilt für Fahrten, die du danach anlegst. Bei einer bestehenden Fahrt hilft „Interessensphase beenden“.</p>
          <h4>Jemand will nach Ablauf der Stornofrist noch absagen, oder ein Platz muss frei werden</h4>
          <p>Öffne <b>Liste &amp; Kasse</b> der Fahrt und tippe bei der Person auf <b>Stornieren</b>, dann auf <b>Wirklich stornieren</b>. Die Stornofrist gilt für Admins nicht. Die Person bekommt eine Mitteilung, die Warteliste rückt nach. Nach der Abfahrt geht das nicht mehr.</p>
          <h4>Jemand hat nicht gezahlt oder ist nicht erschienen</h4>
          <p>Lasse „bezahlt“ offen, in <b>Liste &amp; Kasse</b> siehst du alle offenen Beträge. Markiere Nichterscheinen mit „fehlt“, das wirkt auf die Punkte bei der nächsten Vergabe.</p>
          <h4>Die Vergabe scheint falsch</h4>
          <p>Öffne die Fahrt als Mitglied und schau in die Rangliste: Dort stehen Punkte, Begleitung und Reihenfolge. Prüfe die Punkte der Person (Benutzer verwalten: Startwert; Liste &amp; Kasse früherer Fahrten: „fehlt“-Markierungen). Meist erklärt eine Begleitgruppe, die nicht mehr passte, das Ergebnis.</p>
          <h4>Jemand findet die App nicht mehr oder sieht eine leere Seite</h4>
          <p>Verweise auf den Abschnitt „Probleme und häufige Fragen“ im Mitglieder-Teil dieser Hilfe. Meist reicht ein harter Neustart der Seite.</p>
          <p className="muted"><Link to="/admin">Zurück zum Admin-Bereich</Link></p>
        </>
      ),
    },
  ];
}

import { Link } from 'react-router-dom';
import type { Settings } from '../domain/types';
import { exampleAllocation, EXAMPLE_SEATS } from './example';
import { cancelText, daysText, priorityText } from './format';
import type { HelpSection } from './sections';

function Example() {
  const rows = exampleAllocation();
  return (
    <div className="table-scroll">
      <table className="help-table example">
        <thead>
          <tr><th>Rang</th><th>Wer</th><th>Punkte</th><th>Plätze</th><th>Ergebnis</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} data-ok={r.result === 'Platz'}>
              <td>{i + 1}</td>
              <td>{r.name}</td>
              <td>{r.score}</td>
              <td>{r.seats}</td>
              <td>{r.result === 'Platz' ? 'Platz' : `Warteliste Nr. ${r.waitPosition}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The guide for members and guests. The numbers follow the club's current settings. */
export function userSections(s: Settings): HelpSection[] {
  return [
    {
      id: 'start',
      title: 'Erste Schritte',
      keywords: 'registrieren anmelden konto passwort vergessen installieren startbildschirm iphone android mitglied werden code',
      body: (
        <>
          <h4>Konto anlegen</h4>
          <ol>
            <li>Tippe auf <b>Registrieren</b> und gib Namen, E-Mail-Adresse und ein Passwort mit mindestens 6 Zeichen ein.</li>
            <li>Bist du Vereinsmitglied, setze den Haken „Ich bin Vereinsmitglied“. Ein Admin prüft das.</li>
            <li>Es kann sein, dass du eine Bestätigungs-E-Mail bekommst. Öffne darin den Link, danach kannst du dich anmelden.</li>
          </ol>
          <p>Passwort vergessen? Tippe auf der Anmeldeseite auf <b>Passwort vergessen?</b> und folge dem Link in der E-Mail.</p>

          <h4>Mitglied werden</h4>
          <p>Als Mitglied hast du bei neuen Fahrten Vorrang. Es gibt drei Wege:</p>
          <ul>
            <li>Die E-Mail-Adresse steht in der Mitgliederliste des Vereins. Dann bist du sofort Mitglied.</li>
            <li>Du hast einen <b>Mitgliedscode</b> vom Verein: Profil → Mitgliedscode eingeben.</li>
            <li>Du hast bei der Registrierung „Ich bin Vereinsmitglied“ angehakt. Ein Admin bestätigt es.</li>
          </ul>

          <h4>App auf den Startbildschirm legen</h4>
          <ul>
            <li><b>iPhone (Safari):</b> Teilen-Symbol → „Zum Home-Bildschirm“.</li>
            <li><b>Android (Chrome):</b> Menü (drei Punkte) → „App installieren“ oder „Zum Startbildschirm hinzufügen“.</li>
            <li><b>Computer (Edge, Chrome):</b> Symbol „Installieren“ in der Adresszeile.</li>
          </ul>
          <p>Danach öffnet sich die App wie jede andere und merkt sich dich.</p>
        </>
      ),
    },
    {
      id: 'ablauf',
      title: 'So läuft eine Fahrt ab',
      keywords: 'phasen vorrang interesse vergabe offene buchung zeitstrahl ablauf mitglieder tage',
      body: (
        <>
          <p>Jede Fahrt durchläuft drei Phasen. Du siehst die aktuelle Phase oben auf der Fahrtkarte.</p>
          <ol className="flow">
            <li>
              <b>Interesse (nur Mitglieder)</b>
              <span>Ein Admin legt die Fahrt an. {s.interestDays === 0 ? 'Bei uns gibt es keine Vorrang-Zeit, es geht sofort mit Schritt 3 weiter.' : <>Danach haben Mitglieder <b>{daysText(s.interestDays)}</b> Zeit, ihr Interesse zu bekunden. Das kostet nichts und ist noch keine feste Buchung. Gäste können in dieser Zeit nur zuschauen.</>}</span>
            </li>
            <li>
              <b>Platzvergabe (automatisch)</b>
              <span>Wenn die Zeit um ist, werden die Plätze vergeben. Wer die meisten Punkte hat, kommt zuerst dran (siehe unten). Wer keinen Platz mehr bekommt, steht auf der Warteliste. Du bekommst eine Mitteilung.</span>
            </li>
            <li>
              <b>Offene Buchung</b>
              <span>{s.guestsMayBook ? 'Sind noch Plätze frei, kann jetzt jeder angemeldete Benutzer buchen, auch Nicht-Mitglieder.' : 'Sind noch Plätze frei, können jetzt weitere Mitglieder buchen. Nicht-Mitglieder können bei uns nicht buchen.'} Wer zuerst bucht, bekommt den Platz. Ist der Bus voll, {s.waitlistEnabled ? 'geht es auf die Warteliste.' : 'ist die Fahrt ausgebucht (eine Warteliste gibt es bei uns nicht).'}</span>
            </li>
          </ol>
          <p>Nach der Abfahrt ist die Fahrt abgeschlossen. Fällt sie aus, sagt ein Admin sie ab, und alle Betroffenen bekommen eine Mitteilung.</p>
          <p className="muted">Aktuell gilt: {priorityText(s)}.</p>
        </>
      ),
    },
    {
      id: 'vergabe',
      title: 'Wer bekommt einen Platz?',
      keywords: 'punkte rangfolge gleichstand vergabe warteliste begleitpersonen gruppe beispiel fair',
      body: (
        <>
          <p>Gibt es mehr Interessenten als Plätze, entscheiden <b>Punkte</b>. Sie belohnen, wer schon oft mitgefahren ist.</p>
          <ul>
            <li>Du bekommst für jede Fahrt, an der du teilgenommen hast, Punkte (meistens einen).</li>
            <li>Fahrten aus der Zeit vor der App hat der Verein als Startwert eingetragen.</li>
            <li>Wer die meisten Punkte hat, bekommt zuerst einen Platz. Deine Punkte siehst du im Profil und in der Fahrt.</li>
            <li>Bei gleich vielen Punkten gewinnt, wer sein Interesse <b>früher</b> bekundet hat.</li>
            <li>Bringst du Begleitpersonen mit, brauchen alle zusammen Platz. Passt die ganze Gruppe nicht mehr in den Bus, kommt sie auf die Warteliste. Danach werden weiter unten stehende Interessenten geprüft, kleinere Gruppen können also noch einen Platz bekommen.</li>
            {s.noShowPenalty > 0 && <li>Wer angemeldet war und nicht erschienen ist, bekommt für diese Fahrt keine Punkte und verliert {s.noShowPenalty} {s.noShowPenalty === 1 ? 'Punkt' : 'Punkte'}.</li>}
          </ul>
          <h4>Beispiel</h4>
          <p>Ein Bus mit {EXAMPLE_SEATS} Plätzen. Alle haben in der Vorrang-Zeit Interesse bekundet:</p>
          <Example />
          <p className="muted">Julia und Karl haben gleich viele Punkte. Julia war früher dran, deshalb steht sie vor Karl. Karl braucht mit drei Begleitpersonen vier Plätze, es sind aber nur noch drei frei. Er kommt auf die Warteliste. Anna und Sophie haben weniger Punkte, ihre kleineren Gruppen passen aber noch in den Bus. Lukas kommt nicht mehr hinein.</p>
          <p>Wird später ein Platz frei, rückt die Warteliste in der angezeigten Reihenfolge nach. Es rückt nur nach, wessen ganze Gruppe in die freien Plätze passt.</p>
        </>
      ),
    },
    {
      id: 'buchen',
      title: 'Buchen',
      keywords: 'buchen interesse begleitpersonen zustiegsstelle preis bezahlen warteliste nachrücken',
      body: (
        <>
          <ol>
            <li>Öffne unter <b>Fahrten</b> die Fahrt und tippe auf <b>Interesse bekunden</b> (Vorrang-Zeit) oder <b>Platz buchen</b> (offene Buchung).</li>
            <li>Gibt es mehrere <b>Zustiegsstellen</b>, wähle deine aus.</li>
            {s.maxCompanions > 0 ? (
              <li>Du kannst bis zu <b>{s.maxCompanions}</b> Begleitpersonen mitbringen. Jede belegt einen Platz und zahlt den vollen Fahrpreis. Namen kannst du angeben, das hilft dem Fahrer.</li>
            ) : (
              <li>Begleitpersonen sind bei uns nicht vorgesehen. Jede Person bucht für sich.</li>
            )}
            <li>Nach der Buchung siehst du deinen Status auf der Fahrt und unter <b>Buchungen</b>.</li>
          </ol>
          <p><b>Bezahlt</b> wird beim Verein, nicht in der App. Ein Admin vermerkt dort, wenn du bezahlt hast. Du siehst den Fahrpreis und ob er noch offen ist in deiner Buchung.</p>
          <p>Ist der Bus voll, kannst du {s.waitlistEnabled ? <>dich auf die <b>Warteliste</b> setzen. Wird ein Platz frei, rückst du automatisch nach und bekommst eine Mitteilung.</> : 'dich leider nicht mehr eintragen.'}</p>
        </>
      ),
    },
    {
      id: 'stornieren',
      title: 'Stornieren und zurückziehen',
      keywords: 'stornieren absagen zurückziehen frist stornofrist warteliste interesse abmelden',
      body: (
        <>
          <ul>
            <li><b>Interesse</b> und <b>Warteliste</b> kannst du jederzeit zurückziehen.</li>
            <li>Einen <b>bestätigten Platz</b> kannst du {cancelText(s)} selbst stornieren. {s.cancelDeadlineHours > 0 ? 'Danach melde dich bitte bei einem Admin.' : ''}</li>
            <li>Nach der Abfahrt geht keine Änderung mehr.</li>
          </ul>
          <p>Gibst du einen Platz frei, rückt die Warteliste automatisch nach. Bitte storniere deshalb möglichst früh.</p>
          <p>Wer angemeldet war und nicht erscheint, wird markiert. {s.noShowPenalty > 0 ? `Das kostet ${s.noShowPenalty} ${s.noShowPenalty === 1 ? 'Punkt' : 'Punkte'} und senkt die Chance bei der nächsten Vergabe.` : 'Eine Punktstrafe gibt es bei uns aktuell nicht.'}</p>
        </>
      ),
    },
    {
      id: 'mitteilungen',
      title: 'Mitteilungen und E-Mails',
      keywords: 'mitteilungen benachrichtigungen glocke e-mail news',
      body: (
        <>
          <p>Die Glocke oben rechts zeigt, wie viele neue Mitteilungen es gibt. Du bekommst eine, wenn</p>
          <ul>
            <li>dein Platz vergeben wurde oder du auf der Warteliste gelandet bist,</li>
            <li>du von der Warteliste nachgerückt bist,</li>
            <li>eine Fahrt abgesagt wurde, für die du angemeldet bist,</li>
            <li>es eine neue Fahrt oder eine neue News gibt.</li>
          </ul>
          <p>Zusätzlich kannst du dir persönliche Meldungen und, wenn du magst, auch neue Fahrten und News per E-Mail schicken lassen. Das stellst du im <b>Profil</b> ein, sofern der Verein E-Mails eingerichtet hat. Ein roter Punkt am Tab <b>News</b> zeigt ungelesene Neuigkeiten.</p>
        </>
      ),
    },
    {
      id: 'status',
      title: 'Was bedeuten die Status?',
      keywords: 'status badge interesse bestätigt warteliste abgesagt abgefahren bezahlt',
      body: (
        <div className="table-scroll">
          <table className="help-table">
            <thead><tr><th>Anzeige</th><th>Bedeutung</th></tr></thead>
            <tbody>
              <tr><td>Interesse · Mitglieder</td><td>Die Vorrang-Phase läuft. Mitglieder können Interesse bekunden.</td></tr>
              <tr><td>Offene Buchung</td><td>Die Plätze sind vergeben. Freie Plätze kann man buchen.</td></tr>
              <tr><td>Interesse bekundet</td><td>Du hast dich gemeldet und wartest auf die Vergabe.</td></tr>
              <tr><td>Platz bestätigt</td><td>Du hast einen Platz.</td></tr>
              <tr><td>Warteliste</td><td>Der Bus ist voll. Du rückst nach, sobald etwas frei wird.</td></tr>
              <tr><td>Abgesagt</td><td>Die Fahrt findet nicht statt.</td></tr>
              <tr><td>Abgefahren</td><td>Die Fahrt ist vorbei.</td></tr>
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: 'profil',
      title: 'Profil und deine Daten',
      keywords: 'profil name passwort design daten herunterladen konto löschen datenschutz',
      body: (
        <>
          <ul>
            <li><b>Name und Passwort</b> kannst du jederzeit ändern.</li>
            <li><b>Design:</b> Es gibt vier Farbwelten (Stadion-Nacht, Klassisch, Clean, Ticket). Die Wahl gilt nur auf diesem Gerät.</li>
            <li><b>Meine Daten herunterladen:</b> Du bekommst eine Datei mit allem, was über dich gespeichert ist.</li>
            <li><b>Konto löschen:</b> Dein Konto und deine Buchungen werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.</li>
          </ul>
          <p>Gespeichert werden nur Name, E-Mail-Adresse und deine Buchungen. Mehr braucht die App nicht.</p>
        </>
      ),
    },
    {
      id: 'probleme',
      title: 'Probleme und häufige Fragen',
      keywords: 'problem fehler leer weiß seite zwischenspeicher aktualisieren kein platz buchen nicht möglich',
      body: (
        <>
          <h4>Warum habe ich keinen Platz bekommen?</h4>
          <p>Es gab mehr Interessenten als Plätze, und andere hatten mehr Punkte oder früher Interesse bekundet. Du stehst auf der Warteliste und rückst nach, wenn jemand storniert.</p>
          <h4>Warum kann ich nicht buchen?</h4>
          <ul>
            <li>Die Fahrt ist noch in der Vorrang-Phase und du bist (noch) kein Mitglied.</li>
            <li>Du hast die Fahrt schon gebucht, sie ist abgefahren oder abgesagt.</li>
            {!s.guestsMayBook && <li>Buchungen sind bei uns nur für Mitglieder möglich.</li>}
            {!s.waitlistEnabled && <li>Der Bus ist voll und es gibt keine Warteliste.</li>}
          </ul>
          <h4>Die Seite bleibt leer oder zeigt eine alte Version</h4>
          <p>Lade die Seite neu (am Computer Strg+Shift+R). Hilft das nicht, tippe auf der Fehlerseite auf „Zwischenspeicher der App leeren“. Die App aktualisiert sich meistens beim nächsten Öffnen von selbst.</p>
          <h4>Ich bekomme keine E-Mails</h4>
          <p>Schau im Spam-Ordner nach und prüfe im Profil, ob E-Mails eingeschaltet sind.</p>
          <p>Weiß dann niemand weiter, wende dich an einen Admin deines Vereins.</p>
          <p className="muted"><Link to="/login">Zur Anmeldung</Link></p>
        </>
      ),
    },
  ];
}

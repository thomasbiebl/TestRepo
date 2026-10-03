import { resetLocalDataAndReload, resetOfflineCacheAndReload } from '../lib/recovery';

export function RecoveryButtons() {
  return (
    <div className="stack">
      <button className="btn" onClick={() => window.location.reload()}>Seite neu laden</button>
      <button className="btn ghost" onClick={() => void resetOfflineCacheAndReload()}>Zwischenspeicher der App leeren</button>
      <button className="btn ghost" onClick={() => resetLocalDataAndReload()}>Gespeicherte Daten in diesem Browser löschen</button>
    </div>
  );
}

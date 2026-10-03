import { useEffect, useState } from 'react';
import { RecoveryButtons } from './RecoveryButtons';

/** "Lädt …", and a way out when it takes suspiciously long. */
export function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="auth">
      <div className="auth-box">
        <p className="loading">Lädt …</p>
        {slow && (
          <>
            <p className="muted center">Das dauert ungewöhnlich lange. Prüfe deine Internetverbindung oder probiere:</p>
            <RecoveryButtons />
          </>
        )}
      </div>
    </div>
  );
}

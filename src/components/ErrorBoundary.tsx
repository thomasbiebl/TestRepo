import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RecoveryButtons } from './RecoveryButtons';

/** Shows what went wrong instead of an empty page, and offers ways to recover. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="auth">
        <div className="auth-box">
          <h1 className="title">Da ist etwas schiefgelaufen</h1>
          <p className="muted">Die Seite konnte nicht angezeigt werden. Probiere die Buttons von oben nach unten. Hilft nichts, schick bitte den grauen Text unten an den Admin oder Entwickler.</p>
          <RecoveryButtons />
          <pre className="errortext">{`${error.name}: ${error.message}\n${(error.stack ?? '').split('\n').slice(1, 6).join('\n')}\n\n${navigator.userAgent}\n${window.location.href}`}</pre>
        </div>
      </div>
    );
  }
}

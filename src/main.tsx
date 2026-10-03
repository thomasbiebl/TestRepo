import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider } from './state/AppContext';
import { ThemeProvider } from './themes/ThemeProvider';
import './themes/nacht.css';
import './themes/klassisch.css';
import './themes/clean.css';
import './themes/ticket.css';
import './styles.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <HashRouter>
          <AppProvider>
            <App />
          </AppProvider>
        </HashRouter>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);

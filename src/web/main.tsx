import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppProvider } from './AppContext';
import { readStoredLang } from './i18n/i18n';
import { createConnection } from './net/connection';
import { parseOfficeParams } from './params';
import { initialState, type AppState } from './store/appState';
import { createStore } from './store/store';
import './styles/tokens.css';
import './styles/app.css';

const store = createStore<AppState>(initialState(readStoredLang()));
const connection = createConnection({ store });
const params = parseOfficeParams(window.location.search);

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing');

createRoot(container).render(
  <StrictMode>
    <AppProvider services={{ store, connection }}>
      <App params={params} />
    </AppProvider>
  </StrictMode>,
);

connection.start();

/** The diary's entry point: the styles, the shared state, the app. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DiaryProvider } from './state/DiaryContext.jsx';
import App from './App.jsx';
import './styles/base.css';
import './styles/theme.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DiaryProvider>
      <App />
    </DiaryProvider>
  </StrictMode>,
);

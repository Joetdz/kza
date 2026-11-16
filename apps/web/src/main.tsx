import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
// Inter, self-hosted: the same face on every device, with no network.
import '@fontsource-variable/inter';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

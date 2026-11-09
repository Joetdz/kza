import React from 'react';
import ReactDOM from 'react-dom/client';
import { configureLinks } from '@web/lib/links';
import { App } from './App';
import './index.css';

// The borrowed storefront pages link to Ikele's own addresses (see App).
configureLinks({
  store: slug => `#/@${slug}`,
  reel: (slug, reelId) => `#/@${slug}/reels/${reelId}`,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

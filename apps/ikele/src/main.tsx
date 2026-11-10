import React from 'react';
import ReactDOM from 'react-dom/client';
import { configureLinks } from '@web/lib/links';
import { setPlatformPixel } from '@web/pages/PublicStore';
import { recordVisit } from './api';
import { App } from './App';
import './index.css';

// The borrowed storefront pages link to Ikele's own addresses (see App).
configureLinks({
  store: slug => `#/@${slug}`,
  reel: (slug, reelId) => `#/@${slug}/reels/${reelId}`,
});

// Ikele's Facebook pixel, loaded by index.html: it also gets the orders (see QuickOrder),
// and a page view for each screen, the app changing screens without loading a page.
const IKELE_PIXEL_ID = '1841775693938315';
setPlatformPixel(IKELE_PIXEL_ID);
window.addEventListener('hashchange', () => {
  (window as any).fbq?.('trackSingle', IKELE_PIXEL_ID, 'PageView');
});

// One visit counted per device and day (see the visitor counter in Kzion's admin).
recordVisit();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

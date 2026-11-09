import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CustomerAccount } from '@web/pages/CustomerAccount';
import { TabBar, type Tab } from './components/TabBar';
import { ForYou } from './pages/ForYou';
import { Stores } from './pages/Stores';
import { SearchPage } from './pages/SearchPage';
import { StoreProfile } from './pages/StoreProfile';
import { StoreReels } from './pages/StoreReels';

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

function tabOf(path: string): Tab | null {
  if (path.startsWith('/compte')) return 'account';
  if (path.startsWith('/boutiques')) return 'stores';
  if (path.startsWith('/recherche')) return 'search';
  if (path === '' || path === '/') return 'feed';
  return null;
}

/**
 * Ikele's addresses:
 *   #/                         « Pour toi », the feed of every store
 *   #/boutiques, #/recherche   the store list, the search
 *   #/compte                   the customer's account
 *   #/@slug?commander=:id      a store's profile, the order form of that product open
 *   #/@slug/reels/:id          its reels, opened on that one
 * There is no catalogue page: « Commander » opens the order form over the screen.
 *
 * A tab, once opened, stays mounted and only hides: coming back finds it as it was left
 * (the reel watched, the list scrolled, the search typed), never loading again.
 */
export function App() {
  const hash = useHash();
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);

  const tab = tabOf(path);
  const lastTab = useRef<Tab>('feed');
  const openedTabs = useRef(new Set<Tab>());
  if (tab) {
    lastTab.current = tab;
    openedTabs.current.add(tab);
  }
  // A link to sign up (« Créer mon compte » after an order) starts the account page afresh,
  // with the number and name it carries.
  const accountKey = useRef('');
  if (tab === 'account' && params.has('mode')) accountKey.current = query;

  // Each screen gets back its own scroll position: they all share the window's.
  const scrolls = useRef(new Map<string, number>());
  const screen = useRef(path);
  useEffect(() => {
    const onScroll = () => scrolls.current.set(screen.current, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    screen.current = path;
    window.scrollTo(0, scrolls.current.get(path) ?? 0);
  }, [path]);

  // Store links shared from Kzion before Ikele existed.
  const legacy = /^\/boutique\/([^/]+)(?:\/reel\/([^/]+))?/.exec(path);
  if (legacy) {
    window.location.replace(legacy[2] ? `#/@${legacy[1]}/reels/${legacy[2]}` : `#/@${legacy[1]}`);
    return null;
  }

  let page: JSX.Element | null = null;
  const store = /^\/@([^/]+)(?:\/(reels|boutique)(?:\/([^/]+))?)?/.exec(path);
  if (store) {
    const [, slug, section, reelId] = store;
    if (section === 'reels' && reelId) {
      page = <StoreReels key={`${slug}-${reelId}`} slug={slug} reelId={reelId} />;
    } else if (section) {
      // The catalogue it once had: links already shared land on the profile.
      const product = params.get('ajouter');
      window.location.replace(`#/@${slug}${product ? `?commander=${product}` : ''}`);
      return null;
    } else {
      page = <StoreProfile key={slug} slug={slug} orderProductId={params.get('commander') ?? undefined} />;
    }
  } else if (!tab) {
    window.location.replace('#/');
    return null;
  }

  const opened = (t: Tab) => openedTabs.current.has(t);
  return (
    <>
      {opened('feed') && <div hidden={tab !== 'feed'}><ForYou active={tab === 'feed'} /></div>}
      {opened('stores') && <div hidden={tab !== 'stores'}><Stores /></div>}
      {opened('search') && <div hidden={tab !== 'search'}><SearchPage /></div>}
      {opened('account') && (
        <div hidden={tab !== 'account'} className="pb-tabbar bg-gray-50 min-h-screen">
          <CustomerAccount key={accountKey.current} />
        </div>
      )}
      {page}
      {/* On a store's pages, the tab they were opened from stays lit. */}
      <TabBar active={tab ?? lastTab.current} />
    </>
  );
}

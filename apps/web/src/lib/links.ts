// Where the storefront pages live. The same pages (store, account) run in Kzion and in
// Ikele, which uses its own addresses: Ikele calls configureLinks once at start-up.
export const links = {
  store: (slug: string) => `#/boutique/${slug}`,
  reel: (slug: string, reelId: string) => `#/boutique/${slug}/reel/${reelId}`,
  account: (slug?: string | null) => `#/compte${slug ? `?boutique=${encodeURIComponent(slug)}` : ''}`,
};

export function configureLinks(next: Partial<typeof links>) {
  Object.assign(links, next);
}

/** A full address to share (WhatsApp, copy), from one of the links above. */
export const shareUrl = (hashLink: string) => `${window.location.origin}${window.location.pathname}${hashLink}`;

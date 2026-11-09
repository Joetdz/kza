import { Package } from 'lucide-react';
import type { Media } from '../api';

/**
 * A still for a reel or a product in a grid: its thumbnail when it has one, the image
 * itself, or else the video's first frame (only its first bytes are loaded).
 */
export function MediaThumb({ media, alt = '' }: { media: Media | null; alt?: string }) {
  if (!media) {
    return <div className="w-full h-full bg-neutral-900 flex items-center justify-center"><Package size={22} className="text-white/20" /></div>;
  }
  if (media.thumbnailUrl || media.type !== 'video') {
    return <img src={media.thumbnailUrl ?? media.url} alt={alt} loading="lazy" className="w-full h-full object-cover" />;
  }
  return <video src={`${media.url}#t=0.5`} preload="metadata" muted playsInline className="w-full h-full object-cover" />;
}

/** The store's logo, or its initial on its colour. */
export function StoreAvatar({ store, size }: { store: { name: string; logoUrl: string | null; primaryColor: string }; size: number }) {
  return (
    <span className="rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white font-black"
      style={{ width: size, height: size, background: store.primaryColor, fontSize: size * 0.4 }}>
      {store.logoUrl ? <img src={store.logoUrl} alt="" className="w-full h-full object-cover" /> : store.name.charAt(0).toUpperCase()}
    </span>
  );
}

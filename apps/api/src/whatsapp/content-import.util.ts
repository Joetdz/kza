// Lightweight, dependency-free page fetcher used to seed the knowledge base from a
// business's own website/Facebook/Instagram URL. No HTML parser is installed in this
// repo, so this uses small regexes rather than pulling in a new dependency.
//
// Important limitation: Facebook and Instagram serve almost nothing to an
// unauthenticated fetch beyond the Open Graph meta tags (title/description) — full
// post history requires the Graph API with an OAuth-granted page token, which this
// does not attempt. Callers should treat a thin result from those two kinds as
// expected, not a bug.

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ',
};

function decodeEntities(input?: string | null): string | undefined {
  if (!input) return undefined;
  return input
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z0-9]+);/gi, (m, code) => {
      if (code[0] === '#') {
        const num = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(num) ? String.fromCodePoint(num) : m;
      }
      return ENTITIES[code.toLowerCase()] ?? m;
    })
    .trim();
}

function matchMeta(html: string, prop: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const found = html.match(re)?.[1];
    if (found) return found;
  }
  return undefined;
}

function stripToText(html: string, maxLen = 8000): string | undefined {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const source = bodyMatch ? bodyMatch[1] : html;
  const text = source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map(l => decodeEntities(l.trim()) ?? '')
    .filter(l => l.length > 1)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text ? text.slice(0, maxLen) : undefined;
}

export interface PageSummary {
  title?: string;
  description?: string;
  text?: string;
}

export async function fetchPageSummary(url: string): Promise<PageSummary | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        // A plain fetch() UA gets stonewalled by some sites; a browser-shaped one
        // gets the same public HTML a link-preview crawler would.
        'User-Agent': 'Mozilla/5.0 (compatible; KZA-KnowledgeImport/1.0; +https://kza.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const title = decodeEntities(matchMeta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]);
    const description = decodeEntities(matchMeta(html, 'og:description') ?? matchMeta(html, 'description'));
    const text = stripToText(html);

    return { title, description, text };
  } catch {
    return null;
  }
}

// Splits long page text into KB-sized chunks on paragraph boundaries so no single
// entry becomes unreadably long in the prompt.
export function chunkText(text: string, maxLen = 1500): string[] {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length > maxLen && current) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(0, 20); // hard cap so one page can't flood the KB
}

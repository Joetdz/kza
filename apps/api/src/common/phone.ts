/**
 * Reduce any spelling of a phone number to one comparable key.
 *
 * The same customer reaches us three different ways: "+243890635526" on a draft built
 * from WhatsApp, "0890635526" typed into the logistics form, "890635526" from the
 * storefront. Grouping on the raw column would count them as three people, so every
 * comparison goes through this instead.
 *
 * Returns null for anything that can't be a real number (empty, or a WhatsApp LID,
 * which is far longer than any phone number).
 */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw
    .replace(/@c\.us$/, '')
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@lid$/, '')
    .replace(/\D/g, '');

  if (!digits) return null;
  if (digits.length > 15) return null; // LID or garbage — never a phone number

  // DRC numbers are 243 + 9 subscriber digits, often written locally as 0 + 9 digits.
  if (digits.length === 12 && digits.startsWith('243')) return digits.slice(3);
  if (digits.length === 10 && digits.startsWith('0')) return digits.slice(1);

  return digits;
}

/** True when both spellings point at the same subscriber. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a);
  return !!ka && ka === phoneKey(b);
}

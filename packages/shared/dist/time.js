"use strict";
// ─── Local time per business ─────────────────────────────────────────────────
// Appointments are stored in UTC but always shown, offered and reasoned about in the
// business's own local time — derived from its country. None of these zones observe
// daylight saving, but the conversions below handle it anyway via Intl.
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTRY_INFO = void 0;
exports.timeZoneForCountry = timeZoneForCountry;
exports.localToUtc = localToUtc;
exports.utcToLocal = utcToLocal;
exports.timeToMinutes = timeToMinutes;
exports.minutesToTime = minutesToTime;
exports.addDays = addDays;
exports.toInternationalPhone = toInternationalPhone;
exports.COUNTRY_INFO = {
    CD: { timeZone: 'Africa/Kinshasa', dialCode: '243' },
    CG: { timeZone: 'Africa/Brazzaville', dialCode: '242' },
    CM: { timeZone: 'Africa/Douala', dialCode: '237' },
    CI: { timeZone: 'Africa/Abidjan', dialCode: '225' },
    SN: { timeZone: 'Africa/Dakar', dialCode: '221' },
    ML: { timeZone: 'Africa/Bamako', dialCode: '223' },
    BF: { timeZone: 'Africa/Ouagadougou', dialCode: '226' },
    NE: { timeZone: 'Africa/Niamey', dialCode: '227' },
    TG: { timeZone: 'Africa/Lome', dialCode: '228' },
    BJ: { timeZone: 'Africa/Porto-Novo', dialCode: '229' },
    GA: { timeZone: 'Africa/Libreville', dialCode: '241' },
    GN: { timeZone: 'Africa/Conakry', dialCode: '224' },
    RW: { timeZone: 'Africa/Kigali', dialCode: '250' },
    BI: { timeZone: 'Africa/Bujumbura', dialCode: '257' },
    TZ: { timeZone: 'Africa/Dar_es_Salaam', dialCode: '255' },
    UG: { timeZone: 'Africa/Kampala', dialCode: '256' },
    MG: { timeZone: 'Indian/Antananarivo', dialCode: '261' },
    MR: { timeZone: 'Africa/Nouakchott', dialCode: '222' },
    MA: { timeZone: 'Africa/Casablanca', dialCode: '212' },
    DZ: { timeZone: 'Africa/Algiers', dialCode: '213' },
    TN: { timeZone: 'Africa/Tunis', dialCode: '216' },
};
function timeZoneForCountry(country) {
    return exports.COUNTRY_INFO[country ?? '']?.timeZone ?? 'Africa/Kinshasa';
}
/** Minutes the zone is ahead of UTC at that instant. */
function offsetMinutes(at, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at);
    const get = (type) => Number(parts.find(p => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - at.getTime()) / 60000);
}
/** "2026-10-28" + "14:30" in the business's zone → the UTC instant. */
function localToUtc(date, time, timeZone) {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, hh, mm);
    return new Date(guess - offsetMinutes(new Date(guess), timeZone) * 60000);
}
/** A UTC instant → its local date ("2026-10-28"), time ("14:30") and weekday (0 = Sunday). */
function utcToLocal(at, timeZone) {
    const local = new Date(at.getTime() + offsetMinutes(at, timeZone) * 60000);
    const iso = local.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16), weekday: local.getUTCDay() };
}
/** "14:30" → 870 */
function timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
}
/** 870 → "14:30" */
function minutesToTime(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
/** "2026-10-28" + n days */
function addDays(date, days) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
/**
 * Any spelling of a customer's number → international digits for WhatsApp:
 * "0812345678" / "+243 81 234 5678" / "243812345678@c.us" → "243812345678".
 * null for a WhatsApp LID or garbage — never a dialable number.
 */
function toInternationalPhone(raw, country) {
    const digits = raw.replace(/@.*$/, '').replace(/\D/g, '');
    if (!digits || digits.length > 13)
        return null;
    const dial = exports.COUNTRY_INFO[country]?.dialCode ?? '';
    if (dial && digits.startsWith(dial))
        return digits;
    if (dial && digits.startsWith('0'))
        return dial + digits.slice(1);
    if (dial && digits.length <= 9)
        return dial + digits;
    return digits;
}

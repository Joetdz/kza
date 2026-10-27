export declare const COUNTRY_INFO: Record<string, {
    timeZone: string;
    dialCode: string;
}>;
export declare function timeZoneForCountry(country: string | null | undefined): string;
/** "2026-10-28" + "14:30" in the business's zone → the UTC instant. */
export declare function localToUtc(date: string, time: string, timeZone: string): Date;
/** A UTC instant → its local date ("2026-10-28"), time ("14:30") and weekday (0 = Sunday). */
export declare function utcToLocal(at: Date, timeZone: string): {
    date: string;
    time: string;
    weekday: number;
};
/** "14:30" → 870 */
export declare function timeToMinutes(time: string): number;
/** 870 → "14:30" */
export declare function minutesToTime(minutes: number): string;
/** "2026-10-28" + n days */
export declare function addDays(date: string, days: number): string;

// Opening-hours logic. Pure and timezone-safe: everything is evaluated in Europe/Stockholm.

export type Season = "vinter" | "sommar";

type Hours = { open: number; close: number };

/** Index 0 = Sunday … 6 = Saturday. Hours as whole hours (plan §10). */
const HOURS: Record<Season, Record<number, Hours>> = {
  vinter: {
    0: { open: 12, close: 21 },
    1: { open: 11, close: 21 },
    2: { open: 11, close: 21 },
    3: { open: 11, close: 21 },
    4: { open: 11, close: 21 },
    5: { open: 11, close: 22 },
    6: { open: 12, close: 22 },
  },
  sommar: {
    0: { open: 12, close: 22 },
    1: { open: 11, close: 22 },
    2: { open: 11, close: 22 },
    3: { open: 11, close: 22 },
    4: { open: 11, close: 22 },
    5: { open: 11, close: 22 },
    6: { open: 12, close: 22 },
  },
};

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Stockholm",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function stockholmNow(date: Date): { weekday: number; minutes: number } {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    weekday: WEEKDAYS[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export const formatMinutes = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export type OpenStatus = { isOpen: boolean; label: string };

export function getOpenStatus(date: Date, season: Season): OpenStatus {
  const { weekday, minutes } = stockholmNow(date);
  const today = HOURS[season][weekday];
  const open = today.open * 60;
  const close = today.close * 60;

  if (minutes >= open && minutes < close) {
    return { isOpen: true, label: `Öppet nu · stänger ${formatMinutes(close)}` };
  }
  if (minutes < open) {
    return { isOpen: false, label: `Stängt · öppnar ${formatMinutes(open)}` };
  }
  const tomorrow = HOURS[season][(weekday + 1) % 7];
  return { isOpen: false, label: `Stängt · öppnar imorgon ${formatMinutes(tomorrow.open * 60)}` };
}

export type SlotOptions = {
  prepMinutes: number;
  lastBeforeClose: number;
  step: number;
};

/** Pickup times (HH:MM) still available today. Empty once the kitchen can no longer serve today. */
export function getPickupSlots(date: Date, season: Season, opts: SlotOptions): string[] {
  const { weekday, minutes } = stockholmNow(date);
  const today = HOURS[season][weekday];
  const earliest = Math.max(minutes + opts.prepMinutes, today.open * 60);
  const first = Math.ceil(earliest / opts.step) * opts.step;
  const last = today.close * 60 - opts.lastBeforeClose;

  const slots: string[] = [];
  for (let m = first; m <= last; m += opts.step) slots.push(formatMinutes(m));
  return slots;
}

export type PickupRules = SlotOptions & {
  /** Slack for clock drift between the browser that picked the slot and the server, in minutes. */
  graceMinutes: number;
  maxAheadHours: number;
};

/** Server-side check of a requested pickup time. The browser's idea of "available" is never trusted. */
export function isValidPickupTime(pickup: Date, now: Date, season: Season, rules: PickupRules): boolean {
  const lead = pickup.getTime() - now.getTime();
  if (Number.isNaN(lead)) return false;
  if (lead < (rules.prepMinutes - rules.graceMinutes) * 60_000) return false;
  if (lead > rules.maxAheadHours * 3_600_000) return false;
  if (pickup.getUTCSeconds() !== 0 || pickup.getUTCMilliseconds() !== 0) return false;

  const { weekday, minutes } = stockholmNow(pickup);
  if (minutes % rules.step !== 0) return false;
  const day = HOURS[season][weekday];
  return minutes >= day.open * 60 && minutes <= day.close * 60 - rules.lastBeforeClose;
}

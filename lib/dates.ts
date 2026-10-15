export type ISODate = string;
export type TimeString = string;

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toISODate(d);
}

export const startOfMonth = (s: ISODate): ISODate => `${s.slice(0, 7)}-01`;

export function startOfWeek(s: ISODate): ISODate {
  const dow = (parseISODate(s).getDay() + 6) % 7;
  return addDays(s, -dow);
}

export function getWeekDates(s: ISODate): ISODate[] {
  const start = startOfWeek(s);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getMonthGrid(s: ISODate): ISODate[] {
  const start = startOfWeek(startOfMonth(s));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const isSameMonth = (a: ISODate, b: ISODate) => a.slice(0, 7) === b.slice(0, 7);
export const getDayOfWeek = (s: ISODate) => parseISODate(s).getDay();
export const getDayOfMonth = (s: ISODate) => parseISODate(s).getDate();

export function timeToMinutes(t: TimeString): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): TimeString {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

export function combineLocal(date: ISODate, time: TimeString): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function combineReservationTimes(date: ISODate, startTime: TimeString, endTime: TimeString) {
  const startAt = combineLocal(date, startTime);
  const endDate = timeToMinutes(endTime) <= timeToMinutes(startTime) ? addDays(date, 1) : date;
  return { startAt, endAt: combineLocal(endDate, endTime) };
}

export function reservationEndDate(date: ISODate, startTime: TimeString, endTime: TimeString): ISODate {
  return timeToMinutes(endTime) <= timeToMinutes(startTime) ? addDays(date, 1) : date;
}

export function splitLocal(dt: Date): { date: ISODate; time: TimeString } {
  return { date: toISODate(dt), time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}` };
}

export type CalendarViewMode = "day" | "week" | "month";
export type DateRange = { from: ISODate; to: ISODate };

export function getVisibleRange(view: CalendarViewMode, date: ISODate): DateRange {
  if (view === "day") return { from: date, to: date };
  if (view === "week") {
    const w = getWeekDates(date);
    return { from: w[0], to: w[6] };
  }
  const g = getMonthGrid(date);
  return { from: g[0], to: g[g.length - 1] };
}

export function shiftDate(view: CalendarViewMode, date: ISODate, dir: 1 | -1): ISODate {
  if (view === "day") return addDays(date, dir);
  if (view === "week") return addDays(date, 7 * dir);
  return addMonths(date, dir);
}

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", o).format(d);

export const formatLong = (s: ISODate) =>
  fmt(parseISODate(s), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const formatShort = (s: ISODate) =>
  fmt(parseISODate(s), { weekday: "short", day: "numeric", month: "short" });
export const formatMonthYear = (s: ISODate) =>
  fmt(parseISODate(s), { month: "long", year: "numeric" });
export const formatWeekdayShort = (s: ISODate) => fmt(parseISODate(s), { weekday: "short" });

export function formatRangeLabel(view: CalendarViewMode, date: ISODate): string {
  if (view === "day") return formatLong(date);
  if (view === "month") return formatMonthYear(date);
  const w = getWeekDates(date);
  const a = parseISODate(w[0]);
  const b = parseISODate(w[6]);
  if (a.getFullYear() !== b.getFullYear()) {
    const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
    return `${fmt(a, o)} – ${fmt(b, o)}`;
  }
  if (a.getMonth() !== b.getMonth()) {
    const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${fmt(a, o)} – ${fmt(b, o)} ${b.getFullYear()}`;
  }
  return `${a.getDate()}–${fmt(b, { day: "numeric", month: "long" })} ${b.getFullYear()}`;
}

export function formatDateTime(dt: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

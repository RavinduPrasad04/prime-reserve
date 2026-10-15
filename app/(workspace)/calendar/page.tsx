"use client";

/**
 * Prime Reserve — Calendar page (single file).
 *
 * Availability rules in this file are client-side previews. Server actions re-validate
 * conflicts, ownership, and intervals against PostgreSQL.
 */

import {
    cancelReservationAction,
    createReservationAction,
    listReservationsAction,
    updateReservationAction,
} from "@/app/actions/reservations";
import { listBookingRestrictionsAction } from "@/app/actions/booking-settings";
import { listResourcesAction } from "@/app/actions/resources";
import type {
    BookingBlockView,
    BookingSettingsView,
    Reservation as PersistedReservation,
    Resource as PersistedResource,
    ServiceResult as PersistedResult,
} from "@/lib/domain";
import { TIME_OPTIONS } from "@/lib/time-options";
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type FormEvent,
    type ReactNode,
} from "react";

/* ========================================================================== */
/* TYPES                                                                      */
/* ========================================================================== */

/** Calendar feature types. Dates/times are plain local strings so they map 1:1 to API fields. */

type ISODate = string; // "YYYY-MM-DD"
type TimeString = string; // "HH:mm" (24h)

type ResourceType = "Room" | "Studio" | "Equipment" | "Vehicle";
type ResourceColor =
    | "sky"
    | "violet"
    | "teal"
    | "fuchsia"
    | "cyan"
    | "lime"
    | "rose";
type ResourceStatus = "available" | "maintenance";

type Resource = {
    id: string;
    name: string;
    type: ResourceType;
    location: string;
    capacity: number;
    color: ResourceColor;
    status: ResourceStatus;
    /** Bookable window, in the resource's local time. */
    openTime: TimeString;
    closeTime: TimeString;
    /** 0 = Sunday … 6 = Saturday */
    openDays: number[];
    requiresApproval: boolean;
    maxDurationMinutes: number;
};

type ReservationStatus = "confirmed" | "pending" | "cancelled";

type Reservation = {
    id: string;
    resourceId: string;
    title: string;
    date: ISODate;
    startTime: TimeString;
    endTime: TimeString;
    status: ReservationStatus;
    bookedBy: string;
    userId?: string;
    attendees: number;
    notes?: string;
    createdAt: string;
};

/** What the form submits (create + edit). */
type ReservationInput = {
    resourceId: string;
    title: string;
    date: ISODate;
    startTime: TimeString;
    endTime: TimeString;
    attendees: number;
    notes: string;
};

type CalendarViewMode = "day" | "week" | "month";

type DateRange = { from: ISODate; to: ISODate };

type FieldErrors = Partial<Record<keyof ReservationInput | "form", string>>;

type ServiceError = {
    code: "VALIDATION" | "CONFLICT" | "NOT_FOUND" | "UNKNOWN" | "UNAUTHORIZED" | "FORBIDDEN";
    message: string;
    fields?: FieldErrors;
};

type ServiceResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: ServiceError };

/* ========================================================================== */
/* DATE HELPERS                                                               */
/* ========================================================================== */

const pad = (n: number) => String(n).padStart(2, "0");

function toISODate(d: Date): ISODate {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISODate(s: ISODate): Date {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function isValidISODate(s: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return toISODate(parseISODate(s)) === s;
}

function addDays(s: ISODate, n: number): ISODate {
    const d = parseISODate(s);
    d.setDate(d.getDate() + n);
    return toISODate(d);
}

function addMonths(s: ISODate, n: number): ISODate {
    const d = parseISODate(s);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return toISODate(d);
}

const startOfMonth = (s: ISODate): ISODate => `${s.slice(0, 7)}-01`;

/** Weeks start on Monday. */
function startOfWeek(s: ISODate): ISODate {
    const dow = (parseISODate(s).getDay() + 6) % 7;
    return addDays(s, -dow);
}

function getWeekDates(s: ISODate): ISODate[] {
    const start = startOfWeek(s);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 6 full weeks covering the month, Monday first. */
function getMonthGrid(s: ISODate): ISODate[] {
    const start = startOfWeek(startOfMonth(s));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const isSameMonth = (a: ISODate, b: ISODate) => a.slice(0, 7) === b.slice(0, 7);
const getDayOfWeek = (s: ISODate) => parseISODate(s).getDay();
const getDayOfMonth = (s: ISODate) => parseISODate(s).getDate();

function timeToMinutes(t: TimeString): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function minutesToTime(mins: number): TimeString {
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

function formatDuration(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    return h ? `${h}h` : `${m}m`;
}

function getVisibleRange(view: CalendarViewMode, date: ISODate): DateRange {
    if (view === "day") return { from: date, to: date };
    if (view === "week") {
        const w = getWeekDates(date);
        return { from: w[0], to: w[6] };
    }
    const g = getMonthGrid(date);
    return { from: g[0], to: g[g.length - 1] };
}

function shiftDate(view: CalendarViewMode, date: ISODate, dir: 1 | -1): ISODate {
    if (view === "day") return addDays(date, dir);
    if (view === "week") return addDays(date, 7 * dir);
    return addMonths(date, dir);
}

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", o).format(d);

const formatLong = (s: ISODate) =>
    fmt(parseISODate(s), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const formatShort = (s: ISODate) =>
    fmt(parseISODate(s), { weekday: "short", day: "numeric", month: "short" });
const formatMonthYear = (s: ISODate) =>
    fmt(parseISODate(s), { month: "long", year: "numeric" });
const formatWeekdayShort = (s: ISODate) => fmt(parseISODate(s), { weekday: "short" });

/* ========================================================================== */
/* OVERLAP LAYOUT HELPER                                                      */
/* ========================================================================== */

type Span = { id: string; startMin: number; endMin: number };

/**
 * Lays out overlapping spans side by side. Returns, per id, the column index and
 * the number of columns in its overlap cluster.
 */
function layoutOverlaps(spans: Span[]): Map<string, { col: number; cols: number }> {
    const result = new Map<string, { col: number; cols: number }>();
    const sorted = [...spans].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

    let cluster: { id: string; col: number }[] = [];
    let colEnds: number[] = [];
    let clusterEnd = -1;

    const flush = () => {
        for (const item of cluster) result.set(item.id, { col: item.col, cols: colEnds.length });
        cluster = [];
        colEnds = [];
        clusterEnd = -1;
    };

    for (const span of sorted) {
        if (cluster.length && span.startMin >= clusterEnd) flush();
        let col = colEnds.findIndex((end) => end <= span.startMin);
        if (col === -1) {
            col = colEnds.length;
            colEnds.push(span.endMin);
        } else {
            colEnds[col] = span.endMin;
        }
        cluster.push({ id: span.id, col });
        clusterEnd = Math.max(clusterEnd, span.endMin);
    }
    flush();
    return result;
}

/* ========================================================================== */
/* STYLE TOKENS (resource colours, status styles)                             */
/* ========================================================================== */

/** Resource identity colours. Full class names so Tailwind can see them. */
const RESOURCE_COLORS: Record<
    ResourceColor,
    { dot: string; card: string; border: string; text: string }
> = {
    sky: { dot: "bg-sky-500", card: "bg-sky-50 hover:bg-sky-100", border: "border-sky-200 border-l-sky-500", text: "text-sky-900" },
    violet: { dot: "bg-violet-500", card: "bg-violet-50 hover:bg-violet-100", border: "border-violet-200 border-l-violet-500", text: "text-violet-900" },
    teal: { dot: "bg-teal-500", card: "bg-teal-50 hover:bg-teal-100", border: "border-teal-200 border-l-teal-500", text: "text-teal-900" },
    fuchsia: { dot: "bg-fuchsia-500", card: "bg-fuchsia-50 hover:bg-fuchsia-100", border: "border-fuchsia-200 border-l-fuchsia-500", text: "text-fuchsia-900" },
    cyan: { dot: "bg-cyan-500", card: "bg-cyan-50 hover:bg-cyan-100", border: "border-cyan-200 border-l-cyan-500", text: "text-cyan-900" },
    lime: { dot: "bg-lime-500", card: "bg-lime-50 hover:bg-lime-100", border: "border-lime-300 border-l-lime-500", text: "text-lime-900" },
    rose: { dot: "bg-rose-500", card: "bg-rose-50 hover:bg-rose-100", border: "border-rose-200 border-l-rose-500", text: "text-rose-900" },
};

import {
    CircleCheck,
    Clock,
    CircleX,
    type LucideIcon,
    TriangleAlert,
    CalendarDays,
    UserRound,
    Users,
    Box,
    Pencil,
    Plus,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Check,
    X,
} from "lucide-react";

const STATUS_META: Record<
    ReservationStatus,
    {
        label: string;
        icon: LucideIcon;
        iconClass: string;
        chip: string;
    }
> = {
    confirmed: {
        label: "Confirmed",
        icon: CircleCheck,
        iconClass: "text-emerald-600",
        chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    },
    pending: {
        label: "Pending approval",
        icon: Clock,
        iconClass: "text-amber-600",
        chip: "bg-amber-50 text-amber-700 ring-amber-200",
    },
    cancelled: {
        label: "Cancelled",
        icon: CircleX,
        iconClass: "text-zinc-500",
        chip: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    },
};

/** Diagonal stripes used to mark tentative (pending) reservations. */
const PENDING_STRIPES =
    "repeating-linear-gradient(135deg, rgba(255,255,255,0.7) 0 6px, transparent 6px 12px)";

/** Diagonal hatch used to mark slots that can't be booked. */
const UNAVAILABLE_HATCH =
    "repeating-linear-gradient(135deg, transparent 0 6px, rgba(161,161,170,0.28) 6px 7px)";

/* ========================================================================== */
/* AVAILABILITY + VALIDATION RULES                                            */
/* ========================================================================== */

/**
 * Availability + validation rules.
 *
 * IMPORTANT (mock vs production):
 * These are PURE functions used in two places:
 *   1. In the UI, for instant feedback (greyed-out slots, form errors, conflict preview).
 *   2. In `services/calendarService.ts`, which today stands in for the server.
 *
 * Client-side checks are a convenience only. A real backend MUST re-validate every
 * create/update (conflicts, opening hours, permissions, approval rules) inside a
 * transaction/constraint, because two people can book the same slot at the same time
 * and the browser's data may be stale.
 */

const GRID_START_MIN = 0;
const GRID_END_MIN = 24 * 60;
const SLOT_MIN = 15;
const GRID_SLOT_MIN = 15;
const DEFAULT_DURATION_MIN = 60;

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

type BlockReason = "past" | "maintenance" | "closed" | "outside-hours" | "booked" | "admin-blocked" | "weekend" | "duration";

const BLOCK_REASON_LABEL: Record<BlockReason, string> = {
    past: "This time has passed",
    maintenance: "Resource under maintenance",
    closed: "Resource is closed this day",
    "outside-hours": "Outside opening hours",
    booked: "Already reserved",
    "admin-blocked": "Blocked by an administrator",
    weekend: "Weekend bookings are restricted",
    duration: "Exceeds the maximum booking duration",
};

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
    aStart < bEnd && bStart < aEnd;

function isInPast(date: ISODate, startMin: number, now: Date): boolean {
    const today = toISODate(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return date < today || (date === today && startMin < nowMin);
}

function isReservationEnded(r: Reservation, now: Date): boolean {
    const endDate = timeToMinutes(r.endTime) <= timeToMinutes(r.startTime) ? addDays(r.date, 1) : r.date;
    return isInPast(endDate, timeToMinutes(r.endTime) - 1, now);
}

/** Active (non-cancelled) reservations on the same resource and date that overlap the window. */
function findConflicts(
    reservations: Reservation[],
    resourceId: string,
    date: ISODate,
    startMin: number,
    endMin: number,
    ignoreId?: string,
): Reservation[] {
    return reservations.filter((r) => {
        if (r.id === ignoreId || r.status === "cancelled" || r.resourceId !== resourceId) return false;
        const dayOffset = Math.round((parseISODate(r.date).getTime() - parseISODate(date).getTime()) / 86_400_000);
        const reservationStart = dayOffset * 1440 + timeToMinutes(r.startTime);
        const endTime = timeToMinutes(r.endTime);
        const reservationEnd = dayOffset * 1440 + (endTime <= timeToMinutes(r.startTime) ? endTime + 1440 : endTime);
        return overlaps(startMin, endMin, reservationStart, reservationEnd);
    });
}

/** Why a window can't be booked, or null if it is free. */
function getBlockReason(
    resource: Resource,
    date: ISODate,
    startMin: number,
    endMin: number,
    reservations: Reservation[],
    now: Date,
    ignoreId?: string,
    rules?: { bookingBlocks?: BookingBlockView[]; settings?: BookingSettingsView },
): BlockReason | null {
    if (isInPast(date, startMin, now)) return "past";
    if (resource.status === "maintenance") return "maintenance";
    if (endMin - startMin > resource.maxDurationMinutes) return "duration";
    const endDate = endMin > 1440 ? addDays(date, 1) : date;
    const bookingDays = endDate === date ? [date] : [date, endDate];
    if (bookingDays.some((bookingDay) => !resource.openDays.includes(getDayOfWeek(bookingDay)))) return "closed";
    if (bookingDays.some((bookingDay) => {
        const weekday = getDayOfWeek(bookingDay);
        return (weekday === 6 && rules?.settings?.restrictSaturday) || (weekday === 0 && rules?.settings?.restrictSunday);
    })) return "weekend";
    if (rules?.bookingBlocks?.some((block) =>
        bookingDays.includes(block.date) && (block.resourceId === null || block.resourceId === resource.id))) {
        return "admin-blocked";
    }
    if (
        startMin < timeToMinutes(resource.openTime) ||
        startMin >= timeToMinutes(resource.closeTime) ||
        (endMin > 1440 && timeToMinutes(resource.closeTime) < 1440) ||
        (endMin > 1440 ? endMin - 1440 > timeToMinutes(resource.closeTime) : endMin > timeToMinutes(resource.closeTime))
    ) {
        return "outside-hours";
    }
    if (findConflicts(reservations, resource.id, date, startMin, endMin, ignoreId).length) {
        return "booked";
    }
    return null;
}

/** End time (minutes) for a new booking that starts at `startMin`, capped by closing time and the next booking. */
function suggestEndMinutes(
    resource: Resource,
    date: ISODate,
    startMin: number,
    reservations: Reservation[],
    desired = DEFAULT_DURATION_MIN,
): number {
    let end = Math.min(
        startMin + desired,
        startMin + resource.maxDurationMinutes,
        1440 + timeToMinutes(resource.closeTime),
    );
    for (const r of reservations) {
        if (r.status === "cancelled" || r.resourceId !== resource.id) continue;
        const offset = Math.round((parseISODate(r.date).getTime() - parseISODate(date).getTime()) / 86_400_000) * 1440;
        const s = offset + timeToMinutes(r.startTime);
        if (s >= startMin && s < end) end = s;
    }
    return Math.max(end, startMin + SLOT_MIN);
}

function findFirstFreeSlot(
    resource: Resource,
    date: ISODate,
    reservations: Reservation[],
    now: Date,
    rules?: { bookingBlocks?: BookingBlockView[]; settings?: BookingSettingsView },
): number | null {
    const open = timeToMinutes(resource.openTime);
    const close = timeToMinutes(resource.closeTime);
    for (let s = open; s + SLOT_MIN <= close; s += GRID_SLOT_MIN) {
        if (!getBlockReason(resource, date, s, s + SLOT_MIN, reservations, now, undefined, rules)) return s;
    }
    return null;
}

type ValidationContext = {
    resources: Resource[];
    /** Reservations on the relevant date(s). */
    reservations: Reservation[];
    now: Date;
    /** Set when editing, so the reservation doesn't conflict with itself. */
    original?: Reservation;
    bookingBlocks?: BookingBlockView[];
    settings?: BookingSettingsView;
};

function validateReservation(input: ReservationInput, ctx: ValidationContext): FieldErrors {
    const errors: FieldErrors = {};
    const title = input.title.trim();

    if (!title) errors.title = "Enter a title for this reservation.";
    else if (title.length < 3) errors.title = "Title must be at least 3 characters.";
    else if (title.length > 80) errors.title = "Title must be 80 characters or fewer.";

    const resource = ctx.resources.find((r) => r.id === input.resourceId);
    if (!resource) errors.resourceId = "Choose a resource.";
    else if (resource.status === "maintenance") {
        errors.resourceId = `${resource.name} is under maintenance and can't be reserved.`;
    }

    const dateOk = isValidISODate(input.date);
    if (!dateOk) errors.date = "Choose a valid date.";

    const timeRe = /^\d{2}:\d{2}$/;
    const startOk = timeRe.test(input.startTime);
    const endOk = timeRe.test(input.endTime);
    if (!startOk) errors.startTime = "Choose a start time.";
    if (!endOk) errors.endTime = "Choose an end time.";

    const start = startOk ? timeToMinutes(input.startTime) : 0;
    const end = endOk ? timeToMinutes(input.endTime) : 0;
    if (startOk && endOk && end === start) errors.endTime = "End time must be different from the start time.";

    if (!Number.isInteger(input.attendees) || input.attendees < 1) {
        errors.attendees = "Enter at least 1 attendee.";
    } else if (resource && input.attendees > resource.capacity) {
        errors.attendees = `${resource.name} holds up to ${resource.capacity}.`;
    }

    const endAbsolute = endOk && startOk && end < start ? end + 1440 : end;
    const endDate = endAbsolute > 1440 ? addDays(input.date, 1) : input.date;
    const bookingDays = endDate === input.date ? [input.date] : [input.date, endDate];
    const timesOk = startOk && endOk && endAbsolute > start;
    if (resource && resource.status !== "maintenance" && dateOk && timesOk) {
        const open = timeToMinutes(resource.openTime);
        const close = timeToMinutes(resource.closeTime);
        const orig = ctx.original;
        const unchanged =
            !!orig &&
            orig.date === input.date &&
            orig.startTime === input.startTime &&
            orig.endTime === input.endTime;

        if (endAbsolute - start > resource.maxDurationMinutes) {
            errors.endTime = `${resource.name} can be booked for at most ${formatDuration(resource.maxDurationMinutes)}.`;
        }
        const closedDay = bookingDays.find((bookingDay) => !resource.openDays.includes(getDayOfWeek(bookingDay)));
        const restrictedWeekend = bookingDays.find((bookingDay) => {
            const weekday = getDayOfWeek(bookingDay);
            return (weekday === 6 && ctx.settings?.restrictSaturday) || (weekday === 0 && ctx.settings?.restrictSunday);
        });
        const adminBlocked = ctx.bookingBlocks?.find((block) =>
            bookingDays.includes(block.date) && (block.resourceId === null || block.resourceId === resource.id));
        if (closedDay) {
            errors.date = `${resource.name} isn't available on ${DAY_NAMES[getDayOfWeek(closedDay)]}.`;
        } else if (restrictedWeekend) {
            errors.date = `${DAY_NAMES[getDayOfWeek(restrictedWeekend)].slice(0, -1)} bookings are restricted by an administrator.`;
        } else if (adminBlocked) {
            errors.date = adminBlocked.reason ? `This date is blocked: ${adminBlocked.reason}` : "This date is blocked by an administrator.";
        } else if (
            start < open ||
            start >= close ||
            (endAbsolute > 1440 && close < 1440) ||
            (endAbsolute > 1440 ? endAbsolute - 1440 > close : endAbsolute > close)
        ) {
            errors.startTime = `${resource.name} can be booked ${minutesToTime(open)}–${minutesToTime(close)}.`;
        } else {
            if (!unchanged && isInPast(input.date, start, ctx.now)) {
                errors.startTime = "That start time has already passed.";
            }
            const clash = findConflicts(
                ctx.reservations,
                resource.id,
                input.date,
                start,
                endAbsolute,
                orig?.id,
            )[0];
            if (clash) {
                errors.form = `${resource.name} is already reserved for “${clash.title}” (${clash.startTime}–${clash.endTime}). Pick another time or resource.`;
            }
        }
    }

    return errors;
}

const hasErrors = (e: FieldErrors) => Object.keys(e).length > 0;

/* ========================================================================== */
/* DATABASE DATA ACCESS                                                      */
/* ========================================================================== */

const ok = <T,>(data: T): ServiceResult<T> => ({ ok: true, data });

function fromPersistedResult<T, U>(
    result: PersistedResult<T>,
    map: (data: T) => U,
): ServiceResult<U> {
    if (result.ok) return ok(map(result.data));
    return { ok: false, error: result.error };
}

function toCalendarResource(resource: PersistedResource): Resource {
    const type: Record<PersistedResource["type"], ResourceType> = {
        ROOM: "Room",
        STUDIO: "Studio",
        EQUIPMENT: "Equipment",
        VEHICLE: "Vehicle",
    };
    return {
        id: resource.id,
        name: resource.name,
        type: type[resource.type],
        location: resource.location,
        capacity: resource.capacity,
        color: resource.color,
        status: resource.isActive ? "available" : "maintenance",
        openTime: resource.openTime,
        closeTime: resource.closeTime,
        openDays: resource.openDays,
        requiresApproval: resource.requiresApproval,
        maxDurationMinutes: resource.maxDurationMinutes,
    };
}

function toCalendarReservation(reservation: PersistedReservation): Reservation {
    return { ...reservation };
}

const calendarService = {
    isMock: false,

    async listResources(): Promise<ServiceResult<Resource[]>> {
        return fromPersistedResult(await listResourcesAction(), (items) => items.map(toCalendarResource));
    },

    async listReservations(range: DateRange): Promise<ServiceResult<Reservation[]>> {
        return fromPersistedResult(await listReservationsAction(range), (items) => items.map(toCalendarReservation));
    },

    async createReservation(input: ReservationInput): Promise<ServiceResult<Reservation>> {
        return fromPersistedResult(await createReservationAction(input), toCalendarReservation);
    },

    async updateReservation(id: string, input: ReservationInput): Promise<ServiceResult<Reservation>> {
        return fromPersistedResult(await updateReservationAction(id, input), toCalendarReservation);
    },

    async cancelReservation(id: string): Promise<ServiceResult<Reservation>> {
        return fromPersistedResult(await cancelReservationAction(id), toCalendarReservation);
    },
};

/* ========================================================================== */
/* DATA HOOKS                                                                 */
/* ========================================================================== */

const NO_RESERVATIONS: Reservation[] = [];
const NO_RESOURCES: Resource[] = [];

/** Loads resources once. Swap-safe: only talks to `calendarService`. */
function useResources() {
    const [state, setState] = useState<{ items: Resource[]; error?: string } | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        calendarService
            .listResources()
            .then((res) => {
                if (cancelled) return;
                setState(res.ok ? { items: res.data } : { items: [], error: res.error.message });
            })
            .catch(() => {
                if (!cancelled) setState({ items: [], error: "Could not load resources." });
            });
        return () => {
            cancelled = true;
        };
    }, [attempt]);

    const retry = useCallback(() => {
        setState(null);
        setAttempt((n) => n + 1);
    }, []);

    return {
        resources: state?.items ?? NO_RESOURCES,
        loading: state === null,
        error: state?.error,
        retry,
    };
}

/**
 * Loads reservations for a date range and reloads when the range changes or `refresh()` is called.
 * Pass `null` to skip fetching (e.g. while a form date is invalid).
 * While a new range is loading, the previous items stay available so the UI doesn't flash.
 */
function useReservations(range: DateRange | null) {
    const from = range?.from;
    const to = range?.to;
    const [version, setVersion] = useState(0);
    const [loaded, setLoaded] = useState<{
        key: string;
        items: Reservation[];
        error?: string;
    } | null>(null);

    const key = from && to ? `${from}|${to}|${version}` : null;

    useEffect(() => {
        if (!from || !to || !key) return;
        let cancelled = false;
        calendarService
            .listReservations({ from, to })
            .then((res) => {
                if (cancelled) return;
                setLoaded(
                    res.ok ? { key, items: res.data } : { key, items: [], error: res.error.message },
                );
            })
            .catch(() => {
                if (!cancelled) setLoaded({ key, items: [], error: "Could not load reservations." });
            });
        return () => {
            cancelled = true;
        };
    }, [from, to, key]);

    const refresh = useCallback(() => setVersion((v) => v + 1), []);
    const current = key !== null && loaded?.key === key;

    return {
        items: loaded?.items ?? NO_RESERVATIONS,
        loading: key !== null && !current,
        error: current ? loaded?.error : undefined,
        refresh,
    };
}

const NO_BOOKING_BLOCKS: BookingBlockView[] = [];
const NO_BOOKING_SETTINGS: BookingSettingsView = { restrictSaturday: false, restrictSunday: false };

function useBookingRestrictions(range: DateRange | null) {
    const from = range?.from;
    const to = range?.to;
    const [version, setVersion] = useState(0);
    const [loaded, setLoaded] = useState<{
        key: string;
        blocks: BookingBlockView[];
        settings: BookingSettingsView;
        error?: string;
    } | null>(null);
    const key = from && to ? `${from}|${to}|${version}` : null;

    useEffect(() => {
        if (!from || !to || !key) return;
        let cancelled = false;
        listBookingRestrictionsAction({ from, to }).then((result) => {
            if (cancelled) return;
            setLoaded(result.ok
                ? { key, blocks: result.data.blocks, settings: result.data.settings }
                : { key, blocks: NO_BOOKING_BLOCKS, settings: NO_BOOKING_SETTINGS, error: result.error.message });
        }).catch(() => {
            if (!cancelled) setLoaded({ key, blocks: NO_BOOKING_BLOCKS, settings: NO_BOOKING_SETTINGS, error: "Could not load booking restrictions." });
        });
        return () => { cancelled = true; };
    }, [from, to, key]);

    const refresh = useCallback(() => setVersion((current) => current + 1), []);
    const current = key !== null && loaded?.key === key;
    return {
        blocks: current ? loaded.blocks : NO_BOOKING_BLOCKS,
        settings: current ? loaded.settings : NO_BOOKING_SETTINGS,
        loading: key !== null && !current,
        error: current ? loaded.error : undefined,
        refresh,
    };
}

/* ========================================================================== */
/* UI: DIALOG                                                                 */
/* ========================================================================== */

type DialogProps = {
    title: string;
    description?: string;
    onClose: () => void;
    children: ReactNode;
    size?: "md" | "lg";
};

/**
 * Accessible modal built on the native <dialog> element (focus trap, Esc, inert background).
 * Local to the calendar feature so it can't clash with a shared `ui/Modal`; swap it for that
 * component if you prefer — the props are intentionally minimal.
 */
function Dialog({ title, description, onClose, children, size = "md" }: DialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const descId = useId();

    useEffect(() => {
        const el = ref.current;
        if (el && !el.open) el.showModal();
        return () => {
            if (el?.open) el.close();
        };
    }, []);

    return (
        <dialog
            ref={ref}
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            onCancel={(e) => {
                e.preventDefault();
                onClose();
            }}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            className={`m-auto max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-zinc-950/40 ${size === "lg" ? "max-w-2xl" : "max-w-lg"
                }`}
        >
            <div>
                <div className="flex items-start gap-3 border-b border-zinc-200 px-5 py-4">
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="text-lg font-semibold text-zinc-900">
                            {title}
                        </h2>
                        {description ? (
                            <p id={descId} className="mt-0.5 text-sm text-zinc-500">
                                {description}
                            </p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="grid h-8 w-8 flex-none place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {children}
            </div>
        </dialog>
    );
}

/* ========================================================================== */
/* UI: STATUS BADGE                                                           */
/* ========================================================================== */

function StatusIcon({
    status,
    className = "h-3.5 w-3.5",
}: {
    status: ReservationStatus;
    className?: string;
}) {
    const meta = STATUS_META[status];
    const Icon = meta.icon;

    return <Icon className={`${className} ${meta.iconClass}`} />;
}

function StatusBadge({ status }: { status: ReservationStatus }) {
    const meta = STATUS_META[status];
    const Icon = meta.icon;

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.chip}`}
        >
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
        </span>
    );
}

/* ========================================================================== */
/* UI: EMPTY STATE                                                            */
/* ========================================================================== */

// import type { LucideIcon } from "lucide-react";
// import type { ReactNode } from "react";

function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-500">
                <Icon className="h-6 w-6" />
            </span>
            <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p>
            {action ? <div className="mt-5">{action}</div> : null}
        </div>
    );
}
/* ========================================================================== */
/* UI: RESERVATION CARD (day/week grid block)                                 */
/* ========================================================================== */

type ReservationCardProps = {
    reservation: Reservation;
    resource: Resource;
    style: CSSProperties;
    /** Rendered height in px, used to decide how much text fits. */
    heightPx: number;
    showResource: boolean;
    onClick: () => void;
};

/** A reservation block positioned inside the day/week time grid. */
function ReservationCard({ reservation, resource, style, heightPx, showResource, onClick }: ReservationCardProps) {
    const color = RESOURCE_COLORS[resource.color];
    const pending = reservation.status === "pending";
    const status = STATUS_META[reservation.status].label;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`${reservation.title}, ${resource.name}, ${reservation.startTime} to ${reservation.endTime}, ${status}`}
            style={{ ...style, backgroundImage: pending ? PENDING_STRIPES : undefined }}
            className={`absolute z-10 overflow-hidden rounded-md border border-l-4 px-1.5 py-1 text-left text-xs shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 motion-reduce:transition-none ${color.card} ${color.border} ${color.text}`}
        >
            <span className="flex items-start gap-1">
                <span className="mt-px flex-none">
                    <StatusIcon status={reservation.status} className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-semibold">{reservation.title}</span>
                    {heightPx >= 40 && (
                        <span className="block truncate opacity-80">
                            {reservation.startTime}–{reservation.endTime}
                        </span>
                    )}
                    {heightPx >= 58 && showResource && (
                        <span className="block truncate opacity-80">{resource.name}</span>
                    )}
                    {heightPx >= 74 && pending && <span className="block truncate font-medium">Pending approval</span>}
                </span>
            </span>
        </button>
    );
}

/* ========================================================================== */
/* UI: RESOURCE FILTER                                                        */
/* ========================================================================== */

type ResourceFilterProps = {
    resources: Resource[];
    selectedIds: Set<string>;
    loading: boolean;
    error?: string;
    onToggle: (id: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    onRetry: () => void;
};

const linkButton =
    "rounded text-xs font-medium text-indigo-600 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:text-zinc-400";

function ResourceFilter({
    resources,
    selectedIds,
    loading,
    error,
    onToggle,
    onSelectAll,
    onClearAll,
    onRetry,
}: ResourceFilterProps) {
    const selectedCount = resources.filter((r) => selectedIds.has(r.id)).length;
    const allSelected = resources.length > 0 && selectedCount === resources.length;

    return (
        <details className="group relative">
            <summary
                aria-label="Filter resources"
                className={`${outlineButton} h-9 min-w-36 cursor-pointer list-none justify-between py-1.5! [&::-webkit-details-marker]:hidden`}
            >
                <span className="truncate">
                    {loading ? "Loading resources…" : selectedCount === resources.length ? "All resources" : `${selectedCount} resources`}
                </span>
                <ChevronDown className="h-4 w-4 flex-none transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 z-40 mt-2 max-h-[min(24rem,calc(100vh-8rem))] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
                <div className="flex items-center justify-between border-b border-zinc-100 px-2 pb-2">
                    <span className="text-xs text-zinc-500" aria-live="polite">
                        {loading ? "Loading…" : `${selectedCount} of ${resources.length} selected`}
                    </span>
                    <button type="button" onClick={onClearAll} disabled={selectedCount === 0} className={linkButton}>
                        Clear
                    </button>
                </div>
                {error ? (
                    <div role="alert" className="m-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}{" "}
                        <button type="button" onClick={onRetry} className="font-medium underline">
                            Retry
                        </button>
                    </div>
                ) : loading ? (
                    <ul aria-hidden="true" className="space-y-2 p-2">
                        {[0, 1, 2, 3].map((i) => (
                            <li key={i} className="h-9 animate-pulse rounded-lg bg-zinc-100" />
                        ))}
                    </ul>
                ) : resources.length === 0 ? (
                    <p className="px-2 py-4 text-center text-sm text-zinc-500">No resources have been set up yet.</p>
                ) : (
                    <ul className="space-y-0.5 pt-1">
                        <li>
                            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={allSelected ? onClearAll : onSelectAll}
                                    className="h-4 w-4 flex-none rounded border-zinc-300 accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                                />
                                Select all
                            </label>
                        </li>
                        {resources.map((r) => (
                            <li key={r.id}>
                                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-50">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(r.id)}
                                        onChange={() => onToggle(r.id)}
                                        className="h-4 w-4 flex-none rounded border-zinc-300 accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                                    />
                                    <span aria-hidden="true" className={`h-2.5 w-2.5 flex-none rounded-full ${RESOURCE_COLORS[r.color].dot}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-zinc-900">{r.name}</span>
                                        <span className="block truncate text-xs text-zinc-500">
                                            {r.type} · {r.location}
                                            {r.capacity > 1 ? ` · up to ${r.capacity}` : ""}
                                        </span>
                                    </span>
                                    {r.status === "maintenance" && (
                                        <span className="flex-none rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                                            Maintenance
                                        </span>
                                    )}
                                </label>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </details>
    );
}

/* ========================================================================== */
/* UI: DAY / WEEK TIME GRID                                                   */
/* ========================================================================== */

const SLOT_PX = 6;
const PX_PER_MIN = SLOT_PX / GRID_SLOT_MIN;
const GUTTER_PX = 44;
const SLOTS = Array.from({ length: (GRID_END_MIN - GRID_START_MIN) / GRID_SLOT_MIN }, (_, i) => GRID_START_MIN + i * GRID_SLOT_MIN);
const HOURS = Array.from({ length: (GRID_END_MIN - GRID_START_MIN) / 60 }, (_, i) => GRID_START_MIN / 60 + i);
const GRID_HEIGHT = SLOTS.length * SLOT_PX;

type SlotSelection = { date: ISODate; resourceId: string; startTime: string };

type Column = { key: string; date: ISODate; resourceIds: string[]; resource?: Resource };

function reservationIntervalOnDate(
    reservation: Reservation,
    date: ISODate,
): { start: number; end: number } | null {
    const dayOffset = Math.round(
        (parseISODate(date).getTime() - parseISODate(reservation.date).getTime()) / 86_400_000,
    );
    const startTime = timeToMinutes(reservation.startTime);
    const endTime = timeToMinutes(reservation.endTime);
    const start = startTime - dayOffset * 1440;
    const absoluteEnd = (endTime <= startTime ? endTime + 1440 : endTime) - dayOffset * 1440;
    const clippedStart = Math.max(GRID_START_MIN, start);
    const clippedEnd = Math.min(GRID_END_MIN, absoluteEnd);
    return clippedEnd > clippedStart ? { start: clippedStart, end: clippedEnd } : null;
}

type TimeGridProps = {
    mode: "day" | "week";
    date: ISODate;
    /** Resources currently ticked in the filter. */
    resources: Resource[];
    /** Active (non-cancelled) reservations for the selected resources. */
    reservations: Reservation[];
    bookingBlocks: BookingBlockView[];
    bookingSettings: BookingSettingsView;
    now: Date;
    today: ISODate;
    onSlotSelect: (slot: SlotSelection) => void;
    onReservationSelect: (reservation: Reservation) => void;
    onDaySelect: (date: ISODate) => void;
};

function TimeGrid({
    mode,
    date,
    resources,
    reservations,
    bookingBlocks,
    bookingSettings,
    now,
    today,
    onSlotSelect,
    onReservationSelect,
    onDaySelect,
}: TimeGridProps) {
    const resourceMap = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);

    const columns: Column[] = useMemo(() => {
        if (mode === "day") {
            return resources.map((r) => ({ key: r.id, date, resourceIds: [r.id], resource: r }));
        }
        const ids = resources.map((r) => r.id);
        return getWeekDates(date).map((d) => ({ key: d, date: d, resourceIds: ids }));
    }, [mode, date, resources]);

    const colMin = mode === "day" ? 170 : 130;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    /** A slot is bookable if at least one of the column's resources is free. */
    function slotState(col: Column, startMin: number): { resourceId?: string; reason: BlockReason | null } {
        const reasons: BlockReason[] = [];
        for (const id of col.resourceIds) {
            const resource = resourceMap.get(id);
            if (!resource) continue;
            const reason = getBlockReason(
                resource,
                col.date,
                startMin,
                startMin + SLOT_MIN,
                reservations.filter((reservation) => reservation.resourceId === id),
                now,
                undefined,
                { bookingBlocks, settings: bookingSettings },
            );
            if (!reason) return { resourceId: id, reason: null };
            reasons.push(reason);
        }
        const first = reasons[0] ?? "closed";
        return { reason: reasons.every((r) => r === first) ? first : "booked" };
    }

    return (
        <div
            role="region"
            aria-label={mode === "day" ? "Day schedule by resource" : "Week schedule"}
            tabIndex={0}
            className="relative min-w-0 max-h-[calc(100dvh-18rem)] min-h-70 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500"
        >
            <div
                className="grid"
                style={{
                    gridTemplateColumns: `${GUTTER_PX}px repeat(${columns.length}, minmax(${colMin}px, 1fr))`,
                    minWidth: GUTTER_PX + columns.length * colMin,
                }}
            >
                {/* Header row */}
                <div className="sticky left-0 top-0 z-30 border-b border-r border-zinc-200 bg-white" />
                {columns.map((col, ci) => {
                    const isToday = col.date === today;
                    return (
                        <div key={col.key} className={`sticky top-0 z-20 border-b border-zinc-200 bg-white px-1.5 py-1 text-center ${ci > 0 ? "border-l" : ""}`}>
                            {mode === "day" && col.resource ? (
                                <div className="flex flex-col items-center gap-0.5">
                                    <span className="flex max-w-full items-center gap-1.5 text-xs font-semibold text-zinc-900">
                                        <span aria-hidden="true" className={`h-2.5 w-2.5 flex-none rounded-full ${RESOURCE_COLORS[col.resource.color].dot}`} />
                                        <span className="truncate">{col.resource.name}</span>
                                    </span>
                                    <span className="max-w-full truncate text-[10px] text-zinc-500">
                                        {col.resource.status === "maintenance"
                                            ? "Under maintenance"
                                            : `${col.resource.openTime}–${col.resource.closeTime}`}
                                    </span>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onDaySelect(col.date)}
                                    aria-label={`Open ${formatShort(col.date)} in day view`}
                                    className="mx-auto flex flex-col items-center rounded-lg px-2 py-0 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                                >
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{formatWeekdayShort(col.date)}</span>
                                    <span className={`mt-0.5 grid h-6 w-6 place-items-center rounded-full text-sm font-semibold ${isToday ? "bg-zinc-900 text-white" : "text-zinc-900"}`}>
                                        {getDayOfMonth(col.date)}
                                    </span>
                                </button>
                            )}
                        </div>
                    );
                })}

                {/* Time gutter */}
                <div className="sticky left-0 z-20 border-r border-zinc-200 bg-white" style={{ height: GRID_HEIGHT }}>
                    {HOURS.map((h) => (
                        <span
                            key={h}
                            className="absolute right-2 text-[10px] font-medium text-zinc-400"
                            style={{ top: (h * 60 - GRID_START_MIN) * PX_PER_MIN + 3 }}
                        >
                            {minutesToTime(h * 60)}
                        </span>
                    ))}
                </div>

                {/* Day / resource columns */}
                {columns.map((col, ci) => {
                    const items = reservations.filter((reservation) =>
                        col.resourceIds.includes(reservation.resourceId) && reservationIntervalOnDate(reservation, col.date) !== null);
                    const layout = layoutOverlaps(
                        items.map((r) => {
                            const interval = reservationIntervalOnDate(r, col.date)!;
                            return { id: r.id, startMin: interval.start, endMin: interval.end };
                        }),
                    );
                    const showNow = col.date === today && nowMin >= GRID_START_MIN && nowMin <= GRID_END_MIN;

                    return (
                        <div key={col.key} className={`relative border-zinc-200 ${ci > 0 ? "border-l" : ""}`} style={{ height: GRID_HEIGHT }}>
                            {SLOTS.map((startMin) => {
                                const { resourceId, reason } = slotState(col, startMin);
                                const time = minutesToTime(startMin);
                                const isHour = startMin % 60 === 0;
                                const line = `border-t ${isHour ? "border-zinc-200" : "border-dashed border-zinc-100"}`;

                                if (!resourceId) {
                                    const policyBlocked = reason === "admin-blocked" || reason === "weekend";
                                    const hatched = policyBlocked || reason === "closed" || reason === "outside-hours" || reason === "maintenance";
                                    const style: CSSProperties = { height: SLOT_PX, backgroundImage: hatched ? UNAVAILABLE_HATCH : undefined };
                                    return (
                                        <div
                                            key={startMin}
                                            title={reason && reason !== "booked" ? BLOCK_REASON_LABEL[reason] : undefined}
                                            style={style}
                                            className={`${line} ${policyBlocked ? "bg-red-50" : reason === "past" || hatched ? "bg-zinc-50" : ""}`}
                                        />
                                    );
                                }

                                const target = resourceMap.get(resourceId)!;
                                return (
                                    <button
                                        key={startMin}
                                        type="button"
                                        tabIndex={-1}
                                        onClick={() => onSlotSelect({ date: col.date, resourceId, startTime: time })}
                                        aria-label={`Reserve ${target.name} on ${formatShort(col.date)} at ${time}`}
                                        style={{ height: SLOT_PX }}
                                        className={`group block w-full text-left transition-colors hover:bg-indigo-50 focus-visible:bg-indigo-50 motion-reduce:transition-none ${line}`}
                                    >
                                        <span className="invisible ml-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 group-hover:visible">
                                            + {time}
                                            {mode === "week" && resources.length > 1 ? ` · ${target.name}` : ""}
                                        </span>
                                    </button>
                                );
                            })}

                            {items.map((r) => {
                                const resource = resourceMap.get(r.resourceId);
                                if (!resource) return null;
                                const interval = reservationIntervalOnDate(r, col.date);
                                if (!interval) return null;
                                const { start, end } = interval;
                                if (end <= start) return null;
                                const pos = layout.get(r.id) ?? { col: 0, cols: 1 };
                                const height = (end - start) * PX_PER_MIN - 2;
                                const displayedReservation = {
                                    ...r,
                                    startTime: minutesToTime(start),
                                    endTime: end === 1440 ? "24:00" : minutesToTime(end),
                                };
                                return (
                                    <ReservationCard
                                        key={r.id}
                                        reservation={displayedReservation}
                                        resource={resource}
                                        heightPx={height}
                                        showResource={mode === "week"}
                                        onClick={() => onReservationSelect(r)}
                                        style={{
                                            top: (start - GRID_START_MIN) * PX_PER_MIN + 1,
                                            height,
                                            left: `calc(${(pos.col / pos.cols) * 100}% + 2px)`,
                                            width: `calc(${100 / pos.cols}% - 4px)`,
                                        }}
                                    />
                                );
                            })}

                            {showNow && (
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-500"
                                    style={{ top: (nowMin - GRID_START_MIN) * PX_PER_MIN }}
                                >
                                    <span className="absolute -left-1 -top-1.25 h-2 w-2 rounded-full bg-red-500" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ========================================================================== */
/* UI: MONTH VIEW                                                             */
/* ========================================================================== */

const MONTH_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

type MonthViewProps = {
    date: ISODate;
    today: ISODate;
    reservations: Reservation[];
    resourceMap: Map<string, Resource>;
    bookingBlocks: BookingBlockView[];
    bookingSettings: BookingSettingsView;
    onDaySelect: (date: ISODate) => void;
    onReservationSelect: (reservation: Reservation) => void;
};

function MonthView({ date, today, reservations, resourceMap, bookingBlocks, bookingSettings, onDaySelect, onReservationSelect }: MonthViewProps) {
    const grid = getMonthGrid(date);

    const byDate = new Map<ISODate, Reservation[]>();
    for (const r of reservations) {
        const endDate = timeToMinutes(r.endTime) < timeToMinutes(r.startTime) ? addDays(r.date, 1) : r.date;
        const occupiedDates = endDate === r.date ? [r.date] : [r.date, endDate];
        for (const occupiedDate of occupiedDates) {
            const list = byDate.get(occupiedDate);
            if (list) list.push(r);
            else byDate.set(occupiedDate, [r]);
        }
    }
    for (const list of byDate.values()) {
        list.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    }

    return (
        <div>
            <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-medium uppercase tracking-wide text-zinc-500">
                {MONTH_WEEKDAYS.map((d) => (
                    <div key={d} className="py-2">
                        {d}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7">
                {grid.map((d, i) => {
                    const list = byDate.get(d) ?? [];
                    const inMonth = isSameMonth(d, date);
                    const isToday = d === today;
                    const selected = d === date;
                    const extra = list.length - MAX_CHIPS;
                    const blocksOnDate = bookingBlocks.filter((block) =>
                        block.date === d && (block.resourceId === null || resourceMap.has(block.resourceId)));
                    const weekday = getDayOfWeek(d);
                    const weekendRestricted = (weekday === 6 && bookingSettings.restrictSaturday) ||
                        (weekday === 0 && bookingSettings.restrictSunday);
                    const restricted = blocksOnDate.length > 0 || weekendRestricted;

                    return (
                        <div
                            key={d}
                            onClick={() => onDaySelect(d)}
                            title={restricted ? (blocksOnDate[0]?.reason ? `Blocked: ${blocksOnDate[0].reason}` : "Bookings are restricted") : undefined}
                            className={`min-h-21 cursor-pointer border-zinc-200 p-1.5 transition-colors hover:bg-zinc-50 motion-reduce:transition-none sm:min-h-29 ${restricted ? "bg-red-50/50" : inMonth ? "bg-white" : "bg-zinc-50/60"} ${i % 7 !== 0 ? "border-l" : ""
                                } ${i >= 7 ? "border-t" : ""}`}
                        >
                            <div className="mb-1 flex justify-start sm:justify-end">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDaySelect(d);
                                    }}
                                    aria-label={`${formatLong(d)}${list.length ? `, ${list.length} reservation${list.length === 1 ? "" : "s"}` : ""}`}
                                    aria-current={isToday ? "date" : undefined}
                                    className={`grid h-7 w-7 place-items-center rounded-full text-[13px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 ${selected
                                            ? "bg-indigo-600 font-semibold text-white"
                                            : isToday
                                                ? "font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-300"
                                                : inMonth
                                                    ? "text-zinc-800 hover:bg-zinc-100"
                                                    : "text-zinc-400 hover:bg-zinc-100"
                                        }`}
                                >
                                    {getDayOfMonth(d)}
                                </button>
                            </div>
                            {restricted ? (
                                <p className="mb-1 truncate rounded bg-red-100 px-1 py-0.5 text-[9px] font-medium text-red-800 sm:text-[10px]">
                                    {weekendRestricted ? "Weekend restricted" : "Bookings blocked"}
                                </p>
                            ) : null}

                            {/* Mobile: dots */}
                            {list.length > 0 && (
                                <div aria-hidden="true" className="flex flex-wrap gap-1 sm:hidden">
                                    {list.slice(0, 6).map((r) => {
                                        const resource = resourceMap.get(r.resourceId);
                                        return <span key={r.id} className={`h-2 w-2 rounded-full ${resource ? RESOURCE_COLORS[resource.color].dot : "bg-zinc-400"}`} />;
                                    })}
                                </div>
                            )}

                            {/* Desktop: chips */}
                            <ul className="hidden space-y-1 sm:block">
                                {list.slice(0, MAX_CHIPS).map((r) => {
                                    const resource = resourceMap.get(r.resourceId);
                                    if (!resource) return null;
                                    const color = RESOURCE_COLORS[resource.color];
                                    const interval = reservationIntervalOnDate(r, d);
                                    if (!interval) return null;
                                    const startLabel = minutesToTime(interval.start);
                                    return (
                                        <li key={r.id}>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onReservationSelect(r);
                                                }}
                                                aria-label={`${r.title}, ${resource.name}, ${startLabel} to ${interval.end === 1440 ? "24:00" : minutesToTime(interval.end)}, ${r.status}`}
                                                style={{ backgroundImage: r.status === "pending" ? PENDING_STRIPES : undefined }}
                                                className={`flex w-full items-center gap-1.5 truncate rounded border border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 ${color.card} ${color.border} ${color.text}`}
                                            >
                                                <span className="flex-none font-medium">{startLabel}</span>
                                                <span className="truncate">{r.title}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                                {extra > 0 && (
                                    <li>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDaySelect(d);
                                            }}
                                            className="px-1.5 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 hover:underline"
                                        >
                                            +{extra} more
                                        </button>
                                    </li>
                                )}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ========================================================================== */
/* UI: RESERVATION FORM MODAL (create + edit)                                 */
/* ========================================================================== */

type ReservationFormModalProps = {
    mode: "create" | "edit";
    initial: ReservationInput;
    /** Required in edit mode. */
    original?: Reservation;
    resources: Resource[];
    onClose: () => void;
    onSaved: (reservation: Reservation, mode: "create" | "edit") => void;
};

type FormValues = Omit<ReservationInput, "attendees"> & { attendees: string };

const controlBase =
    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-2 focus:outline-offset-0 focus:outline-indigo-300 disabled:cursor-not-allowed disabled:bg-zinc-50";
const controlClass = (invalid: boolean) =>
    `${controlBase} ${invalid ? "border-red-400 focus:border-red-500" : "border-zinc-300 focus:border-indigo-400"}`;

function Field({ label, htmlFor, error, children, errorId }: { label: string; htmlFor: string; error?: string; children: ReactNode; errorId: string }) {
    return (
        <div>
            <label htmlFor={htmlFor} className="mb-1 block text-[13px] font-medium text-zinc-700">
                {label}
            </label>
            {children}
            {error ? (
                <p id={errorId} className="mt-1 text-xs text-red-600">
                    {error}
                </p>
            ) : null}
        </div>
    );
}

function ReservationFormModal({ mode, initial, original, resources, onClose, onSaved }: ReservationFormModalProps) {
    const uid = useId();
    const id = (name: string) => `${uid}-${name}`;

    const [values, setValues] = useState<FormValues>({ ...initial, attendees: String(initial.attendees) });
    const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});
    const [submitted, setSubmitted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [serverErrors, setServerErrors] = useState<FieldErrors | null>(null);
    const [openedAt] = useState(() => new Date());

    // Load the day's reservations so conflicts can be previewed (even if the date is outside the calendar's range).
    const dateRange = useMemo(() => {
        if (!isValidISODate(values.date)) return null;
        return {
            from: values.date,
            to: timeToMinutes(values.endTime) <= timeToMinutes(values.startTime) ? addDays(values.date, 1) : values.date,
        };
    }, [values.date, values.startTime, values.endTime]);
    const { items: dayReservations, loading: checking } = useReservations(dateRange);
    const { blocks, settings, loading: restrictionsLoading, error: restrictionsError } = useBookingRestrictions(dateRange);

    const input: ReservationInput = { ...values, attendees: Number(values.attendees) };
    const clientErrors = validateReservation(input, {
        resources,
        reservations: dayReservations,
        now: openedAt,
        original,
        bookingBlocks: blocks,
        settings,
    });
    if (checking) delete clientErrors.form;
    if (restrictionsError) clientErrors.form = restrictionsError;

    const errors: FieldErrors = serverErrors ?? clientErrors;
    const show = (field: keyof FieldErrors) =>
        field === "form" ? errors.form : submitted || touched[field as keyof FormValues] ? errors[field] : undefined;

    const resource = resources.find((r) => r.id === values.resourceId);

    function update<K extends keyof FormValues>(field: K, value: FormValues[K]) {
        setServerErrors(null);
        setTouched((t) => ({ ...t, [field]: true }));
        setValues((v) => {
            const next = { ...v, [field]: value };
            const previousStart = timeToMinutes(v.startTime);
            const previousEnd = timeToMinutes(v.endTime);
            const nextStart = timeToMinutes(next.startTime);
            const wasOvernight = previousEnd <= previousStart;
            if (field === "startTime" && (previousEnd === nextStart || (!wasOvernight && previousEnd < nextStart))) {
                const startIndex = TIME_OPTIONS.indexOf(next.startTime);
                next.endTime = TIME_OPTIONS[(startIndex + 4) % TIME_OPTIONS.length] ?? next.endTime;
            }
            return next;
        });
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setSubmitted(true);
        if (hasErrors(clientErrors) || checking || restrictionsLoading || restrictionsError || saving) return;

        setSaving(true);
        const result =
            mode === "edit" && original
                ? await calendarService.updateReservation(original.id, input)
                : await calendarService.createReservation(input);
        setSaving(false);

        if (result.ok) onSaved(result.data, mode);
        else setServerErrors(result.error.fields ?? { form: result.error.message });
    }

    const durationMin = (timeToMinutes(values.endTime) - timeToMinutes(values.startTime) + 1440) % 1440;
    const errId = (f: string) => id(`${f}-error`);
    const invalid = (f: keyof FieldErrors) => Boolean(show(f));
    const describe = (f: keyof FieldErrors) => (invalid(f) ? errId(f) : undefined);

    return (
        <Dialog
            title={mode === "edit" ? "Edit reservation" : "New reservation"}
            description={mode === "edit" ? "Update the details below." : "Choose a resource and time. Open slots are prefilled for you."}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} noValidate>
                <div className="space-y-4 px-5 py-4">
                    {show("form") && (
                        <div
                            role="alert"
                            className="flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                        >
                            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{show("form")}</span>
                        </div>
                    )}

                    <Field label="Title" htmlFor={id("title")} error={show("title")} errorId={errId("title")}>
                        <input
                            id={id("title")}
                            autoFocus
                            value={values.title}
                            onChange={(e) => update("title", e.target.value)}
                            placeholder="e.g. Sprint planning"
                            maxLength={80}
                            aria-invalid={invalid("title")}
                            aria-describedby={describe("title")}
                            className={controlClass(invalid("title"))}
                        />
                    </Field>

                    <Field label="Resource" htmlFor={id("resource")} error={show("resourceId")} errorId={errId("resourceId")}>
                        <select
                            id={id("resource")}
                            value={values.resourceId}
                            onChange={(e) => update("resourceId", e.target.value)}
                            aria-invalid={invalid("resourceId")}
                            aria-describedby={describe("resourceId")}
                            className={controlClass(invalid("resourceId"))}
                        >
                            <option value="" disabled>
                                Select a resource…
                            </option>
                            {resources.map((r) => (
                                <option key={r.id} value={r.id} disabled={r.status === "maintenance" && r.id !== values.resourceId}>
                                    {r.name} — {r.type}
                                    {r.status === "maintenance" ? " (maintenance)" : ""}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Date" htmlFor={id("date")} error={show("date")} errorId={errId("date")}>
                            <input
                                id={id("date")}
                                type="date"
                                value={values.date}
                                onChange={(e) => update("date", e.target.value)}
                                aria-invalid={invalid("date")}
                                aria-describedby={describe("date")}
                                className={controlClass(invalid("date"))}
                            />
                        </Field>
                        <Field label="Start" htmlFor={id("start")} error={show("startTime")} errorId={errId("startTime")}>
                            <select
                                id={id("start")}
                                value={values.startTime}
                                onChange={(e) => update("startTime", e.target.value)}
                                aria-invalid={invalid("startTime")}
                                aria-describedby={describe("startTime")}
                                className={controlClass(invalid("startTime"))}
                            >
                                {TIME_OPTIONS.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="End" htmlFor={id("end")} error={show("endTime")} errorId={errId("endTime")}>
                            <select
                                id={id("end")}
                                value={values.endTime}
                                onChange={(e) => update("endTime", e.target.value)}
                                aria-invalid={invalid("endTime")}
                                aria-describedby={describe("endTime")}
                                className={controlClass(invalid("endTime"))}
                            >
                                {TIME_OPTIONS.filter((t) => t !== values.startTime).map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                        <Field label="Attendees" htmlFor={id("attendees")} error={show("attendees")} errorId={errId("attendees")}>
                            <input
                                id={id("attendees")}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={resource?.capacity}
                                value={values.attendees}
                                onChange={(e) => update("attendees", e.target.value)}
                                aria-invalid={invalid("attendees")}
                                aria-describedby={describe("attendees")}
                                className={controlClass(invalid("attendees"))}
                            />
                        </Field>
                        <div className="self-end pb-2 text-xs text-zinc-500">
                            {resource && (
                                <p>
                                    {resource.name} · open {resource.openTime}–{resource.closeTime}
                                    {durationMin > 0 ? ` · ${formatDuration(durationMin)}` : ""}
                                    {resource.requiresApproval ? " · needs approval" : ""}
                                </p>
                            )}
                        </div>
                    </div>

                    <Field label="Notes (optional)" htmlFor={id("notes")} errorId={errId("notes")}>
                        <textarea
                            id={id("notes")}
                            rows={3}
                            value={values.notes}
                            onChange={(e) => update("notes", e.target.value)}
                            placeholder="Anything the approver or other attendees should know"
                            className={controlClass(false)}
                        />
                    </Field>

                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
                    {(checking || restrictionsLoading) && <span className="text-xs text-zinc-500 sm:mr-auto" aria-live="polite">Checking availability…</span>}
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={saving || checking || restrictionsLoading || !!restrictionsError}
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create reservation"}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}

/* ========================================================================== */
/* UI: RESERVATION DETAILS MODAL                                              */
/* ========================================================================== */

type ReservationDetailsModalProps = {
    reservation: Reservation;
    resource: Resource | undefined;
    onClose: () => void;
    onEdit: () => void;
    onCancelled: (reservation: Reservation) => void;
};

function Row({
    icon: Icon,
    label,
    children,
}: {
    icon: LucideIcon;
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex gap-3">
            <span className="mt-0.5 text-zinc-400">
                <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
                <dt className="text-xs text-zinc-500">{label}</dt>
                <dd className="text-sm text-zinc-900">{children}</dd>
            </div>
        </div>
    );
}

function ReservationDetailsModal({ reservation: r, resource, onClose, onEdit, onCancelled }: ReservationDetailsModalProps) {
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [openedAt] = useState(() => new Date());

    const ended = isReservationEnded(r, openedAt);
    const locked = ended || r.status === "cancelled";
    const duration = (timeToMinutes(r.endTime) - timeToMinutes(r.startTime) + 1440) % 1440;
    const endDate = timeToMinutes(r.endTime) <= timeToMinutes(r.startTime) ? addDays(r.date, 1) : r.date;

    async function cancel() {
        setBusy(true);
        setError(null);
        const result = await calendarService.cancelReservation(r.id);
        setBusy(false);
        if (result.ok) onCancelled(result.data);
        else setError(result.error.message);
    }

    const secondary =
        "rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-50";

    return (
        <Dialog title={r.title} onClose={onClose}>
            <div className="space-y-4 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.status} />
                    {ended && r.status !== "cancelled" && (
                        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">Ended</span>
                    )}
                </div>

                {r.status === "pending" && !ended && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Waiting for approval. The time is held for you until a decision is made.
                    </p>
                )}

                <dl className="grid gap-4 sm:grid-cols-2">
                    <Row icon={Box} label="Resource">
                        <span className="flex items-center gap-2">
                            {resource && (
                                <span
                                    aria-hidden="true"
                                    className={`h-2.5 w-2.5 rounded-full ${RESOURCE_COLORS[resource.color].dot
                                        }`}
                                />
                            )}
                            {resource?.name ?? "Unknown resource"}
                        </span>
                        {resource && (
                            <span className="block text-xs text-zinc-500">
                                {resource.type} · {resource.location}
                            </span>
                        )}
                    </Row>

                    <Row icon={CalendarDays} label="Date">
                        {endDate === r.date ? formatLong(r.date) : `${formatLong(r.date)} – ${formatLong(endDate)}`}
                    </Row>

                    <Row icon={Clock} label="Time">
                        {r.startTime}–{r.endTime}{" "}
                        <span className="text-zinc-500">
                            ({formatDuration(duration)})
                        </span>
                    </Row>

                    <Row icon={UserRound} label="Booked by">
                        {r.bookedBy}
                    </Row>

                    <Row icon={Users} label="Attendees">
                        {r.attendees}
                    </Row>
                </dl>

                {r.notes && (
                    <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
                        <p className="text-xs font-medium text-zinc-500">Notes</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-800">{r.notes}</p>
                    </div>
                )}

                {error && (
                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </p>
                )}

                {confirming && (
                    <div role="alertdialog" aria-label="Confirm cancellation" className="rounded-lg border border-red-200 bg-red-50 px-3 py-3">
                        <p className="text-sm font-medium text-red-800">Cancel this reservation?</p>
                        <p className="mt-0.5 text-sm text-red-700">The time will become available to others.</p>
                        <div className="mt-3 flex gap-2">
                            <button type="button" onClick={cancel} disabled={busy} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:opacity-50">
                                {busy ? "Cancelling…" : "Yes, cancel it"}
                            </button>
                            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={secondary}>
                                Keep it
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3 sm:flex-row sm:justify-end">
                {locked && (
                    <span className="text-xs text-zinc-500 sm:mr-auto sm:self-center">
                        {r.status === "cancelled" ? "Cancelled reservations can't be changed." : "Past reservations can't be changed."}
                    </span>
                )}
                <button type="button" onClick={onClose} className={secondary}>
                    Close
                </button>
                <button type="button" onClick={() => setConfirming(true)} disabled={locked || confirming} className={`${secondary} text-red-700 hover:bg-red-50`}>
                    Cancel reservation
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    disabled={locked}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Pencil className="h-4 w-4" />
                    Edit
                </button>
            </div>
        </Dialog>
    );
}

/* ========================================================================== */
/* PAGE CONTAINER                                                             */
/* ========================================================================== */

type ModalState =
    | { type: "create"; initial: ReservationInput }
    | { type: "edit"; reservation: Reservation }
    | { type: "details"; reservation: Reservation }
    | null;

const VIEWS: { id: CalendarViewMode; label: string }[] = [
    { id: "day", label: "Daily" },
    { id: "week", label: "Weekly" },
    { id: "month", label: "Monthly" },
];

const subscribeNoop = () => () => { };

const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none";

function CalendarSkeleton() {
    return (
        <div className="mx-auto w-full min-w-0 p-3 sm:p-6" aria-busy="true" aria-label="Loading calendar">
            <div className="mb-5 h-14 w-72 animate-pulse rounded-lg bg-zinc-200" />
            <div className="mb-5 h-11 animate-pulse rounded-lg bg-zinc-200" />
            <div className="h-140 animate-pulse rounded-xl bg-zinc-200" />
        </div>
    );
}

/**
 * Entry point. "Today" depends on the viewer's clock/timezone, so the real UI renders only after
 * hydration — this avoids server/client date mismatches.
 */
function CalendarView() {
    const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
    return mounted ? <CalendarWorkspace /> : <CalendarSkeleton />;
}

function CalendarWorkspace() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(id);
    }, []);
    const today = toISODate(now);

    const [selectedDate, setSelectedDate] = useState<ISODate>(() => toISODate(new Date()));
    const [view, setView] = useState<CalendarViewMode>("week");
    const [hiddenIds, setHiddenIds] = useState<string[]>([]);
    const [modal, setModal] = useState<ModalState>(null);
    const [toast, setToast] = useState<string | null>(null);

    const { resources, loading: resourcesLoading, error: resourcesError, retry } = useResources();
    const range = useMemo(() => getVisibleRange(view, selectedDate), [view, selectedDate]);
    const { items, loading, error: reservationsError, refresh } = useReservations(range);
    const {
        blocks: bookingBlocks,
        settings: bookingSettings,
        loading: restrictionsLoading,
        error: restrictionsError,
        refresh: refreshRestrictions,
    } = useBookingRestrictions(range);

    useEffect(() => {
        if (!toast) return;
        const id = window.setTimeout(() => setToast(null), 4000);
        return () => window.clearTimeout(id);
    }, [toast]);

    const resourceMap = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
    const selectedResources = useMemo(
        () => resources.filter((r) => !hiddenIds.includes(r.id)),
        [resources, hiddenIds],
    );
    const selectedIds = useMemo(() => new Set(selectedResources.map((r) => r.id)), [selectedResources]);

    const visibleReservations = useMemo(
        () => items.filter((r) => r.status !== "cancelled" && selectedIds.has(r.resourceId)),
        [items, selectedIds],
    );
    const inRange = useMemo(
        () => visibleReservations.filter((r) => {
            const endDate = timeToMinutes(r.endTime) <= timeToMinutes(r.startTime) ? addDays(r.date, 1) : r.date;
            return r.date <= range.to && endDate >= range.from;
        }),
        [visibleReservations, range],
    );

    /* ---- navigation ---- */
    const selectDate = useCallback((date: ISODate, nextView?: CalendarViewMode) => {
        setSelectedDate(date);
        if (nextView) setView(nextView);
    }, []);

    const shift = (dir: 1 | -1) => selectDate(shiftDate(view, selectedDate, dir));

    /* ---- filters ---- */
    const toggleResource = (id: string) =>
        setHiddenIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    const selectAll = () => setHiddenIds([]);
    const clearAll = () => setHiddenIds(resources.map((r) => r.id));

    /* ---- reservation actions ---- */
    function openCreateFromSlot(slot: SlotSelection) {
        const resource = resourceMap.get(slot.resourceId);
        if (!resource) return;
        const start = timeToMinutes(slot.startTime);
        const end = suggestEndMinutes(resource, slot.date, start, items);
        setModal({
            type: "create",
            initial: {
                resourceId: slot.resourceId,
                title: "",
                date: slot.date,
                startTime: slot.startTime,
                endTime: minutesToTime(end % 1440),
                attendees: 1,
                notes: "",
            },
        });
    }

    function openCreateFromButton() {
        const candidates = selectedResources.length ? selectedResources : resources;
        for (const resource of candidates) {
            const start = findFirstFreeSlot(resource, selectedDate, items, now, {
                bookingBlocks,
                settings: bookingSettings,
            });
            if (start !== null) {
                openCreateFromSlot({ date: selectedDate, resourceId: resource.id, startTime: minutesToTime(start) });
                return;
            }
        }
        // Nothing free that day: open the form anyway; it explains why a time can't be booked.
        const fallback = candidates[0];
        setModal({
            type: "create",
            initial: {
                resourceId: fallback?.id ?? "",
                title: "",
                date: selectedDate,
                startTime: "09:00",
                endTime: "10:00",
                attendees: 1,
                notes: "",
            },
        });
    }

    function handleSaved(saved: Reservation, mode: "create" | "edit") {
        setModal(null);
        refresh();
        refreshRestrictions();
        setToast(
            mode === "create"
                ? saved.status === "pending"
                    ? "Reservation submitted — waiting for approval."
                    : "Reservation confirmed."
                : "Reservation updated.",
        );
        if (saved.date < range.from || saved.date > range.to) selectDate(saved.date);
        // Make sure the resource is visible so the user can see what they just saved.
        setHiddenIds((ids) => ids.filter((id) => id !== saved.resourceId));
    }

    function handleCancelled() {
        setModal(null);
        refresh();
        refreshRestrictions();
        setToast("Reservation cancelled.");
    }

    const noResourcesAtAll = !resourcesLoading && !resourcesError && resources.length === 0;
    const noneSelected = !resourcesLoading && resources.length > 0 && selectedResources.length === 0;

    return (
        <div className="mx-auto w-full min-w-0 max-w-375 p-3 sm:p-6">
            {/* Page header */}
            <header className="mb-5 flex flex-wrap items-start gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1 basis-64">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h1 className="text-[28px] font-semibold leading-tight text-zinc-900">Calendar</h1>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                        See availability across resources. Click an open slot to reserve it, or a reservation for details.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => selectDate(today)} className={outlineButton}>
                        Today
                    </button>
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={() => shift(-1)} aria-label={`Previous ${view}`} className={`${outlineButton} h-9 w-9 px-0!`}>
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => shift(1)} aria-label={`Next ${view}`} className={`${outlineButton} h-9 w-9 px-0!`}>
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={openCreateFromButton}
                        disabled={resourcesLoading || resources.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                    >
                        <Plus className="h-4 w-4" />
                        Add reservation
                    </button>
                </div>
            </header>

            <section aria-label="Reservations calendar" className="min-w-0 rounded-xl border border-zinc-200 bg-white">
                <header className="relative z-50 flex min-w-0 flex-col gap-2 border-b border-zinc-200 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-zinc-900" aria-live="polite">{formatMonthYear(selectedDate)}</h2>
                        <p className="text-xs text-zinc-500">
                            {formatLong(selectedDate)}
                            {(loading || restrictionsLoading) && <span className="ml-2 text-xs">· Loading…</span>}
                        </p>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                        <div role="group" aria-label="Calendar view" className="inline-flex shrink-0 rounded-lg bg-zinc-100 p-0.5">
                            {VIEWS.map((v) => (
                                <button
                                    key={v.id}
                                    type="button"
                                    aria-pressed={view === v.id}
                                    onClick={() => setView(v.id)}
                                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 sm:px-3.5 motion-reduce:transition-none ${view === v.id ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"
                                        }`}
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>
                        <label className="sr-only" htmlFor="calendar-date">Select date</label>
                        <input
                            id="calendar-date"
                            type="date"
                            value={selectedDate}
                            onChange={(event) => {
                                const date = event.target.value;
                                if (isValidISODate(date)) selectDate(date);
                            }}
                            className={`${outlineButton} h-9 w-37 min-w-0 max-w-full px-2 py-1.5 text-xs tabular-nums`}
                        />
                        <ResourceFilter
                            resources={resources}
                            selectedIds={selectedIds}
                            loading={resourcesLoading}
                            error={resourcesError}
                            onToggle={toggleResource}
                            onSelectAll={selectAll}
                            onClearAll={clearAll}
                            onRetry={retry}
                        />
                    </div>
                </header>

                <div className="min-w-0 overflow-hidden rounded-b-xl">
                    {(reservationsError || restrictionsError) && (
                        <div role="alert" className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                            <TriangleAlert className="h-4 w-4" />
                            {reservationsError ?? restrictionsError}
                            <button type="button" onClick={() => { refresh(); refreshRestrictions(); }} className="ml-auto font-medium underline">
                                Retry
                            </button>
                        </div>
                    )}

                    {resourcesError || noResourcesAtAll ? (
                        <EmptyState
                            icon={Box}
                            title={resourcesError ? "Couldn't load resources" : "No resources yet"}
                            description={
                                resourcesError
                                    ? resourcesError
                                    : "Add a resource first, then come back to see its availability and reservations here."
                            }
                            action={
                                resourcesError ? (
                                    <button type="button" onClick={retry} className={outlineButton}>
                                        Try again
                                    </button>
                                ) : undefined
                            }
                        />
                    ) : noneSelected ? (
                        <EmptyState
                            icon={CalendarDays}
                            title="No resources selected"
                            description="Tick at least one resource in the filter to see its availability and reservations."
                            action={
                                <button type="button" onClick={selectAll} className={outlineButton}>
                                    Select all resources
                                </button>
                            }
                        />
                    ) : resourcesLoading ? (
                        <div className="h-115 animate-pulse bg-zinc-50" aria-busy="true" />
                    ) : (
                        <>
                            {!loading && !reservationsError && inRange.length === 0 && (
                                <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-600">
                                    No reservations for the selected resources in this {view}. {view === "month" ? "Pick a day to add one." : "Click any open slot to create one."}
                                </p>
                            )}

                            {view === "month" ? (
                                <MonthView
                                    date={selectedDate}
                                    today={today}
                                    reservations={visibleReservations}
                                    resourceMap={resourceMap}
                                    bookingBlocks={bookingBlocks}
                                    bookingSettings={bookingSettings}
                                    onDaySelect={(d) => selectDate(d, "day")}
                                    onReservationSelect={(reservation) => setModal({ type: "details", reservation })}
                                />
                            ) : (
                                <TimeGrid
                                    mode={view}
                                    date={selectedDate}
                                    resources={selectedResources}
                                    reservations={visibleReservations}
                                    bookingBlocks={bookingBlocks}
                                    bookingSettings={bookingSettings}
                                    now={now}
                                    today={today}
                                    onSlotSelect={openCreateFromSlot}
                                    onReservationSelect={(reservation) => setModal({ type: "details", reservation })}
                                    onDaySelect={(d) => selectDate(d, "day")}
                                />
                            )}
                        </>
                    )}

                    {/* Legend */}
                    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-600">
                        <li className="flex items-center gap-1.5">
                            <StatusIcon status="confirmed" /> Confirmed
                        </li>
                        <li className="flex items-center gap-1.5">
                            <StatusIcon status="pending" />
                            <span aria-hidden="true" className="h-3 w-5 rounded-sm border border-zinc-300 bg-zinc-100" style={{ backgroundImage: PENDING_STRIPES }} />
                            Pending approval
                        </li>
                        <li className="flex items-center gap-1.5">
                            <span aria-hidden="true" className="h-3 w-5 rounded-sm border border-zinc-200 bg-red-50" />
                            Booking blocked / weekend restricted
                        </li>
                        <li className="flex items-center gap-1.5">
                            <span aria-hidden="true" className="h-3 w-5 rounded-sm border border-zinc-200 bg-zinc-50" />
                            Past
                        </li>
                    </ul>
                </div>
            </section>

            {/* Modals */}
            {modal?.type === "create" && (
                <ReservationFormModal
                    mode="create"
                    initial={modal.initial}
                    resources={resources}
                    onClose={() => setModal(null)}
                    onSaved={handleSaved}
                />
            )}
            {modal?.type === "edit" && (
                <ReservationFormModal
                    mode="edit"
                    original={modal.reservation}
                    initial={{
                        resourceId: modal.reservation.resourceId,
                        title: modal.reservation.title,
                        date: modal.reservation.date,
                        startTime: modal.reservation.startTime,
                        endTime: modal.reservation.endTime,
                        attendees: modal.reservation.attendees,
                        notes: modal.reservation.notes ?? "",
                    }}
                    resources={resources}
                    onClose={() => setModal(null)}
                    onSaved={handleSaved}
                />
            )}
            {modal?.type === "details" && (
                <ReservationDetailsModal
                    reservation={modal.reservation}
                    resource={resourceMap.get(modal.reservation.resourceId)}
                    onClose={() => setModal(null)}
                    onEdit={() => setModal({ type: "edit", reservation: modal.reservation })}
                    onCancelled={handleCancelled}
                />
            )}

            {/* Toast */}
            <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-70 flex justify-center px-4">
                {toast && (
                    <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-lg">
                        <Check className="h-4 w-4 text-emerald-400" />
                        {toast}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ========================================================================== */
/* ROUTE EXPORT                                                                 */
/* ========================================================================== */

export default function CalendarPage() {
    return <CalendarView />;
}
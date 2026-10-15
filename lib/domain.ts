export type ResourceType = "ROOM" | "STUDIO" | "EQUIPMENT" | "VEHICLE";
export type ResourceColor =
  | "sky"
  | "violet"
  | "teal"
  | "fuchsia"
  | "cyan"
  | "lime"
  | "rose";
export type ResourceStatus = "available" | "maintenance";
export type ReservationStatus = "confirmed" | "pending" | "cancelled";
export type UserRole = "ADMIN" | "MEMBER";

export const TABLE_PAGE_SIZE = 8;

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  ROOM: "Room",
  STUDIO: "Studio",
  EQUIPMENT: "Equipment",
  VEHICLE: "Vehicle",
};

export const COLOR_PRESETS: { token: ResourceColor; hex: string; label: string }[] = [
  { token: "sky", hex: "#0ea5e9", label: "Sky" },
  { token: "violet", hex: "#8b5cf6", label: "Violet" },
  { token: "teal", hex: "#14b8a6", label: "Teal" },
  { token: "fuchsia", hex: "#d946ef", label: "Fuchsia" },
  { token: "cyan", hex: "#06b6d4", label: "Cyan" },
  { token: "lime", hex: "#84cc16", label: "Lime" },
  { token: "rose", hex: "#f43f5e", label: "Rose" },
];

export function hexToToken(hex: string): ResourceColor {
  const match = COLOR_PRESETS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  return match?.token ?? "sky";
}

export function tokenToHex(token: ResourceColor): string {
  return COLOR_PRESETS.find((c) => c.token === token)?.hex ?? "#0ea5e9";
}

export const RESOURCE_COLORS: Record<
  ResourceColor,
  { dot: string; card: string; border: string; text: string }
> = {
  sky: {
    dot: "bg-sky-500",
    card: "bg-sky-50 hover:bg-sky-100",
    border: "border-sky-200 border-l-sky-500",
    text: "text-sky-900",
  },
  violet: {
    dot: "bg-violet-500",
    card: "bg-violet-50 hover:bg-violet-100",
    border: "border-violet-200 border-l-violet-500",
    text: "text-violet-900",
  },
  teal: {
    dot: "bg-teal-500",
    card: "bg-teal-50 hover:bg-teal-100",
    border: "border-teal-200 border-l-teal-500",
    text: "text-teal-900",
  },
  fuchsia: {
    dot: "bg-fuchsia-500",
    card: "bg-fuchsia-50 hover:bg-fuchsia-100",
    border: "border-fuchsia-200 border-l-fuchsia-500",
    text: "text-fuchsia-900",
  },
  cyan: {
    dot: "bg-cyan-500",
    card: "bg-cyan-50 hover:bg-cyan-100",
    border: "border-cyan-200 border-l-cyan-500",
    text: "text-cyan-900",
  },
  lime: {
    dot: "bg-lime-500",
    card: "bg-lime-50 hover:bg-lime-100",
    border: "border-lime-300 border-l-lime-500",
    text: "text-lime-900",
  },
  rose: {
    dot: "bg-rose-500",
    card: "bg-rose-50 hover:bg-rose-100",
    border: "border-rose-200 border-l-rose-500",
    text: "text-rose-900",
  },
};

/** Shared booking window used by the calendar UI (not stored per resource in the ERD). */
export const GRID_START_MIN = 0;
export const GRID_END_MIN = 24 * 60;
export const SLOT_MIN = 15;
export const DEFAULT_DURATION_MIN = 60;
export const DEFAULT_OPEN_TIME = "00:00";
export const DEFAULT_CLOSE_TIME = "24:00";
export const DEFAULT_OPEN_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const MAX_DURATION_MINUTES = 12 * 60;

export type BookingBlockView = {
  id: string;
  date: string;
  resourceId: string | null;
  resourceName: string | null;
  reason: string | null;
};

export type BookingSettingsView = {
  restrictSaturday: boolean;
  restrictSunday: boolean;
};

export type SessionUserView = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string | null;
  jobTitle?: string | null;
};

export function canManageReservation(actor: Pick<SessionUserView, "id" | "role">, ownerId: string) {
  return actor.role === "ADMIN" || actor.id === ownerId;
}

export type Resource = {
  id: string;
  name: string;
  type: ResourceType;
  description: string | null;
  location: string;
  capacity: number;
  color: ResourceColor;
  colorHex: string;
  status: ResourceStatus;
  isActive: boolean;
  openTime: string;
  closeTime: string;
  openDays: number[];
  requiresApproval: boolean;
  maxDurationMinutes: number;
};

export type Reservation = {
  id: string;
  resourceId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  bookedBy: string;
  userId: string;
  attendees: number;
  notes?: string;
  createdAt: string;
};

export type ReservationInput = {
  resourceId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: number;
  notes: string;
};

export type FieldErrors = Partial<Record<keyof ReservationInput | "form", string>>;

export type ServiceError = {
  code: "VALIDATION" | "CONFLICT" | "NOT_FOUND" | "UNKNOWN" | "UNAUTHORIZED" | "FORBIDDEN";
  message: string;
  fields?: FieldErrors;
};

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

export type UserView = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  department: string | null;
  jobTitle: string | null;
  createdAt: string;
};
export type NotificationView = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  reservationId: string | null;
};

import type { ReservationInput } from "@/lib/domain";

export const QUICK_BOOK_EVENT = "prime-reserve:quick-book";

export type QuickBookRequest = Pick<ReservationInput, "resourceId" | "date" | "startTime" | "endTime">;

export function dispatchQuickBook(request: QuickBookRequest) {
  window.dispatchEvent(new CustomEvent<QuickBookRequest>(QUICK_BOOK_EVENT, { detail: request }));
}

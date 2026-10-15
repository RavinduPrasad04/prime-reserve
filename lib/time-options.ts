import { GRID_END_MIN, GRID_START_MIN } from "@/lib/domain";
import { minutesToTime } from "@/lib/dates";

const TIME_OPTION_INTERVAL_MINUTES = 15;

export const TIME_OPTIONS = Array.from(
  { length: (GRID_END_MIN - GRID_START_MIN) / TIME_OPTION_INTERVAL_MINUTES },
  (_, i) => minutesToTime(GRID_START_MIN + i * TIME_OPTION_INTERVAL_MINUTES),
);

import assert from "node:assert/strict";
import test from "node:test";
import type { Reservation, ReservationInput, Resource } from "@/lib/domain";
import { hashPassword, verifyPassword } from "@/lib/password";
import { validateRegistrationInput } from "@/lib/registration";
import { TIME_OPTIONS } from "@/lib/time-options";
import { findConflicts, getBlockReason, validateReservation, validateReservationInputShape } from "@/lib/validation";

const resource: Resource = {
  id: "5d80e6a8-9e14-4ca9-a183-bb6e4f070cc8",
  name: "Boardroom",
  type: "ROOM",
  description: null,
  location: "Level 1",
  capacity: 8,
  color: "sky",
  colorHex: "#0ea5e9",
  status: "available",
  isActive: true,
  openTime: "06:00",
  closeTime: "22:00",
  openDays: [0, 1, 2, 3, 4, 5, 6],
  requiresApproval: false,
  maxDurationMinutes: 720,
};

const booking: ReservationInput = {
  resourceId: resource.id,
  title: "Planning session",
  date: "2030-06-12",
  startTime: "10:00",
  endTime: "11:00",
  attendees: 4,
  notes: "",
};

const reservation: Reservation = {
  id: "fa1ef18e-377b-4025-92ca-ef36bb967dd0",
  resourceId: resource.id,
  title: "Existing session",
  date: booking.date,
  startTime: "10:00",
  endTime: "11:00",
  status: "confirmed",
  bookedBy: "Alex",
  userId: "4a860ce2-ea9f-4833-89d8-fd8cec8d9e25",
  attendees: 2,
  createdAt: "2030-01-01T00:00:00.000Z",
};

test("overlap checks reject intersections but allow adjacent reservations", () => {
  assert.equal(findConflicts([reservation], resource.id, booking.date, 10 * 60 + 30, 11 * 60 + 30).length, 1);
  assert.equal(findConflicts([reservation], resource.id, booking.date, 11 * 60, 12 * 60).length, 0);
});

test("cancelled reservations no longer block a slot", () => {
  assert.equal(
    findConflicts([{ ...reservation, status: "cancelled" }], resource.id, booking.date, 10 * 60, 11 * 60).length,
    0,
  );
});

test("reservation validation enforces resource capacity", () => {
  const errors = validateReservation(
    { ...booking, attendees: resource.capacity + 1 },
    { resources: [resource], reservations: [], now: new Date("2030-01-01T00:00:00") },
  );
  assert.match(errors.attendees ?? "", /holds up to 8/);

  const atCapacity = validateReservation(
    { ...booking, attendees: resource.capacity },
    { resources: [resource], reservations: [], now: new Date("2030-01-01T00:00:00") },
  );
  assert.equal(atCapacity.attendees, undefined);
});

test("untrusted malformed reservation values are rejected before database work", () => {
  const errors = validateReservationInputShape({
    ...booking,
    date: "2030-02-31",
    startTime: "25:90",
    attendees: "4",
  });
  assert.ok(errors.date);
  assert.ok(errors.startTime);
  assert.ok(validateReservationInputShape({ ...booking, startTime: "10:10" }).startTime);
  assert.ok(errors.attendees);
  assert.ok(validateReservationInputShape(null).form);
});

test("reservation time options are available in 15-minute intervals", () => {
  assert.deepEqual(TIME_OPTIONS.slice(0, 5), ["00:00", "00:15", "00:30", "00:45", "01:00"]);
  assert.equal(TIME_OPTIONS.length, 96);
  assert.equal(TIME_OPTIONS.at(-1), "23:45");
});

test("overnight reservations validate and conflict across midnight", () => {
  const overnight: ReservationInput = { ...booking, date: "2030-06-12", startTime: "23:00", endTime: "01:00" };
  const existingNextDay = { ...reservation, date: "2030-06-13", startTime: "00:30", endTime: "01:30" };
  assert.equal(
    findConflicts([existingNextDay], resource.id, overnight.date, 23 * 60, 25 * 60).length,
    1,
  );
  const errors = validateReservation(overnight, {
    resources: [{ ...resource, openTime: "00:00", closeTime: "24:00", maxDurationMinutes: 720 }],
    reservations: [],
    now: new Date("2030-01-01T00:00:00"),
  });
  assert.equal(errors.endTime, undefined);
  const overlapErrors = validateReservation(overnight, {
    resources: [{ ...resource, openTime: "00:00", closeTime: "24:00", maxDurationMinutes: 720 }],
    reservations: [existingNextDay],
    now: new Date("2030-01-01T00:00:00"),
  });
  assert.match(overlapErrors.form ?? "", /already reserved/);
});

test("overnight reservations are blocked by next-day date blocks and weekend settings", () => {
  const overnight: ReservationInput = { ...booking, date: "2030-06-12", startTime: "23:00", endTime: "01:00" };
  const common = {
    resources: [{ ...resource, openTime: "00:00", closeTime: "24:00", maxDurationMinutes: 720 }],
    reservations: [],
    now: new Date("2030-01-01T00:00:00"),
  };
  const blocked = validateReservation(overnight, {
    ...common,
    bookingBlocks: [{ id: "block", date: "2030-06-13", resourceId: null, resourceName: null, reason: "Maintenance" }],
  });

  test("a reservation ending exactly at midnight does not occupy the next date", () => {
    const endsAtMidnight: ReservationInput = {
      ...booking,
      date: "2030-06-15",
      startTime: "23:45",
      endTime: "00:00",
    };
    const errors = validateReservation(endsAtMidnight, {
      resources: [{ ...resource, openTime: "00:00", closeTime: "24:00", maxDurationMinutes: 720 }],
      reservations: [],
      now: new Date("2030-01-01T00:00:00"),
      settings: { restrictSaturday: false, restrictSunday: true },
      bookingBlocks: [{ id: "block", date: "2030-06-16", resourceId: null, resourceName: null, reason: null }],
    });
    assert.equal(errors.date, undefined);
    assert.equal(errors.endTime, undefined);
  });
  assert.match(blocked.date ?? "", /Maintenance/);

  const weekend = validateReservation(
    { ...overnight, date: "2030-06-15" },
    { ...common, settings: { restrictSunday: true, restrictSaturday: false } },
  );
  assert.match(weekend.date ?? "", /Sunday bookings are restricted/);
});

test("availability block reason includes admin restrictions", () => {
  assert.equal(
    getBlockReason(
      { ...resource, openTime: "00:00", closeTime: "24:00" },
      "2030-06-12",
      23 * 60,
      25 * 60,
      [],
      new Date("2030-01-01T00:00:00"),
      undefined,
      { bookingBlocks: [{ id: "block", date: "2030-06-13", resourceId: null, resourceName: null, reason: null }] },
    ),
    "admin-blocked",
  );
});

test("password hashes verify only the matching password", () => {
  const hash = hashPassword("secure-password");
  assert.equal(verifyPassword("secure-password", hash), true);
  assert.equal(verifyPassword("different-password", hash), false);
});

test("member registration normalizes profile fields and validates password confirmation", () => {
  const valid = validateRegistrationInput({
    name: "  Jamie Lee  ",
    email: " JAMIE@EXAMPLE.COM ",
    department: " Engineering ",
    jobTitle: " Developer ",
    password: "secure-password",
    confirmPassword: "secure-password",
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data.name, "Jamie Lee");
    assert.equal(valid.data.email, "jamie@example.com");
    assert.equal(valid.data.department, "Engineering");
    assert.equal(valid.data.jobTitle, "Developer");
  }

  const mismatch = validateRegistrationInput({
    name: "Jamie Lee",
    email: "jamie@example.com",
    department: "",
    jobTitle: "",
    password: "secure-password",
    confirmPassword: "different-password",
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.error, "Password and confirmation do not match.");
});

test("member registration rejects invalid required fields and oversized profile fields", () => {
  const invalid = [
    { name: "J", email: "jamie@example.com", department: "", jobTitle: "", password: "secure-password", confirmPassword: "secure-password" },
    { name: "Jamie Lee", email: "invalid", department: "", jobTitle: "", password: "secure-password", confirmPassword: "secure-password" },
    { name: "Jamie Lee", email: "jamie@example.com", department: "d".repeat(101), jobTitle: "", password: "secure-password", confirmPassword: "secure-password" },
    { name: "Jamie Lee", email: "jamie@example.com", department: "", jobTitle: "", password: "short", confirmPassword: "short" },
    null,
  ];
  for (const input of invalid) assert.equal(validateRegistrationInput(input).ok, false);
});

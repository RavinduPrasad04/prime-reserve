import "dotenv/config";
import {
  NotificationType,
  PrismaClient,
  ReservationStatus,
  ResourceType,
  UserRole,
} from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../lib/password";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

function assertLocalDatabaseTarget(value: string) {
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    url.protocol !== "postgresql:" ||
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    database !== "resource_reservation_db" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("Refusing to seed: DATABASE_URL is not the verified local development database.");
  }
}

assertLocalDatabaseTarget(connectionString);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const DEMO_PASSWORD = "DemoPass123!";

const users = [
  {
    name: "Alex Morgan",
    email: "alex.morgan@primewave.lab",
    role: UserRole.ADMIN,
    department: "Engineering",
    jobTitle: "Engineering Director",
  },
  {
    name: "Priya Nair",
    email: "priya.nair@primewave.lab",
    role: UserRole.MEMBER,
    department: "People Operations",
    jobTitle: "People Partner",
  },
  {
    name: "Marcus Lee",
    email: "marcus.lee@primewave.lab",
    role: UserRole.MEMBER,
    department: "Engineering",
    jobTitle: "Software Engineer",
  },
  {
    name: "Sofia Rossi",
    email: "sofia.rossi@primewave.lab",
    role: UserRole.MEMBER,
    department: "Product",
    jobTitle: "Product Designer",
  },
  {
    name: "Elena Vasquez",
    email: "elena.vasquez@primewave.lab",
    role: UserRole.MEMBER,
    department: "Finance",
    jobTitle: "Finance Manager",
  },
  {
    name: "Dan Kowalski",
    email: "dan.kowalski@primewave.lab",
    role: UserRole.MEMBER,
    department: "Operations",
    jobTitle: "Workplace Coordinator",
  },
  {
    name: "Noah Chen",
    email: "noah.chen@primewave.lab",
    role: UserRole.MEMBER,
    department: "Infrastructure",
    jobTitle: "Cloud Platform Engineer",
  },
] as const;

const resources = [
  {
    name: "Boardroom A",
    type: ResourceType.ROOM,
    description: "Executive meeting room with a large display and conference system.",
    location: "Level 3",
    capacity: 12,
    color: "#0ea5e9",
    isActive: true,
  },
  {
    name: "Huddle Room 2",
    type: ResourceType.ROOM,
    description: "Compact collaboration room with a shared whiteboard.",
    location: "Level 2",
    capacity: 4,
    color: "#8b5cf6",
    isActive: true,
  },
  {
    name: "Training Lab",
    type: ResourceType.ROOM,
    description: "Flexible workshop room with teaching displays and movable seating.",
    location: "Level 1",
    capacity: 24,
    color: "#14b8a6",
    isActive: true,
  },
  {
    name: "Podcast Studio",
    type: ResourceType.STUDIO,
    description: "Sound-treated studio for product and engineering podcasts.",
    location: "Level 4",
    capacity: 5,
    color: "#d946ef",
    isActive: true,
  },
  {
    name: "Projector Kit",
    type: ResourceType.EQUIPMENT,
    description: "Portable projector, HDMI adapters, and presentation stand.",
    location: "Equipment Store",
    capacity: 1,
    color: "#06b6d4",
    isActive: true,
  },
  {
    name: "Pool Car – Corolla",
    type: ResourceType.VEHICLE,
    description: "Shared hybrid car for local customer and supplier visits.",
    location: "Basement P1",
    capacity: 4,
    color: "#84cc16",
    isActive: true,
  },
  {
    name: "Camera Rig",
    type: ResourceType.EQUIPMENT,
    description: "Studio camera and lighting kit, temporarily out for maintenance.",
    location: "Equipment Store",
    capacity: 1,
    color: "#f43f5e",
    isActive: false,
  },
  {
    name: "Engineering War Room",
    type: ResourceType.ROOM,
    description: "Dedicated incident-response room with status dashboards.",
    location: "Level 3",
    capacity: 10,
    color: "#0ea5e9",
    isActive: true,
  },
  {
    name: "Product Design Studio",
    type: ResourceType.STUDIO,
    description: "Open studio with prototyping tables and a presentation display.",
    location: "Level 2",
    capacity: 8,
    color: "#8b5cf6",
    isActive: true,
  },
  {
    name: "Hybrid Demo Suite",
    type: ResourceType.ROOM,
    description: "Customer demo room with video conferencing and screen sharing.",
    location: "Level 4",
    capacity: 8,
    color: "#14b8a6",
    isActive: true,
  },
  {
    name: "User Research Lab",
    type: ResourceType.ROOM,
    description: "Private interview room with observation seating.",
    location: "Level 1",
    capacity: 6,
    color: "#d946ef",
    isActive: true,
  },
  {
    name: "Mobile Demo Kit",
    type: ResourceType.EQUIPMENT,
    description: "Configured phones and tablets for field product demonstrations.",
    location: "Equipment Store",
    capacity: 1,
    color: "#06b6d4",
    isActive: true,
  },
  {
    name: "Pool Car – EV",
    type: ResourceType.VEHICLE,
    description: "Electric pool car for regional office and client visits.",
    location: "Basement P1",
    capacity: 4,
    color: "#84cc16",
    isActive: true,
  },
  {
    name: "Video Conferencing Kit",
    type: ResourceType.EQUIPMENT,
    description: "Portable conference camera, microphone, and speaker set.",
    location: "Equipment Store",
    capacity: 1,
    color: "#f43f5e",
    isActive: true,
  },
] as const;

const legacyReservationTitles = [
  "Board prep",
  "Planning poker",
  "Excel masterclass",
  "Weekly leadership sync",
  "Design critique",
  "New starter onboarding",
  "Client call — Q4 roadmap",
  "Budget review",
  "1:1 catch-up",
  "Episode 14 recording",
  "Site visit — Northgate",
  "Hiring panel",
  "Roadshow demo",
  "Security awareness workshop",
  "Sprint retro",
  "All-hands prep",
  "Airport pickup",
  "Weekend event setup",
  "Strategy offsite planning",
  "Customer story shoot",
  "Candidate interview",
  "Leadership workshop",
  "Offsite equipment",
  "Vendor negotiation",
  "Supplier visit",
  "Weekly sync",
  "E2E cancelled slot reuse",
  "E2E adjacent booking",
  "E2E edited booking",
];

type ReservationSeed = {
  businessDay: number;
  resource: string;
  start: string;
  end: string;
  title: string;
  owner: string;
  attendees: number;
  status: ReservationStatus;
  notes: string;
};

const reservationSeeds: ReservationSeed[] = [
  {
    businessDay: 0,
    resource: "Boardroom A",
    start: "19:00",
    end: "20:00",
    title: "Evening engineering planning",
    owner: "marcus.lee@primewave.lab",
    attendees: 6,
    status: ReservationStatus.CONFIRMED,
    notes: "Evening planning session scheduled from 19:00 Sri Lanka time.",
  },
  {
    businessDay: 1,
    resource: "Boardroom A",
    start: "09:00",
    end: "10:00",
    title: "Engineering sprint planning",
    owner: "marcus.lee@primewave.lab",
    attendees: 8,
    status: ReservationStatus.CONFIRMED,
    notes: "Review priorities and assign the week's engineering work.",
  },
  {
    businessDay: 1,
    resource: "Boardroom A",
    start: "10:00",
    end: "11:00",
    title: "Product roadmap review",
    owner: "alex.morgan@primewave.lab",
    attendees: 6,
    status: ReservationStatus.CONFIRMED,
    notes: "Adjacent to the earlier meeting; the room is available from 11:00.",
  },
  {
    businessDay: 2,
    resource: "Huddle Room 2",
    start: "09:00",
    end: "10:00",
    title: "Design handoff",
    owner: "sofia.rossi@primewave.lab",
    attendees: 4,
    status: ReservationStatus.CONFIRMED,
    notes: "",
  },
  {
    businessDay: 2,
    resource: "Training Lab",
    start: "09:00",
    end: "11:00",
    title: "Cloud onboarding workshop",
    owner: "noah.chen@primewave.lab",
    attendees: 16,
    status: ReservationStatus.CONFIRMED,
    notes: "",
  },
  {
    businessDay: 3,
    resource: "Podcast Studio",
    start: "13:00",
    end: "15:00",
    title: "Developer experience podcast",
    owner: "sofia.rossi@primewave.lab",
    attendees: 3,
    status: ReservationStatus.PENDING,
    notes: "Awaiting communications review.",
  },
  {
    businessDay: 3,
    resource: "Projector Kit",
    start: "13:00",
    end: "14:00",
    title: "Customer demo equipment setup",
    owner: "dan.kowalski@primewave.lab",
    attendees: 1,
    status: ReservationStatus.CONFIRMED,
    notes: "Return kit to the equipment store after use.",
  },
  {
    businessDay: 4,
    resource: "Pool Car – Corolla",
    start: "09:00",
    end: "12:00",
    title: "Customer site visit",
    owner: "dan.kowalski@primewave.lab",
    attendees: 3,
    status: ReservationStatus.CONFIRMED,
    notes: "",
  },
  {
    businessDay: 4,
    resource: "Engineering War Room",
    start: "10:00",
    end: "11:30",
    title: "Platform reliability review",
    owner: "noah.chen@primewave.lab",
    attendees: 7,
    status: ReservationStatus.CONFIRMED,
    notes: "",
  },
  {
    businessDay: 5,
    resource: "Hybrid Demo Suite",
    start: "14:00",
    end: "15:00",
    title: "Partner product demonstration",
    owner: "priya.nair@primewave.lab",
    attendees: 6,
    status: ReservationStatus.PENDING,
    notes: "Confirm the external attendee list.",
  },
  {
    businessDay: 5,
    resource: "User Research Lab",
    start: "13:00",
    end: "14:30",
    title: "User interview session",
    owner: "elena.vasquez@primewave.lab",
    attendees: 5,
    status: ReservationStatus.CONFIRMED,
    notes: "Research notes are stored in the approved workspace.",
  },
  {
    businessDay: 6,
    resource: "Product Design Studio",
    start: "09:00",
    end: "11:00",
    title: "Design system workshop",
    owner: "sofia.rossi@primewave.lab",
    attendees: 6,
    status: ReservationStatus.CONFIRMED,
    notes: "Review shared components and product design standards.",
  },
  {
    businessDay: 6,
    resource: "Mobile Demo Kit",
    start: "13:00",
    end: "15:00",
    title: "Mobile product field test",
    owner: "priya.nair@primewave.lab",
    attendees: 1,
    status: ReservationStatus.CONFIRMED,
    notes: "",
  },
  {
    businessDay: 7,
    resource: "Pool Car – EV",
    start: "09:00",
    end: "12:00",
    title: "Regional office visit",
    owner: "dan.kowalski@primewave.lab",
    attendees: 3,
    status: ReservationStatus.CONFIRMED,
    notes: "",
  },
];

function sriLankaDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function sriLankaMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((value) => value.type === "hour")!.value);
  const minute = Number(parts.find((value) => value.type === "minute")!.value);
  return hour * 60 + minute;
}

function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function nextWeekday(date: string) {
  let next = addCalendarDays(date, 1);
  while ([0, 6].includes(new Date(`${next}T00:00:00Z`).getUTCDay())) {
    next = addCalendarDays(next, 1);
  }
  return next;
}

function businessDate(anchor: string, businessDay: number) {
  let date = anchor;
  for (let day = 0; day < businessDay; day += 1) {
    date = nextWeekday(date);
  }
  return date;
}

function isWeekday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function atSriLankaTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes));
}

function dateKey(date: Date) {
  return sriLankaDate(date);
}

function assertTargetDataIsManaged(
  existingUsers: { email: string }[],
  existingResources: { name: string }[],
  existingReservations: {
    title: string;
    user: { email: string };
    resource: { name: string };
  }[],
) {
  const managedEmails: Set<string> = new Set(users.map((user) => user.email));
  const managedResourceNames: Set<string> = new Set(resources.map((resource) => resource.name));
  const managedReservationTitles = new Set([
    ...legacyReservationTitles,
    ...reservationSeeds.map((reservation) => reservation.title),
  ]);

  const unknownUser = existingUsers.find((user) => !managedEmails.has(user.email));
  if (unknownUser) {
    throw new Error(`Refusing to replace data: unrecognized user ${unknownUser.email} exists.`);
  }

  const unknownResource = existingResources.find((resource) => !managedResourceNames.has(resource.name));
  if (unknownResource) {
    throw new Error(`Refusing to replace data: unrecognized resource "${unknownResource.name}" exists.`);
  }

  const unknownReservation = existingReservations.find(
    (reservation) =>
      !managedReservationTitles.has(reservation.title) ||
      !managedEmails.has(reservation.user.email) ||
      !managedResourceNames.has(reservation.resource.name),
  );
  if (unknownReservation) {
    throw new Error(
      `Refusing to replace data: unrecognized reservation "${unknownReservation.title}" exists.`,
    );
  }
}

async function main() {
  if (resources.length !== 14 || users.length !== 7 || reservationSeeds.length !== 14) {
    throw new Error("The development dataset definition does not match its requested size.");
  }

  const adminCount = users.filter((user) => user.role === UserRole.ADMIN).length;
  const memberCount = users.filter((user) => user.role === UserRole.MEMBER).length;
  if (adminCount !== 1 || memberCount !== 6) {
    throw new Error("The development dataset must contain one admin and six members.");
  }

  const now = new Date();
  const today = sriLankaDate(now);
  let anchorDate = sriLankaMinutes(now) >= 19 * 60 ? nextWeekday(today) : today;
  while (!isWeekday(anchorDate)) anchorDate = addCalendarDays(anchorDate, 1);
  const reservations = reservationSeeds.map((reservation) => {
    const date = businessDate(anchorDate, reservation.businessDay);
    return {
      ...reservation,
      date,
      startAt: atSriLankaTime(date, reservation.start),
      endAt: atSriLankaTime(date, reservation.end),
    };
  });
  for (let i = 0; i < reservations.length; i += 1) {
    const reservation = reservations[i];
    const startMinutes = Number(reservation.start.slice(0, 2)) * 60 + Number(reservation.start.slice(3));
    const endMinutes = Number(reservation.end.slice(0, 2)) * 60 + Number(reservation.end.slice(3));
    const resource = resources.find((item) => item.name === reservation.resource);
    if (!resource || !resource.isActive) {
      throw new Error(`Seed reservation "${reservation.title}" uses an unavailable resource.`);
    }
    if (
      startMinutes < 0 ||
      endMinutes > 24 * 60 ||
      startMinutes % 15 !== 0 ||
      endMinutes % 15 !== 0 ||
      endMinutes <= startMinutes ||
      endMinutes - startMinutes > 12 * 60
    ) {
      throw new Error(`Invalid time range in seed reservation "${reservation.title}".`);
    }
    if (reservation.attendees < 1 || reservation.attendees > resource.capacity) {
      throw new Error(`Invalid attendee count in seed reservation "${reservation.title}".`);
    }
    if (reservation.endAt <= reservation.startAt) {
      throw new Error(`Invalid time range in seed reservation "${reservation.title}".`);
    }
    const conflict = reservations.slice(i + 1).find(
      (other) =>
        other.resource === reservation.resource &&
        reservation.status !== ReservationStatus.CANCELLED &&
        other.status !== ReservationStatus.CANCELLED &&
        reservation.startAt < other.endAt &&
        reservation.endAt > other.startAt,
    );
    if (conflict) {
      throw new Error(`Overlapping seed reservations: "${reservation.title}" and "${conflict.title}".`);
    }
  }

  const passwordHash = hashPassword(DEMO_PASSWORD);
  const result = await prisma.$transaction(async (tx) => {
    const [existingUsers, existingResources, existingReservations] = await Promise.all([
      tx.user.findMany({ select: { email: true } }),
      tx.resource.findMany({ select: { name: true } }),
      tx.reservation.findMany({
        select: {
          id: true,
          title: true,
          user: { select: { email: true } },
          resource: { select: { name: true } },
        },
      }),
    ]);
    assertTargetDataIsManaged(existingUsers, existingResources, existingReservations);

    const reservationIds = existingReservations.map((reservation) => reservation.id);
    const removedNotifications =
      reservationIds.length > 0
        ? await tx.notification.deleteMany({ where: { reservationId: { in: reservationIds } } })
        : { count: 0 };
    const removedReservations =
      reservationIds.length > 0
        ? await tx.reservation.deleteMany({ where: { id: { in: reservationIds } } })
        : { count: 0 };

    const userIds = new Map<string, string>();
    for (const user of users) {
      const row = await tx.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          department: user.department,
          jobTitle: user.jobTitle,
          passwordHash,
          role: user.role,
          isActive: true,
        },
        create: {
          ...user,
          passwordHash,
          isActive: true,
        },
        select: { id: true },
      });
      userIds.set(user.email, row.id);
    }

    const resourceIds = new Map<string, string>();
    for (const resource of resources) {
      const matches = await tx.resource.findMany({
        where: { name: resource.name },
        select: { id: true },
      });
      if (matches.length > 1) {
        throw new Error(`Refusing to seed: duplicate resource name "${resource.name}" exists.`);
      }
      const row = matches.length === 1
        ? await tx.resource.update({
            where: { id: matches[0].id },
            data: resource,
            select: { id: true },
          })
        : await tx.resource.create({ data: resource, select: { id: true } });
      resourceIds.set(resource.name, row.id);
    }

    const firstDate = new Date(`${anchorDate}T00:00:00.000Z`);
    const lastDate = new Date(`${dateKey(reservations[reservations.length - 1].startAt)}T00:00:00.000Z`);
    const settings = await tx.bookingSettings.findUnique({
      where: { id: 1 },
      select: { restrictSaturday: true, restrictSunday: true },
    });
    const blocks = await tx.bookingBlock.findMany({
      where: { date: { gte: firstDate, lte: lastDate } },
      select: { date: true, resourceId: true },
    });
    if (
      (settings?.restrictSaturday && reservations.some((reservation) => new Date(`${reservation.date}T00:00:00Z`).getUTCDay() === 6)) ||
      (settings?.restrictSunday && reservations.some((reservation) => new Date(`${reservation.date}T00:00:00Z`).getUTCDay() === 0))
    ) {
      throw new Error("Refusing to seed reservations on dates restricted by the booking settings.");
    }
    const conflictingBlock = blocks.find((block) =>
      reservations.some(
        (reservation) =>
          reservation.date === block.date.toISOString().slice(0, 10) &&
          (block.resourceId === null || block.resourceId === resourceIds.get(reservation.resource)),
      ),
    );
    if (conflictingBlock) {
      throw new Error("Refusing to seed: a booking block intersects a sample reservation.");
    }

    for (const reservation of reservations) {
      const resourceId = resourceIds.get(reservation.resource);
      const userId = userIds.get(reservation.owner);
      if (!resourceId || !userId) {
        throw new Error(`Missing seed relation for reservation "${reservation.title}".`);
      }
      const created = await tx.reservation.create({
        data: {
          resourceId,
          userId,
          title: reservation.title,
          description: reservation.notes || null,
          attendees: reservation.attendees,
          startAt: reservation.startAt,
          endAt: reservation.endAt,
          status: reservation.status,
        },
        select: { id: true, userId: true },
      });
      await tx.notification.create({
        data: {
          userId: created.userId,
          reservationId: created.id,
          type: NotificationType.RESERVATION_CREATED,
          title: reservation.status === ReservationStatus.PENDING ? "Reservation pending" : "Reservation confirmed",
          message: `${reservation.title} is on the calendar.`,
        },
      });
    }

    const [userCount, adminUsers, memberUsers, resourceCount, reservationCount] = await Promise.all([
      tx.user.count(),
      tx.user.count({ where: { role: UserRole.ADMIN } }),
      tx.user.count({ where: { role: UserRole.MEMBER } }),
      tx.resource.count(),
      tx.reservation.count(),
    ]);
    if (
      userCount !== users.length ||
      adminUsers !== 1 ||
      memberUsers !== 6 ||
      resourceCount !== resources.length ||
      reservationCount !== reservationSeeds.length
    ) {
      throw new Error("Final seed counts did not match the requested dataset; rolling back.");
    }

    return {
      removedReservations: removedReservations.count,
      removedNotifications: removedNotifications.count,
      createdUsers: users.length,
      createdResources: resources.length,
      createdReservations: reservations.length,
    };
  });

  console.log("Seeded local Prime Reserve development dataset.");
  console.log(JSON.stringify(result));
  console.log(`Demo password for all accounts: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

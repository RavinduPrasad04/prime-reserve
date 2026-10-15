# Prime Reserve

Prime Reserve is a resource reservation management system that helps organizations manage shared rooms, studios, equipment, and vehicles. Members can check availability and manage reservations, while administrators manage resources, users, and booking restrictions.

## Features

- **Authentication and authorization** — Secure sign-in, member registration, profile management, and role-based access.
- **Resource management** — Create, update, deactivate, and manage shared resources.
- **Reservation management** — Create, view, update, and cancel reservations.
- **Availability checking** — Check resource availability before booking.
- **Calendar views** — View reservations in daily, weekly, and monthly calendars.
- **Conflict prevention** — Application validation and PostgreSQL constraints prevent overlapping active reservations for the same resource.
- **Booking restrictions** — Manage date-specific booking blocks and weekend restrictions.
- **Notifications** — Notify users about reservation changes and provide notification management.
- **Dashboard** — View reservation statistics and upcoming bookings.

## User Roles

### Member
- View available resources and reservations.
- Check availability and create reservations.
- Manage their own upcoming reservations.
- View notifications and update their profile.

### Administrator
- Manage user accounts and resources.
- View and manage reservations.
- Configure booking restrictions and date-specific blocks.
- Manage account status and resource availability.

## Technology Stack

| Technology | Purpose |
|---|---|
| Next.js 16 (App Router) | Application framework and Server Actions |
| React 19 | User interface |
| TypeScript 5 | Type-safe development |
| PostgreSQL | Relational database |
| Prisma ORM 7 | Database schema, migrations, and queries |
| Tailwind CSS 4 | Styling |
| Node.js Crypto | Password hashing and session signing |
| Lucide React | Icons |
| Motion | Interface animations |

## Database Design

The application uses PostgreSQL with Prisma ORM and five primary models:

- **User** — Account details, credentials, roles, and account status.
- **Resource** — Shared resource details, capacity, location, and availability status.
- **Reservation** — Booking details, time ranges, ownership, and cancellation records.
- **BookingBlock** — Global or resource-specific date restrictions.
- **BookingSettings** — Weekend booking restriction settings.
- **Notification** — Reservation-related notifications and read status.

The database uses UUID identifiers for the main entities, foreign keys, indexes, and validation constraints.

A PostgreSQL exclusion constraint prevents overlapping non-cancelled reservations for the same resource. Application-level validation and transactional conflict checks provide additional protection.

## Security and Validation

- Passwords are stored using salted scrypt hashes.
- Sessions use signed, HTTP-only cookies.
- Server Actions enforce authentication and role-based authorization.
- Reservation operations validate resource availability, capacity, booking times, and restrictions.
- Database constraints provide an additional safeguard against conflicting reservations.
- Environment variables keep local database configuration and production secrets outside the source code.

## Getting Started

### Prerequisites

- Node.js 20.19+, 22.12+, or 24+
- npm
- PostgreSQL
- A database role with permission to use the required PostgreSQL extensions, or the required extensions already installed

### 1. Clone the repository

```bash
git clone https://github.com/RavinduPrasad04/prime-reserve.git
cd prime-reserve
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local environment file from the example:

```powershell
Copy-Item .env.example .env
```

Configure `DATABASE_URL` with your PostgreSQL connection string and set `SESSION_SECRET` to a long, random value.

**Never commit your `.env` file or production secrets.**

### 4. Apply database migrations

```bash
npm run prisma:deploy
```

To populate the local development database with demo data:

```bash
npm run prisma:seed
```

**Note:** The seed script is intended for local development and can replace existing demo reservations and related notifications. Use only a disposable development database.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Generate Prisma Client and build the application |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit` | Check TypeScript types |
| `npm test` | Run validation tests |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:deploy` | Apply database migrations |
| `npm run prisma:status` | Check migration status |
| `npm run prisma:seed` | Seed the local development database |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run db:check` | Check database connectivity and tables |

## Project Structure

```text
prime-reserve/
├── app/
│   ├── (auth)/             # Login and registration
│   ├── (workspace)/        # Main application pages
│   ├── actions/            # Server Actions
│   ├── globals.css         # Global styles
│   └── layout.tsx          # Root layout
├── components/
│   ├── layout/             # Navigation and workspace layout
│   └── ui/                 # Reusable UI components
├── lib/                    # Authentication, validation, and utilities
├── prisma/
│   ├── migrations/         # Database migrations
│   ├── schema.prisma       # Database schema
│   └── seed.ts              # Development seed data
├── scripts/                # Database utility scripts
├── .env.example            # Environment variable template
├── package.json
└── README.md
```

### Development Tools and Approach

- **GitHub Copilot** - Used AI-assisted development to accelerate implementation, explore solutions, and improve development efficiency within the three-day assessment period.
- **Git and GitHub** - Used for version control and source code management.
- **Manual Testing** - Tested the application step by step by checking key features, validating user workflows, and verifying reservation behavior.

## Future Improvements

- Introduce an optional reservation approval workflow.
- Support configurable opening hours and duration limits per resource.
- Expand automated integration tests for database constraints and Server Actions.
- Improve deployment documentation and production monitoring.

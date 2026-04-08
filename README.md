# PMO Tracker - Project Migration Tracking System

A production-ready MVP for tracking project migrations, similar to SharePoint tracker + BigPicture-style planning.

## Features

- **Dashboard**: Real-time overview with stats, charts, and activity feed
- **Project Tracking**: Full CRUD operations with filtering and sorting
- **Delay Tracking**: Automatic calculation of delay days and status
- **Phase Management**: Track project lifecycle (Kickoff → Migration → Validation → Closure)
- **Notifications**: Email alerts for delays, completions, and reminders
- **Case Studies**: Track and generate case studies for completed projects
- **AI-Ready**: Placeholder services for future AI agent integration

## Tech Stack

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- TanStack Query (React Query)
- TanStack Table
- Recharts
- React Hook Form + Zod

### Backend
- Node.js + Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Node-cron (background jobs)
- Nodemailer (notifications)
- Winston (logging)

## Project Structure

```
PMO/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma    # Database schema
│   │   └── seed.ts          # Sample data
│   └── src/
│       ├── config/          # Database configuration
│       ├── controllers/     # Route handlers
│       ├── jobs/            # Cron jobs
│       ├── middleware/      # Express middleware
│       ├── routes/          # API routes
│       ├── services/        # Business logic
│       └── utils/           # Utilities
├── frontend/
│   └── src/
│       ├── app/             # Next.js pages
│       ├── components/      # React components
│       ├── hooks/           # Custom hooks
│       ├── lib/             # Utilities
│       ├── services/        # API client
│       └── types/           # TypeScript types
├── docker-compose.yml
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### Option 1: Docker (Recommended)

```bash
# Start all services
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000
# Backend: http://localhost:3001
```

### Option 2: Manual Setup

#### 1. Database Setup

```bash
# Create PostgreSQL database
createdb pmo_tracker
```

#### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your database credentials

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed sample data
npm run db:seed

# Start development server
npm run dev
```

#### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local file
cp .env.example .env.local

# Start development server
npm run dev
```

## API Endpoints

### Projects
- `GET /api/projects` - List all projects (with filtering/pagination)
- `POST /api/projects` - Create a new project
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update a project
- `DELETE /api/projects/:id` - Delete a project
- `GET /api/projects/delayed` - Get delayed projects

### Dashboard
- `GET /api/dashboard/overview` - Complete dashboard data
- `GET /api/dashboard/stats` - Statistics
- `GET /api/dashboard/delay-summary` - Delay summary
- `GET /api/dashboard/upcoming-deadlines` - Upcoming deadlines

### Phases
- `GET /api/phases/project/:projectId` - Get project phases
- `PUT /api/phases/:id` - Update a phase
- `POST /api/phases/:projectId/complete/:phaseName` - Complete a phase

### Case Studies
- `GET /api/case-studies` - List all case studies
- `POST /api/case-studies` - Create a case study
- `POST /api/case-studies/generate/:projectId` - Generate with AI

### Notifications
- `GET /api/notifications` - List notifications

## Business Logic

### Delay Calculation

```typescript
// delay_days = actual_end - planned_end (in days)
// If project is ongoing: delay_days = current_date - planned_end

if (delay_days > 0) {
  delay_status = "DELAYED";
} else if (remaining_days <= 7) {
  delay_status = "AT_RISK";
} else {
  delay_status = "NOT_DELAYED";
}
```

### Project Phases

1. **KICKOFF** - Project initiation
2. **MIGRATION** - Data/system migration
3. **VALIDATION** - Testing and verification
4. **CLOSURE** - Final handoff
5. **COMPLETED** - Project finished

### Automated Jobs

- **Daily Delay Check** (6:00 AM): Updates delay status for all active projects
- **Weekly Case Study Reminder** (Monday 9:00 AM): Reminds about pending case studies

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://user:password@localhost:5432/pmo_tracker
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
ENABLE_CRON_JOBS=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Future AI Extensions

The system is designed to support future AI capabilities:

1. **Delay Prediction Agent**: Predict potential delays based on historical data
2. **Case Study Generator**: Auto-generate case studies from project data
3. **Risk Analysis Agent**: Analyze project risks and suggest mitigations

See `backend/src/services/aiService.ts` for the placeholder implementation.

## Deployment

### Vercel (Frontend)
```bash
cd frontend
vercel deploy
```

### DigitalOcean/AWS (Backend)
1. Set up PostgreSQL database
2. Deploy backend container or Node.js app
3. Configure environment variables
4. Set up SSL/TLS

## License

MIT

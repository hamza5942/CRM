# CRM and attendance API

## Setup

1. Copy `.env.example` to `.env` and set a MongoDB connection string and a random `JWT_SECRET` of at least 32 bytes.
2. Install dependencies with `npm install`.
3. Provision the first administrator using `npm run create-admin` with `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` set. The bootstrap command refuses to run if an administrator already exists.
4. Start the API with `npm start` (or `npm run dev` during development).

New accounts are created by an authenticated administrator with `POST /api/auth/register`. Public registration is intentionally disabled so anonymous clients cannot create administrator accounts.

## Authentication

Login at `POST /api/auth/login` with `{ "email": "...", "password": "..." }`. Send the returned token on protected endpoints as `Authorization: Bearer <token>`. Tokens expire after `JWT_EXPIRES_IN` (default `1h`).

## Routes

- `POST /api/auth/login` — authenticate and receive a JWT.
- `POST /api/auth/register` — admin-only; create an `admin` or `employee`.
- `GET /api/auth/users` — admin-only; list active employee accounts. Set `includeInactive=true` to include deactivated accounts.
- `PATCH /api/auth/users/:id` — admin-only; update an employee's name, email, password, or active status.
- `DELETE /api/auth/users/:id` — admin-only; deactivate an employee account while retaining its task and attendance history. Deactivated employees cannot log in, and their existing tokens are rejected.
- `DELETE /api/auth/users/:id/permanent` — admin-only; permanently delete an employee account but retain its existing task and attendance documents.
- `POST /api/attendance/clock-in` — employee-only; create today's UTC attendance record.
- `POST /api/attendance/clock-out` — employee-only; close today's record and summarize active/idle heartbeat samples.
- `POST /api/attendance/heartbeat` — employee-only; accepts `{ "status": "active" | "idle" | "offline" }` while clocked in. The API records server time and derives the employee identity from the JWT.
- `GET /api/attendance/today` — employee-only; return the authenticated employee's attendance record for today, or `null`.
- `GET /api/attendance/daily` — admin-only; list today's employee accounts with attendance records and heartbeat-derived status.
- `GET /api/attendance/live` — admin-only; lists employees and their latest status. Missing or older-than-two-minute heartbeats are reported as `offline`.
- `/api/tasks` — authenticated CRUD. Employees can access their own tasks; administrators can manage tasks across employees. List routes accept `page` and `limit` (maximum 100).
- `/api/leads` — authenticated CRUD. List routes accept `page` and `limit` (maximum 100).

Attendance dates use UTC calendar days. Active and idle summary minutes count the corresponding heartbeat samples, which are expected at approximately one-minute intervals.

Set `CORS_ORIGINS` to a comma-separated list of allowed browser origins. Requests without an `Origin` header are allowed for non-browser clients.

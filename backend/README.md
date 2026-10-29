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
- `/api/leads` — authenticated CRUD. Leads can include website URL, `domainName`, `websiteName`, `techStack`, `websiteProjectStartDate`, and `websiteProjectEndDate`. List routes accept `page` and `limit` (maximum 100).

Attendance dates use UTC calendar days. Active and idle summary minutes count the corresponding heartbeat samples, which are expected at approximately one-minute intervals.

Set `CORS_ORIGINS` to a comma-separated list of allowed browser origins. If it is unset, the API allows `https://crm-frontend-cyan-six.vercel.app`, `http://localhost:3000`, and `http://localhost:5173`. Requests without an `Origin` header are allowed for non-browser clients. The CORS middleware handles preflight `OPTIONS` requests.

## Deploy the API to Vercel

The Express app is exported from `server.js` for Vercel's Express runtime, and `api/[...path].js` also exposes the existing `/api` routes as a catch-all Node.js Function. The app validates its runtime configuration and connects to MongoDB when handling a request; warm function instances reuse the Mongoose connection. `npm start` remains available for local or traditional server hosting.

1. Import the repository into Vercel and set the project's **Root Directory** to `backend`.
2. Add these environment variables to the Vercel project:
   - `MONGO_URI` — a production MongoDB connection string. Configure the MongoDB provider's network access to allow connections from Vercel.
   - `JWT_SECRET` — a random secret containing at least 32 bytes.
   - `CORS_ORIGINS` — the exact frontend origin, for example `https://crm-frontend-cyan-six.vercel.app`. This setting replaces the code defaults; include local or additional frontend origins as comma-separated values if needed.
   - `JWT_EXPIRES_IN` — optional; defaults to `1h`.
3. Deploy. The API routes remain under `/api`, for example `https://your-backend.vercel.app/api/auth/login`.
4. In the frontend Vercel project, set `NEXT_PUBLIC_API_URL` to the backend deployment origin only (for example, `https://your-backend.vercel.app`), then redeploy the frontend.
5. Create the initial admin once by running `npm run create-admin` from `backend` with `MONGO_URI`, `ADMIN_NAME`, `ADMIN_EMAIL`, and a new `ADMIN_PASSWORD` available to that command. Do not commit these values or put them in `NEXT_PUBLIC_*` variables.

Vercel runs the backend as a serverless function, not as a continuously running server. Do not use `npm start` as the Vercel deployment command; Vercel invokes the function in `api/[...path].js`.

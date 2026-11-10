# Codex Solutions — Full-Stack CRM & Desktop Activity Tracker

A unified enterprise platform combining Sales Pipeline & Lead Management, Real-Time Team Attendance, and an Automated Windows Desktop Activity Daemon.

---

## 📁 Repository Structure

```
├── backend/            # Express.js REST API, MongoDB Mongoose Models & Socket.IO Realtime
├── frontend/           # Next.js (App Router), React 19, Tailwind CSS Web Portal
└── desktop-app/        # Electron Windows Daemon, System Idle Detection (powerMonitor)
```

---

## 🚀 Quick Start Guide

### 1. Backend (`backend/`)
```bash
cd backend
npm install
# Configure your MongoDB URI and JWT secrets in .env
npm run dev
```
Runs at `http://localhost:5000` (or deployed serverless on Vercel).

### 2. Frontend (`frontend/frontend/`)
```bash
cd frontend/frontend
npm install
npm run dev
```
Runs at `http://localhost:3000`.

### 3. Desktop Tracker (`desktop-app/`)
```bash
cd desktop-app
npm install
npm start
```
To package the Windows 1-click installer:
```bash
npm run dist
```
Generates `dist/Employee Tracker Setup 1.0.0.exe`.

---

## ⚡ Core Features

- **Sales CRM:** Interactive Kanban pipeline, drag-and-drop lead stages, deal valuation, contact notes, and win/loss analytics.
- **Attendance & Work Shifts:** Single clock-in/out on the web portal with multi-shift resumption support.
- **Automated Desktop Tracking:** Native Windows daemon monitors mouse/keyboard inactivity without invasive keylogging or screen spying.
- **Real-Time Heartbeats:** 60-second pulses synchronize live active and idle minutes directly to MongoDB Atlas.
- **Enterprise Security:** Windows DPAPI hardware encryption (`safeStorage`) for zero-login persistent sessions.

# Employee Tracker desktop app

## Run

1. Start the backend and MongoDB.
2. Copy `.env.example` to `.env` and set `API_BASE_URL` if the API is not at `http://localhost:5000/api`.
3. In `desktop-app/`, run `npm install`, then `npm start`.
4. Sign in with an employee account and select **Start tracking**. This clocks the employee in and starts authenticated minute-by-minute heartbeats.

The window's close button hides the app in the system tray. Choose **Quit** from the tray menu to exit. Locking the computer reports `idle`; system suspend reports `offline` on the next available update. Idle time defaults to five minutes and can be changed with `IDLE_THRESHOLD_SECONDS`.

Set `AUTO_LAUNCH=true` to enable launch-at-login for packaged builds; automatic launches start hidden in the tray. Electron does not apply login-item settings when launched as an unpackaged development app.

The session token is encrypted using Electron `safeStorage` and saved under Electron's per-user application data folder. The stored token expires according to the backend JWT expiry (one hour by default); after expiration, sign in again. **Sign out** attempts to clock out before clearing the saved session.

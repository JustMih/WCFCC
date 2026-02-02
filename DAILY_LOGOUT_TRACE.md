# Daily logout at 2 PM – backend to frontend trace

- **Agents:** Automatic logout when the time reaches **2:00 PM** (14:00) server local time.
- **Other roles (supervisor, admin, etc.):** Forced logout after **24 hours** from login (token and session expire after 24h).

---

## 1. Backend – when the user logs in

**File:** `WCFCC/controllers/auth/authController.js`

1. **`getSecondsUntilNextDailyLogout()`**  
   - Reads `DAILY_LOGOUT_TIME` from env (default `"14:00"` = 2 PM).  
   - Computes seconds from “now” until the next 2 PM (server local time).  
   - If it’s already past 2 PM today, the target is 2 PM tomorrow.

2. **`getNextDailyLogoutDate()`**  
   - Same time (2 PM) as a `Date` object.  
   - Used to send `expiresAt` (ms) to the frontend for **agents only**.

3. **`login` handler**  
   - **Agents:** JWT `expiresIn` = seconds until next 2 PM; `expiresAt` = that 2 PM time. Token and session end at 2 PM.  
   - **Other roles (supervisor, admin, etc.):** JWT `expiresIn` = 24h; `expiresAt` = now + 24h. Forced logout after 24 hours.  
   - Response always includes `expiresAt` (ms) so the frontend knows when the session ends.

**Result:** Agent logins get a token that expires at the next 2 PM; other roles get a 24h token and are forced to logout after 24 hours.

---

## 2. Backend – at 2 PM (cron)

**File:** `WCFCC/cron/dailyLogoutJob.js`  
**Loaded in:** `WCFCC/server.js` (`require("./cron/dailyLogoutJob")`)

- **Schedule:** `0 14 * * *` = every day at 14:00 (2 PM) server local time.
- **Job (agents only):**
  - Sets **User** rows with `role: 'agent'` to `status: 'offline'`.
  - Sets **AgentStatus** rows with `status: 'online'` to `status: 'offline'` and `logoutTime: now`.

**Result:** At 2 PM the database reflects “all agents logged out”; supervisors/admins stay online.  
Keep cron time in sync with `DAILY_LOGOUT_TIME` (e.g. if you change to 3 PM, use `DAILY_LOGOUT_TIME=15:00` and cron `0 15 * * *`).

---

## 3. Frontend – when the user logs in

**File:** `WCFFinal/src/auth/login-page/Login.js`

- After successful login, reads **`data.expiresAt`** (ms) from the backend.
- Stores **`tokenExpiration`** in `localStorage` (as string; frontend treats it as number when comparing).
- If `expiresAt` is missing, falls back to “now + 1 hour”.

**Result:** The browser knows the session end time (2 PM) in local storage.

---

## 4. Frontend – while the user is using the app

**File:** `WCFFinal/src/App.js`

1. **`checkTokenExpiration()`**  
   - Reads `authToken` and `tokenExpiration` from `localStorage`.  
   - If `Date.now() >= tokenExpiration`, calls **`clearSessionAndRedirect()`**.

2. **When it runs**  
   - Once on mount.  
   - Every **15 seconds** via `setInterval`.  
   - When the tab becomes visible again (`visibilitychange` → “visible”).

3. **`clearSessionAndRedirect()`**  
   - Clears `authToken`, `tokenExpiration`, `username`, `role`, `userId`, `extension`, etc.  
   - Clears domain credentials.  
   - Sets `sessionStorage.logoutMessage` to “Session ended (daily logout at 2 PM).”.  
   - Redirects to `/login`.

**Result:** Once the clock reaches 2 PM, within about 15 seconds (or as soon as they switch back to the tab), the user is logged out and sent to the login page with the message.

---

## 5. API calls after 2 PM

- JWT is expired at 2 PM, so any request with `Authorization: Bearer <token>` gets **401** from the backend (e.g. `WCFCC/middleware/authMiddleware.js`).
- Your API clients (e.g. `userApi.js`, `ticketApi.js`) that handle 401 can clear session and redirect to login; the App.js check also forces logout when `tokenExpiration` has passed.

---

## Summary flow

```
Backend .env: DAILY_LOGOUT_TIME=14:00  (optional; default is 14:00)

Login (backend)
  → Agents: JWT expires at next 2 PM, expiresAt = that time
  → Other roles: JWT 24h, expiresAt = now + 24h
  → Response: { token, expiresAt: <ms> }

Login (frontend)
  → localStorage.tokenExpiration = data.expiresAt

Every 15 s + on tab visible (frontend)
  → if Date.now() >= tokenExpiration → clearSessionAndRedirect() → /login
  (Agents: logout at 2 PM, message “daily logout at 2 PM”. Others: logout after 24h, message “24 hour session limit”.)

At 2 PM (backend cron, agents only)
  → User where role='agent': status = 'offline'
  → AgentStatus (online) → 'offline'
```

---

## Troubleshooting (agent not logged out at DAILY_LOGOUT_TIME)

1. **24h format**  
   `DAILY_LOGOUT_TIME` is in **24-hour server local time**.  
   - **02:24** = 2:24 **AM**  
   - **14:24** = 2:24 **PM**  
   If you want logout at 2:24 PM, use `DAILY_LOGOUT_TIME=14:24`, not `02:24`.

2. **Restart backend**  
   After changing `.env`, restart the WCFCC server so it reads the new `DAILY_LOGOUT_TIME`.

3. **Log in as agent**  
   Only users with role **agent** get the DAILY_LOGOUT_TIME expiry. Supervisors/admins get 24h. Role check is case-insensitive.

4. **Backend logs (agent login)**  
   On agent login the server logs:  
   `[Agent login] DAILY_LOGOUT_TIME: ...`  
   `[Agent login] Token expires at (server local): ...`  
   `[Agent login] expiresAt (ms): ... | in X minutes`  
   Confirm the “Token expires at” time is when you expect (same timezone as your clock).

5. **Frontend logs**  
   After login, open DevTools → Console. You should see:  
   `[Login] role: agent | tokenExpiration: <date string> | ms: <number>`  
   When the session expires you should see:  
   `[Session] Token expired at ... – redirecting to login.`

6. **Check localStorage**  
   DevTools → Application → Local Storage. After login you should have `tokenExpiration` (a number in ms). When the current time (in ms) is past that value, the next frontend check (every 5 s) will redirect to login.

7. **Frontend check interval**  
   The expiry check runs every **5 seconds** and when you switch back to the tab. So logout happens within about 5 seconds after the expiry time.

---

## Changing the logout time

- **Backend:** Set `DAILY_LOGOUT_TIME=HH:MM` in `WCFCC/.env` (e.g. `15:00` for 3 PM).  
- **Cron:** Edit `WCFCC/cron/dailyLogoutJob.js` and change `"0 14 * * *"` to match (e.g. `"0 15 * * *"` for 3 PM).  
- **Frontend message:** In `WCFFinal/src/App.js`, update the string `"Session ended (daily logout at 2 PM)."` if you want the message to reflect the new time.

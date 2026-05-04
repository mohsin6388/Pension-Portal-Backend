# KMC Pensioner Portal — Backend API

**Kanpur Municipal Corporation** | Node.js + Express + LokiJS

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env config
cp .env.example .env

# 3. Start dev server (auto-reload)
npm run dev

# 4. Start production server
npm start
```

Server starts at **http://localhost:5000**

---

## Default Credentials (seeded on first run)

| Username | Password    | Role    | Permissions |
|----------|-------------|---------|-------------|
| `admin`  | `Admin@1234`| admin   | Full access |
| `cfo`    | `Cfo@1234`  | cfo     | Approve / reject actions |
| `clerk`  | `Clerk@1234`| clerk   | Create & update pensioners, submit actions |

---

## Architecture

```
kmc-backend/
├── src/
│   ├── app.js                      # Express entry point
│   ├── config/
│   │   └── database.js             # LokiJS init + seed
│   ├── middleware/
│   │   └── auth.js                 # JWT verify, role guard, audit logger
│   ├── controllers/
│   │   ├── authController.js       # Login, refresh, logout, change-pw
│   │   ├── pensionerController.js  # Pensioner CRUD
│   │   ├── pensionActionController.js  # Stop / Resume / Close + Approve / Reject
│   │   ├── userController.js       # User management (admin only)
│   │   └── documentController.js  # File uploads
│   └── routes/
│       ├── auth.js
│       ├── pensioners.js
│       ├── pensionActions.js
│       ├── users.js
│       └── documents.js
├── data/                           # LokiJS DB file (auto-created)
├── uploads/                        # Uploaded documents (auto-created)
├── .env.example
└── package.json
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Server port |
| `JWT_SECRET` | (change me!) | Secret for access tokens |
| `JWT_REFRESH_SECRET` | (change me!) | Secret for refresh tokens |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |

---

## API Reference

All protected routes require:
```
Authorization: Bearer <accessToken>
```

---

### Auth

#### `POST /api/auth/login`
```json
Request:  { "username": "admin", "password": "Admin@1234" }
Response: { "accessToken": "...", "refreshToken": "...", "user": { ... } }
```
Rate limited: 10 attempts per 15 minutes per IP.

#### `POST /api/auth/refresh`
```json
Request:  { "refreshToken": "..." }
Response: { "accessToken": "..." }
```

#### `POST /api/auth/logout`
```json
Request:  { "refreshToken": "..." }
```
Revokes the refresh token server-side.

#### `GET /api/auth/me` 🔒
Returns the authenticated user's profile.

#### `PUT /api/auth/change-password` 🔒
```json
{ "currentPassword": "...", "newPassword": "..." }
```

---

### Pensioners

#### `GET /api/pensioners` 🔒
Query params: `status` (Active|Stopped|Closed|All), `search`, `page`, `limit`

Returns paginated list + dashboard stats.

#### `GET /api/pensioners/stats` 🔒
Returns count breakdown by status.

#### `GET /api/pensioners/:ppoOrId` 🔒
Look up by PPO number or Employee ID.

#### `POST /api/pensioners` 🔒 (admin, clerk)
```json
{
  "employeeId": "KMC-EMP-00123",
  "name": "Ramesh Kumar",
  "department": "Public Works",
  "designation": "Junior Engineer",
  "retirementDate": "2024-03-31",
  "dateOfBirth": "1964-03-31",
  "gender": "Male",
  "monthlyPension": 32500,
  "bankName": "SBI",
  "ifsc": "SBIN0001234",
  "bankAccountNo": "30123456789",
  ...
}
```
PPO number is auto-generated if not supplied.

#### `PUT /api/pensioners/:id` 🔒 (admin, clerk)
Partial update — PPO and Employee ID are immutable.

---

### Pension Actions

Clerks submit → CFO approves/rejects. Status updates only on approval.

#### `POST /api/pension-actions/stop` 🔒 (admin, clerk)
```json
{
  "ppoOrId": "KMC/2024/001",
  "stopFromDate": "2026-04-01",
  "reason": "Court Order / Legal Hold",
  "remarks": "Order ref: HC/2026/001"
}
```

#### `POST /api/pension-actions/resume` 🔒 (admin, clerk)
```json
{
  "ppoOrId": "KMC/2024/002",
  "resumeFromDate": "2026-05-01",
  "resumeReason": "Court clearance order no. XYZ",
  "arrearsOption": "Yes — Pay Full Arrears"
}
```

#### `POST /api/pension-actions/close` 🔒 (admin, clerk)
```json
{
  "ppoOrId": "KMC/2023/142",
  "closureReason": "Death of Pensioner (No Family Pension)",
  "closureDate": "2026-04-29",
  "dod": "2026-04-15",
  "dodReference": "Death cert DC/2026/001",
  "outstandingDues": 0,
  "finalRemarks": "Permanent closure authorized"
}
```

#### `GET /api/pension-actions` 🔒
Query params: `type` (STOP|RESUME|CLOSE), `status` (PENDING_APPROVAL|APPROVED|REJECTED), `ppo`

#### `PUT /api/pension-actions/:actionId/approve` 🔒 (admin, cfo)
Applies the action and updates pensioner status.

#### `PUT /api/pension-actions/:actionId/reject` 🔒 (admin, cfo)
```json
{ "rejectionReason": "Insufficient documentation" }
```

---

### Users (Admin Only)

#### `GET /api/users` 🔒 (admin)
#### `POST /api/users` 🔒 (admin)
```json
{
  "username": "newclerk",
  "email": "clerk2@kmc.gov.in",
  "password": "Secure@1234",
  "fullName": "New Clerk",
  "role": "clerk",
  "department": "Health"
}
```
Roles: `admin` | `cfo` | `clerk`

#### `PUT /api/users/:id/toggle-active` 🔒 (admin)
Activates or deactivates a user account.

---

### Documents

#### `POST /api/documents/upload/:ppo` 🔒 (admin, clerk)
`multipart/form-data` — field: `file`, optional field: `label`

Accepted: PDF, JPG, PNG (max 5MB)

#### `GET /api/documents/:ppo` 🔒
Returns document list for a given PPO number.

---

## Connecting the Frontend

In your React/TanStack app, use the base URL `http://localhost:5000`.

**Example — Login:**
```js
const res = await fetch("http://localhost:5000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
});
const { data } = await res.json();
localStorage.setItem("accessToken", data.accessToken);
localStorage.setItem("refreshToken", data.refreshToken);
```

**Example — Authenticated request:**
```js
const res = await fetch("http://localhost:5000/api/pensioners", {
  headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
});
```

**Example — PPO search (Stop form):**
```js
const res = await fetch(`http://localhost:5000/api/pensioners/KMC%2F2024%2F002`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { data } = await res.json();
// data.name, data.department, data.status, data.monthlyPension ...
```

---

## Role Matrix

| Action | admin | cfo | clerk |
|---|:---:|:---:|:---:|
| Login | ✅ | ✅ | ✅ |
| View pensioners | ✅ | ✅ | ✅ |
| Create / update pensioner | ✅ | ❌ | ✅ |
| Submit Stop / Resume / Close | ✅ | ❌ | ✅ |
| Approve / Reject actions | ✅ | ✅ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| Upload documents | ✅ | ❌ | ✅ |

---

## Production Checklist

- [ ] Change `JWT_SECRET` and `JWT_REFRESH_SECRET` to long random strings
- [ ] Set `NODE_ENV=production`
- [ ] Swap LokiJS for PostgreSQL / MySQL for multi-instance deployments
- [ ] Serve uploads via a CDN or object storage (S3)
- [ ] Enable HTTPS (reverse proxy: Nginx/Caddy)
- [ ] Change all default passwords after first login

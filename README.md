# Document Tracking System

A web-based, secure document tracking system for the **Financial Section of the Postgraduate Institute, University of Sri Jayewardenepura, Sri Lanka**.

Built to replace a manual paper-based process that handled 20–30 financial documents per day. The system provides real-time tracking, role-based access control, a configurable multi-phase approval workflow, and a full immutable audit trail.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Installation](#installation)
3. [Default Accounts](#default-accounts)
4. [System Features](#system-features)
5. [User Role Guide](#user-role-guide)
   - [Administrator](#administrator)
   - [Finance Staff](#finance-staff)
   - [Postgraduate Student](#postgraduate-student)
   - [Auditor](#auditor)
6. [API Documentation](#api-documentation)
7. [Running Tests](#running-tests)
8. [Database Management](#database-management)
9. [Project Structure](#project-structure)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 21, Bootstrap 5, TypeScript |
| Backend | Node.js 20, Express |
| Database | PostgreSQL 16 (Knex.js) |
| Document Storage | Local filesystem |
| Search | PostgreSQL full-text search (`tsvector`) |
| Email | Nodemailer (SMTP) |

---

## Installation

### Prerequisites

Install the following before proceeding:

| Tool | Minimum Version | Notes |
|---|---|---|
| Node.js | 20.x | [nodejs.org](https://nodejs.org) |
| npm | 10.x | Included with Node.js |
| PostgreSQL | 16.x | [postgresql.org](https://www.postgresql.org) |
| Git | Any | [git-scm.com](https://git-scm.com) |

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/Gayashii/document-tracking-system-2026.git
cd doc-tracking-system
```

---

### Step 2 — Install all dependencies

The project uses npm workspaces. One command installs both the server and client:

```bash
npm install
```

---

### Step 3 — Create the PostgreSQL database

Connect to PostgreSQL and create two databases — one for development, one for tests:

```bash
psql -U postgres
```

```sql
CREATE USER doc_user WITH PASSWORD 'changeme';
CREATE DATABASE doc_tracking  OWNER doc_user;
CREATE DATABASE doc_tracking_test OWNER doc_user;
\q
```

> Replace `changeme` with a strong password. Keep it consistent with the `.env` file you configure next.

---

### Step 4 — Configure the server environment

Copy the example file and edit it:

```bash
cp server/.env.example server/.env
```

Open `server/.env` and set the following **required** values:

```env
NODE_ENV=development
PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=doc_tracking
DB_USER=doc_user
DB_PASSWORD=changeme          # must match what you set in Step 3

# JWT — generate two different random strings (min 32 characters each)
JWT_ACCESS_SECRET=replace-with-a-strong-random-secret-min-32-chars
JWT_REFRESH_SECRET=replace-with-a-different-strong-random-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS — must match the Angular dev server origin
CORS_ORIGINS=http://localhost:4200

# File storage
UPLOAD_DIR=uploads/documents
MAX_FILE_SIZE_MB=20
ALLOWED_MIME_TYPES=application/pdf,image/jpeg,image/png
```

**Optional** — Email (SMTP). The server starts without these; email sending is skipped with a warning if they are absent:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASSWORD=yourpassword
EMAIL_FROM="Document Tracking System <noreply@example.com>"
```

Generate secure JWT secrets on macOS/Linux:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run that twice — use one value for `JWT_ACCESS_SECRET` and a different one for `JWT_REFRESH_SECRET`.

---

### Step 5 — Run database migrations

```bash
npm run migrate:latest --workspace=server
```

This creates all tables (`users`, `documents`, `workflows`, `audit_logs`, etc.).

---

### Step 6 — Seed development data

```bash
npm run seed:run --workspace=server
```

This creates the following accounts and reference data:

| What | Details |
|---|---|
| Admin user | `admin@pgi.ac.lk` / `Admin@1234` |
| Finance staff | `staff@pgi.ac.lk` / `Staff@1234` |
| Auditor | `auditor@pgi.ac.lk` / `Auditor@1234` |
| Departments | Finance, Registry, Examinations, Student Affairs, Research |
| Document types | Payment Receipt, Scholarship Application, Tuition Fee Form, Refund Request, Bursary Form |
| Default workflow | Two-phase flow for Payment Receipt (Verification → Approval) |
| System settings | Default overdue threshold, max file size |

> **Change default passwords immediately** if deploying to any shared environment.

---

### Step 7 — Start the development servers

Open two terminal windows and run one command in each:

**Terminal 1 — Backend API (port 3000):**

```bash
npm run dev:server
```

**Terminal 2 — Angular frontend (port 4200):**

```bash
npm run dev:client
```

Then open your browser at **http://localhost:4200**.

---

### Verify the installation

- **Frontend:** http://localhost:4200 — login page should appear
- **API:** http://localhost:3000/api/v1 — returns `{"message":"Not Found"}` (expected)
- **Swagger UI:** http://localhost:3000/docs — interactive API documentation

---

## Default Accounts

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@pgi.ac.lk` | `Admin@1234` |
| Finance Staff | `staff@pgi.ac.lk` | `Staff@1234` |
| Auditor | `auditor@pgi.ac.lk` | `Auditor@1234` |

Students self-register via the **Create Account** page at `/register`.

> Password rules: minimum 8 characters, must include uppercase, lowercase, number, and a special character (e.g. `@`, `!`, `#`).

---

## System Features

### Authentication & Session Management

- Email and password login with bcrypt hashing
- JWT access tokens (15-minute lifetime) + HTTP-only refresh tokens (7-day, rotated on use)
- Automatic silent token refresh via an Angular HTTP interceptor
- Session invalidation on logout (refresh token revoked in database)
- Password reset via email link (1-hour expiry)

### Document Management

- Upload documents as **PDF, JPEG, or PNG** (up to 20 MB by default)
- Each document is assigned a unique reference number (`PGI-YYYY-NNNNNN`) and a unique 12-digit numeric barcode on upload (Code 128 format, compatible with physical barcode printers and USB/Bluetooth readers)
- Metadata captured: title, document type, department, academic year, semester, financial amount
- Status lifecycle: `submitted → pending_approval → approved / rejected → processed`
- Version control: students can re-submit after rejection; prior files are archived in `document_versions`
- Admin-only soft delete with audit trail

### Barcode Scanning

- Every document gets a unique 12-digit numeric barcode on upload (auto-generated, Code 128 format)
- Finance staff can scan, type, or **upload a photo** of a barcode in the search box on the documents page
- Barcode image decoding happens entirely in the browser — no server upload required
- Valid barcode instantly navigates to that document's detail page

### Configurable Multi-Phase Approval Workflow

- Admins define per-document-type workflows in the **Workflow Builder**
- Each workflow has an ordered sequence of phases; each phase is assigned to a specific finance staff member
- When a student submits a document whose type has a workflow, the system automatically assigns it to the Phase 1 staff member
- Phase 1 staff can **Advance** (push to next phase) or **Return** (send back to previous phase)
- Only the staff member assigned to the **final phase** can approve or reject the document
- Documents without a workflow can be self-assigned by any finance staff member and resolved directly
- All phase transitions are logged in `document_phase_log` for full traceability

### Re-submission After Rejection

- Students can upload a new file version of a rejected document
- If the document type has a workflow, the document is automatically reset to Phase 1 and re-assigned
- If the document type has no workflow, status resets to `submitted`
- The previous file is archived and accessible in the document version history

### Search

- Advanced search at `/documents/search` with filters: keyword (full-text), document type, status, department, student, date range, financial amount range
- Results paginated with 20 items per page
- Finance staff and admin see all documents; students see only their own

### Reports

- **Pending report:** all documents currently in `submitted` or `pending_approval` state, with days pending
- **Overdue report:** documents pending beyond the configured threshold
- **Statistics:** totals by status, document type, department, and monthly submission trend with bar chart
- All reports exportable as **CSV**, **Excel (.xlsx)**, or **PDF** with authentication (no unauthenticated export links)

### Audit Trail

- Every significant action is recorded: uploads, views, downloads, status changes, phase transitions, user management, admin actions
- Searchable and filterable by actor email, action type, entity type, and date range
- Paginated list with expandable metadata panel per event
- Exportable as CSV

### Notifications

- In-app notification bell (top-right) shows unread count
- Notifications generated on: document submitted, status changed, phase advanced/returned
- Mark individual or all notifications as read

### Email Notifications

- Automatic emails sent on: document submitted, status changed (approved/rejected), password reset
- Templates located in `server/src/templates/email/`
- SMTP is optional in development; emails are skipped gracefully if not configured

### Admin Panel

- **User Management:** create, edit role, activate/deactivate users; safety guards prevent deactivating yourself or the last active admin
- **Department Settings:** create, edit, delete departments
- **Document Type Settings:** create, edit, deactivate document types
- **Workflow Builder:** visual phase editor — add, reorder, and assign staff to workflow phases per document type
- **System Settings:** configure overdue threshold days, maximum file size

---

## User Role Guide

### Administrator

The admin has full access to every part of the system.

**Logging in:**
1. Go to http://localhost:4200
2. Enter `admin@pgi.ac.lk` / `Admin@1234`
3. You are taken to the Dashboard

**Setting up the system (do this first):**

1. **Departments** — Go to Settings → Departments. Create the departments that handle documents (e.g. Finance, Registry).
2. **Document Types** — Go to Settings → Document Types. Create the types of documents the system will handle (e.g. Payment Receipt, Scholarship Application).
3. **Workflows** — Go to Settings → Workflow Builder. For each document type that requires a multi-step approval:
   - Click **New Workflow**
   - Select the document type
   - Add phases in order (e.g. Phase 1: Verification, Phase 2: Approval)
   - Assign a finance staff member to each phase
   - Save
4. **Finance Staff Accounts** — Go to Settings → Users → Create User. Set role to `finance_staff`.

**Day-to-day admin tasks:**

- **Monitor all documents** via the Documents list — filter by status, type, or department
- **Advance or return phases** on any document (admin can act on any phase but cannot bypass the workflow to approve/reject — only the assigned final-phase staff can resolve)
- **View audit trail** — Reports → Audit Trail — to see a full log of every action
- **Export reports** — Reports → Pending / Overdue / Statistics → CSV / Excel / PDF buttons
- **Deactivate a user** — Users → Deactivate button (disabled for yourself and if only one admin remains)
- **Reset MFA** — Users → MFA Reset (forces user to re-enrol on next login)

---

### Finance Staff

Finance staff are responsible for processing documents through the approval workflow.

**Logging in:**
1. Go to http://localhost:4200
2. Enter `staff@pgi.ac.lk` / `Staff@1234` (or your own account)
3. You are taken to the Dashboard

**Processing a workflow document (when a workflow is defined for the document type):**

1. After a student submits a document, it is **automatically assigned** to the Phase 1 staff member and appears in their document list with status `pending_approval`
2. Open the document → click **View Details**
3. Review the file (click to view or download)
4. In the **Workflow** panel at the bottom of the detail page:
   - Click **Advance** to push to the next phase — the next assigned staff member takes over
   - Click **Return** to send back to the previous phase if issues are found (a note is recommended)
5. If you are the staff assigned to the **final phase**:
   - Click **Approve** to approve the document (status becomes `approved`)
   - Click **Reject** to reject — a rejection note is **required**

**Processing a document without a workflow:**

1. Open an unassigned document in `submitted` state
2. Click **Assign to Me** — status changes to `pending_approval` and the document is now yours
3. Review the document
4. Click **Approve** or **Reject** (rejection requires a note)

**Barcode scanning:**

1. On the Documents list page, a barcode input box is shown in the toolbar
2. Scan with a USB/Bluetooth barcode reader, type the number, or click the image icon to upload a photo of the barcode
3. Press Enter (or click Go) — you are taken directly to that document's detail page

**Setting a barcode manually (if needed):**

Barcodes are auto-generated on upload as 12-digit numeric Code 128 values. If you need to override one (rare), go to the document detail page → Edit → Barcode field. The value must be digits only.

---

### Postgraduate Student

Students submit their own documents and track their progress.

**Creating an account:**
1. Go to http://localhost:4200
2. Click **Create Account**
3. Enter your full name, email address, student ID (optional), and a password
   - Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character
4. You are logged in automatically

**Submitting a document:**
1. Click **Upload Document** (top-right button or via the sidebar)
2. Fill in the form:
   - **Title** — a descriptive name for the document
   - **Document Type** — select from the list configured by the admin
   - **Department** — the department the document is going to
   - **Academic Year / Semester** — optional
   - **Financial Amount** — if applicable (e.g. fee amount)
   - **File** — drag-and-drop or click to select (PDF, JPEG, or PNG, max 20 MB)
3. Click **Submit**
4. You receive a confirmation with your document's reference number (e.g. `PGI-2026-000123`)

**Tracking your document:**
1. Go to **My Documents** in the sidebar
2. Each document shows its current status:
   - `submitted` — received, waiting to be assigned
   - `pending_approval` — being reviewed by finance staff
   - `approved` — approved and ready for processing
   - `rejected` — requires re-submission (reason shown in the timeline)
   - `processed` — completed
3. Click a document to see its full status timeline, including which phase it is at and who is handling it

**Re-submitting after rejection:**
1. Open the rejected document
2. Read the rejection note from staff
3. Click **Re-submit Document**
4. Upload the corrected file
5. The document re-enters the workflow from Phase 1

---

### Auditor

Auditors have read-only access across the entire system — no modifications allowed.

**Logging in:**
1. Go to http://localhost:4200
2. Enter `auditor@pgi.ac.lk` / `Auditor@1234`

**Viewing documents:**
- Go to **Documents** — all documents are visible (auditors are not scoped to their own)
- Click any document to see its full detail, status history, workflow phase log, and version history
- Download document files for review

**Audit trail:**
- Go to **Reports → Audit Trail**
- Filter by actor, action type, entity, or date range
- Expand any row to see the full metadata payload for that event
- Export the filtered log to CSV

**Reports:**
- Go to **Reports** — pending, overdue, and statistics views are all accessible
- Export to CSV, Excel, or PDF

> Auditors cannot upload, approve, reject, assign, or modify any data.

---

## API Documentation

Swagger UI is available at **http://localhost:3000/docs** when the server is running.

To authenticate in Swagger:
1. Call **POST /api/v1/auth/login** in the Swagger UI with your credentials
2. Copy the `accessToken` from the response body
3. Click **Authorize** (top-right) and enter `Bearer <token>`
4. Authorization persists across page reloads

The full OpenAPI 3.0 spec is defined in [`server/src/config/swagger.js`](server/src/config/swagger.js).

---

## Running Tests

The test suite has 17 suites and 174 tests covering unit and integration scenarios.

```bash
# Run all tests (server only — client has no test suite)
npm run test --workspace=server

# Run with coverage report
npm run test:coverage --workspace=server
```

Integration tests connect to the `doc_tracking_test` database (configured by `DB_NAME` override in test environment). Migrations are applied automatically at the start of each integration test suite.

---

## Database Management

```bash
# Apply all pending migrations
npm run migrate:latest --workspace=server

# Roll back the last migration batch
npm run migrate:rollback --workspace=server

# Create a new migration file
npm run migrate:make --workspace=server -- your_migration_name

# Run seeds (idempotent — safe to run multiple times)
npm run seed:run --workspace=server
```

---

## Project Structure

```
doc-tracking-system/
├── client/                        # Angular 21 frontend
│   └── src/app/
│       ├── core/
│       │   ├── guards/            # Auth and role guards
│       │   ├── interceptors/      # JWT attach + 401 refresh
│       │   └── services/
│       │       ├── api/           # HTTP service wrappers per resource
│       │       ├── auth.service.ts
│       │       └── toast.service.ts
│       ├── features/
│       │   ├── admin/             # User management, departments, doc types, workflows, settings
│       │   ├── auth/              # Login, register, forgot/reset password
│       │   ├── dashboard/         # Summary cards and quick stats
│       │   ├── documents/         # List, detail, upload, version history
│       │   └── reports/           # Audit trail and reports dashboard
│       └── shared/                # Spinner, pagination, status badge, toast, notifications
├── server/
│   ├── src/
│   │   ├── config/                # DB (Knex), env (Joi-validated), mailer, Swagger spec
│   │   ├── constants/             # Roles, permissions, audit actions, status transitions
│   │   ├── controllers/           # Route handlers (one file per resource)
│   │   ├── middleware/            # JWT auth, RBAC authorize, upload, validation, rate limit, error handler
│   │   ├── models/                # Knex query helpers
│   │   ├── routes/                # Express routers mounted under /api/v1/
│   │   ├── services/              # Business logic — document, auth, audit, export, notification, workflow
│   │   ├── templates/email/       # HTML email templates
│   │   └── utils/                 # Error classes, pagination, reference number generator, barcode generator
│   ├── migrations/                # 16 Knex migration files (run in order)
│   ├── seeds/                     # 8 idempotent seed files for dev data
│   ├── tests/
│   │   ├── integration/           # Supertest end-to-end API tests (require live DB)
│   │   └── unit/                  # Isolated unit tests with mocked dependencies
│   └── uploads/                   # Uploaded files — git-ignored, created on first run
└── package.json                   # npm workspaces root
```

---

## Architecture

3-tier MVC:

- **Tier 1 — Client:** Angular 21 + Bootstrap 5, communicates with the API via HTTPS
- **Tier 2 — Server:** Node.js/Express — JWT authentication, RBAC middleware, workflow engine, audit logging, email dispatch
- **Tier 3 — Data:** PostgreSQL 16 via Knex.js — documents, users, workflows, audit logs; uploaded files stored on the local filesystem under `server/uploads/`


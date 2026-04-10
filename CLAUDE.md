# Web-Based Secure Document Tracking System

## Project Overview

A web-based, secure document tracking system designed for the **Financial Section of the Postgraduate Institute, University of Sri Jayewardenepura, Sri Lanka**.

The department receives 20–30 physical financial documents daily (payment receipts, scholarship forms, fee applications, refund requests). The current manual process causes misplacement, retrieval delays, lack of accountability, and security risks. This system replaces it with a centralized, real-time digital platform.

---

## Architecture

The system follows the **MVC (Model-View-Controller)** design pattern with a **3-tier architecture**:

### Tier 1 — Presentation Layer (Client-Side)
- HTML5, CSS3, JavaScript
- Bootstrap for responsive/mobile-friendly UI
- Angular for dynamic UI components
- Runs in the user's web browser via HTTPS

### Tier 2 — Application Layer (Server-Side)
- **Web Server:** Apache or Nginx
- **Application Server:** Node.js (Express)
- **API Gateway:** Single entry point; handles routing, rate limiting, load balancing
- Handles: authentication/authorization, document management logic, tracking/auditing, workflow engine

### Tier 3 — Data Layer
- **Database:** PostgreSQL
- **Document Storage:** Local filesystem; file path stored in the database
- Stores: document metadata (including file path), user records, RBAC permissions, audit logs, tracking history

### Security & Infrastructure Layer
- User login with secure session management
- Role-Based Access Control (RBAC) — access restricted by user role

---

## User Roles (RBAC)

| Role | Permissions |
|---|---|
| **Administrator** | Full control — users, roles, departments, document types, workflows, system settings, deletion |
| **Finance Staff** | Upload, categorize, update status, search financial documents, process workflow phases |
| **Postgraduate Student** | Upload own documents, view submission status, re-submit after rejection |
| **Auditor** | Read-only access to financial documents and audit trails |

---

## Functional Features

### User Management & Authentication
- User registration with unique credentials
- Secure login/logout
- Role-Based Access Control (RBAC)
- Password reset and profile management
- Secure session management with timeouts

### Document Management
- Upload: PDF, JPEG, PNG
- Categorization by: Document Type, Department/Section, Student ID/Name, Academic Year/Semester
- Metadata: title, submission date/time, student ID, financial amount, status, unique reference number
- Document statuses: `submitted` → `pending_approval` → `approved` / `rejected` → `processed`
- Secure view and download
- Document version control — students can re-submit after rejection; previous versions archived in `document_versions`
- Admin-only deletion with audit trail

### Barcode Tracking
- Finance staff manually enter a unique barcode number on the document record
- Barcode number stored in the database and searchable for quick document lookup

### Document Workflow
- Configurable workflow: `Student Submits → Finance Staff Verifies → Head of Finance Approves → Payment Processed`
- Email notifications (SMTP via Nodemailer) on:
  - Successful submission
  - Status change
  - Request for additional information
  - Critical workflow stage reached
- In-app notifications stored in the database and surfaced via notification bell
- Immutable audit trail logging: who, what action, when, from where (IP address)

### Document Assignment & Phase-Based Processing

#### Process Flow Templates (per Document Type)
- Each document type can optionally have a **process flow** defined by an admin via the workflow builder
- A process flow is a fixed ordered sequence of **phases** (steps), each with:
  - A phase name / label
  - A specific finance staff member assigned to that phase
- One flow per document type; flow is defined at the document-type level
- If a document type has **no flow** defined, the assigned staff can directly approve or reject it

#### Assignment

**Document types WITH a workflow:**
- On submission, the system **automatically assigns** the document to the phase-1 staff member and sets status to `pending_approval` immediately — no manual assignment step
- Manual assignment (self-assign or admin-assign) is **blocked** for these documents (returns 400)
- `current_workflow_step_id` is set to the first workflow step at submission time

**Document types WITHOUT a workflow:**
- After a document is submitted (status: `submitted`), a finance staff member can **self-assign** it, or an admin can **assign** it to any finance staff member
- Assignment sets `assigned_to_id` on the document and transitions status to `pending_approval`
- Only one staff member holds the document at a time

#### Phase-Based Processing (when a flow exists)
- The document starts at **phase 1** immediately upon submission (auto-assigned)
- The staff assigned to each phase can:
  - **Advance** — push to the next phase (next assigned staff takes over); requires confirmation
  - **Return** — send back to the previous phase (previous staff re-handles it); requires confirmation
- Each advance/return is recorded with an optional note and timestamp
- **Only the actual assignee of the final phase** can make the approval or rejection decision — this sets the document status to `approved` or `rejected`
- **Admins can advance/return phases** but cannot bypass the workflow to approve or reject; only the final-phase assignee can resolve
- All phase transitions are recorded in `document_phase_log` for full audit visibility

#### Re-submission After Rejection
- When a student re-submits a rejected document (new file version), the workflow **restarts from phase 1**
- The document is automatically assigned to the phase-1 staff member and status goes directly to `pending_approval`
- A `document_phase_log` entry with action `'assigned'` is recorded
- If the document type has no workflow, status resets to `submitted` as before

#### Data Model
- `workflows`: one row per document type flow (id, name, document_type_id)
- `workflow_steps`: ordered phases (workflow_id, step_order, phase_label, assigned_user_id) — `assigned_user_id` is a specific finance staff member
- `document_phase_log`: runtime history of each phase transition per document (document_id, workflow_step_id, actor_id, action: assigned|advanced|returned|resolved, note, created_at)
- `documents.assigned_to_id`: FK to users — current staff holding the document
- `documents.current_workflow_step_id`: FK to workflow_steps — active phase (non-null indicates document is in a workflow)

### Search & Reporting
- Advanced search by: keywords (PostgreSQL full-text search), document type, student ID/name, date range, status, department, financial amount range
- Filtering and sorting by multiple criteria
- Reports: pending documents, document history, departmental statistics, overdue documents
- Export formats: CSV, Excel, PDF

### Audit Trail
- Immutable log of every significant action (document upload, status change, download, barcode set, user management, etc.)
- Searchable and filterable by actor, action type, entity, and date range
- Exportable to CSV/Excel/PDF

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| Performance | < 2 second response time under normal load |
| Availability | ≥ 99.9% uptime |
| Scalability | Designed to handle growing users and document volumes |
| Security | Secure login (bcrypt + JWT), RBAC |
| Usability | Intuitive UI, minimal training required |

---

## API Documentation

Swagger UI is served at **`/docs`** when the server is running (e.g. `http://localhost:3000/docs`).

The spec is defined in `server/src/config/swagger.js` as an OpenAPI 3.0 object. To add or update endpoint documentation, edit that file directly — no JSDoc annotations in route files are required.

To authenticate in the Swagger UI: call **POST /auth/login**, copy the `accessToken` from the response, click **Authorize** (top-right), and paste it as `Bearer <token>`. The token is persisted across page reloads (`persistAuthorization: true`).

---

## Security Design

- **Authentication:** Secure login with hashed passwords (bcrypt); JWT-based sessions
- **Authorisation:** Role-Based Access Control (RBAC) — each endpoint enforces the minimum required role
- **Audit Trails:** Immutable logs recording who performed what action and when

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | HTML5, CSS3, TypeScript, Bootstrap, Angular |
| Backend | Node.js (Express) |
| Database | PostgreSQL |
| Document Storage | Local filesystem (file path stored in database) |
| Search | PostgreSQL full-text search (`search_vector`, `plainto_tsquery`) |
| Notifications | SMTP (Nodemailer) for email; in-app notifications via database |
| Dev Tools | Git / GitHub |

---

## Scope & Boundaries

**In scope:**
- Financial documents submitted by postgraduate students only
- Users: Administrator, Finance Staff, Postgraduate Student, Auditor
- Web-based application accessible via standard browsers
- Deployment and testing within the Postgraduate Institute's Financial Section

**Out of scope (current phase):**
- Physical file storage or hardware infrastructure setup
- Integration with national ID systems, payment gateways, or third-party financial tools
- AI chatbot assistant (proposed future enhancement)
- University-wide or cross-institutional rollout

---

## Document Types Handled

Document types are not predefined — administrators can add, edit, and deactivate document types at any time via the admin panel. The system ships with no hardcoded types; the initial set is configured during deployment to match the institute's current document categories.

---

## Folder Structure

### Backend (`server/`)

```
server/
├── src/
│   ├── config/
│   │   ├── db.js               # Knex PostgreSQL instance
│   │   ├── env.js              # Joi-validated env loader
│   │   └── mailer.js           # Nodemailer SMTP transporter
│   ├── constants/
│   │   ├── auditActions.js     # All audit log action constants
│   │   ├── roles.js            # Role permission matrix
│   │   └── transitions.js      # Workflow state machine map
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── audit.controller.js
│   │   ├── department.controller.js
│   │   ├── document.controller.js
│   │   ├── documentPhase.controller.js  # Phase advance/return/assign/resolve
│   │   ├── documentType.controller.js
│   │   ├── notification.controller.js
│   │   ├── report.controller.js
│   │   ├── settings.controller.js
│   │   ├── user.controller.js
│   │   └── workflow.controller.js       # Workflow/phase template CRUD
│   ├── middleware/
│   │   ├── authenticate.js     # JWT verification → req.user
│   │   ├── authorize.js        # Role-check factory
│   │   ├── errorHandler.js     # Centralised error → JSON envelope
│   │   ├── rateLimiter.js      # Per-route rate limit configs
│   │   ├── requestLogger.js    # Winston HTTP logging
│   │   ├── uploadHandler.js    # Multer + MIME magic-byte validation
│   │   └── validate.js         # Joi schema validation factory
│   ├── models/                 # Knex query helpers (no ORM)
│   │   └── document.model.js
│   ├── routes/
│   │   ├── index.js            # Mounts all routes under /api/v1/
│   │   ├── auth.routes.js
│   │   ├── audit.routes.js
│   │   ├── department.routes.js
│   │   ├── document.routes.js
│   │   ├── documentType.routes.js
│   │   ├── notification.routes.js
│   │   ├── report.routes.js
│   │   ├── settings.routes.js
│   │   ├── user.routes.js
│   │   └── workflow.routes.js
│   ├── services/
│   │   ├── auditService.js
│   │   ├── documentService.js
│   │   ├── exportService.js    # CSV / Excel / PDF streaming
│   │   ├── notificationService.js
│   │   ├── reportService.js
│   │   ├── searchService.js    # Delegates to documentService (PostgreSQL FTS)
│   │   ├── storageService.js   # Local filesystem upload / delete / path resolution
│   │   └── workflowService.js  # Atomic status transitions
│   ├── templates/
│   │   └── email/
│   │       ├── documentApproved.html
│   │       ├── documentRejected.html
│   │       ├── documentSubmitted.html
│   │       ├── passwordReset.html
│   │       └── statusChanged.html
│   ├── utils/
│   │   ├── asyncWrapper.js     # Wraps async handlers for error forwarding
│   │   ├── errors.js           # WorkflowError, ForbiddenError, NotFoundError
│   │   ├── paginate.js         # Standard pagination helper
│   │   └── referenceNumber.js  # PGI-YYYY-NNNNNN generator
│   ├── validators/
│   │   ├── auth.validators.js
│   │   └── document.validators.js
│   ├── app.js                  # Express app setup (middleware + routes)
│   └── server.js               # HTTP server with graceful shutdown
├── uploads/                    # Uploaded files — git-ignored, created on first run
│   └── documents/              # {referenceNumber}/v{n}/{filename}
├── migrations/                 # Knex migration files
├── seeds/                      # Dev seed files
├── tests/
│   ├── integration/
│   └── unit/
├── .env.example
├── jest.config.js
├── knexfile.js
└── package.json
```

### Frontend (`client/`)

```
client/
├── src/
│   ├── app/
│   │   ├── core/               # Singleton services, guards, interceptors
│   │   │   ├── guards/
│   │   │   │   ├── auth.guard.ts
│   │   │   │   └── role.guard.ts
│   │   │   ├── interceptors/
│   │   │   │   └── auth.interceptor.ts  # Attaches Bearer token; handles 401 refresh
│   │   │   └── services/
│   │   │       ├── api/
│   │   │       │   ├── audit-api.service.ts
│   │   │       │   ├── auth-api.service.ts
│   │   │       │   ├── document-api.service.ts
│   │   │       │   ├── notification-api.service.ts
│   │   │       │   ├── report-api.service.ts
│   │   │       │   └── workflow-api.service.ts
│   │   │       ├── auth.service.ts         # currentUser$ BehaviorSubject, token lifecycle
│   │   │       ├── document-actions.service.ts  # Optimistic status updates
│   │   │       └── toast.service.ts
│   │   ├── features/           # Lazy-loaded feature modules
│   │   │   ├── admin/
│   │   │   │   ├── department-settings/
│   │   │   │   ├── document-type-settings/
│   │   │   │   ├── system-settings/
│   │   │   │   ├── user-management/
│   │   │   │   └── workflow-builder/    # Visual phase flow editor per document type
│   │   │   ├── auth/
│   │   │   │   ├── forgot-password/
│   │   │   │   ├── login/
│   │   │   │   ├── register/
│   │   │   │   └── reset-password/
│   │   │   ├── dashboard/
│   │   │   ├── documents/
│   │   │   │   ├── document-detail/
│   │   │   │   ├── document-list/
│   │   │   │   ├── document-upload/
│   │   │   │   └── document-versions/
│   │   │   └── reports/
│   │   │       ├── audit-trail/
│   │   │       └── reports-dashboard/
│   │   ├── layouts/
│   │   │   ├── app-layout/     # Sidebar + topbar (role-aware nav)
│   │   │   └── auth-layout/    # Centered card for login/register
│   │   ├── shared/             # Reusable components, pipes, directives
│   │   │   └── components/
│   │   │       ├── empty-state/
│   │   │       ├── file-upload/
│   │   │       ├── modal/
│   │   │       ├── notifications/
│   │   │       │   ├── notification-bell/
│   │   │       │   └── notification-list/
│   │   │       ├── pagination/
│   │   │       ├── skeleton/
│   │   │       ├── spinner/
│   │   │       ├── status-badge/
│   │   │       ├── status-timeline/
│   │   │       └── toast-container/
│   │   ├── app.component.ts
│   │   ├── app.config.ts       # provideRouter, provideHttpClient, interceptors
│   │   └── app.routes.ts       # Top-level lazy routes
│   ├── assets/
│   ├── environments/
│   │   ├── environment.ts
│   │   └── environment.prod.ts
│   ├── styles/
│   │   ├── _variables.scss     # Bootstrap variable overrides
│   │   └── styles.scss         # Global styles + print media queries
│   └── index.html
├── .env.example
├── angular.json
├── package.json
└── tsconfig.json
```

---

## Future Enhancements

- AI-based chatbot for student self-service document status queries
- Expansion to other university departments
- Broader adoption in other government/educational institutions
- Integration with payment gateways and national ID systems

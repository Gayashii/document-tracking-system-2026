'use strict';

const env = require('./env');

const BASE = env.API_PREFIX; // e.g. /api/v1

/** @type {import('swagger-ui-express').JsonObject} */
const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Document Tracking System API',
    version: '1.0.0',
    description:
      'REST API for the Financial Section Document Tracking System — ' +
      'Postgraduate Institute, University of Sri Jayewardenepura.',
    contact: { name: 'System Administrator' },
  },
  servers: [{ url: BASE, description: 'Current server' }],

  // ── Security scheme ──────────────────────────────────────────────────────────
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token obtained from POST /auth/login. Expires in 15 minutes.',
      },
    },

    // ── Reusable schemas ─────────────────────────────────────────────────────
    schemas: {
      // ── Primitives ─────────────────────────────────────────────────────────
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              status:  { type: 'integer', example: 400 },
              message: { type: 'string',  example: 'Validation failed' },
            },
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page:       { type: 'integer', example: 1 },
          limit:      { type: 'integer', example: 20 },
          total:      { type: 'integer', example: 45 },
          totalPages: { type: 'integer', example: 3 },
        },
      },

      // ── Auth ───────────────────────────────────────────────────────────────
      TokenPair: {
        type: 'object',
        properties: {
          accessToken:  { type: 'string' },
          refreshToken: { type: 'string' },
          user: {
            type: 'object',
            properties: {
              id:    { type: 'integer' },
              email: { type: 'string', format: 'email' },
              role:  { type: 'string', enum: ['admin', 'finance_staff', 'student', 'auditor'] },
            },
          },
        },
      },

      // ── User ───────────────────────────────────────────────────────────────
      User: {
        type: 'object',
        properties: {
          id:         { type: 'integer' },
          email:      { type: 'string', format: 'email' },
          first_name: { type: 'string' },
          last_name:  { type: 'string' },
          role:       { type: 'string', enum: ['admin', 'finance_staff', 'student', 'auditor'] },
          is_active:  { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },

      // ── Document ───────────────────────────────────────────────────────────
      Document: {
        type: 'object',
        properties: {
          id:                       { type: 'integer' },
          reference_number:         { type: 'string', example: 'PGI-2026-000001' },
          title:                    { type: 'string' },
          document_type_id:         { type: 'integer', nullable: true },
          department_id:            { type: 'integer', nullable: true },
          student_id:               { type: 'integer' },
          assigned_to_id:           { type: 'integer', nullable: true },
          current_workflow_step_id: { type: 'integer', nullable: true },
          status: {
            type: 'string',
            enum: ['submitted', 'pending_approval', 'approved', 'rejected', 'processed'],
          },
          barcode_number:   { type: 'string', nullable: true, pattern: '^\\d+$', maxLength: 20, description: '12-digit numeric Code 128 barcode' },
          file_size:        { type: 'integer', description: 'Bytes' },
          mime_type:        { type: 'string', example: 'application/pdf' },
          academic_year:    { type: 'string', nullable: true, example: '2025/2026' },
          semester:         { type: 'string', nullable: true },
          financial_amount: { type: 'number', nullable: true },
          version:          { type: 'integer', example: 1 },
          created_at:       { type: 'string', format: 'date-time' },
          updated_at:       { type: 'string', format: 'date-time' },
        },
      },

      DocumentStatusHistory: {
        type: 'object',
        properties: {
          id:               { type: 'integer' },
          from_status:      { type: 'string', nullable: true },
          to_status:        { type: 'string' },
          note:             { type: 'string', nullable: true },
          ip_address:       { type: 'string', nullable: true },
          created_at:       { type: 'string', format: 'date-time' },
          changed_by_id:    { type: 'integer' },
          changed_by_email: { type: 'string', format: 'email' },
          changed_by_role:  { type: 'string' },
        },
      },

      DocumentVersion: {
        type: 'object',
        properties: {
          id:               { type: 'integer' },
          version_number:   { type: 'integer' },
          file_path:        { type: 'string' },
          change_note:      { type: 'string', nullable: true },
          created_at:       { type: 'string', format: 'date-time' },
          uploaded_by_id:   { type: 'integer' },
          uploaded_by_email:{ type: 'string', format: 'email' },
        },
      },

      PhaseInfo: {
        type: 'object',
        properties: {
          has_workflow: { type: 'boolean' },
          is_final:     { type: 'boolean' },
          current_step: {
            type: 'object', nullable: true,
            properties: {
              id:          { type: 'integer' },
              step_order:  { type: 'integer' },
              phase_label: { type: 'string' },
            },
          },
          assigned_to: {
            type: 'object', nullable: true,
            properties: {
              id:    { type: 'integer' },
              email: { type: 'string', format: 'email' },
            },
          },
          phase_log: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action:      { type: 'string', enum: ['assigned', 'advanced', 'returned', 'resolved'] },
                note:        { type: 'string', nullable: true },
                created_at:  { type: 'string', format: 'date-time' },
                actor_email: { type: 'string', format: 'email' },
                phase_label: { type: 'string', nullable: true },
              },
            },
          },
        },
      },

      // ── Workflow ────────────────────────────────────────────────────────────
      Workflow: {
        type: 'object',
        properties: {
          id:               { type: 'integer' },
          name:             { type: 'string' },
          document_type_id: { type: 'integer' },
          created_at:       { type: 'string', format: 'date-time' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id:               { type: 'integer' },
                step_order:       { type: 'integer' },
                phase_label:      { type: 'string' },
                assigned_user_id: { type: 'integer' },
              },
            },
          },
        },
      },

      // ── Department / Document type ──────────────────────────────────────────
      Department: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          name:        { type: 'string' },
          description: { type: 'string', nullable: true },
          created_at:  { type: 'string', format: 'date-time' },
        },
      },
      DocumentType: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          name:        { type: 'string' },
          code:        { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
          is_active:   { type: 'boolean' },
          created_at:  { type: 'string', format: 'date-time' },
        },
      },

      // ── Notification ────────────────────────────────────────────────────────
      Notification: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          type:        { type: 'string' },
          title:       { type: 'string' },
          message:     { type: 'string' },
          is_read:     { type: 'boolean' },
          created_at:  { type: 'string', format: 'date-time' },
          metadata:    { type: 'object', nullable: true },
        },
      },

      // ── Audit ───────────────────────────────────────────────────────────────
      AuditEntry: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          actor_id:    { type: 'integer' },
          actor_email: { type: 'string', format: 'email' },
          action:      { type: 'string', example: 'document.status_changed' },
          entity_type: { type: 'string', example: 'document' },
          entity_id:   { type: 'integer' },
          metadata:    { type: 'object', nullable: true },
          ip_address:  { type: 'string', nullable: true },
          user_agent:  { type: 'string', nullable: true },
          created_at:  { type: 'string', format: 'date-time' },
        },
      },
    },

    // ── Reusable parameters ───────────────────────────────────────────────────
    parameters: {
      PageParam: {
        name: 'page', in: 'query', schema: { type: 'integer', default: 1 },
      },
      LimitParam: {
        name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 },
      },
      DocumentIdParam: {
        name: 'id', in: 'path', required: true, schema: { type: 'integer' },
        description: 'Document ID',
      },
    },
  },

  // ── Global security (overridden per-route where public) ─────────────────────
  security: [{ BearerAuth: [] }],

  // ── Tags (displayed as sections in the UI) ───────────────────────────────────
  tags: [
    { name: 'Health',         description: 'Server health and barcode scan' },
    { name: 'Auth',           description: 'Registration, login, token refresh, password reset' },
    { name: 'Documents',      description: 'Upload, list, search, download, and manage documents' },
    { name: 'Document Phases',description: 'Phase-based workflow: assign, advance, return, resolve' },
    { name: 'Users',          description: 'User management (admin)' },
    { name: 'Departments',    description: 'Department settings (admin)' },
    { name: 'Document Types', description: 'Document type settings (admin)' },
    { name: 'Workflows',      description: 'Workflow phase templates (admin)' },
    { name: 'Notifications',  description: 'In-app notifications for the authenticated user' },
    { name: 'Audit',          description: 'Immutable audit trail (admin / auditor)' },
    { name: 'Reports',        description: 'Reporting and export (admin / finance staff)' },
    { name: 'Settings',       description: 'System-wide settings (admin)' },
    { name: 'Lookups',        description: 'Lightweight reference lists' },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // Paths
  // ═══════════════════════════════════════════════════════════════════════════
  paths: {

    // ── Health ────────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns database and storage connectivity status.',
        security: [],
        responses: {
          200: {
            description: 'All systems operational',
            content: { 'application/json': { schema: {
              type: 'object',
              properties: {
                status:   { type: 'string', example: 'ok' },
                database: { type: 'string', example: 'ok' },
                storage:  { type: 'string', example: 'ok' },
              },
            }}},
          },
        },
      },
    },

    '/scan': {
      get: {
        tags: ['Health'],
        summary: 'Barcode scan lookup',
        description: 'Public endpoint — look up a document by barcode number.',
        security: [],
        parameters: [
          { name: 'barcode', in: 'query', required: true, schema: { type: 'string', pattern: '^\\d+$', maxLength: 20 }, description: '12-digit numeric Code 128 barcode' },
        ],
        responses: {
          200: {
            description: 'Document found',
            content: { 'application/json': { schema: {
              type: 'object',
              properties: {
                id:               { type: 'integer' },
                reference_number: { type: 'string' },
                title:            { type: 'string' },
                status:           { type: 'string' },
                document_type:    { type: 'string' },
                updated_at:       { type: 'string', format: 'date-time' },
              },
            }}},
          },
          404: { description: 'No document found for this barcode', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Lookups ───────────────────────────────────────────────────────────────
    '/lookups/document-types': {
      get: {
        tags: ['Lookups'],
        summary: 'List active document types',
        responses: {
          200: { description: 'Array of active document types', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/DocumentType' } } } } },
        },
      },
    },

    '/lookups/departments': {
      get: {
        tags: ['Lookups'],
        summary: 'List all departments',
        responses: {
          200: { description: 'Array of departments', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Department' } } } } },
        },
      },
    },

    // ── Auth ──────────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['email', 'password', 'first_name', 'last_name', 'role'],
            properties: {
              email:      { type: 'string', format: 'email' },
              password:   { type: 'string', minLength: 8 },
              first_name: { type: 'string' },
              last_name:  { type: 'string' },
              role:       { type: 'string', enum: ['admin', 'finance_staff', 'student', 'auditor'] },
            },
          }}},
        },
        responses: {
          201: { description: 'User created', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } } } },
          409: { description: 'Email already in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email:    { type: 'string', format: 'email' },
              password: { type: 'string' },
            },
          }}},
        },
        responses: {
          200: { description: 'Login successful — returns access + refresh tokens', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } } } },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['refreshToken'],
            properties: { refreshToken: { type: 'string' } },
          }}},
        },
        responses: {
          200: { description: 'New access token issued', content: { 'application/json': { schema: {
            type: 'object',
            properties: { accessToken: { type: 'string' } },
          }}}},
          401: { description: 'Invalid or expired refresh token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout (invalidates refresh token)',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['refreshToken'],
            properties: { refreshToken: { type: 'string' } },
          }}},
        },
        responses: { 204: { description: 'Logged out' } },
      },
    },

    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request password reset email',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object', required: ['email'],
            properties: { email: { type: 'string', format: 'email' } },
          }}},
        },
        responses: { 200: { description: 'Reset email sent (if account exists)' } },
      },
    },

    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Complete password reset using token from email',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object', required: ['token', 'password'],
            properties: {
              token:    { type: 'string' },
              password: { type: 'string', minLength: 8 },
            },
          }}},
        },
        responses: {
          200: { description: 'Password reset successfully' },
          400: { description: 'Invalid or expired token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Documents ─────────────────────────────────────────────────────────────
    '/documents': {
      post: {
        tags: ['Documents'],
        summary: 'Upload a new document',
        description: 'Multipart form upload. If the selected document type has a workflow, the document is automatically assigned to phase-1 staff and moves to `pending_approval` immediately.',
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: {
            type: 'object',
            required: ['file', 'title', 'document_type_id', 'department_id'],
            properties: {
              file:             { type: 'string', format: 'binary', description: 'PDF, JPEG, or PNG — max 20 MB' },
              title:            { type: 'string' },
              document_type_id: { type: 'integer' },
              department_id:    { type: 'integer' },
              academic_year:    { type: 'string', example: '2025/2026' },
              semester:         { type: 'string' },
              financial_amount: { type: 'number' },
            },
          }}},
        },
        responses: {
          201: { description: 'Document uploaded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Document' } } } },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      get: {
        tags: ['Documents'],
        summary: 'List documents (paginated)',
        description: 'Students see only their own documents. Staff/admin see all.',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
          { name: 'status',           in: 'query', schema: { type: 'string' } },
          { name: 'department_id',    in: 'query', schema: { type: 'integer' } },
          { name: 'document_type_id', in: 'query', schema: { type: 'integer' } },
          { name: 'student_id',       in: 'query', schema: { type: 'integer' } },
          { name: 'academic_year',    in: 'query', schema: { type: 'string' } },
          { name: 'reference_number', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Paginated document list',
            content: { 'application/json': { schema: {
              allOf: [
                { $ref: '#/components/schemas/Pagination' },
                { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Document' } } } },
              ],
            }}},
          },
        },
      },
    },

    '/documents/search': {
      get: {
        tags: ['Documents'],
        summary: 'Advanced document search (PostgreSQL FTS)',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
          { name: 'q',           in: 'query', schema: { type: 'string' }, description: 'Full-text search query' },
          { name: 'type',        in: 'query', schema: { type: 'integer' }, description: 'document_type_id' },
          { name: 'status',      in: 'query', schema: { type: 'string' }, description: 'Single status or comma-separated list' },
          { name: 'from',        in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to',          in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'amount_min',  in: 'query', schema: { type: 'number' } },
          { name: 'amount_max',  in: 'query', schema: { type: 'number' } },
          { name: 'department_id', in: 'query', schema: { type: 'integer' } },
          { name: 'student_id',  in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Search results with applied filter metadata' },
        },
      },
    },

    '/documents/{id}': {
      get: {
        tags: ['Documents'],
        summary: 'Get document by ID',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        responses: {
          200: { description: 'Document metadata', content: { 'application/json': { schema: { $ref: '#/components/schemas/Document' } } } },
          403: { description: 'Access denied (student accessing another student\'s document)' },
          404: { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Documents'],
        summary: 'Soft-delete a document (admin only)',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        responses: {
          204: { description: 'Deleted' },
          403: { description: 'Insufficient role' },
          404: { description: 'Not found' },
        },
      },
    },

    '/documents/{id}/download': {
      get: {
        tags: ['Documents'],
        summary: 'Download the current document file',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        responses: {
          200: { description: 'File stream', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          403: { description: 'Access denied' },
          404: { description: 'Not found' },
        },
      },
    },

    '/documents/{id}/barcode': {
      patch: {
        tags: ['Documents'],
        summary: 'Override the auto-generated barcode number (finance staff / admin)',
        description: 'Barcodes are auto-generated on upload as 12-digit numeric Code 128 values. Use this endpoint to correct or replace the barcode if the physical label differs. Must be digits only (max 20).',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object', required: ['barcode_number'],
            properties: { barcode_number: { type: 'string', pattern: '^\\d+$', maxLength: 20, example: '047382916054' } },
          }}},
        },
        responses: {
          200: { description: 'Barcode updated' },
          409: { description: 'Barcode already used on another document' },
        },
      },
    },

    '/documents/{id}/status': {
      patch: {
        tags: ['Documents'],
        summary: 'Transition document status (non-workflow)',
        description: 'Uses the state-machine defined in `constants/transitions.js`. For workflow documents use the phase endpoints instead.',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object', required: ['status'],
            properties: {
              status: { type: 'string', enum: ['pending_approval', 'approved', 'rejected', 'processed'] },
              note:   { type: 'string', maxLength: 1000 },
            },
          }}},
        },
        responses: {
          200: { description: 'Status updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Document' } } } },
          422: { description: 'Invalid transition (WorkflowError)' },
        },
      },
    },

    '/documents/{id}/history': {
      get: {
        tags: ['Documents'],
        summary: 'Get status change history for a document',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        responses: {
          200: {
            description: 'Ordered history entries',
            content: { 'application/json': { schema: {
              type: 'array', items: { $ref: '#/components/schemas/DocumentStatusHistory' },
            }}},
          },
        },
      },
    },

    '/documents/{id}/versions': {
      get: {
        tags: ['Documents'],
        summary: 'List archived versions of a document',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        responses: {
          200: { description: 'Archived versions', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/DocumentVersion' } } } } },
        },
      },
      post: {
        tags: ['Documents'],
        summary: 'Re-submit document after rejection (student only)',
        description: 'Archives the current file as a version, uploads a new file, increments version counter. If a workflow exists, the document is automatically re-assigned to phase-1 staff and status goes to `pending_approval`.',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: {
            type: 'object',
            required: ['file'],
            properties: {
              file:        { type: 'string', format: 'binary' },
              change_note: { type: 'string' },
            },
          }}},
        },
        responses: {
          201: { description: 'New version submitted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Document' } } } },
          422: { description: 'Document is not in rejected status' },
          403: { description: 'Only the document owner may re-submit' },
        },
      },
    },

    '/documents/{id}/versions/{versionId}/download': {
      get: {
        tags: ['Documents'],
        summary: 'Download a specific archived version',
        parameters: [
          { $ref: '#/components/parameters/DocumentIdParam' },
          { name: 'versionId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'File stream', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          404: { description: 'Version not found' },
        },
      },
    },

    // ── Document Phases ───────────────────────────────────────────────────────
    '/documents/{id}/phase': {
      get: {
        tags: ['Document Phases'],
        summary: 'Get current phase info and phase log',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        responses: {
          200: { description: 'Phase info', content: { 'application/json': { schema: { $ref: '#/components/schemas/PhaseInfo' } } } },
        },
      },
    },

    '/documents/{id}/assign': {
      post: {
        tags: ['Document Phases'],
        summary: 'Assign document to staff (non-workflow documents only)',
        description: 'Staff self-assign (omit `assigned_to_id`) or admin assigns to any staff. Returns 400 for documents with an active workflow — those are auto-assigned on submission.',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        requestBody: {
          content: { 'application/json': { schema: {
            type: 'object',
            properties: { assigned_to_id: { type: 'integer', description: 'Omit to self-assign' } },
          }}},
        },
        responses: {
          200: { description: 'Document assigned' },
          400: { description: 'Document has a workflow — manual assignment not allowed' },
          403: { description: 'Insufficient role' },
        },
      },
    },

    '/documents/{id}/phase/advance': {
      post: {
        tags: ['Document Phases'],
        summary: 'Advance to the next workflow phase',
        description: 'Moves the document to the next phase and re-assigns to that phase\'s staff. Requires confirmation in the UI. Admin can also call this endpoint.',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        requestBody: {
          content: { 'application/json': { schema: {
            type: 'object',
            properties: { note: { type: 'string', maxLength: 1000 } },
          }}},
        },
        responses: {
          200: { description: 'Advanced to next phase' },
          422: { description: 'Already at the final phase' },
          403: { description: 'Not the current assignee or admin' },
        },
      },
    },

    '/documents/{id}/phase/return': {
      post: {
        tags: ['Document Phases'],
        summary: 'Return to the previous workflow phase',
        description: 'Sends the document back to the previous phase\'s staff. Requires confirmation in the UI. Admin can also call this endpoint.',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        requestBody: {
          content: { 'application/json': { schema: {
            type: 'object',
            properties: { note: { type: 'string', maxLength: 1000 } },
          }}},
        },
        responses: {
          200: { description: 'Returned to previous phase' },
          422: { description: 'Already at phase 1' },
          403: { description: 'Not the current assignee or admin' },
        },
      },
    },

    '/documents/{id}/phase/resolve': {
      post: {
        tags: ['Document Phases'],
        summary: 'Approve or reject at the final phase (final-phase assignee only)',
        description: 'Only the **actual assignee** of the final phase can call this. Admin bypass is intentionally not allowed. Sets document status to `approved` or `rejected`.',
        parameters: [{ $ref: '#/components/parameters/DocumentIdParam' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['decision'],
            properties: {
              decision: { type: 'string', enum: ['approved', 'rejected'] },
              note:     { type: 'string', maxLength: 1000, description: 'Required when decision is "rejected"' },
            },
          }}},
        },
        responses: {
          200: { description: 'Document resolved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Document' } } } },
          400: { description: 'Note required for rejection' },
          403: { description: 'Not the final-phase assignee' },
          422: { description: 'Document is not at the final phase' },
        },
      },
    },

    // ── Users ─────────────────────────────────────────────────────────────────
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List users',
        description: 'Requires admin role.',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
          { name: 'role',   in: 'query', schema: { type: 'string', enum: ['admin', 'finance_staff', 'student', 'auditor'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
          { name: 'q',      in: 'query', schema: { type: 'string' }, description: 'Search by name or email' },
        ],
        responses: {
          200: {
            description: 'Paginated user list',
            content: { 'application/json': { schema: {
              allOf: [
                { $ref: '#/components/schemas/Pagination' },
                { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/User' } } } },
              ],
            }}},
          },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create a user (admin only)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['email', 'password', 'first_name', 'last_name', 'role'],
            properties: {
              email:      { type: 'string', format: 'email' },
              password:   { type: 'string', minLength: 8 },
              first_name: { type: 'string' },
              last_name:  { type: 'string' },
              role:       { type: 'string', enum: ['admin', 'finance_staff', 'student', 'auditor'] },
            },
          }}},
        },
        responses: {
          201: { description: 'User created', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          409: { description: 'Email already exists' },
        },
      },
    },

    '/users/{id}': {
      patch: {
        tags: ['Users'],
        summary: 'Update user role or active status (admin only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: { 'application/json': { schema: {
            type: 'object',
            properties: {
              role:      { type: 'string', enum: ['admin', 'finance_staff', 'student', 'auditor'] },
              is_active: { type: 'boolean' },
            },
          }}},
        },
        responses: {
          200: { description: 'User updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          404: { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Deactivate a user (admin only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          204: { description: 'Deactivated' },
          404: { description: 'Not found' },
        },
      },
    },

    // ── Departments ───────────────────────────────────────────────────────────
    '/departments': {
      get: {
        tags: ['Departments'],
        summary: 'List all departments (admin)',
        responses: { 200: { description: 'Department list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Department' } } } } } },
      },
      post: {
        tags: ['Departments'],
        summary: 'Create department (admin)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object', required: ['name'],
            properties: {
              name:        { type: 'string' },
              description: { type: 'string' },
            },
          }}},
        },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Department' } } } } },
      },
    },

    '/departments/{id}': {
      patch: {
        tags: ['Departments'],
        summary: 'Update department (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: { 'application/json': { schema: {
            type: 'object',
            properties: { name: { type: 'string' }, description: { type: 'string' } },
          }}},
        },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Department' } } } } },
      },
      delete: {
        tags: ['Departments'],
        summary: 'Delete department (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 204: { description: 'Deleted' } },
      },
    },

    // ── Document Types ────────────────────────────────────────────────────────
    '/document-types': {
      get: {
        tags: ['Document Types'],
        summary: 'List all document types (admin)',
        responses: { 200: { description: 'Document type list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/DocumentType' } } } } } },
      },
      post: {
        tags: ['Document Types'],
        summary: 'Create document type (admin)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object', required: ['name'],
            properties: {
              name:        { type: 'string' },
              code:        { type: 'string' },
              description: { type: 'string' },
              is_active:   { type: 'boolean', default: true },
            },
          }}},
        },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/DocumentType' } } } } },
      },
    },

    '/document-types/{id}': {
      patch: {
        tags: ['Document Types'],
        summary: 'Update document type (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: { 'application/json': { schema: {
            type: 'object',
            properties: { name: { type: 'string' }, code: { type: 'string' }, description: { type: 'string' }, is_active: { type: 'boolean' } },
          }}},
        },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/DocumentType' } } } } },
      },
      delete: {
        tags: ['Document Types'],
        summary: 'Delete document type (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 204: { description: 'Deleted' } },
      },
    },

    // ── Workflows ─────────────────────────────────────────────────────────────
    '/workflows': {
      get: {
        tags: ['Workflows'],
        summary: 'List all workflow templates (admin)',
        responses: { 200: { description: 'Workflow list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Workflow' } } } } } },
      },
      post: {
        tags: ['Workflows'],
        summary: 'Create a workflow for a document type (admin)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object', required: ['name', 'document_type_id'],
            properties: {
              name:             { type: 'string' },
              document_type_id: { type: 'integer' },
            },
          }}},
        },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } } } },
      },
    },

    '/workflows/{id}': {
      get: {
        tags: ['Workflows'],
        summary: 'Get a workflow with its steps (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Workflow detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } } } },
      },
      patch: {
        tags: ['Workflows'],
        summary: 'Update workflow name (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: { 'application/json': { schema: {
            type: 'object', properties: { name: { type: 'string' } },
          }}},
        },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } } } },
      },
      delete: {
        tags: ['Workflows'],
        summary: 'Delete a workflow (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 204: { description: 'Deleted' } },
      },
    },

    '/workflows/{id}/steps': {
      put: {
        tags: ['Workflows'],
        summary: 'Replace all steps for a workflow (admin)',
        description: 'Full replacement — send the complete ordered array of steps. Existing steps are deleted and re-created.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['steps'],
            properties: {
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['phase_label', 'assigned_user_id'],
                  properties: {
                    phase_label:      { type: 'string' },
                    assigned_user_id: { type: 'integer' },
                  },
                },
              },
            },
          }}},
        },
        responses: { 200: { description: 'Steps replaced', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } } } },
      },
    },

    // ── Notifications ─────────────────────────────────────────────────────────
    '/notifications/mine': {
      get: {
        tags: ['Notifications'],
        summary: 'Get notifications for the authenticated user',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated notifications',
            content: { 'application/json': { schema: {
              allOf: [
                { $ref: '#/components/schemas/Pagination' },
                { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Notification' } } } },
              ],
            }}},
          },
        },
      },
    },

    '/notifications/unread-count': {
      get: {
        tags: ['Notifications'],
        summary: 'Get unread notification count',
        responses: {
          200: { description: 'Count', content: { 'application/json': { schema: {
            type: 'object', properties: { count: { type: 'integer' } },
          }}}},
        },
      },
    },

    '/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        responses: { 204: { description: 'All marked as read' } },
      },
    },

    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark a single notification as read',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 204: { description: 'Marked as read' } },
      },
    },

    // ── Audit ─────────────────────────────────────────────────────────────────
    '/audit': {
      get: {
        tags: ['Audit'],
        summary: 'Paginated audit log (admin / auditor)',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
          { name: 'actor_email', in: 'query', schema: { type: 'string' } },
          { name: 'action',      in: 'query', schema: { type: 'string' } },
          { name: 'entity_type', in: 'query', schema: { type: 'string', example: 'document' } },
          { name: 'from',        in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to',          in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: {
            description: 'Audit log entries',
            content: { 'application/json': { schema: {
              allOf: [
                { $ref: '#/components/schemas/Pagination' },
                { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/AuditEntry' } } } },
              ],
            }}},
          },
        },
      },
    },

    '/audit/export': {
      get: {
        tags: ['Audit'],
        summary: 'Export audit log as CSV',
        description: 'Accepts the same filter parameters as GET /audit.',
        parameters: [
          { name: 'actor_email', in: 'query', schema: { type: 'string' } },
          { name: 'action',      in: 'query', schema: { type: 'string' } },
          { name: 'entity_type', in: 'query', schema: { type: 'string' } },
          { name: 'from',        in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to',          in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } } },
      },
    },

    '/audit/entity/{type}/{id}': {
      get: {
        tags: ['Audit'],
        summary: 'Get audit history for a specific entity',
        parameters: [
          { name: 'type', in: 'path', required: true, schema: { type: 'string', example: 'document' } },
          { name: 'id',   in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Audit events for the entity', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AuditEntry' } } } } },
        },
      },
    },

    // ── Reports ───────────────────────────────────────────────────────────────
    '/reports/pending': {
      get: {
        tags: ['Reports'],
        summary: 'Pending documents report',
        description: 'Returns all documents in `submitted` or `pending_approval` status.',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: { 200: { description: 'Pending document list' } },
      },
    },

    '/reports/history': {
      get: {
        tags: ['Reports'],
        summary: 'Full document lifecycle history report',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: { 200: { description: 'History report data' } },
      },
    },

    '/reports/statistics': {
      get: {
        tags: ['Reports'],
        summary: 'Aggregated statistics (counts by status, type, department)',
        responses: { 200: { description: 'Statistics object' } },
      },
    },

    '/reports/overdue': {
      get: {
        tags: ['Reports'],
        summary: 'Documents pending approval beyond the configured threshold',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: { 200: { description: 'Overdue document list' } },
      },
    },

    '/reports/export': {
      get: {
        tags: ['Reports'],
        summary: 'Export report data (CSV / Excel / PDF)',
        parameters: [
          { name: 'format', in: 'query', required: true, schema: { type: 'string', enum: ['csv', 'xlsx', 'pdf'] } },
          { name: 'report', in: 'query', required: true, schema: { type: 'string', enum: ['pending', 'history', 'statistics', 'overdue'] } },
        ],
        responses: { 200: { description: 'File download' } },
      },
    },

    // ── Settings ──────────────────────────────────────────────────────────────
    '/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Get all system settings (admin)',
        responses: {
          200: { description: 'Key-value settings map', content: { 'application/json': { schema: {
            type: 'object',
            additionalProperties: { type: 'string' },
            example: { overdue_threshold_days: '7', max_file_size_mb: '20' },
          }}}},
        },
      },
      patch: {
        tags: ['Settings'],
        summary: 'Update system settings (admin)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            additionalProperties: { type: 'string' },
            example: { overdue_threshold_days: '14' },
          }}},
        },
        responses: { 200: { description: 'Updated settings' } },
      },
    },
  },
};

module.exports = swaggerSpec;

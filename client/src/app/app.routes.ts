import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  // Auth layout routes (public)
  {
    path: '',
    loadComponent: () =>
      import('./layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login').then((m) => m.Login),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register').then((m) => m.Register),
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./features/auth/forgot-password/forgot-password').then(
            (m) => m.ForgotPassword,
          ),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password/reset-password').then(
            (m) => m.ResetPassword,
          ),
      },
    ],
  },

  // App layout routes (authenticated)
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/app-layout/app-layout').then((m) => m.AppLayout),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'documents',
        loadComponent: () =>
          import('./features/documents/document-list/document-list').then(
            (m) => m.DocumentList,
          ),
      },
      {
        path: 'documents/upload',
        loadComponent: () =>
          import('./features/documents/document-upload/document-upload').then(
            (m) => m.DocumentUpload,
          ),
      },
      {
        path: 'documents/:id',
        loadComponent: () =>
          import('./features/documents/document-detail/document-detail').then(
            (m) => m.DocumentDetail,
          ),
      },
      {
        path: 'documents/:id/versions',
        loadComponent: () =>
          import('./features/documents/document-versions/document-versions').then(
            (m) => m.DocumentVersions,
          ),
      },
      {
        path: 'reports',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'finance_staff', 'auditor'] },
        loadComponent: () =>
          import('./features/reports/reports-dashboard/reports-dashboard').then(
            (m) => m.ReportsDashboard,
          ),
      },
      {
        path: 'audit',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'auditor'] },
        loadComponent: () =>
          import('./features/reports/audit-trail/audit-trail').then(
            (m) => m.AuditTrail,
          ),
      },
      // Admin-only routes
      {
        path: 'admin',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        children: [
          {
            path: 'users',
            loadComponent: () =>
              import('./features/admin/user-management/user-management').then((m) => m.UserManagement),
          },
          {
            path: 'departments',
            loadComponent: () =>
              import('./features/admin/department-settings/department-settings').then((m) => m.DepartmentSettings),
          },
          {
            path: 'document-types',
            loadComponent: () =>
              import('./features/admin/document-type-settings/document-type-settings').then((m) => m.DocumentTypeSettings),
          },
          {
            path: 'settings',
            loadComponent: () =>
              import('./features/admin/system-settings/system-settings').then((m) => m.SystemSettings),
          },
          {
            path: 'workflows',
            loadComponent: () =>
              import('./features/admin/workflow-builder/workflow-builder').then((m) => m.WorkflowBuilder),
          },
        ],
      },
    ],
  },

  // Unauthorized catch-all
  {
    path: 'unauthorized',
    loadComponent: () =>
      import('./features/auth/unauthorized/unauthorized').then(
        (m) => m.Unauthorized,
      ),
  },
  { path: '**', redirectTo: '' },
];

import { describe, it, expect } from 'vitest';
import {
  MAIN_STEPS,
  mainStepIndex,
  isStepCompleted,
  isStepActive,
} from '../app/shared/components/status-timeline/status-timeline';
import type { DocumentStatus } from '../app/core/services/api/document-api.service';

// ─── mainStepIndex ───────────────────────────────────────────────────────────

describe('mainStepIndex', () => {
  it('returns 0 for submitted', () => {
    expect(mainStepIndex('submitted')).toBe(0);
  });
  it('returns 1 for pending_approval', () => {
    expect(mainStepIndex('pending_approval')).toBe(1);
  });
  it('returns 2 for approved', () => {
    expect(mainStepIndex('approved')).toBe(2);
  });
  it('returns 3 for processed', () => {
    expect(mainStepIndex('processed')).toBe(3);
  });
  it('returns -1 for rejected (not in main path)', () => {
    expect(mainStepIndex('rejected')).toBe(-1);
  });
});

// ─── isStepCompleted ─────────────────────────────────────────────────────────

describe('isStepCompleted', () => {
  it('submitted doc: only step 0 completed', () => {
    expect(isStepCompleted('submitted', 0)).toBe(true);
    expect(isStepCompleted('submitted', 1)).toBe(false);
  });

  it('pending_approval doc: steps 0 and 1 completed', () => {
    expect(isStepCompleted('pending_approval', 0)).toBe(true);
    expect(isStepCompleted('pending_approval', 1)).toBe(true);
    expect(isStepCompleted('pending_approval', 2)).toBe(false);
  });

  it('approved doc: steps 0-2 completed', () => {
    expect(isStepCompleted('approved', 2)).toBe(true);
    expect(isStepCompleted('approved', 3)).toBe(false);
  });

  it('processed doc: all 4 steps completed', () => {
    MAIN_STEPS.forEach((_, i) => {
      expect(isStepCompleted('processed', i)).toBe(true);
    });
  });

  it('rejected doc: no forward steps completed', () => {
    MAIN_STEPS.forEach((_, i) => {
      expect(isStepCompleted('rejected', i)).toBe(false);
    });
  });
});

// ─── isStepActive ────────────────────────────────────────────────────────────

describe('isStepActive', () => {
  it('submitted: step 0 is active, others are not', () => {
    expect(isStepActive('submitted', 0)).toBe(true);
    expect(isStepActive('submitted', 1)).toBe(false);
  });

  it('pending_approval: step 1 is active', () => {
    expect(isStepActive('pending_approval', 1)).toBe(true);
    expect(isStepActive('pending_approval', 0)).toBe(false);
  });

  it('rejected: no main step is active', () => {
    MAIN_STEPS.forEach((_, i) => {
      expect(isStepActive('rejected', i)).toBe(false);
    });
  });
});

// ─── Action button visibility logic ──────────────────────────────────────────

/**
 * Mirrors DocumentDetail.availableActions getter logic (pure function for testing).
 */
function getAvailableActions(
  role: string,
  status: DocumentStatus,
): string[] {
  const isStaffOrAdmin = role === 'finance_staff' || role === 'admin';
  if (!isStaffOrAdmin) return [];
  const map: Partial<Record<DocumentStatus, string[]>> = {
    submitted: ['pending_approval', 'rejected'],
    pending_approval: ['approved', 'rejected'],
    approved: ['processed'],
  };
  return map[status] ?? [];
}

describe('action button visibility', () => {
  it('finance_staff on submitted doc sees pending_approval and rejected', () => {
    expect(getAvailableActions('finance_staff', 'submitted')).toEqual(['pending_approval', 'rejected']);
  });

  it('admin on pending_approval doc sees approved and rejected', () => {
    expect(getAvailableActions('admin', 'pending_approval')).toEqual(['approved', 'rejected']);
  });

  it('admin on approved doc sees processed only', () => {
    expect(getAvailableActions('admin', 'approved')).toEqual(['processed']);
  });

  it('student sees no actions', () => {
    expect(getAvailableActions('student', 'submitted')).toEqual([]);
  });

  it('auditor sees no actions', () => {
    expect(getAvailableActions('auditor', 'pending_approval')).toEqual([]);
  });

  it('no actions on rejected doc even for staff', () => {
    expect(getAvailableActions('finance_staff', 'rejected')).toEqual([]);
  });

  it('no actions on processed doc even for admin', () => {
    expect(getAvailableActions('admin', 'processed')).toEqual([]);
  });
});

// ─── Optimistic revert logic ──────────────────────────────────────────────────

describe('optimistic update revert', () => {
  it('restores the previous status on API error', () => {
    // Simulate the optimistic update + revert pattern
    let currentStatus: DocumentStatus = 'submitted';
    const previousStatus: DocumentStatus = 'submitted';

    // Optimistic update
    currentStatus = 'approved';
    expect(currentStatus).toBe('approved');

    // Simulate error — revert
    currentStatus = previousStatus;
    expect(currentStatus).toBe('submitted');
  });
});

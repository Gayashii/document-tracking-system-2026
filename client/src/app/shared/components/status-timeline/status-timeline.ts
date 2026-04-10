import { Component, input, computed } from '@angular/core';
import type { DocumentMeta, DocumentStatus } from '../../../core/services/api/document-api.service';
import type { StatusHistoryEntry } from '../../../core/services/api/document-api.service';

/** All statuses in the canonical forward path (rejection is a branch). */
export const MAIN_STEPS: DocumentStatus[] = [
  'submitted',
  'pending_approval',
  'approved',
  'processed',
];

export const STEP_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  processed: 'Processed',
};

/** Index of the current status in the forward path (-1 if rejected). */
export function mainStepIndex(status: DocumentStatus): number {
  return MAIN_STEPS.indexOf(status);
}

/** True when the forward step at `stepIdx` has been reached. */
export function isStepCompleted(docStatus: DocumentStatus, stepIdx: number): boolean {
  const idx = mainStepIndex(docStatus);
  if (docStatus === 'rejected') return false;
  return idx >= stepIdx;
}

/** True when this is the current active step (not yet completed). */
export function isStepActive(docStatus: DocumentStatus, stepIdx: number): boolean {
  return mainStepIndex(docStatus) === stepIdx;
}

@Component({
  selector: 'app-status-timeline',
  templateUrl: './status-timeline.html',
})
export class StatusTimelineComponent {
  readonly document = input.required<DocumentMeta>();
  readonly history = input<StatusHistoryEntry[]>([]);

  readonly isRejected = computed(() => this.document().status === 'rejected');

  /** Steps shown in the forward path; when rejected, stop after the step the rejection branched from. */
  readonly visibleSteps = computed((): DocumentStatus[] => {
    const doc = this.document();
    if (doc.status === 'rejected') {
      // Show steps up to the last forward status reached before rejection
      const lastForward = this.history()
        .filter((h) => h.toStatus !== 'rejected')
        .map((h) => MAIN_STEPS.indexOf(h.toStatus as DocumentStatus))
        .filter((i) => i >= 0)
        .reduce((max, i) => Math.max(max, i), 0);
      return MAIN_STEPS.slice(0, lastForward + 1);
    }
    return MAIN_STEPS;
  });

  /** History entry whose `toStatus` matches `status`. */
  historyFor(status: string): StatusHistoryEntry | undefined {
    return this.history().find((h) => h.toStatus === status);
  }

  stepCompleted(stepStatus: DocumentStatus): boolean {
    const doc = this.document();
    if (doc.status === 'rejected') {
      // A forward step is "completed" only if history shows we passed through it
      return this.history().some((h) => h.toStatus === stepStatus);
    }
    return isStepCompleted(doc.status, MAIN_STEPS.indexOf(stepStatus));
  }

  stepActive(stepStatus: DocumentStatus): boolean {
    return this.document().status === stepStatus;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  readonly mainSteps = MAIN_STEPS;
  readonly stepLabels = STEP_LABELS;
}

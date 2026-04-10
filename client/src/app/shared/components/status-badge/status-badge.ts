import { Component, input, computed } from '@angular/core';
import type { DocumentStatus } from '../../../core/services/api/document-api.service';

const STATUS_LABELS: Record<DocumentStatus, string> = {
  submitted: 'Submitted',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  processed: 'Processed',
};

const STATUS_CLASSES: Record<DocumentStatus, string> = {
  submitted: 'badge-submitted',
  pending_approval: 'badge-pending',
  approved: 'badge-approved',
  rejected: 'badge-rejected',
  processed: 'badge-processed',
};

@Component({
  selector: 'app-status-badge',
  template: `
    <span class="badge rounded-pill {{ badgeClass() }}" [attr.aria-label]="'Status: ' + label()">
      {{ label() }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<DocumentStatus>();
  readonly label = computed(() => STATUS_LABELS[this.status()] ?? this.status());
  readonly badgeClass = computed(() => STATUS_CLASSES[this.status()] ?? 'bg-secondary text-white');
}

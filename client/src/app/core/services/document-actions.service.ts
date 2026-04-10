import { Injectable, inject } from '@angular/core';
import {
  DocumentApiService,
  DocumentMeta,
  DocumentStatus,
} from './api/document-api.service';
import { ToastService } from './toast.service';

export interface TransitionCallbacks {
  onOptimisticUpdate: () => void;
  onSuccess: (doc: DocumentMeta) => void;
  onRevert: () => void;
}

@Injectable({ providedIn: 'root' })
export class DocumentActionsService {
  constructor(
    private readonly docApi: DocumentApiService,
    private readonly toast: ToastService,
  ) {}

  /**
   * Optimistically transition a document status.
   *
   * Calls `onOptimisticUpdate` immediately (before the HTTP request),
   * then fires the API call. On success calls `onSuccess` and shows a
   * success toast. On error calls `onRevert` and shows an error toast.
   */
  transitionStatus(
    docId: number,
    action: DocumentStatus,
    note: string | undefined,
    callbacks: TransitionCallbacks,
  ): void {
    callbacks.onOptimisticUpdate();

    this.docApi.updateStatus(docId, action, note).subscribe({
      next: (doc) => {
        callbacks.onSuccess(doc);
        this.toast.success(
          `Status updated to "${action.replace(/_/g, ' ')}".`,
        );
      },
      error: (err) => {
        callbacks.onRevert();
        const msg =
          (err as any)?.error?.error?.message ?? 'Failed to update status.';
        this.toast.error(msg);
      },
    });
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { DocumentActionsService } from './document-actions.service';
import type { DocumentMeta } from './api/document-api.service';

const STUB_DOC: DocumentMeta = {
  id: 1,
  referenceNumber: 'PGI-2026-000001',
  title: 'Test Doc',
  documentType: 'Receipt',
  documentTypeId: 1,
  status: 'submitted',
  studentId: 10,
  academicYear: '2026',
  financialAmount: null,
  fileName: 'test.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  barcodeNumber: null,
  submittedAt: '2026-04-02T00:00:00Z',
  updatedAt: '2026-04-02T00:00:00Z',
  departmentId: null,
};

function makeService(updateStatusReturn: any) {
  const docApi = { updateStatus: vi.fn().mockReturnValue(updateStatusReturn) } as any;
  const toast  = { success: vi.fn(), error: vi.fn() } as any;
  const svc    = new DocumentActionsService(docApi, toast);
  return { svc, docApi, toast };
}

describe('DocumentActionsService', () => {
  it('calls onOptimisticUpdate immediately before API resolves', () => {
    const { svc } = makeService(of(STUB_DOC));
    const onOptimisticUpdate = vi.fn();

    svc.transitionStatus(1, 'approved', undefined, {
      onOptimisticUpdate,
      onSuccess: vi.fn(),
      onRevert: vi.fn(),
    });

    expect(onOptimisticUpdate).toHaveBeenCalledTimes(1);
  });

  it('calls onSuccess and shows success toast on API success', () => {
    const updated = { ...STUB_DOC, status: 'approved' as const };
    const { svc, toast } = makeService(of(updated));
    const onSuccess = vi.fn();
    const onRevert  = vi.fn();

    svc.transitionStatus(1, 'approved', 'LGTM', {
      onOptimisticUpdate: vi.fn(),
      onSuccess,
      onRevert,
    });

    expect(onSuccess).toHaveBeenCalledWith(updated);
    expect(toast.success).toHaveBeenCalled();
    expect(onRevert).not.toHaveBeenCalled();
  });

  it('calls onRevert and shows error toast on API failure', () => {
    const { svc, toast } = makeService(
      throwError(() => ({ error: { error: { message: 'Not allowed' } } })),
    );
    const onRevert  = vi.fn();
    const onSuccess = vi.fn();

    svc.transitionStatus(1, 'approved', undefined, {
      onOptimisticUpdate: vi.fn(),
      onSuccess,
      onRevert,
    });

    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Not allowed');
  });

  it('uses fallback message when API error has no message', () => {
    const { svc, toast } = makeService(throwError(() => ({})));

    svc.transitionStatus(1, 'rejected', 'bad doc', {
      onOptimisticUpdate: vi.fn(),
      onSuccess: vi.fn(),
      onRevert: vi.fn(),
    });

    expect(toast.error).toHaveBeenCalledWith('Failed to update status.');
  });

  it('passes the note through to docApi.updateStatus', () => {
    const { svc, docApi } = makeService(of(STUB_DOC));

    svc.transitionStatus(1, 'rejected', 'wrong file', {
      onOptimisticUpdate: vi.fn(),
      onSuccess: vi.fn(),
      onRevert: vi.fn(),
    });

    expect(docApi.updateStatus).toHaveBeenCalledWith(1, 'rejected', 'wrong file');
  });
});

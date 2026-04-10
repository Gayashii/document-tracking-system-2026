import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalErrorHandler } from './global-error-handler';

function makeHandler() {
  const toast   = { error: vi.fn() } as any;
  const handler = new GlobalErrorHandler(toast);
  return { handler, toast };
}

describe('GlobalErrorHandler', () => {
  it('shows a friendly error toast', () => {
    const { handler, toast } = makeHandler();
    handler.handleError(new Error('oops'));
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Something went wrong'),
    );
  });

  it('logs the error to console.error', () => {
    const { handler } = makeHandler();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('test error');
    handler.handleError(err);
    expect(spy).toHaveBeenCalledWith('[GlobalErrorHandler]', err);
    spy.mockRestore();
  });

  it('does not throw if toast.error itself throws', () => {
    const { handler, toast } = makeHandler();
    toast.error.mockImplementation(() => { throw new Error('toast unavailable'); });
    expect(() => handler.handleError(new Error('x'))).not.toThrow();
  });

  it('handles non-Error values gracefully', () => {
    const { handler } = makeHandler();
    expect(() => handler.handleError('string error')).not.toThrow();
    expect(() => handler.handleError(null)).not.toThrow();
  });
});

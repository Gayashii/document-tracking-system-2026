import { ErrorHandler, Injectable } from '@angular/core';
import { ToastService } from './services/toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private readonly toast: ToastService) {}

  handleError(error: unknown): void {
    console.error('[GlobalErrorHandler]', error);
    try {
      this.toast.error('Something went wrong. Please reload the page.');
    } catch {
      // ToastService may not yet be available during early bootstrap errors
    }
  }
}

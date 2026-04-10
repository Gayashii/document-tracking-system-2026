import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, SpinnerComponent],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly submitting = signal(false);
  readonly showPassword = signal(false);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  get email() { return this.form.controls.email; }
  get password() { return this.form.controls.password; }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);

    this.auth
      .login(this.email.value!, this.password.value!)
      .subscribe({
        next: () => this.router.navigate(['/app/dashboard']),
        error: (err) => {
          this.submitting.set(false);
          this.toast.error(err?.error?.message ?? 'Login failed. Please check your credentials.');
        },
      });
  }
}

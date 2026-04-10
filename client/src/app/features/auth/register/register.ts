import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';

function passwordMatch(group: AbstractControl): ValidationErrors | null {
  const pw = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return pw && confirm && pw !== confirm ? { passwordMismatch: true } : null;
}

function passwordStrength(control: AbstractControl): ValidationErrors | null {
  const v: string = control.value ?? '';
  if (!v) return null;
  if (!/[A-Z]/.test(v)) return { passwordStrength: 'Must contain at least one uppercase letter' };
  if (!/[a-z]/.test(v)) return { passwordStrength: 'Must contain at least one lowercase letter' };
  if (!/[0-9]/.test(v)) return { passwordStrength: 'Must contain at least one number' };
  if (!/[^A-Za-z0-9]/.test(v)) return { passwordStrength: 'Must contain at least one special character' };
  return null;
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, SpinnerComponent],
  templateUrl: './register.html',
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly submitting = signal(false);

  readonly form = this.fb.group(
    {
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      studentId: [''],
      password: ['', [Validators.required, Validators.minLength(8), passwordStrength]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordMatch },
  );

  get fullName() { return this.form.controls.fullName; }
  get email() { return this.form.controls.email; }
  get studentId() { return this.form.controls.studentId; }
  get password() { return this.form.controls.password; }
  get confirmPassword() { return this.form.controls.confirmPassword; }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);

    this.auth
      .register({
        fullName: this.fullName.value!,
        email: this.email.value!,
        password: this.password.value!,
        studentId: this.studentId.value ?? undefined,
      })
      .subscribe({
        next: () => {
          this.toast.success('Registration successful! Welcome.');
          this.router.navigate(['/app/dashboard']);
        },
        error: (err) => {
          this.submitting.set(false);
          this.toast.error(err?.error?.message ?? 'Registration failed. Please try again.');
        },
      });
  }
}

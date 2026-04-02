import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showPassword = signal(false);

  form = this.fb.group({
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(100)]]
  });

  passwordStrength = computed(() => {
    const pw = this.form.get('password')?.value ?? '';
    if (pw.length < 8) return 0;
    let score = 0;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (pw.length >= 12) score++;
    return score; // 0-4
  });

  passwordStrengthLabel = computed(() => {
    const s = this.passwordStrength();
    if (s === 0) return '';
    if (s === 1) return 'Weak';
    if (s === 2) return 'Fair';
    if (s === 3) return 'Good';
    return 'Strong';
  });

  strengthClass = computed(() => {
    const s = this.passwordStrength();
    if (s <= 1) return 'weak';
    if (s === 2) return 'fair';
    if (s === 3) return 'good';
    return 'strong';
  });

  fieldError(name: string): string | null {
    const ctrl = this.form.get(name);
    if (!ctrl?.dirty) return null;
    if (ctrl.hasError('required')) return `${this.fieldLabel(name)} is required`;
    if (ctrl.hasError('email')) return 'Enter a valid email address';
    if (ctrl.hasError('minlength')) {
      const min = ctrl.errors?.['minlength']?.requiredLength;
      return `Minimum ${min} characters`;
    }
    if (ctrl.hasError('maxlength')) return 'Too long';
    return null;
  }

  private fieldLabel(name: string): string {
    const labels: Record<string, string> = {
      displayName: 'Name', email: 'Email', password: 'Password'
    };
    return labels[name] ?? name;
  }

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password, displayName } = this.form.value;
    this.authService.register({ email: email!, password: password!, displayName: displayName! }).subscribe({
      next: () => {
        this.router.navigate(['/notes']);
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading.set(false);
        if (err.status === 409) {
          this.errorMessage.set('An account with this email already exists');
        } else {
          this.errorMessage.set('Something went wrong. Please try again.');
        }
      }
    });
  }
}

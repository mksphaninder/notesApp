import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';

const mockAuthResponse = {
  accessToken: 'access-token-abc',
  refreshToken: 'refresh-token-xyz',
  user: { id: '1', email: 'maya@example.com', displayName: 'Maya Chen' }
};

const mockAuthService = {
  login: vi.fn(),
  isLoggedIn: { value: false }
};

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let router: Router;

  beforeEach(async () => {
    mockAuthService.login.mockReset();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders email input, password input, and submit button', () => {
      const native = fixture.nativeElement as HTMLElement;
      expect(native.querySelector('input[id="email"]')).not.toBeNull();
      expect(native.querySelector('input[id="password"]')).not.toBeNull();
      expect(native.querySelector('button[type="submit"]')).not.toBeNull();
    });

    it('renders a link to the register page', () => {
      const native = fixture.nativeElement as HTMLElement;
      const anchor = native.querySelector('a[href="/register"]') as HTMLAnchorElement;
      expect(anchor).not.toBeNull();
      expect(anchor.textContent?.trim()).toBe('Create one');
    });
  });

  // ---------------------------------------------------------------------------
  // Form validation
  // ---------------------------------------------------------------------------

  describe('Form validation', () => {
    it('emailError returns null when the email field is pristine', () => {
      expect(component.emailError).toBeNull();
    });

    it('emailError returns "Email is required" when the field is empty and dirty', () => {
      const emailCtrl = component.form.get('email')!;
      emailCtrl.setValue('');
      emailCtrl.markAsDirty();
      fixture.detectChanges();
      expect(component.emailError).toBe('Email is required');
    });

    it('emailError returns "Enter a valid email address" for an invalid email format', () => {
      const emailCtrl = component.form.get('email')!;
      emailCtrl.setValue('not-an-email');
      emailCtrl.markAsDirty();
      fixture.detectChanges();
      expect(component.emailError).toBe('Enter a valid email address');
    });

    it('passwordError returns null when the password field is pristine', () => {
      expect(component.passwordError).toBeNull();
    });

    it('passwordError returns "Password must be at least 8 characters" for a short password', () => {
      const passCtrl = component.form.get('password')!;
      passCtrl.setValue('abc');
      passCtrl.markAsDirty();
      fixture.detectChanges();
      expect(component.passwordError).toBe('Password must be at least 8 characters');
    });
  });

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  describe('Interaction', () => {
    it('togglePassword() toggles showPassword signal between true and false', () => {
      expect(component.showPassword()).toBe(false);
      component.togglePassword();
      expect(component.showPassword()).toBe(true);
      component.togglePassword();
      expect(component.showPassword()).toBe(false);
    });

    it('submit with an invalid form marks all controls as touched and does NOT call authService.login', () => {
      // Form is invalid by default (empty required fields)
      component.onSubmit();
      fixture.detectChanges();
      expect(component.form.get('email')?.touched).toBe(true);
      expect(component.form.get('password')?.touched).toBe(true);
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });

    it('submit with a valid form calls authService.login with correct credentials', () => {
      mockAuthService.login.mockReturnValue(of(mockAuthResponse));
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.form.get('email')?.setValue('maya@example.com');
      component.form.get('password')?.setValue('secret123');
      fixture.detectChanges();

      component.onSubmit();

      expect(mockAuthService.login).toHaveBeenCalledWith({
        email: 'maya@example.com',
        password: 'secret123'
      });
      expect(navigateSpy).toHaveBeenCalledWith(['/notes']);
    });

    it('shows a spinner and disables the submit button while isLoading is true', () => {
      component.isLoading.set(true);
      fixture.detectChanges();

      const native = fixture.nativeElement as HTMLElement;
      const submitBtn = native.querySelector('button[type="submit"]') as HTMLButtonElement;
      const spinner = native.querySelector('.spinner');

      expect(submitBtn.disabled).toBe(true);
      expect(spinner).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe('Error handling', () => {
    it('displays an error alert when errorMessage signal is set', () => {
      component.errorMessage.set('Something went wrong.');
      fixture.detectChanges();

      const native = fixture.nativeElement as HTMLElement;
      const alert = native.querySelector('[role="alert"]') as HTMLElement;
      expect(alert).not.toBeNull();
      expect(alert.textContent?.trim()).toBe('Something went wrong.');
    });

    it('sets "Invalid email or password" when the server responds with a 401', () => {
      const error = new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });
      mockAuthService.login.mockReturnValue(throwError(() => error));

      component.form.get('email')?.setValue('maya@example.com');
      component.form.get('password')?.setValue('secret123');
      component.onSubmit();
      fixture.detectChanges();

      expect(component.errorMessage()).toBe('Invalid email or password');
      expect(component.isLoading()).toBe(false);
    });

    it('sets a generic error message when the server responds with a 500', () => {
      const error = new HttpErrorResponse({ status: 500, statusText: 'Internal Server Error' });
      mockAuthService.login.mockReturnValue(throwError(() => error));

      component.form.get('email')?.setValue('maya@example.com');
      component.form.get('password')?.setValue('secret123');
      component.onSubmit();
      fixture.detectChanges();

      expect(component.errorMessage()).toBe('Something went wrong. Please try again.');
      expect(component.isLoading()).toBe(false);
    });
  });
});

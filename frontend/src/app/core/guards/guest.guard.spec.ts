import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';

import { guestGuard } from './guest.guard';
import { AuthService } from '../services/auth.service';

// ---------------------------------------------------------------------------
// Helper — build a minimal AuthService mock whose isLoggedIn is a real signal
// so Angular's computed() inside the guard works correctly.
// ---------------------------------------------------------------------------
function buildMockAuthService(loggedIn: boolean): Partial<AuthService> {
  const _loggedIn = signal(loggedIn);
  return {
    isLoggedIn: _loggedIn.asReadonly() as unknown as AuthService['isLoggedIn']
  };
}

// ---------------------------------------------------------------------------
describe('guestGuard', () => {
  let router: Router;

  function configure(loggedIn: boolean) {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: buildMockAuthService(loggedIn) },
        provideRouter([])
      ]
    });
    router = TestBed.inject(Router);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  describe('when Maya is a guest (not logged in)', () => {
    it('returns true and allows access to the guest route', () => {
      configure(false);

      const result = TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));

      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('when Maya is already logged in', () => {
    it('returns a UrlTree that redirects to /notes', () => {
      configure(true);

      const result = TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));

      expect(result).toBeInstanceOf(UrlTree);
      const urlTree = result as UrlTree;
      expect(router.serializeUrl(urlTree)).toBe('/notes');
    });
  });
});

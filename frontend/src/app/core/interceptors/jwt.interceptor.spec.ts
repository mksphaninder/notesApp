import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { jwtInterceptor } from './jwt.interceptor';
import { AuthService } from '../services/auth.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal AuthService mock with vi.fn() stubs. */
function buildMockAuthService(overrides: Partial<{
  getAccessToken: () => string | null;
  isLoggedIn: () => boolean;
  refreshToken: () => ReturnType<AuthService['refreshToken']>;
}> = {}): Partial<AuthService> {
  return {
    getAccessToken: vi.fn(() => null),
    isLoggedIn: vi.fn(() => false),
    refreshToken: vi.fn(() => throwError(() => new Error('No refresh token'))),
    ...overrides
  };
}

const TEST_URL = 'http://localhost:8080/api/v1/notes';
const AUTH_URL = 'http://localhost:8080/api/v1/auth/login';

// ---------------------------------------------------------------------------
describe('jwtInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let mockAuthService: Partial<AuthService>;

  function configure(authOverrides: Parameters<typeof buildMockAuthService>[0] = {}) {
    mockAuthService = buildMockAuthService(authOverrides);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  describe('Authorization header injection', () => {
    it('adds Authorization: Bearer <token> header when a token is present', () => {
      configure({ getAccessToken: vi.fn(() => 'my-access-token') });

      httpClient.get(TEST_URL).subscribe();

      const req = httpMock.expectOne(TEST_URL);
      expect(req.request.headers.get('Authorization')).toBe('Bearer my-access-token');
      req.flush({});
    });

    it('does NOT add Authorization header when no token is present', () => {
      configure({ getAccessToken: vi.fn(() => null) });

      httpClient.get(TEST_URL).subscribe();

      const req = httpMock.expectOne(TEST_URL);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('does NOT modify requests to URLs containing /auth/', () => {
      configure({ getAccessToken: vi.fn(() => 'my-access-token') });

      httpClient.post(AUTH_URL, { email: 'maya@example.com', password: 'secret' }).subscribe();

      const req = httpMock.expectOne(AUTH_URL);
      // The interceptor should pass through unchanged — no Authorization added
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });
  });

  // -------------------------------------------------------------------------
  describe('401 handling — silent token refresh', () => {
    it('on 401: calls refreshToken(), then retries the original request with the new token', () => {
      const refreshedToken = 'refreshed-token';

      // After refresh, getAccessToken returns the new token
      const getAccessToken = vi.fn()
        .mockReturnValueOnce('old-token')   // first call (original request)
        .mockReturnValue(refreshedToken);    // subsequent calls (retry)

      const refreshToken = vi.fn(() => of({
        accessToken: refreshedToken,
        refreshToken: 'new-refresh',
        tokenType: 'Bearer',
        expiresIn: 900000,
        user: { id: '123', email: 'maya@example.com', displayName: 'Maya Chen' }
      }));

      configure({ getAccessToken, refreshToken });

      let responseBody: unknown;
      httpClient.get(TEST_URL).subscribe(res => (responseBody = res));

      // First request — respond with 401
      const firstReq = httpMock.expectOne(TEST_URL);
      expect(firstReq.request.headers.get('Authorization')).toBe('Bearer old-token');
      firstReq.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      // Retry request — should carry the refreshed token
      const retryReq = httpMock.expectOne(TEST_URL);
      expect(retryReq.request.headers.get('Authorization')).toBe(`Bearer ${refreshedToken}`);
      retryReq.flush({ data: 'notes content' });

      expect(refreshToken).toHaveBeenCalledWith();
      expect(responseBody).toEqual({ data: 'notes content' });
    });

    it('on 401 and refresh failure: propagates the error to the caller', () => {
      const refreshError = new Error('Refresh token expired');
      const refreshToken = vi.fn(() => throwError(() => refreshError));

      configure({
        getAccessToken: vi.fn(() => 'old-token'),
        refreshToken
      });

      let caughtError: unknown;
      httpClient.get(TEST_URL).subscribe({ error: err => (caughtError = err) });

      // First request — 401
      const req = httpMock.expectOne(TEST_URL);
      req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      // No retry should be attempted when refresh itself fails
      httpMock.expectNone(TEST_URL);

      expect(refreshToken).toHaveBeenCalledWith();
      expect(caughtError).toBe(refreshError);
    });
  });
});

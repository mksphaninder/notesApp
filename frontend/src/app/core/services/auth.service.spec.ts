import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';
import { AuthResponse } from '../models/auth.models';

const API = 'http://localhost:8080/api/v1';

const ACCESS_TOKEN_KEY = 'notesapp_access_token';
const REFRESH_TOKEN_KEY = 'notesapp_refresh_token';
const USER_KEY = 'notesapp_user';

const mockAuthResponse: AuthResponse = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  tokenType: 'Bearer',
  expiresIn: 900000,
  user: { id: '123', email: 'maya@example.com', displayName: 'Maya Chen' }
};

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let router: Router;

  // Re-create TestBed before each test so the service re-reads localStorage on construction
  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('isLoggedIn', () => {
    it('returns false with empty localStorage', () => {
      expect(service.isLoggedIn()).toBe(false);
    });

    it('returns true when access token and user are present in localStorage', () => {
      localStorage.setItem(ACCESS_TOKEN_KEY, 'some-token');
      localStorage.setItem(USER_KEY, JSON.stringify(mockAuthResponse.user));

      // Re-create service so it reads the pre-seeded localStorage
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([])
        ]
      });
      const freshService = TestBed.inject(AuthService);

      expect(freshService.isLoggedIn()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('register()', () => {
    it('Maya registers successfully — POSTs to /auth/register, stores tokens and updates signals', () => {
      const registerRequest = {
        email: 'maya@example.com',
        password: 'secret123',
        displayName: 'Maya Chen'
      };

      let resolved: AuthResponse | undefined;
      service.register(registerRequest).subscribe(res => (resolved = res));

      const req = httpMock.expectOne(`${API}/auth/register`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(registerRequest);
      req.flush(mockAuthResponse);

      expect(resolved).toEqual(mockAuthResponse);
      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe(mockAuthResponse.accessToken);
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe(mockAuthResponse.refreshToken);
      expect(JSON.parse(localStorage.getItem(USER_KEY)!)).toEqual(mockAuthResponse.user);
      expect(service.isLoggedIn()).toBe(true);
      expect(service.currentUser()).toEqual(mockAuthResponse.user);
    });

    it('propagates error when registration API returns HTTP failure', () => {
      const registerRequest = {
        email: 'maya@example.com',
        password: 'bad',
        displayName: 'Maya Chen'
      };

      let caughtError: unknown;
      service.register(registerRequest).subscribe({
        error: err => (caughtError = err)
      });

      const req = httpMock.expectOne(`${API}/auth/register`);
      req.flush({ message: 'Email already taken' }, { status: 409, statusText: 'Conflict' });

      expect(caughtError).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  describe('login()', () => {
    it('Maya logs in successfully — POSTs to /auth/login, stores tokens and updates signals', () => {
      const loginRequest = { email: 'maya@example.com', password: 'secret123' };

      let resolved: AuthResponse | undefined;
      service.login(loginRequest).subscribe(res => (resolved = res));

      const req = httpMock.expectOne(`${API}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(loginRequest);
      req.flush(mockAuthResponse);

      expect(resolved).toEqual(mockAuthResponse);
      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe(mockAuthResponse.accessToken);
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe(mockAuthResponse.refreshToken);
      expect(JSON.parse(localStorage.getItem(USER_KEY)!)).toEqual(mockAuthResponse.user);
      expect(service.isLoggedIn()).toBe(true);
      expect(service.currentUser()).toEqual(mockAuthResponse.user);
    });

    it('propagates error when login returns 401 Unauthorized', () => {
      const loginRequest = { email: 'maya@example.com', password: 'wrong-password' };

      let caughtError: unknown;
      service.login(loginRequest).subscribe({
        error: err => (caughtError = err)
      });

      const req = httpMock.expectOne(`${API}/auth/login`);
      req.flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

      expect(caughtError).toBeTruthy();
      expect(service.isLoggedIn()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('logout()', () => {
    beforeEach(() => {
      // Seed a full session before each logout test
      localStorage.setItem(ACCESS_TOKEN_KEY, mockAuthResponse.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, mockAuthResponse.refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(mockAuthResponse.user));

      // Re-create service with pre-seeded state
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([])
        ]
      });
      service = TestBed.inject(AuthService);
      httpMock = TestBed.inject(HttpTestingController);
      router = TestBed.inject(Router);
    });

    it('POSTs to /auth/logout, clears localStorage and signals, then navigates to /login', () => {
      vi.spyOn(router, 'navigate');

      service.logout();

      const req = httpMock.expectOne(`${API}/auth/logout`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ refreshToken: mockAuthResponse.refreshToken });
      req.flush({});

      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(USER_KEY)).toBeNull();
      expect(service.isLoggedIn()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('clears session and navigates even when the logout API call fails', () => {
      vi.spyOn(router, 'navigate');

      service.logout();

      const req = httpMock.expectOne(`${API}/auth/logout`);
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(USER_KEY)).toBeNull();
      expect(service.isLoggedIn()).toBe(false);
      // navigate is called synchronously before the HTTP response
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  // ---------------------------------------------------------------------------
  describe('refreshToken()', () => {
    it('POSTs to /auth/refresh and updates stored tokens on success', () => {
      localStorage.setItem(REFRESH_TOKEN_KEY, mockAuthResponse.refreshToken);

      const newResponse: AuthResponse = {
        ...mockAuthResponse,
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token'
      };

      let resolved: AuthResponse | undefined;
      service.refreshToken()!.subscribe(res => (resolved = res as AuthResponse));

      const req = httpMock.expectOne(`${API}/auth/refresh`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ refreshToken: mockAuthResponse.refreshToken });
      req.flush(newResponse);

      expect(resolved).toEqual(newResponse);
      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('new-access-token');
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('new-refresh-token');
      expect(service.getAccessToken()).toBe('new-access-token');
    });

    it('clears session and navigates to /login when refresh fails', () => {
      localStorage.setItem(ACCESS_TOKEN_KEY, mockAuthResponse.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, mockAuthResponse.refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(mockAuthResponse.user));

      // Re-create service with pre-seeded state
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([])
        ]
      });
      service = TestBed.inject(AuthService);
      httpMock = TestBed.inject(HttpTestingController);
      router = TestBed.inject(Router);
      vi.spyOn(router, 'navigate');

      let caughtError: unknown;
      service.refreshToken()!.subscribe({ error: err => (caughtError = err) });

      const req = httpMock.expectOne(`${API}/auth/refresh`);
      req.flush({ message: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

      expect(caughtError).toBeTruthy();
      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(service.isLoggedIn()).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('returns an error observable immediately when no refresh token is present', () => {
      // localStorage is empty from beforeEach
      let caughtError: Error | undefined;
      service.refreshToken()!.subscribe({ error: err => (caughtError = err) });

      // No HTTP request should be made
      httpMock.expectNone(`${API}/auth/refresh`);
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError!.message).toBe('No refresh token');
    });
  });

  // ---------------------------------------------------------------------------
  describe('getAccessToken()', () => {
    it('returns the stored access token from the signal', () => {
      localStorage.setItem(ACCESS_TOKEN_KEY, 'my-stored-token');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([])
        ]
      });
      const freshService = TestBed.inject(AuthService);
      httpMock = TestBed.inject(HttpTestingController);

      expect(freshService.getAccessToken()).toBe('my-stored-token');
    });

    it('returns null when no access token is in localStorage', () => {
      expect(service.getAccessToken()).toBeNull();
    });
  });
});

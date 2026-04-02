import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse, LoginRequest, RegisterRequest,
  LogoutRequest, RefreshRequest, UserResponse
} from '../models/auth.models';

const ACCESS_TOKEN_KEY = 'notesapp_access_token';
const REFRESH_TOKEN_KEY = 'notesapp_refresh_token';
const USER_KEY = 'notesapp_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private _currentUser = signal<UserResponse | null>(this.loadUser());
  private _accessToken = signal<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY));

  readonly currentUser = this._currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this._currentUser() !== null && this._accessToken() !== null);

  register(request: RegisterRequest) {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/register`, request).pipe(
      tap(response => this.storeSession(response)),
      catchError(err => throwError(() => err))
    );
  }

  login(request: LoginRequest) {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, request).pipe(
      tap(response => this.storeSession(response)),
      catchError(err => throwError(() => err))
    );
  }

  logout() {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      const body: LogoutRequest = { refreshToken };
      this.http.post(`${environment.apiUrl}/auth/logout`, body).subscribe({
        error: () => {} // silent — always clear local session
      });
    }
    this.clearSession();
    this.router.navigate(['/login']);
  }

  refreshToken() {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      this.clearSession();
      return throwError(() => new Error('No refresh token'));
    }
    const body: RefreshRequest = { refreshToken };
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/refresh`, body).pipe(
      tap(response => this.storeSession(response)),
      catchError(err => {
        this.clearSession();
        this.router.navigate(['/login']);
        return throwError(() => err);
      })
    );
  }

  getAccessToken(): string | null {
    return this._accessToken();
  }

  private storeSession(response: AuthResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this._accessToken.set(response.accessToken);
    this._currentUser.set(response.user);
  }

  private clearSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._accessToken.set(null);
    this._currentUser.set(null);
  }

  private loadUser(): UserResponse | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

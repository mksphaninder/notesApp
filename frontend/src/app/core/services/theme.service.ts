import { Injectable, signal, computed, effect } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'notesapp_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  theme = signal<Theme>(this.initialTheme());
  isDark = computed(() => this.theme() === 'dark');

  constructor() {
    effect(() => {
      document.documentElement.classList.toggle('dark', this.isDark());
      localStorage.setItem(STORAGE_KEY, this.theme());
    });
  }

  toggleTheme(): void {
    this.theme.update(t => t === 'light' ? 'dark' : 'light');
  }

  private initialTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}

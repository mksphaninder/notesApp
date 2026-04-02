import { Routes } from '@angular/router';

// Phase 2 — Notes CRUD routes (Milestone 2.2)
export const notesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./notes-shell/notes-shell.component').then(m => m.NotesShellComponent)
  }
];

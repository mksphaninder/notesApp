import { Routes } from '@angular/router';
import { NotesShellComponent } from './notes-shell/notes-shell.component';

export const notesRoutes: Routes = [
  {
    path: '',
    component: NotesShellComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./note-empty/note-empty.component').then(m => m.NoteEmptyComponent)
      },
      {
        path: ':id',
        loadComponent: () => import('./note-editor/note-editor.component').then(m => m.NoteEditorComponent)
      }
    ]
  }
];

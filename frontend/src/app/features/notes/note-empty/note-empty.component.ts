import { Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-note-empty',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="empty">
      <div class="empty__icon">📝</div>
      <h2 class="empty__heading">Select a note</h2>
      <p class="empty__sub">Choose a note from the sidebar or create a new one.</p>
      <button class="empty__cta" (click)="createNote.emit()">+ New note</button>
    </div>
  `,
  styles: [`
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #9ca3af;
      text-align: center;
      padding: 2rem;
      gap: 0.5rem;
    }
    .empty__icon { font-size: 3rem; margin-bottom: 0.5rem; }
    .empty__heading { font-size: 1.125rem; font-weight: 600; color: #374151; margin: 0; }
    .empty__sub { font-size: 0.875rem; margin: 0; }
    .empty__cta {
      margin-top: 0.75rem;
      padding: 0.5rem 1.25rem;
      background: #6366f1;
      color: #fff;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: opacity 0.15s;
      &:hover { opacity: 0.9; }
    }
  `]
})
export class NoteEmptyComponent {
  createNote = output<void>();
}

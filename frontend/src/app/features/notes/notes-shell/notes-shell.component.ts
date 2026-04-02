import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

// Placeholder — Phase 2, Milestone 2.2 will replace this
@Component({
  selector: 'app-notes-shell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:'Inter',sans-serif;color:#6b7280">
      <div style="text-align:center">
        <div style="font-size:3rem;margin-bottom:1rem">📝</div>
        <h2 style="font-size:1.25rem;font-weight:600;color:#111827;margin-bottom:0.5rem">You're in!</h2>
        <p>Notes UI coming in Phase 2</p>
      </div>
    </div>
  `
})
export class NotesShellComponent {}

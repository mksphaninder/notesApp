import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router } from '@angular/router';
import { NoteService } from '../../../core/services/note.service';
import { TagService } from '../../../core/services/tag.service';
import { NotesListComponent } from '../notes-list/notes-list.component';

@Component({
  selector: 'app-notes-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NotesListComponent],
  templateUrl: './notes-shell.component.html',
  styleUrl: './notes-shell.component.scss'
})
export class NotesShellComponent implements OnInit {
  noteService = inject(NoteService);
  tagService = inject(TagService);
  private router = inject(Router);

  sidebarOpen = signal(false);

  ngOnInit() {
    this.noteService.loadNotes().subscribe();
    this.tagService.loadTags().subscribe();
  }

  onCreateNote() {
    this.noteService.createNote({ title: 'Untitled', content: '{"type":"doc","content":[]}' })
      .subscribe(note => {
        this.sidebarOpen.set(false);
        this.router.navigate(['/notes', note.id]);
      });
  }

  toggleSidebar() { this.sidebarOpen.update(v => !v); }
  closeSidebar()  { this.sidebarOpen.set(false); }
}

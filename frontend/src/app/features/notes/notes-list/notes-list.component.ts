import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NoteService } from '../../../core/services/note.service';
import { TagService } from '../../../core/services/tag.service';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { TagManagerComponent } from '../tag-manager/tag-manager.component';

@Component({
  selector: 'app-notes-list',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, FormsModule, TagManagerComponent],
  templateUrl: './notes-list.component.html',
  styleUrl: './notes-list.component.scss'
})
export class NotesListComponent {
  noteService = inject(NoteService);
  tagService  = inject(TagService);
  themeService = inject(ThemeService);
  private authService = inject(AuthService);
  private router = inject(Router);

  createNote  = output<void>();
  sidebarClose = output<void>();

  searchQuery = signal('');
  activeTagId = signal<string | null>(null);

  private search$ = new Subject<string>();

  constructor() {
    this.search$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(q => q.trim()
        ? this.noteService.searchNotes(q)
        : this.noteService.loadNotes(0, 50, this.activeTagId() ?? undefined)
      ),
      takeUntilDestroyed()
    ).subscribe();
  }

  onSearch(value: string) {
    this.searchQuery.set(value);
    this.search$.next(value);
  }

  clearSearch() {
    this.onSearch('');
  }

  onTagFilter(tagId: string | null) {
    this.activeTagId.set(tagId);
    this.searchQuery.set('');
    this.noteService.loadNotes(0, 50, tagId ?? undefined).subscribe();
  }

  onNewNote() {
    this.createNote.emit();
  }

  onNoteClick() {
    this.sidebarClose.emit(); // closes sidebar drawer on mobile
  }

  onDeleteNote(event: Event, noteId: string) {
    event.preventDefault();
    event.stopPropagation();
    this.noteService.deleteNote(noteId).subscribe(() => {
      this.router.navigate(['/notes']);
    });
  }

  onLogout() {
    this.authService.logout();
  }

  formatDate(iso: string): string {
    const date = new Date(iso);
    const now  = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7)  return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

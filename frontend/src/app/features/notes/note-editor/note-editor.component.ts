import { Component, inject, signal, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, switchMap } from 'rxjs';
import { NoteService } from '../../../core/services/note.service';
import { TagService } from '../../../core/services/tag.service';
import { TagResponse } from '../../../core/models/note.models';

@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './note-editor.component.html',
  styleUrl: './note-editor.component.scss'
})
export class NoteEditorComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  noteService = inject(NoteService);
  tagService = inject(TagService);

  title = signal('');
  content = signal('');
  saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  showTagPicker = signal(false);

  private noteId = signal<string | null>(null);
  private destroy$ = new Subject<void>();
  private titleChange$ = new Subject<string>();
  private contentChange$ = new Subject<string>();

  ngOnInit() {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const id = params['id'];
      this.noteId.set(id);
      this.noteService.loadNote(id).subscribe(note => {
        this.title.set(note.title);
        this.content.set(note.content);
        this.saveStatus.set('idle');
      });
    });

    // Auto-save on title or content change (debounced)
    const save$ = new Subject<{ title: string; content: string }>();
    this.titleChange$.pipe(
      debounceTime(600), distinctUntilChanged(), takeUntil(this.destroy$)
    ).subscribe(t => save$.next({ title: t, content: this.content() }));

    this.contentChange$.pipe(
      debounceTime(600), distinctUntilChanged(), takeUntil(this.destroy$)
    ).subscribe(c => save$.next({ title: this.title(), content: c }));

    save$.pipe(
      debounceTime(100),
      switchMap(({ title, content }) => {
        const id = this.noteId();
        if (!id) return [];
        this.saveStatus.set('saving');
        return this.noteService.updateNote(id, { title, content });
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.saveStatus.set('saved');
        setTimeout(() => this.saveStatus.set('idle'), 2000);
      },
      error: () => this.saveStatus.set('error')
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onTitleChange(value: string) {
    this.title.set(value);
    this.titleChange$.next(value);
  }

  onContentChange(value: string) {
    this.content.set(value);
    this.contentChange$.next(value);
  }

  onTitleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      (document.querySelector('.editor__content') as HTMLElement)?.focus();
    }
  }

  toggleTagPicker() {
    this.showTagPicker.update(v => !v);
  }

  isTagAttached(tagId: string): boolean {
    return this.noteService.selectedNote()?.tags.some(t => t.id === tagId) ?? false;
  }

  toggleTag(tag: TagResponse) {
    const note = this.noteService.selectedNote();
    if (!note || !this.noteId()) return;
    const currentIds = note.tags.map(t => t.id);
    const tagIds = currentIds.includes(tag.id)
      ? currentIds.filter(id => id !== tag.id)
      : [...currentIds, tag.id];
    this.noteService.updateNote(this.noteId()!, { tagIds }).subscribe();
  }

  onDelete() {
    const id = this.noteId();
    if (!id) return;
    this.noteService.deleteNote(id).subscribe(() => this.router.navigate(['/notes']));
  }

  extractPlainText(content: string): string {
    try {
      // Phase 3: TipTap will handle this properly
      return content.replace(/"text"\s*:\s*"([^"]+)"/g, '$1 ')
                    .replace(/[{}\[\]:,"\\]/g, ' ')
                    .replace(/\s+/g, ' ').trim();
    } catch { return content; }
  }
}

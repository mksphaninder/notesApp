import { Component, inject, signal, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, switchMap } from 'rxjs';
import { NoteService } from '../../../core/services/note.service';
import { TagService } from '../../../core/services/tag.service';
import { TagResponse } from '../../../core/models/note.models';
import { TiptapEditorComponent } from './tiptap-editor/tiptap-editor.component';
import { EditorToolbarComponent } from './editor-toolbar/editor-toolbar.component';

@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [CommonModule, TiptapEditorComponent, EditorToolbarComponent],
  templateUrl: './note-editor.component.html',
  styleUrl: './note-editor.component.scss'
})
export class NoteEditorComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  noteService = inject(NoteService);
  tagService = inject(TagService);

  @ViewChild(TiptapEditorComponent) tiptapEditor?: TiptapEditorComponent;

  title = signal('');
  content = signal('{"type":"doc","content":[]}');
  saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  showTagPicker = signal(false);

  private noteId = signal<string | null>(null);
  private destroy$ = new Subject<void>();
  private save$ = new Subject<{ title: string; content: string }>();

  ngOnInit() {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const id = params['id'];
      this.noteId.set(id);
      this.showTagPicker.set(false);
      this.noteService.loadNote(id).subscribe(note => {
        this.title.set(note.title);
        this.content.set(note.content);
        this.saveStatus.set('idle');
      });
    });

    this.save$.pipe(
      debounceTime(600),
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
    this.save$.next({ title: value, content: this.content() });
  }

  onContentChange(value: string) {
    this.content.set(value);
    this.save$.next({ title: this.title(), content: value });
  }

  onTitleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.tiptapEditor?.editor?.commands.focus();
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
}

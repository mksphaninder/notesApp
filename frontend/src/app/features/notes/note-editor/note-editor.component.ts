import { Component, inject, signal, OnInit, OnDestroy, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, switchMap } from 'rxjs';
import { NoteService } from '../../../core/services/note.service';
import { TagService } from '../../../core/services/tag.service';
import { AuthService } from '../../../core/services/auth.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { TagResponse } from '../../../core/models/note.models';
import { NoteUpdateMessage } from '../../../core/models/websocket.models';
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
  private authService = inject(AuthService);
  private wsService = inject(WebSocketService);

  @ViewChild(TiptapEditorComponent) tiptapEditor?: TiptapEditorComponent;

  title = signal('');
  content = signal('{"type":"doc","content":[]}');
  saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  showTagPicker = signal(false);

  private noteId = signal<string | null>(null);
  private destroy$ = new Subject<void>();
  private save$ = new Subject<{ title: string; content: string }>();

  constructor() {
    // Re-subscribe to the current note's topic whenever WS connects (handles page reload order)
    effect(() => {
      if (this.wsService.isConnected()) {
        const id = this.noteId();
        if (id) this.wsService.subscribeToNote(id, msg => this.onRemoteUpdate(msg));
      }
    });
  }

  ngOnInit() {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const id = params['id'];
      // Unsubscribe from the previous note's topic before switching
      const prev = this.noteId();
      if (prev) this.wsService.unsubscribeFromNote(prev);

      this.noteId.set(id);
      this.showTagPicker.set(false);
      this.noteService.loadNote(id).subscribe(note => {
        this.title.set(note.title);
        this.content.set(note.content);
        this.saveStatus.set('idle');
        // Subscribe immediately if already connected; effect() handles the delayed-connect case
        if (this.wsService.isConnected()) {
          this.wsService.subscribeToNote(id, msg => this.onRemoteUpdate(msg));
        }
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
    const id = this.noteId();
    if (id) this.wsService.unsubscribeFromNote(id);
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

  private onRemoteUpdate(msg: NoteUpdateMessage): void {
    // Ignore our own saves (the backend echoes back to all subscribers including sender)
    if (msg.updatedBy === this.authService.currentUser()?.email) return;
    this.title.set(msg.title);
    this.content.set(msg.content); // triggers TipTap effect() if editor is not focused
    this.saveStatus.set('saved');
    setTimeout(() => this.saveStatus.set('idle'), 2000);
  }
}

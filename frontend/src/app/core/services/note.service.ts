import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  NoteResponse, NoteSummaryResponse, CreateNoteRequest,
  UpdateNoteRequest, PagedResponse
} from '../models/note.models';

@Injectable({ providedIn: 'root' })
export class NoteService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/notes`;

  private _notes = signal<NoteSummaryResponse[]>([]);
  private _selectedNote = signal<NoteResponse | null>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _totalElements = signal(0);

  readonly notes = this._notes.asReadonly();
  readonly selectedNote = this._selectedNote.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly totalElements = this._totalElements.asReadonly();

  loadNotes(page = 0, size = 50, tagId?: string) {
    this._loading.set(true);
    let params = new HttpParams().set('page', page).set('size', size);
    if (tagId) params = params.set('tagId', tagId);

    return this.http.get<PagedResponse<NoteSummaryResponse>>(this.base, { params }).pipe(
      tap(res => {
        this._notes.set(res.content);
        this._totalElements.set(res.totalElements);
        this._loading.set(false);
      }),
      catchError(err => { this._loading.set(false); return throwError(() => err); })
    );
  }

  searchNotes(query: string, page = 0, size = 50) {
    this._loading.set(true);
    const params = new HttpParams().set('q', query).set('page', page).set('size', size);
    return this.http.get<PagedResponse<NoteSummaryResponse>>(`${this.base}/search`, { params }).pipe(
      tap(res => {
        this._notes.set(res.content);
        this._totalElements.set(res.totalElements);
        this._loading.set(false);
      }),
      catchError(err => { this._loading.set(false); return throwError(() => err); })
    );
  }

  loadNote(id: string) {
    return this.http.get<NoteResponse>(`${this.base}/${id}`).pipe(
      tap(note => this._selectedNote.set(note)),
      catchError(err => throwError(() => err))
    );
  }

  createNote(request: CreateNoteRequest) {
    return this.http.post<NoteResponse>(this.base, request).pipe(
      tap(note => {
        this._selectedNote.set(note);
        // Prepend to list
        const summary: NoteSummaryResponse = {
          id: note.id, title: note.title, excerpt: '',
          tags: note.tags, createdAt: note.createdAt, updatedAt: note.updatedAt
        };
        this._notes.update(notes => [summary, ...notes]);
      })
    );
  }

  updateNote(id: string, request: UpdateNoteRequest) {
    this._saving.set(true);
    return this.http.put<NoteResponse>(`${this.base}/${id}`, request).pipe(
      tap(note => {
        this._selectedNote.set(note);
        // Update summary in list
        this._notes.update(notes => notes.map(n =>
          n.id === id
            ? { ...n, title: note.title, tags: note.tags, updatedAt: note.updatedAt }
            : n
        ));
        this._saving.set(false);
      }),
      catchError(err => { this._saving.set(false); return throwError(() => err); })
    );
  }

  deleteNote(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap(() => {
        this._notes.update(notes => notes.filter(n => n.id !== id));
        if (this._selectedNote()?.id === id) this._selectedNote.set(null);
      })
    );
  }

  clearSelectedNote() {
    this._selectedNote.set(null);
  }
}

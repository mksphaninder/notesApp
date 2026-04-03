import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TagResponse, CreateTagRequest, UpdateTagRequest } from '../models/note.models';

@Injectable({ providedIn: 'root' })
export class TagService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/tags`;

  private _tags = signal<TagResponse[]>([]);
  readonly tags = this._tags.asReadonly();

  loadTags() {
    return this.http.get<TagResponse[]>(this.base).pipe(
      tap(tags => this._tags.set(tags))
    );
  }

  createTag(request: CreateTagRequest) {
    return this.http.post<TagResponse>(this.base, request).pipe(
      tap(tag => this._tags.update(tags => [...tags, tag].sort((a, b) => a.name.localeCompare(b.name))))
    );
  }

  updateTag(id: string, request: UpdateTagRequest) {
    return this.http.put<TagResponse>(`${this.base}/${id}`, request).pipe(
      tap(updated => this._tags.update(tags => tags.map(t => t.id === id ? updated : t)))
    );
  }

  deleteTag(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap(() => this._tags.update(tags => tags.filter(t => t.id !== id)))
    );
  }
}

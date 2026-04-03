export interface TagResponse {
  id: string;
  name: string;
  color: string;
}

export interface NoteSummaryResponse {
  id: string;
  title: string;
  excerpt: string;
  tags: TagResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteResponse {
  id: string;
  title: string;
  content: string; // ProseMirror JSON string
  tags: TagResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRequest {
  title: string;
  content?: string;
  tagIds?: string[];
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  tagIds?: string[];
}

export interface CreateTagRequest {
  name: string;
  color?: string;
}

export interface UpdateTagRequest {
  name?: string;
  color?: string;
}

export interface PagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

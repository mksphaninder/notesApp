export interface NoteUpdateMessage {
  noteId: string;
  title: string;
  content: string;
  updatedBy: string;
  updatedAt: number;
}

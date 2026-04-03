import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TagService } from '../../../core/services/tag.service';
import { TagResponse } from '../../../core/models/note.models';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#06b6d4', '#6b7280'
];

@Component({
  selector: 'app-tag-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tag-manager.component.html',
  styleUrl: './tag-manager.component.scss'
})
export class TagManagerComponent {
  tagService = inject(TagService);

  isOpen = signal(false);
  newTagName = signal('');
  newTagColor = signal(PRESET_COLORS[0]);
  error = signal<string | null>(null);
  presetColors = PRESET_COLORS;

  toggle() {
    this.isOpen.update(v => !v);
    if (!this.isOpen()) this.reset();
  }

  selectColor(color: string) {
    this.newTagColor.set(color);
  }

  createTag() {
    const name = this.newTagName().trim();
    if (!name) return;
    this.error.set(null);

    this.tagService.createTag({ name, color: this.newTagColor() }).subscribe({
      next: () => this.reset(),
      error: (err) => {
        if (err.status === 409) {
          this.error.set(`Tag "${name}" already exists`);
        } else {
          this.error.set('Failed to create tag');
        }
      }
    });
  }

  deleteTag(tag: TagResponse, event: Event) {
    event.stopPropagation();
    this.tagService.deleteTag(tag.id).subscribe();
  }

  private reset() {
    this.newTagName.set('');
    this.newTagColor.set(PRESET_COLORS[0]);
    this.error.set(null);
    this.isOpen.set(false);
  }
}

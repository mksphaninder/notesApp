import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TagManagerComponent } from './tag-manager.component';
import { TagService } from '../../../core/services/tag.service';
import { TagResponse } from '../../../core/models/note.models';

const makeTags = (): TagResponse[] => [
  { id: '1', name: 'Work',     color: '#6366f1' },
  { id: '2', name: 'Personal', color: '#10b981' },
];

function makeTagService(tags: TagResponse[] = makeTags()) {
  return {
    tags: signal(tags),
    createTag: vi.fn().mockReturnValue(of({ id: '3', name: 'New', color: '#6366f1' })),
    deleteTag: vi.fn().mockReturnValue(of(void 0)),
  };
}

describe('TagManagerComponent', () => {
  let component: TagManagerComponent;
  let fixture: ComponentFixture<TagManagerComponent>;
  let tagService: ReturnType<typeof makeTagService>;

  beforeEach(async () => {
    tagService = makeTagService();

    await TestBed.configureTestingModule({
      imports: [TagManagerComponent],
      providers: [{ provide: TagService, useValue: tagService }],
    }).compileComponents();

    fixture = TestBed.createComponent(TagManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initial state', () => {
    it('isOpen is false', () => {
      expect(component.isOpen()).toBe(false);
    });

    it('newTagName is empty', () => {
      expect(component.newTagName()).toBe('');
    });

    it('newTagColor defaults to first preset (#6366f1)', () => {
      expect(component.newTagColor()).toBe('#6366f1');
    });

    it('error is null', () => {
      expect(component.error()).toBeNull();
    });

    it('exposes 8 preset colors', () => {
      expect(component.presetColors.length).toBe(8);
    });
  });

  describe('toggle()', () => {
    it('opens the panel', () => {
      component.toggle();
      expect(component.isOpen()).toBe(true);
    });

    it('closes the panel and resets form state', () => {
      component.toggle(); // open
      component.newTagName.set('draft');
      component.toggle(); // close
      expect(component.isOpen()).toBe(false);
      expect(component.newTagName()).toBe('');
    });
  });

  describe('selectColor()', () => {
    it('updates the selected color', () => {
      component.selectColor('#ef4444');
      expect(component.newTagColor()).toBe('#ef4444');
    });
  });

  describe('createTag()', () => {
    it('calls tagService.createTag with trimmed name + color', () => {
      component.newTagName.set('Urgent');
      component.newTagColor.set('#ef4444');
      component.createTag();

      expect(tagService.createTag).toHaveBeenCalledWith({ name: 'Urgent', color: '#ef4444' });
    });

    it('trims whitespace from name before sending', () => {
      component.newTagName.set('  Urgent  ');
      component.createTag();
      expect(tagService.createTag).toHaveBeenCalledWith(expect.objectContaining({ name: 'Urgent' }));
    });

    it('does nothing when name is blank', () => {
      component.newTagName.set('   ');
      component.createTag();
      expect(tagService.createTag).not.toHaveBeenCalled();
    });

    it('resets form and closes panel on success', () => {
      component.toggle(); // open
      component.newTagName.set('Reset me');
      component.createTag();

      expect(component.newTagName()).toBe('');
      expect(component.error()).toBeNull();
      expect(component.isOpen()).toBe(false);
    });

    it('shows 409 error message on duplicate tag', () => {
      tagService.createTag.mockReturnValue(throwError(() => ({ status: 409 })));
      component.newTagName.set('Work');
      component.createTag();

      expect(component.error()).toBe('Tag "Work" already exists');
    });

    it('shows generic error message on other errors', () => {
      tagService.createTag.mockReturnValue(throwError(() => ({ status: 500 })));
      component.newTagName.set('Fail');
      component.createTag();

      expect(component.error()).toBe('Failed to create tag');
    });

    it('clears previous error before each attempt', () => {
      tagService.createTag.mockReturnValue(throwError(() => ({ status: 409 })));
      component.newTagName.set('Work');
      component.createTag();
      expect(component.error()).not.toBeNull();

      tagService.createTag.mockReturnValue(of({ id: '99', name: 'Work2', color: '#6366f1' }));
      component.newTagName.set('Work2');
      component.createTag();
      expect(component.error()).toBeNull();
    });
  });

  describe('deleteTag()', () => {
    it('calls tagService.deleteTag with the correct tag id', () => {
      const tag = makeTags()[0];
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      component.deleteTag(tag, event);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(tagService.deleteTag).toHaveBeenCalledWith('1');
    });

    it('stops event propagation to prevent parent click handlers', () => {
      const tag = makeTags()[1];
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      component.deleteTag(tag, event);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    });
  });

  describe('template rendering', () => {
    it('renders tag list immediately (visible regardless of isOpen)', () => {
      const el: HTMLElement = fixture.nativeElement;
      const items = el.querySelectorAll('.tag-item');
      expect(items.length).toBe(tagService.tags().length);
    });

    it('does not render form when closed', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.tag-form')).toBeNull();
    });

    it('renders form when open', () => {
      component.toggle();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.tag-form')).not.toBeNull();
    });

    it('renders 8 color swatches when form is open', () => {
      component.toggle();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const swatches = el.querySelectorAll('.color-swatch');
      expect(swatches.length).toBe(8);
    });

    it('displays error message when error is set (form open)', () => {
      component.toggle();
      component.error.set('Tag "Work" already exists');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Tag "Work" already exists');
    });
  });
});

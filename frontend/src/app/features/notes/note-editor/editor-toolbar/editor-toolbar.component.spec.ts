import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EditorToolbarComponent } from './editor-toolbar.component';

const makeChain = () => ({
  focus: vi.fn().mockReturnThis(),
  toggleBold: vi.fn().mockReturnThis(),
  toggleItalic: vi.fn().mockReturnThis(),
  toggleStrike: vi.fn().mockReturnThis(),
  toggleHeading: vi.fn().mockReturnThis(),
  toggleBulletList: vi.fn().mockReturnThis(),
  toggleOrderedList: vi.fn().mockReturnThis(),
  toggleCodeBlock: vi.fn().mockReturnThis(),
  toggleBlockquote: vi.fn().mockReturnThis(),
  setHorizontalRule: vi.fn().mockReturnThis(),
  run: vi.fn(),
});

function makeEditor(overrides: Record<string, any> = {}) {
  const chain = makeChain();
  return {
    chain: vi.fn().mockReturnValue(chain),
    isActive: vi.fn().mockReturnValue(false),
    getJSON: vi.fn().mockReturnValue({ type: 'doc', content: [] }),
    ...overrides,
    _chain: chain,
  };
}

describe('EditorToolbarComponent', () => {
  let component: EditorToolbarComponent;
  let fixture: ComponentFixture<EditorToolbarComponent>;
  let componentRef: ComponentRef<EditorToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorToolbarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorToolbarComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose 11 toolbar buttons', () => {
    expect(component.buttons.length).toBe(11);
  });

  it('should render 11 format buttons + 1 MD export button in the template', () => {
    const el: HTMLElement = fixture.nativeElement;
    const btns = el.querySelectorAll('button.toolbar__btn');
    expect(btns.length).toBe(12); // 11 format + 1 MD export
  });

  describe('button actions', () => {
    let editor: ReturnType<typeof makeEditor>;

    beforeEach(() => {
      editor = makeEditor();
      componentRef.setInput('editor', editor as any);
      fixture.detectChanges();
    });

    it('Bold button calls toggleBold', () => {
      const boldBtn = component.buttons.find(b => b.label === 'B')!;
      boldBtn.action();
      expect(editor._chain.toggleBold).toHaveBeenCalled();
      expect(editor._chain.run).toHaveBeenCalled();
    });

    it('Italic button calls toggleItalic', () => {
      const btn = component.buttons.find(b => b.label === 'I')!;
      btn.action();
      expect(editor._chain.toggleItalic).toHaveBeenCalled();
    });

    it('H1 button calls toggleHeading with level 1', () => {
      const btn = component.buttons.find(b => b.label === 'H1')!;
      btn.action();
      expect(editor._chain.toggleHeading).toHaveBeenCalledWith({ level: 1 });
    });

    it('H2 button calls toggleHeading with level 2', () => {
      const btn = component.buttons.find(b => b.label === 'H2')!;
      btn.action();
      expect(editor._chain.toggleHeading).toHaveBeenCalledWith({ level: 2 });
    });

    it('HR button calls setHorizontalRule', () => {
      const btn = component.buttons.find(b => b.label === '—')!;
      btn.action();
      expect(editor._chain.setHorizontalRule).toHaveBeenCalled();
    });

    it('HR isActive always returns false', () => {
      const btn = component.buttons.find(b => b.label === '—')!;
      expect(btn.isActive()).toBe(false);
    });

    it('Bold isActive reflects editor state', () => {
      const boldBtn = component.buttons.find(b => b.label === 'B')!;
      (editor.isActive as ReturnType<typeof vi.fn>).mockReturnValue(true);
      expect(boldBtn.isActive()).toBe(true);
    });
  });

  describe('when no editor is provided', () => {
    it('button actions are no-ops (no throw)', () => {
      expect(() => component.buttons[0].action()).not.toThrow();
    });

    it('isActive returns false', () => {
      expect(component.buttons[0].isActive()).toBe(false);
    });

    it('exportMarkdown returns empty string', () => {
      expect(component.exportMarkdown()).toBe('');
    });
  });

  describe('exportMarkdown', () => {
    it('serialises a simple paragraph', () => {
      const editor = makeEditor({
        getJSON: vi.fn().mockReturnValue({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }]
        })
      });
      componentRef.setInput('editor', editor as any);
      fixture.detectChanges();
      expect(component.exportMarkdown()).toContain('Hello world');
    });

    it('serialises bold text', () => {
      const editor = makeEditor({
        getJSON: vi.fn().mockReturnValue({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] }]
        })
      });
      componentRef.setInput('editor', editor as any);
      fixture.detectChanges();
      expect(component.exportMarkdown()).toContain('**bold**');
    });

    it('serialises h1', () => {
      const editor = makeEditor({
        getJSON: vi.fn().mockReturnValue({
          type: 'doc',
          content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] }]
        })
      });
      componentRef.setInput('editor', editor as any);
      fixture.detectChanges();
      expect(component.exportMarkdown()).toContain('# Title');
    });

    it('serialises bullet list', () => {
      const editor = makeEditor({
        getJSON: vi.fn().mockReturnValue({
          type: 'doc',
          content: [{
            type: 'bulletList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }]
          }]
        })
      });
      componentRef.setInput('editor', editor as any);
      fixture.detectChanges();
      expect(component.exportMarkdown()).toContain('- item');
    });

    it('serialises code block', () => {
      const editor = makeEditor({
        getJSON: vi.fn().mockReturnValue({
          type: 'doc',
          content: [{ type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const x = 1;' }] }]
        })
      });
      componentRef.setInput('editor', editor as any);
      fixture.detectChanges();
      const md = component.exportMarkdown();
      expect(md).toContain('```ts');
      expect(md).toContain('const x = 1;');
    });

    it('serialises horizontal rule', () => {
      const editor = makeEditor({
        getJSON: vi.fn().mockReturnValue({ type: 'doc', content: [{ type: 'horizontalRule' }] })
      });
      componentRef.setInput('editor', editor as any);
      fixture.detectChanges();
      expect(component.exportMarkdown()).toContain('---');
    });
  });

  describe('copyMarkdown', () => {
    it('calls navigator.clipboard.writeText', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

      const editor = makeEditor({
        getJSON: vi.fn().mockReturnValue({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'copy me' }] }]
        })
      });
      componentRef.setInput('editor', editor as any);
      fixture.detectChanges();

      component.copyMarkdown();
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('copy me'));
    });
  });
});

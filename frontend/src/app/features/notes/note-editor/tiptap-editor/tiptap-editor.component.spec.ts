import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TiptapEditorComponent } from './tiptap-editor.component';

// ── Shared state captured during Editor construction ─────────────────────────
const mockCommands = {
  setContent: vi.fn(),
  focus: vi.fn().mockReturnThis(),
};
const mockEditorInstance = {
  isFocused: false,
  commands: mockCommands,
  getJSON: vi.fn().mockReturnValue({ type: 'doc', content: [] }),
  destroy: vi.fn(),
};
let capturedOnUpdate: ((args: { editor: any }) => void) | null = null;
let capturedOptions: any = null;

vi.mock('@tiptap/core', () => ({
  // Must be a class / function so Angular can call `new Editor(...)`
  Editor: vi.fn(function (this: any, opts: any) {
    capturedOnUpdate = opts?.onUpdate ?? null;
    capturedOptions  = opts ?? null;
    Object.assign(this, mockEditorInstance);
    this.destroy = mockEditorInstance.destroy;
  }),
}));
vi.mock('@tiptap/starter-kit', () => ({ default: {} }));
vi.mock('@tiptap/extension-typography', () => ({ default: {} }));
vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));

describe('TiptapEditorComponent', () => {
  let component: TiptapEditorComponent;
  let fixture: ComponentFixture<TiptapEditorComponent>;
  let componentRef: ComponentRef<TiptapEditorComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedOnUpdate = null;
    capturedOptions  = null;
    mockEditorInstance.isFocused = false;

    await TestBed.configureTestingModule({
      imports: [TiptapEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TiptapEditorComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should initialise Editor in ngAfterViewInit', async () => {
    fixture.detectChanges();
    const { Editor } = await import('@tiptap/core');
    expect(Editor).toHaveBeenCalledTimes(1);
  });

  it('should parse initial contentValue as JSON', () => {
    const content = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
    componentRef.setInput('contentValue', content);
    fixture.detectChanges();
    expect(capturedOptions?.content).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('should fallback to empty doc when contentValue is invalid JSON', () => {
    componentRef.setInput('contentValue', 'not-json');
    fixture.detectChanges();
    expect(capturedOptions?.content).toEqual({ type: 'doc', content: [] });
  });

  it('should emit contentChange on editor update', () => {
    fixture.detectChanges();
    mockEditorInstance.getJSON.mockReturnValue({ type: 'doc', content: [{ type: 'paragraph' }] });
    const emitted: string[] = [];
    component.contentChange.subscribe((v: string) => emitted.push(v));

    capturedOnUpdate?.({ editor: mockEditorInstance });

    expect(emitted.length).toBe(1);
    expect(JSON.parse(emitted[0])).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('should NOT emit contentChange during external update', () => {
    fixture.detectChanges();
    const emitted: string[] = [];
    component.contentChange.subscribe((v: string) => emitted.push(v));

    (component as any).isExternalUpdate = true;
    capturedOnUpdate?.({ editor: mockEditorInstance });

    expect(emitted.length).toBe(0);
  });

  it('should call setContent when contentValue changes and editor is not focused', () => {
    fixture.detectChanges();
    mockEditorInstance.isFocused = false;
    mockCommands.setContent.mockClear();

    const newContent = JSON.stringify({ type: 'doc', content: [{ type: 'heading' }] });
    componentRef.setInput('contentValue', newContent);
    fixture.detectChanges();

    expect(mockCommands.setContent).toHaveBeenCalledWith(
      { type: 'doc', content: [{ type: 'heading' }] },
      { emitUpdate: false }
    );
  });

  it('should NOT call setContent when editor is focused (user is typing)', () => {
    fixture.detectChanges();
    mockEditorInstance.isFocused = true;
    mockCommands.setContent.mockClear();

    componentRef.setInput('contentValue', JSON.stringify({ type: 'doc', content: [] }));
    fixture.detectChanges();

    expect(mockCommands.setContent).not.toHaveBeenCalled();
  });

  it('should destroy editor on ngOnDestroy', () => {
    fixture.detectChanges();
    fixture.destroy();
    expect(mockEditorInstance.destroy).toHaveBeenCalled();
  });
});

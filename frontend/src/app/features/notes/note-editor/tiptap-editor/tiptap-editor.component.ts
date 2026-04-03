import {
  Component, ElementRef, ViewChild, AfterViewInit, OnDestroy,
  input, output, effect, ViewEncapsulation
} from '@angular/core';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';

@Component({
  selector: 'app-tiptap-editor',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<div #editorEl class="tiptap-host"></div>`,
  styleUrl: './tiptap-editor.component.scss'
})
export class TiptapEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorEl') editorEl!: ElementRef<HTMLDivElement>;

  contentValue = input<string>('{"type":"doc","content":[]}');
  contentChange = output<string>();

  editor?: Editor;
  private isExternalUpdate = false;

  constructor() {
    // React to content changes when switching notes
    effect(() => {
      const raw = this.contentValue();
      if (this.editor && !this.editor.isFocused) {
        this.isExternalUpdate = true;
        try {
          const parsed = JSON.parse(raw || '{"type":"doc","content":[]}');
          this.editor.commands.setContent(parsed, false);
        } catch {
          this.editor.commands.setContent(raw, false);
        } finally {
          this.isExternalUpdate = false;
        }
      }
    });
  }

  ngAfterViewInit() {
    let initialContent: any;
    try {
      initialContent = JSON.parse(this.contentValue() || '{"type":"doc","content":[]}');
    } catch {
      initialContent = { type: 'doc', content: [] };
    }

    this.editor = new Editor({
      element: this.editorEl.nativeElement,
      extensions: [
        StarterKit,
        Typography,
        Placeholder.configure({ placeholder: 'Start writing… (supports **bold**, *italic*, # headings, - lists)' })
      ],
      content: initialContent,
      onUpdate: ({ editor }) => {
        if (!this.isExternalUpdate) {
          this.contentChange.emit(JSON.stringify(editor.getJSON()));
        }
      }
    });
  }

  ngOnDestroy() {
    this.editor?.destroy();
  }
}

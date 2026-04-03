import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor } from '@tiptap/core';

interface ToolbarButton {
  label: string;
  action: () => void;
  isActive: () => boolean;
  title: string;
}

@Component({
  selector: 'app-editor-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './editor-toolbar.component.html',
  styleUrl: './editor-toolbar.component.scss'
})
export class EditorToolbarComponent {
  editor = input<Editor | undefined>(undefined);

  get e() { return this.editor(); }

  buttons: ToolbarButton[] = [
    { label: 'B',  title: 'Bold (Ctrl+B)',       action: () => this.e?.chain().focus().toggleBold().run(),      isActive: () => !!this.e?.isActive('bold') },
    { label: 'I',  title: 'Italic (Ctrl+I)',      action: () => this.e?.chain().focus().toggleItalic().run(),    isActive: () => !!this.e?.isActive('italic') },
    { label: 'S',  title: 'Strikethrough',        action: () => this.e?.chain().focus().toggleStrike().run(),    isActive: () => !!this.e?.isActive('strike') },
    { label: 'H1', title: 'Heading 1',            action: () => this.e?.chain().focus().toggleHeading({ level: 1 }).run(), isActive: () => !!this.e?.isActive('heading', { level: 1 }) },
    { label: 'H2', title: 'Heading 2',            action: () => this.e?.chain().focus().toggleHeading({ level: 2 }).run(), isActive: () => !!this.e?.isActive('heading', { level: 2 }) },
    { label: 'H3', title: 'Heading 3',            action: () => this.e?.chain().focus().toggleHeading({ level: 3 }).run(), isActive: () => !!this.e?.isActive('heading', { level: 3 }) },
    { label: '•',  title: 'Bullet list',          action: () => this.e?.chain().focus().toggleBulletList().run(),  isActive: () => !!this.e?.isActive('bulletList') },
    { label: '1.', title: 'Ordered list',         action: () => this.e?.chain().focus().toggleOrderedList().run(),isActive: () => !!this.e?.isActive('orderedList') },
    { label: '<>', title: 'Code block',           action: () => this.e?.chain().focus().toggleCodeBlock().run(),  isActive: () => !!this.e?.isActive('codeBlock') },
    { label: '❝',  title: 'Blockquote',           action: () => this.e?.chain().focus().toggleBlockquote().run(), isActive: () => !!this.e?.isActive('blockquote') },
    { label: '—',  title: 'Divider',              action: () => this.e?.chain().focus().setHorizontalRule().run(), isActive: () => false },
  ];

  exportMarkdown(): string {
    const json = this.e?.getJSON();
    if (!json) return '';
    return prosemirrorToMarkdown(json);
  }

  copyMarkdown() {
    const md = this.exportMarkdown();
    navigator.clipboard.writeText(md).catch(() => {});
  }
}

// Simple ProseMirror JSON → Markdown serializer
function prosemirrorToMarkdown(node: any, depth = 0): string {
  if (!node) return '';
  switch (node.type) {
    case 'doc':
      return (node.content || []).map((n: any) => prosemirrorToMarkdown(n)).join('\n');
    case 'paragraph':
      return inlineToMd(node.content) + '\n';
    case 'heading':
      return '#'.repeat(node.attrs?.level ?? 1) + ' ' + inlineToMd(node.content) + '\n';
    case 'bulletList':
      return (node.content || []).map((item: any) =>
        '- ' + (item.content || []).map((n: any) => prosemirrorToMarkdown(n)).join('').trim()
      ).join('\n') + '\n';
    case 'orderedList':
      return (node.content || []).map((item: any, i: number) =>
        `${i + 1}. ` + (item.content || []).map((n: any) => prosemirrorToMarkdown(n)).join('').trim()
      ).join('\n') + '\n';
    case 'blockquote':
      return (node.content || []).map((n: any) =>
        '> ' + prosemirrorToMarkdown(n).trim()
      ).join('\n') + '\n';
    case 'codeBlock':
      return '```' + (node.attrs?.language ?? '') + '\n' +
        (node.content || []).map((n: any) => n.text ?? '').join('') + '\n```\n';
    case 'horizontalRule':
      return '---\n';
    default:
      return (node.content || []).map((n: any) => prosemirrorToMarkdown(n)).join('');
  }
}

function inlineToMd(nodes: any[] = []): string {
  return nodes.map(node => {
    if (node.type === 'text') {
      let text = node.text ?? '';
      const marks: string[] = (node.marks || []).map((m: any) => m.type);
      if (marks.includes('bold'))   text = `**${text}**`;
      if (marks.includes('italic')) text = `*${text}*`;
      if (marks.includes('strike')) text = `~~${text}~~`;
      if (marks.includes('code'))   text = `\`${text}\``;
      return text;
    }
    return '';
  }).join('');
}

import { marked } from 'marked';
type Token = any;

type Mark = { type: string; attrs?: Record<string, unknown> };
type TiptapNode = { type: string; text?: string; marks?: Mark[]; attrs?: Record<string, unknown>; content?: TiptapNode[] };

function mergeMarks(existing: Mark[], incoming: Mark[]): Mark[] {
  const result = [...existing];
  for (const mark of incoming) {
    if (!result.some((m) => m.type === mark.type)) {
      result.push(mark);
    }
  }
  return result;
}

function applyMarks(nodes: TiptapNode[], marks: Mark[]): TiptapNode[] {
  if (marks.length === 0) return nodes;
  return nodes.map((node) => {
    if (node.type === 'text') {
      const merged = mergeMarks(node.marks ?? [], marks);
      return merged.length > 0 ? { ...node, marks: merged } : node;
    }
    return node;
  });
}

function inlineTokensToNodes(tokens: Token[], inheritedMarks: Mark[] = []): TiptapNode[] {
  const nodes: TiptapNode[] = [];

  for (const token of tokens) {
    if (token.type === 'checkbox') {
      continue;
    } else if (token.type === 'text') {
      const t = token as any;
      if (t.tokens && t.tokens.length > 0) {
        nodes.push(...inlineTokensToNodes(t.tokens, inheritedMarks));
      } else if (t.text) {
        const node: TiptapNode = { type: 'text', text: t.text };
        if (inheritedMarks.length > 0) node.marks = [...inheritedMarks];
        nodes.push(node);
      }
    } else if (token.type === 'strong') {
      const t = token as any;
      const marks = mergeMarks(inheritedMarks, [{ type: 'bold' }]);
      nodes.push(...inlineTokensToNodes(t.tokens, marks));
    } else if (token.type === 'em') {
      const t = token as any;
      const marks = mergeMarks(inheritedMarks, [{ type: 'italic' }]);
      nodes.push(...inlineTokensToNodes(t.tokens, marks));
    } else if (token.type === 'del') {
      const t = token as any;
      const marks = mergeMarks(inheritedMarks, [{ type: 'strike' }]);
      nodes.push(...inlineTokensToNodes(t.tokens, marks));
    } else if (token.type === 'codespan') {
      const t = token as any;
      const marks = mergeMarks(inheritedMarks, [{ type: 'code' }]);
      nodes.push({ type: 'text', text: t.text, marks });
    } else if (token.type === 'link') {
      const t = token as any;
      const linkMark: Mark = { type: 'link', attrs: { href: t.href, target: '_blank' } };
      const marks = mergeMarks(inheritedMarks, [linkMark]);
      nodes.push(...applyMarks(inlineTokensToNodes(t.tokens, []), marks));
    } else if (token.type === 'image') {
      const t = token as any;
      nodes.push({ type: 'image', attrs: { src: t.href, alt: t.text } });
    } else if (token.type === 'br') {
      nodes.push({ type: 'hardBreak' });
    } else if (token.type === 'escape') {
      const t = token as any;
      const node: TiptapNode = { type: 'text', text: t.text };
      if (inheritedMarks.length > 0) node.marks = [...inheritedMarks];
      nodes.push(node);
    }
  }

  return nodes.filter((n) => n.type !== 'text' || (n.text !== undefined && n.text !== ''));
}

function ensureContent(nodes: TiptapNode[]): TiptapNode[] {
  if (nodes.length === 0) return [{ type: 'text', text: '' }];
  return nodes;
}

function blockTokenToNodes(token: Token): TiptapNode[] {
  if (token.type === 'space') {
    return [];
  }

  if (token.type === 'heading') {
    const t = token as any;
    const content = ensureContent(inlineTokensToNodes(t.tokens));
    return [{ type: 'heading', attrs: { level: t.depth }, content }];
  }

  if (token.type === 'paragraph') {
    const t = token as any;
    const content = ensureContent(inlineTokensToNodes(t.tokens));
    return [{ type: 'paragraph', content }];
  }

  if (token.type === 'blockquote') {
    const t = token as any;
    const inner = t.tokens.flatMap(blockTokenToNodes);
    const content = inner.length > 0 ? inner : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }];
    return [{ type: 'blockquote', content }];
  }

  if (token.type === 'code') {
    const t = token as any;
    return [{ type: 'codeBlock', attrs: { language: t.lang ?? '' }, content: [{ type: 'text', text: t.text }] }];
  }

  if (token.type === 'hr') {
    return [{ type: 'horizontalRule' }];
  }

  if (token.type === 'list') {
    const t = token as any;
    const isTask = t.items.length > 0 && t.items[0].task === true;

    if (isTask) {
      const items: TiptapNode[] = t.items.map((item: any) => {
        const checked = item.checked ?? false;
        const innerTokens = item.tokens.filter((tk: any) => tk.type !== 'checkbox');
        const innerNodes = innerTokens.flatMap(blockTokenToNodes);
        const content = innerNodes.length > 0 ? innerNodes : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }];
        return { type: 'taskItem', attrs: { checked }, content };
      });
      return [{ type: 'taskList', content: items }];
    }

    const listType = t.ordered ? 'orderedList' : 'bulletList';
    const items: TiptapNode[] = t.items.map((item: any) => {
      const innerNodes = item.tokens.flatMap(blockTokenToNodes);
      const content = innerNodes.length > 0 ? innerNodes : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }];
      return { type: 'listItem', content };
    });

    const listNode: TiptapNode = { type: listType, content: items };
    if (t.ordered && typeof t.start === 'number' && t.start !== 1) {
      listNode.attrs = { start: t.start };
    }
    return [listNode];
  }

  if (token.type === 'table') {
    const t = token as any;

    const headerRow: TiptapNode = {
      type: 'tableRow',
      content: t.header.map((cell: any) => ({
        type: 'tableHeader',
        content: ensureContent(inlineTokensToNodes(cell.tokens)),
      })),
    };

    const bodyRows: TiptapNode[] = t.rows.map((row: any) => ({
      type: 'tableRow',
      content: row.map((cell: any) => ({
        type: 'tableCell',
        content: ensureContent(inlineTokensToNodes(cell.tokens)),
      })),
    }));

    return [{ type: 'table', content: [headerRow, ...bodyRows] }];
  }

  return [];
}

export function mdToTiptap(markdown: string): { type: 'doc'; content: any[] } {
  const tokens = marked.lexer(markdown);
  const content = tokens.flatMap(blockTokenToNodes);
  return { type: 'doc', content };
}

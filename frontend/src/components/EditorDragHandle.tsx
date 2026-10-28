import { useCallback, useRef } from "react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { GripVertical, Plus } from "lucide-react";

export interface HoveredBlock {
  node: ProseMirrorNode;
  pos: number;
}

export function EditorDragHandle({ editor, onBlockDragStart }: { editor: Editor; onBlockDragStart?: (block: HoveredBlock | null) => void }) {
  const hoveredRef = useRef<HoveredBlock | null>(null);

  const referencedVirtualElement = useCallback(() => {
    const block = hoveredRef.current;
    if (!block) return null;
    const editorRect = editor.view.dom.getBoundingClientRect();
    let coords: { top: number; bottom: number };
    try {
      coords = editor.view.coordsAtPos(block.pos);
    } catch {
      return null;
    }
    // Anchor the combined gutter to the editor's left edge, not to the
    // hovered block's indentation. Floating UI offsets it by the control
    // width, so the plus and grip share one exact x line.
    return {
      getBoundingClientRect: () => new DOMRect(editorRect.left, coords.top, 0, Math.max(1, coords.bottom - coords.top)),
    };
  }, [editor]);

  const insertParagraphAfter = () => {
    const block = hoveredRef.current;
    if (!block || !editor.isEditable) return;
    const insertAt = block.pos + block.node.nodeSize;
    editor
      .chain()
      .focus()
      .insertContentAt(insertAt, { type: "paragraph" })
      .setTextSelection(insertAt + 1)
      .run();
  };

  return (
    <DragHandle
      editor={editor}
      nested
      className="editor-drag-handle"
      getReferencedVirtualElement={referencedVirtualElement}
      onNodeChange={({ node, pos }) => {
        hoveredRef.current = node ? { node, pos } : null;
      }}
    >
      <button
        type="button"
        className="editor-block-add"
        aria-label="在此块后插入段落"
        title="在此块后插入段落"
        draggable={false}
        onMouseDown={(event) => event.preventDefault()}
        onDragStart={(event) => event.stopPropagation()}
        onClick={insertParagraphAfter}
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        className="editor-drag-grip"
        aria-label="拖动重排此块"
        title="拖动重排此块；拖到另一块左右边缘可生成两栏"
        onMouseDown={() => onBlockDragStart?.(hoveredRef.current)}
        onDragStart={() => onBlockDragStart?.(hoveredRef.current)}
      >
        <GripVertical size={16} />
      </button>
    </DragHandle>
  );
}

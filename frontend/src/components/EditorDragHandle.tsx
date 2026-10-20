import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";
import { GripVertical } from "lucide-react";

export function EditorDragHandle({ editor }: { editor: Editor }) {
  return (
    <DragHandle editor={editor} nested className="editor-drag-handle">
      <button type="button" className="editor-drag-grip" aria-label="拖动重排此块" title="拖动重排此块">
        <GripVertical size={14} />
      </button>
    </DragHandle>
  );
}

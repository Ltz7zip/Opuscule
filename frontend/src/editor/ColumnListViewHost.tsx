import { Suspense, lazy } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

const LazyColumnListView = lazy(() =>
  import("./ColumnListView").then((module) => ({ default: module.ColumnListView })),
);

function ColumnFallback({ node }: NodeViewProps) {
  const count = Math.min(4, Math.max(2, Number(node.attrs.layout) || node.content.childCount || 2));
  return (
    <NodeViewWrapper
      className={`tiptap-columns cols-${count}`}
      data-columns={count}
      data-preset={node.attrs.preset ?? "equal"}
    >
      <NodeViewContent className="tiptap-columns-content" />
    </NodeViewWrapper>
  );
}

export function ColumnListViewHost(props: NodeViewProps) {
  return (
    <Suspense fallback={<ColumnFallback {...props} />}>
      <LazyColumnListView {...props} />
    </Suspense>
  );
}

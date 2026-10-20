import { lazy, Suspense } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

const GalleryView = lazy(() => import("./GalleryView").then((module) => ({ default: module.GalleryView })));

export function GalleryHost(props: NodeViewProps) {
  return (
    <NodeViewWrapper className="tiptap-gallery-wrap" contentEditable={false}>
      <Suspense fallback={<div className="gallery-loading">图片画廊加载中…</div>}>
        <GalleryView {...props} />
      </Suspense>
    </NodeViewWrapper>
  );
}

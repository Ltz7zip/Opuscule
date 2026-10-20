import type { NodeViewProps } from "@tiptap/react";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { promptAction } from "../lib/dialogs";

type Image = { src: string; alt?: string };

export function GalleryView({ node, updateAttributes, editor }: NodeViewProps) {
  const images: Image[] = Array.isArray(node.attrs.images) ? node.attrs.images : [];

  const setImages = (next: Image[]) => updateAttributes({ images: next });

  const move = (index: number, delta: number) => {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
  };

  const remove = (index: number) => setImages(images.filter((_, i) => i !== index));

  const add = async () => {
    const value = await promptAction({
      title: "添加图片",
      label: "图片地址",
      placeholder: "https://… 或 /media/…",
      confirmLabel: "添加",
    });
    if (!value) return;
    setImages([...images, { src: value, alt: "" }]);
  };

  return (
    <>
      <div className="tiptap-gallery">
        {images.map((image, index) => (
          <figure key={`${image.src}-${index}`}>
            <img src={image.src} alt={image.alt ?? ""} />
            <div className="gallery-controls">
              <button type="button" aria-label="前移图片" onClick={() => move(index, -1)} disabled={index === 0}><ArrowLeft size={11} /></button>
              <button type="button" aria-label="后移图片" onClick={() => move(index, 1)} disabled={index === images.length - 1}><ArrowRight size={11} /></button>
              <button type="button" aria-label="删除图片" onClick={() => remove(index)}><Trash2 size={11} /></button>
            </div>
          </figure>
        ))}
        <button type="button" className="gallery-add" onClick={add}><Plus size={13} /> 添加图片</button>
      </div>
      <small className="gallery-hint">拖动画布水平浏览；使用图片上的按钮排序/删除。{editor.isEditable ? "" : " 只读。"}</small>
    </>
  );
}

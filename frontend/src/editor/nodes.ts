import { Mark, mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { GalleryHost } from "./GalleryHost";

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      tone: { default: "note" },
    };
  },
  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { "data-callout": "", class: "tiptap-callout" }), 0];
  },
});

export const ImageBlock = Node.create({
  name: "imageBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      caption: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "figure[data-image-block]",
        getAttrs: (element) => {
          const image = (element as HTMLElement).querySelector("img");
          const caption = (element as HTMLElement).querySelector("figcaption");
          return {
            src: image?.getAttribute("src") ?? "",
            alt: image?.getAttribute("alt") ?? "",
            caption: caption?.textContent ?? "",
          };
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "figure",
      { "data-image-block": "", class: "tiptap-image" },
      ["img", { src: node.attrs.src, alt: node.attrs.alt }],
      ["figcaption", {}, node.attrs.caption || ""],
    ];
  },
});

export const BookmarkBlock = Node.create({
  name: "bookmarkBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      url: { default: "" },
      title: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-bookmark-block]" }];
  },
  renderHTML({ node }) {
    return [
      "a",
      {
        "data-bookmark-block": "",
        class: "tiptap-bookmark",
        href: node.attrs.url,
        target: "_blank",
        rel: "noreferrer",
      },
      ["strong", {}, node.attrs.title || node.attrs.url],
      ["small", {}, node.attrs.url],
    ];
  },
});

export const CardEmbed = Node.create({
  name: "cardEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      cardId: { default: null },
      title: { default: "" },
      slug: { default: "" },
      worldSlug: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-card-embed]" }];
  },
  renderHTML({ node }) {
    return [
      "a",
      {
        "data-card-embed": "",
        class: "tiptap-card-embed",
        href: `/w/${node.attrs.worldSlug}/wiki/${node.attrs.slug}`,
      },
      ["small", {}, "嵌入卡片"],
      ["strong", {}, node.attrs.title],
    ];
  },
});

export const NestedBlock = Node.create({
  name: "nestedBlock",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML() {
    return [{ tag: "div[data-nested-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-nested-block": "", class: "tiptap-nested" }), 0];
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive("listItem")) return false;
        return this.editor.commands.wrapIn("nestedBlock");
      },
      "Shift-Tab": () => {
        if (this.editor.isActive("listItem")) return false;
        return this.editor.commands.lift("nestedBlock");
      },
    };
  },
});

export const ToggleBlock = Node.create({
  name: "toggleBlock",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      title: { default: "折叠块" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "details[data-toggle-block]",
        getAttrs: (element) => ({
          title: (element as HTMLElement).querySelector("summary")?.textContent ?? "折叠块",
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "details",
      { "data-toggle-block": "", class: "tiptap-toggle", open: "" },
      ["summary", {}, node.attrs.title],
      ["div", { class: "tiptap-toggle-body" }, 0],
    ];
  },
});

export const GalleryBlock = Node.create({
  name: "galleryBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      images: {
        default: [],
        parseHTML: (element) => {
          try { return JSON.parse(element.getAttribute("data-images") || "[]"); } catch { return []; }
        },
        renderHTML: (attributes) => ({ "data-images": JSON.stringify(attributes.images ?? []) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-gallery-block]" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(GalleryHost);
  },
  renderHTML({ node }) {
    const images = Array.isArray(node.attrs.images) ? node.attrs.images : [];
    return [
      "div",
      { "data-gallery-block": "", class: "tiptap-gallery" },
      ...images.map((image: { src: string; alt?: string }) => [
        "figure",
        {},
        ["img", { src: image.src, alt: image.alt ?? "" }],
      ]),
    ];
  },
});

export const CommentAnchor = Mark.create({
  name: "commentAnchor",
  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-anchor"),
        renderHTML: (attributes) => ({
          "data-comment-anchor": attributes.commentId,
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-anchor]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "tiptap-comment-anchor" }), 0];
  },
});

import { useEffect } from "react";

interface MetaOptions {
  title: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
  type?: "website" | "article" | "profile";
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
}

export function useDocumentMeta({
  title,
  description,
  canonicalPath,
  noindex = false,
  type = "website",
}: MetaOptions) {
  useEffect(() => {
    document.title = title;
    const path = canonicalPath ?? window.location.pathname;
    const canonical = new URL(path, window.location.origin).toString();
    const text = description ?? "Opuscule：把世界、人物与故事收进一本小而完整的私人百科。";

    setMeta("name", "description", text);
    setMeta("name", "robots", noindex ? "noindex,nofollow" : "index,follow");
    setCanonical(canonical);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", text);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", canonical);
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", text);
  }, [canonicalPath, description, noindex, title, type]);
}

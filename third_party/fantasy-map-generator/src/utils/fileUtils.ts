// Reading and writing local files, plus naming downloads and exports.

/** Build a filename from the map name, optional type and current time */
export function getFileName(dataType?: string): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  const date = new Date();
  const dateString = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join("-");

  const type = dataType ? `${dataType} ` : "";
  return `${options.map.lore.name} ${type}${dateString}`;
}

/** Download data as a file */
export function downloadFile(data: BlobPart, name: string, type = "text/plain"): void {
  const url = window.URL.createObjectURL(new Blob([data], { type }));

  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  link.click();

  window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
}

const UNSAFE_ELEMENTS = new Set(["script", "foreignobject", "iframe", "object", "embed"]);
const EXTERNAL_URL = /url\((?!\s*['"]?\s*(#|data:))[^)]*\)/gi; // a CSS url() that fetches from outside the file

/** Parse an uploaded svg inertly and strip scripting, external references, editor metadata and Noun Project credits; null if the markup has no svg */
export function sanitizeSvgIcon(svgText: string): SVGElement | null {
  const parsed = new DOMParser().parseFromString(svgText, "text/html").querySelector("svg");
  if (!parsed) return null;

  for (const element of Array.from(parsed.querySelectorAll("*"))) {
    if (UNSAFE_ELEMENTS.has(element.localName.toLowerCase())) element.remove();
  }

  for (const element of [parsed, ...Array.from(parsed.querySelectorAll("*"))]) {
    for (const attr of element.getAttributeNames()) {
      const value = element.getAttribute(attr) ?? "";
      const isHref = attr === "href" || attr.endsWith(":href");
      if (
        attr.includes("inkscape") ||
        attr.includes("sodipodi") ||
        attr.toLowerCase().startsWith("on") ||
        /javascript:/i.test(value.replace(/[\s\p{Cc}]/gu, "")) ||
        (isHref && !/^\s*(#|data:image\/)/i.test(value))
      )
        element.removeAttribute(attr);
      else if (value.includes("url(")) element.setAttribute(attr, value.replace(EXTERNAL_URL, "none"));
    }
  }

  for (const style of Array.from(parsed.querySelectorAll("style"))) {
    style.textContent = (style.textContent ?? "").replace(/@import[^;]*;?/gi, "").replace(EXTERNAL_URL, "none");
  }

  if (svgText.includes("from the Noun Project")) {
    parsed.querySelectorAll("text").forEach(text => void text.remove());
  }

  return document.importNode(parsed, true);
}

/** Prefix the ids and classes an uploaded svg declares and confine its stylesheets to its root, marked by the
 * `prefix` class, so it neither collides with the document nor styles it */
export function scopeSvgIcon(svg: Element, prefix: string): void {
  const descendants = Array.from(svg.querySelectorAll("*"));
  const ids = new Set([svg, ...descendants].map(element => element.id).filter(Boolean));
  const classes = new Set([svg, ...descendants].flatMap(element => Array.from(element.classList)));
  const scoped = (name: string) => `${prefix}-${name}`;
  const pattern = (sigil: string, names: Set<string>) =>
    new RegExp(
      `${sigil}(${[...names].map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-])`,
      "g"
    );
  const idRef = ids.size ? pattern("#", ids) : null;
  const classRef = classes.size ? pattern("\\.", classes) : null;
  const urls = (value: string) =>
    value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/gi, (match, _quote, id) =>
      ids.has(id) ? match.replace(`#${id}`, `#${scoped(id)}`) : match
    );
  const selector = (value: string) => {
    if (idRef) value = value.replace(idRef, (_, id) => `#${scoped(id)}`);
    if (classRef) value = value.replace(classRef, (_, name) => `.${scoped(name)}`);
    return value.replace(/(^|[\s>+~,(])svg(?=[.#:[\s>+~),]|$)/gi, `$1:is(svg, .${prefix})`);
  };

  for (const element of [svg, ...descendants]) {
    if (element.id) element.id = scoped(element.id);
    if (element.classList.length) element.setAttribute("class", Array.from(element.classList, scoped).join(" "));
    for (const attr of Array.from(element.attributes)) {
      const id = attr.value.trim().slice(1);
      const isHref = attr.name === "href" || attr.name.endsWith(":href");
      attr.value = isHref && attr.value.trim().startsWith("#") && ids.has(id) ? `#${scoped(id)}` : urls(attr.value);
    }
    if (element.localName === "style" && element.textContent) {
      element.textContent = scopeCss(urls(element.textContent), `.${prefix}`, selector);
    }
  }
  svg.classList.add(prefix);
}

/** Confine a stylesheet's rules to `scope` and its descendants; at-rules other than @media and @supports are dropped */
function scopeCss(css: string, scope: string, selector: (value: string) => string): string {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const confine = (group: CSSStyleSheet | CSSGroupingRule) => {
    for (let index = group.cssRules.length - 1; index >= 0; index--) {
      const rule = group.cssRules[index];
      if (rule instanceof CSSStyleRule)
        rule.selectorText = `:is(${scope}, ${scope} *):is(${selector(rule.selectorText)})`;
      else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) confine(rule);
      else group.deleteRule(index);
    }
  };
  confine(sheet);
  return Array.from(sheet.cssRules, rule => rule.cssText).join("");
}

/** UTF-8 safe base64 data URI */
export function svgToDataUri(svgText: string): string {
  const bytes = new TextEncoder().encode(svgText);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** Whether an icon value is an image URL rather than an emoji or text glyph */
export function isImageIcon(icon: string): boolean {
  return /^(https?:\/\/|data:image\/)/.test(icon);
}

/** 运行时才拼出来的相对路径：宿主页面跑在 /map/2d，相对地址会被解析成 /map/libs/…，
 *  而真正的文件在 /static/map/vendor/libs/…。构建期注入 __OPUSCULE_ASSET_BASE__ 给出前缀。
 *  绝对地址（http://、//、/、data:）与 SVG 内部引用（#id）原样返回。 */
export function resolveRuntimeAsset(src: string): string {
  const base = (globalThis as { __OPUSCULE_ASSET_BASE__?: string }).__OPUSCULE_ASSET_BASE__;
  if (!base || /^[a-z][a-z0-9+.-]*:|^\/\/|^\/|^#/i.test(src)) return src;
  // 存的是 `./images/x.png` 这种写法：补前缀时顺手把开头那段 `./` 去掉，
  // 否则会拼出 /static/map/vendor/./images/x.png —— 浏览器会归一化，但看着不干净
  return base + src.replace(/^\.\//, "");
}

/** 样式里存着资源路径（海洋图案是 `./images/pattern1.png`、纹理是同形的相对路径）。
 *  写入 DOM 属性时必须先补上静态目录前缀，否则浏览器按页面地址（宿主是 /map/2d）
 *  解析成 /map/images/… → 404。`#id` 这种 SVG 内部引用与绝对地址不动。
 *  凡是"把样式属性值直接写进 DOM"的地方都要走这个函数 —— 见 generators/styles.ts
 *  的 writeNode，以及 renderers/draw-ocean.ts（它自己造元素，不经过 writeNode）。 */
const ASSET_ATTRS = new Set(["href", "xlink:href", "data-href"]);
export function resolveAssetAttribute(name: string, value: unknown): string {
  const text = String(value);
  return ASSET_ATTRS.has(name) ? resolveRuntimeAsset(text) : text;
}

/** 把一段标记里资源类属性的取值补上静态目录前缀。
 *  存下来的地图 SVG（`.map` 的第 6 段）是**直接 `insertAdjacentHTML` 进 DOM** 的
 *  （services/io/load.ts）：浏览器在解析那一刻就会按页面地址去取里面的
 *  `./images/pattern1.png` —— 宿主跑在 /map/2d，于是成了 /map/images/… → 404，
 *  要等渲染器把同一属性改成正确路径才补上第二次请求。所以**插入之前**先归一化，
 *  别让浏览器有机会去解析那些相对地址。
 *  绝对地址（http://、//、/、data:）与 `#id` 内部引用由 resolveRuntimeAsset 原样保留。 */
export function resolveAssetAttributesInMarkup(markup: string): string {
  return markup.replace(/\s(href|xlink:href|data-href)=(["'])([^"']*)\2/g, (match, name, quote, value) => {
    const resolved = resolveRuntimeAsset(value);
    return resolved === value ? match : ` ${name}=${quote}${resolved}${quote}`;
  });
}

/** Load a classic library bundle that registers a runtime global (e.g. window.JSZip) */
export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = resolveRuntimeAsset(src);
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Cannot load script ${src}`));
    };
    document.head.append(script);
  });
}

/** A hidden file input owned by the calling module: bind `onchange` on it, then click it */
export function createFileInput(accept: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.display = "none";
  document.body.append(input);
  return input;
}

/** Read the selected file as text and pass its content to the callback */
export function uploadFile(input: HTMLInputElement, callback: (data: string) => void): void {
  const file = input.files?.[0];
  if (!file) return;

  const fileReader = new FileReader();
  fileReader.readAsText(file, "UTF-8");
  input.value = "";
  fileReader.onload = loaded => callback(loaded.target?.result as string);
}

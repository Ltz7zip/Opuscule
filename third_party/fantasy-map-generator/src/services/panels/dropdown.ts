// 我们自己的下拉。
//
// 为什么不用原生 <select>：它的**弹层是系统画的** —— 系统蓝选中条、系统字体、
// 系统阴影，CSS 一律管不到（截图里那个蓝色高亮就是它）。
// 所以换成 <details> + 列表，和顶栏 ☰ 菜单同一套写法：能上我们的色，脚本禁用也能开。
import { hostText } from "@/services/i18n";

export interface DropdownItem {
  value: string;
  /** 英文原样传进来也行，会走宿主的词典翻成中文 */
  label: string;
}

export interface Dropdown {
  root: HTMLElement;
  setItems(items: DropdownItem[]): void;
  setValue(value: string): void;
  value(): string;
}

export interface DropdownOptions {
  items: DropdownItem[];
  value?: string;
  title?: string;
  /** 每项前面画一个色块（颜色选择用） */
  swatches?: Record<string, string>;
  onChange?(value: string): void;
}

export function createDropdown({ items, value, title, swatches, onChange }: DropdownOptions): Dropdown {
  const root = document.createElement("details");
  root.className = "tx-dd";

  const button = document.createElement("summary");
  button.className = "tx-dd__btn";
  if (title) button.title = title;
  const label = document.createElement("span");
  label.className = "tx-dd__label";
  const chev = document.createElement("span");
  chev.className = "tx-chev";
  chev.setAttribute("aria-hidden", "true");
  chev.textContent = "▾";
  button.append(label, chev);

  const list = document.createElement("div");
  list.className = "tx-dd__list";
  root.append(button, list);

  let current = value ?? items[0]?.value ?? "";
  let choices = items;

  const find = (id: string) => choices.find(item => item.value === id);

  function paint(): void {
    const item = find(current);
    label.textContent = hostText(item?.label ?? "");
    button.setAttribute("aria-pressed", "true");
  }

  function renderList(): void {
    list.replaceChildren(
      ...choices.map(item => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = `tx-dd__item${item.value === current ? " is-current" : ""}`;
        option.dataset.value = item.value;
        if (swatches?.[item.value]) {
          const chip = document.createElement("span");
          chip.className = "tx-dd__swatch";
          chip.style.background = swatches[item.value];
          option.append(chip);
        }
        const text = document.createElement("span");
        text.textContent = hostText(item.label);
        option.append(text);
        return option;
      })
    );
  }

  list.addEventListener("click", event => {
    const option = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-value]");
    if (!option) return;
    current = option.dataset.value ?? current;
    root.open = false;
    paint();
    renderList();
    onChange?.(current);
  });

  // 点到别处就收起来（details 原生只认 summary 的点击）
  document.addEventListener("click", event => {
    if (root.open && !root.contains(event.target as Node)) root.open = false;
  });

  paint();
  renderList();

  return {
    root,
    setItems(next) {
      choices = next;
      if (!find(current)) current = next[0]?.value ?? "";
      paint();
      renderList();
    },
    setValue(next) {
      if (next === current) return;
      current = next;
      paint();
      renderList();
    },
    value: () => current
  };
}

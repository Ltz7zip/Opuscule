// 一条「标签 + 绿值 + 通栏滑杆」的行（与工作区右栏同一种写法）。
//
// 结构在这里，皮在 static/map/panel.css 的 .tx-slider 段；这里只管
// 范围、显示格式，以及**什么时候把值交出去** —— 三维那种一点就重烘焙的参数
// 得等松手（change）才提交，不然拖一下就把 GPU 烤十遍。
export interface SliderRowOptions {
  label: string;
  min: number;
  max: number;
  /** 兜底 1：DOM 的 input.step 在没写属性时是空串，别拿它当兜底 */
  step?: number;
  value: number;
  format?(value: number): string;
  /** input = 拖动中随时交（默认）；change = 松手才交 */
  commit?: "input" | "change";
  onInput(value: number): void;
}

export interface SliderRow {
  root: HTMLElement;
  /** 外部改了值（读档、上游同步）时对齐 */
  set(value: number): void;
  /** 范围也会变（上限随其它选项变化），跟着对齐 */
  setBounds(min: number, max: number, step?: number): void;
}

export function createSliderRow(options: SliderRowOptions): SliderRow {
  const root = document.createElement("div");
  root.className = "tx-slider";

  const head = document.createElement("div");
  head.className = "tx-slider__head";
  const name = document.createElement("span");
  name.className = "tx-slider__name";
  name.textContent = options.label;
  const readout = document.createElement("span");
  readout.className = "tx-slider__value";
  head.append(name, readout);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.setAttribute("aria-label", options.label);

  const paint = () => {
    const now = Number(slider.value);
    readout.textContent = options.format ? options.format(now) : String(now);
  };
  const commit = options.commit ?? "input";

  slider.addEventListener("input", () => {
    paint();
    if (commit === "input") options.onInput(Number(slider.value));
  });
  slider.addEventListener("change", () => {
    paint();
    if (commit === "change") options.onInput(Number(slider.value));
  });

  root.append(head, slider);

  const row: SliderRow = {
    root,
    set(value) {
      const next = String(value);
      if (slider.value !== next) slider.value = next;
      paint();
    },
    setBounds(min, max, step) {
      slider.min = String(min);
      slider.max = String(max);
      slider.step = String(step && step > 0 ? step : 1);
    }
  };
  row.setBounds(options.min, options.max, options.step);
  row.set(options.value);
  return row;
}

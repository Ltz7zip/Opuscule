export const typeLabels: Record<string, string> = {
  character: "角色",
  place: "地点",
  event: "事件",
  note: "笔记",
  faction: "势力",
  item: "器物",
  bestiary: "博物",
  route: "航路",
  tool: "工具",
};

export function typeLabel(typeKey: string): string {
  return typeLabels[typeKey] ?? (typeKey || "卡片");
}

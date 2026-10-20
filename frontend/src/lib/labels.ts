export const typeLabels: Record<string, string> = {
  character: "角色",
  place: "地点",
  event: "事件",
  note: "笔记",
  tool: "工具",
};

export function typeLabel(typeKey: string): string {
  return typeLabels[typeKey] ?? (typeKey || "卡片");
}

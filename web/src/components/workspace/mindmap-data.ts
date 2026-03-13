/**
 * Mock 思维导图节点与边，后续可替换为 API。
 */
export const MINDMAP_NODES = [
  { id: "1", data: { label: "机器学习基础", timestamp: "00:00:00" }, position: { x: 300, y: 200 }, type: "input" as const },
  { id: "2", data: { label: "监督学习", timestamp: "00:03:20" }, position: { x: 100, y: 350 } },
  { id: "3", data: { label: "无监督学习", timestamp: "00:08:45" }, position: { x: 300, y: 350 } },
  { id: "4", data: { label: "神经网络", timestamp: "00:15:10" }, position: { x: 500, y: 350 } },
  { id: "5", data: { label: "分类算法", timestamp: "00:04:30" }, position: { x: 0, y: 500 } },
  { id: "6", data: { label: "回归算法", timestamp: "00:06:15" }, position: { x: 180, y: 500 } },
];

export const MINDMAP_EDGES = [
  { id: "e1-2", source: "1", target: "2" },
  { id: "e1-3", source: "1", target: "3" },
  { id: "e1-4", source: "1", target: "4" },
  { id: "e2-5", source: "2", target: "5" },
  { id: "e2-6", source: "2", target: "6" },
];

export const MINDMAP_NODE_IDS = MINDMAP_NODES.map((n) => n.id);

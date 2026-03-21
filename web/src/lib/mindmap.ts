export type EdgeType = "split" | "parallel" | "causal" | "progressive";

export const EDGE_COLORS: Record<EdgeType, string> = {
  split: "#94a3b8",
  parallel: "#6366f1",
  causal: "#f59e0b",
  progressive: "#10b981",
};

export interface MindMapTreeNode {
  id: string;
  label: string;
  timestamp?: string;
  endTimestamp?: string;
  important?: boolean;
  edgeType?: EdgeType;
  detail?: string;
  children?: MindMapTreeNode[];
}

export interface FlowNode {
  id: string;
  data: {
    label: string;
    timestamp?: string;
    endTimestamp?: string;
    important?: boolean;
    hasChildren?: boolean;
    detail?: string;
    depth?: number;
  };
  position: { x: number; y: number };
  type: string;
  style?: { width?: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string;
  targetHandle?: string;
  style?: { stroke?: string; strokeWidth?: number };
  markerEnd?: undefined;
}

const X_SPACING = 320;
const PADDING = 16;

const LABEL_HEIGHT = 24;
const TIMESTAMP_HEIGHT = 20;
const CHARS_PER_LINE = 22;
const DETAIL_LINE_HEIGHT = 18;

/** 根据节点内容估算高度，用于布局避免重叠 */
function estimateNodeHeight(flowNode: {
  data?: { depth?: number; detail?: string; label?: string };
}): number {
  const depth = flowNode.data?.depth ?? 0;
  const hasDetail = depth >= 2 && flowNode.data?.detail;

  if (!hasDetail) {
    return LABEL_HEIGHT + TIMESTAMP_HEIGHT + 24;
  }
  const lines = Math.ceil(
    (flowNode.data?.detail?.length ?? 0) / CHARS_PER_LINE
  );
  return (
    LABEL_HEIGHT +
    TIMESTAMP_HEIGHT +
    lines * DETAIL_LINE_HEIGHT +
    32
  );
}

export function treeToFlow(root: MindMapTreeNode): {
  nodes: FlowNode[];
  edges: FlowEdge[];
} {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let globalY = 0;

  function buildFlow(node: MindMapTreeNode, depth: number) {
    const isLeaf = !node.children || node.children.length === 0;
    const nodeData = {
      depth,
      detail: node.detail,
      label: node.label,
    };

    const flowDataBase = {
      label: node.label,
      timestamp: node.timestamp ?? "",
      endTimestamp: node.endTimestamp ?? "",
      important: node.important,
      hasChildren: !isLeaf,
      detail: node.detail,
      depth,
    };

    if (isLeaf) {
      const h = estimateNodeHeight({ data: nodeData });
      nodes.push({
        id: node.id,
        data: flowDataBase,
        position: { x: depth * X_SPACING, y: globalY },
        type: "mindmap",
      });
      globalY += h + PADDING;
    } else {
      const startY = globalY;
      (node.children ?? []).forEach((child) => {
        const raw = child.edgeType ?? "split";
        const edgeKey: EdgeType =
          raw === "parallel" || raw === "causal" || raw === "progressive"
            ? raw
            : "split";
        const stroke = EDGE_COLORS[edgeKey];
        edges.push({
          id: `e${node.id}-${child.id}`,
          source: node.id,
          target: child.id,
          sourceHandle: "right",
          targetHandle: "left",
          type: "smoothstep",
          style: { stroke, strokeWidth: 1.5 },
        });
        buildFlow(child, depth + 1);
      });
      const endY = globalY;
      const selfH = estimateNodeHeight({ data: nodeData });
      nodes.push({
        id: node.id,
        data: flowDataBase,
        position: {
          x: depth * X_SPACING,
          y: (startY + endY) / 2 - selfH / 2,
        },
        type: "mindmap",
      });
    }
  }

  buildFlow(root, 0);
  return { nodes, edges };
}

function parseMmSs(s: string): number {
  const parts = s
    .trim()
    .split(":")
    .map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/** 根据起止 MM:SS 返回时长文案；相同或差≤0 秒时返回 null */
export function formatDuration(start?: string, end?: string): string | null {
  const a = start?.trim() ? parseMmSs(start) : null;
  const b = end?.trim() ? parseMmSs(end) : null;
  if (a === null && b === null) return null;
  if (a !== null && b !== null) {
    const d = Math.abs(b - a);
    if (d <= 0) return null;
    const m = Math.floor(d / 60);
    const s = Math.floor(d % 60);
    if (m > 0) return `${m}分${s}秒`;
    return `${s}秒`;
  }
  if (a !== null && b === null) return null;
  if (a === null && b !== null) return null;
  return null;
}

function buildParentToChildren(edges: FlowEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    if (!map.has(e.source)) map.set(e.source, []);
    map.get(e.source)!.push(e.target);
  }
  return map;
}

function findRootNodes(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const depth0 = nodes.filter((n) => (n.data.depth ?? 0) === 0);
  if (depth0.length > 0) return depth0;
  const targets = new Set(edges.map((e) => e.target));
  return nodes.filter((n) => !targets.has(n.id));
}

function formatNodeMarkdown(node: FlowNode): string {
  const depth = node.data.depth ?? 0;
  const label = node.data.label ?? "";
  const ts = node.data.timestamp?.trim();
  const te = node.data.endTimestamp?.trim();
  const detail = node.data.detail?.trim();
  const important = node.data.important;

  if (depth === 0) {
    return `# ${label}`;
  }
  if (depth === 1) {
    let line = `## ${label}`;
    if (ts && te) {
      const dur = formatDuration(ts, te);
      if (dur) line += `（⏱ ${dur}）`;
    }
    return line;
  }
  if (depth === 2) {
    let line = `### ${label}`;
    if (ts) line += `（▶ ${ts}）`;
    return line;
  }
  const bullet = important ? `- **${label}**` : `- ${label}`;
  if (!detail) return bullet;
  const quoted = detail
    .split("\n")
    .map((line) => `  > ${line}`)
    .join("\n");
  return `${bullet}\n${quoted}`;
}

/**
 * 将 Flow 脑图转为 Markdown（按树 DFS，节点之间空一行）。
 */
export function flowToMarkdown(nodes: FlowNode[], edges: FlowEdge[]): string {
  if (nodes.length === 0) return "";

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = buildParentToChildren(edges);
  const roots = findRootNodes(nodes, edges);

  const blocks: string[] = [];

  function dfs(nodeId: string) {
    const node = byId.get(nodeId);
    if (!node) return;
    blocks.push(formatNodeMarkdown(node));
    for (const childId of childrenMap.get(nodeId) ?? []) {
      dfs(childId);
    }
  }

  for (const root of roots) {
    dfs(root.id);
  }

  return blocks.join("\n\n");
}

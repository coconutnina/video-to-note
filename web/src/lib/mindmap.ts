export type EdgeType = "split" | "parallel" | "causal" | "progressive";

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

const NODE_WIDTH = 300;
const X_SPACING = 440;
const PADDING = 48;

const LABEL_LINE_HEIGHT = 20;
const TIMESTAMP_HEIGHT = 20;
const CHARS_PER_LINE = 28;
const DETAIL_LINE_HEIGHT = 16;

/** 根据节点内容估算高度，用于布局避免重叠 */
function estimateNodeHeight(flowNode: {
  data?: { depth?: number; detail?: string; label?: string };
}): number {
  const label = flowNode.data?.label ?? "";
  const detail = flowNode.data?.detail?.trim() ?? "";
  const hasDetail = detail.length > 0;
  const labelLines = Math.max(1, Math.ceil(label.length / CHARS_PER_LINE));
  const detailLines = hasDetail
    ? Math.max(1, Math.ceil(detail.length / CHARS_PER_LINE))
    : 0;
  return (
    labelLines * LABEL_LINE_HEIGHT +
    (hasDetail ? detailLines * DETAIL_LINE_HEIGHT + 8 : 0) +
    TIMESTAMP_HEIGHT +
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
        style: { width: NODE_WIDTH },
      });
      globalY += h + PADDING;
    } else {
      const kids = node.children ?? [];
      kids.forEach((child) => {
        edges.push({
          id: `e${node.id}-${child.id}`,
          source: node.id,
          target: child.id,
          sourceHandle: "right",
          targetHandle: "left",
          type: "step",
          style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        });
        buildFlow(child, depth + 1);
      });
      const selfH = estimateNodeHeight({ data: nodeData });
      const firstId = kids[0]!.id;
      const lastId = kids[kids.length - 1]!.id;
      const firstFlowNode = nodes.find((n) => n.id === firstId);
      const lastFlowNode = nodes.find((n) => n.id === lastId);
      const firstChildY = firstFlowNode?.position.y ?? 0;
      const lastChildY = lastFlowNode?.position.y ?? firstChildY;
      nodes.push({
        id: node.id,
        data: flowDataBase,
        position: {
          x: depth * X_SPACING,
          y: (firstChildY + lastChildY) / 2 - selfH / 2,
        },
        type: "mindmap",
        style: { width: NODE_WIDTH },
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
    const line = `## ${label}`;
    if (!detail) return line;
    return `${line}\n${detail}`;
  }
  if (depth === 2) {
    const line = `### ${label}`;
    if (!detail) return line;
    return `${line}\n${detail}`;
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

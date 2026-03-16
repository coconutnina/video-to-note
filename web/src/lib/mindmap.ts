export interface MindMapTreeNode {
  id: string;
  label: string;
  timestamp?: string;
  detail?: string;
  children?: MindMapTreeNode[];
}

export interface FlowNode {
  id: string;
  data: {
    label: string;
    timestamp?: string;
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

    if (isLeaf) {
      const h = estimateNodeHeight({ data: nodeData });
      nodes.push({
        id: node.id,
        data: {
          label: node.label,
          timestamp: node.timestamp ?? "",
          detail: node.detail,
          depth,
        },
        position: { x: depth * X_SPACING, y: globalY },
        type: "mindmap",
      });
      globalY += h + PADDING;
    } else {
      const startY = globalY;
      (node.children ?? []).forEach((child) => {
        edges.push({
          id: `e${node.id}-${child.id}`,
          source: node.id,
          target: child.id,
          sourceHandle: "right",
          targetHandle: "left",
          type: "smoothstep",
          style: { stroke: "#888", strokeWidth: 1.5 },
        });
        buildFlow(child, depth + 1);
      });
      const endY = globalY;
      const selfH = estimateNodeHeight({ data: nodeData });
      nodes.push({
        id: node.id,
        data: {
          label: node.label,
          timestamp: node.timestamp ?? "",
          detail: node.detail,
          depth,
        },
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

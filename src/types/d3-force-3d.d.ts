declare module 'd3-force-3d' {
  export interface CollisionForce<Node> {
    (alpha: number): void
    initialize?: (nodes: Node[], ...args: unknown[]) => void
    iterations(): number
    iterations(value: number): CollisionForce<Node>
    strength(): number
    strength(value: number): CollisionForce<Node>
    radius(): number | ((node: Node) => number)
    radius(
      value: number | ((node: Node, index: number, nodes: Node[]) => number),
    ): CollisionForce<Node>
  }

  export function forceCollide<Node = unknown>(
    radius?: number | ((node: Node, index: number, nodes: Node[]) => number),
  ): CollisionForce<Node>
}

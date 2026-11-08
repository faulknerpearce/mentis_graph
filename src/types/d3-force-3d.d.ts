declare module 'd3-force-3d' {
  type Accessor<Node, T> = T | ((node: Node, index: number, nodes: Node[]) => T)

  export interface Force<Node> {
    (alpha: number): void
    initialize?: (nodes: Node[], ...args: unknown[]) => void
  }

  export interface CollisionForce<Node> extends Force<Node> {
    iterations(value: number): CollisionForce<Node>
    strength(value: number): CollisionForce<Node>
    radius(value: Accessor<Node, number>): CollisionForce<Node>
  }

  export interface PositionForce<Node> extends Force<Node> {
    strength(value: Accessor<Node, number>): PositionForce<Node>
  }

  export function forceCenter<Node = unknown>(x?: number, y?: number, z?: number): Force<Node>
  export function forceCollide<Node = unknown>(
    radius?: Accessor<Node, number>,
  ): CollisionForce<Node>
  export function forceX<Node = unknown>(x?: Accessor<Node, number>): PositionForce<Node>
  export function forceY<Node = unknown>(y?: Accessor<Node, number>): PositionForce<Node>
  export function forceZ<Node = unknown>(z?: Accessor<Node, number>): PositionForce<Node>
}

import type { CityGraph } from './graph';

export class CBS {
  constructor(private graph: CityGraph) {}
  findPaths(): number {
    return this.graph.nodeCount;
  }
}

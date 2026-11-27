import type { CityGraph } from './graph';

export class MinCostFlow {
  constructor(private graph: CityGraph) {}
  solve(): number {
    return this.graph.nodeCount;
  }
}

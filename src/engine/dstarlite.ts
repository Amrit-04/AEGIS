import type { CityGraph } from './graph';

export class DStarLite {
  constructor(private graph: CityGraph, private start: number, private goal: number) {}
  compute(): number {
    return this.graph.euclideanDistance(this.start, this.goal);
  }
}

import type { IdeaItem } from '../types/schema';

/** Notes that count toward a folder's priority order (not completed). */
export function isRankedIdea(i: IdeaItem): boolean {
  return i.status !== 'completed';
}

/**
 * Returns the highest-priority bottleneck in the same folder that is set to
 * "block tasks below" and sits above `idea` in priority order, or null.
 */
export function getBlockingBottleneck(idea: IdeaItem, ideas: IdeaItem[]): IdeaItem | null {
  if (!isRankedIdea(idea)) return null;
  const blockers = ideas
    .filter(
      (b) =>
        b.id !== idea.id &&
        b.project === idea.project &&
        isRankedIdea(b) &&
        b.isBottleneck &&
        b.blocksBelow &&
        b.priorityRank < idea.priorityRank
    )
    .sort((a, b) => a.priorityRank - b.priorityRank);
  return blockers[0] ?? null;
}

/** Number of tasks a blocking bottleneck currently covers in its folder. */
export function countCoveredTasks(bottleneck: IdeaItem, ideas: IdeaItem[]): number {
  if (!bottleneck.isBottleneck || !bottleneck.blocksBelow) return 0;
  return ideas.filter(
    (i) =>
      i.id !== bottleneck.id &&
      i.project === bottleneck.project &&
      isRankedIdea(i) &&
      i.priorityRank > bottleneck.priorityRank
  ).length;
}

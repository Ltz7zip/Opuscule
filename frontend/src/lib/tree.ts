import type { CardSummary, CollectionNode } from "../types";

export type CollectionTree = CollectionNode & {
  children: CollectionTree[];
  cards: CardSummary[];
};

export function buildCollectionTree(
  collections: CollectionNode[],
  cards: CardSummary[],
): CollectionTree[] {
  const byId = new Map<number, CollectionTree>();
  for (const collection of collections) {
    byId.set(collection.id, { ...collection, children: [], cards: [] });
  }

  for (const collection of byId.values()) {
    if (collection.parent !== null && byId.has(collection.parent)) {
      byId.get(collection.parent)!.children.push(collection);
    }
  }

  for (const card of cards) {
    if (card.home_collection !== null && byId.has(card.home_collection)) {
      byId.get(card.home_collection)!.cards.push(card);
    }
  }

  const sort = (nodes: CollectionTree[]) => {
    nodes.sort((a, b) => a.position_key.localeCompare(b.position_key) || a.id - b.id);
    for (const node of nodes) sort(node.children);
  };

  const roots = [...byId.values()].filter(
    (node) => node.parent === null || !byId.has(node.parent),
  );
  sort(roots);
  return roots;
}

export function rootCards(cards: CardSummary[]): CardSummary[] {
  return cards.filter((card) => card.home_collection === null);
}

export function filterCards(cards: CardSummary[], query: string): CardSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return cards;
  return cards.filter(
    (card) =>
      card.title.toLowerCase().includes(needle) ||
      card.type_key.toLowerCase().includes(needle) ||
      card.slug.toLowerCase().includes(needle),
  );
}

export function countTreeCards(nodes: CollectionTree[]): number {
  return nodes.reduce(
    (total, node) => total + node.cards.length + countTreeCards(node.children),
    0,
  );
}

/** Reading order used by the article prev/next links. */
export function flattenCards(nodes: CollectionTree[], roots: CardSummary[]): CardSummary[] {
  const result: CardSummary[] = [];
  const walk = (items: CollectionTree[]) => {
    for (const item of items) {
      result.push(...item.cards);
      walk(item.children);
    }
  };
  walk(nodes);
  result.push(...roots);
  return result;
}

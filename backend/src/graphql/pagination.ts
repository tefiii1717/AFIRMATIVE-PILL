/** Cursores opacos basados en offset (suficiente para un catálogo de este tamaño). */
export const MAX_PAGE_SIZE = 50;

export function encodeCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`).toString('base64url');
}

export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const match = /^offset:(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString());
  return match ? Number.parseInt(match[1], 10) + 1 : 0;
}

export function connection<T>(rows: T[], totalCount: number, offset: number) {
  const edges = rows.map((node, index) => ({ node, cursor: encodeCursor(offset + index) }));
  return {
    edges,
    totalCount,
    pageInfo: {
      hasNextPage: offset + rows.length < totalCount,
      endCursor: edges.at(-1)?.cursor ?? null,
    },
  };
}

import type { PaginationConfig, SortConfig } from '../../types/state';
import { DEFAULT_PAGE_SIZE } from '../../constants';

export function createPaginationConfig(overrides: Partial<PaginationConfig> = {}): PaginationConfig {
  const pageSize = overrides.pageSize ?? DEFAULT_PAGE_SIZE;

  return {
    page: 1,
    pageSize,
    totalRecords: 0,
    totalPages: 1,
    ...overrides,
  };
}

export function createSortConfig(
  field = 'createdAt',
  order: SortConfig['order'] = 'desc'
): SortConfig {
  return { field, order };
}

export function normalizeText(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().toLowerCase();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeText).join(' ');
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(normalizeText).join(' ');
  }

  return String(value).toLowerCase();
}

export function matchesSearch<T extends object>(
  record: T,
  query: string,
  fields: Array<keyof T>
): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return fields.some(field => normalizeText(record[field]).includes(normalizedQuery));
}

function toComparableValue(value: unknown): string | number {
  if (value == null) {
    return Number.NEGATIVE_INFINITY;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeText).join(' ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  return value as string | number;
}

export function sortItems<T extends Record<string, unknown>>(
  items: T[],
  sorting: SortConfig
): T[] {
  const { field, order } = sorting;

  return [...items].sort((left, right) => {
    const leftValue = toComparableValue(left[field]);
    const rightValue = toComparableValue(right[field]);

    if (leftValue === rightValue) {
      return 0;
    }

    if (leftValue > rightValue) {
      return order === 'asc' ? 1 : -1;
    }

    return order === 'asc' ? -1 : 1;
  });
}

export function updatePaginationTotals(
  pagination: PaginationConfig,
  totalRecords: number
): PaginationConfig {
  const totalPages = Math.max(1, Math.ceil(totalRecords / pagination.pageSize));

  return {
    ...pagination,
    page: Math.min(pagination.page, totalPages),
    totalRecords,
    totalPages,
  };
}

export function paginateItems<T>(items: T[], pagination: PaginationConfig): T[] {
  const start = (pagination.page - 1) * pagination.pageSize;
  return items.slice(start, start + pagination.pageSize);
}

export function matchesDateRange(
  value: Date | string | undefined,
  from: string,
  to: string
): boolean {
  if (!from && !to) {
    return true;
  }

  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return false;
  }

  if (from && timestamp < new Date(from).getTime()) {
    return false;
  }

  if (to && timestamp > new Date(to).getTime()) {
    return false;
  }

  return true;
}

export function createStatusSummary(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((summary, value) => {
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});
}

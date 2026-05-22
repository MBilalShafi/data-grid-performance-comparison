import type {
  BenchmarkColumnSpec,
  BenchmarkData,
  BenchmarkRow,
  BenchmarkScenario,
  CellComplexity,
  ColumnKind,
} from '../types';

const names = ['Atlas', 'Boreal', 'Cobalt', 'Delta', 'Ember', 'Fjord', 'Garnet', 'Harbor'] as const;

const statuses = ['queued', 'active', 'paused', 'complete', 'review'] as const;
const regions = ['North', 'South', 'East', 'West', 'Central'] as const;

const mixedPattern: readonly ColumnKind[] = [
  'string',
  'longText',
  'number',
  'date',
  'dateTime',
  'boolean',
  'singleSelect',
  'actions',
  'custom',
];

const simplePattern: readonly ColumnKind[] = ['string', 'number', 'boolean', 'date'];

export function generateBenchmarkData(scenario: BenchmarkScenario): BenchmarkData {
  const startedAt = performance.now();
  const columns = createColumns(scenario.columnCount, scenario.cellComplexity);
  const rows = createRows(scenario.rowCount, columns);

  return {
    columns,
    generationMs: performance.now() - startedAt,
    rows,
  };
}

export function getVisibleProviders(providerMode: BenchmarkScenario['providerMode']) {
  return providerMode === 'side-by-side'
    ? (['mui', 'devextreme', 'aggrid'] as const)
    : ([providerMode] as const);
}

export function getScenarioKey(scenario: BenchmarkScenario) {
  return `${formatRowCount(scenario.rowCount)} x ${scenario.columnCount} / ${scenario.cellComplexity}`;
}

export function getCellValue(
  row: BenchmarkRow,
  column: BenchmarkColumnSpec,
): boolean | Date | number | string {
  const hash = hashCell(row.id, column.index);

  switch (column.kind) {
    case 'string':
      return `${names[hash % names.length]}-${row.id}-${column.index}`;
    case 'longText':
      return `${names[hash % names.length]} ${regions[(hash >>> 3) % regions.length]} account ${
        row.id
      } with segment ${(hash >>> 6) % 1000}`;
    case 'number':
      return Math.round((((hash % 100000) / 10 + row.group * 37) * 100) / 100);
    case 'date':
      return new Date(Date.UTC(2021, (hash >>> 5) % 12, 1 + ((hash >>> 9) % 28)));
    case 'dateTime':
      return new Date(
        Date.UTC(
          2021 + ((hash >>> 4) % 5),
          (hash >>> 7) % 12,
          1 + ((hash >>> 11) % 28),
          (hash >>> 16) % 24,
          (hash >>> 21) % 60,
        ),
      );
    case 'boolean':
      return (hash & 1) === 1;
    case 'singleSelect':
      return statuses[hash % statuses.length];
    case 'actions':
      return `Open ${row.id}`;
    case 'custom':
      return `${statuses[(hash >>> 2) % statuses.length]}:${(hash >>> 8) % 100}`;
    default:
      return assertNever(column.kind);
  }
}

export function formatCellValue(value: boolean | Date | number | string) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

export function findSortColumn(columns: readonly BenchmarkColumnSpec[]) {
  return columns.find((column) => column.kind === 'number' && column.sortable) ?? columns[0];
}

export function findFilterColumn(columns: readonly BenchmarkColumnSpec[]) {
  return (
    columns.find((column) => column.kind === 'string' && column.filterable) ??
    columns.find((column) => column.kind === 'singleSelect' && column.filterable) ??
    columns[0]
  );
}

function createRows(
  rowCount: BenchmarkScenario['rowCount'],
  columns: readonly BenchmarkColumnSpec[],
) {
  ensureRowFieldGetters(columns.length);

  return Array.from({ length: rowCount }, (_, index): BenchmarkRow => {
    const id = index + 1;

    return new BenchmarkRowRecord(id, columns);
  });
}

function createColumns(columnCount: BenchmarkScenario['columnCount'], complexity: CellComplexity) {
  return Array.from({ length: columnCount }, (_, index): BenchmarkColumnSpec => {
    const kind = getColumnKind(index, complexity);

    return {
      field: `c${index}`,
      filterable: kind !== 'actions' && kind !== 'custom',
      headerName: `${getHeaderPrefix(kind)} ${index + 1}`,
      index,
      kind,
      sortable: kind !== 'actions' && kind !== 'custom' && kind !== 'longText',
      valueOptions: kind === 'singleSelect' ? statuses : undefined,
      width: getColumnWidth(kind),
    };
  });
}

function getColumnKind(index: number, complexity: CellComplexity): ColumnKind {
  if (complexity === 'simple') {
    return simplePattern[index % simplePattern.length];
  }

  if (complexity === 'custom-heavy') {
    if (index % 5 === 0) {
      return 'custom';
    }

    if (index % 11 === 0) {
      return 'actions';
    }
  }

  return mixedPattern[index % mixedPattern.length];
}

function getHeaderPrefix(kind: ColumnKind) {
  switch (kind) {
    case 'string':
      return 'Text';
    case 'longText':
      return 'Long text';
    case 'number':
      return 'Number';
    case 'date':
      return 'Date';
    case 'dateTime':
      return 'Date time';
    case 'boolean':
      return 'Flag';
    case 'singleSelect':
      return 'Status';
    case 'actions':
      return 'Actions';
    case 'custom':
      return 'Custom';
    default:
      return assertNever(kind);
  }
}

function getColumnWidth(kind: ColumnKind) {
  switch (kind) {
    case 'longText':
      return 220;
    case 'dateTime':
      return 180;
    case 'actions':
      return 110;
    case 'custom':
      return 150;
    case 'boolean':
      return 110;
    default:
      return 140;
  }
}

function hashCell(rowId: number, columnIndex: number) {
  let value = rowId * 2654435761 + (columnIndex + 1) * 1597334677;
  value ^= value >>> 16;
  value = Math.imul(value, 2246822519);
  value ^= value >>> 13;
  value = Math.imul(value, 3266489917);
  value ^= value >>> 16;

  return value >>> 0;
}

class BenchmarkRowRecord implements BenchmarkRow {
  readonly group: number;

  readonly id: number;

  readonly seed: number;

  readonly __columns: readonly BenchmarkColumnSpec[];

  constructor(id: number, columns: readonly BenchmarkColumnSpec[]) {
    this.group = id % 20;
    this.id = id;
    this.seed = hashCell(id, 0);
    this.__columns = columns;
  }
}

const rowFieldGetterIndexes = new Set<number>();

function ensureRowFieldGetters(columnCount: number) {
  for (let index = 0; index < columnCount; index += 1) {
    if (rowFieldGetterIndexes.has(index)) {
      continue;
    }

    rowFieldGetterIndexes.add(index);
    Object.defineProperty(BenchmarkRowRecord.prototype, `c${index}`, {
      configurable: false,
      enumerable: false,
      get(this: BenchmarkRowRecord) {
        const column = this.__columns[index];

        return column ? getCellValue(this, column) : undefined;
      },
    });
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${value}`);
}

function formatRowCount(rowCount: number) {
  if (rowCount < 1000) {
    return rowCount.toLocaleString();
  }

  const thousands = rowCount / 1000;

  return `${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
}

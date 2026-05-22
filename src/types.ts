export type BenchmarkProvider = 'mui' | 'devextreme' | 'aggrid';
export type ProviderMode = BenchmarkProvider | 'side-by-side';
export type RowCount = number;
export type ColumnCount = number;
export type CellComplexity = 'simple' | 'mixed' | 'custom-heavy';
export type ColumnKind =
  | 'string'
  | 'longText'
  | 'number'
  | 'date'
  | 'dateTime'
  | 'boolean'
  | 'singleSelect'
  | 'actions'
  | 'custom';
export type BenchmarkAction =
  | 'mount'
  | 'verticalScroll'
  | 'horizontalScroll'
  | 'diagonalScroll'
  | 'sort'
  | 'filter';

export interface BenchmarkScenario {
  cellComplexity: CellComplexity;
  columnCount: ColumnCount;
  providerMode: ProviderMode;
  rowCount: RowCount;
}

export interface BenchmarkRow {
  group: number;
  id: number;
  seed: number;
}

export interface BenchmarkColumnSpec {
  field: string;
  filterable: boolean;
  headerName: string;
  index: number;
  kind: ColumnKind;
  sortable: boolean;
  valueOptions?: readonly string[];
  width: number;
}

export interface BenchmarkData {
  columns: BenchmarkColumnSpec[];
  generationMs: number;
  rows: BenchmarkRow[];
}

export interface ProviderInteractionState {
  filterField?: string;
  filterValue?: string;
  sortField?: string;
  version: number;
}

export const PROVIDER_MODES: readonly ProviderMode[] = [
  'mui',
  'devextreme',
  'aggrid',
  'side-by-side',
];
export const ROW_COUNTS: readonly RowCount[] = [100000, 200000, 300000];
export const COLUMN_COUNTS: readonly ColumnCount[] = [100, 200, 300];
export const CELL_COMPLEXITIES: readonly CellComplexity[] = ['simple', 'mixed', 'custom-heavy'];
export const BENCHMARK_ACTIONS: readonly BenchmarkAction[] = [
  'mount',
  'verticalScroll',
  'horizontalScroll',
  'diagonalScroll',
  'sort',
  'filter',
];

export const PACKAGE_VERSIONS = {
  agGrid: '35.3.0',
  agGridEnterprise: '35.3.0',
  devextreme: '25.2.7',
  devextremeReact: '25.2.7',
  muiDataGridPremium: '9.3.0',
  react: '19.2.6',
  vite: '8.0.13',
} as const;

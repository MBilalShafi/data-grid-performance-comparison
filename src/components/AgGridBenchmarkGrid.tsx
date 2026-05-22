import * as React from 'react';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import { type ColDef, type GridApi, type GridReadyEvent, themeQuartz } from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { getCellValue } from '../data/generator';
import type { BenchmarkColumnSpec, BenchmarkRow, ProviderInteractionState } from '../types';

interface AgGridBenchmarkGridProps {
  columns: BenchmarkColumnSpec[];
  interaction: ProviderInteractionState;
  onReady: () => void;
  rows: BenchmarkRow[];
}

const modules = [AllEnterpriseModule];
const theme = themeQuartz.withParams({
  headerHeight: 40,
  rowHeight: 36,
});

export function AgGridBenchmarkGrid({
  columns,
  interaction,
  onReady,
  rows,
}: AgGridBenchmarkGridProps) {
  const apiRef = React.useRef<GridApi<BenchmarkRow> | null>(null);
  const columnDefs = React.useMemo(() => createAgGridColumns(columns), [columns]);
  const defaultColDef = React.useMemo<ColDef<BenchmarkRow>>(
    () => ({
      editable: false,
      filter: true,
      resizable: false,
      sortable: true,
      suppressAutoSize: true,
    }),
    [],
  );

  React.useEffect(() => {
    const api = apiRef.current;

    if (!api) {
      return;
    }

    api.applyColumnState({
      defaultState: { sort: null },
      state: interaction.sortField
        ? [
            {
              colId: interaction.sortField,
              sort: 'asc',
            },
          ]
        : [],
    });

    api.setFilterModel(
      interaction.filterField
        ? {
            [interaction.filterField]: {
              filter: interaction.filterValue ?? '',
              type: 'contains',
            },
          }
        : null,
    );
  }, [
    interaction.filterField,
    interaction.filterValue,
    interaction.sortField,
    interaction.version,
  ]);

  const handleGridReady = React.useCallback((event: GridReadyEvent<BenchmarkRow>) => {
    apiRef.current = event.api;
  }, []);

  return (
    <div className="grid-shell ag-grid-shell" data-benchmark-provider="aggrid">
      <AgGridProvider modules={modules}>
        <AgGridReact<BenchmarkRow>
          animateRows={false}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          domLayout="normal"
          headerHeight={40}
          onFirstDataRendered={onReady}
          onGridReady={handleGridReady}
          rowBuffer={10}
          rowData={rows}
          rowHeight={36}
          suppressCellFocus
          suppressColumnMoveAnimation
          suppressMovableColumns
          theme={theme}
        />
      </AgGridProvider>
    </div>
  );
}

function createAgGridColumns(columns: readonly BenchmarkColumnSpec[]) {
  return columns.map((column): ColDef<BenchmarkRow> => {
    const baseColumn: ColDef<BenchmarkRow> = {
      cellDataType: getAgGridCellDataType(column),
      colId: column.field,
      filter: getAgGridFilter(column),
      headerName: column.headerName,
      sortable: column.sortable,
      valueGetter: (params) => (params.data ? getCellValue(params.data, column) : null),
      width: column.width,
    };

    if (column.kind === 'actions') {
      return {
        ...baseColumn,
        cellRenderer: AgGridActionCell,
        filter: false,
        sortable: false,
      };
    }

    if (column.kind === 'custom') {
      return {
        ...baseColumn,
        cellRenderer: AgGridCustomCell,
        filter: false,
        sortable: false,
      };
    }

    return baseColumn;
  });
}

function getAgGridCellDataType(column: BenchmarkColumnSpec) {
  switch (column.kind) {
    case 'number':
      return 'number';
    case 'date':
    case 'dateTime':
      return 'date';
    case 'boolean':
      return 'boolean';
    default:
      return 'text';
  }
}

function getAgGridFilter(column: BenchmarkColumnSpec) {
  if (!column.filterable) {
    return false;
  }

  switch (column.kind) {
    case 'number':
      return 'agNumberColumnFilter';
    case 'date':
    case 'dateTime':
      return 'agDateColumnFilter';
    case 'singleSelect':
      return 'agSetColumnFilter';
    default:
      return 'agTextColumnFilter';
  }
}

function AgGridActionCell() {
  return <button className="inline-button">Inspect</button>;
}

function AgGridCustomCell({ value }: { value?: unknown }) {
  const [status, score = '0'] = String(value ?? '').split(':');

  return (
    <span className="custom-cell">
      <span className="status-dot" />
      <span>{status}</span>
      <strong>{score}</strong>
    </span>
  );
}

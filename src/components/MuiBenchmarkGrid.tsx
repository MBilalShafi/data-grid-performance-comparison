import * as React from 'react';
import {
  DataGridPremium,
  GridActionsCellItem,
  type GridColDef,
  type GridFilterModel,
  type GridRenderCellParams,
  type GridSortModel,
} from '@mui/x-data-grid-premium';
import type { BenchmarkColumnSpec, BenchmarkRow, ProviderInteractionState } from '../types';

interface MuiBenchmarkGridProps {
  columns: BenchmarkColumnSpec[];
  interaction: ProviderInteractionState;
  onReady: () => void;
  rows: BenchmarkRow[];
}

export function MuiBenchmarkGrid({ columns, interaction, onReady, rows }: MuiBenchmarkGridProps) {
  const gridColumns = React.useMemo(() => createMuiColumns(columns), [columns]);
  const sortModel = React.useMemo<GridSortModel>(
    () => (interaction.sortField ? [{ field: interaction.sortField, sort: 'asc' }] : []),
    [interaction.sortField],
  );
  const filterModel = React.useMemo<GridFilterModel>(
    () =>
      interaction.filterField
        ? {
            items: [
              {
                field: interaction.filterField,
                id: 'benchmark-filter',
                operator: 'contains',
                value: interaction.filterValue ?? '',
              },
            ],
          }
        : { items: [] },
    [interaction.filterField, interaction.filterValue],
  );

  React.useEffect(() => {
    let disposed = false;
    const frame = requestAnimationFrame(() => {
      if (!disposed) {
        onReady();
      }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
    };
  }, [onReady, rows, gridColumns]);

  return (
    <div className="grid-shell" data-benchmark-provider="mui">
      <DataGridPremium
        columns={gridColumns}
        disableAggregation
        disableColumnMenu={false}
        disablePivoting
        disableRowGrouping
        disableRowSelectionOnClick
        filterMode="client"
        filterModel={filterModel}
        getRowId={(row) => row.id}
        rowHeight={36}
        columnHeaderHeight={40}
        rows={rows}
        sortingMode="client"
        sortModel={sortModel}
      />
    </div>
  );
}

function createMuiColumns(columns: readonly BenchmarkColumnSpec[]) {
  return columns.map((column): GridColDef<BenchmarkRow> => {
    const baseColumn: GridColDef<BenchmarkRow> = {
      field: column.field,
      filterable: column.filterable,
      headerName: column.headerName,
      sortable: column.sortable,
      width: column.width,
    };

    switch (column.kind) {
      case 'number':
        return {
          ...baseColumn,
          type: 'number',
        };
      case 'date':
        return {
          ...baseColumn,
          type: 'date',
        };
      case 'dateTime':
        return {
          ...baseColumn,
          type: 'dateTime',
        };
      case 'boolean':
        return {
          ...baseColumn,
          type: 'boolean',
        };
      case 'singleSelect':
        return {
          ...baseColumn,
          type: 'singleSelect',
          valueOptions: [...(column.valueOptions ?? [])],
        };
      case 'actions':
        return {
          field: column.field,
          filterable: false,
          getActions: (params) => [
            <GridActionsCellItem
              icon={<span className="action-glyph">A</span>}
              key="inspect"
              label={`Inspect ${params.id}`}
              onClick={() => undefined}
              showInMenu={false}
            />,
          ],
          headerName: column.headerName,
          sortable: false,
          type: 'actions',
          width: column.width,
        };
      case 'custom':
        return {
          ...baseColumn,
          renderCell: renderMuiCustomCell,
          sortComparator: undefined,
        };
      case 'longText':
      case 'string':
        return {
          ...baseColumn,
          type: 'string',
        };
      default:
        return baseColumn;
    }
  });
}

function renderMuiCustomCell(params: GridRenderCellParams<BenchmarkRow>) {
  const value = String(params.value ?? '');
  const [status, score = '0'] = value.split(':');

  return (
    <span className="custom-cell">
      <span className="status-dot" />
      <span>{status}</span>
      <strong>{score}</strong>
    </span>
  );
}

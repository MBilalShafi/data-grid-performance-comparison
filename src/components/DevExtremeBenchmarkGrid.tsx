import DataGrid, { Column, Lookup, Scrolling, Sorting } from 'devextreme-react/data-grid';
import type { BenchmarkColumnSpec, BenchmarkRow, ProviderInteractionState } from '../types';

interface DevExtremeBenchmarkGridProps {
  columns: BenchmarkColumnSpec[];
  interaction: ProviderInteractionState;
  onReady: () => void;
  rows: BenchmarkRow[];
}

type DevExtremeDataType = 'boolean' | 'date' | 'datetime' | 'number' | 'string';

export function DevExtremeBenchmarkGrid({
  columns,
  interaction,
  onReady,
  rows,
}: DevExtremeBenchmarkGridProps) {
  return (
    <div className="grid-shell dx-grid-shell" data-benchmark-provider="devextreme">
      <DataGrid
        allowColumnReordering={false}
        allowColumnResizing={false}
        columnAutoWidth={false}
        dataSource={rows}
        height="100%"
        keyExpr="id"
        onContentReady={onReady}
        repaintChangesOnly={false}
        remoteOperations={false}
        rowAlternationEnabled={false}
        showBorders
        width="100%"
      >
        <Scrolling
          columnRenderingMode="virtual"
          mode="virtual"
          rowRenderingMode="virtual"
          useNative={false}
        />
        <Sorting mode="single" />
        {columns.map((column) => (
          <Column
            allowFiltering={column.filterable}
            allowSorting={column.sortable}
            caption={column.headerName}
            cellRender={
              column.kind === 'custom' || column.kind === 'actions'
                ? renderDevExtremeCustomCell
                : undefined
            }
            dataField={column.field}
            dataType={getDevExtremeDataType(column)}
            filterValue={
              interaction.filterField === column.field ? interaction.filterValue : undefined
            }
            key={column.field}
            selectedFilterOperation={
              interaction.filterField === column.field ? 'contains' : undefined
            }
            sortOrder={interaction.sortField === column.field ? 'asc' : undefined}
            width={column.width}
          >
            {column.kind === 'singleSelect' ? (
              <Lookup dataSource={[...(column.valueOptions ?? [])]} />
            ) : null}
          </Column>
        ))}
      </DataGrid>
    </div>
  );
}

function getDevExtremeDataType(column: BenchmarkColumnSpec): DevExtremeDataType {
  switch (column.kind) {
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'dateTime':
      return 'datetime';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

function renderDevExtremeCustomCell(cell: { value?: unknown }) {
  const value = String(cell.value ?? '');

  if (value.startsWith('Open ')) {
    return <button className="inline-button">Inspect</button>;
  }

  const [status, score = '0'] = value.split(':');

  return (
    <span className="custom-cell">
      <span className="status-dot" />
      <span>{status}</span>
      <strong>{score}</strong>
    </span>
  );
}

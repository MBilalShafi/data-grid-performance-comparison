import * as React from 'react';
import './styles.css';
import 'devextreme/dist/css/dx.light.css';
import { AgGridBenchmarkGrid } from './components/AgGridBenchmarkGrid';
import { DevExtremeBenchmarkGrid } from './components/DevExtremeBenchmarkGrid';
import { MuiBenchmarkGrid } from './components/MuiBenchmarkGrid';
import {
  formatCellValue,
  findFilterColumn,
  findSortColumn,
  generateBenchmarkData,
  getCellValue,
  getScenarioKey,
  getVisibleProviders,
} from './data/generator';
import {
  countDomNodes,
  createEmptyResults,
  getEnvironmentMetadata,
  measureFrames,
  readHeapSize,
  waitForAnimationFrames,
  type ActionMetric,
  type ActionRunResult,
  type ProviderResult,
} from './benchmark/metrics';
import type {
  BenchmarkAction,
  BenchmarkData,
  BenchmarkProvider,
  BenchmarkScenario,
  CellComplexity,
  ProviderInteractionState,
  ProviderMode,
} from './types';
import { BENCHMARK_ACTIONS, CELL_COMPLEXITIES, PACKAGE_VERSIONS, PROVIDER_MODES } from './types';
import type { BenchmarkValidationSnapshot } from './vite-env';

const MAX_ROW_COUNT = 300000;
const MAX_COLUMN_COUNT = 300;
const MIN_GRID_SIZE = 1;
const AUTO_MOUNT_ROW_LIMIT = 1000;
const AUTO_MOUNT_COLUMN_LIMIT = 100;

const defaultScenario: BenchmarkScenario = {
  cellComplexity: 'mixed',
  columnCount: 10,
  providerMode: 'side-by-side',
  rowCount: 10,
};

const emptyInteraction = (): ProviderInteractionState => ({ version: 0 });

interface PendingMount {
  heapBefore: number | null;
  providers: Set<BenchmarkProvider>;
  runId: number;
  startedAt: number;
}

export default function App() {
  const initialScenario = React.useMemo(readInitialScenario, []);
  const shouldAutoMountInitialScenario = React.useMemo(
    () => shouldAutoMountScenario(initialScenario),
    [initialScenario],
  );
  const [scenario, setScenarioState] = React.useState(initialScenario);
  const [data, setData] = React.useState<BenchmarkData>(() =>
    generateBenchmarkData(initialScenario),
  );
  const [mountRunId, setMountRunId] = React.useState(shouldAutoMountInitialScenario ? 1 : 0);
  const [isGridMounted, setIsGridMounted] = React.useState(shouldAutoMountInitialScenario);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isRunningAction, setIsRunningAction] = React.useState<BenchmarkAction | null>(null);
  const [rowCountInput, setRowCountInput] = React.useState(String(initialScenario.rowCount));
  const [columnCountInput, setColumnCountInput] = React.useState(
    String(initialScenario.columnCount),
  );
  const [interactions, setInteractions] = React.useState<
    Record<BenchmarkProvider, ProviderInteractionState>
  >({
    aggrid: emptyInteraction(),
    devextreme: emptyInteraction(),
    mui: emptyInteraction(),
  });
  const [results, setResults] = React.useState<
    Record<BenchmarkProvider, ProviderResult | undefined>
  >(() => createEmptyResults(initialScenario, data.generationMs));
  const pendingMountRef = React.useRef<PendingMount>({
    heapBefore: shouldAutoMountInitialScenario ? readHeapSize() : null,
    providers: new Set(
      shouldAutoMountInitialScenario ? getVisibleProviders(initialScenario.providerMode) : [],
    ),
    runId: shouldAutoMountInitialScenario ? 1 : 0,
    startedAt: performance.now(),
  });
  const mountRunIdRef = React.useRef(shouldAutoMountInitialScenario ? 1 : 0);
  const isGridMountedRef = React.useRef(shouldAutoMountInitialScenario);
  const scenarioRef = React.useRef(scenario);
  const dataRef = React.useRef(data);
  const resultsRef = React.useRef(results);

  React.useEffect(() => {
    scenarioRef.current = scenario;
    dataRef.current = data;
    resultsRef.current = results;
    isGridMountedRef.current = isGridMounted;
  }, [data, isGridMounted, results, scenario]);

  React.useEffect(() => {
    const params = new URLSearchParams();
    params.set('provider', scenario.providerMode);
    params.set('rows', String(scenario.rowCount));
    params.set('columns', String(scenario.columnCount));
    params.set('complexity', scenario.cellComplexity);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    setRowCountInput(String(scenario.rowCount));
    setColumnCountInput(String(scenario.columnCount));
  }, [scenario]);

  const visibleProviders = React.useMemo(
    () => getVisibleProviders(scenario.providerMode),
    [scenario.providerMode],
  );

  const queueMountMeasurement = React.useCallback(
    (nextScenario: BenchmarkScenario, dataGenerationMs: number) => {
      const nextRunId = mountRunIdRef.current + 1;
      mountRunIdRef.current = nextRunId;
      pendingMountRef.current = {
        heapBefore: readHeapSize(),
        providers: new Set(getVisibleProviders(nextScenario.providerMode)),
        runId: nextRunId,
        startedAt: performance.now(),
      };
      setResults(createEmptyResults(nextScenario, dataGenerationMs));
      setIsGridMounted(true);
      isGridMountedRef.current = true;
      setMountRunId(nextRunId);
    },
    [],
  );

  const applyScenario = React.useCallback(
    async (scenarioPatch: Partial<BenchmarkScenario>) => {
      const nextScenario = normalizeScenario({
        ...scenarioRef.current,
        ...scenarioPatch,
      });
      setIsGenerating(true);
      await waitForAnimationFrames(1);
      const nextData = generateBenchmarkData(nextScenario);
      scenarioRef.current = nextScenario;
      dataRef.current = nextData;
      setScenarioState(nextScenario);
      setData(nextData);
      setInteractions({
        aggrid: emptyInteraction(),
        devextreme: emptyInteraction(),
        mui: emptyInteraction(),
      });

      if (shouldAutoMountScenario(nextScenario)) {
        queueMountMeasurement(nextScenario, nextData.generationMs);
      } else {
        pendingMountRef.current = {
          heapBefore: null,
          providers: new Set(),
          runId: mountRunIdRef.current,
          startedAt: performance.now(),
        };
        setResults(createEmptyResults(nextScenario, nextData.generationMs));
        setIsGridMounted(false);
        isGridMountedRef.current = false;
      }

      setIsGenerating(false);
    },
    [queueMountMeasurement],
  );

  const commitRowCountInput = React.useCallback(() => {
    const rowCount = normalizeGridSize(rowCountInput, defaultScenario.rowCount, MAX_ROW_COUNT);

    setRowCountInput(String(rowCount));

    if (rowCount !== scenarioRef.current.rowCount) {
      applyScenario({ rowCount });
    }
  }, [applyScenario, rowCountInput]);

  const commitColumnCountInput = React.useCallback(() => {
    const columnCount = normalizeGridSize(
      columnCountInput,
      defaultScenario.columnCount,
      MAX_COLUMN_COUNT,
    );

    setColumnCountInput(String(columnCount));

    if (columnCount !== scenarioRef.current.columnCount) {
      applyScenario({ columnCount });
    }
  }, [applyScenario, columnCountInput]);

  const handleProviderReady = React.useCallback((provider: BenchmarkProvider, runId: number) => {
    const pendingMount = pendingMountRef.current;

    if (pendingMount.runId !== runId || !pendingMount.providers.has(provider)) {
      return;
    }

    const readyAt = performance.now();
    pendingMount.providers.delete(provider);

    waitForAnimationFrames(2).then(() => {
      setResults((previousResults) => {
        const previous = previousResults[provider];

        if (!previous) {
          return previousResults;
        }

        return {
          ...previousResults,
          [provider]: {
            ...previous,
            domNodeCount: countDomNodes(),
            firstGridPaintMs: performance.now() - pendingMount.startedAt,
            heapAfterMount: readHeapSize(),
            heapBeforeMount: pendingMount.heapBefore,
            mountToReadyMs: readyAt - pendingMount.startedAt,
          },
        };
      });
    });
  }, []);

  const runAction = React.useCallback(
    async (action: BenchmarkAction): Promise<ActionRunResult[]> => {
      setIsRunningAction(action);

      try {
        if (action === 'mount') {
          queueMountMeasurement(scenarioRef.current, dataRef.current.generationMs);
          await waitUntilReady();
          return getMountActionResults(action, resultsRef.current, scenarioRef.current);
        }

        if (!isGridMountedRef.current) {
          queueMountMeasurement(scenarioRef.current, dataRef.current.generationMs);
          await waitUntilReady();
        }

        const providers = [...getVisibleProviders(scenarioRef.current.providerMode)];
        const actionResults: ActionRunResult[] = [];

        for (const provider of providers) {
          const metric =
            action === 'sort' || action === 'filter'
              ? await runInteractionAction(provider, action, dataRef.current, setInteractions)
              : await runScrollAction(provider, action);
          actionResults.push({
            action,
            metric,
            provider,
            scenario: getScenarioKey(scenarioRef.current),
          });
          setResults((previousResults) =>
            mergeActionMetric(previousResults, provider, action, metric),
          );
        }

        return actionResults;
      } finally {
        setIsRunningAction(null);
      }
    },
    [queueMountMeasurement],
  );

  React.useEffect(() => {
    window.__dataGridBenchmark = {
      getResults: () => resultsRef.current,
      getScenario: () => scenarioRef.current,
      getValidation: (provider) =>
        getValidationSnapshot(provider, scenarioRef.current, dataRef.current),
      isReady: () => pendingMountRef.current.providers.size === 0,
      runAction,
      setScenario: applyScenario,
    };

    return () => {
      delete window.__dataGridBenchmark;
    };
  }, [applyScenario, runAction]);

  return (
    <main className="app-root">
      <section className="control-bar" aria-label="Benchmark controls">
        <div className="control-group">
          <label htmlFor="provider-mode">Provider</label>
          <select
            id="provider-mode"
            value={scenario.providerMode}
            onChange={(event) =>
              applyScenario({ providerMode: event.target.value as ProviderMode })
            }
          >
            {PROVIDER_MODES.map((providerMode) => (
              <option key={providerMode} value={providerMode}>
                {getProviderModeLabel(providerMode)}
              </option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label htmlFor="row-count">Rows</label>
          <input
            id="row-count"
            inputMode="numeric"
            max={MAX_ROW_COUNT}
            min={MIN_GRID_SIZE}
            onBlur={commitRowCountInput}
            onChange={(event) => setRowCountInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitRowCountInput();
              }
            }}
            step={1}
            type="number"
            value={rowCountInput}
          />
        </div>
        <div className="control-group">
          <label htmlFor="column-count">Columns</label>
          <input
            id="column-count"
            inputMode="numeric"
            max={MAX_COLUMN_COUNT}
            min={MIN_GRID_SIZE}
            onBlur={commitColumnCountInput}
            onChange={(event) => setColumnCountInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitColumnCountInput();
              }
            }}
            step={1}
            type="number"
            value={columnCountInput}
          />
        </div>
        <div className="control-group">
          <label htmlFor="cell-complexity">Cell complexity</label>
          <select
            id="cell-complexity"
            value={scenario.cellComplexity}
            onChange={(event) =>
              applyScenario({ cellComplexity: event.target.value as CellComplexity })
            }
          >
            {CELL_COMPLEXITIES.map((complexity) => (
              <option key={complexity} value={complexity}>
                {complexity}
              </option>
            ))}
          </select>
        </div>
        <div className="action-strip">
          {BENCHMARK_ACTIONS.map((action) => (
            <button
              data-testid={`action-${action}`}
              disabled={isGenerating || isRunningAction !== null}
              key={action}
              onClick={() => runAction(action)}
              type="button"
            >
              {getActionLabel(action)}
            </button>
          ))}
        </div>
      </section>

      <section className="status-strip" aria-live="polite">
        <strong>{getScenarioKey(scenario)}</strong>
        <span>
          {isGenerating ? 'Generating data' : `${data.rows.length.toLocaleString()} rows ready`}
        </span>
        <span>{data.columns.length.toLocaleString()} columns</span>
        <span>{isRunningAction ? `Running ${getActionLabel(isRunningAction)}` : 'Idle'}</span>
      </section>

      <section className={visibleProviders.length > 1 ? 'grid-area multi-provider' : 'grid-area'}>
        {visibleProviders.includes('mui') ? (
          <div className="provider-pane" key={`mui-${mountRunId}`}>
            <div className="provider-heading">
              <h2>MUI X Data Grid Premium</h2>
              <span>@mui/x-data-grid-premium {PACKAGE_VERSIONS.muiDataGridPremium}</span>
            </div>
            {isGridMounted ? (
              <MuiBenchmarkGrid
                columns={data.columns}
                interaction={interactions.mui}
                onReady={() => handleProviderReady('mui', mountRunId)}
                rows={data.rows}
              />
            ) : (
              <GridPlaceholder />
            )}
          </div>
        ) : null}
        {visibleProviders.includes('devextreme') ? (
          <div className="provider-pane" key={`devextreme-${mountRunId}`}>
            <div className="provider-heading">
              <h2>DevExtreme React DataGrid</h2>
              <span>devextreme-react {PACKAGE_VERSIONS.devextremeReact}</span>
            </div>
            {isGridMounted ? (
              <DevExtremeBenchmarkGrid
                columns={data.columns}
                interaction={interactions.devextreme}
                onReady={() => handleProviderReady('devextreme', mountRunId)}
                rows={data.rows}
              />
            ) : (
              <GridPlaceholder />
            )}
          </div>
        ) : null}
        {visibleProviders.includes('aggrid') ? (
          <div className="provider-pane" key={`aggrid-${mountRunId}`}>
            <div className="provider-heading">
              <h2>AG Grid Enterprise</h2>
              <span>ag-grid-react {PACKAGE_VERSIONS.agGrid}</span>
            </div>
            {isGridMounted ? (
              <AgGridBenchmarkGrid
                columns={data.columns}
                interaction={interactions.aggrid}
                onReady={() => handleProviderReady('aggrid', mountRunId)}
                rows={data.rows}
              />
            ) : (
              <GridPlaceholder />
            )}
          </div>
        ) : null}
      </section>

      <ResultsPanel results={results} scenario={scenario} />
    </main>
  );
}

function GridPlaceholder() {
  return <div className="grid-placeholder">Not mounted</div>;
}

function ResultsPanel({
  results,
  scenario,
}: {
  results: Record<BenchmarkProvider, ProviderResult | undefined>;
  scenario: BenchmarkScenario;
}) {
  const visibleProviders = getVisibleProviders(scenario.providerMode);

  return (
    <aside className="results-panel" aria-label="Benchmark results">
      <div className="results-header">
        <h2>Results</h2>
        <span>{getEnvironmentLabel()}</span>
      </div>
      <div className="results-grid">
        {visibleProviders.map((provider) => {
          const result = results[provider];

          return (
            <section className="result-card" key={provider}>
              <h3>{getProviderModeLabel(provider)}</h3>
              <dl>
                <MetricRow
                  label="Data generation"
                  value={formatMetric(result?.dataGenerationMs, 'ms')}
                />
                <MetricRow
                  label="Mount to ready"
                  value={formatMetric(result?.mountToReadyMs, 'ms')}
                />
                <MetricRow
                  label="Grid paint approx"
                  value={formatMetric(result?.firstGridPaintMs, 'ms')}
                />
                <MetricRow label="Heap before mount" value={formatBytes(result?.heapBeforeMount)} />
                <MetricRow label="Heap after mount" value={formatBytes(result?.heapAfterMount)} />
                <MetricRow label="DOM nodes" value={formatNumber(result?.domNodeCount)} />
              </dl>
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Duration</th>
                    <th>FPS</th>
                    <th>Worst frame</th>
                    <th>Dropped</th>
                    <th>Long tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {BENCHMARK_ACTIONS.filter((action) => action !== 'mount').map((action) => (
                    <ActionMetricRow
                      action={action}
                      key={action}
                      metric={result?.actions[action]}
                    />
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function ActionMetricRow({ action, metric }: { action: BenchmarkAction; metric?: ActionMetric }) {
  return (
    <tr>
      <td>{getActionLabel(action)}</td>
      <td>{formatMetric(metric?.durationMs, 'ms')}</td>
      <td>{formatMetric(metric?.averageFps, 'fps')}</td>
      <td>{formatMetric(metric?.worstFrameMs, 'ms')}</td>
      <td>{formatMetric(metric?.droppedFramePercent, '%')}</td>
      <td>
        {metric ? `${metric.longTaskCount} / ${formatMetric(metric.longTaskTotalMs, 'ms')}` : '-'}
      </td>
    </tr>
  );
}

async function runScrollAction(provider: BenchmarkProvider, action: BenchmarkAction) {
  return measureFrames(async () => {
    const scrollElements = getScrollElements(provider);

    if (!scrollElements.vertical && !scrollElements.horizontal) {
      return;
    }

    const verticalElement = scrollElements.vertical ?? scrollElements.horizontal;
    const horizontalElement = scrollElements.horizontal ?? scrollElements.vertical;
    const maxTop = verticalElement
      ? Math.max(0, verticalElement.scrollHeight - verticalElement.clientHeight)
      : 0;
    const maxLeft = horizontalElement
      ? Math.max(0, horizontalElement.scrollWidth - horizontalElement.clientWidth)
      : 0;
    const steps = 90;

    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;

      if (verticalElement && (action === 'verticalScroll' || action === 'diagonalScroll')) {
        verticalElement.scrollTop = maxTop * progress;
        verticalElement.dispatchEvent(new Event('scroll', { bubbles: true }));
      }

      if (horizontalElement && (action === 'horizontalScroll' || action === 'diagonalScroll')) {
        horizontalElement.scrollLeft = maxLeft * progress;
        horizontalElement.dispatchEvent(new Event('scroll', { bubbles: true }));
      }

      await waitForAnimationFrames(1);
    }
  });
}

async function runInteractionAction(
  provider: BenchmarkProvider,
  action: 'filter' | 'sort',
  data: BenchmarkData,
  setInteractions: React.Dispatch<
    React.SetStateAction<Record<BenchmarkProvider, ProviderInteractionState>>
  >,
) {
  const startedAt = performance.now();
  const targetColumn =
    action === 'sort' ? findSortColumn(data.columns) : findFilterColumn(data.columns);
  const filterValue = String(getCellValue(data.rows[0], targetColumn)).slice(0, 8);
  const metric = await measureFrames(async () => {
    setInteractions((previous) => ({
      ...previous,
      [provider]: {
        filterField: action === 'filter' ? targetColumn.field : undefined,
        filterValue: action === 'filter' ? filterValue : undefined,
        sortField: action === 'sort' ? targetColumn.field : undefined,
        version: previous[provider].version + 1,
      },
    }));
    await waitForAnimationFrames(4);
    const clearStartedAt = performance.now();
    setInteractions((previous) => ({
      ...previous,
      [provider]: {
        version: previous[provider].version + 1,
      },
    }));
    await waitForAnimationFrames(3);
    metricRecoveryRef.value = performance.now() - clearStartedAt;
  });
  metric.recoveryMs = metricRecoveryRef.value;
  metric.durationMs = performance.now() - startedAt;

  return metric;
}

const metricRecoveryRef = {
  value: 0,
};

function getScrollElements(provider: BenchmarkProvider) {
  const root = document.querySelector(`[data-benchmark-provider="${provider}"]`);

  if (!root) {
    return {};
  }

  if (provider === 'mui') {
    const element = root.querySelector<HTMLElement>('.MuiDataGrid-virtualScroller');

    return {
      horizontal: element,
      vertical: element,
    };
  }

  if (provider === 'aggrid') {
    return {
      horizontal: root.querySelector<HTMLElement>('.ag-body-horizontal-scroll-viewport'),
      vertical: root.querySelector<HTMLElement>('.ag-body-viewport'),
    };
  }

  const element =
    root.querySelector<HTMLElement>('.dx-datagrid-rowsview .dx-scrollable-container') ??
    root.querySelector<HTMLElement>('.dx-scrollable-container');

  return {
    horizontal: element,
    vertical: element,
  };
}

function getMountActionResults(
  action: BenchmarkAction,
  currentResults: Record<BenchmarkProvider, ProviderResult | undefined>,
  scenario: BenchmarkScenario,
): ActionRunResult[] {
  return [...getVisibleProviders(scenario.providerMode)].flatMap((provider) => {
    const result = currentResults[provider];

    if (!result) {
      return [];
    }

    return [
      {
        action,
        metric: {
          averageFps: null,
          domNodeCount: result.domNodeCount,
          droppedFramePercent: null,
          durationMs: result.mountToReadyMs ?? 0,
          heapAfter: result.heapAfterMount,
          heapBefore: result.heapBeforeMount,
          longTaskCount: result.longTaskCount,
          longTaskTotalMs: result.longTaskTotalMs,
          worstFrameMs: null,
        },
        provider,
        scenario: getScenarioKey(scenario),
      },
    ];
  });
}

function mergeActionMetric(
  previousResults: Record<BenchmarkProvider, ProviderResult | undefined>,
  provider: BenchmarkProvider,
  action: BenchmarkAction,
  metric: ActionMetric,
) {
  const previous = previousResults[provider];

  if (!previous) {
    return previousResults;
  }

  return {
    ...previousResults,
    [provider]: {
      ...previous,
      actions: {
        ...previous.actions,
        [action]: metric,
      },
    },
  };
}

function getValidationSnapshot(
  provider: BenchmarkProvider,
  scenario: BenchmarkScenario,
  data: BenchmarkData,
): BenchmarkValidationSnapshot {
  const expectedFirstValues = data.columns
    .filter(
      (column) => column.kind !== 'date' && column.kind !== 'dateTime' && column.kind !== 'actions',
    )
    .slice(0, 3)
    .map((column) => formatCellValue(getCellValue(data.rows[0], column)));

  return {
    columnCount: data.columns.length,
    expectedFirstValues,
    renderedTextSamples: getRenderedTextSamples(provider),
    rowCount: data.rows.length,
    scenario,
  };
}

function getRenderedTextSamples(provider: BenchmarkProvider) {
  const root = document.querySelector(`[data-benchmark-provider="${provider}"]`);
  const selector =
    provider === 'mui'
      ? '.MuiDataGrid-row .MuiDataGrid-cell'
      : provider === 'aggrid'
        ? '.ag-center-cols-container .ag-cell'
        : '.dx-datagrid-rowsview .dx-data-row td';

  return Array.from(root?.querySelectorAll<HTMLElement>(selector) ?? [])
    .slice(0, 12)
    .map((element) => element.innerText.trim())
    .filter(Boolean);
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (window.__dataGridBenchmark?.isReady()) {
      await waitForAnimationFrames(2);
      return;
    }

    await waitForAnimationFrames(1);
  }
}

function readInitialScenario(): BenchmarkScenario {
  const params = new URLSearchParams(window.location.search);

  return normalizeScenario({
    cellComplexity: params.get('complexity') as CellComplexity | null,
    columnCount: params.get('columns'),
    providerMode: params.get('provider') as ProviderMode | null,
    rowCount: params.get('rows'),
  });
}

function normalizeScenario(input: {
  cellComplexity?: CellComplexity | string | null;
  columnCount?: number | string | null;
  providerMode?: ProviderMode | string | null;
  rowCount?: number | string | null;
}): BenchmarkScenario {
  return {
    cellComplexity: CELL_COMPLEXITIES.includes(input.cellComplexity as CellComplexity)
      ? (input.cellComplexity as CellComplexity)
      : defaultScenario.cellComplexity,
    columnCount: normalizeGridSize(
      input.columnCount,
      defaultScenario.columnCount,
      MAX_COLUMN_COUNT,
    ),
    providerMode: PROVIDER_MODES.includes(input.providerMode as ProviderMode)
      ? (input.providerMode as ProviderMode)
      : defaultScenario.providerMode,
    rowCount: normalizeGridSize(input.rowCount, defaultScenario.rowCount, MAX_ROW_COUNT),
  };
}

function normalizeGridSize(value: unknown, fallback: number, max: number) {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return fallback;
  }

  const parsed = typeof value === 'string' ? Number(value.trim()) : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(MIN_GRID_SIZE, Math.floor(parsed)));
}

function shouldAutoMountScenario(scenario: BenchmarkScenario) {
  return (
    scenario.rowCount <= AUTO_MOUNT_ROW_LIMIT && scenario.columnCount <= AUTO_MOUNT_COLUMN_LIMIT
  );
}

function formatMetric(value: number | null | undefined, unit: 'fps' | 'ms' | '%') {
  if (value == null || Number.isNaN(value)) {
    return '-';
  }

  if (unit === 'fps') {
    return `${value.toFixed(1)} fps`;
  }

  if (unit === '%') {
    return `${value.toFixed(1)}%`;
  }

  return `${value.toFixed(1)} ms`;
}

function formatBytes(value: number | null | undefined) {
  if (value == null) {
    return '-';
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatNumber(value: number | null | undefined) {
  return value == null ? '-' : value.toLocaleString();
}

function getActionLabel(action: BenchmarkAction) {
  switch (action) {
    case 'mount':
      return 'Mount/render';
    case 'verticalScroll':
      return 'Vertical scroll';
    case 'horizontalScroll':
      return 'Horizontal scroll';
    case 'diagonalScroll':
      return 'Diagonal scroll';
    case 'sort':
      return 'Sort';
    case 'filter':
      return 'Filter';
    default:
      return action;
  }
}

function getProviderModeLabel(providerMode: ProviderMode) {
  switch (providerMode) {
    case 'mui':
      return 'MUI X';
    case 'devextreme':
      return 'DevExtreme';
    case 'aggrid':
      return 'AG Grid';
    case 'side-by-side':
      return 'Side-by-side';
    default:
      return providerMode;
  }
}

function getEnvironmentLabel() {
  const environment = getEnvironmentMetadata();

  return `${environment.concurrency ?? '-'} cores, DPR ${environment.devicePixelRatio}, ${environment.viewport.width}x${
    environment.viewport.height
  }`;
}

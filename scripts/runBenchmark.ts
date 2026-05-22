import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium, type Browser, type Page } from 'playwright';
import type {
  BenchmarkAction,
  BenchmarkProvider,
  CellComplexity,
  ColumnCount,
  RowCount,
} from '../src/types';
import { BENCHMARK_ACTIONS, COLUMN_COUNTS, PACKAGE_VERSIONS, ROW_COUNTS } from '../src/types';
import type { ActionRunResult } from '../src/benchmark/metrics';
import type { DataGridBenchmarkBridge } from '../src/vite-env';

declare global {
  interface Window {
    __dataGridBenchmark?: DataGridBenchmarkBridge;
  }
}

interface ScenarioRun {
  actionResults: ActionRunResult[];
  columnCount: ColumnCount;
  complexity: CellComplexity;
  environment: unknown;
  provider: BenchmarkProvider;
  repeat: number;
  rowCount: RowCount;
  validation: unknown;
}

interface ValidationSnapshot {
  columnCount: number;
  expectedFirstValues: string[];
  renderedTextSamples: string[];
  rowCount: number;
}

const dirname = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(dirname, '..');
const resultsRoot = path.join(demoRoot, 'results');
const isSmoke = process.argv.includes('--smoke');
const port = Number(process.env.PORT ?? 5178);
const baseUrl = `http://127.0.0.1:${port}`;
const providers: readonly BenchmarkProvider[] = ['mui', 'devextreme', 'aggrid'];
const complexities: readonly CellComplexity[] = ['mixed'];
const rowCounts = isSmoke ? ([100000] as const) : ROW_COUNTS;
const columnCounts = isSmoke ? ([100] as const) : COLUMN_COUNTS;
const repeats = isSmoke ? 1 : 3;
const actions: readonly BenchmarkAction[] = BENCHMARK_ACTIONS;

async function main() {
  ensureResultsRoot();
  await buildApp();
  const server = startPreviewServer();
  let browser: Browser | null = null;

  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: {
        height: 900,
        width: 1440,
      },
    });
    const runs: ScenarioRun[] = [];

    for (const complexity of complexities) {
      for (const rowCount of rowCounts) {
        for (const columnCount of columnCounts) {
          for (const provider of providers) {
            const scenarioRuns = await runScenario(
              page,
              provider,
              rowCount,
              columnCount,
              complexity,
            );
            runs.push(...scenarioRuns);
            writeScenarioResults(provider, rowCount, columnCount, complexity, scenarioRuns);
          }
        }
      }
    }

    writeSummary(runs);
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

async function runScenario(
  page: Page,
  provider: BenchmarkProvider,
  rowCount: RowCount,
  columnCount: ColumnCount,
  complexity: CellComplexity,
) {
  const scenarioRuns: ScenarioRun[] = [];
  const scenarioUrl = `${baseUrl}/?provider=${provider}&rows=${rowCount}&columns=${columnCount}&complexity=${complexity}`;

  await page.goto(scenarioUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__dataGridBenchmark?.isReady() === true, undefined, {
    timeout: 120000,
  });
  await page.evaluate(
    (action) => window.__dataGridBenchmark!.runAction(action as BenchmarkAction),
    'mount',
  );
  await page.waitForFunction(() => window.__dataGridBenchmark?.isReady() === true, undefined, {
    timeout: 120000,
  });
  await validateRenderedScenario(page, provider, rowCount, columnCount);

  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    const actionResults: ActionRunResult[] = [];

    for (const action of actions) {
      const result = await page.evaluate(
        (nextAction) => window.__dataGridBenchmark!.runAction(nextAction),
        action,
      );
      actionResults.push(...result);
    }

    scenarioRuns.push({
      actionResults,
      columnCount,
      complexity,
      environment: await page.evaluate(() => ({
        devicePixelRatio: window.devicePixelRatio,
        hardwareConcurrency: navigator.hardwareConcurrency,
        userAgent: navigator.userAgent,
        viewport: {
          height: window.innerHeight,
          width: window.innerWidth,
        },
      })),
      provider,
      repeat,
      rowCount,
      validation: await page.evaluate(
        (nextProvider) => window.__dataGridBenchmark!.getValidation(nextProvider),
        provider,
      ),
    });
  }

  return scenarioRuns;
}

async function validateRenderedScenario(
  page: Page,
  provider: BenchmarkProvider,
  rowCount: RowCount,
  columnCount: ColumnCount,
) {
  const validation = (await page.evaluate(
    (nextProvider) => window.__dataGridBenchmark!.getValidation(nextProvider),
    provider,
  )) as ValidationSnapshot;

  if (validation.rowCount !== rowCount || validation.columnCount !== columnCount) {
    throw new Error(
      `Scenario validation failed for ${provider}: expected ${rowCount} rows and ${columnCount} columns, got ${validation.rowCount} rows and ${validation.columnCount} columns.`,
    );
  }

  const renderedText = validation.renderedTextSamples.join(' ');
  const matchedValue = validation.expectedFirstValues.some((value) => renderedText.includes(value));

  if (!matchedValue) {
    throw new Error(
      `Rendered cell validation failed for ${provider}: expected one of ${validation.expectedFirstValues.join(', ')} in visible cells.`,
    );
  }
}

async function buildApp() {
  await runPnpmCommand(['exec', 'vite', 'build']);
}

function startPreviewServer() {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const server = spawn(
    command,
    ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: demoRoot,
      env: {
        ...process.env,
        BROWSER: 'none',
      },
      stdio: 'pipe',
    },
  );

  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  return server;
}

function runPnpmCommand(args: readonly string[]) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: demoRoot,
      env: process.env,
      stdio: 'pipe',
    });

    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pnpm ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);

      if (response.ok) {
        return;
      }
    } catch {
      await delay(500);
    }
  }

  throw new Error(`Timed out waiting for ${baseUrl}`);
}

function writeScenarioResults(
  provider: BenchmarkProvider,
  rowCount: RowCount,
  columnCount: ColumnCount,
  complexity: CellComplexity,
  scenarioRuns: readonly ScenarioRun[],
) {
  const filename = `${provider}-${rowCount}-${columnCount}-${complexity}.json`;
  writeFileSync(path.join(resultsRoot, filename), JSON.stringify(scenarioRuns, null, 2));
}

function writeSummary(runs: readonly ScenarioRun[]) {
  const lines = [
    '# Data Grid Performance Summary',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'Package versions:',
    '',
    `- @mui/x-data-grid-premium: ${PACKAGE_VERSIONS.muiDataGridPremium}`,
    `- devextreme: ${PACKAGE_VERSIONS.devextreme}`,
    `- devextreme-react: ${PACKAGE_VERSIONS.devextremeReact}`,
    `- ag-grid-react: ${PACKAGE_VERSIONS.agGrid}`,
    `- ag-grid-enterprise: ${PACKAGE_VERSIONS.agGridEnterprise}`,
    `- react: ${PACKAGE_VERSIONS.react}`,
    '',
    '| Provider | Scenario | Repeat | Action | Duration | FPS | Worst frame | Dropped | Long tasks |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const run of runs) {
    for (const actionResult of run.actionResults) {
      lines.push(
        [
          run.provider,
          `${run.rowCount / 1000}k x ${run.columnCount}`,
          String(run.repeat),
          actionResult.action,
          formatNumber(actionResult.metric.durationMs),
          formatNumber(actionResult.metric.averageFps),
          formatNumber(actionResult.metric.worstFrameMs),
          formatNumber(actionResult.metric.droppedFramePercent),
          String(actionResult.metric.longTaskCount),
        ].join(' | '),
      );
    }
  }

  writeFileSync(path.join(resultsRoot, 'summary.md'), `${lines.join('\n')}\n`);
}

function ensureResultsRoot() {
  if (!existsSync(resultsRoot)) {
    mkdirSync(resultsRoot, { recursive: true });
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatNumber(value: number | null | undefined) {
  return value == null ? '-' : value.toFixed(1);
}

process.on('SIGINT', () => {
  process.exit(130);
});

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

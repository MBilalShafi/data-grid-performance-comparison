import type { BenchmarkAction, BenchmarkProvider, BenchmarkScenario } from '../types';
import { getScenarioKey, getVisibleProviders } from '../data/generator';

export interface ActionMetric {
  averageFps: number | null;
  domNodeCount: number;
  droppedFramePercent: number | null;
  durationMs: number;
  heapAfter: number | null;
  heapBefore: number | null;
  longTaskCount: number;
  longTaskTotalMs: number;
  recoveryMs?: number;
  worstFrameMs: number | null;
}

export interface ProviderResult {
  actions: Partial<Record<BenchmarkAction, ActionMetric>>;
  columnCount: number;
  dataGenerationMs: number;
  domNodeCount: number;
  firstGridPaintMs: number | null;
  heapAfterMount: number | null;
  heapBeforeMount: number | null;
  longTaskCount: number;
  longTaskTotalMs: number;
  mountToReadyMs: number | null;
  provider: BenchmarkProvider;
  rowCount: number;
  scenarioKey: string;
}

export interface ActionRunResult {
  action: BenchmarkAction;
  metric: ActionMetric;
  provider: BenchmarkProvider;
  scenario: string;
}

interface LongTaskRecorder {
  read: () => { count: number; totalMs: number };
  stop: () => void;
}

export function createEmptyResults(scenario: BenchmarkScenario, dataGenerationMs: number) {
  const result: Record<BenchmarkProvider, ProviderResult | undefined> = {
    aggrid: undefined,
    devextreme: undefined,
    mui: undefined,
  };

  getVisibleProviders(scenario.providerMode).forEach((provider) => {
    result[provider] = {
      actions: {},
      columnCount: scenario.columnCount,
      dataGenerationMs,
      domNodeCount: 0,
      firstGridPaintMs: null,
      heapAfterMount: null,
      heapBeforeMount: readHeapSize(),
      longTaskCount: 0,
      longTaskTotalMs: 0,
      mountToReadyMs: null,
      provider,
      rowCount: scenario.rowCount,
      scenarioKey: getScenarioKey(scenario),
    };
  });

  return result;
}

export async function measureFrames(run: () => Promise<void>): Promise<ActionMetric> {
  const frameTimes: number[] = [];
  const longTaskRecorder = createLongTaskRecorder();
  const heapBefore = readHeapSize();
  let previousFrame = performance.now();
  let active = true;

  const tick = (time: number) => {
    if (!active) {
      return;
    }

    frameTimes.push(time - previousFrame);
    previousFrame = time;
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
  const startedAt = performance.now();
  await run();
  await waitForAnimationFrames(2);
  active = false;
  const durationMs = performance.now() - startedAt;
  const longTasks = longTaskRecorder.read();
  longTaskRecorder.stop();

  return {
    averageFps: calculateAverageFps(frameTimes),
    domNodeCount: countDomNodes(),
    droppedFramePercent: calculateDroppedFramePercent(frameTimes),
    durationMs,
    heapAfter: readHeapSize(),
    heapBefore,
    longTaskCount: longTasks.count,
    longTaskTotalMs: longTasks.totalMs,
    worstFrameMs: frameTimes.length === 0 ? null : Math.max(...frameTimes),
  };
}

export function readHeapSize() {
  const maybeMemory = performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
    };
  };

  return maybeMemory.memory?.usedJSHeapSize ?? null;
}

export function countDomNodes() {
  return document.getElementsByTagName('*').length;
}

export function waitForAnimationFrames(count: number) {
  return new Promise<void>((resolve) => {
    let remaining = count;
    const step = () => {
      remaining -= 1;

      if (remaining <= 0) {
        resolve();
        return;
      }

      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  });
}

export function getEnvironmentMetadata() {
  return {
    concurrency: navigator.hardwareConcurrency ?? null,
    devicePixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
    viewport: {
      height: window.innerHeight,
      width: window.innerWidth,
    },
  };
}

function createLongTaskRecorder(): LongTaskRecorder {
  if (!('PerformanceObserver' in window)) {
    return {
      read: () => ({ count: 0, totalMs: 0 }),
      stop: () => {},
    };
  }

  const entries: PerformanceEntry[] = [];
  let observer: PerformanceObserver | null = null;

  try {
    observer = new PerformanceObserver((list) => {
      entries.push(...list.getEntries());
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    observer = null;
  }

  return {
    read: () => ({
      count: entries.length,
      totalMs: entries.reduce((total, entry) => total + entry.duration, 0),
    }),
    stop: () => observer?.disconnect(),
  };
}

function calculateAverageFps(frameTimes: readonly number[]) {
  if (frameTimes.length === 0) {
    return null;
  }

  const averageFrameMs = frameTimes.reduce((total, value) => total + value, 0) / frameTimes.length;

  return 1000 / averageFrameMs;
}

function calculateDroppedFramePercent(frameTimes: readonly number[]) {
  if (frameTimes.length === 0) {
    return null;
  }

  const droppedFrames = frameTimes.filter((duration) => duration > 25).length;

  return (droppedFrames / frameTimes.length) * 100;
}

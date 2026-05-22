/// <reference types="vite/client" />

import type { BenchmarkAction, BenchmarkProvider, BenchmarkScenario } from './types';
import type { ActionRunResult, ProviderResult } from './benchmark/metrics';

export interface BenchmarkValidationSnapshot {
  columnCount: number;
  expectedFirstValues: string[];
  renderedTextSamples: string[];
  rowCount: number;
  scenario: BenchmarkScenario;
}

export interface DataGridBenchmarkBridge {
  getResults: () => Record<BenchmarkProvider, ProviderResult | undefined>;
  getScenario: () => BenchmarkScenario;
  getValidation: (provider: BenchmarkProvider) => BenchmarkValidationSnapshot;
  isReady: () => boolean;
  runAction: (action: BenchmarkAction) => Promise<ActionRunResult[]>;
  setScenario: (scenario: Partial<BenchmarkScenario>) => Promise<void>;
}

declare global {
  interface Window {
    __dataGridBenchmark?: DataGridBenchmarkBridge;
  }
}

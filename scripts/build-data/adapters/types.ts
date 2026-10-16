import type { BuildContext } from '../context';

export type AdapterStage = 'boundaries' | 'transport' | 'metrics';

/**
 * A data source. Adapters are run in stage order; within the metrics stage,
 * later adapters overwrite earlier ones, so real sources replace mock values.
 */
export interface Adapter {
  id: string;
  name: string;
  stage: AdapterStage;
  licensed: boolean;
  /** Return true to run, or a string explaining why the adapter is skipped. */
  available(ctx: BuildContext): true | string;
  run(ctx: BuildContext): Promise<void> | void;
}

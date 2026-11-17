import {sha256Hex} from './manifest.ts';
import type {StagedRow} from './dry-run.ts';

export function stageRecords(args: {
  sourceFilename: string;
  batchId: string;
  records: Record<string, string>[];
}): StagedRow[] {
  return args.records.map((payload, index) => {
    const rowNumber = index + 2; // 1-based file row including header
    const checksum = sha256Hex(JSON.stringify(payload));
    return {
      sourceFilename: args.sourceFilename,
      rowNumber,
      checksum,
      batchId: args.batchId,
      payload,
    };
  });
}

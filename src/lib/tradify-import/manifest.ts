import {createHash} from 'node:crypto';

export type TradifyManifestFile = {
  sha256: string;
  bytes: number;
  rows: number;
};

export type TradifyManifest = {
  batch_id: string;
  source_system: string;
  frozen_at: string;
  environment: string;
  files: Record<string, TradifyManifestFile>;
};

export function sha256Hex(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export type ManifestFileCheck = {
  filename: string;
  ok: boolean;
  expectedSha256: string;
  actualSha256: string;
  expectedBytes: number;
  actualBytes: number;
  expectedRows: number;
  actualDataRows: number;
  errors: string[];
};

export function verifyManifestFile(args: {
  filename: string;
  expected: TradifyManifestFile;
  bytes: Buffer;
  /** Count of data rows (excluding header). */
  dataRowCount: number;
}): ManifestFileCheck {
  const actualSha256 = sha256Hex(args.bytes);
  const actualBytes = args.bytes.byteLength;
  const errors: string[] = [];
  if (actualSha256 !== args.expected.sha256) {
    errors.push(
      `sha256 mismatch: expected ${args.expected.sha256}, got ${actualSha256}`,
    );
  }
  if (actualBytes !== args.expected.bytes) {
    errors.push(`byte size mismatch: expected ${args.expected.bytes}, got ${actualBytes}`);
  }
  if (args.dataRowCount !== args.expected.rows) {
    errors.push(
      `row count mismatch: expected ${args.expected.rows} data rows, got ${args.dataRowCount}`,
    );
  }
  return {
    filename: args.filename,
    ok: errors.length === 0,
    expectedSha256: args.expected.sha256,
    actualSha256,
    expectedBytes: args.expected.bytes,
    actualBytes,
    expectedRows: args.expected.rows,
    actualDataRows: args.dataRowCount,
    errors,
  };
}

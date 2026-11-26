import { randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCatalog, readPrevious, repoRoot, runCli, takeSourceArgs, validateCatalog } from './validate.mjs';

runCli(() => {
  const args = process.argv.slice(2);
  const sources = takeSourceArgs(args);
  if (args.length) throw new Error('사용법: node tools/snapshot.mjs [--sources 원문폴더 YYYYMMDD-HHmm]');
  const previous = readPrevious();
  validateCatalog(readCatalog(), previous?.catalog, { sources });
  if (!previous) {
    console.log('첫 게시 · 직전본 없음');
    return;
  }
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
  const name = kst.slice(0, 10).replaceAll('-', '') + '-' + kst.slice(11, 16).replace(':', '') + '.json';
  const history = join(repoRoot, 'history');
  mkdirSync(history, { recursive: true });
  const snapshot = join(history, name);
  const temporary = join(history, '.' + randomUUID() + '.tmp');
  try {
    writeFileSync(temporary, previous.raw, { flag: 'wx' });
    linkSync(temporary, snapshot);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (readFileSync(snapshot, 'utf8') !== previous.raw) {
      throw new Error('같은 분에 다른 직전본이 이미 저장되어 있습니다. 다음 분에 다시 실행하세요.');
    }
  } finally {
    rmSync(temporary, { force: true });
  }

  const snapshots = readdirSync(history, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^\d{8}-\d{4}\.json$/.test(entry.name))
    .map(entry => entry.name)
    .sort();
  for (const expired of snapshots.slice(0, Math.max(0, snapshots.length - 90))) {
    rmSync(join(history, expired), { force: true });
  }
  console.log('직전본 보관 · history/' + name);
});

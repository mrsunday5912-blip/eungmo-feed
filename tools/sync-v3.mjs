import { randomUUID } from 'node:crypto';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  isInstagramPostUrl, readCandidate, readPrevious, runCli, takeSourceArgs, validateCatalog,
} from './validate.mjs';

runCli(() => {
  const args = process.argv.slice(2);
  const sources = takeSourceArgs(args);
  if (args.length !== 2 || args.some(arg => arg.startsWith('-')) || basename(args[1]) !== 'catalog-v3.json') {
    throw new Error('사용법: node tools/sync-v3.mjs [--sources 원문폴더 YYYYMMDD-HHmm] <Neon 승인 v3 후보.json> <출력/catalog-v3.json>');
  }

  const base = validateCatalog(readCandidate(undefined, true), readPrevious(true)?.catalog, { sources });
  const approved = validateCatalog(readCandidate(args[0], 'v3'), null, { schemaOnly: true });
  const previous = readPrevious('v3')?.catalog;
  const instagram = approved.events.filter(event => isInstagramPostUrl(event.referenceUrl));
  const evidenceHosts = approved.officialSocial.map(row => new URL(row.evidenceUrl).hostname);
  const result = validateCatalog({
    ...base,
    format: 'eungmo-toss-v3',
    updatedAt: [base.updatedAt, approved.updatedAt, previous?.updatedAt].filter(Boolean).sort().at(-1),
    officialHosts: [...new Set([...base.officialHosts, ...evidenceHosts])],
    officialSocial: approved.officialSocial,
    events: [...base.events, ...instagram],
  }, previous, { sources });

  const output = resolve(args[1]);
  const temporary = output + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }
  console.log('v3 검사 통과 · v2 ' + base.events.length + '건 · 공식 인스타그램 ' + instagram.length + '건');
});

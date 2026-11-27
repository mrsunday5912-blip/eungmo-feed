import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { asPublicV2, readCandidate, readCatalog, readPrevious, runCli, takeSourceArgs, validateCatalog, v2Path } from './validate.mjs';

const settingsPath = fileURLToPath(new URL('../feed-settings.json', import.meta.url));

runCli(() => {
  const args = process.argv.slice(2);
  const check = args[0] === '--check';
  if (check) args.shift();
  const sources = takeSourceArgs(args);
  if (args.length > (check ? 0 : 1) || args[0]?.startsWith('-')) {
    throw new Error('사용법: node tools/sync-v2.mjs [--check] [--sources 원문폴더 YYYYMMDD-HHmm] [Neon 승인 v2 후보.json]');
  }

  const settings = readCatalog(settingsPath);
  if (typeof settings?.company !== 'boolean') throw new Error('feed-settings.json에 company 공개 스위치가 필요합니다.');
  if (!settings.company && args[0]) throw new Error('기업 행사 공개가 꺼져 있어 v2 후보를 반영할 수 없습니다.');
  const previous = readPrevious(true)?.catalog;
  const legacy = validateCatalog(readCandidate(undefined, false), readPrevious()?.catalog, { sources });
  const publicV2 = asPublicV2(legacy);
  const approved = check ? readCandidate(undefined, true) : args[0]
    ? validateCatalog(readCandidate(args[0], true), previous, { sources }) : previous;
  const companies = approved?.events.filter(event => event.source === 'company') ?? [];
  if (check && !settings.company && (companies.length || Object.keys(approved.companyHosts).length)) {
    throw new Error('기업 행사 공개가 꺼져 있습니다. 공개 v2의 기업 행사와 호스트를 비우세요.');
  }

  const generated = {
    ...publicV2,
    updatedAt: [legacy.updatedAt, previous?.updatedAt, approved?.updatedAt].filter(Boolean).sort().at(-1),
    companyHosts: settings.company ? approved?.companyHosts ?? {} : {},
    events: settings.company ? [...publicV2.events, ...companies] : publicV2.events,
  };
  if (check && !isDeepStrictEqual(approved, generated)) {
    throw new Error('공개 v2의 공공기관 목록과 호스트는 catalog.json과 일치해야 합니다.');
  }
  const result = validateCatalog(generated, previous, { sources });
  if (!check) writeFileSync(v2Path, JSON.stringify(result, null, 2) + '\n');
  console.log('공개 v2 검사 통과 · 공공기관 ' + publicV2.events.length + '건 · 기업 ' + (settings.company ? companies.length : 0) + '건');
});

import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  checkSnsAssets, checkV4Base, readCandidate, readCatalog, readPrevious, runCli, takeSourceArgs, validateCatalog,
} from './validate.mjs';

runCli(() => {
  const args = process.argv.slice(2);
  const check = args[0] === '--check';
  if (check) args.shift();
  const sources = takeSourceArgs(args);
  if (!(check && args.length === 0) &&
      (args.length !== 2 || args.some(arg => arg.startsWith('-')) || basename(args[1]) !== 'catalog-v4.json')) {
    throw new Error('사용법: node tools/sync-v4.mjs [--check] [--sources 원문폴더 YYYYMMDD-HHmm] <승인 SNS.json> <출력/catalog-v4.json>');
  }

  const base = readCandidate(undefined, 'v3');
  const previous = readPrevious('v4')?.catalog;
  if (check && args.length === 0) {
    const published = validateCatalog(readCandidate(undefined, 'v4'), previous, { sources });
    checkV4Base(published, base);
    checkSnsAssets(published);
    console.log('v4 동기화 확인 · ' + published.events.length + '건');
    return;
  }

  const approved = readCatalog(args[0]);
  if (!approved || Object.keys(approved).length !== 2 || typeof approved.updatedAt !== 'string' ||
      !Array.isArray(approved.events) || !approved.events.every(event => event?.source === 'sns')) {
    throw new Error('승인 SNS 목록에는 updatedAt과 source가 sns인 events 배열만 필요합니다.');
  }
  const updatedAt = [base.updatedAt, approved.updatedAt, previous?.updatedAt].filter(Boolean).sort().at(-1);
  const result = validateCatalog({
    ...base, format: 'eungmo-toss-v4', updatedAt, events: [...base.events, ...approved.events],
  }, previous, { sources });
  checkV4Base(result, base);
  checkSnsAssets(result);

  const output = resolve(args[1]);
  const json = JSON.stringify(result, null, 2) + '\n';
  if (check) {
    if (!readFileSync(output).equals(Buffer.from(json))) throw new Error('v4 파일이 생성 결과와 다릅니다.');
  } else {
    const temporary = output + '.' + randomUUID() + '.tmp';
    try {
      writeFileSync(temporary, json, { flag: 'wx' });
      renameSync(temporary, output);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  console.log('v4 검사 통과 · v3 ' + base.events.length + '건 · SNS ' + approved.events.length + '건');
});

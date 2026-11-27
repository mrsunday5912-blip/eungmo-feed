import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { asPublicV2, validateCatalog } from './validate.mjs';

const event = {
  id: 'example-quiz',
  title: '공공기관 퀴즈',
  organizer: '예시 기관',
  prize: '모바일 상품권 1만 원',
  startDate: '2026-11-25',
  deadline: '2026-12-03',
  deadlineTime: null,
  announcementDate: null,
  announcementMethod: '개별 안내',
  rules: '정답을 맞히면 추첨에 참여해요.',
  firstPublishedOn: '2026-11-26',
  referenceUrl: 'https://example.go.kr/notice?id=123',
  announcementUrl: null,
  resultUrl: null,
  verifiedAt: '2026-11-26',
};
const catalog = {
  format: 'eungmo-toss-v1',
  review: 'ai-double-checked',
  updatedAt: '2026-11-26T11:30:00+09:00',
  officialHosts: ['example.go.kr'],
};
const stamp = '20261126-1130';
const external = 'https://form.naver.com/response/ExampleForm';
const candidate = overrides => ({ ...catalog, events: [{ ...event, ...overrides }] });

test('optional fields preserve existing eungmo-toss-v1 catalogs', () => {
  validateCatalog(candidate());
  validateCatalog(candidate({ entryUrl: null, category: 'quiz' }));
  validateCatalog(candidate({ category: 'survey' }));
  validateCatalog(candidate({ category: 'event' }));
  assert.throws(() => validateCatalog(candidate({ category: 'other' })), /\.category/);
  assert.throws(() => validateCatalog(candidate({ category: null })), /\.category/);
  assert.throws(() => validateCatalog(candidate({ extraField: 'other' })), /정의되지 않은 필드/);
});

test('v2 requires an explicit source while v1 continues rejecting the source field', () => {
  const legacy = candidate();
  const v2 = asPublicV2(legacy);
  assert.equal(v2.events[0].source, 'public');
  validateCatalog(v2);
  assert.throws(() => validateCatalog({ ...v2, events: legacy.events }), /필수 필드/);
  assert.throws(() => validateCatalog({ ...v2, events: [{ ...event, source: 'other' }] }), /\.source/);
  assert.throws(() => validateCatalog(candidate({ source: 'public' })), /정의되지 않은 필드/);
});

test('official HTTPS entry links pass; notice fields still reject forms', () => {
  const form = 'https://example.go.kr/survey/current?id=123';
  validateCatalog(candidate({ entryUrl: form }));
  assert.throws(() => validateCatalog(candidate({ referenceUrl: form })), /\.referenceUrl/);
});

const generatedImage = {
  wide: 'images/example-quiz-wide.webp',
  square: 'images/example-quiz-square.webp',
  kind: 'ai',
  credit: 'AI 이미지',
};
const officialImage = {
  ...generatedImage,
  kind: 'official',
  credit: '이미지: 예시 기관(공공누리 제1유형)',
  sourceUrl: 'https://example.go.kr/survey/poster.jpg',
  license: 'KOGL-1',
};

test('generated images allow omitted or null source and license', () => {
  validateCatalog(candidate({ image: generatedImage }));
  validateCatalog(candidate({ image: { ...generatedImage, sourceUrl: null, license: null } }));
  assert.throws(() => validateCatalog(candidate({ image: { ...generatedImage, sourceUrl: officialImage.sourceUrl } })), /\.image\.sourceUrl/);
  assert.throws(() => validateCatalog(candidate({ image: { ...generatedImage, license: 'KOGL-1' } })), /\.image\.license/);
});

test('official images require a credit, KOGL-1 and an allowlisted HTTPS source', () => {
  validateCatalog(candidate({ image: officialImage }));
  for (const sourceUrl of [null, '', 'http://example.go.kr/poster.jpg', 'https://example.go.kr.invalid/poster.jpg',
    'https://example.go.kr:443/poster.jpg', 'https://example.go.kr/poster.jpg?email=private']) {
    assert.throws(() => validateCatalog(candidate({ image: { ...officialImage, sourceUrl } })), /\.image\.sourceUrl/);
  }
  for (const license of [null, 'KOGL-2', 'KOGL-3', 'KOGL-4']) {
    assert.throws(() => validateCatalog(candidate({ image: { ...officialImage, license } })), /\.image\.license/);
  }
  assert.throws(() => validateCatalog(candidate({ image: { ...officialImage, credit: ' ' } })), /\.image\.credit/);
});

test('both image sizes use the exact local WebP paths for the event', () => {
  for (const wide of ['https://example.go.kr/example-quiz-wide.webp', 'images/../example-quiz-wide.webp',
    'images/other-wide.webp', 'images/example-quiz-wide.png', 'images/example-quiz-wide.webp?x=1']) {
    assert.throws(() => validateCatalog(candidate({ image: { ...generatedImage, wide } })), /\.image\.wide/);
  }
  const { square, ...missingSquare } = generatedImage;
  assert.throws(() => validateCatalog(candidate({ image: missingSquare })), /\.image/);
  assert.throws(() => validateCatalog(candidate({ image: { ...generatedImage, square: generatedImage.wide } })), /\.image\.square/);
});

test('unsafe entry URL structures, personal data and trackers fail', () => {
  for (const link of [
    'http://example.go.kr/survey/current',
    'https://example.go.kr:443/survey/current',
    'https://example.go.kr@form.naver.com/response/ExampleForm',
    'https://example.go.kr/survey/current?email=example',
    'https://example.go.kr/survey/current?x=someone%2540example.org',
    'https://example.go.kr/survey/current#phone=example',
    'https://example.go.kr/survey/current?entry.543=sample',
    'https://example.go.kr/survey/current?UTM_SOURCE=share',
    'https://example.go.kr/survey/current?%2575tm_medium=share',
    'https://example.go.kr/survey/current#/form?fbclid=share',
  ]) {
    assert.throws(() => validateCatalog(candidate({ entryUrl: link })), /\.entryUrl/);
  }
});

test('an external form passes only with the exact URL in the matching official notice body', t => {
  const root = mkdtempSync(join(tmpdir(), 'eungmo-entry-test-'));
  const directory = join(root, event.id);
  const sources = { root, stamp, date: '2026-11-26' };
  const draft = candidate({ entryUrl: external });
  mkdirSync(directory);
  const file = join(directory, stamp + '.txt');
  t.after(() => {
    rmSync(file, { force: true });
    rmdirSync(directory);
    rmdirSync(root);
  });
  const write = (body, requested = event.referenceUrl) => writeFileSync(file,
    'URL: ' + requested + '\nOpenedAt: 2026-11-26T11:30:00+09:00\nFinalURL: ' + requested + '\n\n' + body);

  assert.throws(() => validateCatalog(draft, null, { sources }), /\.entryUrl/);
  write('설문 참여하기\n' + external + '-another');
  assert.throws(() => validateCatalog(draft, null, { sources }), /\.entryUrl/);
  write('설문 참여하기\n' + external, 'https://example.go.kr/notice?id=456');
  assert.throws(() => validateCatalog(draft, null, { sources }), /\.entryUrl/);
  write('설문 참여하기\n' + external);
  validateCatalog(draft, null, { sources });
  assert.throws(() => validateCatalog(draft), /\.entryUrl/);
  validateCatalog(draft, draft);
  assert.throws(() => validateCatalog(candidate({
    referenceUrl: 'https://example.go.kr/notice?id=456', entryUrl: external,
  }), draft), /\.entryUrl/);
  validateCatalog(candidate({ entryUrl: null }), draft);
});

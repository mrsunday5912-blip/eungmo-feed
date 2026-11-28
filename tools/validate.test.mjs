import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { asPublicV2, checkV4Base, validateCatalog } from './validate.mjs';

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

test('both versions reject contest categories and accept a draw with 공모 in its title', () => {
  for (const version of [value => value, asPublicV2]) {
    for (const category of ['contest', 'competition', '공모전']) {
      assert.throws(() => validateCatalog(version(candidate({ category }))), /\.category.*공모전/);
    }
    validateCatalog(version(candidate({
      title: '주민 참여 공모',
      category: 'event',
      rules: '안내를 보고 참여한 분 중에 무작위로 추첨해요.',
    })));
    validateCatalog(version(candidate({
      title: '우수사례 국민심사',
      category: 'event',
      rules: '이미 공개된 사례에 투표한 참여자 중에서 경품을 추첨해요.',
    })));
  }
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

const instagramPost = 'https://www.instagram.com/p/OfficialPost/';
const instagramAccount = 'https://www.instagram.com/example_agency/';
const evidenceUrl = 'https://example.go.kr/social';
const social = { organizer: event.organizer, platform: 'instagram', accountUrl: instagramAccount, evidenceUrl,
  postUrls: [instagramPost] };
const socialEvent = { ...event, source: 'public', category: 'quiz', referenceUrl: instagramPost, entryUrl: external };
const v3 = { ...asPublicV2(candidate()), format: 'eungmo-toss-v3', officialSocial: [social], events: [socialEvent] };

test('v3 binds each canonical post to its registered public organizer and leaves v2 strict', () => {
  const validate = data => validateCatalog(data, null, { schemaOnly: true });
  validate(v3);
  assert.throws(() => validate({ ...v3, format: 'eungmo-toss-v2' }), /정의되지 않은 필드/);
  assert.throws(() => validate(asPublicV2(candidate({ referenceUrl: instagramPost }))), /\.referenceUrl/);
  for (const patch of [
    { officialSocial: [] },
    { officialSocial: [{ ...social, organizer: '다른 주최 기관' }] },
    { officialSocial: [{ ...social, evidenceUrl: 'https://example.go.kr:443/social' }] },
    { officialSocial: [{ ...social, evidenceUrl: instagramAccount }] },
    { officialSocial: [{ ...social, accountUrl: 'https://www.instagram.com/explore/' }] },
    { officialSocial: [{ ...social, postUrls: [instagramAccount] }] },
    { events: [{ ...socialEvent, referenceUrl: 'https://www.instagram.com/p/UnknownPost/' }] },
    { events: [{ ...socialEvent, referenceUrl: instagramAccount }] },
    { events: [{ ...socialEvent, referenceUrl: instagramPost + '?igsh=tracking' }] },
    { events: [{ ...socialEvent, category: 'event' }] },
    { events: [socialEvent, { ...socialEvent, id: 'other-survey', title: '다른 이름' }] },
  ]) {
    assert.throws(() => validate({ ...v3, ...patch }), /officialSocial|\.referenceUrl|\.category/);
  }
});

test('new Instagram notices require both matching captures and the original entry URL', t => {
  const root = mkdtempSync(join(tmpdir(), 'eungmo-social-test-'));
  const directory = join(root, event.id);
  const sources = { root, stamp, date: '2026-11-26' };
  mkdirSync(directory);
  t.after(() => {
    for (const suffix of ['', '-official-social']) rmSync(join(directory, stamp + suffix + '.txt'), { force: true });
    rmdirSync(directory);
    rmdirSync(root);
  });
  const write = (suffix, url, body, final = url) => writeFileSync(join(directory, stamp + suffix + '.txt'),
    'URL: ' + url + '\nOpenedAt: 2026-11-26T11:30:00+09:00\nFinalURL: ' + final + '\n\n' + body);
  const embedded = instagramPost + 'embed/captioned/';
  const body = '게시 계정: ' + instagramAccount + '\n공식 행사에 참여하기\n' + external;
  assert.throws(() => validateCatalog(v3, null, { sources }), /공개 원문/);
  write('', embedded, body.replace(instagramAccount, 'https://www.instagram.com/other_agency/'));
  assert.throws(() => validateCatalog(v3, null, { sources }), /공개 원문/);
  write('', embedded, body, 'https://www.instagram.com/p/AnotherPost/');
  assert.throws(() => validateCatalog(v3, null, { sources }), /공개 원문/);
  write('', embedded, body);
  assert.throws(() => validateCatalog(v3, null, { sources }), /동일한 공식 계정/);
  write('-official-social', evidenceUrl, '공식 SNS: ' + instagramAccount);
  validateCatalog(v3, null, { sources });
  validateCatalog(v3, v3);
  assert.throws(() => validateCatalog({ ...v3, events: [{ ...socialEvent, entryUrl: external + 'Other' }] }, v3, { sources }),
    /\.entryUrl/);
});

test('v4 keeps v3 intact and rejects unavailable evidence, disallowed participation, and elapsed KST deadlines', t => {
  const root = mkdtempSync(join(tmpdir(), 'eungmo-sns-test-'));
  const directory = join(root, 'sns-draw');
  const sources = { root, stamp, date: '2026-11-26' };
  t.after(() => {
    for (const suffix of ['', '-official-social']) {
      for (const ext of ['.txt', '.png']) rmSync(join(directory, stamp + suffix + ext), { force: true });
    }
    rmdirSync(directory);
    rmdirSync(root);
  });
  mkdirSync(directory);
  const accountUrl = 'https://www.youtube.com/@OfficialOrg';
  const referenceUrl = 'https://www.youtube.com/watch?v=ExampleVid1';
  const sns = {
    platform: 'youtube', accountName: '기관 공식 채널', accountUrl, evidenceKind: 'official-site', evidenceUrl,
    methods: ['watch', 'comment'], commentTopic: '시청 소감', winnerCount: 10,
  };
  const row = {
    ...event, id: 'sns-draw', title: '댓글 이벤트', source: 'sns', category: 'event', referenceUrl,
    rules: '영상 시청 후 댓글을 남기면 추첨에 참여해요.',
    image: { wide: 'images/sns-draw-wide.webp', square: 'images/sns-draw-square.webp', kind: 'ai', credit: 'AI 이미지' }, sns,
  };
  const draft = override => ({ ...v3, format: 'eungmo-toss-v4', events: [...v3.events, { ...row, ...override }] });
  const check = (override, now = Date.parse('2026-11-26T11:30:00+09:00')) =>
    validateCatalog(draft(override), null, { sources, now });
  const source = (suffix, url, body) => {
    writeFileSync(join(directory, stamp + suffix + '.txt'),
      'URL: ' + url + '\nOpenedAt: 2026-11-26T11:30:00+09:00\nFinalURL: ' + url + '\n\n' + body);
    writeFileSync(join(directory, stamp + suffix + '.png'), 'test capture');
  };
  assert.throws(() => check(), /게시 계정/);
  source('', referenceUrl, '게시 계정: ' + accountUrl + '\n' + row.rules);
  assert.throws(() => check(), /공식 연결/);
  source('-official-social', evidenceUrl, '공식 연결 계정: ' + accountUrl);
  check();
  checkV4Base(draft(), v3);
  assert.throws(() => checkV4Base({ ...draft(), events: [row] }, v3), /v3 전체/);
  assert.throws(() => check({ sns: { ...sns, platform: 'tiktok' } }), /sns\.platform/);
  assert.throws(() => check({ sns: { ...sns, evidenceUrl: undefined } }), /sns\.evidenceUrl/);
  for (const rules of ['구매 필수', '결제 후 댓글', '앱 설치 후 참여', '전화번호를 댓글로 남겨 주세요.']) {
    assert.throws(() => check({ rules }), /rules.*구매·결제/);
  }
  assert.throws(() => check({ deadlineTime: '11:29', deadline: '2026-11-26' }), /deadline.*마감/);
  assert.throws(() => check({}, Date.parse('2026-12-04T00:00:00+09:00')), /deadline.*마감/);
  source('', referenceUrl, '게시 계정: ' + accountUrl + '\n앱 설치 후 참여');
  assert.throws(() => check(), /referenceUrl.*앱 설치/);
});

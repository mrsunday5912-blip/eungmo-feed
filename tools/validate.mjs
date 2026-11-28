import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const catalogPath = fileURLToPath(new URL('../catalog.json', import.meta.url));
export const v2Path = fileURLToPath(new URL('../catalog-v2.json', import.meta.url));
const v3Path = fileURLToPath(new URL('../catalog-v3.json', import.meta.url));
const v4Path = fileURLToPath(new URL('../catalog-v4.json', import.meta.url));
const catalogFields = ['format', 'review', 'updatedAt', 'officialHosts', 'events'];
const textFields = ['title', 'organizer', 'prize', 'announcementMethod', 'rules'];
const dateFields = ['startDate', 'deadline', 'announcementDate', 'firstPublishedOn', 'verifiedAt'];
const urlFields = ['referenceUrl', 'announcementUrl', 'resultUrl'];
const requiredEventFields = ['id', ...textFields, ...dateFields, 'deadlineTime', ...urlFields];
const optionalEventFields = ['entryUrl', 'category', 'image'];
export const eventFields = [...requiredEventFields, ...optionalEventFields];

const idPattern = /^[a-z0-9][a-z0-9-]{0,95}$/;
const datePattern = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\+09:00$/;
const hostPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const nonOfficialHost = /(^|\.)(forms\.gle|docs\.google\.com|forms\.office\.com|form\.naver\.com|naver\.me|bit\.ly|linktr\.ee|instagram\.com|kakao\.com)$/;
const socialHost = /(^|\.)(instagram\.com|facebook\.com|fb\.com|threads\.(?:net|com)|twitter\.com|x\.com|tiktok\.com|youtube\.com|youtu\.be|blog\.naver\.com|cafe\.naver\.com|pf\.kakao\.com)$/;
const instagramAccount = /^https:\/\/www\.instagram\.com\/[a-z\d_][a-z\d_.]{0,29}\/$/;
const instagramReserved = /^https:\/\/www\.instagram\.com\/(?:about|accounts|api|challenge|developer|direct|explore|legal|p|reel|reels|stories|tv|web)\/$/;
const youtubeAccount = /^https:\/\/www\.youtube\.com\/(?:@[A-Za-z\d_.-]{3,30}|channel\/UC[A-Za-z\d_-]{22})$/;
const youtubePost = /^https:\/\/www\.youtube\.com\/(?:watch\?v=[A-Za-z0-9_-]{11}|shorts\/[A-Za-z0-9_-]{11}|post\/Ug[A-Za-z0-9_-]{12,80})$/;
const snsHosts = /(^|\.)(instagram\.com|youtube\.com|youtu\.be)$/;
const snsMethods = new Set(['follow', 'like', 'comment', 'subscribe', 'watch', 'tag', 'share']);
const snsProofBase = 'https://mrsunday5912-blip.github.io/eungmo-feed/images/';
const paidParticipation = /(?:참가비|응모비|참여비|유료\s*(?:회원|가입|결제)|구매\s*(?:조건|필수|후|고객|인증|영수증|하신)|결제\s*(?:조건|필수|후|인증)|(?:구매|결제|입금|충전)(?:를|을)?\s*(?:해야|하셔야)|영수증\s*(?:인증|제출)|구매자\s*대상)/iu;
const snsRestricted = [
  paidParticipation,
  /(?:앱|어플(?:리케이션)?)\s*(?:을|를|의)?\s*(?:설치|다운로드)\s*(?:가|는|는\s*것이)?\s*(?:필수|후|해야|한\s*뒤|하고|인증)|(?:다운로드|설치)\s*(?:한\s*뒤|후|인증)/iu,
  /(?:댓글|코멘트)[^.!?\n]{0,80}(?:개인\s*정보|이름|성명|연락처|전화번호|휴대폰\s*번호|핸드폰\s*번호|주소|이메일)(?:[^.!?\n]{0,35}(?:남기|남겨|기재|입력|적어|공개|작성|제출))|(?:개인\s*정보|이름|성명|연락처|전화번호|휴대폰\s*번호|핸드폰\s*번호|주소|이메일)[^.!?\n]{0,45}(?:댓글|코멘트)(?:로|에)?\s*(?:남기|남겨|기재|입력|적어|공개|작성|제출)/iu,
  /(?:purchase|payment|app\s+install)\s+(?:is\s+)?required|comment\s+(?:with\s+)?(?:your\s+)?(?:phone|email|address|full name)/iu,
];
const companyRestrictedText = [
  paidParticipation,
  /(?:(?:회원\s*)?가입|로그인|구독)(?:이|을|를)?\s*(?:조건|필수|필요|후|해야|하신|한\s*뒤|완료\s*(?:후|인증))|회원\s*(?:만|전용|대상)|기존\s*회원에\s*한/iu,
  /(?:팔로우|팔로잉|댓글|리그램|리트윗|친구\s*태그|좋아요)\s*(?:달기|달면|남기|남긴|작성|필수|인증|후|하기|하고|해\s*주|이벤트|를\s*달|을\s*달)|(?:구독자|팔로워)\s*(?:대상|전용)/iu,
  /(?:도박|사행성|베팅|배팅|카지노|스포츠\s*토토|복권\s*(?:구매|판매)|현금\s*충전)/iu,
];

const companyRestrictedPath = /(?:^|\/)(?:login|signin|sign-in|signup|sign-up|join|register|checkout|payment|purchase|cart|buy|order|redirect)(?:[._-][\w.-]*|[A-Z][\w.-]*)?(?:\/|$)/;
const formPath = /\/(?:survey|vote|apply|entry|login|redirect)(?:\/|[a-z0-9_.-]|$)/i;
const categories = new Set(['quiz', 'survey', 'event']);
const trackingQueryKey = /^(?:utm_.*|_ga(?:_.*)?|_gl|fbclid|gclid|gclsrc|dclid|msclkid|ttclid|twclid|igsh(?:id)?|mc_[ce]id|mkt_tok|yclid|wbraid|gbraid|si|spm|ref(?:_src|errer)?|tracking(?:[_-]id)?)$/i;
const entryPrivateQueryKey = /^(?:entry\.\d+|first[\s_-]*name|last[\s_-]*name|user[\s_-]*id|session(?:[\s_-]*id)?|(?:access|refresh|id)[\s_-]*token|token)$/i;
const controls = /[\u0000-\u001f\u007f-\u009f\p{Cf}]/u;
const piiPatterns = [
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u,
  /(?<!\d)(?:\+?82[- .]?\(?0?\)?|0)(?:1[016789]|2|[3-6][1-5]|70|50[2-8])[- .)]*\d{3,4}[- .]?\d{4}(?!\d)/,
  /(?<!\d)\d{6}[- ]?[1-8]\d{6}(?!\d)/,
  /(?:이름|성명|담당자|당첨자\s*(?:명단)?|신청자|참여자|full[\s_-]*name|winner)\s*[:=：]\s*[\p{L}*○●□]{2,}/iu,
  /(?:이름|성명|담당자)\s+[가-힣]{2,4}(?=\s*(?:[,/·]|$))/u,
  /(?:^|[^\p{L}])[가-힣][*○●□]{1,2}[가-힣]?(?![\p{L}])/u,
  /[가-힣]{2,4}\s*님(?![\p{L}])/u,
  /(?:쿠폰|인증|개인식별)\s*(?:번호|코드)\s*[:=：]\s*[a-z0-9-]{4,}/i,
];
const privateQueryKey = /^(?:name|full[\s_-]*name|email|e-mail|phone|mobile|telephone|tel|contact|resident[\s_-]*id|coupon[\s_-]*(?:code|number)|이름|성명|이메일|전화번호|휴대전화|연락처|주민등록번호)$/i;

function requireCondition(condition, field, rule) {
  if (!condition) throw new Error(field + ': ' + rule);
}

function checkFields(value, fields, path, optional = []) {
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), path, 'JSON 객체가 필요합니다.');
  requireCondition(Object.keys(value).every(key => fields.includes(key) || optional.includes(key)), path, '정의되지 않은 필드가 있습니다.');
  requireCondition(fields.every(key => Object.hasOwn(value, key)), path, '필수 필드가 누락되었습니다.');
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function checkPrivacy(value, field) {
  const normalized = value.normalize('NFKC');
  requireCondition(!controls.test(normalized), field, '제어 문자 또는 보이지 않는 문자를 넣을 수 없습니다.');
  requireCondition(!piiPatterns.some(pattern => pattern.test(normalized)), field, '개인정보 형식의 문자열이 있습니다.');
}

function checkEntryParameter(key, value, field) {
  while (true) {
    checkPrivacy(key, field);
    checkPrivacy(value, field);
    const normalizedKey = key.normalize('NFKC').trim();
    requireCondition(!privateQueryKey.test(normalizedKey) && !entryPrivateQueryKey.test(normalizedKey),
      field, '개인정보용 URL 매개변수를 넣을 수 없습니다.');
    requireCondition(!trackingQueryKey.test(normalizedKey), field, '추적용 URL 매개변수를 넣을 수 없습니다.');
    if (!/%[a-f0-9]{2}/i.test(key + value)) return;
    key = decodeURIComponent(key);
    value = decodeURIComponent(value);
  }
}

function checkUrl(value, hosts, field, purpose = 'notice') {
  if (value === null) return null;
  const isEntry = purpose === 'entry';
  requireCondition(
    typeof value === 'string' && value.length <= 2048 && /^https:\/\/[^/]/.test(value) && !/[\s\\]/.test(value),
    field, '공식 HTTPS 주소가 필요합니다.',
  );
  let url;
  let decodedPath;
  let decodedHash;
  try {
    url = new URL(value);
    decodedPath = decodeURIComponent(url.pathname);
    decodedHash = decodeURIComponent(url.hash);
  } catch {
    throw new Error(field + ': 주소 형식이 잘못되었습니다.');
  }
  const authority = value.slice(8).split(/[/?#]/, 1)[0];
  requireCondition(authority === url.hostname && hostPattern.test(authority), field, '사용자 정보나 포트가 없는 정확한 호스트가 필요합니다.');
  requireCondition(isEntry || hosts.has(url.hostname), field, 'officialHosts의 정확한 호스트가 필요합니다.');
  requireCondition(purpose !== 'notice' || !formPath.test(decodedPath), field, '응모·로그인·리디렉션 주소는 넣을 수 없습니다.');
  checkPrivacy(value, field);
  checkPrivacy(decodedPath, field);
  checkPrivacy(decodedHash, field);
  const parameters = [...url.searchParams];
  if (isEntry) {
    const fragment = decodedHash.slice(1);
    parameters.push(...new URLSearchParams(fragment.includes('?') ? fragment.split('?').at(-1) : fragment));
  }
  for (const [key, part] of parameters) {
    if (isEntry) {
      checkEntryParameter(key, part, field);
    } else {
      requireCondition(!privateQueryKey.test(key), field, '개인정보용 URL 매개변수를 넣을 수 없습니다.');
      checkPrivacy(key, field);
      checkPrivacy(part, field);
    }
  }
  return url;
}

function checkImage(image, eventId, hosts, path) {
  checkFields(image, ['wide', 'square', 'kind', 'credit'], path, ['sourceUrl', 'license']);
  for (const size of ['wide', 'square']) {
    requireCondition(image[size] === `images/${eventId}-${size}.webp`, `${path}.${size}`,
      '행사 ID와 크기에 맞는 상대 WebP 경로가 필요합니다.');
  }
  requireCondition(image.kind === 'official' || image.kind === 'ai', path + '.kind', 'official 또는 ai가 필요합니다.');
  requireCondition(typeof image.credit === 'string' && image.credit.trim() && image.credit.length <= 180,
    path + '.credit', '1~180자의 이미지 출처 표시가 필요합니다.');
  checkPrivacy(image.credit, path + '.credit');
  if (image.kind === 'official') {
    requireCondition(image.license === 'KOGL-1', path + '.license', '공공누리 제1유형만 허용합니다.');
    requireCondition(image.sourceUrl, path + '.sourceUrl', '공식 원본 주소가 필요합니다.');
    checkUrl(image.sourceUrl, hosts, path + '.sourceUrl', 'image');
  } else {
    for (const field of ['sourceUrl', 'license']) {
      requireCondition(!Object.hasOwn(image, field) || image[field] === null, `${path}.${field}`,
        'AI 이미지는 이 필드를 비워 두세요.');
    }
  }
}

export function takeSourceArgs(args) {
  if (args[0] !== '--sources') return undefined;
  const [, root, stamp] = args.splice(0, 3);
  requireCondition(root && /^\d{8}-\d{4}$/.test(stamp ?? ''), '--sources', '원문 폴더와 수집 시각 YYYYMMDD-HHmm이 필요합니다.');
  const date = stamp.slice(0, 8).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  requireCondition(isCalendarDate(date) && timePattern.test(stamp.slice(9).replace(/^(\d{2})(\d{2})$/, '$1:$2')),
    '--sources', '실제 수집 날짜와 시각이 필요합니다.');
  return { root: resolve(root), stamp, date };
}

function sourceCapture(event, sources, suffix = '') {
  if (!sources) return null;
  const directory = resolve(sources.root, event.id);
  const file = resolve(directory, sources.stamp + suffix + '.txt');
  if (!lstatSync(directory, { throwIfNoEntry: false })?.isDirectory()) return null;
  const info = lstatSync(file, { throwIfNoEntry: false });
  if (!info?.isFile() || info.size > 128 * 1024) return null;
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  const capture = /^URL: ([^\r\n]+)\r?\nOpenedAt: ([^\r\n]+)\r?\nFinalURL: ([^\r\n]+)\r?\n\r?\n([\s\S]*)$/.exec(raw);
  if (!capture) return null;
  const [, requested, openedAt, final, body] = capture;
  if (!timestampPattern.test(openedAt) || openedAt.slice(0, 10) !== sources.date) return null;
  return { requested, final, body };
}

function noticeBody(event, hosts, sources) {
  const capture = sourceCapture(event, sources);
  if (!capture) return null;
  const { requested, final, body } = capture;
  try {
    for (const address of [requested, final]) {
      const url = new URL(address);
      if (!address.startsWith('https://') || /[\s\\]/.test(address) || !hosts.has(url.hostname)
        || address.slice(8).split(/[/?#]/, 1)[0] !== url.hostname) return null;
    }
    if (event.referenceUrl && new URL(requested).href !== new URL(event.referenceUrl).href) return null;
  } catch {
    return null;
  }
  return body;
}

function entryInNotice(event, hosts, sources) {
  return noticeBody(event, hosts, sources)?.split(/\s+/u).includes(event.entryUrl);
}

function checkCompanyText(value, path) {
  const normalized = value.normalize('NFKC')
    .replace(/(?:참가비|응모비|참여비)(?:는|가|\s*[:=])?\s*(?:없|무료|0\s*원)\S*/gu, '');
  requireCondition(!companyRestrictedText.some(pattern => pattern.test(normalized)),
    path, '참가비·구매·결제·가입·SNS 참여·사행성 조건은 넣을 수 없습니다.');
}

function eventIdentity(event) {
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return normalize(event.organizer) + '|' + normalize(event.title);
}

export function isInstagramPostUrl(value) {
  return typeof value === 'string' && /^https:\/\/www\.instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]{5,32}\/$/.test(value) &&
    new URL(value).href === value;
}

function checkSnsConditions(text, path) {
  const normalized = text.normalize('NFKC')
    .replace(/(?:참가비|응모비|참여비)(?:는|가|\s*[:=])?\s*(?:없|무료|0\s*원)\S*/gu, '')
    .replace(/(?:구매|결제|앱\s*설치|다운로드)(?:는|가|이)?\s*(?:없이|불필요|필요\s*없\S*)/gu, '');
  requireCondition(!snsRestricted.some(pattern => pattern.test(normalized)), path,
    '구매·결제·앱 설치 또는 개인정보를 공개 댓글에 적는 조건은 넣을 수 없습니다.');
}

function checkSnsCapture(event, sources, path) {
  const { accountUrl, evidenceUrl, evidenceKind } = event.sns;
  const notice = sourceCapture(event, sources);
  const post = event.referenceUrl;
  const samePost = url => url === post || (event.sns.platform === 'instagram' && url === post + 'embed/captioned/');
  const author = '게시 계정: ' + accountUrl;
  requireCondition(notice && samePost(notice.requested) && samePost(notice.final) &&
    notice.body.split(/\r?\n/, 1)[0] === author && notice.body.slice(author.length).trim(),
  path + '.referenceUrl', '공개 게시물과 게시 계정이 일치하는 원문이 필요합니다.');
  const proof = sourceCapture(event, sources, '-official-social');
  const accountLine = (evidenceKind === 'official-site' ? '공식 연결 계정: ' : '인증 표시 계정: ') + accountUrl;
  const proofPage = evidenceKind === 'official-site' ? evidenceUrl : accountUrl;
  requireCondition(proof && proof.requested === proofPage && proof.final === proofPage &&
    proof.body.split(/\r?\n/).includes(accountLine),
  path + '.sns.evidenceUrl', '공식 연결 또는 플랫폼 인증 표시를 대조한 원문이 필요합니다.');
  for (const suffix of ['', '-official-social']) {
    const file = resolve(sources.root, event.id, sources.stamp + suffix + '.png');
    requireCondition(lstatSync(file, { throwIfNoEntry: false })?.isFile(),
      path + '.sns.evidenceUrl', '공개 게시물과 공식 계정 근거 화면이 모두 필요합니다.');
  }
  checkSnsConditions(notice.body, path + '.referenceUrl');
}

function checkSnsEvent(event, hosts, path, former, { sources, schemaOnly, now }) {
  checkFields(event, [...requiredEventFields, 'source', 'category', 'image', 'sns'], path, ['entryUrl']);
  const { sns, source, referenceUrl, ...base } = event;
  const { id } = event;
  requireCondition(event.category === 'event' && event.announcementUrl === null && event.resultUrl === null &&
    event.entryUrl == null && isCalendarDate(event.deadline), path,
  'SNS 행사는 event 분류와 확정된 마감일이 필요합니다. 응모 주소는 referenceUrl에만 적으세요.');
  validateCatalog({
    format: 'eungmo-toss-v1', review: 'ai-double-checked', updatedAt: '2000-01-01T00:00:00+09:00',
    officialHosts: [...hosts], events: [{ ...base, referenceUrl: null }],
  }, null, { schemaOnly: true });
  checkFields(sns, ['platform', 'accountName', 'accountUrl', 'evidenceKind', 'evidenceUrl', 'methods', 'commentTopic', 'winnerCount'],
    path + '.sns');
  requireCondition(sns.platform === 'instagram' || sns.platform === 'youtube', path + '.sns.platform', 'instagram 또는 youtube만 허용합니다.');
  requireCondition(sns.platform === 'instagram' ? isInstagramPostUrl(referenceUrl) :
    typeof referenceUrl === 'string' && youtubePost.test(referenceUrl),
  path + '.referenceUrl', '같은 플랫폼의 표준 HTTPS 게시물 주소가 필요합니다.');
  requireCondition(typeof sns.accountUrl === 'string' && (sns.platform === 'instagram'
    ? instagramAccount.test(sns.accountUrl) && !instagramReserved.test(sns.accountUrl) : youtubeAccount.test(sns.accountUrl)),
  path + '.sns.accountUrl', '같은 플랫폼의 표준 HTTPS 계정 주소가 필요합니다.');
  requireCondition(Array.isArray(sns.methods) && sns.methods.length && new Set(sns.methods).size === sns.methods.length &&
    sns.methods.every(method => snsMethods.has(method)), path + '.sns.methods', '정의된 참여 방법을 중복 없이 하나 이상 적으세요.');
  requireCondition(sns.winnerCount === null || (Number.isSafeInteger(sns.winnerCount) && sns.winnerCount > 0),
    path + '.sns.winnerCount', '당첨 인원은 양의 정수 또는 미공개 시 null입니다.');
  requireCondition(typeof sns.accountName === 'string' && sns.accountName.trim() && sns.accountName.length <= 180,
    path + '.sns.accountName', '공식 계정 이름이 필요합니다.');
  requireCondition(sns.commentTopic === null || (sns.methods.includes('comment') && typeof sns.commentTopic === 'string' &&
    sns.commentTopic.trim() && sns.commentTopic.length <= 1800), path + '.sns.commentTopic', '댓글 주제를 적거나 null로 두세요.');
  for (const [field, value] of Object.entries({ accountName: sns.accountName, commentTopic: sns.commentTopic })) {
    if (value !== null) {
      checkPrivacy(value, path + '.sns.' + field);
      requireCondition(!/\b(?:[a-z][a-z0-9+.-]*:\s*\/\/|www\.|mailto:|tel:)/i.test(value.normalize('NFKC')),
        path + '.sns.' + field, '주소는 주소 필드에만 넣으세요.');
    }
  }
  if (sns.evidenceKind === 'platform-verification') {
    requireCondition(sns.evidenceUrl === snsProofBase + id + '-verification.webp', path + '.sns.evidenceUrl',
      '플랫폼 인증 표시 캡처의 공개 피드 이미지 주소가 필요합니다.');
  } else {
    requireCondition(sns.evidenceKind === 'official-site' && typeof sns.evidenceUrl === 'string',
      path + '.sns.evidenceUrl', '공식 누리집 연결 또는 플랫폼 인증 표시 근거가 필요합니다.');
    const evidence = checkUrl(sns.evidenceUrl, new Set(), path + '.sns.evidenceUrl', 'entry');
    const evidenceHost = evidence.hostname;
    requireCondition(!socialHost.test(evidenceHost) && !nonOfficialHost.test(evidenceHost),
      path + '.sns.evidenceUrl', '주최 공식 누리집 페이지가 필요합니다.');
    checkUrl(sns.evidenceUrl, new Set([evidenceHost]), path + '.sns.evidenceUrl');
  }
  checkSnsConditions([event.title, event.rules, sns.commentTopic].join('\n'), path + '.rules');
  if (!schemaOnly) {
    const deadline = Date.parse(event.deadline + 'T' + (event.deadlineTime ?? '23:59') + ':59.999+09:00');
    requireCondition(deadline >= now, path + '.deadline', '마감이 지난 SNS 행사는 실을 수 없습니다.');
    if (!isDeepStrictEqual(event, former)) checkSnsCapture(event, sources, path);
  }
}

function validateV4(catalog, previous, options) {
  requireCondition(Array.isArray(catalog.events), 'events', '행사 배열이 필요합니다.');
  const { events, ...base } = catalog;
  const legacy = events.filter(event => event?.source !== 'sns');
  validateCatalog({ ...base, format: 'eungmo-toss-v3', events: legacy }, null, { schemaOnly: true });
  requireCondition(legacy.every((event, index) => events[index] === event), 'events', 'v3 다음에 SNS 행사를 넣으세요.');
  requireCondition(catalog.officialHosts.every(host => !snsHosts.test(host)), 'officialHosts', 'SNS 호스트는 등록할 수 없습니다.');
  for (const event of legacy) {
    const urls = [event.entryUrl, event.announcementUrl, event.resultUrl, event.image?.sourceUrl,
      isInstagramPostUrl(event.referenceUrl) ? null : event.referenceUrl];
    requireCondition(urls.every(url => !url || !snsHosts.test(new URL(url).hostname)),
      'events', '기존 공식 인스타그램 공고 외에는 SNS 호스트를 SNS 행사에서만 사용하세요.');
  }
  const ids = new Set(legacy.map(event => event.id));
  const identities = new Set(legacy.map(eventIdentity));
  const posts = new Set(legacy.map(event => event.referenceUrl).filter(Boolean));
  const previousSns = previous?.events.filter(event => event.source === 'sns') ?? [];
  const previousById = new Map(previousSns.map(event => [event.id, event]));
  const previousByPost = new Map(previousSns.map(event => [event.referenceUrl, event.id]));
  const previousByIdentity = new Map(previousSns.map(event => [eventIdentity(event), event.id]));
  const rows = events.slice(legacy.length);
  requireCondition(rows.length <= 80, 'events', 'SNS 행사는 최대 80건입니다.');
  const hosts = new Set(catalog.officialHosts);
  for (const [index, event] of rows.entries()) {
    const path = 'events[' + (legacy.length + index) + ']';
    const former = previousById.get(event.id);
    checkSnsEvent(event, hosts, path, former, options);
    const identity = eventIdentity(event);
    requireCondition(!ids.has(event.id) && !posts.has(event.referenceUrl) && !identities.has(identity),
      path, '같은 ID, 게시물 또는 주최·제목이 중복되었습니다.');
    requireCondition([previousByPost.get(event.referenceUrl), previousByIdentity.get(identity)]
      .every(id => !id || id === event.id), path + '.id', '기존 SNS 행사의 ID를 바꿀 수 없습니다.');
    if (former) {
      requireCondition(event.firstPublishedOn === former.firstPublishedOn && event.verifiedAt >= former.verifiedAt,
        path, '최초 게시일을 바꾸거나 직전 확인일을 앞당길 수 없습니다.');
    }
    ids.add(event.id);
    identities.add(identity);
    posts.add(event.referenceUrl);
  }
  return catalog;
}

export function checkV4Base(catalog, base) {
  const { updatedAt, events, format, ...fields } = catalog;
  const legacy = { ...fields, format: base.format, updatedAt: base.updatedAt, events: events.filter(event => event.source !== 'sns') };
  requireCondition(updatedAt >= base.updatedAt && isDeepStrictEqual(legacy, base),
    'catalog-v4', '현재 v3 전체가 그대로 필요합니다.');
}

export function checkSnsAssets(catalog) {
  for (const event of catalog.events.filter(event => event.source === 'sns')) {
    const files = [event.image.wide, event.image.square];
    if (event.sns.evidenceKind === 'platform-verification') files.push('images/' + event.id + '-verification.webp');
    for (const file of files) {
      const image = lstatSync(resolve(repoRoot, file), { throwIfNoEntry: false });
      requireCondition(image?.isFile() && image.size > 0 && image.size <= 150 * 1024, file, '150KB 이하 WebP 파일이 필요합니다.');
    }
  }
}

function checkOfficialSocial(entries, hosts) {
  requireCondition(Array.isArray(entries), 'officialSocial', '공식 SNS 계정 배열이 필요합니다.');
  const accounts = new Set();
  const posts = new Map();
  for (const [index, row] of entries.entries()) {
    const path = 'officialSocial[' + index + ']';
    checkFields(row, ['organizer', 'platform', 'accountUrl', 'evidenceUrl', 'postUrls'], path);
    requireCondition(typeof row.organizer === 'string' && row.organizer.trim() && row.organizer.length <= 1800,
      path + '.organizer', '기관 이름이 필요합니다.');
    checkPrivacy(row.organizer, path + '.organizer');
    requireCondition(row.platform === 'instagram', path + '.platform', 'instagram만 허용합니다.');
    requireCondition(typeof row.accountUrl === 'string' && instagramAccount.test(row.accountUrl) &&
      !instagramReserved.test(row.accountUrl) && new URL(row.accountUrl).href === row.accountUrl && !accounts.has(row.accountUrl),
      path + '.accountUrl', '중복 없는 공식 인스타그램 프로필 주소가 필요합니다.');
    accounts.add(row.accountUrl);
    const evidence = checkUrl(row.evidenceUrl, hosts, path + '.evidenceUrl');
    requireCondition(evidence && !socialHost.test(evidence.hostname) && !/%(?![a-f\d]{2})/i.test(row.evidenceUrl),
      path + '.evidenceUrl', '기관 누리집의 공식 SNS 연결 페이지 주소가 필요합니다.');
    requireCondition(Array.isArray(row.postUrls) && row.postUrls.length, path + '.postUrls', '승인된 게시물 주소 배열이 필요합니다.');
    for (const url of row.postUrls) {
      requireCondition(isInstagramPostUrl(url) && !posts.has(url), path + '.postUrls',
        '중복 없는 인스타그램 게시물 또는 릴스 주소가 필요합니다.');
      posts.set(url, row);
    }
  }
  return posts;
}

function socialNoticeBody(event, account, sources, path) {
  const capture = sourceCapture(event, sources);
  const post = event.referenceUrl;
  // Instagram의 로그인 없는 공개 캡션 화면도 같은 게시물의 원문으로 사용할 수 있어요.
  const isPostCapture = url => url === post || url === post + 'embed/captioned/';
  const author = '게시 계정: ' + account.accountUrl;
  requireCondition(capture && isPostCapture(capture.requested) && isPostCapture(capture.final) &&
    capture.body.split(/\r?\n/).includes(author) && capture.body.replace(author, '').trim(),
    path + '.referenceUrl', '같은 게시물의 공개 원문과 공식 게시 계정 주소가 필요합니다.');
  const evidence = sourceCapture(event, sources, '-official-social');
  requireCondition(evidence && evidence.requested === account.evidenceUrl && evidence.final === account.evidenceUrl &&
    evidence.body.split(/\s+/u).includes(account.accountUrl),
    path + '.referenceUrl', '기관 누리집에 연결된 동일한 공식 계정 주소의 근거가 필요합니다.');
  return capture.body;
}

export function validateCatalog(catalog, previous = null, { sources, schemaOnly = false, now = Date.now() } = {}) {
  if (catalog?.format === 'eungmo-toss-v4') return validateV4(catalog, previous, { sources, schemaOnly, now });
  const v3 = catalog?.format === 'eungmo-toss-v3';
  const classified = v3 || catalog?.format === 'eungmo-toss-v2';
  const fields = classified ? [...catalogFields, 'companyHosts'] : catalogFields;
  checkFields(catalog, v3 ? [...fields, 'officialSocial'] : fields, 'catalog');
  requireCondition(classified || catalog.format === 'eungmo-toss-v1', 'format', 'eungmo-toss-v1, eungmo-toss-v2 또는 eungmo-toss-v3여야 합니다.');
  requireCondition(catalog.review === 'ai-double-checked', 'review', 'ai-double-checked이어야 합니다.');
  requireCondition(
    typeof catalog.updatedAt === 'string' && timestampPattern.test(catalog.updatedAt) && isCalendarDate(catalog.updatedAt.slice(0, 10)),
    'updatedAt', '실제 한국 시간 YYYY-MM-DDTHH:MM:SS+09:00이 필요합니다.',
  );
  requireCondition(Array.isArray(catalog.officialHosts), 'officialHosts', '호스트 배열이 필요합니다.');
  const hosts = new Set(catalog.officialHosts);
  requireCondition(hosts.size === catalog.officialHosts.length, 'officialHosts', '호스트가 중복되었습니다.');
  for (const [i, host] of catalog.officialHosts.entries()) {
    requireCondition(
      typeof host === 'string' && host.length <= 253 && hostPattern.test(host) && !nonOfficialHost.test(host),
      'officialHosts[' + i + ']', '공식 호스트 이름만 넣을 수 있습니다.',
    );
  }
  const companies = new Map();
  if (classified) {
    checkFields(catalog.companyHosts, [], 'companyHosts', Object.keys(catalog.companyHosts ?? {}));
    for (const [organizer, names] of Object.entries(catalog.companyHosts)) {
      requireCondition(organizer.trim() && organizer.length <= 1800, 'companyHosts', '주최 회사 이름이 필요합니다.');
      checkPrivacy(organizer, 'companyHosts');
      requireCondition(Array.isArray(names) && names.length > 0 && new Set(names).size === names.length &&
        names.every(host => typeof host === 'string' && host.length <= 253 && hostPattern.test(host) &&
          !nonOfficialHost.test(host) && !socialHost.test(host) && !hosts.has(host)),
      'companyHosts', '주최사별 공식 호스트가 필요합니다. 공공기관·SNS·양식 호스트는 별도로 사용하세요.');
      companies.set(organizer, new Set(names));
    }
  }
  const socialPosts = v3 ? checkOfficialSocial(catalog.officialSocial, hosts) : new Map();
  const previousSocial = new Map(previous?.officialSocial?.flatMap(row => row.postUrls.map(url => [url, row])));
  requireCondition(Array.isArray(catalog.events) && catalog.events.length <= 80, 'events', '배열로 최대 80건을 넣을 수 있습니다.');

  const ids = new Set();
  const identities = new Set();
  const socialReferences = new Set();
  const previousById = new Map(previous?.events.map(event => [event.id, event]));
  const previousByIdentity = new Map(previous?.events.map(event => [eventIdentity(event), event.id]));
  const previousBySource = new Map(previous?.events.flatMap(event =>
    event.referenceUrl ? [[new URL(event.referenceUrl).href, event.id]] : []));
  for (const [i, event] of catalog.events.entries()) {
    const path = 'events[' + i + ']';
    checkFields(event, classified ? [...requiredEventFields, 'source'] : requiredEventFields, path, optionalEventFields);
    requireCondition(!classified || event.source === 'public' || event.source === 'company',
      path + '.source', 'public 또는 company를 적으세요.');
    requireCondition(typeof event.id === 'string' && idPattern.test(event.id), path + '.id', '영문 소문자, 숫자, 하이픈만 허용합니다.');
    checkPrivacy(event.id, path + '.id');
    requireCondition(!ids.has(event.id), path + '.id', '중복 ID입니다.');
    ids.add(event.id);
    for (const field of textFields) {
      const value = event[field];
      requireCondition(typeof value === 'string' && value.trim() && value.length <= 1800, path + '.' + field, '1~1800자의 안내문이 필요합니다.');
      checkPrivacy(value, path + '.' + field);
      requireCondition(
        !/\b(?:[a-z][a-z0-9+.-]*:\s*\/\/|www\.|mailto:|tel:)/i.test(value.normalize('NFKC')),
        path + '.' + field, '주소는 지정된 URL 필드에만 넣을 수 있습니다.',
      );
    }
    for (const field of dateFields) {
      if (event[field] === null && field !== 'firstPublishedOn' && field !== 'verifiedAt') continue;
      requireCondition(isCalendarDate(event[field]), path + '.' + field, '실제 날짜 YYYY-MM-DD가 필요합니다.');
    }
    requireCondition(
      event.deadlineTime === null || (event.deadline !== null && typeof event.deadlineTime === 'string' && timePattern.test(event.deadlineTime)),
      path + '.deadlineTime', '마감 날짜와 함께 HH:MM을 적거나 null로 두세요.',
    );
    requireCondition(
      event.startDate === null || event.deadline === null || event.startDate <= event.deadline,
      path + '.startDate', '시작일이 마감일보다 늦습니다.',
    );
    const former = previousById.get(event.id);
    const company = event.source === 'company';
    const eventHosts = company ? companies.get(event.organizer) : hosts;
    requireCondition(eventHosts, path + '.organizer', '주최 회사의 공식 호스트를 companyHosts에 등록하세요.');
    const account = socialPosts.get(event.referenceUrl);
    let reference;
    let socialNotice;
    if (v3 && isInstagramPostUrl(event.referenceUrl)) {
      requireCondition(account && account.organizer === event.organizer && event.source === 'public',
        path + '.referenceUrl', '같은 주최 기관의 공식 인스타그램 계정에 등록된 게시물만 허용합니다.');
      requireCondition(event.category === 'survey' || event.category === 'quiz',
        path + '.category', '공식 인스타그램 행사에는 설문 또는 퀴즈만 허용합니다.');
      requireCondition(!socialReferences.has(event.referenceUrl), path + '.referenceUrl', '같은 인스타그램 게시물을 중복 등록할 수 없습니다.');
      socialReferences.add(event.referenceUrl);
      reference = new URL(event.referenceUrl);
      const previousAccount = previousSocial.get(event.referenceUrl);
      if (!schemaOnly && (!isDeepStrictEqual(event, former) || previousAccount?.accountUrl !== account.accountUrl ||
          previousAccount?.evidenceUrl !== account.evidenceUrl)) {
        socialNotice = socialNoticeBody(event, account, sources, path);
      }
    } else {
      reference = checkUrl(event.referenceUrl, eventHosts, path + '.referenceUrl');
    }
    const announcement = checkUrl(event.announcementUrl, eventHosts, path + '.announcementUrl');
    const result = checkUrl(event.resultUrl, eventHosts, path + '.resultUrl');
    let companyNotice;
    if (company) {
      requireCondition(reference, path + '.referenceUrl', '주최 회사의 공식 상세 공고가 필요합니다.');
      checkCompanyText([event.title, event.rules, event.announcementMethod].join('\n'), path);
      if (!schemaOnly && (!isDeepStrictEqual(event, former) ||
          !isDeepStrictEqual(catalog.companyHosts[event.organizer], previous?.companyHosts?.[event.organizer]))) {
        companyNotice = noticeBody(event, eventHosts, sources);
        requireCondition(companyNotice?.trim(), path + '.referenceUrl', '변경된 기업 행사에는 공식 공고 원문이 필요합니다.');
        checkCompanyText(companyNotice, path + '.referenceUrl');
      }
    }
    if (Object.hasOwn(event, 'entryUrl')) {
      const entry = checkUrl(event.entryUrl, eventHosts, path + '.entryUrl', 'entry');
      if (entry && company) {
        const entryPath = decodeURIComponent(entry.pathname);
        requireCondition(!socialHost.test(entry.hostname) && !companyRestrictedPath.test(entryPath) &&
          !companyRestrictedPath.test(entryPath.toLowerCase()),
          path + '.entryUrl', 'SNS, 가입, 로그인, 구매, 결제 주소는 사용할 수 없습니다.');
        if (companyNotice !== undefined) {
          requireCondition(companyNotice.split(/\s+/u).includes(event.entryUrl), path + '.entryUrl',
            '공식 공고 본문에 있는 동일한 주소가 필요합니다.');
        }
      }
      if (entry && account) {
        requireCondition(socialNotice === undefined || socialNotice.split(/\s+/u).includes(event.entryUrl),
          path + '.entryUrl', '공식 공고 본문에 있는 동일한 주소가 필요합니다.');
      } else if (entry && !eventHosts.has(entry.hostname) && !schemaOnly && !company) {
        requireCondition(former?.entryUrl === event.entryUrl && former.referenceUrl === event.referenceUrl
          || entryInNotice(event, eventHosts, sources), path + '.entryUrl', '공식 공고 본문에 있는 동일한 주소가 필요합니다.');
      }
    }
    if (Object.hasOwn(event, 'category')) {
      requireCondition(categories.has(event.category), path + '.category',
        'quiz(퀴즈), survey(설문), event(추첨·투표·간단 참여)만 허용합니다. 공모전 분류는 사용할 수 없습니다.');
    }
    if (Object.hasOwn(event, 'image')) checkImage(event.image, event.id, eventHosts, path + '.image');
    requireCondition(
      !result || (result.href !== reference?.href && result.href !== announcement?.href
        && !/(?:list|\/notice\.jsp)(?:\.do|\.jsp|\.html)?$/i.test(result.pathname)),
      path + '.resultUrl', '개별 발표문 주소가 필요합니다.',
    );
    const identity = eventIdentity(event);
    requireCondition(!identities.has(identity), path, '같은 제목과 주최의 행사가 중복되었습니다.');
    identities.add(identity);
    for (const formerId of [previousByIdentity.get(identity), previousBySource.get(reference?.href)]) {
      requireCondition(!formerId || event.id === formerId, path + '.id', '기존 행사 ID를 바꿀 수 없습니다.');
    }
    if (former) {
      requireCondition(!classified || event.source === (former.source ?? 'public'), path + '.source', '기존 행사의 주최 분류를 바꿀 수 없습니다.');
      requireCondition(event.firstPublishedOn === former.firstPublishedOn, path + '.firstPublishedOn', '최초 게시일을 바꿀 수 없습니다.');
      requireCondition(event.verifiedAt >= former.verifiedAt, path + '.verifiedAt', '직전 확인일보다 이전일 수 없습니다.');
    }
  }
  return catalog;
}

function parseCatalog(raw, label) {
  let catalog;
  try {
    catalog = JSON.parse(raw);
  } catch {
    throw new Error(label + ': UTF-8 JSON을 읽을 수 없습니다.');
  }
  const objects = [];
  for (const [token, quotedKey] of raw.matchAll(/("(?:[^"\\]|\\.)*")(?=\s*:)|"(?:[^"\\]|\\.)*"|[{}]/gs)) {
    if (token === '{') {
      objects.push(new Set());
    } else if (token === '}') {
      objects.pop();
    } else if (quotedKey) {
      const keys = objects.at(-1);
      const key = JSON.parse(quotedKey);
      requireCondition(!keys.has(key), label, '같은 객체에 중복 필드가 있습니다.');
      keys.add(key);
    }
  }
  return catalog;
}

export function readCatalog(file = catalogPath) {
  let raw;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  } catch {
    throw new Error('후보 JSON 파일을 읽을 수 없습니다.');
  }
  return parseCatalog(raw, '후보');
}

export function asPublicV2(catalog) {
  return { ...catalog, format: 'eungmo-toss-v2', companyHosts: {},
    events: catalog.events.map(event => ({ ...event, source: 'public' })) };
}

export function readPrevious(v2 = false) {
  const head = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repoRoot });
  if (head.status === 1 && !head.stderr?.length) return null;
  requireCondition(head.status === 0, 'HEAD', '직전 커밋을 확인할 수 없습니다.');
  if (v2 === 'v4' && spawnSync('git', ['cat-file', '-e', 'HEAD:catalog-v4.json'], { cwd: repoRoot }).status === 128) {
    return null;
  }
  if (v2 === 'v3' && spawnSync('git', ['cat-file', '-e', 'HEAD:catalog-v3.json'], { cwd: repoRoot }).status === 128) {
    return readPrevious(true);
  }
  if (v2 === true && spawnSync('git', ['cat-file', '-e', 'HEAD:catalog-v2.json'], { cwd: repoRoot }).status === 128) {
    const legacy = readPrevious();
    return legacy && { ...legacy, catalog: asPublicV2(legacy.catalog) };
  }
  const name = v2 === 'v4' ? 'catalog-v4.json' : v2 === 'v3' ? 'catalog-v3.json' : v2 ? 'catalog-v2.json' : 'catalog.json';
  let raw;
  try {
    raw = execFileSync('git', ['show', 'HEAD:' + name], {
      cwd: repoRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('HEAD: 직전 커밋에서 ' + name + '을 읽을 수 없습니다.');
  }
  return { raw, catalog: validateCatalog(parseCatalog(raw, '직전 커밋'), null, { schemaOnly: true }) };
}

export function readCandidate(file, v2) {
  const version = v2 === 'v4' ? 'v4' : v2 === 'v3' ? 'v3' : v2 ? 'v2' : 'v1';
  const result = readCatalog(file ?? (version === 'v4' ? v4Path : version === 'v3' ? v3Path : v2 ? v2Path : catalogPath));
  requireCondition(result?.format === 'eungmo-toss-' + version,
    'format', version === 'v1' ? 'eungmo-toss-v1이어야 합니다. v2~v4는 버전 옵션을 사용하세요.' :
      `--${version}는 eungmo-toss-${version}만 검사합니다.`);
  return result;
}

export function runCli(action) {
  try {
    action();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli(() => {
    const args = process.argv.slice(2);
    const reviewInput = args[0] === '--review-input';
    if (reviewInput) args.shift();
    const version = args[0] === '--v4' ? 'v4' : args[0] === '--v3' ? 'v3' : args[0] === '--v2';
    if (version) args.shift();
    const sources = reviewInput ? undefined : takeSourceArgs(args);
    if (args.length > 1 || args[0]?.startsWith('-') || (reviewInput && args.length !== 1)) {
      throw new Error('사용법: node tools/validate.mjs [--v2|--v3|--v4] [--sources 원문폴더 YYYYMMDD-HHmm] [후보.json]');
    }
    const previous = reviewInput ? null : readPrevious(version)?.catalog;
    const candidate = reviewInput && !version ? readCatalog(args[0]) : readCandidate(args[0], version);
    const result = validateCatalog(candidate, previous, { sources, schemaOnly: reviewInput });
    if (result.format === 'eungmo-toss-v4' && !reviewInput) {
      checkV4Base(result, readCandidate(undefined, 'v3'));
      checkSnsAssets(result);
    }
    if (reviewInput) {
      if (result.events.length === 0) throw new Error('대조할 행사가 없습니다.');
      console.log(JSON.stringify(result));
      return;
    }
    console.log('검사 통과 · ' + result.events.length + '건');
  });
}

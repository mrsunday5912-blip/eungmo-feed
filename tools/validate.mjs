import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const catalogPath = fileURLToPath(new URL('../catalog.json', import.meta.url));
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

function entryInNotice(event, hosts, sources) {
  if (!sources) return false;
  const directory = resolve(sources.root, event.id);
  const file = resolve(directory, sources.stamp + '.txt');
  if (!lstatSync(directory, { throwIfNoEntry: false })?.isDirectory()) return false;
  const info = lstatSync(file, { throwIfNoEntry: false });
  if (!info?.isFile() || info.size > 128 * 1024) return false;
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  const capture = /^URL: ([^\r\n]+)\r?\nOpenedAt: ([^\r\n]+)\r?\nFinalURL: ([^\r\n]+)\r?\n\r?\n([\s\S]*)$/.exec(raw);
  if (!capture) return false;
  const [, requested, openedAt, final, body] = capture;
  if (!timestampPattern.test(openedAt) || openedAt.slice(0, 10) !== sources.date) return false;
  try {
    for (const address of [requested, final]) {
      const url = new URL(address);
      if (!address.startsWith('https://') || /[\s\\]/.test(address) || !hosts.has(url.hostname)
        || address.slice(8).split(/[/?#]/, 1)[0] !== url.hostname) return false;
    }
    if (event.referenceUrl && new URL(requested).href !== new URL(event.referenceUrl).href) return false;
  } catch {
    return false;
  }
  return body.split(/\s+/u).includes(event.entryUrl);
}

function eventIdentity(event) {
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return normalize(event.organizer) + '|' + normalize(event.title);
}

export function validateCatalog(catalog, previous = null, { sources, schemaOnly = false } = {}) {
  checkFields(catalog, catalogFields, 'catalog');
  requireCondition(catalog.format === 'eungmo-toss-v1', 'format', 'eungmo-toss-v1이어야 합니다.');
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
  requireCondition(Array.isArray(catalog.events) && catalog.events.length <= 80, 'events', '배열로 최대 80건을 넣을 수 있습니다.');

  const ids = new Set();
  const identities = new Set();
  const previousById = new Map(previous?.events.map(event => [event.id, event]));
  const previousByIdentity = new Map(previous?.events.map(event => [eventIdentity(event), event.id]));
  const previousBySource = new Map(previous?.events.flatMap(event =>
    event.referenceUrl ? [[new URL(event.referenceUrl).href, event.id]] : []));
  for (const [i, event] of catalog.events.entries()) {
    const path = 'events[' + i + ']';
    checkFields(event, requiredEventFields, path, optionalEventFields);
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
    const [reference, announcement, result] = urlFields.map(field => checkUrl(event[field], hosts, path + '.' + field));
    const former = previousById.get(event.id);
    if (Object.hasOwn(event, 'entryUrl')) {
      const entry = checkUrl(event.entryUrl, hosts, path + '.entryUrl', 'entry');
      if (entry && !hosts.has(entry.hostname) && !schemaOnly) {
        requireCondition(former?.entryUrl === event.entryUrl && former.referenceUrl === event.referenceUrl
          || entryInNotice(event, hosts, sources), path + '.entryUrl', '공식 공고 본문에 있는 동일한 주소가 필요합니다.');
      }
    }
    if (Object.hasOwn(event, 'category')) {
      requireCondition(categories.has(event.category), path + '.category', 'quiz, survey, event 중 하나가 필요합니다.');
    }
    if (Object.hasOwn(event, 'image')) checkImage(event.image, event.id, hosts, path + '.image');
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

export function readPrevious() {
  const head = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repoRoot });
  if (head.status === 1 && !head.stderr?.length) return null;
  requireCondition(head.status === 0, 'HEAD', '직전 커밋을 확인할 수 없습니다.');
  let raw;
  try {
    raw = execFileSync('git', ['show', 'HEAD:catalog.json'], {
      cwd: repoRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('HEAD: 직전 커밋에서 catalog.json을 읽을 수 없습니다.');
  }
  return { raw, catalog: validateCatalog(parseCatalog(raw, '직전 커밋'), null, { schemaOnly: true }) };
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
    const sources = reviewInput ? undefined : takeSourceArgs(args);
    if (args.length > 1 || args[0]?.startsWith('-') || (reviewInput && args.length !== 1)) {
      throw new Error('사용법: node tools/validate.mjs [--sources 원문폴더 YYYYMMDD-HHmm] [후보.json]');
    }
    const previous = reviewInput ? null : readPrevious()?.catalog;
    const result = validateCatalog(readCatalog(args[0]), previous, { sources, schemaOnly: reviewInput });
    if (reviewInput) {
      if (result.events.length === 0) throw new Error('대조할 행사가 없습니다.');
      console.log(JSON.stringify(result));
      return;
    }
    console.log('검사 통과 · ' + result.events.length + '건');
  });
}

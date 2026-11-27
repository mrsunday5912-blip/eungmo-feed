# 응모노트 공고 피드

응모노트의 [catalog.json](https://mrsunday5912-blip.github.io/eungmo-feed/catalog.json)은 대한민국 정부, 지방자치단체, 공공기관, 공기업이 직접 주최하는 무료 행사를 싣습니다. 새 앱이 읽는 [catalog-v2.json](https://mrsunday5912-blip.github.io/eungmo-feed/catalog-v2.json)은 같은 공공기관 목록과, 공개가 승인되면 기업·브랜드의 공식 무료 행사를 담습니다. 공고에서 확인한 응모 링크는 앱의 응모 버튼에 사용하며, 링크가 비어 있으면 공고를 엽니다. 개인 이름, 연락처, 당첨자 명단, 쿠폰 번호는 수집하거나 싣지 않습니다.

오류를 발견하면 [이 저장소의 이슈](https://github.com/mrsunday5912-blip/eungmo-feed/issues/new)에 행사 제목, 정정할 항목, 확인 가능한 공식 공고 주소를 적어 주세요. 이슈는 공개되므로 개인정보를 적지 마세요.

## 갱신

Node.js 22 이상과 Git으로 저장소에서 아래 순서대로 진행합니다.

1. 직전 검수본에서 초안을 만듭니다. 기존 행사의 `id`와 `firstPublishedOn`을 유지합니다. 공개되지 않은 날짜, 시각, 주소는 `null`로 적습니다. `referenceUrl`은 공고문, `announcementUrl`은 발표 확인 게시판, `resultUrl`은 실제 발표문 주소입니다. 선택 필드 `entryUrl`에는 해당 회차의 공식 공고에 표시된 HTTPS 응모 주소만 적습니다. 개인정보와 추적 매개변수는 금지합니다. 선택 필드 `category`에는 `quiz`, `survey`, `event` 중 하나를 적습니다.
2. Playwright로 행사별 공고 본문과 화면을 지정 원문 폴더에 저장합니다. `node tools/validate.mjs --sources "<원문 루트>" <수집시각> <후보.json>`으로 검사합니다. 새로 넣거나 변경한 외부 응모 주소는 공고 본문에 그대로 있어야 합니다. 같은 원문 옵션으로 `node tools/diff.mjs`에서 변경을 확인하고 `--changes-json`을 붙여 변경 목록을 저장소 밖에 UTF-8로 저장합니다.
3. 변경 목록과 수집 시각을 `toss-feed-verify.ps1`의 `-Events`와 `-Stamp`에 전달합니다. 종료 코드 0과 `state=complete`를 확인합니다. `OK`는 그대로 반영하고, `OK_WITHOUT_ENTRY`는 응모 주소를 비운 뒤 행사 정보를 반영합니다. 원문 누락이나 `FAIL`이면 신규는 제외하고 수정은 직전 값으로 돌립니다. Neon 실행이나 결과 형식에 오류가 있으면 게시를 중단합니다.
4. 승인된 공공기관 변경을 `catalog.json`에 반영해 다시 검사하고 `node tools/snapshot.mjs --sources "<원문 루트>" <수집시각>`을 실행합니다. 직전 커밋의 v1 피드를 한국 시간 기준 파일로 보관하고 최신 90개를 유지합니다. 아래의 v2 동기화와 검사까지 마친 후 `log/YYYY-MM.md`에 결과 한 줄을 적고 피드 전용 배포 키로 `main`을 올립니다.

## 분류 피드

- v2에서는 모든 행사에 `source`가 필요합니다. `public` 행사는 v1과 같은 원본을 쓰고, `company` 행사는 주최사에 등록된 공식 HTTPS 상세 공고가 필요합니다. `companyHosts`에는 주최사 이름별 정확한 공식 호스트 배열을 넣습니다. 기업 행사는 참가비·구매·결제·가입·SNS 참여·사행성 조건 없이 참여할 수 있어야 합니다.
- 기업 변경은 공개 저장소 밖 v2 후보에서 `validate.mjs --v2`와 `diff.mjs --changes-json --v2`에 기존 `--sources` 인수를 붙여 검사하고 Neon에서 원문을 대조합니다.
- `node tools/sync-v2.mjs --sources "<원문 루트>" <수집시각>`으로 공공기관 목록을 동기화합니다. `feed-settings.json`의 `company`가 켜진 후에만 Neon 승인 v2 후보 경로를 마지막 인수로 붙여 기업 변경을 반영합니다. 스위치가 꺼져 있으면 기업 행사와 호스트가 공개 v2에서 빠집니다. 게시 직전 동일한 명령에 첫 인수 `--check`를 붙이고 후보 경로를 생략해 공개 파일을 확인합니다.

## 행사 이미지

- 선택 필드 `image`에 `wide`, `square`, `kind`, `credit`을 넣습니다. `wide`와 `square`는 각각 `images/<행사id>-wide.webp`(1080×405)와 `images/<행사id>-square.webp`(240×240)입니다. WebP 두 파일을 각각 150KB 이하로 저장하고 다시 열어 확인합니다.
- 신규 행사는 `category`에 따라 `images/category-quiz-*.webp`, `images/category-survey-*.webp`, `images/category-event-*.webp` 중 해당하는 가로·정사각 기본 그림을 행사 ID별 파일로 복사합니다. `image.kind`는 `ai`, `image.credit`은 `AI 이미지`로 적고 `sourceUrl`과 `license`는 생략하거나 `null`로 둡니다. 기존 행사 사진은 유지합니다.
- `image`는 선택 필드입니다. `kind`에 `official`을 쓰는 데이터의 경우 `sourceUrl`은 `officialHosts`에 등록된 HTTPS 원본 주소, `license`는 `KOGL-1`이어야 합니다. `credit`에는 기관과 이용 조건을 적습니다.

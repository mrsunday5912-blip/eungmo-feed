# 응모수첩 공고 피드

응모수첩은 GitHub Pages의 [catalog.json](https://mrsunday5912-blip.github.io/eungmo-feed/catalog.json)을 읽습니다. 대한민국 정부, 지방자치단체, 공공기관, 공기업이 직접 주최하는 무료 행사의 공개 안내만 싣습니다. 주소는 기관의 공식 공고와 발표에 사용합니다. 개인 이름, 연락처, 당첨자 명단, 쿠폰 번호는 수집하거나 싣지 않습니다.

오류를 발견하면 [이 저장소의 이슈](https://github.com/mrsunday5912-blip/eungmo-feed/issues/new)에 행사 제목, 정정할 항목, 확인 가능한 공식 공고 주소를 적어 주세요. 이슈는 공개되므로 개인정보를 적지 마세요.

## 갱신

Node.js 22 이상과 Git으로 저장소에서 아래 순서대로 진행합니다.

1. 직전 게시본에서 시작해 `catalog.json`을 수정합니다. 기존 행사의 `id`와 `firstPublishedOn`을 유지합니다. 공개되지 않은 날짜, 시각, 주소는 `null`로 적습니다. `referenceUrl`은 공고문, `announcementUrl`은 발표 확인 게시판, `resultUrl`은 실제 발표문 주소입니다.
2. `node tools/validate.mjs`로 파일과 직전 커밋을 대조합니다. `node tools/diff.mjs`로 신규·수정·내림을 확인합니다.
3. `node tools/diff.mjs --changes-json`의 UTF-8 출력을 저장소 밖에 저장합니다. 지정된 Playwright 원문 수집 절차에서 공고의 본문과 화면을 행사별로 저장합니다. 변경 JSON과 수집 시각을 `toss-feed-verify.ps1`의 `-Events`와 `-Stamp`에 전달합니다. Neon이 저장된 텍스트를 읽어 `OK`로 판정한 변경만 반영합니다. 원문 누락이나 `FAIL`이면 신규는 제외하고 수정은 직전 값으로 돌린 뒤 다시 검사합니다. Neon 실행이나 결과 형식에 오류가 있으면 게시를 중단합니다.
4. 행사에 실제 변경이 있으면 `node tools/snapshot.mjs`를 실행합니다. 직전 커밋의 피드를 한국 시간 기준 파일로 보관하고 최신 90개를 유지합니다. `log/YYYY-MM.md`에 결과 한 줄을 적어 함께 커밋한 뒤 피드 전용 배포 키로 `main`을 올립니다.

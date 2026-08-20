# 증권·자산운용·은행 개인별 보수 랭킹

DART(전자공시시스템) OpenDART API의 「개인별 보수 5억원 이상」 공시 데이터를 이용해
증권사·자산운용사·은행 임직원 보수 랭킹을 보여주는 정적 웹사이트입니다.

- `site/` — 배포되는 정적 사이트 (index.html, style.css, app.js, data.js)
- `scripts/` — 데이터 수집 파이프라인 (Node.js, OpenDART API 호출)
- `data/` — 수집된 원본/가공 데이터 (JSON)

## 데이터 갱신 방법

OpenDART 인증키가 필요합니다 ([opendart.fss.or.kr](https://opendart.fss.or.kr)에서 무료 발급).

```bash
# 1. 전체 회사 고유번호 목록 다운로드 (최초 1회, 또는 주기적 갱신)
bash scripts/fetch_corpcode.sh <API_KEY>

# 2. companies.json의 회사명 -> DART 고유번호 매칭
node scripts/build_corplist.js

# 3. 기간별 개인별 보수 데이터 수집 (periods.json에서 기간 설정)
node scripts/fetch_pay.js <API_KEY>

# 4. 중복 제거 및 정리 (site/data.js 생성)
node scripts/postprocess.js
```

## 로컬 미리보기

```bash
node scripts/serve.js
# http://localhost:4173
```

## 출처

자료: OpenDART(금융감독원 전자공시시스템). 5억원 이상 공시 기준이며 전체 임직원 연봉 자료가 아닙니다.

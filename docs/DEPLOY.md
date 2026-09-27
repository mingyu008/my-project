# 무료 배포 가이드 (Supabase PostgreSQL + Render)

> 무료 요금제 조건은 수시로 바뀝니다. 가입 전에 각 서비스의 현재 요금제 페이지를 확인하세요.
> DB는 Supabase 기준으로 설명합니다. Neon을 쓰는 경우는 [부록 A](#부록-a-neon을-쓰는-경우)를 보세요.

## 1. 구성

```
브라우저 ──HTTPS──> Render (Docker 이미지 1개)
                      Spring Boot: /api/** + React 빌드 결과(/, /schedule, ...)
                          └──JDBC(SSL)──> Supabase PostgreSQL (Session pooler)
```

- **한 주소**: 화면과 API가 같은 주소(`https://<서비스>.onrender.com`)라서 로그인 쿠키가 1st-party로 동작합니다. 프론트를 Vercel 등에 따로 올리면 로그인이 되지 않습니다(DECISIONS D-040).
- **DB 스키마**: Flyway가 `backend/src/main/resources/db/migration`의 SQL을 적용하고, Hibernate는 검증만 합니다(`validate`).
- **첫 관리자**: 환경변수로 한 번만 만들어집니다(`BootstrapAdminRunner`).

관련 파일: `Dockerfile`, `.dockerignore`, `render.yaml`, `backend/src/main/resources/application-prod.yml`

## 2. 비밀번호 관리 원칙

| 규칙 | 이유 |
|---|---|
| DB 비밀번호는 **Render 대시보드의 `SPRING_DATASOURCE_PASSWORD`에만** 입력 | 코드·`render.yaml`·문서·커밋·채팅에 남지 않게 (`render.yaml`은 `sync: false`로 값이 없음) |
| 원본은 비밀번호 관리자(1Password, Bitwarden 등)에 보관 | 분실 시 재설정 대신 조회 |
| Supabase의 **Reset database password**로 생성한 긴 무작위 값 사용 | 추측·재사용 방지 |
| 로컬 `.env` 파일은 커밋 금지 (`.gitignore`에 `.env`, `.env.*` 등록됨) | 실수로 push 방지 |
| 비밀번호는 URL에 넣지 않고 별도 변수로 전달 | 특수문자 URL 인코딩 불필요, 로그·에러에 URL이 찍혀도 비밀번호 비노출 |

**교체(유출 의심 시 즉시)**: Supabase → Database Settings → Reset database password → Render 환경변수 `SPRING_DATASOURCE_PASSWORD` 수정 → 저장하면 자동 재배포. 교체 사이 잠깐 DB 연결이 끊깁니다.

## 3. 준비

1. 지금까지의 변경을 커밋하고 GitHub(`mingyu008/my-project`)의 `main`에 push합니다. Render는 GitHub 저장소를 빌드합니다.
2. 계정: [Supabase](https://supabase.com), [Render](https://render.com) (둘 다 GitHub 계정으로 가입 가능)

## 4. Supabase (데이터베이스)

### 4.1 프로젝트
- Region: **Southeast Asia (Singapore)** 권장 — Render 서비스가 Singapore에 있습니다. 이미 서울 등 다른 리전으로 만들었다면 그대로 써도 동작합니다(요청마다 수십 ms 추가).
- Database password: 생성 버튼으로 만든 값을 비밀번호 관리자에 저장

### 4.2 연결 정보 — **Session pooler** 사용
대시보드 상단 **Connect** → **Session pooler** 탭의 값을 씁니다.

- Direct connection(`db.<프로젝트ID>.supabase.co:5432`)은 무료 플랜에서 **IPv6 전용**이라 Render에서 접속되지 않을 가능성이 큽니다.
- Transaction pooler(포트 **6543**)는 JDBC prepared statement와 충돌할 수 있어 쓰지 않습니다. **포트 5432**인 Session pooler를 씁니다.

Session pooler 문자열 예: `postgresql://postgres.ewlronsdpelwdpitpqpx:[YOUR-PASSWORD]@aws-0-<리전>.pooler.supabase.com:5432/postgres`
이를 세 값으로 나눕니다. **JDBC URL에는 사용자/비밀번호를 넣지 않습니다.**

| Render 환경변수 | 값 |
|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://aws-0-<리전>.pooler.supabase.com:5432/postgres?sslmode=require` |
| `SPRING_DATASOURCE_USERNAME` | `postgres.ewlronsdpelwdpitpqpx` (pooler는 `postgres.<프로젝트ID>` 형식) |
| `SPRING_DATASOURCE_PASSWORD` | DB 비밀번호 |

호스트의 `<리전>` 부분은 대시보드에 표시된 값을 그대로 복사하세요.

### 4.3 Data API 끄기 (**필수 보안 설정**)
Supabase는 `public` 스키마 테이블을 REST API(Data API)로 자동 공개하고, 그 키(anon/publishable key)는 공개용입니다. 이 앱은 Data API를 쓰지 않습니다.

- **Project Settings → Data API → Data API 비활성화** (메뉴 이름은 대시보드 버전에 따라 다를 수 있음)
- 추가 방어: 앱이 모든 테이블에 **RLS(Row Level Security)를 켜고 정책을 두지 않습니다**(`V2__enable_rls.sql`, `afterMigrate__rls_history.sql`). Data API가 켜져 있어도 anon/authenticated 역할은 아무 행도 읽거나 바꿀 수 없습니다. 앱은 테이블 소유자(`postgres`)로 접속하므로 영향이 없습니다.
- 배포 후 **Advisors → Security Advisor**에 "RLS disabled" 경고가 없는지 확인하세요.

테이블은 직접 만들 필요가 없습니다. 첫 기동 때 Flyway가 만듭니다. Supabase Table Editor에서 테이블을 **직접 수정하지 마세요**(Flyway 검증 실패로 서버가 시작되지 않을 수 있음).

## 5. Render (서버)

1. Render 대시보드 → **New → Blueprint** → GitHub 저장소 `my-project` 선택
   - 저장소 루트의 `render.yaml`을 읽어 **Free** 플랜 Docker 웹 서비스(Singapore)를 만듭니다.
2. 입력을 요구하는 환경변수를 채웁니다.

| 환경변수 | 값 |
|---|---|
| `SPRING_DATASOURCE_URL` / `_USERNAME` / `_PASSWORD` | 4.2 표 |
| `BOOTSTRAP_ADMIN_USERNAME` | 첫 관리자 아이디 (예: `owner`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | 12자 이상, **아이디를 포함하지 않는** 비밀번호. 조건에 안 맞으면 서버가 시작되지 않습니다 |

3. **Apply** → 첫 빌드는 5~10분 걸립니다(React 빌드 + Maven).
4. 로그(Logs 탭)에서 아래 줄을 확인합니다.
   - `Successfully applied 2 migrations ... now at version v2`
   - `Executing SQL callback: afterMigrate - rls history`
   - `Bootstrap admin created: userId=1`
   - `Started BackendApplication`

`APP_CORS_ALLOWED_ORIGINS`는 넣지 않아도 됩니다. Render가 주는 `RENDER_EXTERNAL_URL`(서비스 주소)을 자동으로 씁니다. 나중에 **커스텀 도메인**을 붙이면 `APP_CORS_ALLOWED_ORIGINS=https://내도메인`을 추가하세요.

### 접속 실패 시
| 로그 | 원인 / 조치 |
|---|---|
| `Network is unreachable`, `UnknownHost` | Direct connection 주소 사용 → 4.2의 Session pooler 주소로 변경 |
| `password authentication failed` | 비밀번호 또는 사용자명(`postgres.<프로젝트ID>`) 확인 |
| `prepared statement "S_1" already exists` | 포트 6543(Transaction pooler) 사용 → 5432로 변경 |
| `Bootstrap admin password rejected` | 비밀번호 규칙(12자 이상, 아이디 미포함) 확인 |
| `Validate failed: Migrations have failed validation` | 적용된 마이그레이션 파일을 수정했거나 Table Editor로 스키마를 바꿈 → 원복 후 새 `V<n>` 파일로 변경 |

## 6. 첫 접속 확인

1. `https://<서비스>.onrender.com/api/health` → `{"status":"UP"}`
2. `https://<서비스>.onrender.com` → 로그인 화면 → `BOOTSTRAP_ADMIN_USERNAME` / `_PASSWORD`로 로그인
3. 일정 하나 등록 → 새로고침해도 로그인·데이터 유지 확인
4. 휴대폰으로 같은 주소 접속 확인

이후 사용자는 **회원 가입 → 관리자가 사용자 관리에서 승인** 흐름으로 늘립니다. 확인자(보상 관리)는 사용자 관리에서 "확인자 지정"으로 줍니다.

첫 관리자가 생긴 뒤에는 `BOOTSTRAP_ADMIN_*` 값이 쓰이지 않습니다(관리자가 있으면 무시). 비밀번호가 대시보드에 남지 않도록 **삭제를 권장**합니다.

## 7. 업데이트 배포

- `main`에 push하면 Render가 자동으로 다시 빌드·배포합니다(`autoDeploy: true`).
- CI 실패 커밋이 배포되지 않게 하려면 Render 서비스 Settings → **Auto-Deploy: After CI Checks Pass**로 바꾸세요. CI(`.github/workflows/ci.yml`)에 이미지 빌드 검사도 있습니다.
- **DB 구조를 바꾸는 코드 변경**(엔티티 필드 추가, 새 enum 값 등)은 반드시 `db/migration/V3__설명.sql` 같은 새 파일을 함께 추가합니다.
  - 기존 `V1`, `V2` 파일은 절대 수정하지 않습니다(Flyway 체크섬 오류로 서버가 시작되지 않음).
  - **새 테이블은 같은 파일에 `alter table <이름> enable row level security;`를 반드시 포함**합니다(Supabase Data API 차단).
  - 빠뜨리면 `validate` 단계에서 서버가 시작되지 않으므로 운영 데이터가 망가지지는 않습니다.
  - `PostgresMigrationTest`(Docker 필요)가 로컬/CI에서 실제 PostgreSQL로 마이그레이션·검증·RLS를 확인합니다. RLS 없는 테이블이 있으면 실패합니다.

## 8. 무료 구성의 한계

| 항목 | 내용 | 대응 |
|---|---|---|
| 슬립 | Render Free는 약 15분간 요청이 없으면 잠들고, 다음 접속에 30~60초 걸림 | 시연 전 미리 한 번 접속. 상시 운영이 필요하면 유료 플랜 |
| 로그인 유지 | 세션이 서버 메모리에 있어 재시작·슬립 후에는 모두 다시 로그인 | 데이터는 DB에 있어 유지됨 |
| 로그인 시도 제한 | 제한 카운터도 메모리 → 재시작 시 초기화 | 무료 단일 인스턴스에서는 수용 |
| Supabase 일시 정지 | 무료 프로젝트는 일정 기간(약 1주) 활동이 없으면 일시 정지될 수 있음 | 대시보드에서 Restore. 앱은 그동안 DB 연결 실패 |
| 인스턴스 1개 | 세션·제한 카운터가 메모리라 여러 대로 늘릴 수 없음 | 늘리려면 Spring Session(공유 저장소) 도입 필요 |
| 메모리 512MB | 로컬 측정 약 260MB 사용 | 여유 있음 |

확인 필요: 로그인·가입 제한은 요청자 IP 기준입니다. Render 프록시가 보내는 `X-Forwarded-For`를 Tomcat이 신뢰하면 실제 사용자 IP로 계산되고, 그렇지 않으면 모든 사용자가 하나의 IP로 묶여 **가입 제한(시간당 10회)이 전체 사용자에게 공유**될 수 있습니다. 배포 후 여러 명이 가입할 때 `TOO_MANY_SIGNUPS`가 너무 일찍 나오면 알려 주세요(설정 `server.tomcat.remoteip.internal-proxies` 조정 필요).

## 9. 로컬에서 운영 이미지 확인 (선택, Docker 필요)

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=myproject -p 55432:5432 postgres:16-alpine
docker build -t my-project:local .
docker run --rm -m 512m -p 8090:10000 -e PORT=10000 \
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://host.docker.internal:55432/myproject \
  -e SPRING_DATASOURCE_USERNAME=postgres -e SPRING_DATASOURCE_PASSWORD=devpass \
  -e APP_CORS_ALLOWED_ORIGINS=http://localhost:8090 \
  -e BOOTSTRAP_ADMIN_USERNAME=owner -e BOOTSTRAP_ADMIN_PASSWORD='<12자 이상, 아이디 미포함>' \
  my-project:local
```
→ http://localhost:8090 (여기의 `devpass`는 로컬 테스트용 컨테이너 전용 값입니다)

로컬 개발(`npm run dev` + `mvn spring-boot:run`)은 이전과 같이 H2 메모리 DB를 씁니다.

## 부록 A. Neon을 쓰는 경우

- New Project → Region **AWS Asia Pacific (Singapore)** → Connect에서 **Connection pooling 끄고(direct)** 연결 문자열 복사
- 예: `postgresql://neondb_owner:비밀번호@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
  - `SPRING_DATASOURCE_URL` = `jdbc:postgresql://ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
  - `SPRING_DATASOURCE_USERNAME` = `neondb_owner`, `SPRING_DATASOURCE_PASSWORD` = 비밀번호
- Neon에는 Data API가 기본으로 켜져 있지 않습니다. RLS 마이그레이션은 그대로 적용돼도 무해합니다.
- 사용이 없으면 DB가 자동 정지되고 첫 쿼리가 몇 초 느립니다(커넥션 대기 30초로 설정해 둠).

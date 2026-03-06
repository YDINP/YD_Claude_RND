# Arcane Collectors - n8n 캐릭터 이미지 생성 워크플로우

## 지원 플랫폼

| 플랫폼 | API 타입 | 비용 | 특징 |
|--------|----------|------|------|
| **Stability AI** | REST API | 유료 (크레딧) | SDXL 공식 API, 안정적 |
| **OpenAI DALL-E 3** | REST API | 유료 ($0.04/장) | 프롬프트 이해력 좋음 |
| **Replicate** | REST API | 유료 (저렴) | 다양한 모델 선택 가능 |
| **Local SD WebUI** | 로컬 API | 무료 | GPU 필요, Fooocus/A1111 |

---

## 설치 방법

### 1. n8n 설치

```bash
# Docker (권장)
docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n

# 또는 npm
npm install n8n -g
n8n start
```

### 2. 워크플로우 가져오기

1. n8n 접속: http://localhost:5678
2. 좌측 메뉴 → **Workflows**
3. **Import from File** 클릭
4. `character_image_generator.json` 선택

---

## API 키 설정

### Stability AI
1. https://platform.stability.ai 가입
2. API Keys 생성
3. n8n Credentials에 추가:
   - Type: Header Auth
   - Name: `Authorization`
   - Value: `Bearer YOUR_API_KEY`

### OpenAI (DALL-E 3)
1. https://platform.openai.com 가입
2. API Keys 생성
3. n8n Credentials에 추가:
   - Type: Header Auth
   - Name: `Authorization`
   - Value: `Bearer YOUR_API_KEY`

### Replicate
1. https://replicate.com 가입
2. API Token 생성
3. n8n Credentials에 추가:
   - Type: Header Auth
   - Name: `Authorization`
   - Value: `Token YOUR_API_TOKEN`

### Local SD WebUI (Fooocus/A1111)
- API 활성화 필요
- A1111: `--api` 플래그로 실행
- 기본 URL: `http://127.0.0.1:7860`

---

## 사용 방법

### 전체 캐릭터 생성
1. Manual Trigger 실행
2. 모든 캐릭터가 순차적으로 생성됨

### 특정 캐릭터 생성
Character Data 노드에서 수정:
```javascript
const selectedCharacter = 'arcana'; // 캐릭터 ID 지정
```

### 캐릭터 ID 목록
| ID | 이름 | 등급 |
|----|------|------|
| arcana | 아르카나 | SSR |
| leonhardt | 레온하르트 | SSR |
| selene | 셀레네 | SSR |
| rose | 로제 | SR |
| kai | 카이 | SR |

---

## 출력 경로

생성된 이미지 저장 위치:
```
D:/AI/generated_characters/{캐릭터ID}_{timestamp}.png
```

---

## 커스터마이징

### 프롬프트 수정
`Build Prompt` 노드에서 공통 프롬프트 수정:
```javascript
const commonPositive = '(masterpiece:1.2), ...';
const commonNegative = 'realistic, 3d, ...';
```

### 캐릭터 추가
`Character Data` 노드의 characters 배열에 추가:
```javascript
{
  id: 'new_character',
  name: '새 캐릭터',
  prompt: '...'
}
```

### 이미지 설정 변경
각 API 노드의 jsonBody에서 수정:
- `width`, `height`: 해상도
- `steps`: 생성 스텝 수
- `cfg_scale`: 프롬프트 충실도

---

## 트러블슈팅

### API 오류
- API 키 확인
- 크레딧/잔액 확인
- Rate limit 확인

### 로컬 API 연결 실패
- SD WebUI가 실행 중인지 확인
- `--api` 플래그로 실행했는지 확인
- 포트 번호 확인 (기본 7860)

### 이미지 저장 실패
- 출력 폴더가 존재하는지 확인
- 쓰기 권한 확인

# KeyClack

기계식 키보드 타건음 시뮬레이터. OS 전역 키 입력을 훅으로 받아 키마다 스위치 소리를 낸다.

- 계획서: [`../KEYSOUND_PLAN.md`](../KEYSOUND_PLAN.md)
- 현재 단계: Phase 0 스파이크 (훅 + 합성 클릭음 + 지연 벤치)

## 빌드

Rust stable (MSVC) + Windows SDK 필요.

```
cargo build --release
./target/release/keyclack.exe --help
```

## 개인정보 원칙

전역 키보드 훅은 구조상 키로거와 같다. 이 프로그램은 키의 스캔코드를 소리 슬롯 선택에만 쓰고, 키 값을 저장·출력·전송하지 않는다. 디버그 출력조차 슬롯 번호만 찍는다.

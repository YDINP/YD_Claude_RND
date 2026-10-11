# 화음은 3도로 쓰고, 긴 음만 코드에 맞춘다

SV2 2.2.x와 카사네 테토 AI 2로 자연스러운 하모리를 쌓는 방법은 세 가지 판단으로 정리된다. **첫째, 리드를 음계 3도로 평행 이동한 뒤 "중요한 음"만 코드에 맞춘다.** 중요한 음은 길거나, 강박에 있거나, 프레이즈 끝에 오는 음이다. 맞출 때는 6도, 가까운 코드톤, 4도·5도 순서로 바꾼다. 짧은 경과음은 비화성음이어도 평행 3도를 그대로 둔다. **둘째, 화음은 리드보다 작고(−6~−12 dB) 어둡고 곧게 만든다.** 비브라토를 빼고, Expression을 Rigid~Refined 쪽에 두고, 자음과 숨을 줄이고, 좌우로 벌린다. **셋째, 화음은 "넣지 않는 곳"을 정해야 들린다.** A메로는 비우고, 1번 사비는 下ハモ, 2번 사비는 上ハモ를 더하고, 라스사비에서 두 성부를 다 쓴다. 이 단계 쌓기가 실무자 사이의 일관된 합의다. 이 세 원칙은 synthv-kit의 현재 화음 생성기(`sheet.py generate()`)와 비교하면 무엇이 빠졌는지 드러난다. 지금 생성기는 모든 음에 코드 검사를 하고, 폴백은 한 칸 바깥(4도)뿐이다. 단조의 V화음에서 이끎음을 올리지 않고, 리드와의 유니즌이나 연속 5도도 검사하지 않는다. 노트마다 따로 고르는 탐욕(greedy) 방식이라 화음선이 들쭉날쭉해질 수 있다. SV2 쪽 변화도 직접 관계가 있다. 2.2.0이 넣은 Unison(최대 16성)과 그룹 단위 자음 강도·길이 슬라이더는 사실상 "화음·더블링용 기능"이다. 그리고 메모상 **에디터 체험판이 10/23경 끝나면 보컬 모드·리테이크·Expression Pad·음소 타이밍이 모두 꺼진다.** 그 뒤에는 화음 트랙의 "곧은 음색"을 .svp 속성이 아니라 믹스(EQ·디에서·볼륨)로 만들어야 한다. 끝 절에 키트에 바로 넣을 규칙과 기본값을 신뢰도 등급과 함께 정리했다.

## 3도 평행이 기본이고, 길고 센 음에서만 코드가 이긴다

일본어권 실무 자료는 음정 선택에서 놀랄 만큼 한목소리를 낸다. 기본은 3도와 6도이고, 4도·5도는 "요소요소에서만" 쓴다. 3도·6도가 가장 잘 섞이고, 4도·5도는 "너무 녹아든다(馴染みすぎる)"는 이유다 ([ongakuriron](https://ongakuriron.com/hamori)). 성격도 구분된다. **3도 위는 밝고 화사하고, 3도 아래는 차분하고 두텁다.** 리드와 2도·7도로 겹치면 탁해진다 ([NOPPO MUSIC SCHOOL](https://noppo-music.co.jp/course/voice-training/vocaloid/blog/12002/)). 3도와 6도는 서로 자리바꿈 관계라서 같은 코드톤을 옥타브만 달리 잡은 것이다. 영어권 강좌도 "6도를 3도만큼 쉽게 시도하라"고 권한다. 리드가 코드의 5음이면 위 3도는 7음 계열 색이 나서 어울리지 않을 수 있다. 리드가 3음이면 위 6도는 근음에 떨어진다 ([Signals Music Studio](https://signalsmusic.studio/lessons/writing-harmonies)). 5도 평행은 떠 있는 느낌(浮遊感)이 들고 화성적 깊이가 없어서, 의도하지 않았다면 피한다 ([nomadial](https://nomadial.com/chorus/)).

上ハモ와 下ハモ의 선택에도 기본값이 있다. **"망설이면 下ハモ부터"** 하라는 것이다. 下ハモ는 리드를 받치고 묻히기 쉬우며 A메로나 조용한 부분에 맞는다. 上ハモ는 사비와 클라이맥스에 맞지만 리드를 "먹을" 위험이 있어 더 작게 둔다. 대표 패턴은 "사비 앞부분은 下ハモ로 받치고, 가장 고조되는 마지막 프레이즈만 上ハモ"다 ([starroute](https://www.starroute.jp/column/harmony-tsukurikata/)). 上ハモ가 음역을 넘으면 下ハモ로 바꾸고, 곡 중간에 위아래를 바꿔도 된다. 결정 기준은 언제나 코드 적합도다 ([independent-artist](https://independent-artist.net/4204/), [nomadial](https://nomadial.com/chorus/)).

자동 생성에 가장 중요한 규칙은 **충돌을 언제 고치느냐**다. 아보이드 노트(코드톤보다 반음 위의 음계음)는 절대 금지가 아니다. "길게 끌거나 두드러지게 쓰지 않으면 괜찮다". 약박이나 뒷박의 아보이드는 영향이 작다 ([Sleepfreaks](https://sleepfreaks-dtm.com/en/music-theory-beginner/avoid-note)). 경과음처럼 강조되지 않는 음은 3도·6도를 그대로 쓰고, 3도·6도가 코드와 부딪칠 때만 4도·5도로 바꾼다 ([ongakuriron](https://ongakuriron.com/hamori)). 고정 3도의 전형적 실수 두 가지가 실례로 나와 있다. CMaj9 위 멜로디 D에 3도 위 F(아보이드)를 붙이면 G로 고쳐야 한다. Gsus4 위 멜로디 G에 3도 위 B를 붙이면 코드의 C와 충돌하므로 C로 고쳐야 한다 ([nomadial](https://nomadial.com/chorus/)). 비화성 3도를 한 번 유지하는 것은 괜찮다. 하지만 여러 음 연속으로 유지하면 탁해진다. 화음 한 음이 두 코드에 걸치면 둘로 쪼갠다 ([riron.sitefactory](https://riron.sitefactory.info/0601.html)). **코드가 음계를 이기는 경우**도 명시돼 있다. Am로 해결하는 E7 위에서 멜로디 B의 아래 3도는 음계의 G가 아니라 G♯이다 ([TuneGate](https://tunegate.me/P20151021001)). 단조 곡이 많은 보카로에서 이 규칙은 결정적이다. 현재 키트의 `Key`는 자연단음계만 알기 때문에 E7 위에서 G를 고르고, 한 칸 바깥 폴백(F·A)도 코드톤이 아니므로 G♮가 G♯과 반음으로 부딪친 채 남는다.

리듬 규칙은 두 갈래다. 가사가 붙은 하모리는 리드와 **같은 리듬, 같은 가사, 같은 자음 시작과 끊는 위치**를 쓴다. 화음만 "らあ"로 늘이면 어긋나 들린다. 화음은 "억양을 누르고 곧게" 부른다 ([independent-artist](https://independent-artist.net/4204/), [TuneGate](https://tunegate.me/P20151021001)). 반면 코러스(ウー・アー, 白玉)는 반주 쪽이다. 코드마다 코드톤을 길게 끌고, 성부는 순차 진행시킨다. 음을 줄일 때는 5음, 근음(베이스가 맡는다), 먼 텐션 순으로 뺀다 ([note.com/kfs_kfs](https://note.com/kfs_kfs/n/nbc6b6a162039)). 화음선은 **멜로디보다 평평하고 덜 움직여야 한다** ([musicsounds.art](https://musicsounds.art/harmony_chorus/)). 보카로 실무자도 화음의 피치선("빨간 선")이 흩어지지 않게 하라고 한다 ([scrapbox musicstudyroom](https://scrapbox.io/musicstudyroom/%E3%83%9C%E3%82%AB%E3%83%AD%E3%81%AE%E5%A3%B0%E3%81%AE%E3%83%8F%E3%83%A2%E3%83%AA%E6%96%B9)). "화음은 멜로디보다 음 수를 줄인다"는 정량 규칙이나 멜리스마 처리 규칙은 어떤 출처에도 없었다. 아래 키트 규칙의 병합 임계값은 추론이다.

곡 안의 배치는 합의가 가장 단단한 영역이다. A메로는 리드만 둔다(가사가 들려야 한다). B메로는 후반만 화음을 넣어 사비로 끌어올린다. 사비는 전체 또는 훅·핵심 단어에만 넣는다. 1번은 下ハモ만, 2번은 上ハモ를 추가, 라스사비는 둘 다 쓴다. 곡 전체에 화음을 깔면 귀가 익숙해지므로 **"넣지 않는 용기"**가 필요하다 ([independent-artist](https://independent-artist.net/4204/)). Sound On Sound도 같은 말을 한다. 화음은 멜로디가 자리 잡기 전에는 나오지 않는다. 벌스에는 단선 화음, 다중 트랙 BV는 곡의 정점에 쓴다. 1절 5행에 3성 화음이 있으면 반복 구간의 같은 자리에도 비슷한 것이 있어야 한다 ([Sound On Sound](https://www.soundonsound.com/techniques/crafting-perfect-pop-backing-vocals)). jugodo의 `arrange`(프리코러스 끝 dn3 → 1사비 뒷줄 up3 → 2사비 전체 up3 → 라스사비 끝 두 줄 up3+dn3)는 이 패턴과 거의 일치한다. 다른 점은 1사비가 下가 아니라 上이라는 것 하나다.

보이스 리딩 규칙은 팝에서 느슨해졌지만 핵심은 남는다. 리드와의 **연속** 완전5도·8도는 피하고, 단발 5도는 괜찮다 ([ongakuriron](https://ongakuriron.com/hamori)). 평행 진행은 대략 3스텝까지로 제한하고, 반행·사행을 선호한다 ([note.com/kfs_kfs](https://note.com/kfs_kfs/n/nbc6b6a162039)). 화음선이 리드를 가로지르는 것은 허용되지만 **유니즌에 착지하면 안 된다.** 진폭이 합쳐져 레벨이 튄다 ([Sound On Sound](https://www.soundonsound.com/techniques/crafting-perfect-pop-backing-vocals)). 上·下ハモ를 둘 다 3도로 쓰면 두 화음 사이가 5도가 되어 떠 보인다. 스튜디오에서는 허용된다 ([nomadial](https://nomadial.com/chorus/)). 여성 화음 파트의 음역 상한 수치는 어떤 출처에도 없었다.

## 화음 트랙은 리드보다 6~12 dB 작고, 어둡고, 곧고, 숨 쉬지 않는다

음량 출발점은 두 계열이 겹친다. 일반 믹스 가이드는 백킹을 리드보다 **4~8 dB 아래**에 두고, 스택은 더 내리라고 한다 ([Sage Audio](https://www.sageaudio.com/articles/mixing-backing-vocals)). SynthV 포럼 사용자는 화음을 **6~12 dB 아래**에 두고 5~7 cent 디튠한다고 했다 ([SynthV forum t/6888](https://forum.synthesizerv.com/t/topic/6888)). 일본 보컬 스쿨은 리드 100에 화음 60~80을 기준으로 제시한다 ([starroute](https://www.starroute.jp/column/harmony-tsukurikata/)). 60~80을 진폭 비로 읽으면 −2~−4.4 dB라서 다른 출처보다 크다. 사람 합창 기준이라 그렇다고 본다. 합성 보이스는 리드와 포먼트가 같아 묻히지 않고 튀므로 더 깎는다. jugodo에서 사용자가 "있다 정도로만"을 요구해 정착한 −11~−14 dB는 이 범위의 아래쪽 끝이다. 아래 성부일수록 작게 두는 키트의 관례(Up −11, Dn −13)는 "上ハモ를 더 작게"라는 실무 조언과 방향이 반대다. 다만 낮은 성부는 마스킹에 묻히기 쉬워서 들리는 크기로 맞춘 결과일 수 있다. 정답은 청취로 정한다.

패닝은 리드를 가운데 두고 화음을 좌우로 보낸다. SynthV는 모든 트랙을 기본으로 가운데에 놓으므로 일부러 벌려야 한다 ([SynthV forum t/6888](https://forum.synthesizerv.com/t/topic/6888)). Waves의 5성 스택 예시는 바깥 쌍 100%, 안쪽 쌍 50%다. 너무 넓으면 바깥 70~80%, 안쪽 35~40%로 줄이고, 바깥 쌍일수록 리버브를 더 젖게 한다 ([Waves](https://www.waves.com/essential-guide-to-producing-backing-vocals-with-waves-plugins)). 핵심 제약이 하나 있다. **같은 테이크를 좌우로 하드 패닝하면 더블 효과가 사라진다.** 넓은 스테레오 파트에는 최소 4개 퍼포먼스(L 2 + R 2)가 필요하다 ([Sound On Sound](https://www.soundonsound.com/techniques/crafting-perfect-pop-backing-vocals)). SynthV에서 피치 미세조정 ±20과 ±80 tick 지연으로 만든 수동 더블은 "다중 음성 느낌은 나지만 위상 문제가 더 심해진다"는 보고가 있다 ([SynthV forum t/7491](https://forum.synthesizerv.com/t/topic/7491)). 일본 보카로 현장에서 더블링 대신 하모리로 두께를 내는 것이 주류인 이유도 기계 음성에 자연스러운 어긋남이 없어서다 ([scrapbox musicstudyroom](https://scrapbox.io/musicstudyroom/%E3%83%9C%E3%82%AB%E3%83%AD%E3%81%AE%E5%A3%B0%E3%81%AE%E3%83%8F%E3%83%A2%E3%83%AA%E6%96%B9)). 그래서 L/R 쌍은 반드시 **다른 리테이크나 Unison으로 만든 별개 렌더**여야 하고, 모노 합산으로 콤 필터링을 확인해야 한다.

음색은 리드와 반대 방향으로 만든다. 화음 버스에는 **HPF 약 300 Hz와 LPF 약 5.5 kHz(각 12 dB/oct)**를 걸고, 에어 부스트는 하지 않는다 ([Music Guy Mixing](https://www.musicguymixing.com/eq-backing-vocals/)). 다른 접근은 HPF를 기본음 바로 아래에 두고 기본음 −3~−6 dB, 500 Hz 부근 −2 dB, 2~5 kHz −2~−3 dB로 깎는다. 압축은 4:1, 소프트니, 어택 약 10 ms로 몇 dB만 누른다 ([Sage Audio](https://www.sageaudio.com/articles/mixing-backing-vocals)). 백킹은 리드보다 공격적으로 디에싱해도 된다. 합성 화음은 리드와 포먼트·자음 성격이 똑같다. 그래서 이 음색 대비가 분리의 주된 원천이고, 밝고 치찰음이 센 테토에서는 LPF와 디에싱이 특히 중요하다(추론). 2.2.0에서 트랙별 Effects 패널(공간화·EQ·압축·리버브)이 생겨 이 처리를 SV 안에서도 할 수 있게 됐다 ([Dreamtonics 2.2.0](https://dreamtonics.com/choir-voice-collections/)).

합성 단계 설정도 같은 방향이다. 4성 블렌드가 피치에서 안 맞는 문제에 대해 포럼은 **Expression을 Rigid 쪽으로 옮기고 비브라토 슬라이더를 낮추라**고 답했다. "Rigid 쪽으로 가면 피치가 더 단단히 잠긴다"는 것이다. 한 아카펠라 제작자는 V2의 표현이 화음용으로 너무 강해 V1 Manual Mode로 돌아갔다 ([Dreamtonics forum t/7788](https://forum.dreamtonics.com/t/7788)). 부드러운 화음을 원할 때 Loudness나 모음 음소 강도를 낮추면 "부드러워지는 게 아니라 멀어진다". 다이내믹스를 바꾸는 것은 Tension과 Breathiness다 ([SynthV forum t/8404](https://forum.synthesizerv.com/t/topic/8404/3)). 사람 더블링의 편집 관례도 그대로 옮길 수 있다. b·d·g·k·t 같은 경자음은 리드에 맞춰야 리듬이 번지지 않는다 ([Sound On Sound](https://www.soundonsound.com/techniques/synchronised-singing)). 더블의 숨과 치찰음은 지우거나 줄인다. 리드와 더블의 자음이 어긋나면 상이 흐려지고 가사가 안 들린다 ([Bonedo](https://www.bonedo.de/artikel/editing-workflows-und-tools-fuer-gelungene-backing-vocals)). 키트가 이미 화음 노트의 `dF0VbrMod`를 0으로 두는 것은 리드 비브라토와의 맥놀이를 막는 올바른 선택이다. 다만 화음 트랙의 Expression·자음·숨 처리는 아직 비어 있다.

경고도 하나 있다. Pitch를 리셋하고 Rigid로 바꿔도 **평균 피치가 이상값보다 높게 나와 화음이 틀어진다**는 버그 보고가 2.0.3까지 이어졌다. 우회책으로 음정을 강제하는 PitchPerfect.js가 공유됐다 ([Dreamtonics forum t/1637](https://forum.dreamtonics.com/t/1637)). 2.2.x에서도 남아 있는지는 확인되지 않았다. 키트의 `pitchfix` 루프(렌더 f0를 재서 `pitchDelta`로 보정)를 화음 트랙에도 돌리면 이 문제를 측정과 보정으로 함께 해결할 수 있다.

## 2.2의 Unison과 자음 슬라이더는 사실상 화음 기능이다

2.1~2.2 릴리스 노트에서 화음 작업과 직접 관계된 변화는 다섯 가지다. 2.1.0은 Pitch Control Points를 재설계했다. 영역을 고르면 피치 곡선을 자동으로 포인트로 바꾸고, 리사이즈 박스로 벤드와 비브라토의 깊이·속도를 조절한다 ([Dreamtonics 2.1.0](https://dreamtonics.com/synthesizer-v-studio-2-1-0-final-update/)). 2.1.1은 스크립트에 `expValueX/Y`, `phonemes[]`, `getRetakes()`, `TrackMixer`, 그룹·노트 뮤트를 노출했다 ([Dreamtonics 2.1.1](https://dreamtonics.com/synthesizer-v-studio-2-1-1-final-update/)). 2.1.2는 Tension 최댓값 근처와 파열음 강도를 0에서 올릴 때 나던 아티팩트를 고쳤다. V1 프로젝트를 가져올 때도 Tension을 리셋하지 않고 근사값으로 옮기게 했다 ([Dreamtonics 2.1.2](https://dreamtonics.com/synthesizer-v-studio-2-1-2-final-update/)). 2.2.0(2026-01-15)이 가장 크다. **Unison(최대 16성, Spacing으로 스테레오 간격)**, 합창 보이스 전용 타이밍·피치 tightness 슬라이더, Unison을 개별 트랙으로 나누는 우클릭 명령, Effects 패널, 그룹별 스케일 표시, MusicXML 임포트, 그리고 **"그룹 안 모든 장애음(obstruent)의 강도와 길이를 조절하는 Voice 패널 슬라이더 2개"**가 들어왔다 ([Dreamtonics 2.2.0](https://dreamtonics.com/choir-voice-collections/), [SV2 매뉴얼 Voice Panel](https://sv2.docs.dreamtonics.com/en/voice-panel)). 베타 시절 설명에 따르면 자음 슬라이더는 "합창 보컬은 자음이 덜 두드러지기 때문에" 추가됐다 ([forum 2.2.0 beta](https://forum.dreamtonics.com/t/synthesizer-v-studio-2-pro-2-2-0-beta/7211)). 2.2.1(2026-03-02)은 Unison 싱어가 빠지는 문제와 트랙 복제 후 렌더 캐시 충돌을 고쳤다. 그룹 병합 시에는 노트가 많은 쪽의 보이스 파라미터를 쓰도록 바꿨다 ([Dreamtonics 2.2.1](https://dreamtonics.com/synthesizer-v-studio-2-pro-2-2-1/)). Unison이 내부적으로 AI 리테이크로 성부를 만든다는 점과 tightness 슬라이더가 합창 보이스에만 있다는 점은 베타 문구다. 테토 같은 비합창 보이스에서 Unison 품질이 어떤지는 확인하지 못했다.

Expression Pad의 네 모서리는 공식 정의가 있다. 좌상 Vibrant는 비브라토가 깊다. 우상 Refined는 안정적이고 숙련된 소리지만 변화가 적다. 우하 Raw는 피치 보정이 줄어 음정 이탈 가능성이 커진다. 좌하 Rigid는 평평하고 노트 경계에만 작은 흔들림이 있으며 **AI 리테이크의 영향을 받지 않는다** ([SV2 매뉴얼 Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel)). 일본어 UI에서는 순서대로 ダイナミック·リファイン·アクティブ·ストレート다 ([SV2 매뉴얼 ja](https://sv2.docs.dreamtonics.com/ja/notes-panel)). Expression은 노트의 모든 take에 공통으로 적용되고, Smart Pitch 포인트는 리테이크보다 우선한다 ([SV2 매뉴얼 AI Retakes](https://sv2.docs.dreamtonics.com/en/ai-retakes)). 그래서 화음 설계는 이렇게 나뉜다. **음정 정렬이 중요한 하모리는 Rigid~Refined로 고정하고, 두께용 더블은 리테이크로 변화를 준다.** 테토 AI 2 실사례 하나는 ストレート를 "중간까지만" 당겼다. 끝까지 당기면 비브라토가 사라지기 때문이다 ([kenchan note](https://note.com/kenchan21/n/nfa459d01256e)). 리드에서는 단점인 이 성질이 화음에서는 장점이다.

숙련자 워크플로의 공통 순서는 이렇다. 노트를 정리하고(인접 노트는 붙이고 프레이즈 사이는 띄운다), 섹션별 그룹에 보컬 모드를 정한다(최대로 들어 보고 줄인다). 다음으로 Expression Pad로 방향을 잡고, 리테이크를 피치 → 타이밍 → 음색 순으로 돌려 노트별로 고른다. 남는 문제만 Smart Pitch와 음소 타이밍 패널로 고치고, 마지막에 귀로 확인한다. 공식 문서는 보컬 모드가 Tension·Breath 조정보다 자연스럽다고 권하고 ([SV2 매뉴얼 Vocal Modes](https://sv2.docs.dreamtonics.com/en/vocal-modes)), 기본 take는 안정적이니 몇 번 리테이크하면 더 동적인 take가 나온다고 말한다 ([SV2 Changes Since V1](https://sv2.docs.dreamtonics.com/en/prev-version-changes)). 더블링 실무는 트랙을 비링크 복제하고 리테이크한 뒤 볼륨을 낮추는 것이다 ([Sleepfreaks](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/)). 영어권 조언 중 가장 쓸모 있는 것은 "기본 조교의 무엇이 잘못됐는지부터 물어라, 수정에는 목적이 있어야 한다"다 ([Dreamtonics forum t/7226](https://forum.dreamtonics.com/t/7226)).

흔한 실수는 화음에서 더 크게 들린다. 노트 사이 짧은 틈은 자음 시간을 빼앗아 부자연스럽다 ([SV2 매뉴얼 Pronunciation](https://sv2.docs.dreamtonics.com/en/phonemes)). V1식 노트 분할이나 자음 전용 노트는 품질 저하와 오발음을 부른다 ([Migration Guide](https://dreamtonics.com/synthesizer-v-studio-2-pro-upgrade-migration-guide/)). 정량화 그리드에서 s·z·k·ts가 박보다 일찍 들어가 "달리는" 느낌은 손대지 않은 SV 출력의 티다. 이 경우 Duration 슬라이더로 자음을 줄이면 오히려 더 급해진다는 반론이 있다 ([Dreamtonics forum t/7571](https://forum.dreamtonics.com/t/7571)). 화음 트랙이 리드와 같은 자음 타이밍을 상속하면 이 달림이 두 배로 들린다. 따라서 화음에는 **자음 강도를 낮추되 길이는 건드리지 않는** 조합이 맞다(추론). V2 보이스가 노트 끝에 큰 하강 글리산도를 붙이는 경향도 화음끼리 끝이 어긋나는 원인이다. 대응은 Rigid와 피치 포인트다 ([Dreamtonics forum t/4400](https://forum.dreamtonics.com/t/4400)).

운영상 가장 큰 변수는 라이선스다. 에디터를 사지 않은 채 체험이 끝나면 "Vocal Modes, AI Retakes, Expression Pad, Phoneme Timing Panel, Parameter Panel, Smart Pitch Controls, Dictionary"가 꺼지고 트랙은 1개로 제한된다. 렌더 내보내기는 된다 ([SV2 매뉴얼 Limitation](https://sv2.docs.dreamtonics.com/en/limitation)). **트랙 1개 제한은 화음 레이어 트랙 4개를 한 프로젝트에서 렌더하는 현재 구조를 직접 막는다.** 체험이 끝난 뒤에도 쓰려면 화음마다 .svp를 따로 내보내고, 곧은 음색은 믹스 단계에서 만드는 대안 경로가 필요하다.

## 자동 화음은 Viterbi 하나와 비용표 하나로 충분하다

상용 하모나이저는 공통적으로 네 가지 모드를 갖는다. 고정 반음 이동(Shift), 키·스케일 안의 음계 음정(Scale), 코드톤 추종(Chord), MIDI 직접 지정이다 ([Sound On Sound VoiceWorks](https://www.soundonsound.com/reviews/tc-helicon-voice-works)). TC-Helicon Vocalist의 Chord 타입 정의는 그대로 구현할 수 있다. "High = 리드 위의 다음 코드 음, Higher = 그다음 코드 음"이다 ([Bonedo](https://www.bonedo.de/artikel/workshop-korg-pa4x-serie-os-20-9-tc-helicon-vocalist/)). 리뷰어들은 "코드를 따라갈 수 있을 때 화음이 더 좋게 들린다"고 평가했다 ([Sound On Sound VoiceLive Touch 2](https://www.soundonsound.com/node/4903870)). Waves도 "키 없이는 어떤 음이 합법인지 판단할 수 없다"는 전제에서 키 감지기를 따로 두고, 대안 후보 2개를 함께 낸다 ([Pro Audio Design](https://www.proaudiodesign.com/products/waves-key-detector)). 그래서 구조는 **Chord 모드를 기본으로 하고, 코드 신뢰도가 낮으면 Scale 모드로 내려가는 2단**이 상용 장비 구조와 맞다. 내부 보이스 리딩 알고리즘은 어느 회사도 공개하지 않았다.

선택 문제는 동적계획(Viterbi)으로 푸는 것이 표준이다. Songsmith는 62개 이상 코드 후보 중에서 "모든 코드 변화에 걸친 불협 최소"를 Viterbi로 고른다 ([arXiv 2501.02642](https://arxiv.org/pdf/2501.02642)). 단일 화음 성부를 Viterbi로 정식화하고 가중치를 공개한 논문이나 코드는 찾지 못했으니, 비용 함수는 위 실무 규칙을 옮겨 직접 설계한다. 편곡 실례도 이 형태를 뒷받침한다. 기본은 3도 위로 하고, 멜로디가 두 음을 오가면 3도 추종이 어색하므로 6도·4도로 바꾼다. 코드와 심하게 부딪치면 4도로 옮긴다. 낮은 성부는 비어 있는 코드톤에 떨어지는 3도가 4도보다 나은 경우가 많다. 3도만 쌓이면 단조롭다 ([Ethan Hein](https://ethanhein.com/wp/2024/adding-vocal-harmony-to-a-tears-for-fears-song)). 여기서 비용 항이 나온다. 국소 비용은 리드와의 음정 선호, 코드톤 여부에 노트 중요도를 곱한 값, 음역 이탈로 구성한다. 전이 비용은 도약 크기, 연속 완전5도·8도, 성부 교차, 유니즌, 사행(같은 음 유지) 보너스로 구성한다. 탐욕 방식과 달리 Viterbi는 "이 음에서 4도로 피하면 다음 음에서 도약이 커진다"를 함께 본다. 그래서 화음선이 평평해진다는 실무 요구와 맞아떨어진다.

불확실성 처리는 상용 자료에서 직접 나오지 않으므로 설계 추론이다. 키트의 코드 시트는 사람이 귀로 적은 것이라 오차가 있다. 코드 추정기가 상위 k개 후보와 확률을 내면 기대 비용 `Σ P(chord_k)·local_cost`를 쓰면 된다. 단일 코드 시트라면 신뢰도 플래그로 대신한다. 리드가 음계 밖 음(블루노트 ♭3·♭7, 반음 경과)이면 짧을 때는 화음을 빼고, 길 때는 같은 반음 수로 평행 이동한다. 모달 믹스처(장조의 iv, ♭VI, ♭VII)가 나오면 그 구간의 스케일을 코드 구성음으로 덮어써야 한다. 스케일 3도가 코드 질과 안 맞아 E♭를 E로 고치는 사례가 바로 이 오류다 ([Ethan Hein](https://ethanhein.com/wp/2024/adding-vocal-harmony-to-a-tears-for-fears-song)).

평가에는 표준 벤치마크가 없다. 멜로디 화성 연구도 "표준화된 객관 지표가 없다"고 인정한다 ([Yeh et al., arXiv 2001.02360](https://arxiv.org/pdf/2001.02360)). 이식할 수 있는 정의는 두 가지다. **CTnCTR = (n_c + n_p)/(n_c + n_n)**은 코드톤 수와 "다음 음과 2반음 이내인 적절한 비화성음" 수를 합해 센다. **PCS**는 유니즌·3도·완전5도·6도에 +1, 완전4도에 0, 나머지에 −1을 주고 16분음 창마다 평균한다. 사람이 만든 화성은 CTnCTR 0.74, PCS 1.42였고, 템플릿 매칭은 0.91, 1.97로 오히려 "더 협화적"이었다 ([Yeh et al.](https://arxiv.org/pdf/2001.02360)). 이 숫자가 주는 교훈은 분명하다. **지표를 최대화하는 것이 자연스러움은 아니다.** 지표는 회귀를 잡는 경보로 쓰고, 목표치는 사람 편곡 분포와 비교해야 한다. 원곡 Suno 백킹에서 분리한 실제 화음이 있으면 그 분포가 가장 타당한 기준선이다. 다만 jugodo처럼 원곡 백킹의 85%가 같은 음·옥타브 더블이면 기준선으로 쓸 수 없다. 그 경우에는 키트의 `agree()`(생성 화음과 원곡 화음의 음이름 일치율)가 유일한 외부 기준이다.

## 키트에 넣을 규칙과 기본값

신뢰도 등급은 앞 보고서와 같다. **A**는 공식 문서나 로컬 저장 파일로 확인한 것, **B**는 동료심사 연구 또는 공식 정의를 그대로 이식한 지표다. **C**는 여러 실무 출처가 일치하는 것, **D**는 단일 출처이거나 일반 믹스 가이드 수치, **E**는 이 보고서의 추론으로 렌더해서 들어 봐야 한다. 기존 키트 기능 중 바꿀 곳은 "현재 → 제안"으로 적었다.

### 화음 작법 규칙 (sheet.py `generate()` 교체)

| # | 규칙 | 기본값 | 신뢰도 |
|---|---|---|---|
| H1 | 후보 집합: 리드 대비 같은 쪽의 음계 3도, 6도, 코드톤(±9반음 안), 4도, 5도. 2도·7도·유니즌은 후보에서 제외 | 위는 +3~+9, 아래는 −3~−9반음 | C |
| H2 | 노트 중요도 w = 길이 ≥1박, 강박(1·3박), 프레이즈 끝, 코드 변화 지점 중 하나라도 해당하면 1, 아니면 0.2 | 길이 임계 1박(BPM 120~160 기준) | C(개념) + E(수치) |
| H3 | 중요 음은 코드톤 또는 허용 텐션(6·9)이어야 하고, 아보이드(코드톤 반음 위)는 금지 | 비코드톤 비용 2.0·w, 아보이드 4.0·w | C |
| H4 | 중요하지 않은 음은 평행 3도를 유지한다. 단, 비화성 3도는 2음까지만 연속 허용 | 3번째부터 비용 +1.5 | C |
| H5 | 코드가 음계를 이긴다: 후보가 코드톤과 반음 차이로 부딪치면 코드톤으로 반음 변경(단조 V7의 이끎음 등) | 항상 켬 | C |
| H6 | 음정 선호 비용(\|h−p\| 반음): 3·4 = 0, 9 = 0.2, 8 = 0.3, 5 = 0.4, 7 = 1.0, 6(트라이톤) = 3.0 | 표대로 | C(순서) + E(값) |
| H7 | 연속 완전5도·8도 금지, 유니즌 착지 금지 | P5/P8 연속 +5.0, 유니즌 +8.0 | C |
| H8 | 도약 비용 0.15·\|Δh\|, 4도 초과 +2.0, 6도 초과 +4.0. 리드가 움직일 때 화음이 같은 음을 유지하면(사행) −0.3 | 표대로 | C(방향) + E(값) |
| H9 | 평행 3도가 4스텝 넘게 이어지면 단조 경고. 음정 히스토그램에서 3도가 80%를 넘으면 경고 | 경고만 | C(개념) + E(임계) |
| H10 | 풀이: 프레이즈 단위 Viterbi (현재: 노트별 탐욕, 한 칸 폴백) | numpy만 사용 | E |
| H11 | 지속음이 코드 변화에 걸치면 그 시점에서 분할해 재선택 | 분할 최소 길이 1/8박 | C |
| H12 | 2성부(up+dn)는 독립 Viterbi 후 두 화음 사이 유니즌·2도 충돌만 후처리. 두 화음 사이 트라이톤은 경고 | 후처리 | C(트라이톤) + E |
| H13 | 음역: 上ハモ ≤ 그 곡 리드 최고음, 절대 상한 A5. 리드가 D5 이상이면 下ハモ 우선 | 상한 A5 | E |
| H14 | 코드 신뢰도 정책: ≥0.6이면 Chord 모드, 0.3~0.6이면 코드톤 ∪ 음계(코드톤 가산), <0.3이면 Scale 3도. 장조의 iv·♭VI·♭VII 구간은 스케일을 코드 구성음으로 덮어쓴다 | 코드 시트의 `?` 표시를 0.4로 | E |
| H15 | 리드가 음계 밖 음일 때: 1/2박 미만이면 화음 생략(앞 화음 연장), 이상이면 같은 반음 수 평행 이동 | 표대로 | E |
| H16 | 최종 안전장치: 리드와 1·2·11반음이 1/8박 넘게 지속되면 옥타브로 바꾸거나 생략 | 항상 켬 | E |

### 리듬·가사 규칙 (가사 하모리와 패드 분리)

| # | 규칙 | 기본값 | 신뢰도 |
|---|---|---|---|
| R1 | 가사 하모리는 리드의 onset·offset·가사를 그대로 복사한다(현재 동작 유지) | 기본 모드 | C |
| R2 | 리드의 한 음절 안 멜리스마(같은 가사 `-` 연장 노트 여러 개)는 화음에서 한 노트로 병합하고 코드톤을 유지 | 병합 | E |
| R3 | 빠른 순차 비화성음(1/2박 미만, 다음 음과 2반음 이내, 약박)은 화음을 생략하고 앞 화음을 연장(사행) | 1/2박 | B(CTnCTR의 "적절 비화성음" 정의) + E |
| R4 | 패드 모드 `pad`: 코드마다 "う"나 "あ"로 코드톤 3성을 온·2분음표로 두고 순차 보이스 리딩. 줄일 때는 5음, 근음, 먼 텐션 순으로 뺀다 | 3성, 가사 う | C |
| R5 | `phrase_end` 모드: 프레이즈 마지막 지속음에만 화음 | 1박 이상인 끝 음 | C |

### 배치 규칙 (song.json `arrange` 기본 템플릿)

| # | 규칙 | 기본값 | 신뢰도 |
|---|---|---|---|
| A1 | `"*"`는 비움. A메로(Verse)는 항상 비움 | `{"sec":"*","use":[]}` | C |
| A2 | Pre-Chorus는 마지막 줄만 dn3 | `lines:[last]` | C |
| A3 | 1번 사비는 dn3를 훅 줄과 끝 줄에, 2번 사비는 dn3 전체 + 끝 줄 up3, 라스사비는 up3+dn3 전체 | 단계 쌓기 | C |
| A4 | Bridge·落ちサビ는 비우거나 `pad` | 비움 | C |
| A5 | 반복 섹션 일관성 검사: 1회차에 화음이 있던 줄 위치가 다음 회차에 없으면 경고 | 경고만 | D (Sound On Sound) |
| A6 | 밀도 검사: 라스사비 이전에 두 섹션 타입 이상에서 2성부를 쓰면 경고 | 경고만 | E |

### 화음 트랙 합성 설정 (add_layers)

| # | 키 | 기본값 | 신뢰도 |
|---|---|---|---|
| S1 | `attributes.dF0VbrMod` | 0.0 (현재 유지). 더블(같은 음) 트랙은 0.5 | C |
| S2 | `attributes.expValueX/Y` | Rigid 쪽 중간(완전 Rigid 아님). 실제 수치는 GUI 왕복 저장으로 확정 | A(의미) + D(중간값) + 범위 미검증 |
| S3 | 보컬 모드 `Harmony` | 리드 섹션 모드에서 Power·Rock은 −40, Mellow는 +30(현재 Mellow 40 고정 → 리드 섹션 따라감) | C(방향) + E(값) |
| S4 | `paramTension` / `paramBreathiness` | 리드보다 Tension −0.1, Breath +0.1. Loudness나 음소 강도로 부드럽게 만들지 않는다 | D |
| S5 | 그룹 자음 강도·길이 슬라이더(2.2.0) | 강도만 −30%, 길이는 그대로. .svp 키 이름은 GUI 저장 diff로 확정 | A(기능) + E(값·키) |
| S6 | 숨 `br` 노트 | 화음 트랙에서는 삭제. 숨은 리드만 쉰다 | D |
| S7 | `takes` | L/R 쌍은 서로 다른 seed. GUI 없이 임의 seed가 유효한지 미검증 | A(구조) + E |
| S8 | 화음 트랙 `pitchfix` | 리드처럼 렌더 → f0 측정 → `pitchDelta` 보정 2회. 평균 cent 편향이 ±10 c 넘으면 경고(t/1637 버그 감시) | D(버그) + E |

### 믹스 기본값 (트랙 mixer 및 사후 믹스)

| # | 항목 | 기본값 | 신뢰도 |
|---|---|---|---|
| M1 | 화음 게인(리드 0 dB 기준) | 단선 下ハモ −9, 단선 上ハモ −10, 라스사비 2성부 각 −10~−12, 더블 −10, 패드 −14. 사용자 취향 "있다 정도"면 −11~−14 | C(범위) + E(배분) |
| M2 | `mixer.pan` | 리드 0. 2성부는 up3 −0.35 / dn3 +0.35, 더블 L/R은 ±0.7. 단일 화음은 ±0.2 | D(Waves) + 범위(−1~1) 미검증 |
| M3 | L/R 원칙 | 같은 렌더를 양쪽에 쓰지 않는다. 다른 take, Unison 분할, 모드 블렌드 차이 중 하나 | C |
| M4 | 화음 버스 EQ | HPF 250~300 Hz, LPF 5.5 kHz(12 dB/oct), 2~5 kHz −2~−3 dB, 에어 부스트 없음 | D |
| M5 | 화음 버스 다이내믹스 | 4:1, 어택 10 ms, GR 2~4 dB. 디에서는 리드보다 강하게 | D |
| M6 | 리버브 | 리드와 같은 리버브 또는 더 짧게, 프리딜레이는 더 짧게, 바깥 쌍일수록 젖게 | D |
| M7 | 검사 | 모노 합산 콤 필터 청취, 유니즌 교차 지점 레벨 점프 확인 | C |

### 평가 리포트 (sheet.py `agree()` 확장)

| # | 지표 | 목표·경보 | 신뢰도 |
|---|---|---|---|
| Q1 | 화음 CTnCTR, PCS(화음 대 코드) | 사람 화성 기준 0.74 / 1.42 부근. 0.9 / 1.9를 넘으면 "너무 기계적일 수 있음" 참고 표시 | B(정의) + E(해석) |
| Q2 | 리드 대 화음 충돌률(1·2·11반음, 1/8박 초과) | < 2% | E |
| Q3 | 유니즌·옥타브 비율, 연속 P5/P8 수, 성부 교차 수 | 0에 가깝게 | C |
| Q4 | 평균 도약, 4도 초과 도약 수 | 리드보다 작아야 한다 | C |
| Q5 | 음정 히스토그램 | 3도 > 80%면 단조 경고 | E |
| Q6 | `agree()` 원곡 일치율 | 원곡 백킹 중 진짜 화음 비율이 30% 이상일 때만 의미 | E |
| Q7 | 렌더 후 화음 f0 평균 cent 오차 | \|편향\| ≤ 10 c | E |

## 결론

이번 조사로 키트 화음 기능의 병목이 바뀌었다. 지금까지는 "3도를 위로 놓을까 아래로 놓을까"를 사람이 `arrange`로 정하고 음정은 기계가 노트마다 골랐다. 실무 규칙이 요구하는 판단은 대부분 노트 사이 관계에 있다. 어떤 음이 중요한지, 비화성 3도가 몇 개째 이어지는지, 이 회피가 다음 음에서 도약을 만드는지, 이 회차가 앞 회차와 일관된지가 그렇다. 그래서 개선의 핵심은 새 음정 규칙이 아니라 **문맥을 보는 풀이기(Viterbi)와 노트 중요도 가중치**다. 이것만 들어가면 H3~H8은 비용표의 숫자 몇 개로 끝난다. 단조 V화음의 이끎음(H5)은 현재 코드가 실제로 틀린 음을 내는 유일한 확정 버그이니 가장 먼저 고칠 가치가 있다.

두 번째 함의는 시간 제약이다. 화음을 "곧고 어둡게" 만드는 SV2 수단(Expression, 모드, 리테이크, 자음 슬라이더)은 체험판이 끝나는 10/23 이후 모두 꺼진다. 트랙 1개 제한은 레이어 4개짜리 프로젝트 자체를 막는다. 그 전에 S2·S5·S7의 미검증 키를 GUI 왕복 저장으로 확정해 두어야 한다. 그리고 화음별 개별 .svp 내보내기와 사후 믹스 체인(M4~M6)을 대안 경로로 준비해야 한다. 그러면 라이선스 상태와 관계없이 같은 화음 품질을 유지할 수 있다. 비용 가중치와 음역 상한은 근거가 가장 약한 값이다. 이 값들은 Q1~Q5 리포트를 몇 곡에 돌려 귀로 판정한 결과로 덮어써야 한다. 그렇게 해야 가장 약한 근거(추론)가 가장 강한 근거(측정과 청취)로 대체된다.

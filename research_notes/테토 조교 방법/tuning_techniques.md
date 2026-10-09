# Japanese Vocal-Synth Tuning (調声 / 調教) Techniques for VOCALOID and Synthesizer V — Quantified Catalog

> Source-quality legend used throughout:
> - **[公式]** official vendor documentation (Dreamtonics / Yamaha)
> - **[研究]** academic / research source
> - **[実践]** named producer blog / note.com article / established DTM site (practitioner experience)
> - **[低信頼]** site with numeric tables but no traceable provenance (likely compiled or AI-assisted; treat as folklore-grade starting points, not measured facts)
>
> Overall finding: **practitioner sources almost never give cents/ms/Hz numbers**. Japanese producers express values as note-split lengths (1/16, 1/32, 1/64), scale steps, editor presets (Normal1, Type4), or relative directions. The only explicit cents/ms/Hz tables found came from research literature (vibrato ranges) and one low-provenance 2026 blog (core-ms.net). Several official Dreamtonics pages returned HTTP 403 and could not be read directly.

## 1. Pitch techniques (しゃくり, フォール, こぶし, ポルタメント, 揺れ, オーバーシュート/プレパレーション)

### Takeaway
しゃくり is universally built as a short pre-note (1/32–1/16 note) one scale step or a semitone/whole tone below (occasionally above) the target, or as a PIT/pitch-deviation curve; the only cents/ms figures available are ~50–150 cents below, rising in ~30–100 ms for scoops, and ~50–100 cents over ~20–50 ms for end falls (low-provenance). Portamento length scales with interval and is halved at fast tempos. All sources warn against using these on every note.

### Cited Findings
**しゃくり (scoop) — note-split method (VOCALOID/Piapro)**
- Cut the head of a note to a 16th or 32nd and place it below or above the melody; for connected notes use the previous note's pitch, otherwise a scale tone depending on interval/flow. Apply selectively. [実践] — [秋楽める (note)](https://note.com/give_uper/n/nb6510332ab32)
- Scoop length should be ~16th or 32nd note; longer sounds unnatural. Use in a few places only. [実践] — [ガルフィ (note)](https://note.com/mr_galfy/n/n6530cdb75294) (via search summary)
- 2-split scoop: start a whole tone below, a semitone below, or a semitone above; split 1/32 or 1/16 recommended. 3-split: semitone below → whole tone below, or semitone above → whole tone below, 1/32 or 1/16 each; warned it gets excessive ("諄くなる") if overused. Quantize to 1/64 (minimum) for splitting. Bend depth & bend length set to **0%** in VOCALOID4.5 ("重要"). Set **PBS 4** (±4 semitones) before drawing PIT. [実践] — [セブヶ崎詠人 (note)](https://note.com/aaaaa_hachinana/n/n3bfbf06dbab3)
- Sleepfreaks: shorten the note, insert a new note in the freed time one scale step below (two steps if too subtle). If the vowel produces an emphasized attack during the scoop, replace the vowel on the target note with 「ー」. [実践] — [Sleepfreaks ベタ打ち脱却② ピッチ編](https://sleepfreaks-dtm.com/produce-recipe/vocaloid-tips-2/)
- Piapro Studio's auto "ポルタメントを付加" is considered less realistic than hand-editing pitch nodes. [実践] — [If (note)](https://note.com/if_hoshu/n/n3a689c37bb26)
- A deeper BEND (VOCALOID note bend depth) lowers pitch and gives a smoother scoop than a PIT curve. [実践] — [Spar-c](https://spar-c.com/2024/04/02/vocaloid_adjust_voice/)
- Scoop from above gives a "cute" impression; used at phrase openings (音頭). [実践] — [avex ボカロクリエイターコース講義レポート (big-up)](https://big-up.style/zine/article/column/20240906-28990)

**しゃくり / fall — numeric (low provenance)**
- "Undershoot": start 50–150 cents below target, reach target within first 30–100 ms; larger undershoot on higher notes (~A4–C5). [低信頼] — [core-ms.net (2026-07)](https://core-ms.net/2026/07/16/vocaloid-tuning-natural-techniques/)
- Fall-off on last note of phrase: 20–50 ms, dropping 50–100 cents. [低信頼] — [core-ms.net](https://core-ms.net/2026/07/16/vocaloid-tuning-natural-techniques/)

**フォール / 語尾上げ**
- Fall = lowering from the written pitch, drawn with PIT; most effective on long notes. [実践] — [ガルフィ (note)](https://note.com/mr_galfy/n/n6530cdb75294) (via search summary)
- Fall is common in rock; 語尾上げ (raising phrase ends) is common in cute/character/idol songs. [実践] — [avex lecture (big-up)](https://big-up.style/zine/article/column/20240906-28990)
- ヒーカップ: cut head or tail of a note and place the fragment ~1 octave up; use at long-tone endings or the phrase's highest note. [実践] — [秋楽める (note)](https://note.com/give_uper/n/nb6510332ab32)

**ポルタメント**
- VOCALOID POR (Portamento Timing): producer example value **83** for a melody; higher → scoop-like, lower → moves to next note earlier. [実践] — [秋楽める (note)](https://note.com/give_uper/n/nb6510332ab32)
- POR positive = slower transition to next note, negative = faster. [実践] — [Spar-c](https://spar-c.com/2024/04/02/vocaloid_adjust_voice/)
- Portamento time by interval: 1–2 semitones 30–60 ms; 3–5 semitones 60–100 ms; 6+ semitones 100–160 ms; at BPM 140+ use roughly half; ballads (BPM 60–80) longer. [低信頼] — [core-ms.net](https://core-ms.net/2026/07/16/vocaloid-tuning-natural-techniques/)
- Pitfall: VOCALOID draws pitch smoothly across connected notes so a phrase end bends toward the next phrase; fix by shortening the last note by a 16th and re-adding a 16th-note with the same syllable. [実践] — [Sleepfreaks](https://sleepfreaks-dtm.com/produce-recipe/vocaloid-tips-2/); same issue noted by [If (note)](https://note.com/if_hoshu/n/n3a689c37bb26)
- Same-pitch consecutive notes hold pitch longer and the next note pulls pitch earlier than expected ("hidden portamento"); VOCALOID5 non-plain styles alter portamento, so plain styles recommended. [実践] — [セブヶ崎詠人](https://note.com/aaaaa_hachinana/n/n3bfbf06dbab3)

**オーバーシュート / プレパレーション (research)**
- AIST (Saitou & Goto) singing-instruction study: F0 dynamic components such as overshoot and vibrato changed after instruction; in listening tests the contribution to perceived singing skill ranked **vibrato > singer's formant > overshoot > preparation**. Small sample (4 amateurs). [研究] — [Saitou & Goto, ASJ 2008/2009 (AIST)](https://staff.aist.go.jp/m.goto/PAPER/ASJ200809saitou.pdf) (content via search summary; PDF text not extractable)

**SynthV pitch model [公式]**
- Note Properties pitch transition controls the curve near note boundaries; vibrato applies to the middle of the note; these are for quick rough contours, with detail work in the parameter panel. [公式] — [Synthesizer V manual: Pitch Transition and Vibratos](https://synthesizerv.com/manual/pitch_transition_and_vibratos.htm) (via search summary; page now redirects)
- Final displayed pitch = note's base pitch curve + Pitch Deviation parameter. Pitch modes: Sing, Rap, Manual, set per note. [公式] — [Dreamtonics docs: pitch basic](https://svdocs.dreamtonics.com/en/synthv/advanced-usage/pitch-basic) (via search summary)

### Inferences
- A practical numeric translation of the producers' "1/32–1/16 note split" scoop: at BPM 120 a 16th = 125 ms and a 32nd = 62.5 ms; at BPM 180 a 16th = 83 ms, 32nd = 42 ms. This lines up with the low-provenance 30–100 ms scoop figure, giving it some cross-support. Depth "semitone / whole tone below" = 100 / 200 cents, i.e., somewhat deeper than the 50–150 cents figure — because note-split scoops are smoothed by the engine's own transition, the audible dip is usually less than the written interval.
- Suggested default parameter seed for Teto (to be verified by ear): scoop −100 cents over ~60–90 ms on phrase-initial and emphasized notes only; fall −50 to −100 cents over 40–80 ms on phrase-final notes in rock; no こぶし by default.

### Gaps
- **こぶし** and **ピッチの「ためらい」** and **音程の揺れ (fine fluctuation / drift)**: no sourced technique or numbers found in Japanese vocal-synth sources within the search budget.
- No source gave numeric overshoot amount (cents) or duration for synth tuning; the AIST paper PDF could not be text-extracted.
- No producer-published values for SynthV Note Properties pitch transition (offset, duration left/right, depth left/right).

## 2. Vibrato (rate, depth, onset, envelope, genre)

### Takeaway
Research consensus: natural vibrato is ~4–7 Hz and 50–200 cents peak-to-peak extent (0.5–2.0 semitones). Producers apply vibrato to long tones only (≥1 beat, latter 1/3–1/2 of the note), with delayed onset (~200–400 ms) and fade-in; fast/rock genres use shallower depth. Producers typically pick presets (VOCALOID "Normal1/Type4", "slight1") rather than numbers.

### Cited Findings
- Vibrato rate generally 4–7 Hz, modulation extent 0.5–2.0 semitones (50–200 cents) perceived as natural; appropriate vibrato rate linked to higher singing evaluation. [研究] — [IPSJ MUS19123012 (Morise lab, Meiji Univ.)](https://www.isc.meiji.ac.jp/~mmorise/lab/publication/paper/IPSJ-MUS19123012.pdf) (via search summary)
- Morise et al. found natural rate/depth ranges via subjective evaluation, with small dependence on singer and pitch. [研究] — [JST PRESTO annual report 2020](https://www.jst.go.jp/kisoken/presto/evaluation/nenpou/r02/JST_1112083_18070378_2020_PYR.pdf) (via search summary)
- (Instrumental reference) violin/cello average vibrato ~5.5 Hz. [研究, not singing] — [JRME study (SAGE)](https://journals.sagepub.com/doi/abs/10.2307/3345438) (via search summary)
- VOCALOID4: vibrato length set as 0–100 % of note; depth and rate drawn as time-curves (can change within the note). VOCALOID5-era design: preset + 2-axis depth/rate. [研究/公式-adjacent] — [IPSJ MUS19123012](https://www.isc.meiji.ac.jp/~mmorise/lab/publication/paper/IPSJ-MUS19123012.pdf) (via search summary)
- Producer practice: on long tones apply "Normal Type4" and adjust onset %; closer to 100 % starts earlier. [実践] — [秋楽める](https://note.com/give_uper/n/nb6510332ab32). Use Normal1 for standard; slight1 when flat-sounding but strong vibrato unwanted. [実践] — [If](https://note.com/if_hoshu/n/n3a689c37bb26)
- Vibrato is best on long tones. [実践] — [Spar-c](https://spar-c.com/2024/04/02/vocaloid_adjust_voice/). In slow songs long-tone vibrato is important. [実践] — [ragnet.co.jp](https://www.ragnet.co.jp/vocaloid-composition-vibrato) (via search summary)
- Sine vibrato over split notes works well ("優秀"). [実践] — [セブヶ崎詠人](https://note.com/aaaaa_hachinana/n/n3bfbf06dbab3)
- Make vibrato finer toward note end using DYN + PIT + PBS. [実践] — [avex lecture](https://big-up.style/zine/article/column/20240906-28990)
- For chorus/harmony tracks, offset vibrato depth/rate/type between parts so they don't align. [実践] — [gihyo.jp VOCALOID連載 第5回](https://gihyo.jp/lifestyle/serial/01/vocaloid/0005)
- Numeric table: onset delay 200–400 ms; natural depth 20–60 cents; depth ramps ~10–20 cents early → 30–50 cents later; rate 5–7 Hz; genre: J-POP ballad 30–50 c / 5.0–6.0 Hz / 300–500 ms; anime/vocaloid 20–40 c / 6.0–7.0 Hz / 200–350 ms; rock/pop 15–35 c / 5.5–7.0 Hz / 250–400 ms; classical 40–70 c / 5.5–6.5 Hz / 150–300 ms. Constant rate sounds mechanical; vary slightly. Apply on notes ≥1 beat, in latter 1/3–1/2. [低信頼] — [core-ms.net](https://core-ms.net/2026/07/16/vocaloid-tuning-natural-techniques/)
  - Note: the core-ms "depth 20–60 cents" likely means ± amplitude (one-sided), whereas the research "50–200 cents" is extent; they are not directly contradictory but units are ambiguous.
- SynthV vibrato fields (scripting API, v1): frequency `fF0Vbr` (Hz), depth `dF0Vbr` (semitones), start/left/right `tF0VbrStart/Left/Right` (seconds), phase `pF0Vbr` (−π..π). [公式] — [SynthV Scripting Manual: Note](https://resource.dreamtonics.com/scripting/Note.html)
- SynthV: Start = delay from note start; Left = time to reach full depth; Right = decay at note end; Jitter = natural random fluctuation added. Defaults come from the Voice panel. In **Sing** mode the AI vibrato ignores vibrato sliders (Vibrato Envelope parameter still scales it); switching to **Manual** resets vibrato depth to 0 and flattens pitch; Auto Pitch Tuning sets depth 0 except manually set notes. [公式/準公式] — [Unofficial SynthV manual: Manual pitch mode](https://manual.synthv.info/advanced/pitch-mode-manual/); [dcuny synth-v-scripts](https://github.com/dcuny/synth-v-scripts); [SynthV manual](https://synthesizerv.com/manual/pitch_transition_and_vibratos.htm)

### Inferences
- For Teto (UTAU-origin, rock-leaning character) a defensible seed: rate 5.5–6.5 Hz, ±25–40 cents (≈0.25–0.4 semitone in SynthV `dF0Vbr` if depth is amplitude), start 0.25–0.35 s, left fade 0.15–0.25 s, only on notes ≥ ~1 beat or phrase-final long tones; fast vocarock: shallower (±15–25 c) and only on final long notes.
- SynthV `dF0Vbr` unit semantics (amplitude vs peak-to-peak) should be verified empirically by rendering and measuring F0.

### Gaps
- Exact SynthV default vibrato values (often quoted as ~5.5 Hz) could not be confirmed — Dreamtonics doc pages returned 403.
- No producer-sourced Hz/cents values for VOCALOID presets (Normal1, Type4, etc.).

## 3. Dynamics & timbre (DYN/VEL, breath, Tension/Breathiness/Gender, OPE/CLE/BRI, edge, 語尾処理)

### Takeaway
Voice-character parameters (BRI/BRE/GEN/CLE/OPE in VOCALOID; Tension/Breathiness/Gender/Tone Shift in SynthV, range −2..+2) should be set first and kept constant through a song; DYN/Loudness shapes phrases. Breaths go only before important phrases, 6–12 dB below the lead (low provenance). 語尾息 is produced with voiceless phonemes (h / C / p¥ or vowel_0) faded with DYN.

### Cited Findings
**SynthV parameter ranges [公式]**
- Loudness: −∞ to +24 dB, default 0 dB. Tension: −2 to +2 (default 0; lower = relaxed, higher = tense). Breathiness: −2 to +2 (default 0). Voicing: default max = normal, lower = whisper-like. Gender: −2 to +2 (formant/thickness). Tone Shift (Pro): changes perceived register without pitch change. — [Dreamtonics SV1 docs: parameters](https://sv1.docs.dreamtonics.com/en/synthv/advanced-usage/parameters) (via search summary; direct fetch 403)
- User report: on AI voices Tension raising does little and lowering mainly reduces volume (compensate with Loudness); for Standard voices tension is post-processing on samples, for AI it biases the engine. Loudness raises volume but not perceived effort. [実践/forum] — [SynthV forum topic 5603](https://forum.synthesizerv.com/t/topic/5603) (via search summary)
- SynthV 2 Vocal Modes can separately set application strength for pitch, timbre, pronunciation. [公式-forum] — [Dreamtonics forum](https://forum.dreamtonics.com/t/any-good-guide-or-video-explaining-vocal-modes-realistic-usage/2399) (via search summary)

**VOCALOID timbre/dynamics [実践]**
- Fix voice-quality params for the whole song. BRI↑ bright, BRE↑ breathy/husky, GEN↑ masculine, CLE↑ transparent, OPE↑ clearer articulation. Cute/young: BRI↑ BRE↓ GEN↓; mature: BRI↓ BRE↑ GEN↓. DYN to shape phrases and to lift syllables that sound quiet. — [Spar-c](https://spar-c.com/2024/04/02/vocaloid_adjust_voice/)
- GEN example value 46 (lower = younger). — [秋楽める](https://note.com/give_uper/n/nb6510332ab32). Producer estimate that popular producers keep Miku GEN ~30–40 (self-admitted unverified → folklore). — [If](https://note.com/if_hoshu/n/n3a689c37bb26)
- Falsetto: lower OPE and DYN on target high notes, then raise back; BRE mainly made the vocal harder to hear. — [If](https://note.com/if_hoshu/n/n3a689c37bb26)
- Most needs covered by VEL, DYN, PIT, PBS; start with PIT, add DYN. — [avex lecture](https://big-up.style/zine/article/column/20240906-28990)
- DYN curve numbers: phrase start 70–80 rising to 100–110 by 2nd–3rd note; phrase end ~80→~50; chorus high notes 100–120 (VOCALOID DYN 0–127 scale). [低信頼] — [core-ms.net](https://core-ms.net/2026/07/16/vocaloid-tuning-natural-techniques/)

**Breath**
- VOCALOID breath via phoneme `br1`–`br5` (Alt+↓ phoneme input); length follows note length (short "ハッ", long "ハァー"); don't overlap breath notes with vocal notes; put them on a separate track. — [piapro text](https://piapro.jp/t/U4rD) (via search summary); [gihyo 第5回](https://gihyo.jp/lifestyle/serial/01/vocaloid/0005)
- VOCALOID6 has automatic breath insertion; positions cannot be set arbitrarily. [公式] — [VOCALOID FAQ 656](https://www.vocaloid.com/support/faq/656) (via search summary)
- Breath level 6–12 dB below main vocal; at BPM 90, breaths longer than 200–300 ms make the next entry drag; place only before important phrases. [低信頼] — [core-ms.net](https://core-ms.net/2026/07/16/vocaloid-tuning-natural-techniques/)

**語尾処理 / 息っぽさ**
- Mitchie M (famous producer) three methods: (1) E.V.E.C. Voice Release phonemes `*#1` (short) / `*#2` (long) at phrase end; (2) fricative: after あ use `h`, after い `C`, after う `p¥`, length = breath duration, fade with DYN to avoid mechanical sound; (3) whisper vowel `a_0 / i_0 / M_0 / e_0 / o_0` (louder, may need high-end taming). — [Mitchie M blog](https://mitchie-m.com/blog/vocaloid/voice-release-breath/)
- avex lecture: add h / p¥ / C at note end (case matters for voicing); change ending vowel for feel. — [big-up](https://big-up.style/zine/article/column/20240906-28990)
- Alternative: type は/ひ/へ/ほ and cut the vowel with DYN to leave only the consonant. — [ameblo korakuone](https://ameblo.jp/korakuone/entry-12130194526.html) (via search summary)

### Inferences
- SynthV equivalent of 語尾息: ramp Breathiness up (+0.5 to +1.0) and Loudness down over the last ~100–200 ms of a phrase-final note, or append a short breath/"h" note; this is an inference, not sourced.
- Breath placement as a time budget: at BPM 150 an 8th = 200 ms, so a breath note of an 8th or 16th is the natural ceiling for fast vocarock.

### Gaps
- **エッジ (vocal fry at phrase start)**: no sourced technique found for VOCALOID/SynthV.
- No numeric guidance for SynthV Tension/Breathiness/Gender values by genre; no Teto-specific values.
- 開口度 (OPE) and クリア度 (CLE) values: only directional guidance.

## 4. Timing (子音の先行, 母音の長さ, っ/ん/長音, ハネ/グルーヴ)

### Takeaway
In VOCALOID, VEL controls consonant length/attack: higher VEL = shorter consonant = crisper, used for up-tempo/早口; consonants can also be split into a separate preceding note. Moving notes slightly earlier keeps attacks from being buried. No source gave ms values for consonant lead.

### Cited Findings
- VEL is the consonant-length parameter; raising VEL shortens consonants, improving diction in up-tempo/fast songs; too high makes consonants hard to hear. — [ムセキノオト](https://musekinote.com/parameter/); [piapro text (コントロールトラック)](https://piapro.jp/t/eTy3) (both via search summary)
- Max velocity → shorter consonants, min → longer; longer consonants make plosives in 「っ」「ぱっ」「ぺっ」 stand out, suited to staccato/fast tracks; DYN on the noise portion yields cleaner consonants. Each character has different default consonant strength. — [avex lecture](https://big-up.style/zine/article/column/20240906-28990)
- Consonant split: place the consonant as its own note before the vowel note; its length sets consonant length (VEL not needed). Hyphen-split consonants can garble. — [セブヶ崎詠人](https://note.com/aaaaa_hachinana/n/n3bfbf06dbab3)
- If pronunciation is buried, move the note slightly earlier to keep the attack; layer consonant-only notes on another track to reinforce. — search summary of [Sleepfreaks ①](https://sleepfreaks-dtm.com/produce-recipe/vocaloid-tips-1/) and [modeeisennui (ノートの位置)](https://modeeisennui.com/dtm/miku-edit-pronunciation-3/)
- Shorten/quiet inessential vowels (e.g., the vowel of 「ず」) via note length and DYN. — [gihyo 第5回](https://gihyo.jp/lifestyle/serial/01/vocaloid/0005)
- Shift a note's tail slightly later for a bouncy accent. — [Spar-c](https://spar-c.com/2024/04/02/vocaloid_adjust_voice/)
- After splitting, the trailing piece's lyric becomes 「ー」; retype as the matching vowel if it sounds wrong. — [秋楽める](https://note.com/give_uper/n/nb6510332ab32)
- SynthV: after Auto Pitch, standard fix-ups include aligning consonant lengths. — [十竜 SynthV講座 #05 (note)](https://note.com/hiryukaoku/n/nc442cd082a07) (via search summary)

### Inferences
- Both engines place the consonant before the note-on automatically so the vowel lands on the beat (general engine behavior; not confirmed by a source here). Tuning therefore adjusts consonant *length* (VEL / SynthV phoneme duration) rather than moving the note, except when deliberately pushing attacks.

### Gaps
- No ms figures for consonant lead or SynthV phoneme-duration scaling.
- No sourced technique for 「っ」(sokuon gap length), 「ん」, or 長音 specific handling beyond the 「ー」 replacement trick.
- No sourced ハネ/swing quantities.

## 5. Workflow order, overdoing pitfalls, SynthV AI vs VOCALOID

### Takeaway
Recommended orders: voice quality (fixed) → VEL/DYN/PIT/vibrato → advanced (pronunciation, accents, bend, POR), or notes → pitch → vibrato & dynamics → breath/details, working in ~8-bar chunks. VOCALOID tuning is *additive*; SynthV AI tuning is *subtractive* (remove excess AI しゃくり, fix pitch errors, choose among AI Retakes). Universal pitfall: stacking every technique on every note.

### Cited Findings
- Order: 1) voice quality BRI/BRE/GEN/CLE/OPE fixed for song; 2) VEL, DYN, PIT, vibrato; 3) pronunciation, accents, BEND, POR. Changing many params at once causes confusion. — [Spar-c](https://spar-c.com/2024/04/02/vocaloid_adjust_voice/)
- Order: note input → pitch curve → vibrato & dynamics → breath/detail; work in 8-bar units; per-chorus time beginner 4–8 h, intermediate 1.5–3 h. [低信頼] — [core-ms.net](https://core-ms.net/2026/07/16/vocaloid-tuning-natural-techniques/)
- Producer order: POR → consonant splits → heaking → GEN → singing style ("Strong Accent" preset for crisp diction) & vibrato → real-time autotune (Waves Tune Real-Time, keeps natural wobble vs Melodyne being too straight). — [秋楽める](https://note.com/give_uper/n/nb6510332ab32)
- Export with volume max, reverb/ambience off; then EQ/comp/reverb in DAW. — [If](https://note.com/if_hoshu/n/n3a689c37bb26)
- VOCALOID = addition; AI synthesis = subtraction (output already natural; remove excess しゃくり and pitch errors). Untuned input can be acceptable if it fits the song. Don't stack all techniques. Study, don't copy, artists' consonant/vibrato habits. — [avex lecture](https://big-up.style/zine/article/column/20240906-28990)
- Overuse warnings for しゃくり/ポルタメント: [ガルフィ](https://note.com/mr_galfy/n/n6530cdb75294), [セブヶ崎詠人](https://note.com/aaaaa_hachinana/n/n3bfbf06dbab3), [秋楽める](https://note.com/give_uper/n/nb6510332ab32) ("全部分割しない、耳で判断")
- SynthV: Auto Pitch Tuning applies each voicebank's method to selected notes; manual work via direct pitch edit or Pitch Deviation; set Pitch Mode to Manual for fine per-note control; AI Retake generates multiple takes with different singing/pitch nuance to choose from. — [セブヶ崎詠人 SynthV AI 調声2](https://note.com/aaaaa_hachinana/n/na1fd54749f7a); [十竜 #05](https://note.com/hiryukaoku/n/nc442cd082a07); [AHS product page](https://www.ah-soft.com/synth-v/sp1/) (via search summary)
- SynthV Studio 2 Pro offers "Rigid Expression" for flat mechanical pitch. — search summary of [SynthV forum 5603](https://forum.synthesizerv.com/t/topic/5603) — low confidence on exact feature naming.

### Inferences
- For a SynthV teto project generated as .svp: the right default is Sing mode (AI pitch) + selective Manual overrides, plus Retake selection, rather than hand-drawing everything; hand-written cents curves should go into Pitch Deviation (additive), which preserves the AI base curve.

### Gaps
- No primary producer interview giving a full step order with numbers for SynthV specifically.

## 6. Genre styles (高速ボカロック, バラード, ラップ/早口)

### Takeaway
Fast vocarock: higher VEL (short, crisp consonants), slightly early attacks, vibrato only on long/phrase-final notes and shallow, portamento roughly halved, falls at phrase ends. Ballad: longer portamento, deeper/slower vibrato with later onset, breaths matter. Rap/talk: higher PBS and SynthV Rap pitch mode. Most genre numbers come from the low-provenance table.

### Cited Findings
- Fast/早口: raise VEL for crisp diction; consonant length adjustments for staccato/fast tempo. — [ムセキノオト](https://musekinote.com/parameter/) (via search summary); [avex lecture](https://big-up.style/zine/article/column/20240906-28990)
- Rock: falls and ending vowel changes; idol/cute: raised endings, scoop from above. — [avex lecture](https://big-up.style/zine/article/column/20240906-28990)
- BPM 140+: portamento ~half length; rock/pop vibrato 15–35 cents, 5.5–7.0 Hz, 250–400 ms delay; ballad 30–50 cents, 5.0–6.0 Hz, 300–500 ms. [低信頼] — [core-ms.net](https://core-ms.net/2026/07/16/vocaloid-tuning-natural-techniques/)
- Talk/speech-style: higher PBS; questions = PBS high + PIT rising at end; large PIT moves can alter timbre. — [gihyo 第5回](https://gihyo.jp/lifestyle/serial/01/vocaloid/0005); [avex lecture](https://big-up.style/zine/article/column/20240906-28990)
- SynthV has a dedicated Rap pitch mode per note. [公式] — [Dreamtonics pitch basic](https://svdocs.dreamtonics.com/en/synthv/advanced-usage/pitch-basic) (via search summary)
- Slow songs: long-tone vibrato is important. — [ragnet](https://www.ragnet.co.jp/vocaloid-composition-vibrato) (via search summary)

### Inferences
- Teto-style 高速ボカロック seed: VEL high / SynthV consonant lengths shortened, scoops ≤ 1/32 note on accented downbeats only, no vibrato on notes < 1 beat, ±15–25 c vibrato at 6–7 Hz on phrase-final notes with 0.25–0.35 s onset, falls −50…−100 c on line ends, Tension slightly positive for chorus (verify AI-voice responsiveness, which forum users report as weak).

### Gaps
- No dedicated Japanese guide for 高速ボカロック tuning was found (search confirmed absence within budget).
- Chinese 调教 (bilibili) sources were not reached within the tool budget.
- No sourced numbers for rap/早口 SynthV Rap mode parameters.

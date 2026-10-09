# Synthesizer V Studio 2 Pro: tuning parameters and their .svp JSON form

Scope: SynthV Studio 2 Pro 2.1.x (local install is 2.1.2, which saves `"version": 187`), voice Kasane Teto AI 2 (`backendType "SVR3"`, database version `"201"`, which is a V2 voice). Evidence comes from three places:
(a) the official Dreamtonics scripting manual (generated 2025-10-09 for SV2 Pro) and the SV2 user manual;
(b) the LibreSVIP `.svp` Pydantic model, a third-party reverse-engineered converter;
(c) local files that SynthV 2.1.2 itself wrote: the recovery autosaves in `C:\Users\parkk\AppData\Roaming\Dreamtonics\Synthesizer V Studio 2\recovery\2026-10-09\*.svp`. These are cited as "local app-saved file".

Each point says which source it rests on. Anything resting only on LibreSVIP, or on nothing, is marked UNVERIFIED.

---

## 1. Parameter curves (group `parameters` object): key names, units, ranges, point format, mode

### Takeaway
Every note group (`library[]` and `tracks[].mainGroup`) carries a `parameters` object with 9 curve keys: `pitchDelta, vibratoEnv, loudness, tension, breathiness, voicing, gender, toneShift, mouthOpening`. Each curve is `{"mode": "...", "points": [t0, v0, t1, v1, ...]}`. The points list is flat and alternates time and value. Times are blicks relative to the group, and values are in the parameter's own units. Vocal-mode automation lives separately in the group's `vocalModes` object, as `{ModeName: curve}`.

### Cited Findings
- SV2.1.2 writes all 9 keys for every group, each defaulting to `"mode": "cubic", "points": []`. The keys are `pitchDelta, vibratoEnv, loudness, tension, breathiness, voicing, gender, toneShift, mouthOpening`. Next to them it writes `"vocalModes": {}` and `"pitchControls": []`. — [local app-saved file: recovery/2026-10-09/79838bd1_2026-10-09_17-02.svp](file:///C:/Users/parkk/AppData/Roaming/Dreamtonics/Synthesizer%20V%20Studio%202/recovery/2026-10-09/)
- The point format is a flat alternating array, as the app saves it, for example loudness `[23018072400, -0.0, 23263832400, -0.079999998211861, 23509592400, 0.629999995231628, ...]`. Values carry float32 rounding artefacts, which shows the app re-serialized them. — [local app-saved file iiko_teto_v10_2026-10-09_19-24.svp](file:///C:/Users/parkk/AppData/Roaming/Dreamtonics/Synthesizer%20V%20Studio%202/recovery/2026-10-09/)
- LibreSVIP parses `points` in pairs (`batched(points, 2)` into `(offset:int, value:float)`) and serializes them back flat. It allows these `mode` literals: `"linear" | "cubic" | "cosine" | "sigmoid"`. — [LibreSVIP model.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/model.py)
- The scripting API names three interpolation methods: Linear, Cosine and Cubic ("a modified Catmull-Rom spline"). Each position holds at most one point. Automations belong to a NoteGroup, not to a Track. — [Dreamtonics scripting: Automation](https://resource.dreamtonics.com/scripting/Automation.html)
- The UI calls the third interpolation mode "Spline", which is cubic spline interpolation. Interpolation mode is set per parameter. — [SV2 manual: Parameter Panel](https://sv2.docs.dreamtonics.com/en/parameter-panel)
- Official ranges from `Automation.getDefinition()`:

  | Display name | `typeName` / JSON key | Range | Default |
  |---|---|---|---|
  | Pitch Deviation | `pitchDelta` | -1200 to 1200 cents | 0 |
  | Vibrato Envelope | `vibratoEnv` | 0 to 2 (multiplier) | 1 |
  | Loudness | `loudness` | -48 to 12 dB | 0 |
  | Tension | `tension` | -1.0 to 1.0 | 0 |
  | Breathiness | `breathiness` | -1.0 to 1.0 | 0 |
  | Voicing | `voicing` | 0.0 to 1.0 | 1 |
  | Gender | `gender` | -1.0 to 1.0 | 0 |
  | Vocal Mode | `vocalMode_<Name>` | 0 to 150 | 0 |

  `toneShift` and `mouthOpening` are missing from this table. — [Dreamtonics scripting: Automation](https://resource.dreamtonics.com/scripting/Automation.html)
- An MCP bridge for SV2 enforces the same validation ranges (loudness -48 to +12 dB, pitchDelta ±1200 cents, vocal mode 0–150) and lists the editable curves as `pitchDelta, vibratoEnv, loudness, tension, breathiness, voicing, gender, vocalMode_*`. It has no toneShift or mouthOpening curve. — [glama.ai: SynthV MCP server](https://glama.ai/mcp/servers/hhybertbhr)
- Official meanings and advice from the SV2 manual:
  - Loudness: fine control of dynamics.
  - Tension: lower gives a softer voice, higher a tenser or strained one.
  - Breathiness: balances periodic and aspiration components. Too high adds noise; too low sounds muffled.
  - Gender: changes the formant. The manual says "increasing the value makes the voice sound more masculine". Note that this runs opposite to the scripting table's direction label "Masculine ↔ Feminine", so the sign needs checking by ear.
  - Tone Shift: changes the register without changing pitch. Up sounds like head voice, down like chest voice. The manual's example is to raise it slightly on notes just below the falsetto range to make them sound falsetto.
  - Pitch Deviation is "combined with pitch curves generated by AI and Smart Pitch Control… primarily used to maintain compatibility with earlier versions".
  - Vibrato Envelope sets vibrato intensity over time.
  - Voicing at its default (maximum) sounds normal; lowering it makes the voice whisper-like.
  - Mouth Opening sets the degree of mouth opening, and the current opening is drawn as a dotted line.
  - Rap Intonation is a separate arrow editor that appears only in Rap Mode.

  Manual advice: "For manipulating voice texture and timbre, using Vocal Modes tends to produce more natural results than base parameters." — [SV2 manual: Base Parameters](https://sv2.docs.dreamtonics.com/en/parameters)
- Voice-panel (group-level) values are added to the Parameter Panel curve values. Up to 3 Parameter Panels can be open at once. — [SV2 manual: Voice Panel](https://sv2.docs.dreamtonics.com/en/voice-panel); [Parameter Panel](https://sv2.docs.dreamtonics.com/en/parameter-panel)
- Vocal-mode curves in the group: LibreSVIP models the group's `vocalModes` as `dict[str, SVParamCurve]`, keyed by mode name, using the same `{mode, points}` curve shape. — [LibreSVIP model.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/model.py)
- In the Parameter Panel only the overall level of a vocal mode can be automated. The separate pitch, timbre and pronunciation levels can be set only in the Voice Panel, per group. — [SV2 manual: Vocal Modes](https://sv2.docs.dreamtonics.com/en/vocal-modes)
- The SV1-era "Instant mode" also wrote a ref-level `systemPitchDelta` curve. LibreSVIP models it on refs as `systemPitchDelta`. — [LibreSVIP model.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/model.py)
- Our own generated projects use `pitchDelta`, `loudness`, `tension` and `breathiness` points on the Teto AI 2 groups. SV2.1.2 loaded them and re-saved them with the points intact. — [local app-saved file iiko_teto_v10/v11/v12/v13 autosaves](file:///C:/Users/parkk/AppData/Roaming/Dreamtonics/Synthesizer%20V%20Studio%202/recovery/2026-10-09/)

### Inferences
- Curve times are group-relative blicks. One quarter note is 705,600,000 blicks (confirmed in our local tooling and on the forum: [Dreamtonics forum thread](https://forum.synthesizerv.com/t/topic/10831)). For an absolute song time, add the ref's `blickOffset`.
- Writing `"mode": "cubic"` matches the app default. Use `"linear"` when you want exact straight segments, such as loudness ramps.
- Because `pitchDelta` adds on top of the AI pitch curve, a script can write small cent offsets onto a V2 voice safely. For large melodic reshaping the official route is now `pitchControls` (see §2).
- To automate vocal modes per section, write `group.vocalModes["Power"] = {"mode":"cubic","points":[...]}` with values in 0–150. The mode name must exactly match the voice's mode names (Teto AI 2: Joyful, Cute, Power, Mellow, Low, Mini, Rock).

### Gaps
- The official ranges for `toneShift` and `mouthOpening` are not in the scripting definition table or the SV2 manual pages I fetched. SV1 documented Tone Shift in cents (my recollection is ±400 cents). That is UNVERIFIED for SV2, so test by saving a project from the GUI with an extreme value.
- The `"sigmoid"` mode string comes only from LibreSVIP and is UNVERIFIED in SV2. The GUI exposes only Linear, Cosine and Spline.
- The JSON spelling of the cosine mode (`"cosine"`) comes from LibreSVIP and was not seen in an app-saved file.

---

## 2. Note-level attributes in .svp (SV2 versus SV1)

### Takeaway
An SV2.1.2 note in JSON looks like this: `{musicalType, onset, duration, lyrics, phonemes, accent, pitch, detune, attributes:{...}, takes:{activeTakeId, takes:[...]}}`. For a V2 voice, the classic SV1 per-note pitch-transition and vibrato keys (`tF0Offset, tF0Left/Right, dF0Left/Right, tF0Vbr*, dF0Vbr, fF0Vbr, pF0Vbr, tNoteOffset, exprGroup, dur, alt`) are officially "Version 1 only". The SV2 per-note keys are `dF0VbrMod`, `expValueX/Y`, `rTone`, `rIntonation`, the `phonemes` attribute array, `muted`, `evenSyllableDuration`, `languageOverride` and `phonesetOverride`. Pitch shape in SV2 is edited through group-level `pitchControls`, not per-note attributes.

### Cited Findings
- Exact note keys written by SV2.1.2: `musicalType` (value `"singing"`), `onset`, `duration` (blicks), `lyrics`, `phonemes` (string, `""` means automatic), `accent` (`""`), `pitch` (MIDI, 69 = A4), `detune` (0), `attributes: {"evenSyllableDuration": true, "muted": false}`, and `takes: {"activeTakeId": 0, "takes": [{"id":0,"seedDuration":0,"seedPitch":0,"seedTimbre":0,"liked":false}]}`. — [local app-saved file 79838bd1_...svp and template_sv2.svp](file:///C:/Users/parkk/AppData/Roaming/Dreamtonics/Synthesizer%20V%20Studio%202/recovery/2026-10-09/)
- Official `Note.getAttributes()/setAttributes()` keys (scripting manual):
  - Available in all versions: `rTone` (rap tone), `rIntonation` (rap intonation), `dF0VbrMod` (vibrato modulation; these three since 1.9.0b2).
  - Since 2.1.1: `expValueX`, `expValueY` (Expression Pad X/Y), `phonemes` (array of `{leftOffset, position, activity, strength}`), `muted`, `evenSyllableDuration`, `languageOverride`, `phonesetOverride`.
  - Marked "Version 1 only": `tF0Offset` (s), `tF0Left` (s), `tF0Right` (s), `dF0Left` (semitones), `dF0Right` (semitones), `tF0VbrStart` (s), `tF0VbrLeft` (s), `tF0VbrRight` (s), `dF0Vbr` (semitones), `pF0Vbr` (radians, −π to π), `fF0Vbr` (Hz), `tNoteOffset` (s), `exprGroup` (string), `dur` (array, phoneme duration scaling), `alt` (array, alternative pronunciation).
  - Numeric attributes read as NaN when the note uses the group or reference default.

  — [Dreamtonics scripting: Note](https://resource.dreamtonics.com/scripting/Note.html)
- Other Note methods:
  - `getMusicalType()/setMusicalType("sing"|"rap")`. The API string is "sing", while the JSON stores `"singing"`.
  - `getPitchAutoMode()/setPitchAutoMode(bool)`.
  - `getRapAccent()/setRapAccent(1–5)`, Mandarin only.
  - `getDetune()/setDetune(cents)` since 2.1.1.
  - `getRetakes()` returns a RetakeList with `generateTake`, `deleteTake`, `setActiveTake` and `getNumTakes`.
  - `setLanguageOverride("mandarin"|"japanese"|"english"|"cantonese")`.
  - `setPhonemes("space delimited")`.

  — [Dreamtonics scripting: Note](https://resource.dreamtonics.com/scripting/Note.html)
- SV2 manual, Notes Panel:
  - Vibrato Modulation runs 0.00–2.00 (default 1.00), Sing mode only.
  - Rap Intonation runs −0.500 to 0.500 and Rap Tone runs −5.000 to 1.000, with per-note auto defaults.
  - Rap Accent is Mandarin only: 4 tones plus the neutral tone.
  - AI Retakes have four buttons: All, Pitch, Timing ("timing and length of phonemes", visible in the Phoneme Timing panel) and Timbre ("timbre and pronunciation"). "Crop to Active Takes" deletes the unselected takes.
  - "Evenly Split Note Into Syllables" exists as an option.

  — [SV2 manual: Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel)
- LibreSVIP's note-attribute model, a superset covering SV1 and SV2, adds keys the official docs do not list:
  - `dF0Jitter`, `strength` (list[float]), `improviseAttackRelease`, `transposeCents`, `transposeSemitones`, `choirNumStems`, `choirPartName`, `consonantStrength`.
  - A per-phoneme `alt` (int) inside the `phonemes` objects.
  - Note-level `systemAttributes`, `pitchTakes`, `timbreTakes` (SV1.7+ retakes), `instantMode` and `uuid`.
  - Project-level `instantModeEnabled`.

  — [LibreSVIP model.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/model.py)
- LibreSVIP's SV1 default constants (useful only for V1 voices):

  | Constant | Value |
  |---|---|
  | transition offset | 0.0 s |
  | portamento (tF0Left/Right) | 0.07 s |
  | depth (dF0Left/Right) | 0.15 semitone |
  | vibrato start | 0.25 s |
  | vibrato left/right fade | 0.2 s |
  | vibrato depth | 1.0 semitone |
  | vibrato frequency | 5.5 Hz |
  | vibrato phase | 0 |
  | jitter | 1.0 |
  | blick per 480-ppq tick | 1,470,000 |

  — [LibreSVIP constants.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/constants.py)
- SV2 retake take objects: LibreSVIP's `SVParamTake` has `id, seedDuration, seedPitch, seedTimbre, expr, enh, liked`. The app-saved SV2.1.2 file has only `id, seedDuration, seedPitch, seedTimbre, liked`. — [LibreSVIP model.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/model.py); [local app-saved file](file:///C:/Users/parkk/AppData/Roaming/Dreamtonics/Synthesizer%20V%20Studio%202/recovery/2026-10-09/)
- Teto rap: our generated Teto files set `musicalType: "rap"` on notes, and the app accepted them. — local note in `C:\Users\parkk\.claude\projects\D--park-YD-Claude-RND\memory\synthv2-teto-setup.md` (not independently re-verified here)

### Inferences
- For Teto AI 2 (a V2 voice), do not rely on `tF0*`/`dF0*` per-note keys to shape pitch. Officially they are V1-only, and the SV2 UI no longer exposes them. Write `pitchControls` and/or `pitchDelta` instead, and use `attributes.dF0VbrMod` (0–2) for per-note vibrato amount.
- Placement of new keys: SV2 attributes such as `expValueX`, `expValueY`, `dF0VbrMod`, `rTone` and `rIntonation` most likely go inside `note.attributes`, next to `evenSyllableDuration` and `muted`. That is how LibreSVIP models them, and the scripting API reads them through `getAttributes`.
- The safest way to get the exact JSON is a single GUI round-trip: set each control once in the GUI, save, and diff.

### Gaps
- Ranges and polarity of `expValueX`/`expValueY` are not documented. The X/Y quadrants are Vibrant (top-left), Refined (top-right), Raw (bottom-right) and Rigid (bottom-left), and Default is the centre. The value scale is plausibly −1 to 1 but UNVERIFIED.
- Units and ranges for `phonemes[].leftOffset/position/activity/strength` are not given in the manual. `strength` was the old SV1 per-phoneme strength, roughly a 0–1.x multiplier, which is UNVERIFIED.
- `dur`/`alt` are "V1 only" per the API. Whether SV2 still reads `dur` for V2 voices is UNVERIFIED. The 2.1.1 phoneme attribute array (`position`, `leftOffset`) appears to replace it.
- `detune` units are cents per the API. Its range is not documented; the group-level pitch shift is −50 to +50 cents.
- I found no evidence of a separate per-note "pitchMode" JSON key in SV2. `getPitchAutoMode` maps to SV1 instant-mode semantics, and its JSON key is likely `instantMode`, which is UNVERIFIED for SV2.

---

## 3. SV2 features: Vocal Modes, pitch editing modes, AI Retakes, Expression Pad, voice-level defaults

### Takeaway
SV2 has no switchable Manual/Instant pitch mode: AI pitch is always generated. You steer it with the Expression Pad (per note), Vocal Modes (per group, with separate pitch, timbre and pronunciation levels), AI Retakes (per-note seeds) and Vibrato Modulation. On top of that sit Smart Pitch Controls (group `pitchControls`) and Pitch Deviation (`pitchDelta`). Group and voice defaults live in each ref's `voice` object: `paramLoudness/Tension/Breathiness/Gender/ToneShift` and `vocalModeParams{Mode:{pitch,timbre,pronunciation}}`.

### Cited Findings
- The SV2 manual lists what feeds pitch generation:
  - note pitch, duration and lyrics;
  - Pitch Mode (Sing or Rap);
  - Vocal Modes;
  - Expression Pad;
  - AI Retakes;
  - Vibrato Modulation and Vibrato Envelope (Sing mode only);
  - Rap Intonation (Rap mode only).

  Pitch editing tools: Smart Pitch Controls (points and curves, including vibrato speed and depth handles) and Pitch Deviation. "Reset Pitch" clears pitch controls, Pitch Deviation, Vibrato Modulation and Rap Intonation. "Trace Pitch into Control Points" freezes the curve so you can change voices. — [SV2 manual: Pitch](https://sv2.docs.dreamtonics.com/en/pitch)
- Expression Pad quadrants:
  - Default (centre).
  - Vibrant (top-left): deeper vibrato, more exaggerated.
  - Refined (top-right): stable and skillful.
  - Raw (bottom-right): less internal pitch correction, more human-like, and more likely to go off-pitch.
  - Rigid (bottom-left): flat pitch with slight wobble only at note boundaries, and not affected by AI Retake.

  For mechanical or custom pitch, the manual's recipe is Rigid plus Smart Pitch Control points. Rigid is "available only for Version 2 voices". — [SV2 manual: Pitch](https://sv2.docs.dreamtonics.com/en/pitch)
- Pitch control JSON (group `pitchControls` array) is a discriminated union on `type`:
  - point: `{"type":"point","pos":<int blicks>,"pitch":<float semitones>,"id":"<string>"}`
  - curve: `{"type":"curve","pos":..., "pitch":..., "id":..., "points":[dt0, dv0, dt1, dv1, ...]}`

  In LibreSVIP's generator a curve's `pos` is the first point's position, `pitch` is the MIDI pitch (cents/100), and `points` hold the time offset from `pos` and the semitone offset from `pitch`. — [LibreSVIP model.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/model.py); [LibreSVIP synthv_generator.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/synthv_generator.py)
- The official API matches that layout:
  - PitchControlPoint has `getPosition()` (blicks, relative to the group's time offset) and `getPitch()` (semitones, relative to the group's pitch offset).
  - PitchControlCurve has `getPosition`/`getPitch` for an anchor, which the GUI does not show and which "typically" sits at the centre of the points' bounding box. Its `getPoints()` returns `[time, value]` pairs: time in blicks relative to the anchor, value in semitones relative to the anchor pitch.
  - Supported since 2.1.0.

  — [Scripting: PitchControlCurve](https://resource.dreamtonics.com/scripting/PitchControlCurve.html); [PitchControlPoint](https://resource.dreamtonics.com/scripting/PitchControlPoint.html); [NoteGroup](https://resource.dreamtonics.com/scripting/NoteGroup.html)
- When LibreSVIP targets "SV 2.0 and up" (project version 182), it writes pitch as `pitchControls` curves and omits `pitchDelta`. — [LibreSVIP synthv_generator.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/synthv_generator.py); [options.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/options.py)
- Vocal Modes:
  - The modes available differ per voice and can be mixed.
  - The Voice Panel slider moves in 5% steps; "+" opens the separate pitch, timbre and pronunciation sliders.
  - When the Parameter Panel overrides a mode, a "~" mark appears.
  - "Delete Inactive Vocal Mode Parameters" removes mode curves the current voice does not have.

  — [SV2 manual: Voice Panel](https://sv2.docs.dreamtonics.com/en/voice-panel); [Vocal Modes](https://sv2.docs.dreamtonics.com/en/vocal-modes)
- `NoteGroupReference.getVoice()/setVoice()` keys:
  - V1 and V2: `paramLoudness` (dB), `paramTension`, `paramBreathiness`, `paramGender`, `paramToneShift`, and `vocalModeParams` (since 2.1.1), shaped `{ModeName: {pitch, timbre, pronunciation}}` with each value 0–150.
  - V1 only: `tF0Left`, `tF0Right`, `dF0Left`, `dF0Right`, `tF0VbrStart`, `tF0VbrLeft`, `tF0VbrRight`, `dF0Vbr`, `fF0Vbr`.
  - Defaults are not documented.

  — [Scripting: NoteGroupReference](https://resource.dreamtonics.com/scripting/NoteGroupReference.html)
- Exact JSON as SV2.1.2 saves it in a ref (`tracks[].mainRef` or `tracks[].groups[]`): `"voice": {"vocalModeInherited": true|false, "vocalModePreset": "", "vocalModeParams": {"Cute": {"pitch": 70.0, "pronunciation": 70.0, "timbre": 70.0}, "Joyful": {...}, ...}}`, plus sibling `"voicePresetName": ""`. A group ref with its own modes has `vocalModeInherited: false`. — [local app-saved file iiko_teto_v13b_2026-10-09_22-35.svp](file:///C:/Users/parkk/AppData/Roaming/Dreamtonics/Synthesizer%20V%20Studio%202/recovery/2026-10-09/)
- Other ref keys SV2.1.2 writes:
  - `groupID`, `blickAbsoluteBegin`, `blickAbsoluteEnd` (−1 for mainRef), `blickOffset`, `pitchOffset` (semitones), `mute`, `isInstrumental`, `dictionary`, `takes`;
  - `database: {name, language, phoneset, languageOverride, phonesetOverride, backendType, version}`. For Teto it is `{"name":"Kasane Teto AI 2","language":"japanese","phoneset":"romaji",...,"backendType":"SVR3","version":"201"}`;
  - `audio: {filename, duration, bpm, alternativeBPMs, beatLocations}` for instrumental refs.

  — [local app-saved file](file:///C:/Users/parkk/AppData/Roaming/Dreamtonics/Synthesizer%20V%20Studio%202/recovery/2026-10-09/); [local make_svp.py](file:///D:/park/synthv/tools/make_svp.py)
- LibreSVIP's voice model adds `renderMode`, `choirSeatingSeparation`, `improviseAttackRelease`, `transposeCents`, `transposeSemitones`, `choirNumStems`, `choirPartName` and `consonantStrength`. Those are UNVERIFIED as SV2 JSON keys. — [LibreSVIP model.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/model.py)
- Voice Panel tuning: Pitch Shift −50 to +50 cents in 1-cent steps; Key Shift −12 to +12 semitones. The panel also has Consonant Adjustment (strength and length of plosives and fricatives for the whole group) and Unison (number of singers, spacing). Presets are saved per voice under `%APPDATA%\Dreamtonics\Synthesizer V Studio 2\settings`. — [SV2 manual: Voice Panel](https://sv2.docs.dreamtonics.com/en/voice-panel)
- 2.1.1 release notes: the scripting API gained retakes, pitch control points and curves, detailed vocal-mode parameters, the track mixer, and "detailed consonant timing and activity parameters". Groups can now be muted and unmuted. — [Dreamtonics: SV2 Pro 2.1.1](https://www.dreamtonics.com/?p=3411)
- Vocal-mode range conflicts:
  - The official API says 0–150.
  - A forum user reports that values over 150 or below 0 used to be possible by editing the svp by hand, but were "not intended".
  - Our local memory note records a GUI max of 140 for Teto; I could not verify it.

  — [Scripting: NoteGroupReference](https://resource.dreamtonics.com/scripting/NoteGroupReference.html); [forum: Bring back custom vocal mode values](https://forum.synthesizerv.com/t/topic/10910)

### Inferences
- A practical recipe for scripted Teto tuning:
  1. Set group `voice.vocalModeParams` for the base timbre, with `vocalModeInherited: false` on that ref.
  2. Add a `vocalModes` curve for section changes, such as Power in the chorus.
  3. Write per-note `attributes.dF0VbrMod` for vibrato amount (0 on short notes, about 1.2–1.5 on long tails).
  4. Use `expValueX/Y` to push the style toward Rigid or Refined when the AI wobbles.
  5. Use `pitchControls` or small `pitchDelta` cents for pitch fixes.
  6. Use `loudness`, `tension` and `breathiness` curves for phrase dynamics.
- Retake seeds (`seedPitch`, `seedTimbre`, `seedDuration`) are plain integers in `note.takes.takes[]`, with `activeTakeId` choosing one. A script could write several takes with different seeds and switch between them. Whether arbitrary seeds give valid results without the GUI generating them is UNVERIFIED.

### Gaps
- Official defaults for `paramToneShift` (the unit was cents in SV1) and its range in SV2 are not documented.
- Whether SV2 reads a pitch control's `pitch` as absolute MIDI or relative to the note group rests on LibreSVIP's generator and the API wording ("relative to the note group's pitch offset", which suggests absolute MIDI with the group's pitch offset added). It was not checked against an app-saved file containing a pitch control, because none exists locally.
- I found no doc for the "Instant mode" or "Expressiveness knob" in SV2. Both appear to be SV1 concepts: SV1.7 had AI retake "expressiveness" (LibreSVIP's `expr` take field), and SV1 had instant pitch mode. In SV2 their roles are taken by the Expression Pad and AI Retakes.

---

## 4. SynthV scripting API: objects, headless use, community repos

### Takeaway
Scripts are JavaScript (ECMAScript 5.1 on Duktape) or Lua 5.4. They run only inside the SynthV GUI from the Scripts menu, and there is no headless or command-line mode. The API (23 classes) covers notes, groups, automations, pitch controls, retakes, voice and vocal-mode parameters and the mixer. For unattended pipelines, generating the `.svp` JSON directly stays the practical route. A GUI-side script can serve as a bridge.

### Cited Findings
- Languages: JavaScript ES5.1 (Duktape) and Lua 5.4, with the same API in both. JS indexes from 0 and Lua from 1. JS calls methods as `obj.method()`, Lua as `obj:method()`. Scripts load as plain source. — [Scripting manual index](https://resource.dreamtonics.com/scripting/index.html)
- The manual has 23 classes: ArrangementSelectionState, ArrangementView, Automation, CoordinateSystem, GroupSelection, MainEditorView, NestedObject, Note, NoteGroup, NoteGroupReference, PitchControlCurve, PitchControlPoint, PlaybackControl, Project, RetakeList, SV, ScriptableNestedObject, SelectionStateBase, TimeAxis, Track, TrackInnerSelectionState, TrackMixer and WidgetValue. — [Scripting manual index](https://resource.dreamtonics.com/scripting/index.html)
- `SV` host methods:
  - time and pitch: `T`, `blackKey`, `blick2Quarter`, `blick2Seconds`, `blickRoundDiv`, `blickRoundTo`, `freq2Pitch`, `pitch2freq`, `quarter2Blick`, `seconds2Blick`;
  - object access: `create`, `finish`, `getArrangement`, `getMainEditor`, `getPlayback`, `getProject`;
  - computed results: `getComputedAttributesForGroup`, `getComputedPitchForGroup`, `getPhonemesForGroup`;
  - host and clipboard: `getHostClipboard`, `getHostInfo`, `setHostClipboard`;
  - output and timers: `print`, `refreshSidePanel`, `setTimeout`;
  - dialogs: `show*Box` and `showCustomDialog`, each in sync and async forms.

  The manual itself does not mention headless or command-line use. — [Scripting manual index](https://resource.dreamtonics.com/scripting/index.html)
- `NoteGroup` methods: `addNote`, `getNote`, `getNumNotes`, `removeNote`, `getParameter(type)` (which returns an Automation; the type name is case-insensitive), `addPitchControl`, `getPitchControl`, `getNumPitchControls`, `removePitchControl` (these four since 2.1.0), `getUUID`, `getName`/`setName`, and `clone`. `Automation` methods: `add(b,v)`, `get(b)`, `getLinear(b)`, `getPoints(begin,end)`, `getAllPoints()`, `remove`, `removeAll`, `simplify(begin,end,threshold=0.002)`, `getDefinition()`, `getInterpolationMethod()` and `getType()`. — [NoteGroup](https://resource.dreamtonics.com/scripting/NoteGroup.html); [Automation](https://resource.dreamtonics.com/scripting/Automation.html)
- Local install: the user scripts folder is `C:\Users\parkk\AppData\Roaming\Dreamtonics\Synthesizer V Studio 2\scripts\`. It ships with `Utilities\` (MergeSelectedNotes.js, RandomizeParameters.lua, RemoveShortSilences.js, ScaleSelectedNotes.js, SilenceSkippingPlay.js, SmoothNavigationPlay.js, SplitSelectedGroups.lua, SplitSelectedNotes.js), which matches the official repo. — local directory listing; [Dreamtonics/svstudio-scripts](https://github.com/Dreamtonics/svstudio-scripts)
- The official repo (Dreamtonics/svstudio-scripts, 86★, pushed 2026-01-14) contains HelloWorld, Tests (TestAutomation, TestCustomDialog, TestMessageBox, TestNavigation, TestPlayback, TestProject, TestSelection, TestTimeAxis) and Utilities. — [GitHub API listing](https://github.com/Dreamtonics/svstudio-scripts)
- Community repos:
  - [hataori-p/real-voice](https://github.com/hataori-p/real-voice) (119★, 2023): scripts for working with real recorded voice.
  - [cv4x/svstudio-scripts](https://github.com/cv4x/svstudio-scripts) (30★).
  - [ftsf/synthv-impkit](https://github.com/ftsf/synthv-impkit).
  - [leostudiooo/sv-scripts](https://github.com/leostudiooo/sv-scripts) (2025-10).
  - [UtaUtaUtau/commonnote-svs](https://github.com/UtaUtaUtau/commonnote-svs).
  - [hetima/synthv-scripts](https://github.com/hetima/synthv-scripts) (Japanese).
  - [unbadfish/sv-mass-duration-and-strength-script](https://github.com/unbadfish/sv-mass-duration-and-strength-script) (phoneme duration and strength).
  - Forum "Expressive Mapper Pro 3" (auto-tuning, harmonies) — [forum](https://forum.dreamtonics.com/t/script-expressive-mapper-pro-3-v3-6-1-auto-tuning-harmonies-chords-0-0-6/8326).
- An SV2 MCP bridge works this way: a Lua script, started from Scripts > MCP inside the running GUI, polls a file mailbox (`.req` / `.res` files plus a heartbeat every 500 ms). An external Node.js MCP server writes the requests, and edits go through the official API with undo support. It does not run headless; the GUI must be open. — [glama.ai: SynthV MCP server](https://glama.ai/mcp/servers/hhybertbhr)
- The SV2.1.2 executable is packed: string extraction found no JSON key names. Its neural models are `.dnni` files. So the binary cannot serve as a source for key names. — local inspection of `D:\Program Files\Synthesizer V Studio 2 Pro\synthv-studio.exe`
- Forum guidance on generating svp: "the Scripting Manual hasn't been updated in a while, so there's a lot in the file that's not been documented", but "the structures map directly to classes". — [Dreamtonics forum: generate svp programmatically](https://forum.synthesizerv.com/t/topic/10831)

### Inferences
- Best automation architecture: generate the full `.svp` JSON in Python, then open it in SV2 to render. Our existing pipeline does this, rendering through UIA "Bounce to Files".
- For things the JSON route cannot reach well, such as reading back the AI-computed pitch (`SV.getComputedPitchForGroup`) or the computed phoneme timings (`SV.getPhonemesForGroup`), use a small in-GUI script. It can export JSON through `SV.setHostClipboard` or a file-mailbox pattern like the MCP bridge. That lets an analysis loop compare the rendered pitch against a target without listening.

### Gaps
- I found no official documentation on a script autorun at startup, or on any CLI or headless render. Absence of evidence, consistent with local notes that "SynthV has no command-line render and no external API".
- `getComputedAttributesForGroup` (2.1.1) returns undocumented fields here; fetch its SV page if needed.

---

## 5. Official docs and recommended usage ranges, plus SV1 vs SV2 differences

### Takeaway
Official recommended practice in SV2: prefer Vocal Modes over base parameters for timbre. Treat Pitch Deviation as a compatibility layer. Use Smart Pitch Controls and the Expression Pad, especially Rigid plus control points for precise or mechanical pitch. Remember that Voice Panel values add to Parameter Panel curves. The SV1 per-note pitch-transition and vibrato numbers do not apply to V2 voices.

### Cited Findings
- "For manipulating voice texture and timbre, using Vocal Modes tends to produce more natural results than base parameters." Breathiness that is too high adds noise, and too low sounds muffled. Tone Shift can fake falsetto just below the falsetto range. — [SV2 manual: Base Parameters](https://sv2.docs.dreamtonics.com/en/parameters)
- Pitch Deviation is "primarily used to maintain compatibility with earlier versions". "Pitch curves are always generated automatically" in SV2. For mechanical styles, use the Rigid quadrant plus Smart Pitch Controls. — [SV2 manual: Pitch](https://sv2.docs.dreamtonics.com/en/pitch)
- Vibrato Modulation runs 0.00–2.00 (default 1.00). Rap Intonation runs ±0.5 and Rap Tone runs −5 to +1. — [SV2 manual: Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel)
- SV1 vs SV2 key differences, per the official API labels:
  - These per-note and per-voice keys are "Version 1 only": `tF0Offset, tF0Left, tF0Right, dF0Left, dF0Right, tF0VbrStart, tF0VbrLeft, tF0VbrRight, dF0Vbr, pF0Vbr, fF0Vbr, tNoteOffset, exprGroup, dur, alt`.
  - V2 additions: `pitchControls` (2.1.0), `expValueX/Y`, the `phonemes` attribute array, `muted`, `vocalModeParams` (2.1.1), and the `toneShift` and `mouthOpening` curves.
  - Project `version`: LibreSVIP uses 100 (SV ≤1.9), 135 (1.10–1.11.2) and 182 (2.0+). SV2.1.2 saves 187.

  — [Scripting: Note](https://resource.dreamtonics.com/scripting/Note.html); [NoteGroupReference](https://resource.dreamtonics.com/scripting/NoteGroupReference.html); [LibreSVIP options.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/options.py); local app-saved file (`"version": 187`)
- The SV2 manual says the Rigid quadrant is only for V2 voices. V1 voices loaded in the V2 editor get a substitute quadrant that produces relatively flat pitch. — [SV2 manual: Pitch](https://sv2.docs.dreamtonics.com/en/pitch)
- Scripting with `dF0VbrMod`: a forum user advises setting Vibrato Modulation to 0 before running a vibrato-drawing script, because the two compound. — [search summary of Expressive Mapper Pro forum thread](https://forum.dreamtonics.com/t/script-expressive-mapper-pro-3-v3-6-1-auto-tuning-harmonies-chords-0-0-6/8326)

### Inferences
- Recommended script-side value bands (heuristic, not official):

  | Parameter | Band |
  |---|---|
  | loudness curves | −6 to +3 dB within phrases (stay well inside −48 to +12) |
  | tension | −0.3 to +0.4 |
  | breathiness | −0.2 to +0.4 (higher adds noise, per the manual) |
  | gender | ±0.15 for subtle colour |
  | vibratoEnv | 0–1.5 |
  | pitchDelta | ±50 cents for fixes, larger only for scoops or falls |
  | vocal modes | 0–100, with 100+ for strong character, max 150 |

  These are UNVERIFIED rules of thumb derived from the ranges above. Validate by rendering and listening.

### Gaps
- Several SV2 manual pages (piano-roll / Smart Pitch Controls operation, phoneme timing panel, rap accent JSON) were not fetched within this budget. The piano-roll page would document vibrato handles on pitch controls.
- I found no official numeric guidance on "recommended ranges" beyond the slider limits.

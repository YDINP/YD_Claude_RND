# Synthesizer V Studio 2 (2.1-2.2.x) scripting and external automation

Verification legend: "Cited" = read on the official docs page or repo file. "Inferred" = my reasoning. Pages were read through WebFetch, which summarizes pages, so exact wording is paraphrased unless quoted.

## 1. What the official scripting API can read and write

### Takeaway
Scripts (Lua 5.4 or JavaScript/Duktape ES5.1) can read and write notes, phonemes, note attributes, parameter curves, pitch controls, retakes and voice/vocal-mode data. Since 2.1.1 they can also read the editor's computed pitch and phoneme timing. The API has no render, export or save method, so scripts cannot trigger Bounce to Files.

### Cited Findings
- Scripts are loaded as source code, in JavaScript (ECMAScript 5.1, Duktape) or Lua 5.4. The only global is `SV`. A script defines `getClientInfo()` (metadata and `minEditorVersion`) and `main()`, and ends with `SV.finish()`. — [Scripting manual index](https://resource.dreamtonics.com/scripting/index.html), [Minimal Example](https://resource.dreamtonics.com/scripting/tutorial-A%20Minimal%20Example.html)
- Class list: Automation, Note, NoteGroup, NoteGroupReference, PitchControlCurve, PitchControlPoint, PlaybackControl, Project, RetakeList, SV, Track, TrackMixer, TimeAxis, WidgetValue, MainEditorView, ArrangementView and selection-state classes. No render or export class. — [Manual index](https://resource.dreamtonics.com/scripting/)
- `SV` has 35 methods plus `QUARTER` (705600000 blicks per quarter). The ones that matter here:
  - `getProject`, `getMainEditor`, `getArrangement`, `getPlayback`, `getHostInfo`
  - `create(type)`, `setTimeout(ms, cb)`, `finish()`
  - the dialog functions (`showMessageBox`, `showInputBox` and others), `get/setHostClipboard`
  - the blick/second/pitch conversion helpers
  - `print` (since 2.1.1), which is visible only when Studio is launched from a command line
  - No file I/O and no render method. — [SV class](https://resource.dreamtonics.com/scripting/SV.html)
- `SV.getComputedPitchForGroup(groupReference, blickStart, blickInterval, numFrames)` (since 2.1.1) samples the computed pitch curve and returns an array of semitone floats, with `null` where there is no data. `blickStart` is absolute and includes the reference's time offset. It is non-blocking and returns an empty array if pitch isn't ready. — [SV class](https://resource.dreamtonics.com/scripting/SV.html)
- `SV.getComputedAttributesForGroup(group)` (since 2.1.1) takes a NoteGroupReference and returns one object per note with `accent`, `rapTone`, `rapIntonation` and a `phonemes` array. Each phoneme has `symbol`, `language`, `activity` and `position`. It is non-blocking and can return an empty array. — [SV class](https://resource.dreamtonics.com/scripting/SV.html)
- `SV.getPhonemesForGroup(group)` returns the converter's phonemes per note, including default pronunciations. `Note#getPhonemes` returns "" unless the user set phonemes. The call is non-blocking, so an empty array is possible, and the docs suggest wrapping it in `SV.setTimeout`. The group must belong to the open project. — [SV class](https://resource.dreamtonics.com/scripting/SV.html)
- A forum report (search-result summary only; the thread page redirected on fetch) says a reference made with `SV.create("NoteGroupReference")` crashes the editor with `getPhonemesForGroup`, and that a group with no language set never runs text-to-phoneme. — [forum thread 11683](https://forum.synthesizerv.com/t/topic/11683)
- Note read/write methods:
  - `getPhonemes`/`setPhonemes` (space-delimited string)
  - `getAttributes`/`setAttributes` (partial update allowed)
  - pitch, detune (since 2.1.1), onset/duration, lyrics, musical type, language override, rap accent
  - `getRetakes()` (since 2.1.1)
  - Non-v1 attribute keys: `rTone`, `rIntonation`, `dF0VbrMod`, `expValueX`, `expValueY` (both since 2.1.1), `phonemes[]` (each with `leftOffset`, `position`, `activity`, `strength`), `muted`, `evenSyllableDuration`, `languageOverride`, `phonesetOverride`.
  - Numeric attributes read back as NaN when they inherit from the group reference.
  - v1-only keys: `tF0Offset`, `tF0Left`, `tF0Right`, `dF0Left`, `dF0Right`, the vibrato keys `tF0Vbr*`, `dF0Vbr`, `pF0Vbr`, `fF0Vbr`, plus `dur`, `alt`, `tNoteOffset`. These should not be used on SV2 voices. — [Note class](https://resource.dreamtonics.com/scripting/Note.html)
- `RetakeList` (since 2.1.1): `generateTake(newDuration, newPitch, newTimbre)` returns the new take id, plus `deleteTake(id)`, `setActiveTake(id)` and `getNumTakes()`. Take 0 cannot be deleted. Take seeds are not readable or settable directly. — [RetakeList](https://resource.dreamtonics.com/scripting/RetakeList.html)
- `NoteGroup`: `addNote`, `getNote`, `getNumNotes`, `removeNote`, `getParameter(type) -> Automation`, and pitch controls (since 2.1.0) via `add/get/removePitchControl` and `getNumPitchControls`. — [NoteGroup](https://resource.dreamtonics.com/scripting/NoteGroup.html)
- `Automation`:
  - Methods: `add(b, v)`, `get`, `getLinear`, `getPoints(begin, end)`, `getAllPoints`, `simplify`, `remove`, `removeAll`, `getInterpolationMethod` (Linear, Cosine or Cubic).
  - Types and ranges listed in `getDefinition`: pitchDelta (-1200 to 1200 cents), vibratoEnv (0 to 2), loudness (-48 to 12 dB), tension, breathiness, gender (each -1 to 1), voicing (0 to 1), and `vocalMode_<Name>` (0 to 150).
  - The page does not list toneShift or mouthOpening, although LibreSVIP's model has both. — [Automation](https://resource.dreamtonics.com/scripting/Automation.html)
- `PitchControlCurve`: `getPosition`/`setPosition`, `getPitch`/`setPitch`, `getPoints`/`setPoints` (`[time, value]` pairs), `getValueAt(time)`. — [PitchControlCurve](https://resource.dreamtonics.com/scripting/PitchControlCurve.html)
- `NoteGroupReference`:
  - `getVoice()` returns an object containing `vocalModeParams`, since 2.1.1. Each entry has `pitch`, `timbre` and `pronunciation`, from 0 to 150.
  - `setVoice(attributes)`, `setTimeOffset`, `setPitchOffset`, `setMuted` (since 2.1.1), `setTimeRange` (since 2.1.0).
  - No vocal-mode preset method is documented. — [NoteGroupReference](https://resource.dreamtonics.com/scripting/NoteGroupReference.html)
- `Project`: `getFileName()` (absolute path), `getTrack`, `addTrack`, `getTimeAxis`, `getNoteGroup`, `addNoteGroup`, `newUndoRecord`. The page documents no render, export or save method. — [Project](https://resource.dreamtonics.com/scripting/Project.html)
- Release-note coverage (secondary: a search-result summary, because the dreamtonics.com page returned 403). 2.1.1 added script access to retakes, pitch control points and curves, detailed vocal-mode parameters, the track mixer and detailed consonant timing and activity. — [Dreamtonics 2.1.1 post](https://www.dreamtonics.com/?p=3411)

### Inferences
- To get SV2's computed pitch per note, call `getComputedPitchForGroup` on a reference at a fixed blick step (for example 1/480 of a quarter) and slice the frames by each note's onset and end. To get phoneme timing, call `getComputedAttributesForGroup` and use each phoneme's `position` and `activity`. The units of `position` are not stated on the page. Calibrate them against a render.
- Both calls are asynchronous in effect. A robust script would poll with `SV.setTimeout` until the array is non-empty and has the expected length, then dump it.
- The pitch values are the editor's computed result. Whether they include pitchDelta, vibrato and pitch controls on top of the model's own F0 is not stated in the docs. Verify by comparing against a rendered WAV's F0.
- Writing: `Note:setAttributes{phonemes={...}}`, `Automation:add`, `PitchControlCurve:setPoints` and `RetakeList:generateTake` cover the edits needed for the JSON-apply path. Reading a vocal-mode curve through the Automation `vocalMode_<Name>` type is plausible. Writing the preset by name seems unsupported.

### Gaps
- The 2.2.x scripting changelog could not be fetched (dreamtonics.com returned 403). I could not confirm any 2.2.x API additions.
- The `PitchControlPoint` page, the `Track` page and the exact `getVoice`/`setVoice` key list were not fully read.
- Whether `getComputedPitchForGroup` values include vibrato, pitchDelta and pitch controls is undocumented.

## 2. File I/O, hotkeys, scripts folder

### Takeaway
The official docs describe no file API. In practice, Lua `io.open` works inside SV Studio on at least one platform, because a community MCP bridge uses it. That gives a file-based exchange path with an external process.

### Cited Findings
- The official manual's intro and the SV class page mention no `io`, `os` or `require`, and list no sandbox restrictions. — [Manual index](https://resource.dreamtonics.com/scripting/index.html)
- The `ocadaruma/mcp-svstudio` Lua handler polls a JSON command file using `io.open` and `SV:setTimeout` every 500 ms. It clears the file after reading, parses JSON, dispatches on `command.action` and writes the result with `io.open` to a response file. It also keeps a state file and ends with `SV:finish()` when the state is "terminated". It is tested only on Studio V2 and Node 22. The command file paths are under `/tmp/` (Unix-style). — [StartMCPServerRequestHandler.lua](https://raw.githubusercontent.com/ocadaruma/mcp-svstudio/main/sv-scripts/StartMCPServerRequestHandler.lua), [repo](https://github.com/ocadaruma/mcp-svstudio)
- The same repo says the script is copied into the Studio scripts folder and started from the Scripts menu. It does not describe any rendering or pitch-reading features. — [repo](https://github.com/ocadaruma/mcp-svstudio)
- A community post confirms the workflow "put the script in the SynthV `scripts` folder, then Scripts -> Rescan" (from a search-result summary). — [billwhite-git/synthvscripts via search](https://www.vi-control.net/community/threads/synthesizer-v-scripting.137282/page-2)
- Debug output: `SV.print` goes to stdout, visible only when Studio is launched from a command line. — [SV class](https://resource.dreamtonics.com/scripting/SV.html)

### Inferences
- A long-running polling script (the setTimeout loop) is a workable "daemon" inside Studio. An external Python process could write `cmd.json` and read `resp.json`. This is the same architecture the MCP bridge uses, so it is proven in principle.
- `os.execute`/`io.popen` availability is unconfirmed. Do not rely on it.
- The script must call `SV.finish()` eventually. A polling loop keeps the script alive until it chooses to finish.
- The `/tmp` paths in the MCP bridge are probably macOS/Linux-oriented. On Windows, use an absolute path under the user's temp directory and test `io.open` first.

### Gaps
- No official source on whether Lua `io`/`os` are sandboxed on Windows. Test directly with a one-line script that writes a file.
- No official statement on assigning hotkeys to scripts. The manual search did not show it. It is likely done through the Studio shortcut settings, but that is unverified.
- The scripts folder path on Windows was not confirmed from a source.

## 3. Triggering render / export, CLI / headless

### Takeaway
No source shows any command-line, headless or script-triggered render in SV Studio 2.x. Rendering is a GUI Render panel. A pipeline without mouse clicking would have to use UI Automation (Invoke patterns) or a different route, since scripts cannot reach it.

### Cited Findings
- The SV class and Project class list no render or export function. — [SV](https://resource.dreamtonics.com/scripting/SV.html), [Project](https://resource.dreamtonics.com/scripting/Project.html)
- Official docs describe the Render panel as the place to export audio (mixdown or per-track WAV, FLAC in older manual) with per-track progress. No CLI mention. — [Render doc (via search)](https://svdocs.dreamtonics.com/en/synthv/basic-usage/render), [SV2 render doc](https://sv2.docs.dreamtonics.com/en/render)
- Two searches for a CLI, headless or batch mode found nothing. This is absence of evidence, not proof. — search results above
- A script can play back through `PlaybackControl` (play, pause, loop, seek, stop). — [Manual index](https://resource.dreamtonics.com/scripting/)

### Inferences
- The repo's existing UIA render approach (per the project's synthv-teto skill) is the most reliable option. A script cannot replace it.
- An alternative for validating timing without a render is to read the computed pitch/phoneme data from the script (section 1) and render only for the final audio.

### Gaps
- Not checked: Studio's behaviour with `--help` or unknown arguments, and any undocumented flags. The only confirmed command-line use is that launching from a shell makes `SV.print` visible.
- Not checked: the 2.2.x render panel, such as an auto-export setting.

## 4. Existing community scripts and tools

### Takeaway
I found only small examples. None did computed-pitch export or batch render.

### Cited Findings
- `unbadfish/sv-mass-duration-and-strength-script`: iterates phonemes of selected notes and changes their values by vowel/consonant class. — [GitHub](https://github.com/unbadfish/sv-mass-duration-and-strength-script)
- kadotanimitsuru's Next ALT / Reset ALT scripts (2020, MIT): read and write alternate phonemes through `getAttributes()`/`setAttributes()`. — [blog post](https://mitsuru.hateblo.jp/entry/2020/09/06/150915)
- `billwhite-git/synthvscripts` (`LyricsToCleanTextV1.lua`): lyric export that strips phoneme tokens. — via [vi-control thread](https://vi-control.net/community/threads/synthesizer-v-scripting.137282/page-2)
- `ocadaruma/mcp-svstudio` (Apache-2.0): Lua bridge plus Node MCP server for creating and editing tracks from an LLM. — [GitHub](https://github.com/ocadaruma/mcp-svstudio)
- A forum user imported Praat-derived timing and median pitch into SV with Lua, and reported the pitch-curve part as hardest. — [forum 4207](https://forum.synthesizerv.com/t/topic/4207)

### Gaps
- No pitch-export, auto-tune, breath-insertion or vibrato-drawing script was found, despite a search for them. They may exist on the Dreamtonics forum scripts category, which I could not browse.

## 5. LibreSVIP .svp model (reference for JSON structure)

### Takeaway
The .svp file is JSON. LibreSVIP's pydantic model gives a field-level map of SV2 keys, useful for a JSON-driven editor. The same data can be written to the file directly instead of through the scripting API.

### Cited Findings
All from [libresvip/plugins/svp/model.py](https://raw.githubusercontent.com/SoulMelody/LibreSVIP/main/libresvip/plugins/svp/model.py), read through a summarizing fetch tool. Verify key spellings against a real .svp before relying on them.
- `SVProject`: `library[]`, `renderConfig`, `instantModeEnabled`, `time`, `tracks[]`, `version` (default 100), `uuid`, `projectMixer`.
- `SVTrack`: `dispColor`, `dispOrder`, `groups[]` (refs), `mainGroup`, `mainRef`, `mixer`, `name`, `renderEnabled`.
- `SVGroup` carries notes, `parameters`, `pitchControls` (not seen in the summary, so unverified) and `vocalModes` (dict name -> parameter curve).
- `SVNote`:
  - Core: `onset`, `duration`, `lyrics`, `phonemes` (string), `pitch`, `detune`, `accent`.
  - Attributes: `attributes`, `systemAttributes`.
  - Take fields: `takes`, `pitchTakes`, `timbreTakes` (each `{activeTakeId, takes[]}`).
  - Other: `musicalType` ("singing" or "rap"), `instantMode`, `uuid`.
- Take: `{id, seedDuration, seedPitch, seedTimbre, expr, enh, liked}`.
- `SVParameters`: `breathiness`, `gender`, `loudness`, `pitchDelta`, `tension`, `vibratoEnv`, `voicing`, plus optional `toneShift` and `mouthOpening`.
- Parameter curve: `{points: flat [offset, value, ...], mode: linear|cubic|cosine|sigmoid}`.
- Note attributes (SV2-relevant):
  - Vibrato and jitter: `dF0Vbr`, `pF0Vbr`, `fF0Vbr`, `tF0Vbr*`, `dF0Jitter`.
  - Expression and rap: `expValueX`, `expValueY`, `rTone`, `rIntonation`.
  - Phoneme lists: `dur`, `alt`, `strength`, and `phonemes[]` with `{leftOffset, strength, alt, position, activity}`.
  - Flags and overrides: `evenSyllableDuration`, `muted`, language/phoneset overrides.
  - Also loudness, tension, breathiness, gender, tone shift, transpose, choir, consonant strength.
- Pitch control: union on `type` ("point" or "curve"), with `pos`, `pitch`, `id`, and points for curves.
- Voice: `vocalModeInherited`, `vocalModePreset`, `vocalModeParams` (dict of name -> number or `{pitch, timbre, pronunciation}`).
- `SVDatabase`: `name`, `language`, `phoneset`, `version`, `languageOverride`, `phonesetOverride`, `backendType`.
- `SVMixer`: `pan`, `mute`, `solo`, `display`, `gainDecibel`, `fxPresetName`, `fxParams`.

### Inferences
- Take seeds exist in the file but are not exposed through the scripting API, as far as the RetakeList page shows. So reproducible takes need file-level editing (setting `seedDuration`, `seedPitch`, `seedTimbre`), not scripts. This is inferred and untested.
- The two routes combine well. Generate or edit the .svp from JSON (file route), open it in Studio, let a polling script dump computed pitch and phoneme timing, then render by UIA.

### Gaps
- I did not see `pitchControls` or the group-level `parameters` keys directly in the fetched summary. They were not confirmed. Open a saved .svp to confirm.
- The `version` for SV2 files, and which keys SV2 rewrites on load, were not checked.

## Recommended approach (inferred from the findings above)
1. Read computed data: a polling Lua script (modeled on the mcp-svstudio handler) that calls `getComputedPitchForGroup` and `getComputedAttributesForGroup`, retries with `SV.setTimeout` until non-empty, and writes JSON via `io.open` (test `io.open` on Windows first).
2. Apply edits: either `Note:setAttributes`/`Automation:add`/`PitchControlCurve:setPoints` from a command JSON, or edit the .svp directly (preferred for take seeds and `vocalModeParams`).
3. Render: no script path exists. Keep the existing UIA-driven Render panel.

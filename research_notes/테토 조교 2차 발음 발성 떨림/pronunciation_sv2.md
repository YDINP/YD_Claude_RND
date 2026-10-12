# SynthV Studio 2 (2.1-2.2.x) Japanese pronunciation control for AI voices (Teto AI 2) and .svp phoneme editing

Access note: forum.dreamtonics.com, sv2.docs.dreamtonics.com, dreamtonics.com/synthv/scripting were all HTTP 403 to WebFetch; their content below comes only from search-result snippets (marked "snippet"). The forum.synthesizerv.com guide (topic 6320) timed out. Japanese community guides (note.com, blogs) were not reached: Japanese queries returned nothing useful. Reliability tags: [official] [community] [single] [inference] [local-file] (read directly from this PC's install).

## 1. Japanese phoneset, lyric syntax, special tokens, n/cl/long vowel/devoiced/particles

### Takeaway
The complete SV2 Japanese phoneme inventory is 42 symbols and is confirmed from the installed file. Manual phonemes are written by prefixing the note lyric with "." and override the lyric entirely. Special tokens br / cl (via apostrophe) / sil / pau / "-" / "+" exist. Nothing found documents devoiced vowels, ん variants or は/へ handling; the phoneset has only one N and no devoiced-vowel symbol.

### Cited Findings
- Full Japanese phoneme list [local-file, official data], from `D:\Program Files\Synthesizer V Studio 2 Pro\clf-data\japanese-romaji-phones.txt` (type labels as in file):
  - vowels: a i u e o N
  - stops: cl t d k kw g gw b p ky py dy ty gy by
  - fricatives: s sh f
  - affricates: j z ts ch
  - aspirate: h hy
  - liquid: ry r
  - nasal: ny my n m
  - semivowel: w v y
  - silence: pau sil br
  - Notable absences: no ng, no separate m-type ん symbol, no devoiced-vowel symbols, no long-vowel symbol, no sy/zy (use sh/j), no cy/ch variants. Other language lists sit beside it (english-arpabet, mandarin/cantonese/korean/spanish-xsampa), usable for cross-lingual notes.
- Same list mirrored (no descriptions) in the unofficial manual: [Phoneme Reference](https://manual.synthv.info/phonemes/) [community, unofficial, no longer maintained]. Its labels ("N = vowel", "v = semivowel") are inconsistent but match the file.
- Phoneme entry syntax: start a note's lyric with "." to enter a literal phoneme sequence (main purpose: .s5p backward compatibility; also useful for single-phoneme notes). Avoid spaces in lyrics / dot-sequences because spaces affect Batch Lyric Input. Once phonemes are set manually the lyric text no longer affects output; empty phoneme string reverts to automatic. — [Editing Phonemes (unofficial manual)](https://manual.synthv.info/note-properties/editing-phonemes/) [community]. The repo template_sv2.svp note has a separate `phonemes` string field (kit.py line ~514: `"phonemes": ""`), which is the .svp-level equivalent.
- Special tokens: `br` = breath (AI voices only; can be a note's lyric or inside a phoneme sequence); `cl` = glottal stop, made by prefixing a lyric with an apostrophe or using `cl` phoneme; a note containing only the apostrophe ends a phrase with a glottal stop, at phrase start it gives a hard onset; `sil` forces silence for the note's duration (limits neighbour phoneme durations, can sound artificial; example use: shorten preutterance); `pau` smooths certain transitions, effect depends on database and neighbours. — [Editing Phonemes](https://manual.synthv.info/note-properties/editing-phonemes/)
- `-` sustains the sound across notes, `+` assigns the next syllable of a word to the next note, `++` for words spanning 3+ notes; Ctrl+L batch lyrics assigns one word per note. — [SynthV guide mirror](https://synthv.neocities.org/frag/guide/phonemes) [community]
- Invalid phonemes: SV2 shows a warning icon; one community post says a note with a non-allowable phoneme is skipped; phonemes are language-specific ("ry" valid in Japanese-romaji, not English-arpabet). — search snippets [single, unverified]
- SV2 changelog mention: fixed unrendered notes when a note beginning with manual `cl` is followed by legato (snippet) [single].
- Lyrics may be hiragana/katakana/romaji; AI voices can use cross-lingual phoneme lists with an accent. — [official forum guide, topic 6320](https://forum.synthesizerv.com/t/topic/6320/1) (snippet only)

### Inferences
- Pipeline-safe forced pronunciation: set the `phonemes` string of the note to space-separated symbols from the 42 above, and validate each token against the file (invalid tokens may silently skip the note).
- ん must map to the single symbol N; allophone choice (m/n/ng) is presumably contextual inside the AI model. Forcing m or n explicitly loses that. Untested.
- っ corresponds to `cl` (same symbol as the apostrophe glottal stop). Docs show cl only at note start, so a っ is likely best on its own short note or as the leading phoneme of the next note. Untested.
- Particles は/へ: no source found. Safest is to write わ/え in the lyric (or `.w a` / `.e`) when the word is a particle; based on general Japanese TTS practice, not sourced.
- Long vowels: no long-vowel symbol, so ー should be done with "-" sustain / a held note, not by repeating the vowel.

### Gaps
- Devoiced vowels (す/し/く at phrase ends): no source; no devoiced symbols in the phone file; unknown whether AI voices devoice automatically.
- Official statements on ん allophones and は/へ rules: not found (Dreamtonics docs 403).
- Teto AI 2-specific mispronunciation reports: none found. One Japanese snippet says the Teto AI library distribution ended April 2025 (unverified; check which product is installed).

## 2. Phoneme timing / strength: note.attributes.phonemes[] and 2.2.0 group sliders

### Takeaway
Official scripting docs (snippet) define `phonemes` (added in 2.1.1) as per-phoneme objects {leftOffset, position, activity, strength}; numeric values are NaN when default (inherited from the NoteGroupReference). Units are not documented in anything I could read; position/activity semantics are only community-guessed. 2.2.0 adds a Voice-panel group control for consonant strength (docs also say length) of plosives/fricatives; whether it is stored in .svp is unconfirmed.

### Cited Findings
- `phonemes` property: array of per-phoneme attribute objects, since 2.1.1; leftOffset ("offset added to the phoneme's left boundary"), position, activity, strength ("phoneme pronunciation strength"); NaN = note uses default from NoteGroupReference. — [Note scripting reference](https://dreamtonics.com/synthv/scripting/Note.html) (snippet; page 403) [official]
- Early-beta threads: 2.1.1 beta had symbol, language, activity, position; a later reply says only activity & position (& symbol/language) remained. Users guess "position = time, activity = level"; one user says position is the start of the sound (peak of a k) and leftOffset seems defined only when syllable timing is set manually. — [timestamps thread](https://forum.dreamtonics.com/t/how-can-i-get-timestamps-of-endpoints-of-each-phoneme-in-a-user-script/2615), [auto-generated timings thread](https://forum.dreamtonics.com/t/how-do-i-access-auto-generated-phoneme-timings-in-a-script/8175) (snippets) [single-user observations]
- LibreSVIP .svp model (verbatim from source): `SVPhonemeAttribute{left_offset: float|None (alias leftOffset), strength: float = 0, alt: int = 0, position: float|None, activity: float|None}`; `SVNoteAttributes` keeps list fields `dur: list[float]`, `alt: list[int]`, `strength: list[float]`, plus `phonemes: list[SVPhonemeAttribute]`; note-level `phonemes: str = ""`. No units given. — [LibreSVIP svp/model.py](https://raw.githubusercontent.com/SoulMelody/LibreSVIP/main/libresvip/plugins/svp/model.py) [community, code]
- V2 replaced V1 timing/strength controls with the bottom Phoneme Timing panel; opening V1 projects in V2 enables "evenly split into syllables" and loses manual timing/strength. — [forum: V2 phoneme duration/strength control removed](https://forum.dreamtonics.com/t/v2-phoneme-duration-strength-control-removed/1392) (snippet) [single]
- V1-era manual: phoneme timing distribution adjustable 20%-180% of default; note-offset slider moves a note up to 0.1 s and adjusts neighbour phonemes; consonant-initial notes may start before the note (preutterance); a single phoneme in its own note aligns with note boundaries and ignores preutterance. — [Note and Phoneme Timing](https://manual.synthv.info/note-properties/note-and-phoneme-timing/) [community, V1-era; may be outdated for SV2]
- 2.2.0 Beta 3: Voice-panel global control modulating strength of all unvoiced consonants in the group (motivated by choral vocals having softer consonants); plus EQ low shelf to tame plosives. — [2.2.0 Beta 3](https://forum.dreamtonics.com/t/synthesizer-v-studio-2-pro-2-2-0-beta-3/7338) (snippet). Official docs: Voice panel changes "the strength and length of consonants (plosives and fricatives) for an entire note group at once". — [Voice panel](https://sv2.docs.dreamtonics.com/en/voice-panel) (snippet) [official]
- Community script "sv mass duration and strength" edits phoneme duration (UI in percent of initial note length) and strength by vowel/consonant class, Japanese supported; no numeric ranges documented. — [GitHub](https://github.com/unbadfish/sv-mass-duration-and-strength-script)

### Inferences
- Group consonant sliders are probably stored on the note group / group reference (the default that phonemes' NaN values inherit from), not per note; actual JSON key names unknown.
- To settle keys and units: in SV 2.2.x change one phoneme's strength/timing and the group sliders, save, and diff against `D:\park\YD_Claude_RND\ben_suno\vocalo-ch\synthv-kit\template_sv2.svp` (its notes use `"attributes": {"evenSyllableDuration": true, "muted": false}`, `phonemes: ""`). Do not assume V1 percent units.
- Pipeline default: omit leftOffset/position/activity/strength unless measured; guessed numbers are risky.

### Gaps
- Units/ranges of leftOffset, position, activity, strength (official page unreadable; no other source).
- Whether 2.2.0 group sliders are stored in .svp, and their keys.
- Whether phonemes[] indexes align one-to-one with tokens of the phoneme string (likely, unconfirmed).

## 3. Clear diction; causes of mumbling

### Takeaway
No authoritative Japanese-specific recipe found. Sourced levers: per-phoneme Strength, Phoneme Timing panel, 2.2.0 consonant group control, separate vocal modes for pitch/timbre/pronunciation, Tension, and not crowding syllables or consonants. No numeric parameter ranges found.

### Cited Findings
- Per-phoneme Strength (Note Properties > Timing and Phonemes) fixed missing consonants (English f/r example). — [forum thread 5287](https://forum.synthesizerv.com/t/topic/5287) and search snippets [community]
- SV2 AI voices allow separate Vocal Modes for pitch, timbre and pronunciation (example: powerful pitch + belting timbre + soft pronunciation). — [Synthtopia SV2 Pro](https://synthtopia.com/?p=147569) (press, repeating Dreamtonics' feature claim)
- English-specific: Voice-panel "Use relaxed consonants" softened/dropped consonants in one case. — forum snippet [single]
- Too many consonants in a short span sound unnatural; alternate phonemes, Tension, Gender can help; a short pause before a word fixed one case; Gender/Tone Shift change timbre, not phonemes. — forum snippets [community, single]
- Use the Phoneme Timing panel rather than note length to change pronunciation length; it has plosive-onset prominence control. — [SV2 docs prev-version-changes](https://sv2.docs.dreamtonics.com/en/prev-version-changes) (snippet)
- "Evenly split note into syllables": splits multi-syllable lyric in one note into equal parts; good for steady pitch; disable for ambiguous syllables; one syllable per note (or "+") for fine timing. — [Note and Phoneme Timing](https://manual.synthv.info/note-properties/note-and-phoneme-timing/) [community, V1-era]
- 2.2.1 changed Korean phoneme assignment (script author added force-insert option), so automatic phoneme assignment can shift between versions; prefer explicit phonemes and pin the SV version. — [Korean Tweaks thread](https://forum.dreamtonics.com/t/korean-tweaks-a-script-for-correcting-korean-pronunciation/1520?page=2) [single]

### Inferences
- Mumbling candidates consistent with the above (not sourced as causes): low Tension, soft/low vocal modes on the pronunciation axis, very short notes, overlapping notes, high breathiness. Check these before touching phonemes. synthv-kit's kit.py already sets evenSyllableDuration true on every note; irrelevant for one-mora notes.
- Fast passages: shorten/strengthen consonants and shift note start earlier; phrase-end consonants need an explicit cl note or sufficient length.

### Gaps
- Numeric ranges for Tension/Breathiness/vocal-mode weights for clarity: not found.
- Japanese community guides (note.com, Pixiv, Hatena) not retrievable; no Teto-AI-2-specific diction advice found.
- Teto AI 2 available vocal modes: not researched.

## Suggested next steps
1. Validate every phoneme token against japanese-romaji-phones.txt before writing the note `phonemes` string.
2. Derive units/keys empirically by GUI edit + save + diff.
3. A/B render ん, っ, は/へ, ー and devoiced endings on Teto AI 2 to fill the gaps.

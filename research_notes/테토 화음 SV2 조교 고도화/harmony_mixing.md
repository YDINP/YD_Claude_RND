# Harmony & Backing Vocal Production/Mixing for Synthesized Vocals (SynthV / VOCALOID / UTAU, J-pop/Vocaloid)

> Source-reliability notes. Dreamtonics forum pages (forum.synthesizerv.com, which redirects to forum.dreamtonics.com) and sv2.docs.dreamtonics.com returned 302/403 to the fetcher, so forum claims below come from **search-result snippets**, not full-page reads. They are user opinions, not official guidance. General mixing numbers come from mixing blogs (Sage Audio, Music Guy Mixing, Waves) and Sound On Sound (SOS is the most reliable). I found **no Japanese ボカロP source with concrete dB or pan numbers**. The Japanese pages I found were qualitative (scrapbox musicstudyroom) or coconala service listings. Several search-engine summaries added "general knowledge" numbers with no source behind them. Those numbers are excluded here, or marked UNSOURCED.

## 1. Level of harmony vs lead, section dependence, panning, stereo doubling

### Takeaway
Sourced starting points: backing vocals **~4–8 dB below the lead**, and SynthV users report **6–12 dB below** for harmonies. Stacks go lower still. The lead stays centered. Harmony pairs go L/R, typically **inner pair ~35–50%, outer pair ~70–100%**. Each side needs a *different* performance (a different take), not a copy. Verses get a single quiet harmony line, and choruses get multi-tracked blocks.

### Cited Findings
- Backing vocals often sit around 4–8 dB below the lead, and stacked harmonies can go lower. Method: set the lead in solo first, then raise the backings until they thicken the sound without standing out. — search summary of [Sage Audio](https://www.sageaudio.com/articles/mixing-backing-vocals) / [Produce Like A Pro](https://producelikeapro.com/blog/how-to-mix-background-vocals/). PLAP returned 403, so this figure comes from the snippet only.
- A SynthV forum user mixes harmonies **6–12 dB** below the lead, and also detunes them **5–7 cents**. — [SynthV forum "tips for making better harmony in vocals?"](https://forum.synthesizerv.com/t/topic/6888) (snippet)
- SynthV centers every track by default. "It is common that harmonies and supporting vocals are panned left or right to some degree so that they sound separate from the lead." — [SynthV forum t/6888](https://forum.synthesizerv.com/t/topic/6888) (snippet)
- Waves five-part stack: lead centered, two parts **100% L/R**, two parts **50% L/R**. If that is too wide, set the outer pair to **70–80%** and the inner pair to half of that (**35–40%**). Reverb send: **100% wet** on the widest pair, **50%** on the secondary pair. The furthest-panned layers get longer delay and a wetter mix. — [Waves: Essential Guide to Producing Backing Vocals](https://www.waves.com/essential-guide-to-producing-backing-vocals-with-waves-plugins)
- Another guide puts main harmonies at **40% L/R** with secondaries further out, and suggests a **5–10 ms** delay on one side to add width without phase issues. — search snippet (source page not identified; [gearspace thread](https://gearspace.com/threads/vocal-harmonies-layering.548821/) was in the result set). Low reliability.
- Sage Audio places a voice on one side by delaying the *opposite* channel **0.5–0.7 ms** and adding a high-shelf cut on that channel. The pan must stay subtle, because a full pan breaks the delay and EQ cues. Backing regions are normalized to about **-23 LUFS** before processing. — [Sage Audio](https://www.sageaudio.com/articles/mixing-backing-vocals)
- If the same take is hard-panned to both sides, the double-tracking effect is lost, so each side needs its own performance. A wide stereo part needs **at least 4 performances (2 L + 2 R)**, and 3–4 per side can sound better. A single harmony line is usually recorded once, twice at most. Multi-part harmonies usually get 1–2 tracks per part. — [SOS: Crafting Perfect Pop Backing Vocals](https://www.soundonsound.com/techniques/crafting-perfect-pop-backing-vocals)
- Section dependence: **verses** usually get single harmony lines that don't distract from the lead. **Choruses and outros** get multi-tracked blocks, and the backing sometimes takes over the melody. Octave doubles work best across whole sections. **Low-octave doubles sit dry and close** to the lead, while **octave-up doubles get a good amount of reverb**. — [SOS](https://www.soundonsound.com/techniques/crafting-perfect-pop-backing-vocals)
- Avoid harmony and melody landing in **unison** at crossover points. The amplitudes sum and the level jumps. — [SOS](https://www.soundonsound.com/techniques/crafting-perfect-pop-backing-vocals)
- Waves: use faders to set intensity per section, such as different levels for verse and chorus. No dB figures are given. — [Waves](https://www.waves.com/essential-guide-to-producing-backing-vocals-with-waves-plugins)
- Japanese practice: in Vocaloid production, harmonies (ハモリ) are the mainstream way to add thickness, not doubling. Doubling is hard because the machine voice lacks natural ずれ (deviation). 3rd and 5th harmonies are the most common. — [scrapbox musicstudyroom「ボカロの声のハモリ方」](https://scrapbox.io/musicstudyroom/%E3%83%9C%E3%82%AB%E3%83%AD%E3%81%AE%E5%A3%B0%E3%81%AE%E3%83%8F%E3%83%A2%E3%83%AA%E6%96%B9)

### Inferences
- A practical default for SV2 WAV stems summed under the lead: the 3rd-above harmony starts **-6 dB** in the chorus and **-9 to -12 dB** in the verse (or is absent there). A pair goes to ±35–50%. Unison doubles start at **-8 to -12 dB** per side at ±70–100%. These figures combine the cited ranges and should be tuned by ear.
- For the L/R pair, render **two different takes** (a different AI Retake or seed, or a different vocal mode blend), never one WAV panned both ways.

### Gaps
- No Japanese ボカロP source gave numeric dB or pan values. The Japanese numbers ("2–6 dB", "20–40%") that search engines offered were unsourced, so they are excluded.
- No source gave a per-section dB automation curve (for example, verse vs chorus delta).

## 2. EQ, compression, de-essing and reverb differences between lead and harmony

### Takeaway
Make harmonies **thinner, darker, more de-essed, more compressed and wetter** than the lead. Use a HPF at ~300 Hz (or just below the fundamental), a LPF at ~5–6 kHz, and cuts at the fundamental, at 500 Hz and at 2–5 kHz. Use heavier split-band de-essing, about 4:1 compression, and send to the same reverb as the lead or a shorter one.

### Cited Findings
- HPF at **~300 Hz, 12 dB/oct**. The author's lead HPF is ~100 Hz (male) or ~130 Hz (female). This keeps the 150–250 Hz body range for the lead. LPF at **~5.5 kHz (5–6 kHz region), 12 dB/oct**, to remove "bite" so the lead keeps its presence. No air boost on backings. — [Music Guy Mixing: EQ Backing Vocals](https://www.musicguymixing.com/eq-backing-vocals/)
- A conflicting approach sets the HPF *just below the vocal's fundamental*. Then: bell **-3 to -6 dB at the fundamental**, **-2 dB-ish at ~500 Hz**, **-2 to -3 dB at 2–5 kHz**, and a narrow cut at 6–10 kHz only if sibilance remains. — [Sage Audio](https://www.sageaudio.com/articles/mixing-backing-vocals)
- Compression on backings: **4:1, soft knee, ~10 ms attack**, longer release, look-ahead on, "a few dB" of gain reduction. Tuning correction at 100%, moderate speed. Reverb: lower pre-delay so the whole signal is reverberated, and match the lead's reverb length or use a shorter one. Optional mild detune/modulation, and a **160 ms** tape slapback. — [Sage Audio](https://www.sageaudio.com/articles/mixing-backing-vocals)
- De-essing: backings can take **more aggressive** de-essing than the lead, using split-band mode with look-ahead. Sibilance can also be EQ-cut on the backings only. — search summary of [Sage Audio](https://www.sageaudio.com/articles/mixing-backing-vocals) / [metalworksstudios](https://metalworksstudios.com/dealing-with-esses-in-a-mix/)
- Waves: band-limited compression for consonants with **attack <50 ms, ratio ~8:1**. Use a dynamic EQ band that cuts only when a consonant frequency triggers. — [Waves](https://www.waves.com/essential-guide-to-producing-backing-vocals-with-waves-plugins)
- Route all backings to **one bus** before EQ and compression. Use reverb and delay to push them back. — search summary of [Sage Audio](https://www.sageaudio.com/articles/mixing-backing-vocals); SOS also recommends one bus or group per harmony part ([SOS](https://www.soundonsound.com/techniques/crafting-perfect-pop-backing-vocals)).
- SV2 Pro 2.2.0 added a per-track **Effects panel** with a chain (spatialization, EQ, compression, reverb). — search summary of [Dreamtonics forum 2.2.0 news](https://forum.dreamtonics.com/t/news-synthesizer-v-studio-2-pro-2-2-0-new-choir-voices-collections/7437) and [2.2.0 beta](https://forum.dreamtonics.com/t/synthesizer-v-studio-2-pro-2-2-0-beta/7211) (beta info, could not verify).

### Inferences
- For bright, sibilant voices such as Teto, the LPF/darkening and heavy de-essing on the harmony bus matter more than for a mellow voice. Because SV harmonies share the lead's exact formant and consonant character, this tonal contrast is the main source of separation.
- A ~300 Hz HPF is an aggressive pop setting. For sparse arrangements, start just below the harmony's lowest fundamental and raise it only if the low mids get muddy.

### Gaps
- No source gave a reverb decay time or a specific de-esser threshold or dB reduction for harmonies.

## 3. Doubling: same-note doubles with different takes, seeds or offsets (SynthV/VOCALOID); how many layers

### Takeaway
In SV2, make doubles with **AI Retakes** (Timing / Pitch / Timbre / All) or with the **Unison** feature added in 2.2.0. Unison sets the voice count and stereo spacing in the Voice panel and is built on internal AI retakes. Manual fine-tune and tick offsets increase the sense of multiple voices but cause **phasing**. A different voicebank or vocal-mode blend on the double also helps.

### Cited Findings
- SV2 AI Retakes modes: **All** retakes pitch, timing and timbre together. **Pitch** regenerates the pitch curve. **Timing** regenerates phoneme timing and length. **Timbre** regenerates timbre and pronunciation. Takes are selected per note, and "Crop to Active Takes" deletes the rest. The default take tends to be stable, so several retakes make a dynamic take more likely. — search summary of [SV2 docs: Notes panel](https://sv2.docs.dreamtonics.com/en/notes-panel) and [SV2 prev-version changes](https://sv2.docs.dreamtonics.com/en/prev-version-changes) (403 to fetch; snippet only)
- In V2, AI Retakes (especially "All") has a **much stronger effect** than in V1. — search summary of [SV migration guide](https://svdocs.dreamtonics.com/en/synthv/upgrade/migration-guide)
- Retakes can apply to full tracks, selections, **Track Groups** or single notes. Track groups let you assign different Vocal Modes per chunk. — search summary of [Mix Online SV2 Pro review](https://www.mixonline.com/technology/reviews/others/dreamtonics-synthesizer-v-studio-2-pro-review) and the migration guide
- SOS review: retakes vary timing, pitch, timbre or all three. An X/Y Expression pad sets expressiveness and vibrato depth on longer notes. Vocal Modes can be split per pitch, timbre and pronunciation. — [SOS: Dreamtonics Synthesizer V Studio 2 Pro](https://www.soundonsound.com/reviews/dreamtonics-synthesizer-v-studio-2-pro)
- **SV2 Pro 2.2.0 "Unison"** (called "Voice Doubling" in beta 1 and renamed in beta 3):
  - Sets the number of voices plus a **Spacing** parameter for stereo separation, and is powered by internal AI retakes rather than a post-effect.
  - Beta 1 said **up to 16 layers**. That figure is unverified in the final release.
  - Notes-panel sliders set **timing and pitch tightness** among voices, for **choir voices only**.
  - A right-click "split unison" command makes individual tracks with auto gain and positioning.
  - A global **consonant strength** slider was added "because choral vocals often have less pronounced consonants."
  - Sources: search summaries of [2.2.0 beta](https://forum.dreamtonics.com/t/synthesizer-v-studio-2-pro-2-2-0-beta/7211), [2.2.0 beta 3](https://forum.dreamtonics.com/t/synthesizer-v-studio-2-pro-2-2-0-beta-3/7338), [2.2.0 news](https://forum.dreamtonics.com/t/news-synthesizer-v-studio-2-pro-2-2-0-new-choir-voices-collections/7437), [forum "Trying out the new vocal doubling tool"](https://forum.dreamtonics.com/t/trying-out-the-new-vocal-doubling-tool/7445) (403). Medium reliability, since this is beta-era wording.
- Manual SV doubling: offsetting fine tune (**about ±20**) and delay (**about ±80 ticks**) on L and R voices "does give more of a sense of multiple voices, but the phasing problem is even worse." Plugins helped, but artefacts and phase issues remained. — [SynthV forum "How to double vocals" t/7491](https://forum.synthesizerv.com/t/topic/7491) (snippet)
- A V1-era "Instant Mode + Generate Take" workflow can derive a take from the lead. Set the instant-mode parameters to -100 if you don't want them to affect the tracks. — [SynthV forum t/7491](https://forum.synthesizerv.com/t/topic/7491) (snippet; V1 UI)
- Use a **different SV voice** (for example, a lighter or free voice) as the double or for ad-libs. — [SynthV forum t/7491 / t/6888](https://forum.synthesizerv.com/t/topic/6888) (snippets)
- Waves: record separate takes rather than duplicates, because duplicates cause phase issues. A pitched-down third layer can sit under the lead for thickness. — [Waves](https://www.waves.com/essential-guide-to-producing-backing-vocals-with-waves-plugins)
- Japanese Vocaloid workaround: copy the vocal to a new track and run a doubler plugin such as the free iZotope Vocal Doubler set to **effect only**, then mix it like a harmony group. A chorus plugin with a high RATE, low intensity and high MIX adds L/R width. Don't push the "Separation" control too far or the stereo image loses its focus. — [scrapbox musicstudyroom](https://scrapbox.io/musicstudyroom/%E3%83%9C%E3%82%AB%E3%83%AD%E3%81%AE%E5%A3%B0%E3%81%AE%E3%83%8F%E3%83%A2%E3%83%AA%E6%96%B9)
- Classic ADT-style delay doubles use ~20–35 ms (other sources say 20–60 ms or 19–30 ms). — search summary of [emastered: vocal doubler plugins](https://emastered.com/ja/blog/vocal-doubler-plugins) / [FabFilter forum](https://prod.fabfilter.com/forum/add-comment?id=6643). Low-medium reliability. Note that this is a delay *effect* value, not a natural performance offset.

### Inferences
- Doubling recipe for SV2 rendered to WAV, in order of preference:
  - **Option (a)**: duplicate the lead track and apply AI Retakes "All" or "Timing+Pitch" to the double, giving each L/R side a different take.
  - **Option (b)**: use Unison (2.2.0+) with a small voice count (2–4) and split it to stems for external mixing.
  - **Option (c)**: shift the vocal-mode blend or the voicebank on the double.
  - Avoid using only a static fine-tune or tick offset, because it causes phasing.
- Layer count: a chorus usually needs 2 doubles (L/R) plus 1–2 harmony parts, each with an L/R pair. Verses need 0–1 harmony.
- **Always check in mono.** A double with near-identical formants and timing combs badly.

### Gaps
- I could not read the full forum thread on the doubling tool, so user verdicts on Unison phasing quality are unknown.
- I could not verify the final 2.2.0 maximum voice count or whether the tightness sliders work on non-choir voices like Teto.
- For VOCALOID and UTAU I found no tool-specific doubling guidance beyond the generic "use a doubler plugin / prefer harmonies" advice.

## 4. Synth-voice settings for harmony parts (vibrato, timing, consonants, breaths, mode, Tension/Breathiness)

### Takeaway
SynthV users reduce vibrato on harmonies by about 50% or more, or set the Expression pad toward "Rigid". To get a softer timbre they lower Tension and raise Breathiness or use a soft vocal mode, rather than only lowering Loudness or phoneme strength, which just sounds more distant. They also reduce consonants: the 2.2.0 consonant-strength slider was added for exactly this. Breath and sibilance cleanup on doubles is standard practice.

### Cited Findings
- Reduce the Vibrato Modulation slider in Note Properties or the Expressiveness slider in AI Retakes. Many users reduce these by **~50%**. Apply it to all notes at once, or set the track default in the Voice panel. For harmony blending, slide the expression grid to the **bottom-left (Rigid)** and reduce the vibrato setting below it. — search summary of [Dreamtonics forum "How do I get 4 individual voices to blend better pitchwise?"](https://forum.dreamtonics.com/t/how-do-i-get-4-individual-voices-to-blend-better-pitchwise/7788) and [forum t/8404](https://forum.synthesizerv.com/t/topic/8404/3) (snippets)
- Choir/ensemble tip: lowering the default **Note Start, Phrase End and Pitch** values (these appear when notes are selected) gives more cohesive results. Moving Expression toward "Refined" and raising smoothness and roundness in the vocal mode gives a classical choir sound. — search summary of [Steinberg forum: SynthV choirs tip](https://forums.steinberg.net/t/ot-a-tip-for-anyone-experimenting-with-synthesizer-v-choirs/1037328) / [SynthV choir experiment](https://forums.steinberg.net/t/synthv-choir-experiment/1021017)
- Tension mainly changes brightness. For AI voices, lowering Tension mostly lowers volume, so combine lower Tension with higher Loudness. Lowering vowel phoneme strength or Loudness makes the voice sound **more distant, not softer**. Tension and Breathiness are what change dynamics. Some Pro voices have a **"soft" vocal mode**. — search summary of [forum t/8404](https://forum.synthesizerv.com/t/topic/8404/3), [VI-Control SynthV thread](https://vi-control.net/community/threads/synthesizer-v-vocaloid-haters-might-want-to-check-this.115973/page-84) (snippets)
- Global **consonant strength** slider (2.2.0), added because choral vocals often have less pronounced consonants. — search summary of [2.2.0 beta posts](https://forum.dreamtonics.com/t/synthesizer-v-studio-2-pro-2-2-0-beta/7211)
- Human-doubling practice that translates to synth stems:
  - Fade the doubled **S, Ch, T, D** consonants in and out so they tighten with the phrasing. — [gearspace](https://gearspace.com/threads/vocal-harmonies-layering.548821/) (snippet)
  - Hard consonants (**b, d, g, k, t**) must be aligned to the lead, or they blur the rhythm. — [SOS "Synchronised Singing"](https://www.soundonsound.com/techniques/synchronised-singing)
  - Remove or reduce breaths and sibilance on the doubles. — [Bonedo](https://www.bonedo.de/artikel/editing-workflows-und-tools-fuer-gelungene-backing-vocals)
- Pop, dance and urban styles need **very tight**, rhythmically aligned backing parts with heavy editing. — [SOS](https://www.soundonsound.com/techniques/crafting-perfect-pop-backing-vocals)
- Detune harmony **5–7 cents** and give it "different singing characteristics" from the lead. — [SynthV forum t/6888](https://forum.synthesizerv.com/t/topic/6888) (snippet)
- Japanese note: keep the pitch lines ("赤い線") from scattering, and keep them aligned. — [scrapbox musicstudyroom](https://scrapbox.io/musicstudyroom/%E3%83%9C%E3%82%AB%E3%83%AD%E3%81%AE%E5%A3%B0%E3%81%AE%E3%83%8F%E3%83%A2%E3%83%AA%E6%96%B9)

### Inferences
- Harmony track defaults for Teto in SV2 (to test, not proven):
  - Vibrato depth on long notes **~0–50%** of the lead's, with no vibrato on short notes.
  - Expression toward Rigid.
  - Tension a step *below* the lead, Breathiness slightly *above*. A softer mode blend if one exists, otherwise less belt/power.
  - Consonant strength lowered on the harmony, with the lead keeping the consonants.
  - Breaths removed from harmony stems (only the lead breathes).
  - Note onsets and offsets aligned to the lead for tight pop style. Use timing deviation only on *doubles* via retakes, kept small (single-digit to low tens of ms), not on the harmony as a whole.
- Sibilant handling: if the S/T on the harmony can't be cut in the synth, de-ess the harmony bus hard, or automate the gain on those consonants.

### Gaps
- No source specified exact Breathiness or Tension numbers for harmonies.
- No source gave a measured "few ms" timing offset for synth harmonies specifically. The 5–10 ms and 0.5–0.7 ms values are panning/width tricks from generic mixing guides.
- No source covered the VOCALOID-specific (VOCALOID6 VOCALO CHANGER, etc.) or UTAU-specific harmony parameter practice.

## 5. What makes synthesized harmonies sound "off"/robotic, and fixes

### Takeaway
The main causes are identical formants and timbre (it sounds like a pitched-down copy of the lead), sample-exact repetition, and phase/comb filtering when near-identical renders are summed. Others are pitch curves that drift differently from the lead, and doubled consonants and sibilants. The fixes are different takes or voices or modes, aligned pitch lines and consonants, darker EQ and wider panning, reduced vibrato, and checking in mono.

### Cited Findings
- "A synth repeats itself exactly" unlike a human. "You'll need to go out of your way to tune the supporting vocal tracks differently from the lead so they don't clash or sound like a pitched-down version of the exact same .wav file." — [SynthV forum t/6888](https://forum.synthesizerv.com/t/topic/6888) (snippet)
- A fine-tune and tick offset double adds multiplicity, but "the phasing problem is even worse"; artefacts and phase issues persist even with plugins. — [SynthV forum t/7491](https://forum.synthesizerv.com/t/topic/7491) (snippet)
- Duplicates (rather than separate takes) cause phase issues. — [Waves](https://www.waves.com/essential-guide-to-producing-backing-vocals-with-waves-plugins)
- Asynchronous consonants between the lead and the doubles make a diffuse sound image and reduce intelligibility. — [Bonedo](https://www.bonedo.de/artikel/editing-workflows-und-tools-fuer-gelungene-backing-vocals)
- Machine voices can't easily produce natural ずれ (deviation), which is why ボカロP use harmonies more than doubles. — [scrapbox musicstudyroom](https://scrapbox.io/musicstudyroom/%E3%83%9C%E3%82%AB%E3%83%AD%E3%81%AE%E5%A3%B0%E3%81%AE%E3%83%8F%E3%83%A2%E3%83%AA%E6%96%B9)
- Getting 4 SV voices to "blend better pitchwise" is a recognized problem. The fixes suggested are reduced vibrato and expressiveness and a Rigid expression setting. — [Dreamtonics forum t/7788](https://forum.dreamtonics.com/t/how-do-i-get-4-individual-voices-to-blend-better-pitchwise/7788) (snippet)
- Unison collisions: when harmony and melody meet on the same note, the level jumps. — [SOS](https://www.soundonsound.com/techniques/crafting-perfect-pop-backing-vocals)

### Inferences
Checklist for SV2 stems before summing:
- (1) Mono-sum the lead and each double, and listen for comb filtering.
- (2) Compare the pitch curves of the lead and the harmony at onsets, so that しゃくり and scoops land together or the harmony has none.
- (3) Make sure vibrato doesn't beat against the lead's vibrato.
- (4) Cut consonants and breaths on the harmony.
- (5) Separate the timbre with a darker EQ, a different mode blend, or lower tension.
- (6) Pan away from center.
- (7) At unison crossings, drop the harmony note or duck it.

### Gaps
- No quantitative study of SV formant-identical phasing was found.
- No Japanese ボカロP interview with concrete synth-harmony settings was found. Japanese search results were dominated by coconala MIX-service listings and SEO pages.

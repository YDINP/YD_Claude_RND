# Free melody-input (piano roll / score) software for Windows, as of Oct 2026, for a SynthV 2 / Vocaloid / Suno hobbyist

Scope: free (open-source or freeware) Windows tools for entering or editing melody notes, playing them back, and exporting MIDI/MusicXML that Synthesizer V Studio 2 can import. Research date: 2026-10-09. Around 17 tool calls; many minor tools were not verified (see Gaps).

## Free DAWs with good piano rolls: which are still free and current in 2026?

### Takeaway
The free Windows DAWs that are maintained and solid for 2026 are Cakewalk **Sonar (free tier)** and **Waveform Free**. **LMMS** is open source, but its stable build dates from 2020, and the active line is 1.3.0-alpha.2 (Sep 2026). **Cakewalk by BandLab** has reached end of life. **Studio One Prime** was discontinued with Studio One 7. **Zrythm v2** is alpha-only.

### Cited Findings
- **Cakewalk by BandLab has reached end of life.** The official Sonar page says it "has reached the end of development and support". Activation renewals end on Dec 31, 2025 (one FAQ on the same page says Aug 1, 2025, which conflicts). After activation expires, projects can't be saved or changed. Projects open in Sonar, and the two can be installed side by side. — [Cakewalk Sonar official](https://www.cakewalk.com/sonar)
- **Sonar has a free tier.** It needs a free BandLab account. The multi-track piano roll, articulation maps and step sequencer are not listed as Membership-only. Membership-only items are Track Manager, Theme Editor, the Core Plugin Suite, full ProChannel, Elastique Pro and unlimited Arranger tracks (the free tier gets 1 arranger track). — [Cakewalk Sonar official](https://www.cakewalk.com/sonar)
- A June 2026 roundup says the Sonar free tier has unlimited tracks and unrestricted export. It runs on Windows 11 and needs periodic online reactivation. BandLab Membership is quoted at $14.95/month or $149.50/year. — [DubSpot Best Free DAWs 2026](https://blog.dubspot.com/best-free-daws-2026). The pricing is not confirmed on the official page, which only links to the Membership page.
- **Waveform Free (Tracktion)** needs a Tracktion account. DubSpot quotes "Nothing caps your track count, your session length or what you export." The free version lacks the clip launcher, chord track, arranger track, clip automation and real-time stretch. The paid upgrade is Waveform Pro 14 at $249. — [DubSpot](https://blog.dubspot.com/best-free-daws-2026)
- **LMMS** is open source, needs no account and runs on Windows, macOS and Linux. It cannot record audio, and its VST instruments work on Windows only. Stable 1.2.2 is from 2020. — [DubSpot](https://blog.dubspot.com/best-free-daws-2026); [Wikipedia LMMS](https://en.wikipedia.org/wiki/LMMS)
- LMMS 1.3.0-alpha.2 is dated 6 Sep 2026. It adds 8 native plugins, detachable windows and microtonal tunings. Projects saved in it can't be reopened in older versions. The project recommends this alpha over nightly builds. — [AlternativeTo news Sep 2026](https://alternativeto.net/news/2026/9/lmms-releases-1-3-0-alpha-2-bringing-the-long-awaited-daw-s-update-closer-to-stable/); [newreleases.io](https://newreleases.io/project/github/LMMS/lmms/release/v1.3.0-alpha.2)
- **Studio One Prime was discontinued.** From version 7 (Oct 9, 2024), PreSonus moved to "one, feature-complete edition" and dropped Artist and Prime. Pro costs $199 for new users. — [MusicTech](https://musictech.com/news/gear/presonus-studio-one-pro/). Some 2025 "free DAW" lists still name Prime. That looks outdated. — [Bedroom Producers Blog list](https://bedroomproducersblog.com/2015/11/11/free-daw-software/)
- **Zrythm 2.0** is alpha only: the first alpha was reported May 31, 2026, and it has been rewritten in C++23 with Qt/QML. The download page says "pre-release software intended for testing only. Not suitable for production use". Projects saved in v2 and v1 cannot be opened in each other. — [Phoronix](https://www.phoronix.com/news/Zrythm-2.0-Alpha); [zrythm.org v2 alpha](https://www.zrythm.org/ko/download-v2-alpha.html); [BPB Aug 2026](https://bedroomproducersblog.com/2026/08/06/zrythm-2-alpha/)
- **MPC Beats (Akai)** is free. It includes 2GB of samples and loops plus 80 Air FX plugins, and it can run as a VST/AU plugin. Expansions cost $9.99 each. — [Gearnews](https://www.gearnews.com/akai-mpc-beats-free-beat-making-software); [DJ Mag](https://djmag.com/news/get-samples-sound-and-swing-mpc-free-mpc-beats)

### Inferences
- For a Windows user who wants a full DAW piano roll for free, Sonar (free tier) is the strongest pick. It is the old Cakewalk/SONAR piano roll, which offers step input, articulation maps and MIDI export. Waveform Free is second. LMMS is lighter and beginner-friendly, but it is better suited to beat-making and is stuck between an old stable build and an alpha.
- MPC Beats is beat- and pad-oriented, not a natural fit for typing in melodies.
- Reaper (paid at $60 discounted, with an uncapped 60-day evaluation) and the Bitwig and FL Studio trials are not free and should only be listed as notes. I did not research them this round.

### Gaps
- No current source checked on Ardour's Windows binary pricing (official binaries are pay-what-you-want, and the source is free) or its 2026 version.
- I could not confirm whether Sonar has a Korean UI, or the latest Sonar version number.
- I found no 2026 source on MPC Beats' latest version, or whether Akai is still updating it.

## Notation / score software: MuseScore Studio, Dorico SE, Flat.io

### Takeaway
**MuseScore Studio 4.7.x** (latest 4.7.5, Sep 8 2026; free, GPL) is the best free score-entry tool. It imports and exports MIDI and MusicXML, and MusicXML is the format that carries lyrics into SynthV most reliably. **Dorico SE** is free and now allows up to 8 players with a Steinberg ID, which is plenty for a melody line.

### Cited Findings
- Recent MuseScore releases: 4.7.0 (May 13), 4.7.1 (May 19), 4.7.2 (May 26; "various musicxml import/export enhancements"), 4.7.3 (Jun 11), 4.7.4 (Jul 7), 4.7.5 (Sep 8, latest). Before that, 4.6.2 to 4.6.5 shipped Oct to Dec (2025). 4.7.0 added note entry from a MIDI keyboard and MIDI machine control. — [MuseScore GitHub releases](https://github.com/musescore/MuseScore/releases)
- MuseScore 4.6 improved real-time note preview (it now responds to duration, velocity and the sustain pedal) and overhauled chord symbols. — [Linuxiac](https://linuxiac.com/musescore-studio-4-6-notation-app-released-with-vst3-support-on-linux/); [VI-Control](https://vi-control.net/community/threads/musescore-studio-4-6-released.166804/)
- MuseScore imports and exports MIDI (.mid, .midi, .kar). Because MIDI is not a notation format, some information may be lost on import. — [Wikipedia MuseScore](https://en.wikipedia.org/wiki/MuseScore)
- Dorico SE / Dorico for iPad is free for 4 players by default, or 8 with a free Steinberg ID. The old 2-player limit is outdated. — [loop.fans 2025](https://music.loop.fans/learn/the-best-free-music-notation-software-in-2025); [App Store listing via AppFollow](https://apps.appfollow.io/ios/dorico-music-notation/1556625090?country=ca); older 2-player claim: [Music Teacher review](https://musicteachermagazine.co.uk/content/review/tech-reviews-dorico-se)

### Inferences
- The best fit for a melody-plus-lyrics workflow: enter or clean up the melody and lyrics in MuseScore, export MusicXML, and import it into SynthV. This follows from SynthV's own guidance that MusicXML imports lyrics more accurately than MIDI (see the last section).
- MuseScore's MIDI import quantizes a sung or extracted melody into notation. Expect cleanup work on messy transcribed MIDI. For raw extracted MIDI, a piano roll is often faster.

### Gaps
- I did not verify Flat.io's 2026 free-tier limits; it is web-based and the free tier caps the number of scores.
- I did not verify a Korean UI for MuseScore 4.7. In my experience MuseScore ships a Korean translation, but this is unconfirmed this round.
- I did not get MuseScore's step-input shortcuts from an official 2026 source.

## Lightweight MIDI / piano-roll editors: Signal, Domino, MidiEditor, Sekaiju, Anvil, Online Sequencer, BeepBox/JummBox, Hookpad

### Takeaway
For a light "type in notes, export .mid" tool, **Domino** is still the classic among Japanese Vocaloid users. It is freeware, but it is not being updated: v1.44 is from Sep 2020. **Signal** is a maintained MIT-licensed browser and desktop sketch tool. **MidiEditor** has an active fork, jingkaimori ProMidiEdit 3.4.x, which added localization and a tempo editor.

### Cited Findings
- **Domino (TAKABO SOFT):** freeware ("フリーソフト", all features free). The latest version is 1.44 (2020-09-12). It is a MIDI-only piano-roll sequencer with step input and real-time input. It reads SMF format 0 and 1 and writes format 1. — [takabosoft.com/domino](https://takabosoft.com/domino)
- Domino features from Forest Watch: a chord-input helper (v1.18), automatic harmony generation from a melody (v1.40), lyric text events in MIDI (v1.40) and MIDI-keyboard step insertion (v1.16). It can drive VST instruments via loopMIDI and VSTHost. — [Forest Watch review](https://forest.watch.impress.co.jp/docs/review/20120925_561423.html); [Forest Watch news](https://forest.watch.impress.co.jp/docs/news/400307.html)
- Domino's UI is Japanese. The only English versions are unofficial fan translations of old builds (for example, 1.22 or 1.2.2) shared on forums, and their safety is unverified. — [WinWorld forum](https://forum.winworldpc.com/discussion/comment/186108)
- **Signal (ryohey/signal):** MIT license. A web app runs at signalmidi.app, and the repo contains an Electron desktop build. The project describes itself as a lightweight sketching tool meant to complement a DAW. It has about 3.7k commits and 2.4k stars. — [GitHub ryohey/signal](https://github.com/ryohey/signal)
- **MidiEditor:** the jingkaimori fork's latest is 3.4.1 (Sep 18, year not shown; built with xmake and MSVC, with an embedded metronome). 3.4.0 ("ProMidiedit", Jun 19) added localization support, a tempo editor and a new background style. Its releases are Windows-only for now. — [jingkaimori/midieditor releases](https://github.com/jingkaimori/midieditor/releases)

### Inferences
- The Japanese Vocaloid community's long-standing "Domino → SMF → VOCALOID/SynthV" habit still works, because SynthV imports SMF. Domino is effectively frozen, though, and comes in Japanese only. For a Korean user, Signal (in the browser, zero install) or MidiEditor may be easier.
- Signal is the quickest way to open an extracted-melody .mid, fix notes and re-export it without installing anything.

### Gaps
- **Not verified this round (no source found or checked):** Sekaiju (open-source Japanese sequencer; last update believed to be around 2013, so treat it as stale), Anvil Studio (Willow Software; current status in 2026 unknown and possibly unmaintained), Online Sequencer (web freeware), BeepBox and JummBox (web, open source, chiptune-oriented, with MIDI export), and Hookpad's free tier (Hooktheory; limited free projects). The report should mark these as "unverified 2026 status".
- Signal's specific keyboard shortcuts and its MIDI import/export details were not confirmed from the README.
- Which Windows versions Domino officially supports was not shown on the page I fetched. Anecdotally it runs on Windows 10/11, but this is unverified.

## Vocal-synth editors (OpenUtau) and moving melodies into Synthesizer V 2

### Takeaway
**OpenUtau** is MIT-licensed, very active (0.1.573 beta on Oct 8, with near-daily alpha builds) and runs on Windows, macOS and Linux. It works as a free melody and lyric sketchpad. **SynthV Studio 2 Pro** officially imports MIDI and MusicXML. MusicXML generally carries lyrics more accurately than MIDI.

### Cited Findings
- OpenUtau's recent releases are 0.1.573 Beta (Oct 8), 0.1.572.x Alphas (Oct 3–7), 0.1.571 Beta (Oct 3) and 0.1.570.x Alphas (late Sep). Some of the release notes mention a DAW integration API. — [OpenUtau GitHub releases](https://github.com/stakira/OpenUtau/releases)
- The OpenUtau README says: MIT license; Windows (32/64-bit), macOS and Linux; VSQX (Vocaloid 4) import; UI translation managed via Crowdin; and a Korean phonemizer. A Korean UI translation was not confirmed on the page. — [OpenUtau GitHub](https://github.com/stakira/OpenUtau)
- Repository stats site: the last push was Jun 21, 2026. The releases page shows much newer builds, so that site is stale. — [gittrend.io](https://gittrend.io/repo/openutau/OpenUtau)
- SynthV Studio 2 Pro can "import MIDI files, MusicXML files, and other singing data formats". It warns that not all lyrics may import accurately. It says MusicXML generally imports lyrics more accurately than MIDI (for English; accuracy varies by language). Importing tracks from another project accepts .svp, MIDI and MusicXML, but tempo is not imported that way. — [SV2 docs: project](https://sv2.docs.dreamtonics.com/en/project); [SV2 docs: enter notes](https://sv2.docs.dreamtonics.com/en/enter-notes)
- In a SynthV 2.2.0b2 forum report, MIDI import handled tied notes as long notes, while MusicXML treated them as slurs. The same post said MusicXML handled multi-syllable words better. Another user said results depend on how the MusicXML encodes slurs and melisma. A Dorico MusicXML issue was fixed in a later beta. — [Dreamtonics forum](https://forum.dreamtonics.com/t/2-2-0b2-lyric-import-problems-from-musicxml-and-midi/7250)
- SynthV 2 Pro can also extract notes and lyrics from audio ("Extract Notes from Audio") straight onto a piano-roll track. — [Mix review](https://www.mixonline.com/technology/reviews/others/dreamtonics-synthesizer-v-studio-2-pro-review); [Dreamtonics voice-to-MIDI](https://dreamtonics.com/?p=4669)
- When SynthV runs as a plugin inside a DAW, notes and lyrics must be entered in the plugin's own editor, not on the DAW track. — [SV2 docs: inst plugin](https://sv2.docs.dreamtonics.com/en/inst-plugin)

### Inferences
- Recommended pipeline for this user:
  1. Get the reference melody as .mid (from a separate extraction tool).
  2. Clean it up in Signal, Domino or MidiEditor, or in the Sonar piano roll for heavier editing.
  3. To bring lyrics in, enter them in MuseScore and export MusicXML. Alternatively, import a plain MIDI into SynthV and type the lyrics there.
  4. Import into SynthV 2.
- OpenUtau is useful as a free vocal preview tool before moving to SynthV. Third-party knowledge (unverified this round) says it can import MIDI and UST and export UST and MIDI.
- Because SynthV doesn't carry tempo over when importing tracks into an existing project, set the project tempo first, or create a new project from the file.

### Gaps
- I could not confirm from an official OpenUtau source that it imports and exports MIDI. Neither the README nor the release notes I fetched list it, though it is widely reported elsewhere. The report should flag this as needing a quick check (File > Import, and Export MIDI).
- Korean UI availability: unconfirmed for OpenUtau, Sonar, Signal and MidiEditor. Domino is Japanese only.
- The exact SynthV import menu path was not retrieved.

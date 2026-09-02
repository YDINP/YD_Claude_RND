//! Audio file decoding (ogg/vorbis, mp3, wav) to mono f32, plus resampling.

use std::fs::File;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Decode a whole file to mono. Returns (samples, source sample rate).
pub fn decode_file(path: &Path) -> Result<(Vec<f32>, u32), String> {
    let file = File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("{}: probe: {e}", path.display()))?;
    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| format!("{}: no audio track", path.display()))?;
    let track_id = track.id;
    let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(1).max(1);
    let rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| format!("{}: unknown sample rate", path.display()))?;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("{}: codec: {e}", path.display()))?;

    let mut mono: Vec<f32> = Vec::new();
    let mut buf: Option<SampleBuffer<f32>> = None;
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(SymError::ResetRequired) => break,
            Err(e) => return Err(format!("{}: read: {e}", path.display())),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(SymError::DecodeError(_)) => continue, // skip a bad frame
            Err(e) => return Err(format!("{}: decode: {e}", path.display())),
        };
        let sb = buf.get_or_insert_with(|| SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec()));
        sb.copy_interleaved_ref(decoded);
        let s = sb.samples();
        mono.reserve(s.len() / channels);
        for frame in s.chunks(channels) {
            mono.push(frame.iter().sum::<f32>() / channels as f32);
        }
    }
    Ok((mono, rate))
}

/// Linear-interpolation resampler. Adequate for short percussive samples.
pub fn resample_linear(src: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || src.is_empty() {
        return src.to_vec();
    }
    let ratio = from as f64 / to as f64;
    let n = (src.len() as f64 / ratio) as usize;
    (0..n)
        .map(|i| {
            let p = i as f64 * ratio;
            let i0 = p as usize;
            let i1 = (i0 + 1).min(src.len() - 1);
            let f = (p - i0 as f64) as f32;
            src[i0] * (1.0 - f) + src[i1] * f
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_keeps_duration() {
        let src: Vec<f32> = (0..44100).map(|i| (i as f32 * 0.01).sin()).collect();
        let out = resample_linear(&src, 44100, 48000);
        assert!((out.len() as i64 - 48000).abs() <= 1);
        let same = resample_linear(&src, 48000, 48000);
        assert_eq!(same.len(), src.len());
    }

    #[test]
    fn decodes_wav_written_by_hound() {
        let dir = std::env::temp_dir().join("keyclack-decode-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("tone.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut w = hound::WavWriter::create(&path, spec).unwrap();
        for i in 0..4410 {
            let v = ((i as f32 * 0.05).sin() * 16000.0) as i16;
            w.write_sample(v).unwrap();
            w.write_sample(v).unwrap();
        }
        w.finalize().unwrap();

        let (mono, rate) = decode_file(&path).unwrap();
        assert_eq!(rate, 44100);
        assert_eq!(mono.len(), 4410);
        let peak = mono.iter().fold(0.0f32, |m, v| m.max(v.abs()));
        assert!(peak > 0.4 && peak < 0.6, "peak {peak}");
    }
}

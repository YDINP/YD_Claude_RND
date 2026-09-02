//! Synthetic "clicky switch" samples so the spike needs no asset files.

use std::f32::consts::PI;

struct Lcg(u32);
impl Lcg {
    fn next(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (self.0 >> 8) as f32 / (1u32 << 24) as f32 * 2.0 - 1.0
    }
}

fn render(rate: u32, len_ms: f32, parts: &[(f32, f32, f32)], noise_amt: f32, noise_decay: f32) -> Vec<f32> {
    // parts: (freq_hz, amplitude, decay_per_sec)
    let n = (rate as f32 * len_ms / 1000.0) as usize;
    let mut rng = Lcg(0xC0FFEE);
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let t = i as f32 / rate as f32;
        let mut s = 0.0;
        for &(f, a, d) in parts {
            s += a * (2.0 * PI * f * t).sin() * (-d * t).exp();
        }
        s += noise_amt * rng.next() * (-noise_decay * t).exp();
        // 1 ms attack to avoid a DC pop
        let att = (t / 0.001).min(1.0);
        out.push((s * att).clamp(-1.0, 1.0));
    }
    out
}

/// Bottom-out: low thump + bright click + short noise burst.
pub fn click_down(rate: u32) -> Vec<f32> {
    render(
        rate,
        70.0,
        &[(180.0, 0.35, 60.0), (2600.0, 0.5, 220.0), (5200.0, 0.25, 400.0)],
        0.6,
        350.0,
    )
}

/// Release: lighter, higher, shorter.
pub fn click_up(rate: u32) -> Vec<f32> {
    render(rate, 40.0, &[(3400.0, 0.4, 350.0), (7000.0, 0.2, 600.0)], 0.4, 500.0)
}

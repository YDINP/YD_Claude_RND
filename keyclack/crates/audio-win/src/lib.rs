//! Low-latency WASAPI shared-mode output via IAudioClient3.
//!
//! Shared mode through IAudioClient (what cpal uses) is locked to the engine's
//! default period, 10 ms on most systems. IAudioClient3::InitializeSharedAudioStream
//! lets us ask for the minimum period the driver supports (typically 2.67 ms at
//! 48 kHz) without taking exclusive ownership of the device.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use windows::core::{Result, PCWSTR};
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioClient3, IAudioRenderClient, IMMDevice, IMMDeviceEnumerator,
    MMDeviceEnumerator, AUDCLNT_STREAMFLAGS_EVENTCALLBACK, DEVICE_STATE_ACTIVE, WAVEFORMATEX,
    WAVEFORMATEXTENSIBLE,
};
use windows::Win32::Media::KernelStreaming::WAVE_FORMAT_EXTENSIBLE;
use windows::Win32::Media::Multimedia::{KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, WAVE_FORMAT_IEEE_FLOAT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
};
use windows::Win32::System::Threading::{
    AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsW, CreateEventW, WaitForSingleObject,
};

use keyclack_core::Mixer;

pub struct Info {
    pub name: String,
    pub sample_rate: u32,
    pub channels: usize,
    pub period_frames: u32,
    pub buffer_frames: u32,
}

fn device_name(d: &IMMDevice) -> String {
    unsafe {
        d.OpenPropertyStore(STGM_READ)
            .and_then(|s| s.GetValue(&PKEY_Device_FriendlyName))
            .map(|v| v.to_string())
            .unwrap_or_default()
    }
}

fn pick_device(enumerator: &IMMDeviceEnumerator, substr: Option<&str>) -> Result<IMMDevice> {
    unsafe {
        match substr {
            None => enumerator.GetDefaultAudioEndpoint(eRender, eConsole),
            Some(sub) => {
                let sub = sub.to_lowercase();
                let coll = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
                for i in 0..coll.GetCount()? {
                    let d = coll.Item(i)?;
                    if device_name(&d).to_lowercase().contains(&sub) {
                        return Ok(d);
                    }
                }
                Err(windows::core::Error::new(windows::core::HRESULT(-1), "no output device matching that name"))
            }
        }
    }
}

/// Friendly names of active render endpoints.
pub fn list_devices() -> Vec<String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let mut out = Vec::new();
        let Ok(enumerator) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) else {
            return out;
        };
        let Ok(coll) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) else {
            return out;
        };
        for i in 0..coll.GetCount().unwrap_or(0) {
            if let Ok(d) = coll.Item(i) {
                out.push(device_name(&d));
            }
        }
        out
    }
}

/// Opens the device at its minimum shared-mode period and runs the render loop on a
/// dedicated "Pro Audio" thread until `stop` is set. Returns stream info once the
/// stream is started.
pub fn start(
    device_substr: Option<String>,
    make_mixer: impl FnOnce(usize) -> Mixer + Send + 'static,
    stop: Arc<AtomicBool>,
) -> Result<Info> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<Info>>();
    std::thread::Builder::new()
        .name("keyclack-wasapi".into())
        .spawn(move || unsafe {
            let r = run(device_substr, make_mixer, stop, tx);
            if let Err(e) = r {
                eprintln!("[wasapi3] thread error: {e}");
            }
        })
        .expect("spawn wasapi thread");
    rx.recv().expect("wasapi thread died before reporting")
}

unsafe fn run(
    device_substr: Option<String>,
    make_mixer: impl FnOnce(usize) -> Mixer,
    stop: Arc<AtomicBool>,
    report: std::sync::mpsc::Sender<Result<Info>>,
) -> Result<()> {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let device = pick_device(&enumerator, device_substr.as_deref())?;
    let name = device_name(&device);
    let client: IAudioClient3 = device.Activate(CLSCTX_ALL, None)?;

    let fmt_ptr: *mut WAVEFORMATEX = client.GetMixFormat()?;
    let fmt = &*fmt_ptr;
    let is_float = if fmt.wFormatTag as u32 == WAVE_FORMAT_EXTENSIBLE {
        let ext = std::ptr::read_unaligned(fmt_ptr as *const WAVEFORMATEXTENSIBLE);
        let sub = ext.SubFormat;
        sub == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
    } else {
        fmt.wFormatTag as u32 == WAVE_FORMAT_IEEE_FLOAT
    };
    if !is_float || fmt.wBitsPerSample != 32 {
        let _ = report.send(Err(windows::core::Error::new(
            windows::core::HRESULT(-1),
            "mix format is not 32-bit float; wasapi3 backend needs conversion (not implemented in spike)",
        )));
        CoTaskMemFree(Some(fmt_ptr as *const _));
        return Ok(());
    }
    let sample_rate = fmt.nSamplesPerSec;
    let channels = fmt.nChannels as usize;

    let mut default_p = 0u32;
    let mut fundamental_p = 0u32;
    let mut min_p = 0u32;
    let mut max_p = 0u32;
    client.GetSharedModeEnginePeriod(fmt_ptr, &mut default_p, &mut fundamental_p, &mut min_p, &mut max_p)?;
    eprintln!(
        "[wasapi3] engine period frames: default={} fundamental={} min={} max={} ({:.2} ms min)",
        default_p,
        fundamental_p,
        min_p,
        max_p,
        min_p as f64 * 1000.0 / sample_rate as f64
    );

    client.InitializeSharedAudioStream(AUDCLNT_STREAMFLAGS_EVENTCALLBACK, min_p, fmt_ptr, None)?;
    CoTaskMemFree(Some(fmt_ptr as *const _));

    let event: HANDLE = CreateEventW(None, false, false, PCWSTR::null())?;
    client.SetEventHandle(event)?;
    let render: IAudioRenderClient = client.GetService()?;
    let buffer_frames = client.GetBufferSize()?;

    let mut task_index = 0u32;
    let avrt = AvSetMmThreadCharacteristicsW(windows::core::w!("Pro Audio"), &mut task_index);

    let mut mixer = make_mixer(channels);
    // Pre-fill with silence so the first period has data.
    {
        let p = render.GetBuffer(buffer_frames)?;
        std::ptr::write_bytes(p, 0, buffer_frames as usize * channels * 4);
        render.ReleaseBuffer(buffer_frames, 0)?;
    }
    client.Start()?;
    let _ = report.send(Ok(Info {
        name,
        sample_rate,
        channels,
        period_frames: min_p,
        buffer_frames,
    }));

    while !stop.load(Ordering::Relaxed) {
        if WaitForSingleObject(event, 2000) != WAIT_OBJECT_0 {
            eprintln!("[wasapi3] event timeout");
            continue;
        }
        let padding = client.GetCurrentPadding()?;
        let avail = buffer_frames - padding;
        if avail == 0 {
            continue;
        }
        let p = render.GetBuffer(avail)?;
        let out = std::slice::from_raw_parts_mut(p as *mut f32, avail as usize * channels);
        mixer.render(out);
        render.ReleaseBuffer(avail, 0)?;
    }

    let _ = client.Stop();
    if let Ok(h) = avrt {
        let _ = AvRevertMmThreadCharacteristics(h);
    }
    let _ = CloseHandle(event);
    Ok(())
}

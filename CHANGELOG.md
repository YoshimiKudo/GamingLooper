# Changelog

## 0.1.0

- Initial Windows directory release candidate.
- Supports BGM sequence building with Loop, Time, and Straight playback modes.
- Adds the VGTDEEP Auto Loop preset for game soundtrack loop detection.
- Queues import-time Auto Loop scans when another scan is already running.
- Builds waveform previews for compressed BGM formats through the renderer decoder when needed.
- Supports SE Pad assignment, per-key volume and pan, icon selection, and SE Set save/load.
- Includes the bundled Starter SE Set under `asset/se`.
- Uses a portable `save` folder next to `GamingLooper.exe` in directory releases.

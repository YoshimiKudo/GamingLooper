# GamingLooper

GamingLooper is a desktop game-audio loop, playlist, and SE audition tool based on AutoLooper's loop-detection approach.

The app keeps loop markers, playlist rules, SE assignments, mix settings, and visual settings in a local project file. It does not write loop metadata into audio files.

## PUBLIC RELEASE STATUS

GamingLooper is preparing for an open public GitHub release. The source code is licensed under the MIT License. Bundled starter SE files under `asset/se` use a separate asset license so they can be redistributed with GamingLooper, but not repackaged as a standalone sound-effect library.

The Windows app is currently distributed as an unsigned directory release. Windows may show a security warning when launching an unsigned executable.

## SAVING IN DIRECTORY RELEASES

In a directory release, keep the whole `GamingLooper` folder together. `GamingLooper.exe` uses the folder it is placed in as the portable app root.

On first packaged launch, the default save locations are:

```text
Project save     -> GamingLooper/save/gaminglooper-settings.json
Sequence files   -> GamingLooper/save
SE Set files     -> GamingLooper/save
Bundled SE files -> GamingLooper/asset/se
```

`Project save` stores the full GamingLooper work state, including Sequence List, saved SE Sets, ratings, cumulative play time, SE assignments, Mix, and Config values.

Sequence and SE Set save folders can be changed in `Config > Files & Save`. If those folders were changed before, GamingLooper remembers the custom folders in the Windows app data area and shows those paths instead of the default `save` folder.

Audio files are not copied or moved automatically. Saved data keeps file references, while bundled starter SE files live under `asset/se`.

Avoid placing the directory release under write-protected locations such as `Program Files`. Use a user-writable folder such as `Documents`, or another folder where the user can write to `save`.

## WHAT GAMINGLOOPER IS FOR

GamingLooper is for auditioning BGM and SE together, then editing soundtrack playback with the loop count, track time, or straight one-shot playback you want.

It has two main purposes.

### 1. Build game BGM flow and check it while it plays

Use Main View to audition BGM and SE together in a game-like sound workspace. You can play a BGM List, assign SE files to keyboard pads, trigger those SE sounds while the BGM is playing, and check whether the sound flow feels right.

For SE work:

- Assign an SE file to each SE Pad key.
- Tune `Vol` per key so important sounds are audible without overpowering the BGM.
- Tune `Pan` per key to check left/right placement.
- Set an icon and color per key so the pad is readable during use.
- Use `SE Voice Limit` to control how many SE sounds can overlap.
- Save the current key layout as an `SE Set`, then load it later without rebuilding assignments by hand.

This side of the app is for confirming how BGM and SE behave together while you actually hear them.

### 2. Import game soundtracks and play them with custom loop or time rules

Use Sequence Builder to load soundtrack files, choose only the songs you need, set their order, and decide how each song transitions to the next. Each song can use a loop count, a fixed play time, straight source playback, and a fade-out value.

## HOW TO ASSIGN SE TO KEYS

SE Pad playback starts by assigning SE files to keyboard pads. An SE Set is the saved key layout: which SE file is assigned to each key, how loud it is, where it sits in the stereo field, and how it is visually identified.

```text
SE Pad key  --->  Load SE file  --->  Tune Vol / Pan / Icon  --->  Save SE Set  --->  Play with BGM
 choose key       import sound        make it readable/useful     reuse layout      audition balance
```

### 1. Choose the key you want to use

In Main View, each SE Pad key represents a keyboard key. Click an empty key to start assigning an SE file to that key.

Use keys that match the way you want to test sounds. For example, put frequently triggered UI sounds near your main hand position, and put rare or heavy effects farther away.

### 2. Load the SE file

Import an SE file into the selected key. The file is assigned to that key only; it is not added to the BGM Play List.

Once the file is ready, pressing or clicking that key plays the SE. Assigned SE files are preloaded so playback can respond quickly.

### 3. Tune Vol, Pan, and icon

Each assigned key has SE settings:

| Setting | Meaning |
| --- | --- |
| `Vol` | Adjusts the volume of that SE key. Use it to keep important sounds audible without overpowering the BGM. |
| `Pan` | Places the SE left or right. Use it to check spatial balance against the BGM. |
| `Icon / Color` | Changes how the key looks, so the pad remains readable while you are triggering sounds. |

Use the BGM Monitor and SE Monitor while auditioning. The goal is to hear whether SE attacks, UI sounds, alerts, or hit sounds sit correctly against the current BGM.

### 4. Control overlap with SE Voice Limit

`SE Voice Limit` controls how many SE sounds can overlap at once.

Use a lower value when you want a cleaner, game-like limit. Use a higher value when you want to test dense sound effects or repeated triggers. Late-trigger priority means newer SE triggers stay important when too many sounds overlap.

### 5. Save the layout as an SE Set

When the key assignments feel right, save them as an `SE Set`.

An SE Set stores the assigned SE file references, Vol, Pan, icon, color, and voice limit. Load the SE Set later to restore the same pad layout without rebuilding it by hand.

## HOW TO BUILD SEQUENCE

Build a List that plays game soundtrack files with the loop count, play duration, or straight source playback you choose.

Use `Loop` when you want to hear loop markers repeat, `Time` when you want to play for a chosen number of seconds, or `Straight` when you want to ignore loop markers and play the source from start to end once. Arrange the order, adjust `Fade`, then save it so Main View can play that flow back.

```text
BGM Source  --->  Build Sequencer  --->  Complete & Save Sequence  --->  Sequence List  --->  Main View Play List
 import songs       choose order/rules        save a Sequence file       load List          play
```

### 1. Load tracks in BGM Source

Drop audio files into `BGM Source`, or use `BGM読込 / Import BGM`.

At this point, the tracks are source material. They are not yet a Play List. Tracks listed here become candidates for the Sequence.

### 2. Arrange tracks in Build Sequencer

Send only the tracks you want from `BGM Source` into `Build Sequencer`.

The cards inside Build Sequencer become the Sequence. The order you arrange here becomes the playback order.

### 3. Choose how each track plays

Each song in Build Sequencer has playback rules:

| Rule | Meaning |
| --- | --- |
| `Loop` | Play the song through its loop section for the selected loop count, then move to the next song. |
| `Time` | Play the song for the selected number of seconds, then move to the next song. |
| `Straight` | Ignore loop markers for that Sequence row and play the source from start to end once. |
| `Fade` | Fade out for the selected seconds before the next song starts. |

Use the BGM Monitor to check loop markers and playback if needed.

### 4. Save it as a playable List

When the order and rules are ready, press `Complete & Save Sequence`.

Choose a file name in the save dialog. If the Sequence file is saved, it is mounted into `Sequence List` as a reusable List. If the save dialog is canceled, nothing is mounted. Main View can load the saved Sequence and play it back with the order, `Loop`, `Time`, `Straight`, and `Fade` you set.

### 5. Load the List and play it in Main View

Click a saved List in `Sequence List` to load it into Main View. The Main View Play List uses the saved order and transition rules.

In short: import source tracks, send only the tracks you need into Build Sequencer, choose `Loop`, `Time`, or `Straight` per track, adjust `Fade`, save with Complete & Save Sequence, then play the saved List from Main View.

## Core Policy

- Non-destructive by design. Audio files are never rewritten for loop metadata.
- Loop markers, playlist rules, SE assignments, per-track BGM volume, SE volume/PAN, mix, visual settings, display language, and panel split ratios are stored locally.
- BGM is one playback stream. SE is multi-voice with a configurable voice limit and late-trigger priority.
- App state can be saved, loaded, initialized, exported as a JSON backup, and imported from a JSON backup.

## License

- Source code and documentation: MIT License. See `LICENSE`.
- Bundled starter SE files in `asset/se`: GamingLooper bundled SE asset license. See `ASSET-LICENSE.md`.
- User-imported BGM and SE files are not copied into the app and remain under their original rights and licenses.

## BGM / Play List

- Import BGM files from the Main or Play List view.
- If `Run on Import` is enabled in Config, Auto Loop runs for each newly imported BGM. If another scan is already running, the imported tracks wait and scan after the active scan completes.
- `VGTDEEP` is the default game-OST Auto Loop preset. It uses Deep detection with a 30-second minimum loop and a 60% acceptance line, tuned for practical game soundtrack scanning.
- MP3, OGG, FLAC, and OPUS imports build waveform previews through the renderer audio decoder when needed.
- Use `Auto Loop All` to scan all loaded BGM files.
- Build Play List before playlist playback. Before creation, playlist playback is disabled and prompts to open the Play List build flow.
- Each playlist item can use loop count, duration, or straight playback, with fade-out before moving to the next item.
- Playlist rules can be copied, pasted, moved, and applied across all items.

## SE Pad

- Click an unassigned key to import SE.
- Click an assigned key to play it.
- Shift+click an assigned key to unload it.
- The red lamp opens the key popup for volume, PAN, and load.
- Mouse wheel on an assigned key cycles the icon.
- Right-click an assigned key opens the icon list.
- Assigned SE files are preloaded to memory. Keys remain in Loading/Error state until ready; playback uses cached audio only.

## Analyzer

- Spectrum compares BGM and SE buses.
- Orange overlap indicates a possible band-interference candidate.
- Stronger orange means SE is more dominant in the overlap.
- Frequency grid labels are logarithmic to support practical band checks.

## Shortcuts

- `Ctrl+Z`: Project Undo
- `Ctrl+Y` / `Ctrl+Shift+Z`: Project Redo
- `Shift+click SE key`: Unload assigned SE
- `Mouse wheel on SE key`: Change icon
- `Right-click SE key`: Icon list
- `Panel border drag`: Resize playlist, waveform, SE pad, and analyzer areas

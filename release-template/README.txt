GamingLooper README
===================

GamingLooper is a portable Windows directory release.

Start
-----

Double-click GamingLooper.exe.

Keep the whole GamingLooper folder together. The app expects these folders and
files to stay next to GamingLooper.exe:

- save
- asset/se
- resources

Save data
---------

The save folder is the default local save location.

By default, GamingLooper saves these files under save:

- Project state: gaminglooper-settings.json
- Sequence files: .glseq
- SE Set files: .glset

Project state includes Sequence List, saved SE Sets, ratings, cumulative play
time, SE assignments, Mix, and Config values.

Audio files are not copied or moved automatically. GamingLooper keeps file
references, so do not move your source audio files after saving unless you plan
to re-import them.

Updating
--------

Before replacing an old GamingLooper folder, back up or keep the old save
folder if you need its saved data.

The bundled starter SE files are in asset/se. They are included so the first
launch has an assigned SE Pad.

Notes
-----

This build is unsigned. Windows may show a security warning on first launch.

Do not place the GamingLooper folder in a write-protected location such as
Program Files. Use Documents or another user-writable folder.

For detailed usage, see the in-app README button or the GitHub README.

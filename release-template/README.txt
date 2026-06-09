GamingLooper README
===================

日本語
------

GamingLooper は、Windows向けのポータブルなディレクトリ配布版です。

起動方法
--------

GamingLooper.exe をダブルクリックしてください。

GamingLooper フォルダ全体をまとめて保持してください。アプリは
GamingLooper.exe の隣にある以下のフォルダやファイルを使います。

- save
- asset/se
- resources

保存データ
----------

save フォルダは、初期状態のローカル保存先です。

初期設定では、GamingLooper は以下のデータを save フォルダに保存します。

- Project 状態: gaminglooper-settings.json
- Sequence ファイル: .glseq
- SE Set ファイル: .glset

Project 状態には、Sequence List、保存済み SE Set、評価、累計再生時間、
SE 割り当て、Mix、Config の値などが含まれます。

音声ファイル本体は自動でコピー・移動されません。GamingLooper は音声
ファイルへの参照を保存します。保存後に元の音声ファイルを移動した場合は、
必要に応じて再読み込みしてください。

更新時の注意
------------

古い GamingLooper フォルダを置き換える前に、必要な保存データがある場合は
古い save フォルダをバックアップするか、保持してください。

初期SEファイルは asset/se に入っています。初回起動時に SE Pad が割り当て済み
になるよう同梱されています。

注意
----

このビルドは未署名です。初回起動時に Windows の警告が表示される場合があります。

GamingLooper フォルダを Program Files などの書き込み制限がある場所に置かないで
ください。Documents など、ユーザーが書き込める場所に置いてください。

詳しい使い方は、アプリ内の README ボタンまたは GitHub の README を参照してください。

English
-------

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

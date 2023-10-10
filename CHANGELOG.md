# Change Log

## [0.9.0](https://github.com/vscode-neovim/vscode-neovim/compare/v0.8.3...v0.9.0) (2023-10-10)


### Features

* add options to disable or change selection debounce time ([#1504](https://github.com/vscode-neovim/vscode-neovim/issues/1504)) ([2515e46](https://github.com/vscode-neovim/vscode-neovim/commit/2515e466a532ca280c8800d00e786de96cc0b1d9))


### Bug Fixes

* cleanup temporary buffers for dotrepeat ([#1506](https://github.com/vscode-neovim/vscode-neovim/issues/1506)) ([7a3d5e9](https://github.com/vscode-neovim/vscode-neovim/commit/7a3d5e953dcd090dbc516a91c005ab76d97d35c2))
* **config:** ignore init path when nvim running in clean mode ([#1503](https://github.com/vscode-neovim/vscode-neovim/issues/1503)) ([0615b3e](https://github.com/vscode-neovim/vscode-neovim/commit/0615b3e5190bcee9293a206c2c919a5e6b25bd24))
* **cursor:** avoid unnecessary selections updates ([#1507](https://github.com/vscode-neovim/vscode-neovim/issues/1507)) ([bb0faed](https://github.com/vscode-neovim/vscode-neovim/commit/bb0faed07935c450128c857e154447623dd755f0))


### Performance Improvements

* **highlight:** avoid redundant highlight IDs ([#1520](https://github.com/vscode-neovim/vscode-neovim/issues/1520)) ([a7cf325](https://github.com/vscode-neovim/vscode-neovim/commit/a7cf325003a5b1d42daf522491781f144f91c467))

## [0.8.3](https://github.com/vscode-neovim/vscode-neovim/compare/v0.8.2...v0.8.3) (2023-10-07)


### Features

* add filetype module ([#1500](https://github.com/vscode-neovim/vscode-neovim/issues/1500)) ([56fbadc](https://github.com/vscode-neovim/vscode-neovim/commit/56fbadc729fe23d206c798acf61ad03a4c9ec0e5))
* optimize end-of-line highlighting rendering ([72bc537](https://github.com/vscode-neovim/vscode-neovim/commit/72bc5372c19dda231c20be683c718af0cc042d0c))


### Bug Fixes

* **highlight:** avoid leftover highlights ([#1499](https://github.com/vscode-neovim/vscode-neovim/issues/1499)) ([72bc537](https://github.com/vscode-neovim/vscode-neovim/commit/72bc5372c19dda231c20be683c718af0cc042d0c))


### Miscellaneous Chores

* release 0.8.3 ([40ac24c](https://github.com/vscode-neovim/vscode-neovim/commit/40ac24cf2af8f97b37eb48a407ccd44f9b662fd3))

## [0.8.2](https://github.com/vscode-neovim/vscode-neovim/compare/v0.8.1...v0.8.2) (2023-10-06)


### Bug Fixes

* bump min nvim version ([#1495](https://github.com/vscode-neovim/vscode-neovim/issues/1495)) ([653c06f](https://github.com/vscode-neovim/vscode-neovim/commit/653c06f08e876404994d27893efc7d039c6d8f74))

## [0.8.1](https://github.com/vscode-neovim/vscode-neovim/compare/v0.8.0...v0.8.1) (2023-10-05)


### Bug Fixes

* dot-repeat special symbols handling ([#1167](https://github.com/vscode-neovim/vscode-neovim/issues/1167)) ([5e955d6](https://github.com/vscode-neovim/vscode-neovim/commit/5e955d615b1bbc9257b3d299f48b84dd962062aa))

## [0.8.0](https://github.com/vscode-neovim/vscode-neovim/compare/v0.7.0...v0.8.0) (2023-10-05)


### ⚠ BREAKING CHANGES

* **highlights:** redesign of highlighting approach ([#1449](https://github.com/vscode-neovim/vscode-neovim/issues/1449))

### Features

* **highlights:** redesign of highlighting approach ([#1449](https://github.com/vscode-neovim/vscode-neovim/issues/1449)) ([f688d23](https://github.com/vscode-neovim/vscode-neovim/commit/f688d23669ac0a86e2cb6200d1970f9da6822634))

## [0.7.0](https://github.com/vscode-neovim/vscode-neovim/compare/v0.6.1...v0.7.0) (2023-10-04)


### Features

* **buffer:** add external buffer doc provider (de48ee2) ([ba9d0dd](https://github.com/vscode-neovim/vscode-neovim/commit/ba9d0dde18bac45cb8c902360d65273b75eac80e))
* **command line:** add a configurable completion timer delay ([#1467](https://github.com/vscode-neovim/vscode-neovim/issues/1467)) ([0cb897c](https://github.com/vscode-neovim/vscode-neovim/commit/0cb897c0d7805dafad5967602534a2f8b61ffadf))
* hide completion widgets when leaving insert mode ([#1478](https://github.com/vscode-neovim/vscode-neovim/issues/1478)) ([6d1dbba](https://github.com/vscode-neovim/vscode-neovim/commit/6d1dbbaa01e21fd71fde1d94ad1a1b504b1fc600))
* **options:** synchronize editor line numbers ([#1426](https://github.com/vscode-neovim/vscode-neovim/issues/1426)) ([4a13f06](https://github.com/vscode-neovim/vscode-neovim/commit/4a13f06c08ae040ea7811376a4a8dddaf8007a59))
* warn on empty `vscode-neovim.send` args ([#1455](https://github.com/vscode-neovim/vscode-neovim/issues/1455)) ([d1cbcf9](https://github.com/vscode-neovim/vscode-neovim/commit/d1cbcf977f84df110b5b94d53334b7c9fb98fd01))


### Bug Fixes

* **cursor:** ensure normal visual mode for mouse selection ([#1463](https://github.com/vscode-neovim/vscode-neovim/issues/1463)) ([1b0ea63](https://github.com/vscode-neovim/vscode-neovim/commit/1b0ea63c67c5247e8451df8b94af7bdb0ff80f89))
* **cursor:** update position after exiting insert mode ([#1479](https://github.com/vscode-neovim/vscode-neovim/issues/1479)) ([da787ed](https://github.com/vscode-neovim/vscode-neovim/commit/da787ed0170637f8a9ca19c46d929189527aa7c6))
* **viewport:** reduce cursor jitter (temporary solution) ([#1459](https://github.com/vscode-neovim/vscode-neovim/issues/1459)) ([237e795](https://github.com/vscode-neovim/vscode-neovim/commit/237e795fb48374fbef8a6a7cb7f40810630ab6ee))

## [0.6.1](https://github.com/vscode-neovim/vscode-neovim/compare/v0.6.0...v0.6.1) (2023-09-17)


### Bug Fixes

* **buffer, change:** save and restore local marks ([#1439](https://github.com/vscode-neovim/vscode-neovim/issues/1439)) ([9e194a0](https://github.com/vscode-neovim/vscode-neovim/commit/9e194a0ba3534b1e3b3473c625052388f1ba4a32))
* **cursor, visual:** fix sync mouse selection ([#1451](https://github.com/vscode-neovim/vscode-neovim/issues/1451)) ([bdf3b19](https://github.com/vscode-neovim/vscode-neovim/commit/bdf3b19a49611a9be94c795985cd7de5ff9b1259))
* **test:** clean up reg '/' after cmdline testing ([#1453](https://github.com/vscode-neovim/vscode-neovim/issues/1453)) ([2bc2a80](https://github.com/vscode-neovim/vscode-neovim/commit/2bc2a807e7d7f3d18a72918fb0d790a564e1eb39))

## [0.6.0](https://github.com/vscode-neovim/vscode-neovim/compare/v0.5.0...v0.6.0) (2023-09-11)


### Features

* **options:** prompt to enable experimental affinity([#1051](https://github.com/vscode-neovim/vscode-neovim/issues/1051), [#1267](https://github.com/vscode-neovim/vscode-neovim/issues/1267)) ([#1415](https://github.com/vscode-neovim/vscode-neovim/issues/1415)) ([482cfd8](https://github.com/vscode-neovim/vscode-neovim/commit/482cfd8a36c654163314fbbe4816a55bfa062d8e))
* **statusline:** combine status line items ([#1429](https://github.com/vscode-neovim/vscode-neovim/issues/1429)) ([7f0de58](https://github.com/vscode-neovim/vscode-neovim/commit/7f0de58fd39add25d53d3ff074dc33fce88fa1eb))


### Bug Fixes

* **buffer:** Ensure proper cleanup of windows and buffers ([#1438](https://github.com/vscode-neovim/vscode-neovim/issues/1438)) ([7c9dc96](https://github.com/vscode-neovim/vscode-neovim/commit/7c9dc9671ba2010e3607f86fa3c7b3d061a4e808))

## [0.5.0](https://github.com/vscode-neovim/vscode-neovim/compare/v0.4.5...v0.5.0) (2023-09-08)


### Features

* handle window change event ([#1417](https://github.com/vscode-neovim/vscode-neovim/issues/1417)) ([325b10f](https://github.com/vscode-neovim/vscode-neovim/commit/325b10f86916a906b6261d6f0fba60d3f6079b38))


### Bug Fixes

* clean up buffers properly ([#1428](https://github.com/vscode-neovim/vscode-neovim/issues/1428)) ([48ef8e6](https://github.com/vscode-neovim/vscode-neovim/commit/48ef8e6302f6f3d87897cc1c900af8dc1bca3593))
* **highlights:** fix highlights when emojis exist ([#1430](https://github.com/vscode-neovim/vscode-neovim/issues/1430)) ([050be0b](https://github.com/vscode-neovim/vscode-neovim/commit/050be0b37728e1aa2be7f74dac311deec896334b))

## [0.4.5](https://github.com/vscode-neovim/vscode-neovim/compare/v0.4.4...v0.4.5) (2023-09-06)


### Bug Fixes

* **buffer:** avoid sync conflicts during startup ([#1414](https://github.com/vscode-neovim/vscode-neovim/issues/1414)) ([0b3ab8f](https://github.com/vscode-neovim/vscode-neovim/commit/0b3ab8f7d53ba5271dadba54dfa37e90544737b9))
* **buffer:** the output document should be modifiable ([#1416](https://github.com/vscode-neovim/vscode-neovim/issues/1416)) ([bc7e09b](https://github.com/vscode-neovim/vscode-neovim/commit/bc7e09b5125d9f04f168b9aaf4b017911df9daef))

## [0.4.4](https://github.com/vscode-neovim/vscode-neovim/compare/v0.4.3...v0.4.4) (2023-09-03)


### Bug Fixes

* **cursor:** optimized cursor synchronization debouncing ([#1406](https://github.com/vscode-neovim/vscode-neovim/issues/1406)) ([7326aae](https://github.com/vscode-neovim/vscode-neovim/commit/7326aaed7f8cd588e02869274f3f1df8c89086fd))
* **mode:** synchronize mode after startup ([#1411](https://github.com/vscode-neovim/vscode-neovim/issues/1411)) ([3804505](https://github.com/vscode-neovim/vscode-neovim/commit/380450514efadd29074761e039657fd97bfc7008))

## [0.4.3](https://github.com/vscode-neovim/vscode-neovim/compare/v0.4.2...v0.4.3) (2023-08-30)


### Bug Fixes

* **highlights:** fix misaligned rendering in visual mode ([#1401](https://github.com/vscode-neovim/vscode-neovim/issues/1401)) ([479f525](https://github.com/vscode-neovim/vscode-neovim/commit/479f525efac1b23e4ca146a96f7e7145b69b88d8))
* **options:** force disable colorcolumn and winblend ([de11cf3](https://github.com/vscode-neovim/vscode-neovim/commit/de11cf32c72f3cc741efc18044ebefd5a12a62dc))

## [0.4.2](https://github.com/vscode-neovim/vscode-neovim/compare/v0.4.1...v0.4.2) (2023-08-18)


### Bug Fixes

* **highlight:** remove flash.nvim lag ([#1389](https://github.com/vscode-neovim/vscode-neovim/issues/1389)) ([e38e628](https://github.com/vscode-neovim/vscode-neovim/commit/e38e628b084a716cc5718545016f34cac28713f6))

## [0.4.1](https://github.com/vscode-neovim/vscode-neovim/compare/v0.4.0...v0.4.1) (2023-07-30)


### Bug Fixes

* **cursor:** re-add new `VSCodeNotifyRange` impl ([368c58d](https://github.com/vscode-neovim/vscode-neovim/commit/368c58db5fe5b6ae2bca37df3d6cfeb2fb98d62e))
* **cursor:** re-add new VSCodeNotifyRange impl ([#1358](https://github.com/vscode-neovim/vscode-neovim/issues/1358)) ([368c58d](https://github.com/vscode-neovim/vscode-neovim/commit/368c58db5fe5b6ae2bca37df3d6cfeb2fb98d62e))
* **custom_commands:** wait for cursor update before issuing command ([368c58d](https://github.com/vscode-neovim/vscode-neovim/commit/368c58db5fe5b6ae2bca37df3d6cfeb2fb98d62e))
* **lua:** rename vscode lua plugin to vscode-neovim ([#1356](https://github.com/vscode-neovim/vscode-neovim/issues/1356)) ([72adf16](https://github.com/vscode-neovim/vscode-neovim/commit/72adf160dcc5bc0066555c33c526140c2f835f95))
* re-add `VSCodeCommentary` ([368c58d](https://github.com/vscode-neovim/vscode-neovim/commit/368c58db5fe5b6ae2bca37df3d6cfeb2fb98d62e))

## [0.4.0](https://github.com/vscode-neovim/vscode-neovim/compare/v0.3.2...v0.4.0) (2023-07-26)


### ⚠ BREAKING CHANGES

* **highlight:** remove easymotion support
* **highlight:** `"vscode-neovim.highlightGroups.ignoreHighlights"` is removed, ignore syntax groups from nvim instead by using `hi MySyntaxGroup NONE`.
* **cursor:** `VSCodeNotifyVisual` and `VSCodeNotifyRange` is removed, use `VSCodeNotify` instead
* **cursor:** send vscode selections to neovim, including intuitive mouse selections (remove mouse setting)

### fact

* **highlight:** ignore undesired highlights from vim side instead of vscode side ([#1334](https://github.com/vscode-neovim/vscode-neovim/issues/1334)) ([5ed8081](https://github.com/vscode-neovim/vscode-neovim/commit/5ed80815676217565fbdb759d7e1c26139e11a6c))
* **highlight:** remove easymotion support ([161371e](https://github.com/vscode-neovim/vscode-neovim/commit/161371ee385b1da0c9f6d0df7db2ef4c98498b62))


### Features

* **cursor:** improve performance and flicker ([c01548e](https://github.com/vscode-neovim/vscode-neovim/commit/c01548e08a2c5edfec8a070a291a64aafc6a7db6))
* **cursor:** remove range-based commands ([c01548e](https://github.com/vscode-neovim/vscode-neovim/commit/c01548e08a2c5edfec8a070a291a64aafc6a7db6))
* **cursor:** send vscode selections to neovim, including intuitive mouse selections (remove mouse setting) ([c01548e](https://github.com/vscode-neovim/vscode-neovim/commit/c01548e08a2c5edfec8a070a291a64aafc6a7db6))
* **cursor:** sync visual selections with vscode ([#1258](https://github.com/vscode-neovim/vscode-neovim/issues/1258)) ([c01548e](https://github.com/vscode-neovim/vscode-neovim/commit/c01548e08a2c5edfec8a070a291a64aafc6a7db6))
* **lua:** add lua api ([#1339](https://github.com/vscode-neovim/vscode-neovim/issues/1339)) ([6be0ff3](https://github.com/vscode-neovim/vscode-neovim/commit/6be0ff383be87558a062e09cefb3c41e4e76625a))


### Bug Fixes

* **cursor:** cursor promise resolving ([9ed40f3](https://github.com/vscode-neovim/vscode-neovim/commit/9ed40f3db2cfb48f2b5cdea7e26acb35ef901136))
* **cursor:** don't overwrite cursor promise and wait for document change ([0d334af](https://github.com/vscode-neovim/vscode-neovim/commit/0d334af2c6ac352ccfd6f3cf25ea3b0d3f688e73))
* **highlight:** fix blank extmarks ([#1143](https://github.com/vscode-neovim/vscode-neovim/issues/1143)) ([c01548e](https://github.com/vscode-neovim/vscode-neovim/commit/c01548e08a2c5edfec8a070a291a64aafc6a7db6))
* **highlight:** fix extmarks beyond end of line ([c01548e](https://github.com/vscode-neovim/vscode-neovim/commit/c01548e08a2c5edfec8a070a291a64aafc6a7db6))
* **highlight:** ignore compound group names, like MatchParenVisual ([c01548e](https://github.com/vscode-neovim/vscode-neovim/commit/c01548e08a2c5edfec8a070a291a64aafc6a7db6))
* **highlight:** wait for document change before creating highlights ([c01548e](https://github.com/vscode-neovim/vscode-neovim/commit/c01548e08a2c5edfec8a070a291a64aafc6a7db6))
* **typing:** fix rapid typing after entering insert mode ([c01548e](https://github.com/vscode-neovim/vscode-neovim/commit/c01548e08a2c5edfec8a070a291a64aafc6a7db6))


### Miscellaneous Chores

* release 0.4.0 ([ced7306](https://github.com/vscode-neovim/vscode-neovim/commit/ced7306622d0e39f71ede44513482452e35b1a5a))

## [0.3.2](https://github.com/vscode-neovim/vscode-neovim/compare/v0.3.1...v0.3.2) (2023-07-12)


### Bug Fixes

* **main:** set `WSLENV` to pass `NVIM_APPNAME` into WSL ([#1310](https://github.com/vscode-neovim/vscode-neovim/issues/1310)) ([2b27081](https://github.com/vscode-neovim/vscode-neovim/commit/2b270812de8d53a282550ec9aeb0176cbc4c0c36))
* **mode:** allow escaping from replace mode ([#1305](https://github.com/vscode-neovim/vscode-neovim/issues/1305)) ([76d473c](https://github.com/vscode-neovim/vscode-neovim/commit/76d473c6b97bcf582e3a9ee0806ccda8294dc9cf)), closes [#1304](https://github.com/vscode-neovim/vscode-neovim/issues/1304)

## [0.3.1](https://github.com/vscode-neovim/vscode-neovim/compare/v0.3.0...v0.3.1) (2023-07-07)


### Bug Fixes

* colliding ctrl+w bindings in terminal ([#1300](https://github.com/vscode-neovim/vscode-neovim/issues/1300)) ([f5a25f9](https://github.com/vscode-neovim/vscode-neovim/commit/f5a25f9d73649883af78b1331c8052cecb8e46d4))

## [0.3.0](https://github.com/vscode-neovim/vscode-neovim/compare/v0.2.0...v0.3.0) (2023-07-06)


### Features

* **bindings:** support &lt;c-t&gt; as navigateBack ([#827](https://github.com/vscode-neovim/vscode-neovim/issues/827)) ([1cd8afb](https://github.com/vscode-neovim/vscode-neovim/commit/1cd8afb8401ee13d398ec836d990a97bee3ec7bc))
* **bindings:** z fold bindings for lists (incl. files explorer) ([#1250](https://github.com/vscode-neovim/vscode-neovim/issues/1250)) ([a86bd36](https://github.com/vscode-neovim/vscode-neovim/commit/a86bd36a062184be2a8739d88d50053cb53763f4))


### Bug Fixes

* **bindings:** {count}gt command not jumping to correct tab [#670](https://github.com/vscode-neovim/vscode-neovim/issues/670) ([a2c9b03](https://github.com/vscode-neovim/vscode-neovim/commit/a2c9b03bd995f941b16278a4f9ea402e8b9c063d))
* **mode:** cmdline mode bindings [#1298](https://github.com/vscode-neovim/vscode-neovim/issues/1298) ([#1299](https://github.com/vscode-neovim/vscode-neovim/issues/1299)) ([6f4b9a0](https://github.com/vscode-neovim/vscode-neovim/commit/6f4b9a0ecb5a5d53a239c8c398eb41c066e9e44c))

## [0.2.0](https://github.com/vscode-neovim/vscode-neovim/compare/v0.1.0...v0.2.0) (2023-07-05)


### Features

* **bindings:** global window navigations ([#1248](https://github.com/vscode-neovim/vscode-neovim/issues/1248)) ([88103a8](https://github.com/vscode-neovim/vscode-neovim/commit/88103a83010f57a24acf506610d4a89c7019aa20))
* **main:** add options.lua ([#1254](https://github.com/vscode-neovim/vscode-neovim/issues/1254)) ([504d462](https://github.com/vscode-neovim/vscode-neovim/commit/504d46249f81351f8131109cb430e70424c0adb3))
* **mode:** switch to `ModeChanged` for more detailed mode information ([#1255](https://github.com/vscode-neovim/vscode-neovim/issues/1255)) ([97140a7](https://github.com/vscode-neovim/vscode-neovim/commit/97140a735b97d172bfb8c02a95def0d1675a232b))

## [0.1.0](https://github.com/vscode-neovim/vscode-neovim/compare/v0.0.96...v0.1.0) (2023-06-27)

### Features

-   add $NVIM_APPNAME option ([#1186](https://github.com/vscode-neovim/vscode-neovim/issues/1186))
    ([5b54212](https://github.com/vscode-neovim/vscode-neovim/commit/5b5421201701be67fc92d42b39fb049708b4d0f1))
-   **ci:** add automatic releases ([#1244](https://github.com/vscode-neovim/vscode-neovim/issues/1244))
    ([0bcee88](https://github.com/vscode-neovim/vscode-neovim/commit/0bcee88bbdb746a64fb58204a605797fdbdd14da))
-   add Neovim toggle (#1033)
-   use k instead of i to moveEditorToAboveGroup (vscode-neovim#1119)

### Bug Fixes

-   wrong VSCode selections if cursor is at start of selection
    [#1180](https://github.com/vscode-neovim/vscode-neovim/issues/1180)
    ([f9bcd25](https://github.com/vscode-neovim/vscode-neovim/commit/f9bcd2555c01ad238d9eca06f1c051c43ee71b15))

## [0.0.96]

-   fix issues with tabs creating visual glitches (#1099)

## [0.0.95]

-   fix navigation on lines with emojis (#1083)
-   fix random characters shown as an extmark overlay (#1075)

## [0.0.94]

-   revert accidentally-released scrolling PR (#885). This caused C-u/C-d to stop working as expected.

## [0.0.93]

-   fix mouse selection while not starting visual mode (#1055)

## [0.0.92]

-   allow vscode sync viewport with neovim (#919)
-   this makes lightspeed/leap work better. May cause some issues with jumping around. Will eventually be fixed by
    (#993)

## [0.0.91]

-   don't exit insert mode when switching tabs (#1050)
-   replay insert-mode edits in realtime using `nvim_buf_set_text` (#992)
-   when vscode reports changed document, changes get sent immediately to nvim
-   in insert mode, changes get sent immediately, instead of on exit

## [0.0.90]

-   Fix non-english input method issues (#1009)
-   list.toggleKeyboardNavigation => list.find (#1015)
-   Fix highlights not updating by :hi (#1010)
-   Add shortcut to navigate code action menu (#1029)
-   switch from yarn to npm (#1035)
-   specify default nvim binary path (#1047)
-   fix mouse selection starts visual mode (#1045)

## [0.0.89]

-   silence "No viewport for gridId" warning (#978)
-   improve readme, and add plugins to wiki (#969)
-   fix non-english input replacing chars in normal mode (#900)
-   improve compatibility with lightspeed/leap by fixing highlight provider (#982)

## [0.0.88]

-   add `--clean` option (#952)
-   remove `textDecorationsAtTop` (#957)
-   remove custom insert mode mappings, now C-w/C-u/C-r/etc are called natively (#886)
-   fix freezing after switching windows (#886)
-   fix cursor and highlight on long lines (#971)

## [0.0.87]

-   Command line improvements! Enable paste cmdline keybindings and fix history (#908) and fix path completions (#860)

## [0.0.86]

-   Fix bug with remote workspaces/WSL where plugin would try to set pwd to invalid path

## [0.0.85]

-   Show more messages in output ( #881, #902 )
-   Fix insert mode C-a ( #737 )
-   Improve efficiency applying small edits ( #830 )
-   Support extmark_overlay, adding hop/lightspeed/sneak support ( #868 )
-   Fix CI

## [0.0.84]

-   More keybinding improvements with notebook support ( #680 )
-   Small bugfixes and project maintenance ( #772, #723, #731 )

## [0.0.83]

-   Allow installation in Codespaces ( #262 )
-   Send visual selection with C-S-F ( #535 )

## [0.0.82]

-   Big updates to keybindings ! ( #513 , #654 , #557 , #585 , #655 )

## [0.0.81]

-   Revert ( #649 )

## [0.0.80]

-   Improve cursor position behaviour ( #649 )

## [0.0.79]

-   Fix infinity file opened loop on recent neovim versions ( #632 )

## [0.0.78]

-   Fix init error with no workspace folders open ( #526 )
-   Update README.md ( #527 )

## [0.0.77]

-   Fix cursor with tab indentation ( #516 , #515 )
-   Handle correctly WSL path with spaces ( #509 )

## [0.0.76]

-   Fix mutli-column character handling ( #503 )

## [0.0.75]

-   Improvements to cursor logic ( #501 )
-   Cancel current mode when switching editor ( #156 )

## [0.0.74]

-   Fix cursor logic ( #467 , #488 )
-   Trigger matching word highlight after movement ( #159 )
-   VIM highlight adjustments ( #482 )

## [0.0.73]

-   Improve cursor reveailing logic ( #479 )
-   Hook g0 / g\$ ( #455 )

## [0.0.72]

-   Fix undo regression introduced in `0.0.70`

## [0.0.71]

-   Fix `Unable to determine neovim windows id` error spam ( #418 )

## [0.0.70]

-   Use vscode jumplist actions instead of neovim
-   Fix uppercase marks ( #228 )
-   Various cursor & buffer management fixes ( #404 , #392 , #386 )
-   Implement manageEditorHeight and manageEditorWidth ( #444 )
-   Fix `<C-a>` in insert mode ( #283 )
-   Set vim cwd as vscode workspace ( #429 )
-   Fix shell-agnostic WSL integration ( #147 )
-   Map :x to Wq ( #396 )
-   Various docs contributions
-   Improve build ( #378 )

## [0.0.63]

-   Allow to put text decorations (usually EasyMotion ones) at top setting (`vscode-neovim.textDecorationsAtTop`) ( #358
    ), contributed by @jhgarner
-   Fix incorrect `<C-w><C-w>/<C-w>w` mappings ( #359 ), contributed by @tschaei
-   Replace/modernize neovim vscode command line interop mappings by `<Cmd>call` ( #362 ), contributed by @theol0403
-   Fix incorrect `<C-w>gf` mapping ( #365 ), contributed by @Yuuki77
-   Fix applying vim HL (such as `MatchParen`) at end of a line ( #371 )
-   Fix incorrect cursor position when selecting next/prev search result ( #366 )
-   Fix/improve behavior of auto-accepting vim return prompt `Press enter to continue`. In some cases it was excess (
    #372 )
-   Bundle extension by webpack ( #377 )

## [0.0.62]

-   Fix jumplist ( #350 )
-   Add `K` and `gO` mappings (mapped to `showHover` and `goToSymbol`) ( #108 ) (@Shatur95)
-   Fix images/icon (@Shatur95)

## [0.0.60/61]

Started from this version `neovim 0.5` nightly version is required Many things have been refactored/changed internally
in this release. So if you see any regression - please fill an issue

-   Turn on VIM smartindenting/autoindenting and remove custom vscode bindings to `o`/`O` (so it uses VIM ones)
-   New buffer,window and cursor management. This makes the extension finally work with git diff view, peek views,
    search editor views and even in output channels! ( #53 , #187 , #220 , #223, #226)
-   Implement multi-line messages pager. Things like `:registers`, `:changes`, `:jumps`, `:messages` are working
    correctly now ( #202 , #78 , #296 )
-   Fix tab indent problems and sync vscode tab settings with neovim ( #275 , #239 , #264 , #167 , #100 , #152 , #289 )
-   Fix few macro recording problems ( #207 )
-   Fix ghost keys after exiting insert mode ( #324 ). For `jj` / `jk` users there are still few problems ( #330 ) but
    they will be sorted in next releases
-   Fix few command line problems ( #155 , #288 )
-   Fix some buffer desync issues ( #312 )
-   Fix `<C-w>v/<C-w>s` split shortcuts ( #331 )
-   Fix brackets for substitute command ( #300 )
-   Add logger and log-related configuration to options
-   Change some default code-actions mappings ( #339 )
-   Add extension icon. Many thanks to <https://github.com/ngscheurich>

## [0.0.52]

-   Implement dot repeat (`.`) command ( #209 , #173 ). Also fixes `<count>` insert comamnds, like #255 , #249
-   Removed file name from statusbar ( #291 , #230 ), thanks @Shatur95
-   Fix visual selection conversion ( #233 ), thanks @Shatur95
-   Fix wrong string comparsions ( #308 ), thanks @Shatur95
-   Make espace keys work only when editor has focus ( #290 ) , thanks @David-Else
-   Added some file name completion in commandline ( #192 ), thanks @ppwwyyxx
-   Fix missing `<C-w>c` mapping ( #180 ), thanks @trkoch
-   Add operating system dependent path settings ( #137 ), thanks @3nuc
-   bind gh to mousehover ( #107 ), thanks @kwonoj

## [0.0.50]

-   Fix cursor & extension hang for some cases ( #153 )

## [0.0.49]

-   Use command line completion only for command line originated via `:` command ( #146 )

## [0.0.48]

-   Fix incorrect cursor for multibyte single column width characters ( #142 )
-   Fix vim-easymotion decorators drifting when text has multi-byte characters ( #144 )
-   Disabled vim modeline processing
-   Force vim folds to be always opened to prevent problems
-   Fix vim-easymotion decorators drifting to the end of line ( #60 )
-   Fix incorrect cursor positions after commands/mappings such as `>gv` ( #141 )
-   Fix double command prompt ( #120 )

## [0.0.47]

-   Fix the problem when cursor/extension stucks for second+ editor columns ( #126 )

## [0.0.46]

-   Update `neovim-client` to latest version. This should eliminate delay between operations and generally improve the
    performance. Kudos to @kwonoj for impressive work here
-   Fix cursor movement for 2-byte chars ( #127 )

## [0.0.45]

-   Fix VIM filetype detection ( #115 ). This means `FileType` autocmd should work correctly now. Also fixes
    `vim-matchup` plugin. This may introduce some side effects from previously disabled filetype plugins - just fill an
    issue if something doesn't work
-   Fix broken cursor position in insert mode for special keys (such as `del`/`backspace`/etc) if you had recorded a
    macro in insert mode previously

## [0.0.44]

-   Hotfix broken `VSCodeCallRange` (commenting/formatting didn't work because of this)

## [0.0.43]

-   Visual modes DON'T produce vscode selections right now. These were implemented through various workarounds, gave
    really small value and were constant origin of headache. Also this fixes few issues related to visual modes ( #105,
    #118 ). To round the corners, invoking vscode's command palette (by using default vscode hotkeys) from visual mode
    will convert neovim visual selection to vscode visual selection, this should cover most use cases. Also, there are
    `VScodeNotifyRange`/`VSCodeCallRange`/`VSCodeNotifyRangePos`/`VSCodeCallRangePos` vim functions if you need to call
    vscode command with selection. See
    [this for example](https://github.com/asvetliakov/vscode-neovim/blob/e61832119988bb1e73b81df72956878819426ce2/vim/vscode-code-actions.vim#L42-L54)
    and
    [mapping](https://github.com/asvetliakov/vscode-neovim/blob/e61832119988bb1e73b81df72956878819426ce2/vim/vscode-code-actions.vim#L98)
    if you're doing custom mappings and assuming there is some vscode selection exist. Use `VSCodeNotifyRange` when you
    don't need a column pos (e.g. for visual line mode) and `VSCodeNotifyRangePos` when you need them (e.g for visual
    mode).
-   Refactored vscode<->neovim cursor syncrhonization
-   Fix `ma`/`mi` not working when selecting lines upward ( #117 )
-   Changed `ma`/`mi` to skip empty lines. Added `mA`/`mI` for the previous behavior
-   Macro recording fixes
-   Refactored & optimized HL provider (highlight should be faster now)
-   Override default keybindings only when neovim was initialized succesfully ( #112 )
-   Don't preselect `'<,'>` marks when invoking cmdline from visual line ( #111 )
-   Implemented commandline history ( #88 )
-   Add the option to start the visual mode with mouse selection ( #94 )

## [0.0.42]

-   Disabled jj/jk escape keys by default

## [0.0.40]

-   Fix cursor/highlight not working with multi-byte width characters (Russian, Chinese, Japanese, etc...), i.e the
    extension should work normally with them (#68, #91)
-   Fix incorrect vim highlight when using tab indentation (#81)
-   Removed multiple cursors by default from visual line/block modes (visual block mode still spawns cursors but they
    are pruly visual) (#59, #61). Previous behavior is still accessible by `mi` or `ma` keybindings while in visual
    line/block modes
-   Allow to override keys/mappings set by extension (previously they have been set after user config loaded)
-   Allow to identify if neovim is running through vscode extension by checking `if exists('g:vscode')` (#83)
-   Added `<C-[>` and `Escape` as escape keys (#74)
-   Added `<C-n>` and `<C-p>` to select next autocomplete suggestion/show next/prev parameter hint
-   Added `jj` and `jk` as escape keys from the insert mode (#75)
-   Pass `<C-/>` to neovim and call VSCodeCommentary (still recommended to bind it to own keys) (#89)
-   Pass `<S-Tab>` to neovim
-   Allow to pass additional ctrl keys to neovim (see Readme)
-   Added workaround for `gk`/`gj` motions
-   Corrected `gf`/`gF` keybindings. Add `<C-]>` as go-to-def (works in help too) (#77). Add `gd`/`gD` as secondary
    mappings to go-to-def/peek-def. Add `<C-w>gd` to reveal definition aside

## [0.0.39]

-   Fix bug with incorrect buffer edits
-   Fix cursor jumping after pressing something like `cw` and fast typing text in large file

## [0.0.38]

-   Fix cursor position after deleting a line and possibly other operations

## [0.0.37]

-   Fix performance of o/O. If you're using custom bindings for them, you might need to rebind them to call new action.
    See vscode-insert.vim

## [0.0.36]

-   Fix macros with insert mode
-   Big performance improvements, fix undo & macros performance
-   Allow to use neovim installed in WSL. Tick useWSL conf checkbox and specify linux path to neovim

## [0.0.35]

-   Use VIM jumplist for `<C-o>`/`<C-i>`/`<Tab>`

## [0.0.33-0.0.34]

-   Fix extension for linux/macos users
-   Fix buffer-vscode desynchornization after redo

## [0.0.32]

-   Cmdline fixes/improvements (#50, #51)

## [0.0.31]

-   Fix crazy cursor jumping when having opened multiple editors panes

## [0.0.30]

-   Implemented nvim's ext_multigrid support. This solves almost all problems with vim highlighting and potentially
    enables easymotion's overwin motions (they still don't work however). Window management still should be performed by
    vscode
-   Removed vim-style cursor following on editor scrolling. This totally screwed vscode jumplist, so better to have
    working jumplist than such minor feature.
-   Cursor position fixes
-   `:e [filepath]` works again

## [0.0.29]

-   Fix selection is being reset in visual mode after typing `vk$` (#48)
-   Fix not cleaning incsearch highlight after canceling the incsearch (#46)
-   Fix incorrect cursor after switching the editor to the same document but in different editor column (#49)

## [0.0.28]

-   Use non-blocking rpc requests when communicatings with vscode for file management operations (closing, opening,
    etc...). Should eliminate the issue when vim is 'stuck' and doesn't respond anymore
-   Fix incorrect cursor positions after opening `:help something` (#44)
-   Fix visual block selection for single column in multiple rows (#42)
-   Enable VIM syntax highlighting for help files and external buffers like `:PlugStatus`. It's slow and sometimes buggy
    but better than nothing in meantime

## [0.0.27]

-   Fix incsearch and allow to use `<C-t>`/`<C-g>` with it
-   Reworked/Refactored command line. Now with wildmenu completion support. Also keys like `<C-w>` or `<C-u>` are
    working fine now in cmdline now

## [0.0.26]

-   Partially revert #41

## [0.0.25]

-   Tab management commands & keys, like `gt` or `tabo[nly]`
-   Window management commands & keys like `sp[lit]`/`vs[plit]` and `<C-w> j/k/l/h` keys
-   Bind scroll commands in neovim instead of vscode extension
    ([#41](https://github.com/asvetliakov/vscode-neovim/issues/41))

## [0.0.24]

-   File management commands, like `:w` or `:q` (bound to vscode actions)
-   Fix [#40](https://github.com/asvetliakov/vscode-neovim/issues/40)

## [0.0.1-0.0.23]

-   A bunch of development versions. 0.0.23 has the following features
-   Correct editing and the cursor management
-   Control keys in the insert & normal/visual modes
-   Visual mode produces vscode selections
-   Working VIM highlighting (most of a default VIM HL groups are ignored since they don't make sense in VSCode, but non
    standard groups are processed, so things like vim-easymotion or vim-highlight are working fine)
-   Scrolling commands (scrolling is done by vscode so things are slighly different here)
-   Special vim-easymotion fork to use vscode text decorators instead of replacing text (as original vim-easymotion
    does)
-   Analogue of vim-commentary (original vim-commentary works fine too)
-   Working external vim buffers, like `:help` or `:PlugStatus`
-   Multiple cursors for visual line/visual block modes

## [0.0.1]

-   Initial release

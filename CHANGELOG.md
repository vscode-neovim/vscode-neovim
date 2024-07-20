# Change Log

## [1.18.5](https://github.com/vscode-neovim/vscode-neovim/compare/v1.18.4...v1.18.5) (2024-07-20)


### Bug Fixes

* Fix multi-byte character selection in Nvim 0.10 blockwise visual ([#2169](https://github.com/vscode-neovim/vscode-neovim/issues/2169)) ([2f68d87](https://github.com/vscode-neovim/vscode-neovim/commit/2f68d87e44f65e114e4061917ff2abbaac0e99de))
* manually set languageId to buffer filetype for special documents ([#2174](https://github.com/vscode-neovim/vscode-neovim/issues/2174)) ([fad8034](https://github.com/vscode-neovim/vscode-neovim/commit/fad803423adb2ea174cd4a60a100d475c7a260ed))


### Refactor

* Improve explanation of Ctrl+key in settings menu ([#2168](https://github.com/vscode-neovim/vscode-neovim/issues/2168)) ([f305226](https://github.com/vscode-neovim/vscode-neovim/commit/f305226eb33dcdb8de5ac7eba6376ff7d72c138e))
* Improve usability of afterInitConfig option in the settings ([#2167](https://github.com/vscode-neovim/vscode-neovim/issues/2167)) ([fe586e1](https://github.com/vscode-neovim/vscode-neovim/commit/fe586e1a62f618be3ae434dd9076e8ef1acca5c5))

## [1.18.4](https://github.com/vscode-neovim/vscode-neovim/compare/v1.18.3...v1.18.4) (2024-07-14)


### Bug Fixes

* Cancel UI-affecting tasks upon disposal ([#2161](https://github.com/vscode-neovim/vscode-neovim/issues/2161)) ([508d6b3](https://github.com/vscode-neovim/vscode-neovim/commit/508d6b3094f06b25ec72a9e39953bf697b88c342))


### Refactor

* `pending_updates` -&gt; `/utils` `cmdline_text` -> `/cmdline` ([#2159](https://github.com/vscode-neovim/vscode-neovim/issues/2159)) ([cf62ea4](https://github.com/vscode-neovim/vscode-neovim/commit/cf62ea42c12cecae31c1be931f46312d4734219f))

## [1.18.3](https://github.com/vscode-neovim/vscode-neovim/compare/v1.18.2...v1.18.3) (2024-07-10)


### Bug Fixes

* **highlight:** Fix pattern matching of syntax groups ([#2150](https://github.com/vscode-neovim/vscode-neovim/issues/2150)) ([78dc156](https://github.com/vscode-neovim/vscode-neovim/commit/78dc156c453c9e6457c81092c24be7d14b54e0be))
* **with_insert:** Correct "a" or "i" to enter insert mode ([#2152](https://github.com/vscode-neovim/vscode-neovim/issues/2152)) ([dfa195b](https://github.com/vscode-neovim/vscode-neovim/commit/dfa195bfb1b1d2129294738bf3479efe6a6db5b9))


### Documentation

* Add settings and commands section ([#2148](https://github.com/vscode-neovim/vscode-neovim/issues/2148)) ([40d6016](https://github.com/vscode-neovim/vscode-neovim/commit/40d6016b767de976fbda074cd76b8dc9b8f3cb5d))
* simplify readme ([#2155](https://github.com/vscode-neovim/vscode-neovim/issues/2155)) ([fb33462](https://github.com/vscode-neovim/vscode-neovim/commit/fb33462a40dce6f44f31c0079b3063303887f59e))


### Refactor

* Remove debounce time limit for sync mouse selection ([#2153](https://github.com/vscode-neovim/vscode-neovim/issues/2153)) ([af78dc9](https://github.com/vscode-neovim/vscode-neovim/commit/af78dc9cbebd0177b2178f93cfbf6dbc0e3adf6e))
* Simplify invoking Treesitter parsing and ensure more timely parsing ([#2154](https://github.com/vscode-neovim/vscode-neovim/issues/2154)) ([be2ae6b](https://github.com/vscode-neovim/vscode-neovim/commit/be2ae6b2e68382c7823abb777e7bbb13049d6fb8))

## [1.18.2](https://github.com/vscode-neovim/vscode-neovim/compare/v1.18.1...v1.18.2) (2024-07-07)


### Bug Fixes

* rapid cmdline_show/cmdline_hides would not be handled logically ([#2140](https://github.com/vscode-neovim/vscode-neovim/issues/2140)) ([7d65a19](https://github.com/vscode-neovim/vscode-neovim/commit/7d65a19d63cf3ff8453d7ab20e2299037a320b4b))

## [1.18.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.18.0...v1.18.1) (2024-07-05)


### chore

* release 1.18.1 ([8500b65](https://github.com/vscode-neovim/vscode-neovim/commit/8500b65636c7e916d07301de90fa4131bfadfe46))


### Features

* Add progress indicator for layout sync ([#2137](https://github.com/vscode-neovim/vscode-neovim/issues/2137)) ([81bcdab](https://github.com/vscode-neovim/vscode-neovim/commit/81bcdabff59784fc5fb8de0ddbea648fbb305139))

## [1.18.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.17.2...v1.18.0) (2024-07-02)


### Features

* **buffer:** sync dirty buffer state ([#2127](https://github.com/vscode-neovim/vscode-neovim/issues/2127)) ([61f4e4f](https://github.com/vscode-neovim/vscode-neovim/commit/61f4e4f842d7a7a559b60e7e82f3acb26c908abb))
* Integrate BufWriteCmd for "write" command ([#2116](https://github.com/vscode-neovim/vscode-neovim/issues/2116)) ([8606eb1](https://github.com/vscode-neovim/vscode-neovim/commit/8606eb183a420223c0fc102639b8b3ad753cfecb))


### Refactor

* Use labeled tuple elements for event data types ([#2129](https://github.com/vscode-neovim/vscode-neovim/issues/2129)) ([08e973d](https://github.com/vscode-neovim/vscode-neovim/commit/08e973d20e93835416c3c5a7bd3a81239c02d213))

## [1.17.2](https://github.com/vscode-neovim/vscode-neovim/compare/v1.17.1...v1.17.2) (2024-06-15)


### Bug Fixes

* **highlights:** wait for doc changes before updating highlights ([#2112](https://github.com/vscode-neovim/vscode-neovim/issues/2112)) ([0835225](https://github.com/vscode-neovim/vscode-neovim/commit/083522555ad3d269b83da3885cb18f0982a396be))
* **messages:** Limit the minimum value of `cmdheight` to 1 ([#2110](https://github.com/vscode-neovim/vscode-neovim/issues/2110)) ([1e29f60](https://github.com/vscode-neovim/vscode-neovim/commit/1e29f604487b66f2cb682c1f24e65ac1e97def20))

## [1.17.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.17.0...v1.17.1) (2024-06-15)


### Bug Fixes

* adapt to Nvim deprecations in 0.10 ([#2108](https://github.com/vscode-neovim/vscode-neovim/issues/2108)) ([4c04ebc](https://github.com/vscode-neovim/vscode-neovim/commit/4c04ebc399e7cdf44476247da0b58430ed025c70))
* Align output with nvim messages and auto show based on cmdheight ([#2105](https://github.com/vscode-neovim/vscode-neovim/issues/2105)) ([4ca8fbf](https://github.com/vscode-neovim/vscode-neovim/commit/4ca8fbf70edfaaf080823d583e8d2105ace0c06e))
* **buffer:** avoid concurrent syncs and stale data ([#2103](https://github.com/vscode-neovim/vscode-neovim/issues/2103)) ([59246d6](https://github.com/vscode-neovim/vscode-neovim/commit/59246d624f9cdc4ed141006de621f486b5f5586c))

## [1.17.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.16.0...v1.17.0) (2024-06-11)


### Features

* **highlight:** draw grid lines accurately ([#2090](https://github.com/vscode-neovim/vscode-neovim/issues/2090)) ([50a7d5c](https://github.com/vscode-neovim/vscode-neovim/commit/50a7d5cc50b085beaffa156ccc4873c00d764569))

## [1.16.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.15.2...v1.16.0) (2024-06-09)


### Features

* ctrl+n/ctrl+p for selecting rename suggestions ([#2093](https://github.com/vscode-neovim/vscode-neovim/issues/2093)) ([bbf5df3](https://github.com/vscode-neovim/vscode-neovim/commit/bbf5df3436db1cf47337933410c0b7d20aa22b0c))


### Bug Fixes

* ensure statusline messages are shown for a minimum amount of time before clears are effective ([#2068](https://github.com/vscode-neovim/vscode-neovim/issues/2068)) ([a8064e3](https://github.com/vscode-neovim/vscode-neovim/commit/a8064e3a6c1b3e4fd5c97fae7f0061c26bde6fe0))
* remove maximum debounce time for normal selection ([#2082](https://github.com/vscode-neovim/vscode-neovim/issues/2082)) ([2bd5166](https://github.com/vscode-neovim/vscode-neovim/commit/2bd5166970421795b8ca5af2f55813167c6862e7))


### Documentation

* add configuration compatibility section to README ([65366d3](https://github.com/vscode-neovim/vscode-neovim/commit/65366d3b17fc7210ec8ff4ee841348d303fa8936))
* add configuration compatibility section to README  ([#2092](https://github.com/vscode-neovim/vscode-neovim/issues/2092)) ([65366d3](https://github.com/vscode-neovim/vscode-neovim/commit/65366d3b17fc7210ec8ff4ee841348d303fa8936))
* **contributing:** fix sunmeko.lua link ([#2088](https://github.com/vscode-neovim/vscode-neovim/issues/2088)) ([fd9d34a](https://github.com/vscode-neovim/vscode-neovim/commit/fd9d34a96cf1c614edd02093f4b08b8ff1116748))
* fix broken link for 0.10 compat ([#2094](https://github.com/vscode-neovim/vscode-neovim/issues/2094)) ([8f95e4f](https://github.com/vscode-neovim/vscode-neovim/commit/8f95e4f0f6d20dfd3b6b7c5ee6c44c4d66a1b1cd))

## [1.15.2](https://github.com/vscode-neovim/vscode-neovim/compare/v1.15.1...v1.15.2) (2024-06-06)


### Bug Fixes

* set current dir in nvim ([#2078](https://github.com/vscode-neovim/vscode-neovim/issues/2078)) ([01aadaa](https://github.com/vscode-neovim/vscode-neovim/commit/01aadaa9f3074b0622d20daefc694b4933f3a8d7))

## [1.15.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.15.0...v1.15.1) (2024-06-04)


### Bug Fixes

* Fix setting the cwd in remote development ([#2062](https://github.com/vscode-neovim/vscode-neovim/issues/2062)) ([62bab05](https://github.com/vscode-neovim/vscode-neovim/commit/62bab0597590ba4445b57b98653b2f0dd60ee002))

## [1.15.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.14.2...v1.15.0) (2024-06-03)


### Features

* **lua:** Add "vscode.with_insert" ([#2055](https://github.com/vscode-neovim/vscode-neovim/issues/2055)) ([be8812f](https://github.com/vscode-neovim/vscode-neovim/commit/be8812f7fbdc20917e18d844507001f2b347a07e))
* override vim.lsp.buf methods ([#2045](https://github.com/vscode-neovim/vscode-neovim/issues/2045)) ([f7fbce1](https://github.com/vscode-neovim/vscode-neovim/commit/f7fbce1010090377f6050cc94e4a331a1eaaf9ca))


### Bug Fixes

* add the missing "local" in "vscode.notify" ([2d8230c](https://github.com/vscode-neovim/vscode-neovim/commit/2d8230cc41cfe9ce23a1a56105182c4b98629a87))
* don't show output panel after return_prompt, reverts [#2029](https://github.com/vscode-neovim/vscode-neovim/issues/2029) ([#2061](https://github.com/vscode-neovim/vscode-neovim/issues/2061)) ([6250a1d](https://github.com/vscode-neovim/vscode-neovim/commit/6250a1d00cea0fef7913c00b85176211ba7bc926))


### Refactor

* init output channels in the corresponding manager ([#2053](https://github.com/vscode-neovim/vscode-neovim/issues/2053)) ([927ed95](https://github.com/vscode-neovim/vscode-neovim/commit/927ed955d9075f40bb5f2f40d2ad9e057f13906c))

## [1.14.2](https://github.com/vscode-neovim/vscode-neovim/compare/v1.14.1...v1.14.2) (2024-06-01)


### Bug Fixes

* detect potential module conflicts ([#2041](https://github.com/vscode-neovim/vscode-neovim/issues/2041)) ([04c6fc2](https://github.com/vscode-neovim/vscode-neovim/commit/04c6fc29269a636bd752230f8f59b132dc1efd29))

## [1.14.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.14.0...v1.14.1) (2024-05-30)


### Bug Fixes

* Correctly set doc version for skipping changes ([#2037](https://github.com/vscode-neovim/vscode-neovim/issues/2037)) ([9e95dbe](https://github.com/vscode-neovim/vscode-neovim/commit/9e95dbe36cb3fac4c172cc35edbf46cc69dd8922))

## [1.14.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.13.1...v1.14.0) (2024-05-30)


### Features

* move output messages to a separate channel ([#2022](https://github.com/vscode-neovim/vscode-neovim/issues/2022)) ([39e1ae2](https://github.com/vscode-neovim/vscode-neovim/commit/39e1ae2c780289e77abd0eb207c80a61f7e5f6c4))
* revamp messages output channel ([#2024](https://github.com/vscode-neovim/vscode-neovim/issues/2024)) ([0957121](https://github.com/vscode-neovim/vscode-neovim/commit/09571212c176225ea3eca4f351296ed464b804b5))
* show output when return_prompt is sent ([#2029](https://github.com/vscode-neovim/vscode-neovim/issues/2029)) ([625397e](https://github.com/vscode-neovim/vscode-neovim/commit/625397efef2913321f090c93fb43ecb791182234))


### Bug Fixes

* account for level when handling cmdline_hide events ([#2034](https://github.com/vscode-neovim/vscode-neovim/issues/2034)) ([8760f81](https://github.com/vscode-neovim/vscode-neovim/commit/8760f81fd82d5daf3db70712cd379cd1356a0d18))
* correctly dispose the output channels ([#2033](https://github.com/vscode-neovim/vscode-neovim/issues/2033)) ([dde1b79](https://github.com/vscode-neovim/vscode-neovim/commit/dde1b798db9f9e1639dcc7e316be388949ac7563))
* pulling status causes a redraw ([#2032](https://github.com/vscode-neovim/vscode-neovim/issues/2032)) ([fbc7c0d](https://github.com/vscode-neovim/vscode-neovim/commit/fbc7c0dc4c3a21ac3c801f800844b3673a32abbd))
* remove redundant error message on disconnect ([#2026](https://github.com/vscode-neovim/vscode-neovim/issues/2026)) ([95171d2](https://github.com/vscode-neovim/vscode-neovim/commit/95171d2aa7e5427e200f4fe214cd0e510c1a2dbb))
* update expected cursor when multiple docs change ([#2035](https://github.com/vscode-neovim/vscode-neovim/issues/2035)) ([504da9e](https://github.com/vscode-neovim/vscode-neovim/commit/504da9eb1516c7890cf00d50b6916fd4c6578008))


### Refactor

* clean up deprecated content ([#2012](https://github.com/vscode-neovim/vscode-neovim/issues/2012)) ([940cd4a](https://github.com/vscode-neovim/vscode-neovim/commit/940cd4a65cbc10a562aad790c4a4ab204540e914))
* **lua:** rename the module vscode-neovim to vscode ([#1997](https://github.com/vscode-neovim/vscode-neovim/issues/1997)) ([109e125](https://github.com/vscode-neovim/vscode-neovim/commit/109e125210e4c2936e1775735e887a020fdd336a))
* move "vim/" and merge it into "runtime/" ([#2017](https://github.com/vscode-neovim/vscode-neovim/issues/2017)) ([3a5ecb2](https://github.com/vscode-neovim/vscode-neovim/commit/3a5ecb26086ca9f4add610e8d6844e1762e9d122))
* set enforced options in Lua ([#2011](https://github.com/vscode-neovim/vscode-neovim/issues/2011)) ([798792c](https://github.com/vscode-neovim/vscode-neovim/commit/798792c0b2c0c6e5ff1507b73fd5731f6bb6d31d))

## [1.13.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.13.0...v1.13.1) (2024-05-25)


### Bug Fixes

* **cmdline:** allow enter to accept cmdline after completion selected ([#2007](https://github.com/vscode-neovim/vscode-neovim/issues/2007)) ([d09891f](https://github.com/vscode-neovim/vscode-neovim/commit/d09891ff80c1088c5f8ab510a392ae682fc04bb1))

## [1.13.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.12.0...v1.13.0) (2024-05-25)


### Features

* **cmdline:** integrate with native neovim completions ([#2001](https://github.com/vscode-neovim/vscode-neovim/issues/2001)) ([9ed0be0](https://github.com/vscode-neovim/vscode-neovim/commit/9ed0be0b0901d36509b79e1eab57aba136dbc722))

## [1.12.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.11.5...v1.12.0) (2024-05-21)


### Features

* Support inccommand, including "split" ([c01e149](https://github.com/vscode-neovim/vscode-neovim/commit/c01e1496e1ec5a46872297cabb3ed0a46ecc6f1c))


### Bug Fixes

* cursor position after scrolling with incsearch ([5fedba5](https://github.com/vscode-neovim/vscode-neovim/commit/5fedba50aff4de3fb742ba1877a07cdbbee581d3))
* **highlight:** forward search / matching in long lines ([#1976](https://github.com/vscode-neovim/vscode-neovim/issues/1976)) ([5fedba5](https://github.com/vscode-neovim/vscode-neovim/commit/5fedba50aff4de3fb742ba1877a07cdbbee581d3))
* set highlight group Subsitute ([#1983](https://github.com/vscode-neovim/vscode-neovim/issues/1983)) ([479638f](https://github.com/vscode-neovim/vscode-neovim/commit/479638fb0bac36d1d9f003e593f6ab43ca0d59b9))
* sometimes eol highlight being displayed incorrectly ([#1988](https://github.com/vscode-neovim/vscode-neovim/issues/1988)) ([9e208f2](https://github.com/vscode-neovim/vscode-neovim/commit/9e208f24f50137e6899bb4c6743e09cc4adedc9d))
* wildmenu items are being set repeatedly ([#1989](https://github.com/vscode-neovim/vscode-neovim/issues/1989)) ([fc48f03](https://github.com/vscode-neovim/vscode-neovim/commit/fc48f03d405f4a3a0e77d9ed4ead7efa8292f05e))
* wildmenu sometimes not showing ([c01e149](https://github.com/vscode-neovim/vscode-neovim/commit/c01e1496e1ec5a46872297cabb3ed0a46ecc6f1c))


### Documentation

* indicate you can view logs in the Debug Console ([#1995](https://github.com/vscode-neovim/vscode-neovim/issues/1995)) ([c00e7dc](https://github.com/vscode-neovim/vscode-neovim/commit/c00e7dc7141ad9c160e72701c393a53aeffa22d0))


### Refactor

* don't hardcode substitute highlight ([#1991](https://github.com/vscode-neovim/vscode-neovim/issues/1991)) ([1b6bb7b](https://github.com/vscode-neovim/vscode-neovim/commit/1b6bb7b917ce31594826fea541547effc4622e7d))
* **lua:** move autocmds,filetype to runtime/modules ([#1990](https://github.com/vscode-neovim/vscode-neovim/issues/1990)) ([c81e64d](https://github.com/vscode-neovim/vscode-neovim/commit/c81e64dd0f0502f79b14fe2430d7d442f347fd85))
* remove the border of the custom highlights ([479638f](https://github.com/vscode-neovim/vscode-neovim/commit/479638fb0bac36d1d9f003e593f6ab43ca0d59b9))
* remove viewport hack when in cmdline mode ([5fedba5](https://github.com/vscode-neovim/vscode-neovim/commit/5fedba50aff4de3fb742ba1877a07cdbbee581d3))

## [1.11.5](https://github.com/vscode-neovim/vscode-neovim/compare/v1.11.4...v1.11.5) (2024-05-17)


### Bug Fixes

* **eval:** try serializing the object result ([#1966](https://github.com/vscode-neovim/vscode-neovim/issues/1966)) ([b387d29](https://github.com/vscode-neovim/vscode-neovim/commit/b387d29568ca7976851fa7a1b485e204b7d34b08))
* **incsearch:** win cursor not properly revealed ([#1971](https://github.com/vscode-neovim/vscode-neovim/issues/1971)) ([116abdd](https://github.com/vscode-neovim/vscode-neovim/commit/116abddcb70a2daccf6fd9e29b51b08724c3141c))
* reduce text jumpiness when using the substitute command ([#1973](https://github.com/vscode-neovim/vscode-neovim/issues/1973)) ([d6e44dd](https://github.com/vscode-neovim/vscode-neovim/commit/d6e44dda9d46463879ae5733ee157dbae3c90a23))

## [1.11.4](https://github.com/vscode-neovim/vscode-neovim/compare/v1.11.3...v1.11.4) (2024-05-14)


### ⚠ BREAKING CHANGES

* use VSCode log level instead of our own ([#1962](https://github.com/vscode-neovim/vscode-neovim/issues/1962))

### chore

* release 1.11.4 ([3137516](https://github.com/vscode-neovim/vscode-neovim/commit/3137516c221a40f83b67c703137aad84f76868a7))


### Features

* use VSCode log level instead of our own ([#1962](https://github.com/vscode-neovim/vscode-neovim/issues/1962)) ([5f1bc49](https://github.com/vscode-neovim/vscode-neovim/commit/5f1bc495c2499f97448752489e1e1b2f5d466b9a))


### Bug Fixes

* include time and scope in log file ([#1951](https://github.com/vscode-neovim/vscode-neovim/issues/1951)) ([cccdf99](https://github.com/vscode-neovim/vscode-neovim/commit/cccdf9936c03a091e39811d55876c4dfab0dc7fb))
* setup highlights timely ([#1964](https://github.com/vscode-neovim/vscode-neovim/issues/1964)) ([6c220c7](https://github.com/vscode-neovim/vscode-neovim/commit/6c220c7dc3f036529492a1fef197a790a24c2077))

## [1.11.3](https://github.com/vscode-neovim/vscode-neovim/compare/v1.11.2...v1.11.3) (2024-05-09)


### Bug Fixes

* redraw events are processed in order ([#1940](https://github.com/vscode-neovim/vscode-neovim/issues/1940)) ([122eb56](https://github.com/vscode-neovim/vscode-neovim/commit/122eb56c9bd00570ea58b1da778fddb670437ae9))

## [1.11.2](https://github.com/vscode-neovim/vscode-neovim/compare/v1.11.1...v1.11.2) (2024-05-06)


### Bug Fixes

* set an explicit id for status bar item ([#1941](https://github.com/vscode-neovim/vscode-neovim/issues/1941)) ([8c1f5a0](https://github.com/vscode-neovim/vscode-neovim/commit/8c1f5a093e13cf80638478f479c63807122d8bfd))
* should setup highlights on WinNew,BufNew ([#1944](https://github.com/vscode-neovim/vscode-neovim/issues/1944)) ([178483c](https://github.com/vscode-neovim/vscode-neovim/commit/178483c4d6a7812976ffb0e7b88f84b25a425fed))


### Documentation

* Improve documentation and examples for composite keys ([#1933](https://github.com/vscode-neovim/vscode-neovim/issues/1933)) ([c0edf52](https://github.com/vscode-neovim/vscode-neovim/commit/c0edf52d042f477652778a75992fea08a62870fd))


### Refactor

* enable vscode-neovim.lua to accept an array of strings ([#1930](https://github.com/vscode-neovim/vscode-neovim/issues/1930)) ([8becac6](https://github.com/vscode-neovim/vscode-neovim/commit/8becac679ffed5ccfc86191d373c076d3abb2430))
* register type commands only when needed ([#1931](https://github.com/vscode-neovim/vscode-neovim/issues/1931)) ([f25b899](https://github.com/vscode-neovim/vscode-neovim/commit/f25b8991993992987817a7a82185d63be3d1d2a1))

## [1.11.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.11.0...v1.11.1) (2024-05-01)


### Bug Fixes

* Match any ASCII characters in composite keys ([#1923](https://github.com/vscode-neovim/vscode-neovim/issues/1923)) ([51e2f11](https://github.com/vscode-neovim/vscode-neovim/commit/51e2f11c474ed7b1f9c2817f6e498805abca4ae2))

## [1.11.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.10.1...v1.11.0) (2024-04-30)


### ⚠ BREAKING CHANGES

* The old composite commands are removed.

### Features

* better composite key support ([#1917](https://github.com/vscode-neovim/vscode-neovim/issues/1917)) ([44808b3](https://github.com/vscode-neovim/vscode-neovim/commit/44808b399a17aa1c59f64313773c6ea7b5fe2385))


### Miscellaneous Chores

* release 1.11.0 ([dc8d622](https://github.com/vscode-neovim/vscode-neovim/commit/dc8d6224bb42d9889854c9f69277bfeb35d399a5))

## [1.10.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.10.0...v1.10.1) (2024-04-26)


### Bug Fixes

* **cursor:** always reveal the nvim cursor position ([#1911](https://github.com/vscode-neovim/vscode-neovim/issues/1911)) ([37f3434](https://github.com/vscode-neovim/vscode-neovim/commit/37f343455425c2f6a758f31eb09f644697683e9a))

## [1.10.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.9.0...v1.10.0) (2024-04-21)


### ⚠ BREAKING CHANGES

* vscode.get_status_item has been removed.

### Features

* handle nvim statusline ([#1895](https://github.com/vscode-neovim/vscode-neovim/issues/1895)) ([fa5fc14](https://github.com/vscode-neovim/vscode-neovim/commit/fa5fc14389a0a5c5d97ec35458b826d052181a24))


### Bug Fixes

* **highlight:** timely win hl ns setup, disable treesitter highlighting ([#1898](https://github.com/vscode-neovim/vscode-neovim/issues/1898)) ([eff4e20](https://github.com/vscode-neovim/vscode-neovim/commit/eff4e20010531278894bd30eb663ea12bd43f6a7))


### Miscellaneous Chores

* release 1.10.0 ([95d3ca4](https://github.com/vscode-neovim/vscode-neovim/commit/95d3ca429febab9531551e222bf30ef0dc3ee74f))

## [1.9.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.8.3...v1.9.0) (2024-04-20)


### Features

* Auto find a suitable neovim executable ([#1894](https://github.com/vscode-neovim/vscode-neovim/issues/1894)) ([a0f5c25](https://github.com/vscode-neovim/vscode-neovim/commit/a0f5c253e3ce647f15040d063ec83cb31aa6acdc))


### Bug Fixes

* tabstops now considered when calculating line width for highlights ([#1897](https://github.com/vscode-neovim/vscode-neovim/issues/1897)) ([bd4cbca](https://github.com/vscode-neovim/vscode-neovim/commit/bd4cbca3dac2bca45ecb32fd32a6eff8895de093))

## [1.8.3](https://github.com/vscode-neovim/vscode-neovim/compare/v1.8.2...v1.8.3) (2024-04-19)


### Bug Fixes

* highlight calculations race with buffer updates ([#1890](https://github.com/vscode-neovim/vscode-neovim/issues/1890)) ([53acfe5](https://github.com/vscode-neovim/vscode-neovim/commit/53acfe564012b9b1a20563d665791a8f28f810d5))

## [1.8.2](https://github.com/vscode-neovim/vscode-neovim/compare/v1.8.1...v1.8.2) (2024-04-14)


### Bug Fixes

* **keybinds:** fix behavior of CTRL-m and CTRL-j ([#1886](https://github.com/vscode-neovim/vscode-neovim/issues/1886)) ([afb435d](https://github.com/vscode-neovim/vscode-neovim/commit/afb435df67189752d7e339d05ed42e57d622cd65))

## [1.8.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.8.0...v1.8.1) (2024-03-28)


### Bug Fixes

* vscode null in eval ([#1866](https://github.com/vscode-neovim/vscode-neovim/issues/1866)) ([923319a](https://github.com/vscode-neovim/vscode-neovim/commit/923319af2e2b41bd5e64f46dbf1fdac6262b170f))

## [1.8.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.7.1...v1.8.0) (2024-03-26)


### Features

* `vscode.eval()` ([#1854](https://github.com/vscode-neovim/vscode-neovim/issues/1854)) ([32eedf0](https://github.com/vscode-neovim/vscode-neovim/commit/32eedf08fa7bce669666492b6515091352913ae4))
* **dev:** pre-commit hooks ([#1853](https://github.com/vscode-neovim/vscode-neovim/issues/1853)) ([e2a36d8](https://github.com/vscode-neovim/vscode-neovim/commit/e2a36d872e23fd8e623d67dd9ccf5aa1e51d2f09))


### Bug Fixes

* handle timeout in eval properly ([#1863](https://github.com/vscode-neovim/vscode-neovim/issues/1863)) ([767f7ca](https://github.com/vscode-neovim/vscode-neovim/commit/767f7ca6a3c338b662edacabe833614cf7ea0221))

## [1.7.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.7.0...v1.7.1) (2024-03-13)


### Bug Fixes

* **startup:** $VIMRUNTIME check fails on WSL [#1850](https://github.com/vscode-neovim/vscode-neovim/issues/1850) ([6db15d0](https://github.com/vscode-neovim/vscode-neovim/commit/6db15d02a1547e53a9373680a52fa6160346a1e7)), closes [#1848](https://github.com/vscode-neovim/vscode-neovim/issues/1848)

## [1.7.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.6.1...v1.7.0) (2024-03-11)


### Features

* **logging:** check that $VIMRUNTIME is readable [#1816](https://github.com/vscode-neovim/vscode-neovim/issues/1816) ([c9ddc3e](https://github.com/vscode-neovim/vscode-neovim/commit/c9ddc3ea90444e17b325c1b2c0c6756ad8d8374d)), closes [#1815](https://github.com/vscode-neovim/vscode-neovim/issues/1815)
* **logging:** log Nvim info at startup ([#1797](https://github.com/vscode-neovim/vscode-neovim/issues/1797)) ([6b174c8](https://github.com/vscode-neovim/vscode-neovim/commit/6b174c81d4327186d350643a4867f7155693d18a))

## [1.6.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.6.0...v1.6.1) (2024-02-12)


### Bug Fixes

* **logging:** infinite loop in BufferManager ([#1790](https://github.com/vscode-neovim/vscode-neovim/issues/1790)) ([b011631](https://github.com/vscode-neovim/vscode-neovim/commit/b0116315a018db9a8bb7a1d5df4a8f505dfa73f2)), closes [#1788](https://github.com/vscode-neovim/vscode-neovim/issues/1788)

## [1.6.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.5.0...v1.6.0) (2024-02-08)


### Features

* **bindings:** handle C-d/C-u in hover widget ([#1744](https://github.com/vscode-neovim/vscode-neovim/issues/1744)) ([64c4cc7](https://github.com/vscode-neovim/vscode-neovim/commit/64c4cc7bb56a64aa8627b1a8bab9bee0446ea17c))
* expose logs in OutputChannel, log info on startup [#1786](https://github.com/vscode-neovim/vscode-neovim/issues/1786) ([f77256b](https://github.com/vscode-neovim/vscode-neovim/commit/f77256be6afcaa596dc8c3cb9d4e6bc0cb12cfab))


### Bug Fixes

* **bindings:** C-w in cmdline ([#1742](https://github.com/vscode-neovim/vscode-neovim/issues/1742)) ([048acea](https://github.com/vscode-neovim/vscode-neovim/commit/048acea91676c2216cf418c8bbfafae27f2c4a3a))
* rework visual-multi ([#1755](https://github.com/vscode-neovim/vscode-neovim/issues/1755)) ([0bd6834](https://github.com/vscode-neovim/vscode-neovim/commit/0bd68345fae514572c62927a81071af68963f78e))

## [1.5.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.4.0...v1.5.0) (2023-12-20)


### Features

* override the default vim.ui interfaces ([#1710](https://github.com/vscode-neovim/vscode-neovim/issues/1710)) ([b522787](https://github.com/vscode-neovim/vscode-neovim/commit/b52278772a6b3557d8b05471b1fb90a2375f662a))
* R to refresh file explorer ([5464b48](https://github.com/vscode-neovim/vscode-neovim/commit/5464b48b4d4e6979dd0c2a61cdb76d2ffb06739f))


### Bug Fixes

* **treesitter:** manually trigger parsing ([#1713](https://github.com/vscode-neovim/vscode-neovim/issues/1713)) ([c2ca1be](https://github.com/vscode-neovim/vscode-neovim/commit/c2ca1be787c9114bdb7dcc57e47d1932cd9fb878))

## [1.4.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.3.0...v1.4.0) (2023-12-15)


### Features

* Add option `afterInitConfig` ([#1695](https://github.com/vscode-neovim/vscode-neovim/issues/1695)) ([ec2b287](https://github.com/vscode-neovim/vscode-neovim/commit/ec2b287f891ae34935a1d4fff5602ae1fcbfd687))


### Bug Fixes

* auto stop extension when starting nvim failed ([#1703](https://github.com/vscode-neovim/vscode-neovim/issues/1703)) ([67e10ad](https://github.com/vscode-neovim/vscode-neovim/commit/67e10ad9db4a26995c39d670cd6478274d0dd5a8))
* **buffer:** prefer real path as buffer name ([#1699](https://github.com/vscode-neovim/vscode-neovim/issues/1699)) ([eff13f2](https://github.com/vscode-neovim/vscode-neovim/commit/eff13f2809f7992c48facb895e835ef214478d01))
* **buffer:** sync layout on doc closed ([#1706](https://github.com/vscode-neovim/vscode-neovim/issues/1706)) ([81951e7](https://github.com/vscode-neovim/vscode-neovim/commit/81951e70daebbe4d1448ffec1d02192d69e526ad))

## [1.3.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.2.0...v1.3.0) (2023-12-09)


### Features

* Add clipboard provider `g:vscode_clipboard` ([#1688](https://github.com/vscode-neovim/vscode-neovim/issues/1688)) ([c5346c8](https://github.com/vscode-neovim/vscode-neovim/commit/c5346c8c185840655291bd0b50daecf36b00285d))
* Allow specifying WSL distro by wslDistribution ([#1693](https://github.com/vscode-neovim/vscode-neovim/issues/1693)) ([6c5dbcb](https://github.com/vscode-neovim/vscode-neovim/commit/6c5dbcb68a00ae2df29e61bdf91f9bf15987564d))
* **keybindings:** add keybindings for output panel ([#1685](https://github.com/vscode-neovim/vscode-neovim/issues/1685)) ([12502e0](https://github.com/vscode-neovim/vscode-neovim/commit/12502e0a3d20cc8f0d21be7f121b34ce6c8bc815))
* **keybindings:** Add keybindings for the hover widget ([#1694](https://github.com/vscode-neovim/vscode-neovim/issues/1694)) ([68f0df8](https://github.com/vscode-neovim/vscode-neovim/commit/68f0df895bd9a08a35c692432de76e2c8cf4f1ee))


### Bug Fixes

* fix setting client info in wsl ([#1687](https://github.com/vscode-neovim/vscode-neovim/issues/1687)) ([11e3cab](https://github.com/vscode-neovim/vscode-neovim/commit/11e3cab75b64c0075a96c1c6558061e5d568882f))
* fix sourcing our runtime files ([#1679](https://github.com/vscode-neovim/vscode-neovim/issues/1679)) ([567fea5](https://github.com/vscode-neovim/vscode-neovim/commit/567fea5674a24673ea2e48db528571b9ace72946))
* set correct cwd for WSL ([#1689](https://github.com/vscode-neovim/vscode-neovim/issues/1689)) ([240e8f9](https://github.com/vscode-neovim/vscode-neovim/commit/240e8f9d0b4b14224242d86c3487cc6bd8a22fa0))
* **test:** upgrade @vscode/test-electron ([#1690](https://github.com/vscode-neovim/vscode-neovim/issues/1690)) ([d3b25fd](https://github.com/vscode-neovim/vscode-neovim/commit/d3b25fd9b186a817a5232a6a524e0deeb238b6cf))

## [1.2.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.1.5...v1.2.0) (2023-12-04)


### Features

* **api:** support passing a map-like table as args ([#1670](https://github.com/vscode-neovim/vscode-neovim/issues/1670)) ([8fe3d8f](https://github.com/vscode-neovim/vscode-neovim/commit/8fe3d8f9d37ef5f980954c9e1eddbed882ee62ef))


### Bug Fixes

* Fix forcing sync editor selections ([#1674](https://github.com/vscode-neovim/vscode-neovim/issues/1674)) ([7ebc1b2](https://github.com/vscode-neovim/vscode-neovim/commit/7ebc1b26384eee1a82a9449e238d60741a26d5e5))
* refactor buffer manager ([#1666](https://github.com/vscode-neovim/vscode-neovim/issues/1666)) ([1a27694](https://github.com/vscode-neovim/vscode-neovim/commit/1a2769478cb10483c449421e6ddb202bcf2c5472))

## [1.1.5](https://github.com/vscode-neovim/vscode-neovim/compare/v1.1.4...v1.1.5) (2023-11-30)


### Bug Fixes

* **change:** Fix bug in setting applyingEdits variable ([8f6447c](https://github.com/vscode-neovim/vscode-neovim/commit/8f6447c362b97fa12c3147a897b8714cfa846391))
* **change:** Respect the selections of the editor ([#1661](https://github.com/vscode-neovim/vscode-neovim/issues/1661)) ([4b8f242](https://github.com/vscode-neovim/vscode-neovim/commit/4b8f2429a95095bd9012a7c4769d172f5a3bc38a))
* skip window changed when target window id is 1000 ([#1667](https://github.com/vscode-neovim/vscode-neovim/issues/1667)) ([56ca01f](https://github.com/vscode-neovim/vscode-neovim/commit/56ca01f803056c79c04a0522b67637b6484706a0))

## [1.1.4](https://github.com/vscode-neovim/vscode-neovim/compare/v1.1.3...v1.1.4) (2023-11-23)


### Bug Fixes

* **buffer:** bufname conflict when creating a new buffer ([#1652](https://github.com/vscode-neovim/vscode-neovim/issues/1652)) ([f304335](https://github.com/vscode-neovim/vscode-neovim/commit/f304335ce14388fbc47fb577a53f5ced681f0d6a))

## [1.1.3](https://github.com/vscode-neovim/vscode-neovim/compare/v1.1.2...v1.1.3) (2023-11-22)


### Bug Fixes

* **highlight:** remove duplicate visual selection highlight ([#1643](https://github.com/vscode-neovim/vscode-neovim/issues/1643)) ([d02dbde](https://github.com/vscode-neovim/vscode-neovim/commit/d02dbde5832a3f5ac10249b2d3c40e778412166a))
* **visual:** Fix syncing vscode selection to nvim ([#1647](https://github.com/vscode-neovim/vscode-neovim/issues/1647)) ([8d2a14a](https://github.com/vscode-neovim/vscode-neovim/commit/8d2a14a9171fd5cd25672fc68479333335a5f655))

## [1.1.2](https://github.com/vscode-neovim/vscode-neovim/compare/v1.1.1...v1.1.2) (2023-11-19)


### Bug Fixes

* Cannot use strwidth to get string length ([#1635](https://github.com/vscode-neovim/vscode-neovim/issues/1635)) ([9e0cff5](https://github.com/vscode-neovim/vscode-neovim/commit/9e0cff5c6084b13ed99c44079ef9bf7494651d98))
* **highlight:** Do not clear custom highlight groups directly ([#1633](https://github.com/vscode-neovim/vscode-neovim/issues/1633)) ([f5381a7](https://github.com/vscode-neovim/vscode-neovim/commit/f5381a726ebb40c679d4c410659a11dc93d6b7da))
* rework `:tabnew` ([#1601](https://github.com/vscode-neovim/vscode-neovim/issues/1601)) ([1bff688](https://github.com/vscode-neovim/vscode-neovim/commit/1bff688386c6ec9e7aa48e8544fd66dd4b37e14b))

## [1.1.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.1.0...v1.1.1) (2023-11-17)


### Bug Fixes

* **cursor:** Current character not correctly obtained ([ed4e988](https://github.com/vscode-neovim/vscode-neovim/commit/ed4e988c5715973d58b0e68f4c8ce6f37f389383))
* **highlight:** Identify custom highlight group correctly ([#1628](https://github.com/vscode-neovim/vscode-neovim/issues/1628)) ([da15b14](https://github.com/vscode-neovim/vscode-neovim/commit/da15b1474dc19058e8b5037592b345ad3b6c54a4))
* **viewport:** Avoid awaiting the hack to refresh viewport ([d5cb701](https://github.com/vscode-neovim/vscode-neovim/commit/d5cb701f845f90e9ca7b9d9943515b94c7211390))

## [1.1.0](https://github.com/vscode-neovim/vscode-neovim/compare/v1.0.1...v1.1.0) (2023-11-16)


### Features

* Add command "vscode-neovim.lua" ([#1622](https://github.com/vscode-neovim/vscode-neovim/issues/1622)) ([980f40a](https://github.com/vscode-neovim/vscode-neovim/commit/980f40a22aea5c20f2639c7e4ada5c5bcc107d44))


### Bug Fixes

* **document_change:** eol is inconsistent when processing changes ([#1619](https://github.com/vscode-neovim/vscode-neovim/issues/1619)) ([6d870f9](https://github.com/vscode-neovim/vscode-neovim/commit/6d870f99cf15658d23d1fe1b003a555f56d7e5ad))

## [1.0.1](https://github.com/vscode-neovim/vscode-neovim/compare/v1.0.0...v1.0.1) (2023-11-15)


### Bug Fixes

* **keybindings:** fix ctrl+w in terminal ([#1297](https://github.com/vscode-neovim/vscode-neovim/issues/1297)) ([dc075aa](https://github.com/vscode-neovim/vscode-neovim/commit/dc075aaf7177a42c287230d79a09f3de292a7f8e))

## [1.0.0](https://github.com/vscode-neovim/vscode-neovim/compare/v0.9.1...v1.0.0) (2023-11-14)


### ⚠ BREAKING CHANGES

* **bindings:** enable bindings through configuration ([#1558](https://github.com/vscode-neovim/vscode-neovim/issues/1558))
* lua API ([#1532](https://github.com/vscode-neovim/vscode-neovim/issues/1532))

### Features

* add action `start-multiple-cursors` ([#1547](https://github.com/vscode-neovim/vscode-neovim/issues/1547)) ([f4a6ac5](https://github.com/vscode-neovim/vscode-neovim/commit/f4a6ac5bc2fd942a76402f27e3bb88df2924bba4))
* Add vscode commands "restart" and "stop" ([#1566](https://github.com/vscode-neovim/vscode-neovim/issues/1566)) ([f2f57f8](https://github.com/vscode-neovim/vscode-neovim/commit/f2f57f82f1b9d7b16f52fd7977b7fb3d1e447280))
* **api:** add `vscode.get_status_item` ([#1576](https://github.com/vscode-neovim/vscode-neovim/issues/1576)) ([c20ce2f](https://github.com/vscode-neovim/vscode-neovim/commit/c20ce2fba5e07feeeac333a00be3dbf7575ed465))
* **api:** add `vscode.to_op` and refactor code actions ([#1570](https://github.com/vscode-neovim/vscode-neovim/issues/1570)) ([c9d600f](https://github.com/vscode-neovim/vscode-neovim/commit/c9d600f27de328d37d2d810f355ef6a0fdd2d1fc))
* **bindings:** enable bindings through configuration ([#1558](https://github.com/vscode-neovim/vscode-neovim/issues/1558)) ([222a131](https://github.com/vscode-neovim/vscode-neovim/commit/222a131150745fc99c624b1f9eece9a91341df1a))
* Introduce `vscode-multi-cursor.nvim` ([#1553](https://github.com/vscode-neovim/vscode-neovim/issues/1553)) ([2657c45](https://github.com/vscode-neovim/vscode-neovim/commit/2657c4506b3dffe0d069db2891e30cebd963c2be))
* **keybindings:** global window resize/split ([#1257](https://github.com/vscode-neovim/vscode-neovim/issues/1257)) ([9cb8aff](https://github.com/vscode-neovim/vscode-neovim/commit/9cb8aff9de313d157a22f5f1a6e7409582bd9757))
* lua API ([#1532](https://github.com/vscode-neovim/vscode-neovim/issues/1532)) ([80f10d2](https://github.com/vscode-neovim/vscode-neovim/commit/80f10d299a1858dd272bb0f9642c414188cfa1a0))
* synchronize editor options and support `modeline` ([#1543](https://github.com/vscode-neovim/vscode-neovim/issues/1543)) ([a08c17d](https://github.com/vscode-neovim/vscode-neovim/commit/a08c17d1fb246101afa44077305fd5a15d4ba7e6))
* trigger FocusGained/Lost by default (80f10d29) ([5a4a36c](https://github.com/vscode-neovim/vscode-neovim/commit/5a4a36c434e9e2c6d6476c9d45a29c4f26adc8c5))


### Bug Fixes

* **api:** fix `VSCodeCall` ([35ec974](https://github.com/vscode-neovim/vscode-neovim/commit/35ec9743cbb6e6cae998da253da6e4885cc1eb63))
* **blockwise-visual:** handle double-width chars and tabs ([#1596](https://github.com/vscode-neovim/vscode-neovim/issues/1596)) ([c554c06](https://github.com/vscode-neovim/vscode-neovim/commit/c554c065a375f2bd32346aabdb6526ece8bb4189))
* **buffer:** cancel visual mode when switching editor ([#1578](https://github.com/vscode-neovim/vscode-neovim/issues/1578)) ([15cb3d7](https://github.com/vscode-neovim/vscode-neovim/commit/15cb3d78b13360743a3466ade0de572981ca2203))
* **ci:** make husky executable ([b75a7f7](https://github.com/vscode-neovim/vscode-neovim/commit/b75a7f7bfbe67d67364e1197f9c9b15932729e33))
* **cmdline:** handle `wildmenu_hide` event ([#1541](https://github.com/vscode-neovim/vscode-neovim/issues/1541)) ([1b68475](https://github.com/vscode-neovim/vscode-neovim/commit/1b68475f190a80a74dee26ef37fc692d1a66c79a))
* **cmdline:** use Ctrl+n/p to select candidates when candidates exist ([1b68475](https://github.com/vscode-neovim/vscode-neovim/commit/1b68475f190a80a74dee26ef37fc692d1a66c79a))
* **cursor:** ignore cursor position errors in the output ([#1568](https://github.com/vscode-neovim/vscode-neovim/issues/1568)) ([08ef9d3](https://github.com/vscode-neovim/vscode-neovim/commit/08ef9d39f0b4cac79da2fadad380bb323088c007))
* **dotrepeat:** incorrect order of deletion and addition ([#1581](https://github.com/vscode-neovim/vscode-neovim/issues/1581)) ([5385c25](https://github.com/vscode-neovim/vscode-neovim/commit/5385c25d0c9462f3a679a5bb21c21936ce9da091))
* **dotrepeat:** should escape K_SPECIAL bytes ([68557f7](https://github.com/vscode-neovim/vscode-neovim/commit/68557f798d9bbc2225db9b8ab45b90664bcddf36))
* fix command `vscode-neovim.stop` ([c8809ed](https://github.com/vscode-neovim/vscode-neovim/commit/c8809ed4c7591a75c960209c810120ddfa449f01))
* **highlight:** make `borderColor` work ([#1557](https://github.com/vscode-neovim/vscode-neovim/issues/1557)) ([398d0fe](https://github.com/vscode-neovim/vscode-neovim/commit/398d0fed517211bf7335b9042ac39f8a015257f1))
* **highlight:** rendering all cells ([84344a5](https://github.com/vscode-neovim/vscode-neovim/commit/84344a5191156f95a357de627a778c406eb9cf81))
* improve callAtomic error logging ([#1110](https://github.com/vscode-neovim/vscode-neovim/issues/1110)) ([91c0169](https://github.com/vscode-neovim/vscode-neovim/commit/91c01694be17e28af60530781762c311a378a792))
* **incsearch:** viewport is not updating during searching ([#1575](https://github.com/vscode-neovim/vscode-neovim/issues/1575)) ([b8696a3](https://github.com/vscode-neovim/vscode-neovim/commit/b8696a396c5ddffd0848f30a2c785aa05c2ca79a))
* **keybinding:** fix `Ctrl+c` ([#1569](https://github.com/vscode-neovim/vscode-neovim/issues/1569)) ([4765026](https://github.com/vscode-neovim/vscode-neovim/commit/476502604a5fcfef89c528532de17b391036aed6))
* maintain the order of positions for the Selection ([#1550](https://github.com/vscode-neovim/vscode-neovim/issues/1550)) ([8d76d51](https://github.com/vscode-neovim/vscode-neovim/commit/8d76d51cd6952c30ed5858587e64a97ab44c5da8))
* **visual:** clear fake cursor correctly ([#1552](https://github.com/vscode-neovim/vscode-neovim/issues/1552)) ([c786074](https://github.com/vscode-neovim/vscode-neovim/commit/c786074df01bc02d52856620d0da2db60659ae1a))
* **visual:** optimized simulation of VisualChanged event ([#1597](https://github.com/vscode-neovim/vscode-neovim/issues/1597)) ([736e7b2](https://github.com/vscode-neovim/vscode-neovim/commit/736e7b261eeecacb163e0fc1b59a0a1dd4f1bbf8))
* **visual:** process selections in nvim ([#1603](https://github.com/vscode-neovim/vscode-neovim/issues/1603)) ([c202f52](https://github.com/vscode-neovim/vscode-neovim/commit/c202f527949d3af2f786b2a0cab71b96517d4657))
* wait for appling selection changed ([#1551](https://github.com/vscode-neovim/vscode-neovim/issues/1551)) ([e1e1bf0](https://github.com/vscode-neovim/vscode-neovim/commit/e1e1bf01354495b3cf7a8731e2ec8729886532c6))


### Performance Improvements

* Add VSCodeContext for perf improvement ([#1559](https://github.com/vscode-neovim/vscode-neovim/issues/1559)) ([62fbcc2](https://github.com/vscode-neovim/vscode-neovim/commit/62fbcc26fec546dbdef603ea7c1065ce1d511885))


### Miscellaneous Chores

* release 1.0.0 ([0aa53fe](https://github.com/vscode-neovim/vscode-neovim/commit/0aa53fe92c28cf737f09b91940c58bdacf7206df))

## [0.9.1](https://github.com/vscode-neovim/vscode-neovim/compare/v0.9.0...v0.9.1) (2023-10-14)


### Features

* Add option `statusLineSeparator` ([#1521](https://github.com/vscode-neovim/vscode-neovim/issues/1521)) ([374d72f](https://github.com/vscode-neovim/vscode-neovim/commit/374d72f106ad685a63dc63709355778a2aeacc5b))
* improved the nvim version check ([#1527](https://github.com/vscode-neovim/vscode-neovim/issues/1527)) ([a42a60e](https://github.com/vscode-neovim/vscode-neovim/commit/a42a60e9e5ed9f958c4deaaa57d009067b14c1a9))


### Bug Fixes

* [#1531](https://github.com/vscode-neovim/vscode-neovim/issues/1531) ([deb41d4](https://github.com/vscode-neovim/vscode-neovim/commit/deb41d463de8d04453f1ca5e2b8acf6393e7464a))
* fix semver comparison ([d22850c](https://github.com/vscode-neovim/vscode-neovim/commit/d22850c42223c07571bdb40cb2ac48e8c232f8a7))
* **highlight:** do not widen the decoration's range ([deb41d4](https://github.com/vscode-neovim/vscode-neovim/commit/deb41d463de8d04453f1ca5e2b8acf6393e7464a)), closes [#1531](https://github.com/vscode-neovim/vscode-neovim/issues/1531)
* **keybinds:** Ctrl+n and Ctrl+p in cmdline ([#1533](https://github.com/vscode-neovim/vscode-neovim/issues/1533)) ([305bc1a](https://github.com/vscode-neovim/vscode-neovim/commit/305bc1aae7e444ee67ba5d5fe6438c9cda36f99f))
* properly set the client info ([c0422ef](https://github.com/vscode-neovim/vscode-neovim/commit/c0422efbf9cb0ee59989f7e7d52435019b8182a5))


### Miscellaneous Chores

* release 0.9.1 ([11e7705](https://github.com/vscode-neovim/vscode-neovim/commit/11e77056d6d19af810b24401efa4d5ef16fc19f1))

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

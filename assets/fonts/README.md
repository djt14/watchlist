# Bundled typography

Cinzel and Inter are bundled as normal, variable-weight Latin WOFF2 fonts. All application text weights are supported without Google Fonts requests. The total font payload is 74,160 bytes. Characters outside the supplied Latin range use the application's declared system fallbacks.

Files were retrieved unmodified from Fontsource's public font-files repository on 2026-09-07. Fontsource distributes Google Fonts-derived web font subsets. This folder contains the corresponding original SIL Open Font License 1.1 text for each family.

| Local file | Source | Git blob SHA-1 |
| --- | --- | --- |
| cinzel-latin-variable.woff2 | https://github.com/fontsource/font-files/blob/main/fonts/variable/cinzel/files/cinzel-latin-wght-normal.woff2 | a54fd00bf0e964d4d13688d8e8907cf04350e214 |
| inter-latin-variable.woff2 | https://github.com/fontsource/font-files/blob/main/fonts/variable/inter/files/inter-latin-wght-normal.woff2 | d15208de03cd1ad7c5199f0a0ce915fe841e4722 |

Cinzel upstream: https://github.com/NDISCOVER/Cinzel. License: `cinzel-OFL.txt`.

Inter upstream: https://github.com/rsms/inter. License: `inter-OFL.txt`.

License source copies: https://github.com/fontsource/font-files/blob/main/fonts/variable/cinzel/LICENSE and https://github.com/fontsource/font-files/blob/main/fonts/variable/inter/LICENSE.

`fonts.css` gives these files the existing application family names, preserving the CSS token contract. The service worker includes both font files and the stylesheet in the offline shell. The fixture server serves WOFF2 with `font/woff2`; its restrictive self-only policy allows these local assets.

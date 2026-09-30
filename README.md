# pub-time

![banner](banner.svg)

![npm](https://img.shields.io/npm/v/pub-time)
![install size](https://packagephobia.com/badge?p=pub-time)
![coverage](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ftbjgolden%2Fpub-time%2Fmain%2Fcoverage.json&label=coverage&query=$.total.lines.pct&color=brightgreen&suffix=%25)
![npm type definitions](https://img.shields.io/npm/types/pub-time)
![license](https://img.shields.io/npm/l/pub-time)

> **This package will not receive any further updates.** Its functionality is being integrated into
> a single package, [`lib-easy`](https://www.npmjs.com/package/lib-easy).

A much better `npm publish`, that:

- performs automatic semantic release versioning, like
  [`semantic-release`](https://github.com/semantic-release/semantic-release#commit-message-format)
- has zero dependencies - uses your built-in `git`, `npm`
- integrates with your npm scripts like `build`, `test` and `lint`
- checks your package.json for invalid types
- includes an API (including TypeScript support)
- supports a `--dry-run` option to give it a test drive

## Release

If "**checks**" fail or "**runs script**" has nonzero error code, `pub-time` exits and the publish
is cancelled.

1. **checks** you are on local `main` branch
2. **checks** you are level with remote `origin/main`
3. **checks** various key fields in `package.json`
4. **checks** for a `README.md`
5. **checks** that `npm audit` shows no vulnerabilities
6. **runs script** `npm run lint` if it exists (with default setting)
7. calculates the next version by looking at both:

   - the latest version (if any) published to `npm`
   - commits since the previous git tag `v#.#.#`

8. final warning, pausing for user input and showing some common final todos that can't be
   automatically checked
9. updates the version in package.json
10. **checks** that the user's `npm` and `node` versions match the user's `engines` in
    `package.json`
11. deletes and reinstalls npm dependencies
12. **runs script** `npm run build` (with default setting)
13. **runs script** `npm run test` (with default setting)
14. **runs script** `npm run check-build` if it exists (with default setting)
15. (!) **dry run** stops doing anything here, but instead logs out the commands it _would_ run
16. **releases**

    - commits any changes
    - creates a new `v#.#.#` git tag
    - pushes up commits and tag
    - `npm publish` 🎉

## Background

I created this library because I was unhappy with the alternatives (especially the install size):

| package            | install size                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `np`               | ![install size](https://packagephobia.com/badge?p=np)               |
| `release-it`       | ![install size](https://packagephobia.com/badge?p=release-it)       |
| `semantic-release` | ![install size](https://packagephobia.com/badge?p=semantic-release) |

`pub-time` leans into the conventions you may already use in your projects and will use your
pre-existing project specific scripts in your `package.json`.

## Install

This package is available from the `npm` registry.

```sh
npm install pub-time
```

## Usage

```sh
npx pub-time
```

```
Usage: pub-time [options]

Options:
  --dry-run                  Perform a dry run without making any changes
  --force-version <version>  Override the autocalculated version
  --prev-hash <hash>         Specify the previous hash
  -h, --help                 display help for command
```

## API

Supports JavaScript + TypeScript:

```ts
import { publish } from "pub-time";

export const publish = (config: Partial<Config>) => Promise<boolean>;

export type Config = {
  /* custom log function instead of console.log */
  log: (message: string) => void;
  /* if true, package will not be published, git will not be updated */
  dryRun: boolean;
  /* if left undefined, will treat last 'v#.#.#' git tag as the last commit of the prev release
     if a string, will be treated as the hash of the last commit of the prev release
     to force include all commits, use the value 'all' */
  prevHash?: string;
  /* skips inference completely, blindly trusts the version */
  forceVersion?: string;
  /* custom functions used in publish process */
  build: string | ((nextSemver: string) => Promise<void>);
  checkBuild: string | ((nextSemver: string) => Promise<void>);
  test: string | (() => Promise<void>);
  lint: string | (() => Promise<void>);
};

export const DEFAULT_CONFIG: Config = {
  log: console.log,
  prevHash: undefined,
  dryRun: false,
  lint: "lint",
  build: "build",
  checkBuild: "check-build",
  test: "test",
};
```

Can also be imported via `require("pub-time")`.

## Contributing

GitHub issues / PRs welcome.

Dev environment requires:

- node >= 16.14.0
- npm >= 6.8.0
- git >= 2.11

## Licence

Apache-2.0

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Typescript Support (TODO: Add link to final pull request typescript -> master)

## [1.6.0] - 2026-04-25

### Changed

- Updated the runtime stack to Screeps 4.3.0 and the matching `@screeps/*` packages.
- Updated the project toolchain for Node 24, modern TypeScript, Mocha, and ESLint.
- Switched the package scripts and CI examples to npm.

### Fixed

- Replaced deprecated `fs-extra-promise` usage with `fs-extra`.
- Prevented worker auto-restarts during shutdown so tests and local runs clean up reliably.
- Disabled stale Screeps runtime snapshots at startup so native VM workers can run across rebuilt Node 24 environments.
- Decoded HTML-escaped console output emitted by the updated Screeps runtime.

## [1.5.1] - 2020-04-21

### Added

- This Changelog
- Github actions workflow ([#20](https://github.com/screepers/screeps-server-mockup/pull/20))

### Changed

- Changed hardcoded 'gametime' keys to use env.keys ([#16](https://github.com/screepers/screeps-server-mockup/pull/16))
- Updated to screeps 4.1.5 ([#23](https://github.com/screepers/screeps-server-mockup/pull/23))

### Fixed

- Typos / formatting ([#8](https://github.com/screepers/screeps-server-mockup/pull/8) [#9](https://github.com/screepers/screeps-server-mockup/pull/9))
- Requirements documentation in readme ([73ecaa2](https://github.com/screepers/screeps-server-mockup/commit/73ecaa200e9406593915fd345ee75d18a1d70993))

[unreleased]: https://github.com/screepers/screeps-server-mockup/compare/v1.5.1...master
[1.6.0]: https://github.com/screepers/screeps-server-mockup/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/screepers/screeps-server-mockup/compare/v1.5.0...v1.5.1

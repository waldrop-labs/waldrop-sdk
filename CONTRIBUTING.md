# Contributing to @waldrop/sdk

Thanks for your interest in Waldrop. This guide covers how to file issues and submit PRs for the TypeScript SDK.

## Before you start

For anything non-trivial (new API surface, breaking change, architectural rethink), **open an issue first** to discuss the approach. Saves both of us time.

Small fixes — typos, doc tweaks, obvious bugs, dependency bumps — go straight to a PR.

## Setup

```bash
git clone https://github.com/waldrop-labs/waldrop-sdk.git
cd waldrop-sdk
bun install
bun run build
bun run typecheck
```

You'll need [Bun](https://bun.sh) v1.0+ and Node.js v18+.

## Workflow

1. Fork the repo and branch from `main` — `fix/`, `feat/`, `docs/`, or `chore/` prefix
2. Make your changes in `src/`
3. Run `bun run typecheck && bun run build` — both must pass
4. Update `CHANGELOG.md` under `[Unreleased]` with a one-line description
5. Commit with a clear message (`feat(blob): add streaming fetch API`)
6. Open a PR against `main`

## Code style

- Match the existing code — see neighbour files for patterns
- Public APIs need JSDoc comments with `@param` and `@returns`
- Use named exports, not default exports
- Prefer `async/await` over raw promises
- File names: camelCase (`uploadBlob.ts`, `walrusSystem.ts`)
- Types in `PascalCase`, functions in `camelCase`, constants in `SCREAMING_SNAKE_CASE`
- Keep modules focused — if a function doesn't fit a domain (`blob/`, `upload/`, etc.), it probably belongs elsewhere

## Public API

The `src/index.ts` file is the **public API contract**. Anything not exported there is internal and may change between minor versions.

If you're adding a new public export:

- Add it to `src/index.ts`
- Add a JSDoc comment on the export
- Document it in the README's API reference section
- Add an entry to `CHANGELOG.md`

## Tests

Tests live in `tests/`. Use [Vitest](https://vitest.dev/).

Network-touching tests should be unit-tested with mocked Sui RPC responses. Integration tests against testnet are welcome but should be tagged so they don't run in CI by default.

```bash
bun run test          # one-shot
bun run test:watch    # watch mode
```

## PR checklist

- [ ] `bun run typecheck` passes
- [ ] `bun run build` passes
- [ ] New public APIs are exported from `src/index.ts`
- [ ] Public APIs have JSDoc comments
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] No breaking changes to existing exports (or flagged clearly in the PR description)

## Releases

Releases are cut by maintainers. The flow is:

1. Move `[Unreleased]` entries in `CHANGELOG.md` under a new version heading
2. `npm version <patch|minor|major>` to bump `package.json` + create git tag
3. `git push --follow-tags` triggers the npm publish workflow

## Security

Email **info@waldrop.xyz** with details and we'll respond within 48 hours.

## License

By contributing, you agree your code will be licensed under [MIT](LICENSE).

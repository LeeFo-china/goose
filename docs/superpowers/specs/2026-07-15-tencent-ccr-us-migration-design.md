# Tencent CCR US Migration Design

**Date:** 2026-07-15

**Scope:** Docker image build, Admin super-admin release orchestration, development deployment,
production candidate validation, server-side image defaults, and operational documentation.

## Goal

Move all future Gooes application image builds and pulls to:

```text
useccr.ccs.tencentyun.com/america_goose
```

The development environment will be migrated completely. Production will build and pull-verify a
new candidate without recreating any running production container. The next approved production
release will perform the runtime cutover.

## Current Evidence

The migration audit established the following state:

- GitHub repository variable `TENCENT_CCR_NAMESPACE` is already `america_goose`.
- Repository secrets `TENCENT_CCR_USERNAME` and `TENCENT_CCR_PASSWORD` are available at repository
  scope and are inherited by both development and production workflows.
- The old endpoint `ccr.ccs.tencentyun.com/america_goose` accepts login but rejects pushes because
  that endpoint is bound to a different CCR account/region.
- GitHub Actions run `29416342743` successfully pushed and deployed
  `useccr.ccs.tencentyun.com/america_goose/goose-api:0747f731...` to development.
- The development server successfully pulled that image and reports the API container healthy.
- Both development and production servers can reach `https://useccr.ccs.tencentyun.com/v2/`.
- The new registry currently contains only `goose-api:dev` and its tested SHA image. Admin, Web,
  social-video-worker, and all production `:main` images are still absent.
- Development Admin, Web, social-video-worker, and cos-reconcile-worker still run images from the
  old registry. Production application containers all still run old-registry images.
- The US registry changes exist on `feature/unified-phone-identity-login`, but not on `main`.
  Because the repository namespace is already new, the next `main` build would combine the old
  endpoint with the new namespace and fail.

## Configuration Source Of Truth

GitHub repository variables will be the single source for the registry base:

```text
TENCENT_CCR_REGISTRY=useccr.ccs.tencentyun.com
TENCENT_CCR_NAMESPACE=america_goose
```

The following workflows must consume both variables and reject empty values before login, image
construction, or manifest validation:

- `.github/workflows/build-docker-images.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-docker-services.yml`

The build manifest remains evidence-bound to service, commit SHA, target environment, image, and
digest. Production deployment continues to use verified digests rather than mutable branch tags.

`TENCENT_CCR_USERNAME` and `TENCENT_CCR_PASSWORD` remain repository secrets. They will not be copied
into tracked files or permanent server environment files. Every build or deployment logs in through
the existing workflow step.

## Repository Changes

### Workflows

Replace the hard-coded registry endpoint in all three Docker workflows with the repository variable.
Use the same `TENCENT_CCR_REGISTRY` and `TENCENT_CCR_NAMESPACE` environment values throughout image
build, development deployment, Web deployment, production candidate resolution, and production
deployment.

Add contract coverage that fails when:

- any active Docker release workflow contains the retired registry endpoint;
- workflows do not consume both repository variables;
- build and deploy paths construct different registry bases;
- production pull verification is absent from candidate readiness.

### Compose And Examples

Update tracked fallback/example image references to the US registry:

- `deploy/docker-compose.admin.yml`
- `deploy/docker-compose.api.yml`
- `deploy/.env.admin.example`
- registry-specific Web rollback test fixtures

API, development, and Web Compose fragments that already require explicit image variables will
remain fail-closed. No mutable default will be added to production Web Compose.

### Operational Documentation

Update current copy-paste build, deploy, and rollback commands to the new registry. Historical
server backup files remain unchanged because they are rollback evidence, not active configuration.
The migration record must explain that the old registry remains temporarily available only for
currently running production images and historical rollback.

### Admin Super-Admin Release Center

The Admin API release service requires no registry-specific business-code change. It already
dispatches these stable workflows:

```text
development -> release-dev.yml
production  -> release-production.yml
```

Registry selection belongs to the called workflows. Existing release-center tests will verify that
development still means build-and-deploy, while production candidate build does not deploy.

The production service candidate intentionally excludes Web from its deploy scope. Web remains a
separate Gate and Web-only deployment. The Admin Web release guide must add the missing production
image-build step and link to `build-docker-images.yml`, so an operator builds the Web SHA image from
the same release Tag before running the Web Gate. This is an Admin guidance correction only; Web must
not be added to the service deployment multi-select.

## Production Pull Verification

`build-docker-images.yml` will add an evidence-bound pull verification job after every production
image build. Placing the check in the reusable build workflow covers both service candidates invoked
by `release-production.yml` and the separate production Web build. It will run on the production
deploy runner with the `production` GitHub environment and will:

1. Guard the expected production runner and selected release Tag.
2. Download the current run's immutable build plan and image manifests.
3. Verify every manifest belongs to the selected SHA, service, production environment, registry,
   and namespace.
4. Log in to the US CCR endpoint with the existing repository secrets.
5. Pull each built SHA image without running Compose or recreating a container.
6. Verify the local image revision label and registry digest against the manifest.
7. Remove only the newly pulled, unused SHA-tag references after verification.

The reusable build workflow does not complete until this job succeeds, so service candidate
publication also depends on it. The job must not call `docker compose up`, restart a service, reload
Nginx, or alter production traffic.

## Rollout Sequence

### Repository And Development

1. Implement and verify the repository changes on `chore/tencent-ccr-us-migration`, based on
   `origin/main` so unrelated local `main` commits are not bundled.
2. Set repository variable `TENCENT_CCR_REGISTRY` to `useccr.ccs.tencentyun.com`; retain
   `TENCENT_CCR_NAMESPACE=america_goose`.
3. Merge the focused migration branch into remote `main`.
4. Require the resulting automatic development build plan to select every application service. The
   tracked Compose changes are runtime-wide and must produce four image builds plus five deployment
   services. If that contract fails, stop and fix the resolver; `release-dev.yml service=all` is not
   a substitute because Web remains outside the service orchestrator.
5. Require successful SHA image manifests and healthy development containers for API, Admin, Web,
   social-video-worker, and cos-reconcile-worker. The cos-reconcile-worker continues to share the API
   image.
6. Back up `/opt/gooes-dev/docker/.env`, then update its active image variables to US-registry `:dev`
   images. Historical `.env.backup-*` files remain untouched.
7. Verify `docker compose config --images`, container image names, revision labels, and public
   development endpoints.

### Production Candidate Without Deployment

1. Create release candidate Tag `v2026.07.15.1` from the merged remote `main` commit.
2. Dispatch `release-production.yml` with `operation=build`, `service=all`, and the existing exact
   confirmation text. This builds API, Admin, and social-video-worker; cos-reconcile-worker continues
   to share the API image.
3. Dispatch `build-docker-images.yml` from the same Tag with `target_environment=production` and
   `service=web`. This creates the production Web SHA image without deploying it.
4. Require all four production image manifests, both production pull-verification results, and the
   immutable service candidate artifact to succeed.
5. Record production container IDs, image names, and revisions before and after the build runs;
   they must be unchanged.
6. Back up `/opt/supabase/docker/.env` and `.env.admin`, then change only active API, Admin, and
   social-video-worker image variables to US-registry `:main` references. Do not run Compose.
7. Keep production Web fail-closed: its actual future deployment must continue to use a gated SHA
   image supplied by the production deployment workflow.
8. Verify production Compose resolves the new registry while all running production containers still
   use their pre-migration images.

## Rollback

Until a successful production runtime cutover is complete, retain the old CCR namespace and images.
If the US registry fails during development migration:

1. Restore repository variables to
   `ccr.ccs.tencentyun.com` and `gooes-goodcms`.
2. Restore the backed-up development `.env`.
3. Redeploy the last known-good development SHA through the evidence-bound workflow.

The production candidate phase does not recreate containers, so runtime rollback is unnecessary.
If production server configuration validation fails, restore `.env` and `.env.admin` from their
timestamped backups. Running containers remain unchanged throughout this phase.

## Verification Matrix

| Area | Required evidence |
| --- | --- |
| Repository | No retired endpoint in active workflows or Compose defaults; contract tests pass |
| GitHub config | Registry and namespace variables have the exact US values; secrets remain present |
| Build | API, Admin, Web, and social-video-worker SHA manifests point to the US registry |
| Development | Five application containers are healthy and resolve to new-registry images |
| Admin release center | Dev uses `release-dev.yml`; service production uses `release-production.yml`; Web guide includes its separate build |
| Production candidate | Service candidate and Web build manifests pass production-runner pull verification |
| Production safety | Container IDs, revisions, Nginx, and public endpoints are unchanged |
| Server config | Active `.env` files resolve future pulls to the US registry; backups remain intact |
| Rollback | Old registry and timestamped server environment backups remain available |

## Non-Goals

- No database schema, data, migration, or Supabase change.
- No Orange mini-program repository change.
- No production container recreation or traffic cutover in this migration.
- No deletion of old registry images or historical server backups.
- No new registry credentials or secret values in Git.

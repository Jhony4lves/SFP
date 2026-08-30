#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

PUBLIC_REPO="${PUBLIC_REPO:-Jhony4lves/SFP-Public}"
SOURCE_BRANCH="chore/public-sanitization"
NOREPLY_EMAIL="318408128+Jhony4lves@users.noreply.github.com"
WORK_ROOT="${TMPDIR:-$HOME/.cache}/sfp-public-snapshot"
SNAPSHOT="$WORK_ROOT/repo"

log(){ printf '\n==> %s\n' "$*"; }
fail(){ printf '\nERRO: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail 'git não encontrado.'
command -v node >/dev/null 2>&1 || fail 'node não encontrado.'
command -v gh >/dev/null 2>&1 || fail 'GitHub CLI (gh) não encontrado.'
command -v tar >/dev/null 2>&1 || fail 'tar não encontrado.'

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail 'Execute este script dentro do checkout do SFP.'
CURRENT_BRANCH="$(git branch --show-current)"
[ "$CURRENT_BRANCH" = "$SOURCE_BRANCH" ] || fail "Branch atual: $CURRENT_BRANCH. Use $SOURCE_BRANCH."
[ -f qa/public-safety-check.mjs ] || fail 'Gate público de segurança não encontrado.'
[ ! -f scripts/public_sanitize.mjs ] || fail 'O sanitizador privado ainda está presente; a árvore não está pronta para publicação.'
[ ! -f .github/workflows/public-sanitize-apply.yml ] || fail 'O workflow one-shot ainda está presente; a árvore não está pronta para publicação.'

gh auth status >/dev/null 2>&1 || fail 'gh não está autenticado.'
if gh repo view "$PUBLIC_REPO" >/dev/null 2>&1; then
  fail "$PUBLIC_REPO já existe. Nada foi sobrescrito."
fi

log 'Criando snapshot temporário a partir da árvore sanitizada, sem histórico Git'
rm -rf "$WORK_ROOT"
mkdir -p "$SNAPSHOT"
git archive HEAD | tar -x -C "$SNAPSHOT"
rm -f "$SNAPSHOT/scripts/publish_public_snapshot.sh"

log 'Executando gate de secrets, PII e arquivos financeiros'
(
  cd "$SNAPSHOT"
  node qa/public-safety-check.mjs
)

log 'Executando QA estática do snapshot público'
(
  cd "$SNAPSHOT"
  npm run test:static
)

log 'Criando histórico Git novo com e-mail noreply'
(
  cd "$SNAPSHOT"
  git init -b main
  git config user.name 'Jhony4lves'
  git config user.email "$NOREPLY_EMAIL"
  git add -A
  git commit -m 'Initial public release: SFP 2.1.0-beta.3'
)

log "Criando $PUBLIC_REPO como repositório PÚBLICO"
(
  cd "$SNAPSHOT"
  gh repo create "$PUBLIC_REPO" \
    --public \
    --source=. \
    --remote=origin \
    --push \
    --description 'Smart Financial Planner — aplicativo financeiro local-first para Android'
)

log 'Verificando publicação, histórico e autor'
(
  cd "$SNAPSHOT"
  git fetch origin main --quiet
  COUNT="$(git rev-list --count origin/main)"
  [ "$COUNT" = '1' ] || fail "O repositório público deveria nascer com 1 commit, mas possui $COUNT."
  AUTHOR_EMAIL="$(git log -1 --format='%ae' origin/main)"
  [ "$AUTHOR_EMAIL" = "$NOREPLY_EMAIL" ] || fail "Autor público inesperado: $AUTHOR_EMAIL"
  git log -1 --format='Commit público: %H%nAutor: %an <%ae>' origin/main
)

printf '\nPUBLICAÇÃO CONCLUÍDA: https://github.com/%s\n' "$PUBLIC_REPO"
printf 'Snapshot temporário: %s\n' "$SNAPSHOT"
printf 'O repositório privado original não foi alterado nem teve o histórico publicado.\n'

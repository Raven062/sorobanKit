#!/usr/bin/env bash
#
# Generates TypeScript bindings for the payment_router Soroban contract and
# writes them to packages/types.
#
# The bindings are derived from the contract ABI (spec) embedded in the WASM,
# so the contract is built first and `contract bindings typescript` is run
# against the resulting artifact. Generated files are checked into the repo so
# CI and the frontend never need the CLI installed — run this script whenever
# the contract's public interface changes and commit the result.
#
# Requirements:
#   - cargo with the wasm32-unknown-unknown target installed (to build the contract)
#   - the stellar (or soroban) CLI: https://github.com/stellar/stellar-cli
#
# You can point the script at a specific CLI binary with the STELLAR_CLI env
# var, e.g.:
#   STELLAR_CLI=/opt/stellar-cli/bin/stellar ./scripts/generate-bindings.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="$ROOT/payment_router"
PACKAGE_DIR="$ROOT/packages/types"
PACKAGE_NAME="@stellar-tags/payment-router"
WASM_REL="target/wasm32-unknown-unknown/release/payment_router.wasm"

# --- 1. Locate the CLI ------------------------------------------------------
CLI="${STELLAR_CLI:-}"
if [[ -z "$CLI" ]]; then
  if command -v stellar >/dev/null 2>&1; then
    CLI="stellar"
  elif command -v soroban >/dev/null 2>&1; then
    CLI="soroban"
  else
    echo "stellar CLI not found. Install with: cargo install --locked stellar-cli" >&2
    echo "       See https://github.com/stellar/stellar-cli or set STELLAR_CLI." >&2
    exit 1
  fi
elif ! command -v "$CLI" >/dev/null 2>&1; then
  echo "stellar CLI not found at STELLAR_CLI=$CLI. Install with: cargo install --locked stellar-cli" >&2
  exit 1
fi

echo "Using CLI: $CLI"

# --- 2. Build the contract WASM ---------------------------------------------
echo "Building payment_router contract (wasm32-unknown-unknown, release)..."
cargo build --manifest-path "$CONTRACT_DIR/Cargo.toml" --target wasm32-unknown-unknown --release

WASM="$CONTRACT_DIR/$WASM_REL"
if [[ ! -f "$WASM" ]]; then
  echo "error: expected WASM artifact not found at $WASM" >&2
  exit 1
fi

# --- 3. Generate bindings into a temp dir -----------------------------------
# The CLI names the package after the output directory, so generate into a
# temp dir with the desired name and move the result into place.
TMP_ROOT="$(mktemp -d)"
TMP_OUT="$TMP_ROOT/payment-router"
trap 'rm -rf "$TMP_ROOT"' EXIT

echo "Generating TypeScript bindings..."
"$CLI" contract bindings typescript \
  --wasm "$WASM" \
  --output-dir "$TMP_OUT" \
  --overwrite

# --- 4. Move into packages/types --------------------------------------------
rm -rf "$PACKAGE_DIR"
mkdir -p "$(dirname "$PACKAGE_DIR")"
cp -R "$TMP_OUT" "$PACKAGE_DIR"
rm -rf "$TMP_ROOT"
trap - EXIT

# --- 5. Normalize package metadata ------------------------------------------
# The generated package.json points at a compiled dist/ that only exists after
# `tsc`. Point it at the checked-in TS source so Vite (and other bundlers) can
# consume the bindings directly with no build step.
node - "$PACKAGE_DIR/package.json" "$PACKAGE_NAME" <<'EOF'
const fs = require("fs");
const [pkgPath, name] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.name = name;
pkg.description =
  "Auto-generated TypeScript client for the stellar-tags payment_router " +
  "Soroban contract. Generated from the contract ABI by " +
  "scripts/generate-bindings.sh \u2014 do not edit by hand.";
pkg.exports = "./src/index.ts";
pkg.main = "./src/index.ts";
pkg.types = "./src/index.ts";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
EOF

# --- 6. Inject network metadata ----------------------------------------------
# Generated-from-WASM bindings have no network context, so the CLI cannot emit
# the `networks` constant. Inject it (idempotently) so consumers get the
# contract ID and passphrase from the shared package.
node - "$PACKAGE_DIR/src/index.ts" "$PACKAGE_NAME" <<'EOF'
const fs = require("fs");
const [filePath, name] = process.argv.slice(2);
let src = fs.readFileSync(filePath, "utf8");
if (!src.includes("export const networks")) {
  const networks = `\n/**\n * Known deployments of the payment_router contract. The WASM-based generator\n * cannot emit these (it has no network context), so scripts/generate-bindings.sh\n * injects them after generation.\n */\nexport const networks = {\n  testnet: {\n    networkPassphrase: "Test SDF Network ; September 2015",\n    contractId: "CDNQ7OMHIFOLZHOKWQLOGDW7CF3DRMKXJC6OULNGNBWF4O4NO2NEIGER",\n  },\n} as const;\n`;
  const marker = 'window.Buffer = window.Buffer || Buffer;\n}';
  const idx = src.indexOf(marker);
  if (idx !== -1) {
    src = src.slice(0, idx + marker.length) + networks + src.slice(idx + marker.length);
  } else {
    src += networks;
  }
  fs.writeFileSync(filePath, src);
}
EOF

# --- 7. Make the bindings tree-shakeable -------------------------------------
# The CLI emits a single `Client` class whose methods are all reachable through
# one exported instance, so bundlers cannot drop unused contract methods. Split
# the generated class into standalone named exports (one function per contract
# method) so importing a single method only pulls in that method.
node - "$PACKAGE_DIR/src/index.ts" <<'EOF'
const fs = require("fs");
const [filePath] = process.argv.slice(2);
let src = fs.readFileSync(filePath, "utf8");

// Locate the generated Client class body.
const classMatch = src.match(/export class Client\s*\{/);
if (!classMatch) {
  // Nothing to rewrite (already tree-shakeable or unexpected shape).
  process.exit(0);
}
const classStart = classMatch.index;
const bodyStart = classStart + classMatch[0].length;

// Find the matching closing brace of the class body.
let depth = 1;
let i = bodyStart;
while (i < src.length && depth > 0) {
  const ch = src[i];
  if (ch === "{") depth++;
  else if (ch === "}") depth--;
  i++;
}
if (depth !== 0) {
  console.error("error: could not find end of generated Client class");
  process.exit(1);
}
const bodyEnd = i - 1; // index of the class's closing brace
const classBody = src.slice(bodyStart, bodyEnd);

// Split the class body into top-level members (methods and fields).
const members = [];
let memberStart = 0;
let braceDepth = 0;
let parenDepth = 0;
let inString = null;
let inLineComment = false;
let inBlockComment = false;
for (let j = 0; j < classBody.length; j++) {
  const ch = classBody[j];
  const next = classBody[j + 1];
  if (inLineComment) {
    if (ch === "\n") inLineComment = false;
    continue;
  }
  if (inBlockComment) {
    if (ch === "*" && next === "/") {
      inBlockComment = false;
      j++;
    }
    continue;
  }
  if (inString) {
    if (ch === "\\") {
      j++;
    } else if (ch === inString) {
      inString = null;
    }
    continue;
  }
  if (ch === "/" && next === "/") {
    inLineComment = true;
    j++;
    continue;
  }
  if (ch === "/" && next === "*") {
    inBlockComment = true;
    j++;
    continue;
  }
  if (ch === '"' || ch === "'" || ch === "`") {
    inString = ch;
    continue;
  }
  if (ch === "(") parenDepth++;
  else if (ch === ")") parenDepth--;
  else if (ch === "{") braceDepth++;
  else if (ch === "}") braceDepth--;
  else if (ch === ";" && braceDepth === 0 && parenDepth === 0) {
    members.push(classBody.slice(memberStart, j + 1));
    memberStart = j + 1;
  }
}
if (memberStart < classBody.length) {
  members.push(classBody.slice(memberStart));
}

const isMethod = (m) => /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*\(/.test(m);
const isConstructor = (m) => /^\s*constructor\s*\(/.test(m);

const methods = [];
const otherMembers = [];
for (const m of members) {
  if (isConstructor(m)) {
    otherMembers.push(m);
  } else if (isMethod(m)) {
    methods.push(m);
  } else if (m.trim()) {
    otherMembers.push(m);
  }
}

// Build standalone named exports for each method.
const exported = [];
for (const m of methods) {
  const nameMatch = m.match(/^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/);
  if (!nameMatch) {
    otherMembers.push(m);
    continue;
  }
  const methodName = nameMatch[1];
  // Strip modifiers and convert the method into a standalone function.
  const fn = m
    .replace(/^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*/, "")
    .replace(/^\s*([A-Za-z_$][\w$]*)/, "export function $1");
  exported.push(fn.trim());
}

// Keep the class (with non-method members) for backwards compatibility, but
// re-export each method as a standalone function so bundlers can tree-shake.
const classHeader = src.slice(classStart, bodyStart);
const classTail = src.slice(bodyEnd + 1);
const keptClassBody = otherMembers.join("");
const newClass = classHeader + keptClassBody + "}" + classTail;

let out = src.slice(0, classStart) + newClass;
if (exported.length > 0) {
  out +=
    "\n// --- Tree-shakeable standalone method exports -------------------------\n" +
    "// Generated by scripts/generate-bindings.sh. Each contract method is\n" +
    "// exported individually so bundlers can drop unused methods.\n" +
    exported.join("\n\n") +
    "\n";
}
fs.writeFileSync(filePath, out);
EOF

# The generated README references the temp-dir package name; swap it for the
# real scoped name so the checked-in docs stay accurate (keeping the
# illustrative output-dir path un-scoped).
sed -i "s|\bpayment-router\b|$PACKAGE_NAME|g" "$PACKAGE_DIR/README.md"
sed -i "s|\./path/to/$PACKAGE_NAME|./path/to/payment-router|g" "$PACKAGE_DIR/README.md"

echo "Done. Bindings written to $PACKAGE_DIR"

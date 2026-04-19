#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local key="$1"
  if [ -z "${!key:-}" ]; then
    echo "Missing required env: ${key}" >&2
    exit 1
  fi
}

escape_single_quotes() {
  printf '%s' "$1" | sed "s/'/'\"'\"'/g"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command missing: ${cmd}" >&2
    exit 1
  fi
}

require_env PACKAGES_TOKEN
require_env PACKAGES_REPO
require_env PACKAGES_BRANCH
require_env PACKAGE_NAME
require_env PACKAGE_COMPONENT
require_env PACKAGE_VERSION
require_env DEB_PATH
require_env RPM_PATH
require_env GPG_PRIVATE_KEY
require_env GPG_PASSPHRASE
require_env PAGES_BASE_URL
require_env APT_SUITE
require_env GITHUB_OUTPUT

if [ "$PACKAGE_COMPONENT" != "ocr" ] && [ "$PACKAGE_COMPONENT" != "stt" ]; then
  echo "PACKAGE_COMPONENT must be 'ocr' or 'stt', got: $PACKAGE_COMPONENT" >&2
  exit 1
fi
if [ ! -f "$DEB_PATH" ]; then
  echo "Debian package not found: $DEB_PATH" >&2
  exit 1
fi
if [ ! -f "$RPM_PATH" ]; then
  echo "RPM package not found: $RPM_PATH" >&2
  exit 1
fi

for cmd in git gpg dpkg-scanpackages apt-ftparchive createrepo_c rpmsign gzip; do
  require_cmd "$cmd"
done

repo_dir="${RUNNER_TEMP}/squigit-packages-repo"
rm -rf "$repo_dir"

export GNUPGHOME="${RUNNER_TEMP}/squigit-packages-gnupg"
rm -rf "$GNUPGHOME"
mkdir -p "$GNUPGHOME"
chmod 700 "$GNUPGHOME"

printf '%s' "$GPG_PRIVATE_KEY" | gpg --batch --import

gpg_key_fpr="$(gpg --batch --with-colons --list-secret-keys | awk -F: '/^fpr:/ {print $10; exit}')"
if [ -z "$gpg_key_fpr" ]; then
  echo "Failed to resolve imported GPG key fingerprint" >&2
  exit 1
fi

git clone "https://x-access-token:${PACKAGES_TOKEN}@github.com/${PACKAGES_REPO}.git" "$repo_dir"
cd "$repo_dir"
git checkout "$PACKAGES_BRANCH"

mkdir -p "apt/dists/${APT_SUITE}/ocr/binary-amd64"
mkdir -p "apt/dists/${APT_SUITE}/stt/binary-amd64"
mkdir -p "apt/pool/ocr" "apt/pool/stt"
mkdir -p "rpm/ocr" "rpm/stt" "keys"

# Keep one deb per component lane and regenerate index metadata.
find "apt/pool/${PACKAGE_COMPONENT}" -maxdepth 1 -type f -name '*.deb' -delete
deb_target="apt/pool/${PACKAGE_COMPONENT}/$(basename "$DEB_PATH")"
cp "$DEB_PATH" "$deb_target"

for component in ocr stt; do
  component_dir="apt/dists/${APT_SUITE}/${component}/binary-amd64"
  component_pool="apt/pool/${component}"
  mkdir -p "$component_dir"
  if find "$component_pool" -maxdepth 1 -type f -name '*.deb' | grep -q .; then
    (
      cd apt
      dpkg-scanpackages --multiversion "pool/${component}" /dev/null > "../${component_dir}/Packages"
    )
  else
    : > "${component_dir}/Packages"
  fi
  gzip -9 -c "${component_dir}/Packages" > "${component_dir}/Packages.gz"
done

apt-ftparchive \
  -o "APT::FTPArchive::Release::Origin=Squigit Org" \
  -o "APT::FTPArchive::Release::Label=Squigit Packages" \
  -o "APT::FTPArchive::Release::Suite=${APT_SUITE}" \
  -o "APT::FTPArchive::Release::Codename=${APT_SUITE}" \
  -o "APT::FTPArchive::Release::Architectures=amd64" \
  -o "APT::FTPArchive::Release::Components=ocr stt" \
  release "apt/dists/${APT_SUITE}" > "apt/dists/${APT_SUITE}/Release"

gpg --batch --yes --pinentry-mode loopback --passphrase "$GPG_PASSPHRASE" --local-user "$gpg_key_fpr" \
  --clearsign -o "apt/dists/${APT_SUITE}/InRelease" "apt/dists/${APT_SUITE}/Release"

gpg --batch --yes --pinentry-mode loopback --passphrase "$GPG_PASSPHRASE" --local-user "$gpg_key_fpr" \
  --detach-sign --armor -o "apt/dists/${APT_SUITE}/Release.gpg" "apt/dists/${APT_SUITE}/Release"

# Keep one rpm per component lane to avoid stale duplicates.
find "rpm/${PACKAGE_COMPONENT}" -maxdepth 1 -type f -name '*.rpm' -delete
rpm_target="rpm/${PACKAGE_COMPONENT}/$(basename "$RPM_PATH")"
cp "$RPM_PATH" "$rpm_target"

escaped_passphrase="$(escape_single_quotes "$GPG_PASSPHRASE")"
cat > "${HOME}/.rpmmacros" <<RPMMACROS
%_signature gpg
%_gpg_path ${GNUPGHOME}
%_gpg_name ${gpg_key_fpr}
%_gpgbin /usr/bin/gpg
%__gpg /usr/bin/gpg
%__gpg_sign_cmd %{__gpg} --batch --yes --no-armor --pinentry-mode loopback --passphrase '${escaped_passphrase}' --detach-sign --output %{__signature_filename} %{__plaintext_filename}
RPMMACROS

rpmsign --addsign "$rpm_target"
rm -f "${HOME}/.rpmmacros"

for component in ocr stt; do
  component_dir="rpm/${component}"
  mkdir -p "$component_dir"
  createrepo_c --update "$component_dir"
  gpg --batch --yes --pinentry-mode loopback --passphrase "$GPG_PASSPHRASE" --local-user "$gpg_key_fpr" \
    --detach-sign --armor -o "${component_dir}/repodata/repomd.xml.asc" "${component_dir}/repodata/repomd.xml"
done

cat > "rpm/squigit.repo" <<EOF_REPO
[squigit-ocr]
name=Squigit OCR Packages
baseurl=${PAGES_BASE_URL}/rpm/ocr
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=${PAGES_BASE_URL}/keys/squigit-packages.asc

[squigit-stt]
name=Squigit STT Packages
baseurl=${PAGES_BASE_URL}/rpm/stt
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=${PAGES_BASE_URL}/keys/squigit-packages.asc
EOF_REPO

gpg --batch --yes --output "keys/squigit-packages.gpg" --export "$gpg_key_fpr"
gpg --batch --yes --armor --output "keys/squigit-packages.asc" --export "$gpg_key_fpr"

if [ ! -f README.md ]; then
  cat > README.md <<'EOF_README'
# Squigit Packages

Signed APT and DNF repositories for Squigit sidecar packages.

- APT repo root: `apt/`
- DNF repo root: `rpm/`
- Public key: `keys/squigit-packages.asc`
- Latest installable packages are mirrored in this repository.
EOF_README
fi

if [ ! -f index.html ]; then
  cat > index.html <<'EOF_INDEX'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Squigit Packages</title>
  </head>
  <body>
    <h1>Squigit Packages</h1>
    <p>Signed Linux package repositories for Squigit OCR and STT sidecars.</p>
    <p>Use the installation snippets from the Squigit docs.</p>
  </body>
</html>
EOF_INDEX
fi

git config user.name "GitHub Actions Bot"
git config user.email "actions@github.com"
git add apt rpm keys README.md index.html

if git diff --cached --quiet; then
  echo "No package metadata changes to publish."
else
  git commit -m "Publish ${PACKAGE_NAME} ${PACKAGE_VERSION} package metadata"
  git push origin "$PACKAGES_BRANCH"
fi

{
  echo "repo_url=https://github.com/${PACKAGES_REPO}"
  echo "apt_source=deb [signed-by=/etc/apt/keyrings/squigit-packages.gpg] ${PAGES_BASE_URL}/apt ${APT_SUITE} ocr stt"
} >> "$GITHUB_OUTPUT"

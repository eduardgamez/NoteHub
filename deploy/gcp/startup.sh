#!/bin/bash
set -euo pipefail
test ! -f /var/lib/notehub/bootstrap-ready || exit 0
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl xz-utils python3 caddy
# Download Node from the official distribution and verify its published checksum.
python3 - <<'NODE'
import json, urllib.request, subprocess
releases = json.load(urllib.request.urlopen('https://nodejs.org/dist/index.json'))
version = next(r['version'] for r in releases if r['version'].startswith('v22.'))
archive = f'node-{version}-linux-x64.tar.xz'
base = f'https://nodejs.org/dist/{version}/'
urllib.request.urlretrieve(base+archive, '/tmp/'+archive)
urllib.request.urlretrieve(base+'SHASUMS256.txt', '/tmp/node-shasums')
import hashlib
expected = next(line.split()[0] for line in open('/tmp/node-shasums') if line.split()[-1] == archive)
assert hashlib.sha256(open('/tmp/'+archive,'rb').read()).hexdigest() == expected
subprocess.run(['tar','-xJf','/tmp/'+archive,'-C','/usr/local','--strip-components=1'],check=True)
NODE
npm install --global @openai/codex@0.159.2
id notehub >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/notehub --shell /usr/sbin/nologin notehub
install -d -o notehub -g notehub -m 700 /var/lib/notehub/credentials
install -d -o notehub -g notehub -m 755 /opt/notehub
# A small swap file prevents installation bursts from exhausting the 1 GB VM.
if ! test -f /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
python3 - <<'HOST'
from pathlib import Path
import uuid, os
path=Path('/var/lib/notehub/credentials/host-id')
if not path.exists():
    path.write_text('urn:uuid:'+str(uuid.uuid4()))
    os.chmod(path,0o600)
HOST
chown -R notehub:notehub /var/lib/notehub/credentials
touch /var/lib/notehub/bootstrap-ready

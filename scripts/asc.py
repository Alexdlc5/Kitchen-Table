# App Store Connect chores for .github/workflows/ios.yml (from Glimmerwood's revoke-ci-dev-certs.py).
#   python3 scripts/asc.py last-build <bundle id>   prints the highest build number Apple has for the app (0 if none)
#   python3 scripts/asc.py revoke-dev-certs         revokes the Apple Development certificates earlier CI runs created, so
#     automatic signing on a fresh runner never hits Apple's certificate limit. Each archive makes one ("Created via API");
#     they only sign the intermediate archive, so they are throwaway. Distribution signing and uploaded builds are untouched.
# Env: KEY_ID, ISSUER, KEY (path to the .p8). Needs: pip install pyjwt cryptography
import json, os, sys, time, urllib.parse, urllib.request
import jwt

token = jwt.encode({"iss": os.environ["ISSUER"], "iat": int(time.time()), "exp": int(time.time()) + 600, "aud": "appstoreconnect-v1"},
                   open(os.environ["KEY"]).read(), algorithm="ES256", headers={"kid": os.environ["KEY_ID"], "typ": "JWT"})
api = "https://api.appstoreconnect.apple.com/v1"

def call(path, method="GET"):
    req = urllib.request.Request(api + path, method=method, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as r:
        body = r.read()
    return json.loads(body) if body else None

cmd = sys.argv[1] if len(sys.argv) > 1 else ""
if cmd == "last-build":
    bundle = sys.argv[2]
    apps = call("/apps?filter[bundleId]=" + urllib.parse.quote(bundle))["data"]
    if not apps:
        sys.exit(f"No app with bundle id {bundle} in App Store Connect yet (docs/SETUP.md, part A3)")
    builds = call(f"/builds?filter[app]={apps[0]['id']}&fields[builds]=version&limit=200")["data"]
    print(max([int(b["attributes"]["version"]) for b in builds if b["attributes"]["version"].isdigit()] or [0]))
elif cmd == "revoke-dev-certs":
    certs = call("/certificates?filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT&limit=200")["data"]
    for c in certs:
        a = c["attributes"]
        ci = "Created via API" in (a.get("name") or "") + (a.get("displayName") or "")
        print(f"{'revoke' if ci else 'keep  '}  {a.get('certificateType')}  {a.get('displayName') or a.get('name')}  expires {a.get('expirationDate', '')[:10]}")
        if ci:
            call(f"/certificates/{c['id']}", "DELETE")
    print(f"{len(certs)} development certificates found")
else:
    sys.exit("usage: asc.py last-build <bundle id> | revoke-dev-certs")

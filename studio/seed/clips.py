"""Set clip timings on the incident drafts (session 2 clip hunt).

Found with YouTube storyboard thumbnails; embeddability tested with the YouTube IFrame API
(error 150 = owner blocks embedding). Run: SSL_CERT_FILE=/etc/ssl/cert.pem python3 studio/seed/clips.py
"""
import json, urllib.parse, urllib.request

env = dict(l.strip().split('=', 1) for l in open('.env.local') if '=' in l and not l.startswith('#'))
API = f"https://{env['SANITY_PROJECT_ID']}.api.sanity.io/v2025-02-19/data"
H = {'Authorization': f"Bearer {env['SANITY_WRITE_TOKEN']}", 'Content-Type': 'application/json'}

CLIPS = {
    # FIFA blocks embedding of all World Cup footage; the site links out to this moment instead.
    'perisic-world-cup-final-2018': dict(youtubeId='0rtw9uCevMg', channel='FIFA', startSeconds=238, endSeconds=268, embedAllowed=False),
    'cucurella-euro-2024': dict(youtubeId='CEDaEvy23i8', channel='ESPN FC', startSeconds=7, endSeconds=18, embedAllowed=True),
    # Top-down still of the ball on the line, shown by ESPN FC.
    'japan-spain-world-cup-2022': dict(youtubeId='7jX3gdU-E8U', channel='ESPN FC', startSeconds=8, endSeconds=30, embedAllowed=True),
    # Needs a human check: may show Rezaeian's legitimate goal rather than the disallowed one.
    'khalilzadeh-world-cup-2026': dict(youtubeId='JfDFF2D_woY', channel='CBS Sports Golazo', startSeconds=418, endSeconds=443, embedAllowed=True),
    'luis-diaz-tottenham-liverpool-2023': dict(youtubeId='HUtAjPTsuqs', channel='Tottenham Hotspur', startSeconds=12, endSeconds=34, embedAllowed=True),
}

q = urllib.parse.urlencode({'query': '*[_type=="incident" && _id in path("drafts.**")]{_id, "slug": slug.current}', 'perspective': 'raw'})
drafts = json.load(urllib.request.urlopen(urllib.request.Request(f'{API}/query/production?{q}', headers=H)))['result']
muts = [{'patch': {'id': d['_id'], 'set': {'clip': {'_type': 'clip', 'official': True, **CLIPS[d['slug']]}}}}
        for d in drafts if d['slug'] in CLIPS]
req = urllib.request.Request(f'{API}/mutate/production', data=json.dumps({'mutations': muts}).encode(), headers=H)
print(len(muts), 'patched', json.load(urllib.request.urlopen(req))['transactionId'])

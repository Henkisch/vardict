"""Seed teams, matches (published) and the five incidents (as drafts for review).

Run from repo root: SSL_CERT_FILE=/etc/ssl/cert.pem python3 studio/seed/incidents.py
(python.org Python on macOS ships without CA certs; the macOS bundle fixes it without disabling TLS checks.)
Facts verified in session 2 (see BUILD_LOG.md). Summaries are our own words.
Idempotent-ish: looks up teams by shortName and matches by teams+date before creating.
"""
import json, os, random, urllib.request, uuid

env = dict(l.strip().split('=', 1) for l in open('.env.local') if '=' in l and not l.startswith('#'))
PROJECT, DATASET, TOKEN = env['SANITY_PROJECT_ID'], env['SANITY_DATASET'], env['SANITY_WRITE_TOKEN']
API = f'https://{PROJECT}.api.sanity.io/v2025-02-19/data'


def call(path, body=None):
    req = urllib.request.Request(f'{API}/{path}', data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req))


def query(groq, **params):
    qs = urllib.parse.urlencode({'query': groq, 'perspective': 'raw', **{f'${k}': json.dumps(v) for k, v in params.items()}})
    return call(f'query/{DATASET}?{qs}')['result']


def mutate(mutations):
    return call(f'mutate/{DATASET}?returnIds=true', {'mutations': mutations})


import urllib.parse

TEAMS = [
    ('France', 'FRA', '#002654'), ('Croatia', 'CRO', '#E30613'), ('Spain', 'ESP', '#AA151B'),
    ('Germany', 'GER', '#1A1A1A'), ('Japan', 'JPN', '#0B2E83'), ('Egypt', 'EGY', '#CE1126'),
    ('Iran', 'IRN', '#239F40'), ('Tottenham Hotspur', 'TOT', '#132257'), ('Liverpool', 'LIV', '#C8102E'),
]
team_ids = {}
for name, short, color in TEAMS:
    existing = query('*[_type == "team" && shortName == $s][0]._id', s=short)
    if not existing:
        existing = mutate([{'create': {'_type': 'team', 'name': name, 'shortName': short, 'primaryColor': color}}])['results'][0]['id']
    team_ids[short] = existing

MATCHES = {
    'perisic': ('FRA', 'CRO', 'FIFA World Cup 2018, final', '2018-07-15', 'Luzhniki Stadium, Moscow', 4, 2),
    'cucurella': ('ESP', 'GER', 'UEFA Euro 2024, quarter-final', '2024-07-05', 'MHP Arena, Stuttgart', 2, 1),
    'japan': ('JPN', 'ESP', 'FIFA World Cup 2022, Group E', '2022-12-01', 'Khalifa International Stadium, Doha', 2, 1),
    'khalilzadeh': ('EGY', 'IRN', 'FIFA World Cup 2026, Group G', '2026-06-26', 'Seattle Stadium, Seattle', 1, 1),
    'diaz': ('TOT', 'LIV', 'Premier League 2023/24', '2023-09-30', 'Tottenham Hotspur Stadium, London', 2, 1),
}
match_ids = {}
for key, (home, away, comp, date, venue, hs, as_) in MATCHES.items():
    existing = query('*[_type == "match" && homeTeam._ref == $h && date == $d][0]._id', h=team_ids[home], d=date)
    if not existing:
        existing = mutate([{'create': {
            '_type': 'match', 'competition': comp, 'date': date, 'venue': venue,
            'homeTeam': {'_type': 'reference', '_ref': team_ids[home]},
            'awayTeam': {'_type': 'reference', '_ref': team_ids[away]},
            'score': {'home': hs, 'away': as_},
        }}])['results'][0]['id']
    match_ids[key] = existing


def laws(*numbers):
    return [{'_type': 'reference', '_ref': f'law-{n}', '_key': uuid.uuid4().hex[:12]} for n in numbers]


def clip(youtube_id, channel):
    # Start/end left empty on purpose: set them in the Studio with the clip preview.
    return {'_type': 'clip', 'youtubeId': youtube_id, 'channel': channel, 'official': True, 'embedAllowed': False}


INCIDENTS = [
    dict(key='perisic', title='Perišić handball, World Cup final', slug='perisic-world-cup-final-2018', minute=38,
         incidentType='penalty', lawsInvolved=laws(12, 14, 5), originalCall='noPenalty', varRecommendation='penalty',
         recommendationFavours='home', realDelaySeconds=240,
         outcry=dict(level=5,
                     summary="The first VAR decision ever made in a World Cup final. A corner flicked off Matuidi onto Perišić's arm, the referee went to the monitor and gave a penalty, and Croatia's coach and plenty of pundits said a final should never turn on a call like that.",
                     sources=['https://www.espn.com/soccer/report/_/gameId/498139',
                              'https://www.si.com/soccer/2018/07/15/france-world-cup-final-var-referee-controversy-perisic-griezmann-croatia',
                              'https://www.skysports.com/football/news/13950/11438258']),
         clip=clip('0rtw9uCevMg', 'FIFA'),
         fallbackText="38th minute of the 2018 World Cup final, France v Croatia, 1–1. Griezmann's corner glances off Matuidi and hits Ivan Perišić on the arm. The referee gives a goal kick, then walks to the monitor and changes it to a penalty. Griezmann scores, France win 4–2."),
    dict(key='cucurella', title='Cucurella handball, Euro 2024', slug='cucurella-euro-2024',
         incidentType='handball', lawsInvolved=laws(12, 14, 5), originalCall='noPenalty', varRecommendation='noPenalty',
         recommendationFavours='home',
         outcry=dict(level=5,
                     summary="Musiala's shot hit Cucurella's outstretched arm in extra time and nothing was given, not even a monitor review. The hosts went out, and months later UEFA's own referees committee said it should have been a penalty.",
                     sources=['https://global.espn.com/football/story/_/id/41398652/euro-2024-review-says-germany-deserved-penalty-spain',
                              'https://www.insideworldfootball.com/2024/09/24/uefa-referees-committee-says-germany-penalty-euro-quarter-final/',
                              'https://www.beinsports.com/en-us/soccer/uefa-european-championship-3/articles-video/uefa-admits-error-cucurella-s-handball-against-germany-should-have-been-a-penalty-2024-09-23']),
         clip=clip('Fi_QkZfDvA8', 'FOX Soccer'),
         fallbackText="Euro 2024 quarter-final, Spain v Germany, 1–1 in extra time. Jamal Musiala shoots from the edge of the box and the ball hits Marc Cucurella's arm, held away from his body. No penalty, and the VAR does not step in. Spain win 2–1 in the 119th minute."),
    dict(key='japan', title="Japan's goal against Spain: in or out?", slug='japan-spain-world-cup-2022', minute=51,
         incidentType='goalLine', lawsInvolved=laws(9, 10, 5), originalCall='noGoal', varRecommendation='goal',
         recommendationFavours='home',
         outcry=dict(level=5,
                     summary="Every TV angle seemed to show the ball out before Mitoma's cutback, yet VAR said a sliver of it was still over the line. Germany went out on goal difference, and the angle that justified the call was only published the next day.",
                     sources=['https://www.espn.com/soccer/story/_/id/37634475/why-japans-winning-goal-vs-spain-was-awarded-var',
                              'https://www.skysports.com/football/news/11095/12757077']),
         clip=clip('91eoGiLSCgY', 'FIFA'),
         fallbackText="World Cup 2022, Japan v Spain, 51st minute. Kaoru Mitoma hooks the ball back from the byline and Ao Tanaka scores. The on-field call is no goal, ball out. After a long VAR check the goal is given: part of the ball was still over the line. Japan win 2–1 and Germany are eliminated."),
    dict(key='khalilzadeh', title='Khalilzadeh stoppage-time goal ruled out', slug='khalilzadeh-world-cup-2026', minute=93,
         incidentType='offside', lawsInvolved=laws(11, 5), originalCall='goal', varRecommendation='noGoal',
         recommendationFavours='home',
         outcry=dict(level=4,
                     summary="A stoppage-time winner that would have sent Iran through was wiped out for a marginal offside, which one outlet called barely a millimetre. Even the explanations disagree on which player and which defender made it offside.",
                     sources=['https://www.skysports.com/football/news/12309/13556696',
                              'https://www.foxsports.com/stories/soccer/why-irans-late-goal-against-egypt-ruled-out-offside',
                              'https://www.aljazeera.com/sports/2026/6/28/world-cup-2026-most-controversial-var-officiating-decisions-in-group-stage']),
         clip=clip('Dc9rfnTEq0A', 'SuperSport'),
         fallbackText="World Cup 2026, Egypt v Iran, 1–1 in stoppage time. Khalilzadeh scores what looks like Iran's winner and the goal is given. VAR steps in and rules it out for a marginal offside. Egypt reach the knockouts for the first time; Iran are left waiting on other results."),
    dict(key='diaz', title='Luis Díaz goal: "check complete"', slug='luis-diaz-tottenham-liverpool-2023',
         incidentType='offside', lawsInvolved=laws(11, 5), originalCall='noGoal', varRecommendation='noGoal',
         recommendationFavours='home', realDelaySeconds=40,
         outcry=dict(level=5,
                     summary="The VAR could see Díaz was onside but thought the goal had already been given, so he confirmed the flag with 'check complete'. The referees' body admitted a significant human error and published the audio. The control case: VAR was simply wrong.",
                     sources=['https://www.premierleague.com/en/news/3718057',
                              'https://www.skysports.com/football/news/11095/12975648']),
         clip=clip('HUtAjPTsuqs', 'Tottenham Hotspur'),
         fallbackText="Premier League, Tottenham v Liverpool, 0–0 in the first half. Luis Díaz scores but the flag goes up. The VAR sees he is onside, mistakenly believes the goal was given, and says 'check complete'. The goal stays disallowed. Tottenham win 2–1."),
]

for inc in INCIDENTS:
    key = inc.pop('key')
    slug = inc.pop('slug')
    if query('*[_type == "incident" && slug.current == $s][0]._id', s=slug):
        print('exists', slug)
        continue
    doc = {'_id': f'drafts.{uuid.uuid4()}', '_type': 'incident', 'slug': {'_type': 'slug', 'current': slug},
           'match': {'_type': 'reference', '_ref': match_ids[key]}, 'crowdSeed': random.randint(0, 999_999), **inc}
    doc['outcry'] = {'_type': 'outcry', **doc['outcry']}
    mutate([{'create': doc}])
    print('draft', slug)
print('teams', len(team_ids), 'matches', len(match_ids))

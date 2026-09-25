"""Seed teams, matches (published) and the five Premier League incidents (as drafts for review).

Run from repo root: SSL_CERT_FILE=/etc/ssl/cert.pem python3 studio/seed/incidents.py
(python.org Python on macOS ships without CA certs; the macOS bundle fixes it without disabling TLS checks.)
Session 3: switched to an all-Premier-League set, picked by clip clarity. Facts verified in session 3
(see BUILD_LOG.md). Summaries are our own words. Clips were tested in the YouTube IFrame API player.
Idempotent: teams by shortName, matches by teams+date, incidents by slug (existing incidents are patched).
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
    ('Tottenham Hotspur', 'TOT', '#132257'), ('Liverpool', 'LIV', '#C8102E'),
    ('Brighton & Hove Albion', 'BHA', '#0057B8'), ('Manchester United', 'MUN', '#DA291C'),
    ('Everton', 'EVE', '#003399'), ('Newcastle United', 'NEW', '#241F20'), ('Arsenal', 'ARS', '#EF0107'),
    ('West Ham United', 'WHU', '#7A263A'), ('Nottingham Forest', 'NFO', '#DD0000'),
]
team_ids = {}
for name, short, color in TEAMS:
    existing = query('*[_type == "team" && shortName == $s][0]._id', s=short)
    if not existing:
        existing = mutate([{'create': {'_type': 'team', 'name': name, 'shortName': short, 'primaryColor': color}}])['results'][0]['id']
    team_ids[short] = existing

MATCHES = {
    'diaz': ('TOT', 'LIV', 'Premier League 2023/24', '2023-09-30', 'Tottenham Hotspur Stadium, London', 2, 1),
    'maupay': ('BHA', 'MUN', 'Premier League 2020/21', '2020-09-26', 'Amex Stadium, Brighton', 2, 3),
    'pickford': ('EVE', 'LIV', 'Premier League 2020/21', '2020-10-17', 'Goodison Park, Liverpool', 2, 2),
    'gordon': ('NEW', 'ARS', 'Premier League 2023/24', '2023-11-04', "St James' Park, Newcastle", 1, 0),
    'milenkovic': ('WHU', 'NFO', 'Premier League 2024/25', '2025-05-18', 'London Stadium, London', 1, 2),
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
    return [{'_type': 'reference', '_ref': f'law-{n}', '_key': f'law{n}'} for n in numbers]


def clip(youtube_id, channel, start, end):
    # All five embed (IFrame API test, session 3). Windows found with storyboards; fine-tune in the Studio.
    return {'_type': 'clip', 'youtubeId': youtube_id, 'channel': channel, 'startSeconds': start,
            'endSeconds': end, 'official': True, 'embedAllowed': True}


INCIDENTS = [
    dict(key='diaz', title='Luis Díaz goal: "check complete"', slug='luis-diaz-tottenham-liverpool-2023', minute=34,
         incidentType='offside', lawsInvolved=laws(11, 5), originalCall='noGoal', varRecommendation='noGoal', overturnedCall='goal',
         recommendationFavours='home', realDelaySeconds=40, controlCase=True,
         situation="Spurs 0–0 Liverpool, 34'. Díaz scores, flag goes up. VAR: offside stands.",
         outcry=dict(level=5,
                     summary="The VAR could see Díaz was onside but thought the goal had already been given, so he confirmed the flag with 'check complete'. The referees' body admitted a significant human error and published the audio. The control case: VAR was simply wrong.",
                     sources=['https://www.premierleague.com/en/news/3718057',
                              'https://www.skysports.com/football/news/11095/12975648']),
         clip=clip('BnSo_5MTcGY', 'TNT Sports', 18, 48),
         fallbackText="Premier League, Tottenham v Liverpool, 0–0 in the first half. Luis Díaz scores but the flag goes up. The VAR sees he is onside, mistakenly believes the goal was given, and says 'check complete'. The goal stays disallowed. Tottenham win 2–1."),
    dict(key='maupay', title='Penalty after the final whistle', slug='maupay-brighton-man-utd-2020', minute=97,
         incidentType='handball', lawsInvolved=laws(12, 14, 5), originalCall='noPenalty', varRecommendation='penalty', overturnedCall='noPenalty',
         recommendationFavours='away', realDelaySeconds=150,  # estimate: whistle ~97:00 to the kick at 99:45
         situation="Brighton 2–2 Man Utd, 90+7'. Full-time whistle blows. VAR: Maupay handball, penalty after the final whistle.",
         outcry=dict(level=4,
                     summary="Brighton hit the woodwork a record five times, then lost to a penalty given after the referee had already blown for full time. The strict 2020 handball law, which punished an arm hit from close range, was widely mocked, and even United's manager admitted they were lucky.",
                     sources=['https://www.skysports.com/football/news/11667/12082485/manchester-united-penalty-drama-why-bruno-fernandes-goal-after-final-whistle-stood',
                              'https://www.espn.com/soccer/story/_/id/37587671/how-did-man-united-bruno-fernandes-score-winner-vs-brighton-full-whistle-was-blown',
                              'https://www.planetfootball.com/nostalgia/manchester-united-scoring-winner-against-brighton-after-full-time-whistle-had-blown']),
         clip=clip('_2t489AY06k', 'TNT Sports', 134, 164),
         fallbackText="Premier League, Brighton v Manchester United, 2–2 deep in stoppage time. Maguire's header hits Maupay's arm and the referee blows for full time. VAR calls him to the monitor after the whistle, and he awards a penalty. Fernandes scores it in the 100th minute."),
    dict(key='pickford', title='Pickford on Van Dijk: offside only', slug='pickford-van-dijk-everton-liverpool-2020', minute=6,
         incidentType='redCard', lawsInvolved=laws(11, 12), originalCall='noPenalty', varRecommendation='noFoul', overturnedCall='redCard',
         recommendationFavours='home', realDelaySeconds=60,  # estimate: routine offside check, no official figure
         situation="Everton 0–0 Liverpool, 6'. Pickford wipes out Van Dijk. VAR: offside, no foul, no card.",
         outcry=dict(level=5,
                     summary="Van Dijk's knee was wrecked and he missed most of the season, yet Pickford got no card and no retrospective ban because VAR only checked the offside. Liverpool demanded an explanation, and the referee later conceded Pickford should have been sent off.",
                     sources=['https://www.nbcsports.com/soccer/news/pickford-van-dijk-var-pgmol-statement',
                              'https://www.skysports.com/football/news/12108209/jordan-pickfords-avoids-disciplinary-action-for-virgil-van-dijk-challenge',
                              'https://www.goal.com/en/news/premier-league-referee-oliver-admits-pickford-should-have-been-punished-for-van-dijk-injury/1ouqr8tc0w0ov1vp58poevdlhp']),
         clip=clip('6XQJSG-IWLU', 'TNT Sports', 64, 94),
         fallbackText="Premier League, Everton v Liverpool, early in a Merseyside derby. Pickford lunges knee-high at Van Dijk in the box and misses the ball entirely. The flag goes up for offside and VAR checks only that. No penalty and no card, and Van Dijk is out for the season."),
    dict(key='gordon', title='Gordon goal: three checks, one verdict', slug='gordon-newcastle-arsenal-2023', minute=64,
         incidentType='goalLine', lawsInvolved=laws(9, 11, 12), originalCall='goal', varRecommendation='goal', overturnedCall='noGoal',
         recommendationFavours='home', realDelaySeconds=246,
         situation="Newcastle 0–0 Arsenal, 64'. Gordon taps in: ball out? offside? push? VAR: goal stands.",
         outcry=dict(level=5,
                     summary="Arsenal's manager called it embarrassing and the club backed him with a statement. Pundits split on the Joelinton push, and no camera angle could settle whether the ball had gone out or Gordon was offside. The review panel later backed the goal 4–1.",
                     sources=['https://global.espn.com/football/story/_/id/38799451/the-var-review-newcastle-goal-guimaraes-red-vs-arsenal',
                              'https://www.skysports.com/football/news/11095/13001879/ref-watch-anthony-gordons-goal-for-newcastle-against-arsenal-should-have-been-ruled-out-for-joelinton-push-says-dermot-gallagher',
                              'https://www.espn.com/soccer/story/_/id/38854734/panel-says-newcastle-goal-vs-arsenal-was-correct-decision']),
         clip=clip('9nSgsgq46aI', 'The Telegraph', 120, 150),
         fallbackText="Premier League, Newcastle v Arsenal, 0–0 in the second half. Willock keeps the ball in near the byline, Joelinton tangles with Gabriel, and Gordon taps in from the goal line. VAR checks ball out, offside and a push, over four minutes. The goal stands and Arsenal lose their unbeaten start."),
    dict(key='milenkovic', title='The 374-second offside check', slug='milenkovic-west-ham-forest-2025', minute=61,
         incidentType='offside', lawsInvolved=laws(11), originalCall='goal', varRecommendation='goal', overturnedCall='noGoal',
         recommendationFavours='away', realDelaySeconds=374,
         situation="West Ham 0–1 Forest, 61'. Milenkovic scores, offside check. 6 min 14 s later, VAR: goal stands.",
         outcry=dict(level=3,
                     summary="The longest VAR check in Premier League history. Players were bunched so tightly that the semi-automated system couldn't draw the lines, and the VAR's headset failed on top of it. People mocked the wait far more than the decision.",
                     sources=['https://global.espn.com/football/story/_/id/45143984/the-var-review-west-ham-nottingham-forest-longest-ever-delay',
                              'https://www.premierleague.com/en/news/4309261',
                              'https://www.whufc.com/news/match-report-forest-ruin-west-hams-home-finale']),
         clip=clip('fawYYhtE1yg', 'West Ham United', 60, 90),
         fallbackText="Premier League, West Ham v Nottingham Forest, Forest 1–0 up early in the second half. Milenkovic scores from a free kick, but a teammate may be offside. The technology can't draw the lines and the VAR's headset fails, so the check runs over six minutes. The goal stands."),
]

for inc in INCIDENTS:
    key = inc.pop('key')
    slug = inc.pop('slug')
    inc['outcry'] = {'_type': 'outcry', **inc['outcry']}
    fields = {'match': {'_type': 'reference', '_ref': match_ids[key]}, **inc}
    existing = query('*[_type == "incident" && slug.current == $s][0]._id', s=slug)
    if existing:
        mutate([{'patch': {'id': existing, 'set': fields}}])
        print('patched', slug)
        continue
    doc = {'_id': f'drafts.{uuid.uuid4()}', '_type': 'incident', 'slug': {'_type': 'slug', 'current': slug},
           'crowdSeed': random.randint(0, 999_999), **fields}
    mutate([{'create': doc}])
    print('draft', slug)
print('teams', len(team_ids), 'matches', len(match_ids))

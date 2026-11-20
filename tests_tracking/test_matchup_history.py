import gzip
import hashlib
import json
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from maintenance_nba.matchup_history import connect, integrate, local_games, parse, plan, store_game


class MatchupHistory(unittest.TestCase):
    gid = '0022500569'
    day = '2026-01-13'

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.manifest = {'format': 1, 'id': 'fixture', 'parts': {}}
        self.game = {'id': self.gid, 'date': self.day, 'season': '2025-26', 'teams': {'LAL','ATL'},
                     'expected': {1629029:'LAL', 1630552:'ATL'}}

    def save(self, directory, name, rows):
        data = gzip.compress(json.dumps(rows).encode(), mtime=0)
        path = directory / name / (hashlib.sha256(data).hexdigest() + '.json.gz')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return {'path': str(path.relative_to(directory)), 'bytes': len(data),
                'sha256': hashlib.sha256(data).hexdigest(), 'rows': len(rows)}

    def write(self, key, rows):
        self.manifest['parts'][key] = self.save(self.root,key,rows)
        (self.root/'manifest.json').write_text(json.dumps(self.manifest))

    def source(self):
        stats = dict(matchupMinutes='2:00', matchupMinutesSort=120, partialPossessions=6.5, playerPoints=5,
                     matchupFieldGoalsMade=2, matchupFieldGoalsAttempted=4,
                     matchupThreePointersMade=1, matchupThreePointersAttempted=2)
        def team(tid, code, player, other):
            return dict(teamId=tid,teamTricode=code,players=[dict(personId=player,firstName=code, familyName='QA',
                        position='G',matchups=[dict(personId=other,statistics=dict(stats))])])
        return {'boxScoreMatchups': dict(gameId=self.gid, homeTeamId=1, awayTeamId=2,
                 homeTeam=team(1,'LAL',1629029,1630552),awayTeam=team(2,'ATL',1630552,1629029))}

    def test_cutoff_and_existing_coverage(self):
        self.write('facts/1629029',[dict(player_id=1629029,game_id=self.gid.lstrip('0'),game_date=self.day,
                                       team_abbreviation='LAL',opponent_abbr='ATL',min=35)])
        self.write('matchups/1629029/2025-26',parse(self.source(), self.game)[:1])
        _, games, _ = plan(self.root, {'2025-26'}, '2026-11-09', 1629029, 'ATL')
        self.assertEqual(games[0]['archived'], {1629029})
        self.assertEqual(plan(self.root, {'2025-26'}, self.day, 1629029, 'ATL')[1], [])
        self.assertEqual(plan(self.root, {'2025-26'}, '2026-11-09', 1629029, 'BOS')[1], [])

    def test_resume_and_merge_without_overwriting(self):
        rows = parse(self.source(), self.game)
        path = self.root/'local.sqlite'
        with closing(connect(path)) as db:
            store_game(db,self.game,rows)
        self.assertEqual(local_games(path), ({self.gid}, {self.gid:{1629029,1630552}}))
        key = 'matchups/1629029/2025-26'
        self.write(key, [{**rows[0], 'game_id':self.gid.lstrip('0'), 'player_points':3, 'defensive_position':''}])
        def read(directory, meta):
            return json.loads(gzip.decompress((directory/meta['path']).read_bytes()))
        def identity(_, row):
            return (row['offensive_player_id'], row['defensive_player_id'], int(row['game_id']))
        self.assertEqual(integrate(path,self.root,self.manifest,read,self.save,identity), 2)
        self.assertEqual(integrate(path,self.root,self.manifest,read,self.save,identity), 0)
        merged = read(self.root, self.manifest['parts'][key])
        self.assertEqual(len(merged),1)
        self.assertEqual(merged[0]['player_points'],3)
        self.assertEqual(merged[0]['defensive_position'],'G')

    def test_wrong_fixture_rejected(self):
        raw = self.source()
        raw['boxScoreMatchups']['gameId'] = '0022500568'
        with self.assertRaisesRegex(ValueError,'otro partido'):
            parse(raw,self.game)
        raw = self.source()
        raw['boxScoreMatchups']['awayTeam']['players'][0]['matchups'] = []
        with self.assertRaisesRegex(ValueError,'ambos equipos'):
            parse(raw,self.game)
        raw = self.source()
        raw['boxScoreMatchups']['homeTeam']['players'][0]['matchups'][0]['statistics']['matchupThreePointersAttempted'] = 10
        with self.assertRaisesRegex(ValueError,'incompatibles'):
            parse(raw,self.game)


if __name__ == '__main__':
    unittest.main()

import json
from pathlib import Path
import tempfile
import unittest

from maintenance_nba.rotation_pilot import (
    Unverified, archive_parts, period_candidates, reconstruct, save_snapshot, solve,
)

ID='0022600100'
DAY='2026-10-29'


def fixture(overtime=False):
    def person(pid, starter, minutes):
        return {'personId':pid,'starter':int(starter),'played':int(minutes>0),'name':f'Jugador {pid}',
                'statistics':{'minutes':f'PT{minutes}M00.00S'}}
    plus=5 if overtime else 0
    home=[person(pid,pid<=5,(42+plus if pid<=2 else 48+plus) if pid<=5 else 6 if pid<=7 else 0) for pid in range(1,9)]
    away=[person(pid,True,48+plus) for pid in range(21,26)]
    game={'gameId':ID,'gameStatus':3,'gameEt':DAY,'period':5 if overtime else 4,
          'homeTeam':{'teamId':100,'teamTricode':'BOS','players':home},'awayTeam':{'teamId':200,'teamTricode':'LAL','players':away}}
    actions=[]
    def event(period,clock,typ,sub='',team=0,pid=0):
        actions.append({'actionNumber':len(actions)+1,'period':period,'clock':clock,'actionType':typ,'subType':sub,'teamId':team,'personId':pid})
    for p in range(1,game['period']+1):
        event(p,'PT05M00S' if p==5 else 'PT12M00S','period','start')
        if p==1:
            for sub,pid in [('out',1),('out',2),('in',6),('in',7)]:
                event(p,'PT06M00S','substitution',sub,100,pid)
        else:
            for pid in range(1,6):
                event(p,'PT04M00S','2pt',team=100,pid=pid)
        event(p,'PT00M00S','period','end')
    return {'game':game},{'game':{'gameId':ID,'actions':actions}}


class Pilot(unittest.TestCase):
    def test_same_clock_and_overtime(self):
        r=reconstruct(ID,DAY,*fixture(True))
        self.assertFalse(r['rejected'])
        self.assertEqual(r['players']['1']['playedMs'],47*60000)
        self.assertEqual(r['players']['1']['spans'][0],[1,0,360000])
        self.assertEqual(r['players']['6']['spans'],[[1,360000,720000]])
        self.assertEqual(r['players']['8']['spans'],[])
        self.assertEqual(r['players']['21']['spans'][-1],[5,0,300000])

    def test_box_disagreement_preserves_other_team(self):
        b,p=fixture()
        b['game']['homeTeam']['players'][0]['statistics']['minutes']='PT43M00S'
        r=reconstruct(ID,DAY,b,p)
        self.assertIn('BOS',r['rejected'])
        self.assertEqual({x['team'] for x in r['players'].values()},{'LAL'})

    def test_incomplete_period_and_not_final(self):
        b,p=fixture()
        p['game']['actions'].pop()
        with self.assertRaisesRegex(Unverified,'PERIODO_INCOMPLETO_Q4'):
            reconstruct(ID,DAY,b,p)
        b['game']['gameStatus']=2
        with self.assertRaisesRegex(Unverified,'NO_FINALIZADO'):
            reconstruct(ID,DAY,b,p)

    def test_identity_mismatch(self):
        b,p=fixture()
        p['game']['gameId']='0022600999'
        with self.assertRaisesRegex(Unverified,'ID_DE_FUENTE_DISTINTO'):
            reconstruct(ID,DAY,b,p)

    def test_ambiguous_period_order_is_rejected(self):
        people={pid:{'played':True,'starter':pid<=5,'box':1440000 if pid<=4 else 720000} for pid in range(1,7)}
        both=period_candidates([(0,'actor',pid) for pid in range(1,5)],people,2)
        with self.assertRaisesRegex(Unverified,'ROTACION_NO_UNICA'):
            solve([both,both],people)

    def test_snapshot_does_not_remove_previous_players(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp)/'rotation-pilot'
            folder=state/'games';folder.mkdir(parents=True)
            result=reconstruct(ID,DAY,*fixture())
            (folder/f'{ID}.json').write_text(json.dumps(result))
            save_snapshot(state)
            old={**result['players']['1'],'gameId':'0022600090'}
            manifest={'parts':{'rotations/1':[old],'rotations/777':[],'facts/1':['keep']}}
            archive_parts(Path(tmp),Path(tmp),manifest,lambda d,k,v:v,lambda d,v:v)
            self.assertEqual({r['gameId'] for r in manifest['parts']['rotations/1']},{ID,'0022600090'})
            self.assertIn('rotations/777',manifest['parts'])
            self.assertEqual(manifest['parts']['facts/1'],['keep'])


if __name__=='__main__':
    unittest.main()

import assert from 'node:assert/strict';
import { canonicalOddsPlayerName, oddsPlayerNameCandidates, matchesOddsPlayer } from '../lib/oddsPlayerNames.ts';
const examples=[
 ['Castle, Stephon','Stephon Castle','castle stephon'],
 ['Towns, Karl-Anthony','Karl-Anthony Towns','towns karl anthony'],
 ['Gilgeous-Alexander, Shai','Shai Gilgeous-Alexander','gilgeous alexander shai'],
 ['de la Cruz, Juan Carlos','Juan Carlos de la Cruz','de la cruz juan carlos'],
 ['Trent Jr., Gary','Gary Trent Jr.','trent jr gary'],
 ['Trent, Gary, Jr.','Gary Trent Jr.','trent gary jr'],
 ["Fox, De’Aaron","De'Aaron Fox",'fox deaaron'],
 ['Jokić, Nikola','Nikola Jokic','jokic nikola'],
];
for(const [display,target,stored] of examples){
 assert.equal(canonicalOddsPlayerName(display),canonicalOddsPlayerName(target),display);
 assert(matchesOddsPlayer(display,stored,target),display);
 // Las particiones habituales de apellido/nombre se consultan por player_norm.
 assert(oddsPlayerNameCandidates(target).includes(stored),stored);
}
assert.equal(canonicalOddsPlayerName('Gary Trent, Jr.'),'gary trent jr');
assert(matchesOddsPlayer('Stephon Castle','stephon castle','Stephon Castle'));
assert(matchesOddsPlayer(null,'stephon castle','Stephon Castle'));
assert.equal(matchesOddsPlayer('Castle Stephon','castle stephon','Stephon Castle'),false);
assert.equal(matchesOddsPlayer(null,'castle stephon','Stephon Castle'),false);
assert.equal(matchesOddsPlayer('Williams, Jaylin','williams jaylin','Jalen Williams'),false);
assert.equal(matchesOddsPlayer('Castle, Stephon','castle stephon','Stephen Castle'),false);
assert.equal(matchesOddsPlayer('','',''),false);
assert.deepEqual(oddsPlayerNameCandidates(''),[]);
assert.deepEqual(oddsPlayerNameCandidates('Stephon Castle'),['stephon castle','castle stephon']);
console.log('OK: Castle, nombre/apellido, apellidos compuestos, sufijos, acentos y rechazo de jugadores distintos.');

<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$host = "127.0.0.1"; $port = "5432"; $dbname = "nba_db"; $user = "alfedo"; $password = "Kako121023";
$dbconn = pg_connect("host=$host port=$port dbname=$dbname user=$user password=$password");

// Ahora usamos DISTINCT ON (player_id, game_date) para asegurarnos de que no haya partidos repetidos el mismo día
$sql = "WITH UniqueGames AS (
            SELECT DISTINCT ON (player_id, game_date) player_id, player_name, team_abbreviation, CAST(pts AS numeric) as pts, game_date
            FROM player_game_logs
            ORDER BY player_id, game_date DESC
        ),
        RankedGames AS (
            SELECT player_id, player_name, team_abbreviation, pts,
                   ROW_NUMBER() OVER(PARTITION BY player_id ORDER BY game_date DESC) as rn
            FROM UniqueGames
        )
        SELECT player_id as id, MAX(player_name) as name, MAX(team_abbreviation) as team, ROUND(AVG(pts), 1) as avg_pts
        FROM RankedGames
        WHERE rn <= 5
        GROUP BY player_id
        HAVING COUNT(pts) = 5 
        ORDER BY avg_pts DESC
        LIMIT 4";

$res = pg_query($dbconn, $sql);

if (!$res) { echo json_encode([]); exit; }

$trending = [];
$rows = pg_fetch_all($res);

if ($rows) {
    foreach ($rows as $row) {
        $cleanName = str_replace(',', '', trim($row['name']));
        $nameParts = explode(' ', $cleanName, 2);
        $trending[] = [
            'id' => $row['id'],
            'first_name' => $nameParts[0],
            'last_name' => isset($nameParts[1]) ? $nameParts[1] : '',
            'team' => $row['team'],
            'avg_pts' => $row['avg_pts']
        ];
    }
}
echo json_encode($trending);
pg_close($dbconn);
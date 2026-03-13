<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$host = "127.0.0.1"; $port = "5432"; $dbname = "nba_db"; $user = "alfedo"; $password = "Kako121023";
$dbconn = pg_connect("host=$host port=$port dbname=$dbname user=$user password=$password");

$team = $_GET['team'] ?? '';

if (!$team) {
    echo json_encode([]);
    exit;
}

// BÚSQUEDA BLINDADA 2.0: 
// Buscamos directamente en los registros de partidos. 
// Si jugó para este equipo, existe. Punto.
$query = "SELECT DISTINCT player_id as id, player_name 
          FROM player_game_logs 
          WHERE team_abbreviation = $1";

$res = pg_query_params($dbconn, $query, array($team));

$players = [];
if ($res) {
    $rows = pg_fetch_all($res);
    if ($rows) {
        foreach ($rows as $row) {
            // Separamos "LeBron James" en "LeBron" y "James" para que el frontend no se rompa
            $nameParts = explode(' ', trim($row['player_name']), 2);
            $firstName = $nameParts[0];
            $lastName = isset($nameParts[1]) ? $nameParts[1] : '';

            $players[] = [
                'id' => $row['id'],
                'first_name' => $firstName,
                'last_name' => $lastName
            ];
        }
    }
}

// Ordenamos alfabéticamente para que quede prolijo
usort($players, function($a, $b) {
    return strcmp($a['first_name'], $b['first_name']);
});

echo json_encode($players);
pg_close($dbconn);
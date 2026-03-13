<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Llamamos al archivo secreto
require_once 'config.php';

try {
    // 1. Abrimos la conexión con PDO usando las variables seguras
    $pdo = new PDO("pgsql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 2. LA MAGIA SQL CORREGIDA (Casteamos AVG a numeric y usamos player_id)
    $sql = "
        WITH LastGames AS (
            SELECT 
                player_name, 
                player_id,
                team_abbreviation as team,
                pts,
                ROW_NUMBER() OVER(PARTITION BY player_id ORDER BY game_date DESC) as rn
            FROM player_game_logs
        ),
        PlayerStats AS (
            SELECT 
                MAX(player_name) as player_name, 
                player_id,
                MAX(team) as team,
                ROUND(AVG(pts)::numeric, 1) as avg_last_10,
                COUNT(pts) as games_played
            FROM LastGames
            WHERE rn <= 10
            GROUP BY player_id
        )
        SELECT 
            o.player_name,
            ps.player_id,
            ps.team,
            o.line,
            o.over_price,
            o.matchup,
            ps.avg_last_10,
            (SELECT COUNT(*) FROM LastGames l WHERE l.player_id = ps.player_id AND l.rn <= 10 AND l.pts > o.line) as over_hits
        FROM player_odds o
        JOIN PlayerStats ps ON LOWER(o.player_name) = LOWER(ps.player_name)
        WHERE ps.games_played >= 5 
          AND (SELECT COUNT(*) FROM LastGames l WHERE l.player_id = ps.player_id AND l.rn <= 10 AND l.pts > o.line) >= 7
        ORDER BY over_hits DESC, (ps.avg_last_10 - o.line) DESC
        LIMIT 8;
    ";

    $stmt = $pdo->query($sql);
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['data' => $results]);

} catch (PDOException $e) {
    http_response_code(500);
    // Ahora PHP enviará el error exacto de SQL para que sepamos qué pasó
    echo json_encode(['error' => 'SQL Error: ' . $e->getMessage()]);
}
?>
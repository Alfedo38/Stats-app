<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// Llamamos al archivo secreto
require_once 'config.php';

try {
    // 1. Abrimos la conexión con PDO usando las variables seguras
    $pdo = new PDO("pgsql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $playerId = $_GET['playerId'] ?? '';

    if (!is_numeric($playerId)) {
        echo json_encode(["status" => "error", "player" => null, "stats" => []]);
        exit;
    }

    // 1. Buscamos al jugador en la tabla 'players' (Plan A) usando consultas preparadas
    $stmtP = $pdo->prepare("SELECT * FROM players WHERE id = ?");
    $stmtP->execute([$playerId]);
    $player = $stmtP->fetch(PDO::FETCH_ASSOC);

    // 2. EL SALVAVIDAS (Plan B): Si no está en 'players', sacamos su nombre de 'player_game_logs'
    if (!$player) {
        $stmtLog = $pdo->prepare("SELECT player_name FROM player_game_logs WHERE player_id = ? LIMIT 1");
        $stmtLog->execute([$playerId]);
        $logPlayer = $stmtLog->fetch(PDO::FETCH_ASSOC);
        
        if ($logPlayer) {
            $nameParts = explode(' ', trim($logPlayer['player_name']), 2);
            $player = [
                'id' => $playerId,
                'first_name' => $nameParts[0],
                'last_name' => isset($nameParts[1]) ? $nameParts[1] : ''
            ];
        }
    }

    $stats = [];

    if ($player) {
        // 3. Buscamos las estadísticas usando directamente el ID numérico
        $queryStats = "SELECT 
                        pts, reb, ast, stl, blk, tov, pf, fgm, fga, fg3m, fg3a, min, wl,
                        opponent_abbr as opp, game_date as date, matchup 
                       FROM player_game_logs 
                       WHERE player_id = ?
                       ORDER BY game_date DESC LIMIT 40";
        
        $stmtS = $pdo->prepare($queryStats);
        $stmtS->execute([$playerId]);
        $stats = $stmtS->fetchAll(PDO::FETCH_ASSOC);
    }

    // 4. FILTRO ANTI-DUPLICADOS (Para no tener 2 partidos el mismo día)
    $cleanStats = [];
    $seenDates = [];

    if ($stats) {
        foreach ($stats as $s) {
            $date = $s['date'];
            if (!in_array($date, $seenDates)) {
                $cleanStats[] = $s;
                $seenDates[] = $date;
            }
            // Devolvemos 20 únicos
            if (count($cleanStats) >= 20) break;
        }
    }

    echo json_encode([
        "status" => "success",
        "player" => $player,
        "stats" => $cleanStats ? array_reverse($cleanStats) : []
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "status" => "error", 
        "error" => "Error de base de datos: " . $e->getMessage()
    ]);
}
// La conexión se cierra automáticamente
?>
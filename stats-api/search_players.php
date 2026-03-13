<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

require_once 'config.php';

try {
    $pdo = new PDO("pgsql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $query = $_GET['q'] ?? '';

    // Si escribes menos de 2 letras, no busca
    if (strlen($query) < 2) {
        echo json_encode([]);
        exit;
    }

    $sql = "SELECT DISTINCT player_id as id, player_name 
            FROM player_game_logs 
            WHERE player_name ILIKE ? 
            ORDER BY player_name ASC 
            LIMIT 6";

    $stmt = $pdo->prepare($sql);
    // Le pasamos el parámetro con los comodines % para el ILIKE
    $stmt->execute(["%" . $query . "%"]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $players = [];
    if ($rows) {
        foreach ($rows as $row) {
            $cleanName = str_replace(',', '', trim($row['player_name']));
            $nameParts = explode(' ', $cleanName, 2);
            
            $players[] = [
                'id' => $row['id'],
                'first_name' => $nameParts[0],
                'last_name' => isset($nameParts[1]) ? $nameParts[1] : ''
            ];
        }
    }

    echo json_encode($players);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}
?>
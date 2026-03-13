<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

require_once 'config.php';

try {
    $pdo = new PDO("pgsql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $teamAbbr = strtoupper($_GET['teamId'] ?? '');

    // Buscamos a TODOS los jugadores cuyo team_id coincida con la abreviatura
    $query = "SELECT p.* FROM players p 
              JOIN teams t ON p.team_id = t.id 
              WHERE t.abbreviation = ? 
              ORDER BY p.first_name ASC";

    $stmt = $pdo->prepare($query);
    $stmt->execute([$teamAbbr]);
    $players = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "status" => "success", 
        "data" => $players ? $players : []
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "error" => $e->getMessage()]);
}
?>
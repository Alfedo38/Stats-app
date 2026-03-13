<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Llamamos al archivo secreto
require_once 'config.php';

try {
    // 1. Abrimos la conexión con PDO usando las variables seguras
    $pdo = new PDO("pgsql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 2. Magia SQL: Dame las 5 fechas ÚNICAS más recientes ordenadas de mayor a menor
    $sql = "SELECT DISTINCT game_date 
            FROM player_game_logs 
            ORDER BY game_date DESC 
            LIMIT 5";

    // 3. Ejecutamos la consulta usando los métodos de PDO
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $fechas = [];
    if ($rows) {
        foreach ($rows as $row) {
            $fechas[] = $row['game_date'];
        }
    }

    // 4. Imprimimos el resultado
    echo json_encode([
        "mensaje" => "Estas son las fechas de los ultimos partidos en tu BD:",
        "ultimas_fechas" => $fechas
    ]);

} catch (PDOException $e) {
    // 5. Si algo falla (ej. contraseña incorrecta), lo atrapamos aquí
    http_response_code(500);
    echo json_encode(["error" => "Error de conexión o consulta: " . $e->getMessage()]);
}

// Nota: Con PDO no necesitas usar pg_close(). 
// La conexión se cierra sola automáticamente cuando termina de ejecutarse el script.
?>
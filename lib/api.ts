// lib/api.ts
const BASE_URL = 'http://127.0.0.1:8000';

export async function getTeams() {
  const res = await fetch(`${BASE_URL}/get_teams.php`, { cache: 'no-store' });
  const result = await res.json();
  return result.data || [];
}

export async function getRoster(teamId: string) {
  const res = await fetch(`${BASE_URL}/get_roster.php?teamId=${teamId}`, { cache: 'no-store' });
  const result = await res.json();
  return result.data || [];
}

export async function getPlayerData(playerId: string) {
  try {
    // Agregamos { cache: 'no-store' } para que siempre le pida a PHP lo más nuevo de Marzo
    const res = await fetch(`${BASE_URL}/get_player_details.php?playerId=${playerId}`, { cache: 'no-store' });
    
    if (!res.ok) throw new Error('Error al obtener datos del jugador');
    return await res.json();
  } catch (error) {
    console.error("Error:", error);
    return { player: null, stats: [] };
  }
}
export async function getTeamPlayers(teamAbbr: string) {
  try {
    // Reemplaza "http://localhost/tu-carpeta-php" con la ruta real que usas en tus otras funciones
    const res = await fetch(`${BASE_URL}/get_team_players.php?team=${teamAbbr}`);
    
    if (!res.ok) throw new Error('Error en la red');
    return await res.json();
  } catch (error) {
    console.error("Error cargando los jugadores del equipo:", error);
    return [];
  }
}
export async function getTrendingPlayers() {
  try {
    // Le decimos a Next.js: "¡PROHIBIDO GUARDAR EN CACHÉ! Pregúntale siempre a PHP"
    const res = await fetch(`${BASE_URL}/get_trending_players.php`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Error fetching trending players');
    return await res.json();
  } catch (error) {
    console.error("Error:", error);
    return [];
  }
}
export async function getEvPlays() {
  try {
    const res = await fetch(`${BASE_URL}/get_ev_plays.php`, { cache: 'no-store' });
    
    // Si PHP responde con error 500, capturamos el texto exacto
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Error desconocido en PHP');
    }
    
    const result = await res.json();
    return result.data || [];
  } catch (error) {
    // Esto lo imprimirá en tu terminal de Next.js
    console.error("🔥 Error en getEvPlays:", error);
    return [];
  }
}
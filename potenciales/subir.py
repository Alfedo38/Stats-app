import pandas as pd
import numpy as np

print("Cargando bases de datos...")
# 1. Cargar tu archivo maestro
df_logs = pd.read_csv("player_game_log.csv")

# 2. Cargar el tesoro de datos que scrapeaste
df_potenciales = pd.read_csv("asistencias_potenciales_nba_2025_26.csv")

print("Normalizando fechas para hacer el cruce perfecto...")
# 3. Estandarizamos las fechas en una columna temporal llamada 'fecha_cruce'
# Convierte '2026-04-29' de tu archivo a formato fecha de Pandas
df_logs['fecha_cruce'] = pd.to_datetime(df_logs['game_date'])

# Convierte '05/10/2026' del scrapeo a formato fecha de Pandas
df_potenciales['fecha_cruce'] = pd.to_datetime(df_potenciales['FECHA'])

print("Cruzando estadísticas...")
# 4. Hacemos el MERGE buscando coincidencias exactas de nombre y fecha
df_merged = pd.merge(
    df_logs, 
    df_potenciales[['PLAYER_NAME', 'fecha_cruce', 'POTENTIAL_AST']], 
    left_on=['player_name', 'fecha_cruce'], 
    right_on=['PLAYER_NAME', 'fecha_cruce'], 
    how='left'
)

# 5. La magia de actualización:
# Si encontramos un número nuevo en POTENTIAL_AST, lo usamos. 
# Si está vacío (no hay datos ese día), dejamos el 'potential_ast' que ya tenías.
df_merged['potential_ast'] = np.where(
    df_merged['POTENTIAL_AST'].notna(), 
    df_merged['POTENTIAL_AST'], 
    df_merged['potential_ast']
)

# 6. Limpiamos la basura: Borramos las columnas temporales que creamos
df_merged = df_merged.drop(columns=['fecha_cruce', 'PLAYER_NAME', 'POTENTIAL_AST'])

# 7. Guardamos el resultado
archivo_final = "player_game_log_ACTUALIZADO.csv"
df_merged.to_csv(archivo_final, index=False)

# Mostrar resumen
print(f"\n✅ ¡Trabajo terminado! Se generó el archivo '{archivo_final}'")
registros_antes = df_logs['potential_ast'].notna().sum()
registros_despues = df_merged['potential_ast'].notna().sum()

print(f"-> Registros con asistencias potenciales originales: {registros_antes}")
print(f"-> Registros con asistencias potenciales actualizados: {registros_despues}")
print(f"🔥 ¡Agregaste {registros_despues - registros_antes} datos nuevos de tracking a tu base!")
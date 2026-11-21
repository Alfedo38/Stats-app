#!/usr/bin/env bash
set -euo pipefail
project_nba=${1:-"$HOME/stats-app"}
systemd_nba=${2:-"${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"}
here_nba="$(dirname -- "${BASH_SOURCE[0]}")"
queue_nba="$project_nba/maintenance_nba/assist_release_v25/daily.py"
target_nba="$systemd_nba/nba-maint-archive-only.service"
template_nba="$here_nba/nba-maint-archive-only.service"

if ! grep -qF 'NBA_ASSIST_DAILY_V25' "$project_nba/maintenance_nba/archive.py" ||
   ! grep -Eq '^PUBLISH_UNIT = "nba-maint-(publish|archive-only)\.service"$' "$queue_nba" ||
   [[ ! -x "$project_nba/.venv-maintenance/bin/python" ]]; then
  printf '%s\n' 'No encontré la instalación esperada de asistencias. No se hicieron cambios.' >&2
  exit 1
fi
if [[ "$project_nba" != "$HOME/stats-app" ]]; then
  printf '%s\n' 'La unidad de este paquete requiere que Stats-app esté en $HOME/stats-app.' >&2
  exit 1
fi
mkdir -p -- "$systemd_nba"
if [[ -e "$target_nba" || -L "$target_nba" ]]; then
  if [[ -L "$target_nba" ]] || ! cmp -s -- "$template_nba" "$target_nba"; then
    printf '%s\n' 'Ya existe otra unidad nba-maint-archive-only.service. No se reemplazó.' >&2
    exit 1
  fi
else
  install -m 0644 -- "$template_nba" "$target_nba"
fi
systemctl --user daemon-reload
test "$(systemctl --user show --value -p LoadState nba-maint-archive-only.service)" = loaded
if grep -qxF 'PUBLISH_UNIT = "nba-maint-publish.service"' "$queue_nba"; then
  if [[ ! -e "$queue_nba.antes-archivo-only" ]]; then
    cp -p -- "$queue_nba" "$queue_nba.antes-archivo-only"
  fi
  sed -i 's/^PUBLISH_UNIT = "nba-maint-publish\.service"$/PUBLISH_UNIT = "nba-maint-archive-only.service"/' "$queue_nba"
fi
grep -qxF 'PUBLISH_UNIT = "nba-maint-archive-only.service"' "$queue_nba"
if [[ "$(systemctl --user show --value -p SubState nba-maint-publish.service)" = auto-restart ]]; then
  systemctl --user stop nba-maint-publish.service
fi
systemctl --user start --no-block nba-maint-archive-only.service
printf '%s\n' 'Publicación de estadísticas encolada. El mantenimiento diario usará este servicio.'

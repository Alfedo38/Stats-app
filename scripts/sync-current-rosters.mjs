import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const here = dirname(fileURLToPath(import.meta.url));
const snapshotPath = resolve(here, "../data/nba_rosters_2026_27.json");
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const prisma = new PrismaClient();

function splitName(fullName) {
  const [firstName = "", ...rest] = String(fullName || "").trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

function jerseyNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number.parseInt(String(value), 10);
  return Number.isFinite(number) ? number : null;
}

try {
  let synced = 0;

  for (const roster of snapshot.teams) {
    let team = await prisma.teams.findFirst({
      where: { abbreviation: roster.team_abbreviation },
    });

    if (team) {
      team = await prisma.teams.update({
        where: { id: team.id },
        data: { api_id: roster.team_id },
      });
    } else {
      team = await prisma.teams.create({
        data: {
          api_id: roster.team_id,
          abbreviation: roster.team_abbreviation,
          name: roster.team_abbreviation,
        },
      });
    }

    for (const player of roster.players) {
      const { firstName, lastName } = splitName(player.full_name);
      await prisma.players.upsert({
        where: { id: player.player_id },
        create: {
          id: player.player_id,
          api_id: player.player_id,
          team_id: team.id,
          first_name: firstName,
          last_name: lastName,
          full_name: player.full_name,
          jersey_number: jerseyNumber(player.jersey_number),
          position: player.position,
          image_url: null,
        },
        update: {
          api_id: player.player_id,
          team_id: team.id,
          first_name: firstName,
          last_name: lastName,
          full_name: player.full_name,
          jersey_number: jerseyNumber(player.jersey_number),
          position: player.position,
          image_url: null,
        },
      });
      synced += 1;
    }
  }

  console.log(
    `Rosters ${snapshot.season}: ${synced} jugadores de ${snapshot.teams.length} equipos sincronizados (${snapshot.snapshot_date}).`,
  );
} finally {
  await prisma.$disconnect();
}

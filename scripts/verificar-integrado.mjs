import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const script of ['verificar-triples','verificar-fuente-pro','verificar-nba-pro','verificar-analisis-pro','verificar-render-pro','verificar-api-pro','verificar-filtros-nba','verificar-api-filtros']){
 const result=spawnSync(process.execPath,[`scripts/${script}.mjs`],{cwd:root,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
console.log('Pruebas de integración OK. Completar npm run lint y npm run build en el proyecto local.');

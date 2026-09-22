// Genera README.md a partir de docs/README.template.md, incrustando el schema
// SDL vigente (backend/schema.graphql) para que la documentación nunca diverja.
import { readFileSync, writeFileSync } from 'node:fs';

const template = readFileSync(new URL('../docs/README.template.md', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../backend/schema.graphql', import.meta.url), 'utf8').trimEnd();
writeFileSync(
  new URL('../README.md', import.meta.url),
  `<!-- Generado por scripts/build-readme.mjs a partir de docs/README.template.md. Edita la plantilla. -->\n${template.replace('{{SCHEMA}}', () => schema)}`,
);
console.log('✔ README.md actualizado');

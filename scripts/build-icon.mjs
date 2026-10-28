import { readFile, writeFile } from 'node:fs/promises';
const data = (await readFile(new URL('../assets/icon_00001_.png', import.meta.url))).toString('base64');
await writeFile(new URL('../assets/icon.svg', import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${data}"/></svg>\n`);

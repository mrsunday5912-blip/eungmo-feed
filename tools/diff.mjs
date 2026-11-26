import { eventFields, readCatalog, readPrevious, runCli, validateCatalog } from './validate.mjs';

runCli(() => {
  const args = process.argv.slice(2);
  const json = args[0] === '--changes-json';
  if (json) args.shift();
  if (args.length > 1 || args[0]?.startsWith('-')) {
    throw new Error('사용법: node tools/diff.mjs [--changes-json] [후보.json]');
  }
  const previous = readPrevious()?.catalog;
  const candidate = validateCatalog(readCatalog(args[0]), previous);
  const oldById = new Map(previous?.events.map(event => [event.id, event]));
  const ids = new Set(candidate.events.map(event => event.id));
  const changes = candidate.events.map(event => {
    const former = oldById.get(event.id);
    return { event, fields: eventFields.filter(field => !former || event[field] !== former[field]) };
  });
  const added = changes.filter(({ event }) => !oldById.has(event.id));
  const modified = changes.filter(({ event, fields }) => oldById.has(event.id) && fields.length);
  const removed = [...oldById.values()].filter(event => !ids.has(event.id));

  if (json) {
    console.log(JSON.stringify({ ...candidate, events: [...added, ...modified].map(({ event }) => event) }, null, 2));
    return;
  }
  console.log('신규 ' + added.length + ' · 수정 ' + modified.length + ' · 내림 ' + removed.length);
  for (const { event } of added) console.log('+ ' + event.id + ' · ' + event.title);
  for (const { event, fields } of modified) console.log('~ ' + event.id + ' · ' + event.title + ' · ' + fields.join(', '));
  for (const event of removed) console.log('- ' + event.id + ' · ' + event.title);
  if (JSON.stringify(previous?.officialHosts) !== JSON.stringify(candidate.officialHosts)) {
    console.log('~ officialHosts');
  }
});

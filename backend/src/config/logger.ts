/* Logger minimalista con prefijos por componente; suficiente para evidenciar
 * en la sustentación el flujo comando -> evento -> proyección y los lotes de
 * DataLoader. */
const colors = {
  sql: '\x1b[36m',
  loader: '\x1b[35m',
  command: '\x1b[33m',
  projector: '\x1b[32m',
  saga: '\x1b[34m',
  server: '\x1b[37m',
  error: '\x1b[31m',
} as const;
const reset = '\x1b[0m';

type Channel = keyof typeof colors;

function write(channel: Channel, message: string, extra?: unknown) {
  if (process.env.NODE_ENV === 'test' && channel !== 'error') return;
  const time = new Date().toISOString().slice(11, 23);
  const prefix = `${colors[channel]}[${time}] ${channel.toUpperCase().padEnd(9)}${reset}`;
  if (extra === undefined) console.log(`${prefix} ${message}`);
  else console.log(`${prefix} ${message}`, extra);
}

export const log = {
  sql: (message: string, extra?: unknown) => write('sql', message, extra),
  loader: (message: string, extra?: unknown) => write('loader', message, extra),
  command: (message: string, extra?: unknown) => write('command', message, extra),
  projector: (message: string, extra?: unknown) => write('projector', message, extra),
  saga: (message: string, extra?: unknown) => write('saga', message, extra),
  server: (message: string, extra?: unknown) => write('server', message, extra),
  error: (message: string, extra?: unknown) => write('error', message, extra),
};

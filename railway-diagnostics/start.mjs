import { createServer } from './server.mjs';

const port = Number(process.env.PORT || 3000);
const server = createServer();

server.on('error', error => {
  console.error(JSON.stringify({
    type: 'startup_error',
    service: 'sfp-openfinance-diagnostics',
    message: error?.message || String(error)
  }));
  process.exitCode = 1;
});

server.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({
    type: 'startup',
    service: 'sfp-openfinance-diagnostics',
    port,
    version: '1.1.1'
  }));
});

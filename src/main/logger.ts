import log from 'electron-log/main';

log.transports.console.level = 'info';
log.transports.file.level = 'info';
log.initialize();

export const logger = log;


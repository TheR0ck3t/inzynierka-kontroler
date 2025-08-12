const winston = require('winston');
const path = require('path');

// Definicja niestandardowego formatu logowania
const { createLogger, transports, format } = winston;
const { combine, timestamp, printf } = format;

const logFormat = printf(({ timestamp, level, message, service }) => {
    return `${timestamp} [${level}] ${service ? `[${service}]` : ''}: ${message}`;
});

// Konfiguracja loggera
const logger = createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    defaultMeta: { service: 'kontroler' },
    transports: [
        new transports.File({
            filename: path.join(__dirname, './logs', 'error.log'),
            level: 'error',
        }),
        new transports.File({
            filename: path.join(__dirname, './logs', 'combined.log'),
        }),
    ],
});

// Dodaj transport konsoli tylko w środowisku deweloperskim
if (process.env.NODE_ENV !== 'production') {
    logger.add(new transports.Console({
        format: winston.format.simple(),
    }));
}

module.exports = logger;


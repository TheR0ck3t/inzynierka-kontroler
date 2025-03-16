const winston = require('winston');

// Konfiguracja loggera
const logger = winston.createLogger({
    level: 'info', // Domyślny poziom logowania
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            // Formatowanie logów: [czas] poziom: wiadomość {dodatkowe dane}
            return `[${timestamp}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    ),
    defaultMeta: { service: 'kontroler' },
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});

// Jeśli nie jesteśmy w środowisku produkcyjnym, dodajemy konsolę
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}

module.exports = logger;
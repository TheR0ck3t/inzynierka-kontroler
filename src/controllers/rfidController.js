require('dotenv').config();
const logger = require('../../logger');
const mqttService = require('../services/mqttService');
const SessionManager = require('../services/sessionManager');
const rfidHandler = require('../handlers/rfidHandler');

// Inicjalizacja serwisów
const sessionManager = new SessionManager();
rfidHandler.init(mqttService, sessionManager);

// Rejestracja handlerów dla różnych tematów MQTT
mqttService.registerHandler('rfid/command', (data) => {
    rfidHandler.handleCommand(data); // Obsługa komend, np. start_enrollment
});
mqttService.registerHandler('rfid/scan', (data) => {
    rfidHandler.handleRfidScan(data); // Obsługa skanów RFID
});
mqttService.registerHandler('rfid/secret_update', (data) => {
    rfidHandler.handleSecretUpdate(data); // Obsługa aktualizacji sekretów (potwierdzenia rotacji)
});
mqttService.registerHandler('rfid/status', (data) => {
    rfidHandler.handleStatus(data); // Obsługa statusów czytników (opcjonalnie, 
                                    // jeśli czytniki wysyłają takie informacje)
});

logger.info('Kontroler RFID został zainicjalizowany pomyślnie');

function getSystemStatus() {
    return {
        activeSessions: sessionManager.getAllActiveSessions(),
        mqttConnected: mqttService.client.connected,
        timestamp: new Date().toISOString()
    };
}

function shutdown() {
    logger.info('Zamykanie kontrolera RFID...');
        if (sessionManager.cleanupSessions) sessionManager.cleanupSessions();
        if (mqttService.disconnect) mqttService.disconnect();
    }

function setupGracefulShutdown() {
        process.on('SIGINT', () => {
            logger.info('Otrzymano sygnał SIGINT, zamykanie aplikacji...');
            shutdown();
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            logger.info('Otrzymano sygnał SIGTERM, zamykanie aplikacji...');
            shutdown();
            process.exit(0);
        });
    }

    module.exports = {
        getSystemStatus,
        shutdown,
        setupGracefulShutdown,
        sessionManager,
        rfidHandler,
        mqttService
    };

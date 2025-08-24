const logger = require('../../logger');

class SessionManager {
    constructor() {
        this.activeSessions = new Map();
    }

    startEnrollment(reader, sessionId) {
        logger.info(`Rozpoczynanie enrollment dla czytnika: ${reader}, sessionId: ${sessionId}`);
        this.activeSessions.set(reader, sessionId);
    }

    getSession(reader) {
        return this.activeSessions.get(reader);
    }

    endSession(reader) {
        const sessionId = this.activeSessions.get(reader);
        if (sessionId) {
            this.activeSessions.delete(reader);
            logger.info(`Zakończono sesję enrollment dla czytnika: ${reader}`);
        }
        return sessionId;
    }

    hasActiveSession(reader) {
        return this.activeSessions.has(reader);
    }

    getAllActiveSessions() {
        return Array.from(this.activeSessions.entries());
    }

    clearAllSessions() {
        this.activeSessions.clear();
        logger.info('Wyczyszczono wszystkie aktywne sesje enrollment');
    }
}

module.exports = SessionManager;

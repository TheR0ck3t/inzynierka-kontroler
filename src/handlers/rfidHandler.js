const axios = require('axios');
const logger = require('../../logger');
const readerRegistry = require('../services/readerRegistry');

let mqttService = null;
let sessionManager = null;
const apiBaseUrl = process.env.API_BASE_URL;
let deniedTags = [];

// Wysyłaj registry co 30 sekund
setInterval(() => {
    if (mqttService) {
        const readers = readerRegistry.getAllReaders();
        mqttService.publish('readers/list', { 
            readers: readers  // getAllReaders() już zwraca tablicę
        });
    }
}, 30000);

// Sprawdzaj statusy czytników co minutę i wysyłaj powiadomienia o zmianach
setInterval(() => {
    if (mqttService) {
        const statusChanges = readerRegistry.checkReadersStatus();
        
        // Jeśli są zmiany statusu, wyślij powiadomienie
        if (statusChanges.length > 0) {
            logger.info(`Wykryto ${statusChanges.length} zmian statusu czytników`);
            mqttService.publish('readers/status_changed', {
                changes: statusChanges,
                timestamp: new Date().toISOString()
            });
            
            // Również wyślij zaktualizowaną listę
            const readers = readerRegistry.getAllReaders();
            mqttService.publish('readers/list', { 
                readers: readers
            });
        }
    }
}, 60000); // Co 60 sekund

function init(_mqttService, _sessionManager) {
    mqttService = _mqttService;
    sessionManager = _sessionManager;
    logger.info('ReaderRegistry initialized');
}

function handleRfidScan(data) {
    const { uid, reader_name, device_id, mode, secret, secretWritten } = data;
    
    // Rejestruj czytnik w registry
    if (device_id) {
        readerRegistry.registerReader(data);
    }
    
    logger.info(`Odczytano tag ${uid} z czytnika ${reader_name} (${device_id}), tryb: ${mode || 'access'}, hasSecret: ${!!secret}, secretWritten: ${!!secretWritten}`);
    if (mode === 'enrollment') {
        handleEnrollmentScan(uid, reader_name, { secret, secretWritten });
    } else {
        handleAccessScan(uid, reader_name, secret);
    }
}

async function handleSecretUpdate(data) {
    const { uid, reader_name, newSecret, action } = data;
    logger.info(`Secret update request for ${uid}: ${newSecret}`);
    if (action === 'update_secret' && newSecret) {
        try {
            const response = await axios.put(`${apiBaseUrl}/tags/secret-update/${uid}`, {
                newSecret: newSecret
            }, {
                headers: {
                    'x-controller-request': 'true',
                    'x-mqtt-api-key': process.env.CONTROLLER_API_KEY
                }
            });
            if (response.status === 200) {
                logger.info(`Secret updated successfully for tag ${uid}`);
                mqttService.publish('rfid/secret_updated', {
                    uid: uid,
                    reader_name: reader_name,
                    success: true,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            logger.error(`Failed to update secret for tag ${uid}: ${error.message}`);
            mqttService.publish('rfid/secret_updated', {
                uid: uid,
                reader_name: reader_name,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

function handleCommand(data) {
    if (data.action === 'start_enrollment') {
        sessionManager.startEnrollment(data.reader_name, data.sessionId);
    }
}

function handleEnrollmentScan(uid, reader_name, data = {}) {
    logger.info(`Enrollment scan: ${uid} na czytnika ${reader_name}`);
    const sessionId = sessionManager.getSession(reader_name);
    const { secretWritten = false, secret = null } = data;
    if (!secretWritten || !secret) {
        logger.warn(`ESP32 failed to write secret for card ${uid}, enrollment may not be secure`);
    } else {
        logger.info(`Using secret from ESP32 for card ${uid}: ${secret}`);
    }
    mqttService.publish('rfid/enrolled', {
        reader_name: reader_name,
        tagId: uid,
        sessionId: sessionId,
        newSecret: secret,
        secretWritten: secretWritten,
        success: true,
        timestamp: new Date().toISOString()
    });
    sessionManager.endSession(reader_name);
}

async function handleAccessScan(uid, reader_name, secret = null) {
    logger.info(`Access scan: ${uid} na czytnika ${reader_name}, hasSecret: ${!!secret}`);
    const response = await checkAccess(uid, reader_name, secret);
    mqttService.publish('rfid/access', {
        response: response,
        uid: uid,
        reader_name: reader_name,
        timestamp: new Date().toISOString()
    });
    logger.info(`Wysłano odpowiedź dostępu dla ${uid}: ${response}`);
}

async function checkAccess(uid, reader_name, secret = null) {
    if (deniedTags.includes(uid)) {
        logger.info(`Tag ${uid} znajduje się na liście odmowy dostępu`);
        return "DENIED";
    }
    try {
        let url = `${apiBaseUrl}/tags/check-access/${uid}`;
        if (secret) {
            url += `?secret=${encodeURIComponent(secret)}`;
        }
        const response = await axios.get(url, {
            headers: {
                'content-type': 'application/json',
                'x-controller-request': 'true',
                'x-mqtt-api-key': process.env.CONTROLLER_API_KEY,
                reader_name: reader_name,
                secret: encodeURIComponent(secret)
            }
        });
        if (response.data && response.data.response === "ALLOW") {
            logger.info(`Tag ${uid} ma dostęp (sprawdzono przez API)`);
            return "ALLOW";
        } else {
            logger.info(`Tag ${uid} nie ma dostępu (sprawdzono przez API)`);
            return "DENIED";
        }
    } catch (error) {
        logger.error(`Błąd podczas sprawdzania dostępu dla tagu ${uid}: ${error.message}`);
        return "DENIED";
    }
}

function addDeniedTag(uid) {
    if (!deniedTags.includes(uid)) {
        deniedTags.push(uid);
        logger.info(`Dodano tag ${uid} do listy odmowy dostępu`);
    } else {
        logger.info(`Tag ${uid} już znajduje się na liście odmowy dostępu`);
    }
}

function removeDeniedTag(uid) {
    const index = deniedTags.indexOf(uid);
    if (index > -1) {
        deniedTags.splice(index, 1);
        logger.info(`Usunięto tag ${uid} z listy odmowy dostępu`);
    } else {
        logger.info(`Tag ${uid} nie znajdował się na liście odmowy dostępu`);
    }
}

function getDeniedTags() {
    return [...deniedTags];
}

function hasActiveEnrollmentSession(reader_name) {
    return sessionManager.getSession(reader_name) !== null;
}

function getStatus() {
    return {
        deniedTagsCount: deniedTags.length,
        apiBaseUrl: apiBaseUrl,
        timestamp: new Date().toISOString()
    };
}

function handleStatus(data) {
    logger.info(`Otrzymano rfid/status: ${JSON.stringify(data)}`);
    
    const { device_id, reader_name, firmware_version, status, ip } = data;
    
    if (!device_id) {
        logger.warn('Brak device_id w statusie czytnika');
        return;
    }
    
    logger.info(`Status czytnika: ${reader_name} (${device_id}) - ${status}, FW: ${firmware_version}, IP: ${ip}`);
    
    // Rejestruj czytnik w registry
    readerRegistry.registerReader({
        device_id,
        reader_name,
        firmware_version,
        ip,
        status
    });
    
    logger.info(`Czytnik zarejestrowany, aktualnie w registry: ${readerRegistry.getAllReaders().length} czytników`);
}

module.exports = {
    init,
    handleRfidScan,
    handleSecretUpdate,
    handleCommand,
    handleStatus,
    handleEnrollmentScan,
    handleAccessScan,
    checkAccess,
    addDeniedTag,
    removeDeniedTag,
    getDeniedTags,
    hasActiveEnrollmentSession,
    getStatus,
    getReaderRegistry: () => readerRegistry
};

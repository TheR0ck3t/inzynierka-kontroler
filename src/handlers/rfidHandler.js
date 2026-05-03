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
    const { uid, reader_name, device_id, mode, current_secret, new_secret } = data;
    
    // Rejestruj czytnik w registry
    if (device_id) {
        readerRegistry.registerReader(data);
    }
    
    logger.info(`Odczytano tag ${uid} z czytnika ${reader_name} (${device_id}), tryb: ${mode || 'access'}, hasCurrentSecret: ${!!current_secret}, hasNewSecret: ${!!new_secret}`);
    if (mode === 'enrollment') {
        handleEnrollmentScan(uid, reader_name, { current_secret, new_secret });
    } else {
        handleAccessScan(uid, reader_name, current_secret, new_secret);
    }
}

async function handleSecretUpdate(data) {
    const { uid, reader_name, action = null, success, error = null } = data;

    if ((action === null || action === 'update_secret') && success === true) {
        try {

                logger.info(`Secret updated successfully for tag ${uid}`);
                mqttService.publish('rfid/secret_updated', {
                    uid: uid,
                    reader_name: reader_name,
                    success: true,
                    timestamp: new Date().toISOString()
                });
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
    else {
        logger.warn(`Secret update failed for tag ${uid} on reader ${reader_name}: ${error}`);
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
        logger.info(`Using secret from ESP32 for card ${uid} (secret present: true)`);
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

async function handleAccessScan(uid, reader_name, current_secret = null, new_secret = null) {
    logger.info(`Access scan: ${uid} na czytnika ${reader_name}, hasSecret: ${!!current_secret}`);
    const apiResp = await checkAccess(uid, reader_name, current_secret, new_secret);
    const respStr = apiResp && apiResp.response ? apiResp.response : 'DENIED';
    const payload = {
        response: respStr,
        uid: uid,
        reader_name: reader_name,
        timestamp: new Date().toISOString()
    };
    // Forward secret to device if backend provided one
    if (apiResp && apiResp.secret) payload.secret = apiResp.secret;

    mqttService.publish('rfid/access', payload);
    logger.info(`Wysłano odpowiedź dostępu dla ${uid}: ${JSON.stringify(payload)}`);
}

async function checkAccess(uid, reader_name, current_secret = null, new_secret = null) {
    if (deniedTags.includes(uid)) {
        logger.info(`Tag ${uid} znajduje się na liście odmowy dostępu`);
        return "DENIED";
    }
    try {
        let url = `${apiBaseUrl}/tags/check-access/${uid}`;
        const response = await axios.get(url, {
            headers: {
                'content-type': 'application/json',
                'x-controller-request': 'true',
                'x-mqtt-api-key': process.env.CONTROLLER_API_KEY,
                reader_name: reader_name,
                current_secret: encodeURIComponent(current_secret),
                new_secret: encodeURIComponent(new_secret)
            }
        });
        if (response.data) {
            logger.info(`Tag ${uid} sprawdzony przez API: ${JSON.stringify(response.data)}`);
            return response.data;
        } else {
            logger.info(`Tag ${uid} - brak danych z API`);
            return { response: 'DENIED' };
        }
    } catch (error) {
        logger.error(`Błąd podczas sprawdzania dostępu dla tagu ${uid}: ${error.message}`);
        return { response: 'DENIED' };
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

    // Rejestruj czytnik w registry
    readerRegistry.registerReader({
        device_id,
        reader_name,
        firmware_version,
        ip,
        status
    });
    
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

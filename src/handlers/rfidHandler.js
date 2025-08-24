const axios = require('axios');
const logger = require('../../logger');

let mqttService = null;
let sessionManager = null;
const apiBaseUrl = process.env.API_BASE_URL;
let deniedTags = [];

function init(_mqttService, _sessionManager) {
    mqttService = _mqttService;
    sessionManager = _sessionManager;
}

function handleRfidScan(data) {
    const { uid, reader, mode, secret, secretWritten } = data;
    logger.info(`Odczytano tag ${uid} z czytnika ${reader}, tryb: ${mode || 'access'}, hasSecret: ${!!secret}, secretWritten: ${!!secretWritten}`);
    if (mode === 'enrollment') {
        handleEnrollmentScan(uid, reader, { secret, secretWritten });
    } else {
        handleAccessScan(uid, reader, secret);
    }
}

async function handleSecretUpdate(data) {
    const { uid, reader, newSecret, action } = data;
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
                    reader: reader,
                    success: true,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            logger.error(`Failed to update secret for tag ${uid}: ${error.message}`);
            mqttService.publish('rfid/secret_updated', {
                uid: uid,
                reader: reader,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

function handleCommand(data) {
    if (data.action === 'start_enrollment') {
        sessionManager.startEnrollment(data.reader, data.sessionId);
    }
}

function handleEnrollmentScan(uid, reader, data = {}) {
    logger.info(`Enrollment scan: ${uid} na czytnika ${reader}`);
    const sessionId = sessionManager.getSession(reader);
    const { secretWritten = false, secret = null } = data;
    if (!secretWritten || !secret) {
        logger.warn(`ESP32 failed to write secret for card ${uid}, enrollment may not be secure`);
    } else {
        logger.info(`Using secret from ESP32 for card ${uid}: ${secret}`);
    }
    mqttService.publish('rfid/enrolled', {
        reader: reader,
        tagId: uid,
        sessionId: sessionId,
        newSecret: secret,
        secretWritten: secretWritten,
        success: true,
        timestamp: new Date().toISOString()
    });
    sessionManager.endSession(reader);
}

async function handleAccessScan(uid, reader, secret = null) {
    logger.info(`Access scan: ${uid} na czytnika ${reader}, hasSecret: ${!!secret}`);
    const response = await checkAccess(uid, reader, secret);
    mqttService.publish('rfid/access', {
        response: response,
        uid: uid,
        reader: reader,
        timestamp: new Date().toISOString()
    });
    logger.info(`Wysłano odpowiedź dostępu dla ${uid}: ${response}`);
}

async function checkAccess(uid, reader, secret = null) {
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
                reader: reader,
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

function hasActiveEnrollmentSession(reader) {
    return sessionManager.getSession(reader) !== null;
}

function getStatus() {
    return {
        deniedTagsCount: deniedTags.length,
        apiBaseUrl: apiBaseUrl,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    init,
    handleRfidScan,
    handleSecretUpdate,
    handleCommand,
    handleEnrollmentScan,
    handleAccessScan,
    checkAccess,
    addDeniedTag,
    removeDeniedTag,
    getDeniedTags,
    hasActiveEnrollmentSession,
    getStatus
};

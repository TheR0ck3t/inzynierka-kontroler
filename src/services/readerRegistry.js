const logger = require('../../logger');

/**
 * Registry czytników RFID
 * Śledzi aktywne czytniki, ich statusy i ostatnią aktywność
 * Czytniki są oznaczane jako offline jeśli nie odzywają się przez określony czas
 */

const readers = new Map(); // device_id => reader info

// Timeout dla uznania czytnika za offline (2 minuty)
const READER_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Rejestruj lub zaktualizuj czytnik
 */
function registerReader(data) {
    const { device_id, reader_name, uid, firmware_version, ip, status } = data;
    
    if (!device_id) {
        logger.warn('Brak device_id w danych czytnika');
        return;
    }

    const now = Date.now();
    const existing = readers.get(device_id);

    if (existing) {
        // Aktualizuj istniejący
        existing.reader_name = reader_name || existing.reader_name;
        existing.last_seen = now;
        
        if (uid) {
            existing.last_activity = {
                type: data.mode || 'scan',
                uid: uid,
                timestamp: now
            };
            existing.scan_count = (existing.scan_count || 0) + 1;
        }
        
        existing.status = 'active';
        
        if (firmware_version) {
            existing.firmware_version = firmware_version;
        }
        if (ip) {
            existing.ip = ip;
        }
    } else {
        // Dodaj nowy
        readers.set(device_id, {
            device_id,
            reader_name: reader_name || 'unknown',
            first_seen: now,
            last_seen: now,
            last_activity: uid ? {
                type: data.mode || 'scan',
                uid: uid,
                timestamp: now
            } : null,
            scan_count: uid ? 1 : 0,
            status: 'active',
            firmware_version: firmware_version || 'unknown',
            ip: ip || 'unknown'
        });
        
        logger.info(`Nowy czytnik zarejestrowany: ${device_id} (${reader_name})`);
    }
}

/**
 * Pobierz wszystkie czytniki
 */
function getAllReaders() {
    const readersList = [];
    const now = Date.now();
    
    for (const [device_id, info] of readers.entries()) {
        const timeSinceLastSeen = now - info.last_seen;
        const isOnline = timeSinceLastSeen < READER_TIMEOUT_MS;
        
        readersList.push({
            ...info,
            status: isOnline ? 'online' : 'offline',
            last_seen_minutes_ago: Math.floor(timeSinceLastSeen / 60000)
        });
    }
    
    return readersList.sort((a, b) => b.last_seen - a.last_seen);
}

/**
 * Pobierz czytnik po device_id
 */
function getReader(device_id) {
    return readers.get(device_id) || null;
}

/**
 * Usuń czytnik
 */
function removeReader(device_id) {
    if (readers.delete(device_id)) {
        logger.info(`Czytnik usunięty: ${device_id}`);
        return true;
    }
    return false;
}

/**
 * Zaktualizuj nazwę czytnika
 */
function updateReaderName(device_id, new_name) {
    const reader = readers.get(device_id);
    if (reader) {
        reader.reader_name = new_name;
        return true;
    }
    return false;
}

/**
 * Sprawdź statusy czytników i zwróć listę zmian
 * Używane do wykrywania, które czytniki zmieniły status
 */
function checkReadersStatus() {
    const now = Date.now();
    const statusChanges = [];
    
    for (const [device_id, info] of readers.entries()) {
        const timeSinceLastSeen = now - info.last_seen;
        const isOnline = timeSinceLastSeen < READER_TIMEOUT_MS;
        const newStatus = isOnline ? 'online' : 'offline';
        const oldStatus = info.status || 'online';
        
        // Zapisz nowy status
        info.status = newStatus;
        
        // Jeśli status się zmienił, dodaj do listy zmian
        if (oldStatus !== newStatus) {
            logger.warn(`Zmiana statusu czytnika ${device_id} (${info.reader_name}): ${oldStatus} -> ${newStatus}`);
            statusChanges.push({
                device_id,
                reader_name: info.reader_name,
                old_status: oldStatus,
                new_status: newStatus,
                last_seen: info.last_seen,
                last_seen_minutes_ago: Math.floor(timeSinceLastSeen / 60000)
            });
        }
    }
    
    return statusChanges;
}

/**
 * Statystyki
 */
function getStats() {
    const readersList = getAllReaders();
    const onlineCount = readersList.filter(r => r.status === 'online').length;
    return {
        total: readersList.length,
        online: onlineCount,
        offline: readersList.length - onlineCount
    };
}

module.exports = {
    registerReader,
    getAllReaders,
    getReader,
    removeReader,
    updateReaderName,
    getStats,
    checkReadersStatus,
    READER_TIMEOUT_MS
};

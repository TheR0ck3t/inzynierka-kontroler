require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger'); // Przyjmujemy, że masz skonfigurowany logger
const mqtt = require('mqtt');

// Przechowywanie aktywnych sesji enrollment
const activeSessions = new Map();

const client = mqtt.connect(process.env.MQTT_BROKER_URL);

client.on('connect', () => {
    logger.info('Połączono z brokerem MQTT');
    client.subscribe('rfid/add', (err) => {
        if (err) {
            logger.error(`Błąd subskrypcji rfid/add: ${err.message}`);
        } else {
            logger.info('Subskrybowano temat: rfid/add');
        }
    });
    
    // Subskrybuj komendy z backendu
    client.subscribe('rfid/command', (err) => {
        if (err) {
            logger.error(`Błąd subskrypcji rfid/command: ${err.message}`);
        } else {
            logger.info('Subskrybowano temat: rfid/command');
        }
    });
    
    // Subskrybuj scany z ESP32
    client.subscribe('rfid/scan', (err) => {
        if (err) {
            logger.error(`Błąd subskrypcji rfid/scan: ${err.message}`);
        } else {
            logger.info('Subskrybowano temat: rfid/scan');
        }
    });
});

client.on('message', async (topic, message) => {
    const messageStr = message.toString();
    logger.info(`Otrzymano wiadomość MQTT na ${topic}: ${messageStr}`);
    
    if (topic === 'rfid/scan') {
        const data = JSON.parse(messageStr);
        
        // ESP32 używa millis() więc nie możemy porównywać z Date.now()
        // Usuńmy filtr czasowy - będziemy polegać na logice sesji w backend
        logger.info(`Przetwarzanie rfid/scan: ${JSON.stringify(data)}`);
        
        handleRFIDScan(data);
    }
    
    if (topic === 'rfid/add') {
        const data = JSON.parse(messageStr);
        const { uid } = data;
        
        // Usuńmy filtr czasowy - problem z porównywaniem millis() vs Date.now()
        logger.info(`Przetwarzanie rfid/add: ${JSON.stringify(data)}`);
        
        try {
            await axios.post(`${process.env.API_BASE_URL}/api/tags/add`, { tag: uid });
            logger.info(`Tag ${uid} dodany pomyślnie`);
            client.publish('rfid/response/add', JSON.stringify({
                response: "TAG_ADDED",
                uid: `${uid}`,
                timestamp: new Date().toISOString()
            }), (err) => {
                if (err) {
                    logger.error(`Błąd publikacji odpowiedzi: ${err.message}`);
                }
            });
        } catch (error) {
            if (error.response?.status === 400 && error.response?.data?.message === 'Tag already exists') {
                logger.info(`Tag ${uid} już istnieje w bazie danych`);
                client.publish('rfid/response/add', JSON.stringify({
                    response: "TAG_EXISTS",
                    uid: uid,
                    message: "Tag już istnieje",
                    timestamp: new Date().toISOString()
                }));
            } else {
                logger.error(`Błąd podczas dodawania tagu ${uid}: ${error.response?.status || 'Unknown'} - ${error.response?.data?.message || error.message}`);
            }
        }
    }
    
    if (topic === 'rfid/command') {
        const data = JSON.parse(messageStr);
        
        if (data.action === 'start_enrollment') {
            logger.info(`Rozpoczynanie enrollment dla czytnika: ${data.reader}, sessionId: ${data.sessionId}`);
            // Zapisz sessionId dla tego czytnika
            activeSessions.set(data.reader, data.sessionId);
            // Tutaj można dodać logikę przełączania ESP32 w tryb enrollment
        }
    }
});

function handleRFIDScan(data) {
    const { uid, reader, mode } = data;
    
    logger.info(`Odczytano tag ${uid} z czytnika ${reader}, tryb: ${mode || 'access'}`);
    
    if (mode === 'enrollment') {
        // Tag został zeskanowany w trybie enrollment - wyślij do API żeby zapisać
        logger.info(`Enrollment scan: ${uid} na czytnika ${reader}`);
        
        // Pobierz sessionId dla tego czytnika
        const sessionId = activeSessions.get(reader);
        
        client.publish('rfid/enrolled', JSON.stringify({
            reader: reader,
            tagId: uid,
            sessionId: sessionId,
            timestamp: new Date().toISOString()
        }), (err) => {
            if (err) {
                logger.error(`Błąd publikacji rfid/enrolled: ${err.message}`);
            } else {
                logger.info(`Wysłano rfid/enrolled dla ${uid}`);
                // Usuń sesję po użyciu
                activeSessions.delete(reader);
            }
        });
    } else {
        // Normalny skan dostępu - sprawdź w bazie i odpowiedz
        logger.info(`Access scan: ${uid} na czytnika ${reader}`);
        
        // Tutaj możesz dodać sprawdzenie w bazie danych czy karta ma dostęp
        // Na razie zakładamy że wszystkie karty mają dostęp
        client.publish('rfid/access', JSON.stringify({
            response: "ALLOW",
            uid: uid,
            reader: reader,
            timestamp: new Date().toISOString()
        }), (err) => {
            if (err) {
                logger.error(`Błąd publikacji rfid/access: ${err.message}`);
            } else {
                logger.info(`Wysłano odpowiedź dostępu dla ${uid}: ALLOW`);
            }
        });
    }
}

console.log('Kontroler uruchomiony i nasłuchuje na czytniki RFID...');

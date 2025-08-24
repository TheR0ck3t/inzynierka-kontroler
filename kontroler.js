require('dotenv').config();
const logger = require('./logger');
const controller = require('./src/controllers/rfidController');



// Konfiguracja graceful shutdown
controller.setupGracefulShutdown();

console.log('Kontroler uruchomiony i nasłuchuje na czytniki RFID...');

// Eksportuj kontroler dla testów lub zewnętrznych modułów
module.exports = controller;

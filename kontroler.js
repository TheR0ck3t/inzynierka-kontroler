require('dotenv').config();
const fs = require('fs');
const path = require('path');
const RC522 = require('rc522-rfid');
const axios = require('axios');
const logger = require('./logger'); // Przyjmujemy, że masz skonfigurowany logger

// // Funkcja do rekurencyjnego ładowania plików z folderu
// const loadServices = (dirPath) => {
//     fs.readdirSync(dirPath).forEach(file => {
//         const fullPath = path.join(dirPath, file);
//         if (fs.statSync(fullPath).isDirectory()) {
//             loadServices(fullPath); // Rekurencja dla folderów
//         } else {
//             const service = require(fullPath);
//             if (service && service.initialize) {
//                 service.initialize(); // Uruchamiamy odpowiednią funkcję z pliku serwisowego
//                 console.log(`Service loaded and initialized from: ${fullPath}`);
//                 logger.info(`Service loaded and initialized from: ${fullPath}`);
//             }
//         }
//     });
// };

// // Ładowanie i inicjalizacja usług
// const servicesPath = path.join(__dirname, './src/services'); // Ścieżka do folderu serwisów
// loadServices(servicesPath);

// // Adres API do przesyłania danych
// const apiUrl = process.env.API_URL;

// // Inicjalizacja czytnika RFID
// const rfid = new RC522();

// // Obsługa zdarzeń odczytu RFID
// rfid.on('data', async(rfidData) => {
//     const cardId = rfidData.uid; // UID karty RFID
//     console.log(`Odczytano kartę RFID: ${cardId}`);
//     logger.info(`Odczytano kartę RFID: ${cardId}`);

//     // Wysyłanie danych do API
//     try {
//         const response = await axios.post(apiUrl, { rfid: cardId });
//         console.log(`Dane przesłane do API: ${response.status}`);
//         logger.info(`Dane przesłane do API: ${response.status}`);
//     } catch (error) {
//         console.error('Błąd podczas wysyłania danych do API:', error.message);
//         logger.error('Błąd podczas wysyłania danych do API:', error.message);
//     }
// });

// // Obsługa błędów czytnika RFID
// rfid.on('error', (err) => {
//     console.error('Błąd czytnika RFID:', err);
//     logger.error('Błąd czytnika RFID:', err);
// });

console.log('Kontroler uruchomiony i nasłuchuje na czytniki RFID...');